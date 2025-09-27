// connects via lan to altmill, sends gcode to do z probing over a grid area per config below
// turn on spindle, altmill, clear e stop, run.
// can manually get onto machine with 'telnet 192.168.5.1 23' and then get settings etc with "$$" and "?", or manually send gcode commands for testing

const net = require('net');
const fs = require('fs');

// === CONFIGURATION ===
const host = '192.168.5.1';
const port = 23;

const xStart = 3;
const yStart = 5;
const xEnd = 204;
const yEnd = 790;
const xStep = 19;
const yStep = xStep;
const zProbeDepth = -8; // negative
const zRetract = 15;
const feed = 5000; // mm/min
const retractFeed = 15000; // xy rapid speed specified (z capped at 6000)
const missedProbeHeight = -100;

let socket = new net.Socket();
let csv = 'X,Y,Z\n';
let commandQueue = [];
let currentCommand = '';
let firstStartupReceived = false;
let secondStartupReceived = false;
let unlocked = false;
let softResetSent = false;
let initializing = true;
let alarmState = false;

function generateCommands() {
    let commands = [
        'G92 X0 Y0 Z0',        // Set current position as origin
        'G21',                 // Set units to mm
        'G90',                 // Absolute positioning
        `G0 Z${zRetract}`,      // Retract to safe Z height
        'G18' // set xz plane for hops
    ];

    let yValues = [];
    for (let y = yStart; y <= yEnd; y += yStep) {
        yValues.push(y);
    }

    let xValues = [];
    for (let x = xStart; x <= xEnd; x += xStep) {
        xValues.push(x);
    }

    // Start at first probe point
    commands.push(`G0 X${xValues[0]} Y${yValues[0]}`);

    for (let row = 0; row < yValues.length; row++) {
        let y = yValues[row];

        // Determine X traversal direction for snake path
        let rowXValues = (row % 2 === 0) ? xValues : [...xValues].reverse();

        for (let col = 0; col < rowXValues.length; col++) {
            let x = rowXValues[col];

            // Probe at current point
            commands.push(`G38.2 Z${zProbeDepth} F${feed}`);
            commands.push(`G4 P0.05`); // dwell 50 ms to allow machine to settle

            let isLastPoint = (row === yValues.length - 1) && (col === rowXValues.length - 1);
            if (!isLastPoint) {
                commands.push(`G0 Z${zRetract}`);
            }

            if (!isLastPoint) {
                let nextX, nextY;

                if (col < rowXValues.length - 1) {
                    // Next point in same row
                    nextX = rowXValues[col + 1];
                    nextY = y;

                    let dx = nextX - x;
                    let r = Math.abs(dx / 2);

                    // Determine arc direction based on motion
                    let arcDir = (dx > 0) ? 'G3' : 'G2';
                    commands.push(`${arcDir} X${nextX} Z${zRetract} R${r} F${retractFeed}`);

                } else {
                    // Move to start of next row
                    nextY = yValues[row + 1];
                    nextX = ((row + 1) % 2 === 0) ? xValues[0] : xValues[xValues.length - 1];

                    let dy = nextY - y;
                    let r = Math.abs(dy / 2);

                    commands.push('G19');  // YZ plane

                    // Always bulge up → use G2
                    commands.push(`G2 Y${nextY} Z${zRetract} R${r} F${retractFeed}`); /////////////todo somehow machine thinks this is bad code.

                    commands.push('G18');  // Back to XY
                }
            }
        }
    }

    // Final retract
    commands.push(`G0 Z${zRetract}`);

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
            
    if (secondStartupReceived && !unlocked && (line === 'ok' || line === '[MSG:Caution: Unlocked]')) {
        unlocked = true;
        initializing = false;
        console.log('🔓 Unlocked. Starting probe sequence...');
        commandQueue = generateCommands(); // 4. Begin probing

        setTimeout(sendNextCommand, 25);
        return;
    }
}

// === Connect and run ===
socket.connect(port, host, () => {
    console.log(`🌐 Connected to GRBL-HAL at ${host}:${port}`);
});

// Debug commands - comment connection above, uncomment this
// commandQueue = generateCommands();
// for (let i=0; i<40;i++) {
//     console.log(commandQueue[i])
// }

socket.on('data', (data) => {
    const lines = data.toString().split('\n').map(l => l.trim()).filter(Boolean);

    for (let line of lines) {
        console.log(`<< ${line}`);
        
        if (initializing) {
            initialize(line)
            return;
        } else if (!unlocked) continue;

        if (line.startsWith('[MSG:Caution: Unlocked]')) {
            alarmState = false;
        }

        if (line.startsWith('[PRB:')) {
            let match = line.match(/\[PRB:([\d\.\-]+),([\d\.\-]+),([\d\.\-]+),([\d\.\-]+):([01])\]/);
            if (match) {
                let [, x, y, z, a, flag] = match;
                if (flag === '0') {
                    // Probe failed
                    z = missedProbeHeight;
                    console.log(`    ❌ Missed probe at X=${x}, Y=${y}`);
                } else {
                    // Probe successful — set Z = 0
                    commandQueue.unshift('G92 Z0');
                    console.log(`    ✅ Successful probe, height reset`);
                }
                console.log(`    Captured probe: X=${x}, Y=${y}, Z=${z}`);
                csv += `${x},${y},${z}\n`;
            } else {
                console.log("probe line not recorded, didn't match regex")
            }
            continue;
        }

        if (line.startsWith('ALARM')) {
            alarmState = true
            if (line === "ALARM:5") {
                setTimeout(() => {
                    console.log(`>> ⚠️ GRBL Alarm: ${line} — initiating recovery...`);
                    socket.write('$X\n');
                }, 25)
            }
            if (line === "ALARM:10") {
                console.log ("E-STOP")
                socket.destroy();
                return;
            }
            continue;
        }

        // if ((line === 'ok' || line.startsWith('error')) && !alarmState) {
        if ((line === 'ok') && !alarmState) {

            setTimeout(sendNextCommand, 25);
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

