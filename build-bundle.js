// Town Meeting M6: bundle the headless sim into site/sim.bundle.js so the browser can run a town from a seed.
// Run with: node build-bundle.js. No dependencies: each module is wrapped in a function and loaded by a tiny require.
// The bundle exposes window.TownSim (or globalThis.TownSim) with the same functions node uses.
const fs = require('fs');
const path = require('path');

const MODULES = ['rng', 'map', 'governance', 'core', 'chronicle', 'bake'];

const defs = MODULES.map((name) => {
  const src = fs.readFileSync(path.join(__dirname, `${name}.js`), 'utf8');
  return `  defs[${JSON.stringify(name)}] = function (module, exports, require) {\n${src}\n  };`;
});

const bundle = `// Town Meeting M6 sim bundle. Built by build-bundle.js from ${MODULES.map((m) => m + '.js').join(', ')}. Do not edit by hand.
(function (root) {
  const defs = {};
  const cache = {};
  function load(name) {
    if (cache[name]) return cache[name].exports;
    const module = { exports: {} };
    cache[name] = module;
    defs[name](module, module.exports, (dep) => load(dep.replace('./', '')));
    return module.exports;
  }
${defs.join('\n')}
  const core = load('core');
  const chronicle = load('chronicle');
  const bake = load('bake');
  root.TownSim = {
    createTown: core.createTown,
    step: core.step,
    run: core.run,
    snapshot: core.snapshot,
    map: core.map,
    chronicle: chronicle.chronicle,
    bake: bake.bake,
    ORDINANCES: load('governance').ORDINANCES,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;

const dir = path.join(__dirname, 'site');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'sim.bundle.js'), bundle);
const kb = (fs.statSync(path.join(dir, 'sim.bundle.js')).size / 1024).toFixed(0);
console.log(`wrote site/sim.bundle.js (${kb} KB) from ${MODULES.join(', ')}`);
