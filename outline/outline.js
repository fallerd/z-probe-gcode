const fs = require('fs');
const fitCurve = require('fit-curve');

const outline = [
    [201,213],
    [200.5,153],
    [198.5,113],
    [190,73],
    [172.5,38],
    [146,14],
    [105,1],
    [65,7],
    [32.5,30],
    [13.5,62.5],
    [4,102.5],
    [3,142.5],
    [2,222.5],
    [2,582.5],
    [2.5,642.5],
    [5.5,682.5],
    [15,722.5],
    [36,756.5],
    [67,778],
    [107,785.5],
    [146,775],
    [177,745.5],
    [193.5,708],
    [198.5,673],
    [199.5,633],
    [200.5,593],
]
const holes = [
    [121.5,162.5],
    [80,162.5],
    [80,215.5],
    [122,215.5],
    [121,570],
    [80.5,570],
    [80.5, 623],
    [122,623],
]

// Convert to [x, y] pairs (fit-curve format)
const rawPoints = [...outline, outline[0]]; // close loop

// Fit curve to outline with ~.2mm accuracy
const curves = fitCurve(rawPoints, .2);

// Generate path data
const pathData = curves.map((curve, i) => {
  const [p0, c1, c2, p1] = curve;
  return (i === 0 ? `M ${p0[0]} ${p0[1]} ` : '') +
         `C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p1[0]} ${p1[1]}`;
}).join('\n') + ' Z'; // close the path

// Create circle elements for holes (8mm diameter → 4mm radius)
const circleElements = holes.map(([cx, cy]) => {
  return `<circle cx="${cx}" cy="${cy}" r="4" fill="none" stroke="red" stroke-width="0.2" />`;
}).join('\n  ');

// Compute bounding box to set SVG size
const allPoints = rawPoints.concat(holes);
const xs = allPoints.map(p => p[0]);
const ys = allPoints.map(p => p[1]);
const minX = Math.min(...xs);
const maxX = Math.max(...xs);
const minY = Math.min(...ys);
const maxY = Math.max(...ys);
const width = maxX - minX;
const height = maxY - minY;

// Assemble full SVG
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}mm" height="${height}mm">
  <path d="${pathData}" fill="none" stroke="black" stroke-width="0.5" />
  ${circleElements}
</svg>
`.trim();

// Write to file
fs.writeFileSync('deck-outline.svg', svg);
console.log('✅ SVG saved as deck-outline.svg');
