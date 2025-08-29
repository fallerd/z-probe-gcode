// connects via lan to altmill, sends gcode to do z probing over a grid area per config below

const net = require('net');
const fs = require('fs');

// === CONFIGURATION ===
const host = '192.168.5.1';
const port = 23;

const xStart = 0;
const yStart = 0;
const xEnd = 100;
const yEnd = 60;
const xStep = 10;
const yStep = 10;
const zProbeDepth = -20;
const zRetract = 15;
const feed = 1000;

let socket = new net.Socket();
let csv = 'X,Y,Z\n';
let commandQueue = [];
let currentCommand = '';
let firstStartupReceived = false;
let secondStartupReceived = false;
let unlocked = false;
let softResetSent = false;
let initializing = true;

function generateCommands() {
    let commands = [
        'G92 X0 Y0',     // Set current position as new origin // todo decide what to do about this
        'G21',
        'G90',
        `G0 Z${zRetract}`
    ];

    for (let y = yStart; y <= yEnd; y += yStep) {
        for (let x = xStart; x <= xEnd; x += xStep) {
            commands.push(`G0 X${x} Y${y}`);
            commands.push(`G38.2 Z${zProbeDepth} F${feed}`);
            commands.push(`G92 Z0`);
            commands.push(`G0 Z${zRetract}`);
        }
    }

    return commands;
}

function sendNextCommand() {
    if (commandQueue.length === 0) {
        console.log('✅ Probing complete. Disconnecting...');
        socket.destroy();
        return;
    }

    currentCommand = commandQueue.shift();
    console.log(`>> ${currentCommand}`);
    socket.write(currentCommand + '\n');
}

function initialize(line) {
    // Step 1: Wait for the GRBL startup message
    if (!firstStartupReceived && line.includes('GrblHAL')) {
        firstStartupReceived = true;
        console.log('🎉 GRBLHAL banner received.');

        // Step 2: Send soft reset after GRBL is ready
        if (!softResetSent) {
            console.log('♻️ Sending soft reset...');
            socket.write('\x18'); // Send soft reset
            softResetSent = true;
            return; // Wait for GRBL to reboot and resend banner
        }
        return;
    }

    //step 3:  unlock after manual reset after estop is cleared
    if (firstStartupReceived && softResetSent && !secondStartupReceived && line.includes('GrblHAL')) {
        secondStartupReceived = true;
        console.log('🎉 GRBLHAL Ready. Sending unlock...');
        socket.write('$X\n'); // 3. Send $X to unlock
        return;
    }
            
    if (secondStartupReceived && !unlocked && line === 'ok') {
        unlocked = true;
        initializing = false;
        console.log('🔓 Unlocked. Starting probe sequence...');
        commandQueue = generateCommands(); // 4. Begin probing
        setTimeout(sendNextCommand, 100);
        return;
    }
}

// === Connect and run ===
socket.connect(port, host, () => {
    console.log(`🌐 Connected to GRBL-HAL at ${host}:${port}`);
});

socket.on('data', (data) => {
    const lines = data.toString().split('\n').map(l => l.trim()).filter(Boolean);

    for (let line of lines) {
        console.log(`<< ${line}`);
        
        if (initializing) {
            initialize(line)
            return;
        } else if (!unlocked) continue;

        if (line.startsWith('[PRB:')) {
            let match = line.match(/\[PRB:([\d\.\-]+),([\d\.\-]+),([\d\.\-]+),([\d\.\-]+):1\]/);
            if (match) {
                let [, x, y, z, a] = match;
                console.log(`    Captured probe: X=${x}, Y=${y}, Z=${z}`);
                csv += `${x},${y},${z}\n`;
            }
            continue;
        }

        if (line === 'ok' || line.startsWith('error')) {
            setTimeout(sendNextCommand, 50);
        }
    }
});

socket.on('error', (err) => {
    console.error(`❌ Socket error: ${err.message}`);
});

socket.on('close', () => {
    console.log('🔌 Connection closed');
    console.log('Saving CSV...');
    fs.writeFileSync('heightmap.csv', csv);
});

