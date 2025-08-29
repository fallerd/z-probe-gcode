// deprecated: produces gcode for z probing; since integrated into z-probe-over-lan.js
// the reason why was because gsender's console is sketchy and getting hundreds of probes out of it seemed difficult or fragile
// instead created other script to auto parse output and save to csv automatically.

const fs = require('fs');
const path = require('path');

// === CONFIGURATION ===
const xStart = 0;
const yStart = 0;
const xEnd = 100;
const yEnd = 100;
const xStep = 10;
const yStep = 10;
const zProbeDepth = -10;
const zRetract = 5;
const probeFeed = 100;

// === Generate G-code ===
let gcode = [];
gcode.push('G21'); // mm units
gcode.push('G90'); // absolute positioning
gcode.push(`G0 Z${zRetract}`); // retract

for (let y = yStart; y <= yEnd; y += yStep) {
  for (let x = xStart; x <= xEnd; x += xStep) {
    gcode.push(`G0 X${x} Y${y}`);
    gcode.push(`G38.2 Z${zProbeDepth} F${probeFeed}`);
    gcode.push(`G92 Z0`);
    gcode.push(`G0 Z${zRetract}`);
  }
}

// === Save to file with dynamic filename ===
const filename = `grid_probe_${xEnd}x${yEnd}.gcode`;
const filepath = path.join(__dirname, filename);
fs.writeFileSync(filepath, gcode.join('\n'));

console.log(`G-code saved to: ${filename}`);
