# Altmill Grid Probing Script

This Node.js script connects to a GRBL-HAL-based CNC machine (like the Altmill) over LAN (doesn't work if connected bia usb), performs a grid-based Z-probing routine, and outputs the results to a CSV file (`heightmap.csv`). It's useful for mapping surface height variations across a defined area.

---

## ⚙️ Features

- Connects via TCP to GRBL-HAL controller (default: `192.168.5.1:23`)
- Automatically unlocks and initializes the machine based on slb requirements
- Probes Z-depth over a configurable X/Y grid
- Follows a snaking path for efficiency
- Outputs results to `heightmap.csv` in `X,Y,Z` format

---

## 🚀 Usage

First ensure config values at the top of the script are up to date for your current job.

1. Power it on and clear any e-stop.
2. Run the script from terminal:

```bash
node z-probe-over-lan.js
```

3. The script will:
   - Connect to the machine
   - Unlock and zero the origin
   - Probe each grid point
   - Save the results to `heightmap.csv`

4. Use csv-to-stl.js script to output a watertight STL version of the surface map.
