// Town Meeting M5: bake the towns into site/towns.json so the browser can replay them.
// Run with: node build-site.js. The browser does no simulation; it plays back these frames.
// M6: the frame code lives in bake.js, shared with the browser's typed-seed mode.
const fs = require('fs');
const path = require('path');
const { bake } = require('./bake');

const TOWNS = [
  { seed: 20261028, name: 'Hollow Market' },
  { seed: 20261125, name: 'Two Wells' },
  { seed: 20261225, name: 'Long Harvest' },
];
const TICKS = 300;

const out = { ticks: TICKS, towns: TOWNS.map((t) => bake(t.seed, t.name, TICKS, 150)) };
const dir = path.join(__dirname, 'site');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'towns.json'), JSON.stringify(out));
const kb = (fs.statSync(path.join(dir, 'towns.json')).size / 1024).toFixed(0);
console.log(`wrote site/towns.json (${kb} KB): ${out.towns.map((t) => `${t.name} ${t.events.length} events`).join(', ')}`);
