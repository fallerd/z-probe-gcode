const fs = require('fs');
const { parse } = require('csv-parse/sync');

// === Load and parse CSV ===
const csvText = fs.readFileSync('heightmap.csv', 'utf8');
const records = parse(csvText, {
  columns: true,
  skip_empty_lines: true
});

const points = records.map(r => ({
  x: parseFloat(r.X),
  y: parseFloat(r.Y),
  z: parseFloat(r.Z)
}));

// Sort by Y then X
points.sort((a, b) => a.y - b.y || a.x - b.x);

// Get unique grid axes
const uniqueX = [...new Set(points.map(p => p.x))];
const uniqueY = [...new Set(points.map(p => p.y))];
const cols = uniqueX.length;
const rows = uniqueY.length;

if (rows * cols !== points.length) {
  console.error('❌ CSV grid is incomplete or non-uniform.');
  process.exit(1);
}

// === Triangle Facet Helper ===
function facet(p1, p2, p3) {
  // Dummy normal (all zeros – optional)
  return `
facet normal 0 0 0
  outer loop
    vertex ${p1.x} ${p1.y} ${p1.z}
    vertex ${p2.x} ${p2.y} ${p2.z}
    vertex ${p3.x} ${p3.y} ${p3.z}
  endloop
endfacet`;
}

// === Build STL ASCII ===
let stl = `solid heightmap`;

for (let row = 0; row < rows - 1; row++) {
  for (let col = 0; col < cols - 1; col++) {
    const i = row * cols + col;

    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + cols];
    const p4 = points[i + cols + 1];

    // First triangle
    stl += facet(p1, p2, p3);
    // Second triangle
    stl += facet(p2, p4, p3);
  }
}

stl += `\nendsolid heightmap\n`;

// === Save to STL file ===
fs.writeFileSync('output.stl', stl);
console.log('✅ STL written to output.stl');
