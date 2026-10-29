// M6 check: the browser bundle must give the same town as node for the same seed.
// Compares a sha256 of the whole result (snapshot plus chronicle text), not just the event list.
// Run with: node check-bundle.js (after node build-bundle.js).
// The bundle runs as a plain function with process, require and module shadowed as undefined, like a browser page.
// (A vm context runs about 25x slower in node, so it is not used here.)
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const core = require('./core');
const { chronicle } = require('./chronicle');

const SEEDS = [20261028, 20261125, 20261225, 0, 1, 42, 123456789, 4294967295];
const TICKS = 300;
const POP = 150;

const sha = (snap, lines) => crypto.createHash('sha256').update(snap + '\n' + lines.join('\n')).digest('hex');

const bundleCode = fs.readFileSync(path.join(__dirname, 'site', 'sim.bundle.js'), 'utf8');
const page = {};
new Function('globalThis', 'process', 'require', 'module', bundleCode)(page, undefined, undefined, undefined);
const TownSim = page.TownSim;
assert.ok(TownSim, 'bundle must expose TownSim');

let slowest = 0;
for (const seed of SEEDS) {
  const t0 = Date.now();
  const nodeTown = core.run(seed, TICKS, POP);
  const nodeHash = sha(core.snapshot(nodeTown), chronicle(nodeTown));
  const nodeMs = Date.now() - t0;

  const t1 = Date.now();
  const bundleTown = TownSim.run(seed, TICKS, POP);
  const bundleHash = sha(TownSim.snapshot(bundleTown), TownSim.chronicle(bundleTown));
  const bundleMs = Date.now() - t1;
  slowest = Math.max(slowest, bundleMs);

  console.log(`seed ${seed}: node ${nodeHash.slice(0, 12)} bundle ${bundleHash.slice(0, 12)} (node ${nodeMs} ms, bundle ${bundleMs} ms)`);
  assert.strictEqual(bundleHash, nodeHash, `seed ${seed}: bundle and node differ`);
}

console.log(`check-bundle: ${SEEDS.length} seeds x ${TICKS} ticks, bundle and node identical. Slowest bundle run ${slowest} ms.`);
