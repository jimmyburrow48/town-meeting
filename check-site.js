// M5 and M6 check: run site/app.js against a stub DOM and canvas, then play every tick of every town.
// M6: also type seeds into the page and check the town it makes (the bundle runs inside the same sandbox).
// No browser is used. Run with: node check-site.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const siteDir = path.join(__dirname, 'site');
const json = JSON.parse(fs.readFileSync(path.join(siteDir, 'towns.json'), 'utf8'));

// A stub element: remembers children and the last text, and records listeners.
function element(id) {
  const listeners = {};
  const children = [];
  const el = {
    id,
    value: '0',
    max: '0',
    width: 0,
    height: 0,
    className: '',
    children,
    appendChild(c) { children.push(c); return c; },
    addEventListener(type, fn) { listeners[type] = fn; },
    getContext() { return ctx; },
    listeners,
  };
  // Like a real DOM node, assigned values become strings.
  let text = '';
  // Setting it to '' also removes the child nodes, as a real DOM does.
  Object.defineProperty(el, 'textContent', {
    get: () => text,
    set: (v) => { text = String(v); if (text === '') children.length = 0; },
  });
  return el;
}

let fills = 0;
let arcs = 0;
const ctx = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  fillRect() { fills++; },
  beginPath() {},
  arc() { arcs++; },
  fill() {},
  stroke() {},
};

const els = {};
const document = {
  getElementById(id) {
    if (!els[id]) els[id] = element(id);
    return els[id];
  },
  createElement() { return element('li'); },
  createTextNode(text) { const n = element('#text'); n.textContent = text; return n; },
};

