// converts heightmap.csv from z-probe-ofer-lan.js to stl file

const fs = require('fs');
const { parse } = require('csv-parse/sync');

// === Load and parse CSV ===
const csvText = fs.readFileSync('heightmap.csv', 'utf8');
const records = parse(csvText, {
  columns: true,
  skip_empty_lines: true
});
let lowestZ = Infinity;
const topPoints = records.map(r => ({
  x: parseFloat(r.X),
  y: parseFloat(r.Y),
  z: parseFloat(r.Z)
}));

for (const point of topPoints) {
    if (point.z < lowestZ) {
        lowestZ = point.z
    }
}
lowestZ = lowestZ - 10;

// Sort by Y then X
topPoints.sort((a, b) => a.y - b.y || a.x - b.x);

const uniqueX = [...new Set(topPoints.map(p => p.x))];
const uniqueY = [...new Set(topPoints.map(p => p.y))];
const cols = uniqueX.length;
const rows = uniqueY.length;

if (rows * cols !== topPoints.length) {
  console.error('❌ CSV grid is incomplete or non-uniform.');
  process.exit(1);
}

// === STL helper
function facet(p1, p2, p3) {
  return `
facet normal 0 0 0
  outer loop
    vertex ${p1.x} ${p1.y} ${p1.z}
    vertex ${p2.x} ${p2.y} ${p2.z}
    vertex ${p3.x} ${p3.y} ${p3.z}
  endloop
endfacet`;
}

let stl = `solid heightmap`;

// === 1. Surface top triangles
for (let row = 0; row < rows - 1; row++) {
  for (let col = 0; col < cols - 1; col++) {
    const i = row * cols + col;

    const p1 = topPoints[i];
    const p2 = topPoints[i + 1];
    const p3 = topPoints[i + cols];
    const p4 = topPoints[i + cols + 1];

    stl += facet(p1, p2, p3);
    stl += facet(p2, p4, p3);
  }
}

// === 2. Flat base (bottom) triangles
const basePoints = topPoints.map(p => ({ x: p.x, y: p.y, z: lowestZ }));
for (let row = 0; row < rows - 1; row++) {
  for (let col = 0; col < cols - 1; col++) {
    const i = row * cols + col;

    const p1 = basePoints[i];
    const p2 = basePoints[i + 1];
    const p3 = basePoints[i + cols];
    const p4 = basePoints[i + cols + 1];

    // Flip winding order for bottom
    stl += facet(p3, p2, p1);
    stl += facet(p3, p4, p2);
  }
}

// === 3. Side walls around the mesh

// Helper to add a quad (2 triangles) between top and bottom edge
function addWall(topA, topB, baseA, baseB) {
  stl += facet(topA, baseB, baseA);
  stl += facet(topA, topB, baseB);
}

// Left and Right walls (Y direction)
for (let row = 0; row < rows - 1; row++) {
  const topLeft = topPoints[row * cols];
  const topLeftNext = topPoints[(row + 1) * cols];
  const baseLeft = basePoints[row * cols];
  const baseLeftNext = basePoints[(row + 1) * cols];

  const topRight = topPoints[row * cols + cols - 1];
  const topRightNext = topPoints[(row + 1) * cols + cols - 1];
  const baseRight = basePoints[row * cols + cols - 1];
  const baseRightNext = basePoints[(row + 1) * cols + cols - 1];

  addWall(topLeft, topLeftNext, baseLeft, baseLeftNext);
  addWall(topRightNext, topRight, baseRightNext, baseRight);
}

// Front and Back walls (X direction)
for (let col = 0; col < cols - 1; col++) {
  const topFront = topPoints[col];
  const topFrontNext = topPoints[col + 1];
  const baseFront = basePoints[col];
  const baseFrontNext = basePoints[col + 1];

  const topBack = topPoints[(rows - 1) * cols + col];
  const topBackNext = topPoints[(rows - 1) * cols + col + 1];
  const baseBack = basePoints[(rows - 1) * cols + col];
  const baseBackNext = basePoints[(rows - 1) * cols + col + 1];

  addWall(topFrontNext, topFront, baseFrontNext, baseFront);
  addWall(topBack, topBackNext, baseBack, baseBackNext);
}

stl += `\nendsolid heightmap\n`;

fs.writeFileSync('output.stl', stl);
console.log('✅ Solid STL with base saved to output.stl');