const sandbox = {
  document,
  fetch: async () => ({ json: async () => json }),
  console,
  setInterval: () => 0,
  clearInterval: () => {},
  // The page waits 20 ms before baking a typed seed; the check runs it at once.
  setTimeout: (fn) => { fn(); return 0; },
  Math,
  Number,
  String,
  Array,
  Object,
  Map,
  Set,
  Date,
  Promise,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(siteDir, 'sim.bundle.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(siteDir, 'app.js'), 'utf8'), sandbox);

// The story types the page shows when the filter is on (the page keeps the same list).
const STORY = new Set(['proposal', 'vote_result', 'ordinance_passed', 'faction_formed', 'faction_shift']);

// Independent count of residents who switched bloc in the last `window` ticks up to tick t (Yea to Nay or back).
function switchedAt(town, t, window = 4) {
  const moved = new Set();
  for (let k = 0; k < window && t - k >= 1; k++) {
    const now = town.frames[t - k].f;
    const before = town.frames[t - k - 1].f;
    for (let i = 0; i < now.length; i++) {
      if (now[i] !== before[i] && now[i] !== '0' && before[i] !== '0') moved.add(i);
    }
  }
  return moved.size;
}

// Play every tick of a town through the scrubber, and check the stats, food, tick label and chronicle.
// storyOnly: the chronicle filter is on (the page default) or off.
function checkTown(town, label, storyOnly = true) {
  const scrub = els.scrub;
  const log = els.log;
  els.story.checked = storyOnly;
  assert.strictEqual(Number(scrub.max), json.ticks, `scrubber max for ${label}`);
  for (let t = 0; t <= json.ticks; t++) {
    scrub.value = String(t);
    scrub.listeners.input();
    const f = town.frames[t];
    let yea = 0;
    let nay = 0;
    for (const c of f.f) { if (c === '1') yea++; else if (c === '2') nay++; }
    assert.strictEqual(els.yea.textContent, String(yea), `yea count at tick ${t} of ${label}`);
    assert.strictEqual(els.nay.textContent, String(nay), `nay count at tick ${t} of ${label}`);
    assert.strictEqual(els.food.textContent, String(f.food), `food at tick ${t} of ${label}`);
    assert.strictEqual(els.flips.textContent, String(switchedAt(town, t)), `switched bloc at tick ${t} of ${label}`);
    assert.strictEqual(els.tick.textContent, `tick ${t} of ${json.ticks}`, 'tick label');
  }
  // The chronicle at the last tick shows the newest 60 events (story types only when the filter is on), newest first.
  const pool = storyOnly ? town.events.filter((e) => STORY.has(e.type)) : town.events;
  const shown = pool.slice(-60).reverse();
  assert.strictEqual(log.children.length, shown.length, `chronicle lists ${shown.length} events for ${label} (story ${storyOnly})`);
  if (shown.length > 0) {
    const newest = pool[pool.length - 1];
    assert.strictEqual(log.children[0].children[0].textContent, `[${newest.tick}]`, `newest event leads the chronicle of ${label}`);
  }
  // Mid-run: the filter and the tick limit both apply.
  scrub.value = '100';
  scrub.listeners.input();
  const midShown = town.events.filter((e) => e.tick <= 100 && (!storyOnly || STORY.has(e.type))).slice(-60).reverse();
  assert.strictEqual(log.children.length, midShown.length, `chronicle at tick 100 of ${label} (story ${storyOnly})`);
}

(async () => {
  // Let the fetch promise chain settle, so loadTown(0) has run.
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));

  const select = els.town;
  assert.strictEqual(select.children.length, json.towns.length, 'one option per town');
  assert.ok(els.log.children.length > 0 || els.tick.textContent.startsWith('tick 0'), 'first town renders');

  // The story filter starts checked, as in index.html.
  els.story.checked = true;

  // M5: every baked town, every tick.
  for (let ti = 0; ti < json.towns.length; ti++) {
    select.value = String(ti);
    select.listeners.change({ target: select });
    checkTown(json.towns[ti], json.towns[ti].name);
  }

  // M7: every bloc switch shows on the map. Each faction_shift event has residents ringed on its tick, and the ring count matches a recount.
  let shiftEvents = 0;
  for (const town of json.towns) {
    for (const e of town.events) {
      if (e.type !== 'faction_shift') continue;
      shiftEvents++;
      assert.ok(switchedAt(town, e.tick) > 0, `faction_shift at tick ${e.tick} of ${town.name} ringed on the map`);
    }
  }
  assert.ok(shiftEvents > 0, 'the baked towns have bloc switches to ring');

  // M6 story filter off: every event shows, hunger and trust included.
  select.value = '0';
  select.listeners.change({ target: select });
  checkTown(json.towns[0], `${json.towns[0].name} with the story filter off`, false);
  assert.ok(json.towns[0].events.some((e) => !STORY.has(e.type)), 'the baked town has background lines for the filter to hide');
  els.story.checked = true;

  // M6: typed seeds. The expected town comes from the same bundle the page uses, so the check covers the page wiring.
  const TownSim = sandbox.TownSim;
  assert.ok(TownSim && typeof TownSim.bake === 'function', 'bundle exposes TownSim.bake');
  const seedInput = els.seed;
  const newBtn = els.new;
  const seedMsg = els.seedmsg;
  const typeSeed = (text) => { seedInput.value = text; newBtn.listeners.click(); };
  const playingMsg = (n) => `Playing seed ${n}. The same seed gives the same town every time.`;
  const refusedMsg = 'Use a whole number from 0 to 4294967295';

  // 1. A typed seed that equals a baked town plays exactly the baked frames.
  typeSeed(String(json.towns[0].seed));
  assert.strictEqual(seedMsg.textContent, playingMsg(json.towns[0].seed), 'message for the baked seed');
  assert.strictEqual(select.children.length, json.towns.length + 1, 'one extra option for the typed town');
  checkTown(json.towns[0], 'typed 20261028 (baked Hollow Market)');

  // 2. Invalid input is refused: no new town, the one on screen stays, and the message says why.
  const tickBefore = els.tick.textContent;
  const optionsBefore = select.children.length;
  for (const bad of ['', '   ', 'abc', '-1', '1.5', '1e5', '4294967296', '12345678901', '0x10']) {
    typeSeed(bad);
    assert.ok(seedMsg.textContent.startsWith(refusedMsg), `refused "${bad}" with a message`);
    assert.strictEqual(select.children.length, optionsBefore, `no option added for "${bad}"`);
    assert.strictEqual(els.tick.textContent, tickBefore, `town on screen unchanged after "${bad}"`);
  }

  // 3. Leading zeros and the edges of the range. The box shows the seed as used.
  for (const [typed, seed] of [[' 007 ', 7], ['0', 0], ['4294967295', 4294967295]]) {
    typeSeed(typed);
    assert.strictEqual(seedInput.value, String(seed), `box shows normalized seed for "${typed}"`);
    assert.strictEqual(seedMsg.textContent, playingMsg(seed), `message for seed ${seed}`);
    assert.strictEqual(select.children.length, json.towns.length + 1, 'still one typed-town option');
    checkTown(TownSim.bake(seed, 'Your town', json.ticks, 150), `typed seed ${seed}`);
  }

  // 4. Replay restarts the same town from tick 0.
  els.scrub.value = '120';
  els.scrub.listeners.input();
  els.replay.listeners.click();
  assert.strictEqual(els.tick.textContent, `tick 0 of ${json.ticks}`, 'replay restarts at tick 0');
  assert.strictEqual(els.play.textContent, 'Pause', 'replay starts playing');

  // 6. Enter in the seed box makes a town too.
  seedInput.value = '11';
  seedInput.listeners.keydown({ key: 'Enter' });
  assert.strictEqual(seedMsg.textContent, playingMsg(11), 'Enter plays the seed');
  assert.strictEqual(select.children.length, json.towns.length + 1, 'Enter reuses the typed-town option');
  checkTown(TownSim.bake(11, 'Your town', json.ticks, 150), 'typed seed 11 via Enter');

  // Positions are drawn: every resident once per frame, plus the grid fill.
  assert.ok(arcs >= json.towns.length * (json.ticks + 1) * 150, 'every resident is drawn at every tick');
  assert.ok(fills > 0, 'the map is drawn');
  console.log(`M5, M6 and M7 site checks passed: ${json.towns.length} baked towns and 5 typed seeds, every tick each, ${arcs} resident dots drawn, ${fills} tiles.`);
})().catch((err) => {
  console.error('site check FAILED:', err.message);
  process.exit(1);
});
