// Town Meeting M6 sim bundle. Built by build-bundle.js from rng.js, map.js, governance.js, core.js, chronicle.js, bake.js. Do not edit by hand.
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
  defs["rng"] = function (module, exports, require) {
// mulberry32: small seeded PRNG (returns floats in [0, 1)).
function seededRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { seededRandom };

  };
  defs["map"] = function (module, exports, require) {
// Town Meeting - M2 map and pathing.
// Plain JavaScript, no dependencies. The map uses its own RNG stream,
// so adding it does not change who the residents are.
const { seededRandom } = require('./rng');

const SIZE = 24;
const MAP_SALT = 0x6d617073;
const WALL = 1;
const OPEN = 0;
// 4-neighbour moves, in a fixed order so paths are deterministic.
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const cellIndex = (x, y, w) => y * w + x;
const inBox = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

// BFS over open cells from one start cell. Returns a Uint8Array of reached cells.
function floodFill(cells, w, h, start) {
  const reached = new Uint8Array(w * h);
  const queue = [start];
  reached[start] = 1;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = cellIndex(nx, ny, w);
      if (cells[j] === WALL || reached[j]) continue;
      reached[j] = 1;
      queue.push(j);
    }
  }
  return reached;
}

// Build the town map: square in the middle, a market top-left, fields along the
// bottom, and scattered walls (ponds, hedges). Every open cell is reachable from
// the square; sealed pockets are turned into walls.
function makeMap(seed, size = SIZE) {
  const rng = seededRandom((seed ^ MAP_SALT) >>> 0);
  const w = size;
  const h = size;
  const mid = Math.floor(size / 2);
  const cells = new Uint8Array(w * h);
  const zone = new Array(w * h).fill(null);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = cellIndex(x, y, w);
      if (inBox(x, y, mid - 1, mid - 1, mid + 1, mid + 1)) zone[i] = 'square';
      else if (inBox(x, y, 3, 3, 6, 5)) zone[i] = 'market';
      else if (y >= h - 4 && x >= 3 && x <= w - 4) zone[i] = 'field';
    }
  }

  for (let i = 0; i < w * h; i++) {
    if (!zone[i] && rng() < 0.14) cells[i] = WALL;
  }

  const reached = floodFill(cells, w, h, cellIndex(mid, mid, w));
  for (let i = 0; i < w * h; i++) {
    if (cells[i] === OPEN && !reached[i]) cells[i] = WALL;
  }

  const houses = [];
  const markets = [];
  const fields = [];
  const squares = [];
  for (let i = 0; i < w * h; i++) {
    if (cells[i] === WALL) continue;
    const pos = { x: i % w, y: Math.floor(i / w) };
    if (zone[i] === 'market') markets.push(pos);
    else if (zone[i] === 'field') fields.push(pos);
    else if (zone[i] === 'square') squares.push(pos);
    else houses.push(pos);
  }

  return { w, h, cells, zone, square: { x: mid, y: mid }, squares, markets, fields, houses };
}

function isWalkable(map, x, y) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  return map.cells[cellIndex(x, y, map.w)] === OPEN;
}

// A* on the grid with a Manhattan heuristic. Returns the list of steps after
// the start (empty if already there), or null if no path exists.
function findPath(map, from, to) {
  if (!isWalkable(map, to.x, to.y) || !isWalkable(map, from.x, from.y)) return null;
  const { w, h } = map;
  const n = w * h;
  const start = cellIndex(from.x, from.y, w);
  const goal = cellIndex(to.x, to.y, w);
  if (start === goal) return [];

  const g = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open = [start];
  const h0 = (i) => Math.abs((i % w) - to.x) + Math.abs(Math.floor(i / w) - to.y);
  g[start] = 0;

  while (open.length) {
    // Pick the lowest f; ties go to the lower cell index so results are stable.
    let best = 0;
    for (let k = 1; k < open.length; k++) {
      const a = open[k];
      const b = open[best];
      const fa = g[a] + h0(a);
      const fb = g[b] + h0(b);
      if (fa < fb || (fa === fb && a < b)) best = k;
    }
    const cur = open[best];
    open.splice(best, 1);
    if (cur === goal) break;
    closed[cur] = 1;

    const x = cur % w;
    const y = Math.floor(cur / w);
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkable(map, nx, ny)) continue;
      const j = cellIndex(nx, ny, w);
      if (closed[j]) continue;
      const ng = g[cur] + 1;
      if (ng < g[j]) {
        g[j] = ng;
        came[j] = cur;
        if (!open.includes(j)) open.push(j);
      }
    }
  }

  if (came[goal] === -1) return null;
  const steps = [];
  for (let i = goal; i !== start; i = came[i]) steps.push({ x: i % w, y: Math.floor(i / w) });
  return steps.reverse();
}

// Render the map as text. Residents can be marked by a list of positions.
function render(map, marks = []) {
  const rows = [];
  for (let y = 0; y < map.h; y++) {
    let row = '';
    for (let x = 0; x < map.w; x++) {
      const i = cellIndex(x, y, map.w);
      let ch = map.cells[i] === WALL ? '#' : '.';
      if (map.cells[i] === OPEN && map.zone[i] === 'market') ch = 'M';
      if (map.cells[i] === OPEN && map.zone[i] === 'field') ch = ',';
      if (map.cells[i] === OPEN && map.zone[i] === 'square') ch = '=';
      if (marks.some((p) => p.x === x && p.y === y)) ch = '@';
      row += ch;
    }
    rows.push(row);
  }
  return rows.join('\n');
}

module.exports = { SIZE, WALL, OPEN, makeMap, isWalkable, findPath, floodFill, render };

  };
  defs["governance"] = function (module, exports, require) {
// Town Meeting M3: proposals, votes, factions. Votes feed back into mood and the stock.
// Each vote mixes four things: how much the ordinance helps the resident (a
// continuous lean, not a yes/no), a fixed personal taste per ordinance, what
// the gossip friends voted last time, and a little seeded noise. No single term
// decides alone, so votes split instead of going 150-0.
const { seededRandom } = require('./rng');

const clamp = (x) => Math.min(1, Math.max(0, x));
const lean = (x) => Math.min(1, Math.max(-1, x)); // -1..1

const FIRST_PROPOSAL = 30; // tick of the first proposal
const PERIOD = 60;         // a new proposal every PERIOD ticks
const W_SELF = 0.35;       // weight of own need fit
const W_TASTE = 0.4;       // weight of the personal taste for this ordinance
// weight of what the gossip friends voted last time. TM_W_SOCIAL overrides it for the counterfactual (cf.js).
// The browser has no process object, so the override is read only where one exists.
const W_SOCIAL = typeof process !== 'undefined' && process.env.TM_W_SOCIAL !== undefined ? Number(process.env.TM_W_SOCIAL) : 0.15;
const NOISE = 0.2;         // total width of the random noise
const SWITCH_AFTER = 2;    // votes against the bloc in a row before a resident switches

const ORDINANCES = [
  {
    key: 'well',
    title: 'Dig a shared well',
    lean: (r) => lean(0.6 - r.needs.food),        // hungry residents want it
    apply: (town) => { town.stock.food += 20; },
  },
  {
    key: 'tax',
    title: 'Tax the harvest',
    lean: (r) => lean(r.traits.honesty - 0.5),    // honest residents accept it
    apply: (town) => { town.stock.food = Math.max(0, town.stock.food - 10); },
  },
  {
    key: 'festival',
    title: 'Hold a harvest festival',
    lean: (r) => lean(r.traits.sociability - 0.5), // sociable residents want it
    apply: (town) => { for (const r of town.residents.values()) r.needs.social = clamp(r.needs.social + 0.3); },
  },
  {
    key: 'curfew',
    title: 'Night curfew',
    lean: (r) => lean(0.6 - r.needs.rest),        // tired residents want it
    apply: (town) => { for (const r of town.residents.values()) r.needs.rest = clamp(r.needs.rest + 0.2); },
  },
];

// Fixed taste in -1..1 for one resident and one ordinance. It is derived from the
// town seed, the resident id and the ordinance key, so it never changes between
// votes and it does not use up the main rng stream.
function taste(town, id, key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  const rng = seededRandom((town.seed ^ Math.imul(id + 1, 0x9e3779b1) ^ h) >>> 0);
  return rng() * 2 - 1;
}

// record(type, actors, effects, causeEventId) appends an event and returns its id.
function governanceStep(town, record) {
  if (town.tick < FIRST_PROPOSAL || (town.tick - FIRST_PROPOSAL) % PERIOD !== 0) return;
  const rng = town.rng;
  const ord = ORDINANCES[Math.floor(rng() * ORDINANCES.length)];
  const proposalId = record('proposal', [], { ordinance: ord.key, title: ord.title });

  // Everyone votes from the same snapshot of last votes, so order does not matter.
  const ids = [...town.residents.keys()];
  const votes = new Map();
  // flips[term] counts residents whose vote would have gone the other way without that term.
  const flips = { self: 0, taste: 0, social: 0, noise: 0 };
  for (const id of ids) {
    const r = town.residents.get(id);
    const known = town.gossip.get(id).map((f) => town.residents.get(f)).filter((f) => f.lastVote !== null);
    const social = known.length ? known.reduce((s, f) => s + (f.lastVote ? 1 : -1), 0) / known.length : 0;
    const parts = {
      self: W_SELF * ord.lean(r),
      taste: W_TASTE * taste(town, id, ord.key),
      social: W_SOCIAL * social,
      noise: (rng() - 0.5) * NOISE,
    };
    const score = parts.self + parts.taste + parts.social + parts.noise;
    votes.set(id, score > 0);
    for (const k of Object.keys(flips)) {
      if ((score - parts[k] > 0) !== (score > 0)) flips[k]++;
    }
  }

  let yes = 0;
  for (const v of votes.values()) if (v) yes++;
  const no = ids.length - yes;
  const passed = yes > no;
  const voteId = record('vote_result', [], { ordinance: ord.key, yes, no, passed, flips }, proposalId);

  for (const id of ids) {
    const r = town.residents.get(id);
    const side = votes.get(id);
    r.lastVote = side;
    // Winners feel heard, losers feel ignored.
    r.mood = clamp(r.mood + (side === passed ? 0.05 : -0.05));
  }

  if (passed) {
    ord.apply(town);
    record('ordinance_passed', [], { ordinance: ord.key, food_stock: Number(town.stock.food.toFixed(2)) }, voteId);
  }

  updateFactions(town, record, voteId);
}

// Factions are not assigned. The first vote splits residents into two blocs
// (Yea and Nay). After that, a resident switches bloc only after SWITCH_AFTER
// votes in a row where their own vote and at least 3 of their 4 gossip friends
// went against their bloc. The streak (r.dissent) stops one lopsided vote from
// flipping a whole bloc at once.
function updateFactions(town, record, cause) {
  const ids = [...town.residents.keys()];
  if (ids.every((id) => town.residents.get(id).faction === null)) {
    for (const id of ids) {
      const r = town.residents.get(id);
      r.faction = r.lastVote ? 'Yea' : 'Nay';
    }
    record('faction_formed', [], { labels: ['Yea', 'Nay'] }, cause);
    return;
  }

  const changed = [];
  for (const id of ids) {
    const r = town.residents.get(id);
    const ownSide = r.faction === 'Yea';
    const against = town.gossip.get(id).filter((f) => town.residents.get(f).lastVote !== ownSide).length;
    if (against >= 3 && r.lastVote !== ownSide) {
      r.dissent += 1;
    } else {
      r.dissent = 0;
    }
    if (r.dissent >= SWITCH_AFTER) {
      const to = ownSide ? 'Nay' : 'Yea';
      changed.push({ id, from: r.faction, to });
      r.faction = to;
      r.dissent = 0;
    }
  }
  if (changed.length) {
    const sizes = { Yea: 0, Nay: 0 };
    for (const id of ids) sizes[town.residents.get(id).faction] += 1;
    record('faction_shift', changed.map((c) => c.id), { changed: changed.length, sizes }, cause);
  }
}

module.exports = { governanceStep, ORDINANCES };

  };
  defs["core"] = function (module, exports, require) {
// Town Meeting - M1 headless core, M2 map and pathing.
// Plain JavaScript, no dependencies. Same seed + same ticks = same town.
const { seededRandom } = require('./rng');
const mapTools = require('./map');
const { governanceStep } = require('./governance');

const SYLLABLES = ['ba', 'lo', 'ri', 'ka', 'mo', 'ten', 'ver', 'su', 'pe', 'han', 'ol', 'dri'];

function makeName(rng) {
  const parts = 2 + Math.floor(rng() * 2);
  let s = '';
  for (let i = 0; i < parts; i++) s += SYLLABLES[Math.floor(rng() * SYLLABLES.length)];
  return s[0].toUpperCase() + s.slice(1);
}

const clamp = (x) => Math.min(1, Math.max(0, x));
const samePos = (a, b) => a.x === b.x && a.y === b.y;

// Create a town. Residents have stable numeric ids; names are cosmetic.
function createTown(seed, population = 150) {
  const rng = seededRandom(seed);
  const town = {
    seed,
    tick: 0,
    rng,
    residents: new Map(),
    relationships: new Map(), // key "a:b" (a < b) -> { trust, affinity }
    gossip: new Map(),        // id -> [ids they talk to]
    rumors: [],               // { subject, source, claim, strength, tick }
    events: [],               // append-only chronicle records
    stock: { food: population * 1.5 },
    nextEventId: 1,
    map: mapTools.makeMap(seed),
  };

  for (let id = 0; id < population; id++) {
    town.residents.set(id, {
      id,
      name: makeName(rng),
      traits: { sociability: rng(), honesty: rng() },
      needs: { food: 0.6 + rng() * 0.3, rest: 0.6 + rng() * 0.3, social: 0.5 + rng() * 0.4 },
      mood: 0.6,
      grudges: new Map(), // id -> strength 0..1
      faction: null,
      lastVote: null, // M3: true (yes), false (no), null (never voted)
      dissent: 0,     // M3: votes in a row against own bloc (see governance.js)
    });
  }

  // Sparse gossip graph: each resident talks to 4 random others.
  for (let id = 0; id < population; id++) town.gossip.set(id, []);
  for (let id = 0; id < population; id++) {
    while (town.gossip.get(id).length < 4) {
      const other = Math.floor(rng() * population);
      if (other === id || town.gossip.get(id).includes(other)) continue;
      town.gossip.get(id).push(other);
      if (!town.gossip.get(other).includes(id)) town.gossip.get(other).push(id);
    }
  }

  // M2: every resident has a home, and a fixed market, field and square spot.
  // They start at home. plan = { action, target } while they walk to it.
  const pick = (list) => ({ ...list[Math.floor(rng() * list.length)] });
  for (const r of town.residents.values()) {
    r.home = pick(town.map.houses);
    r.spots = { market: pick(town.map.markets), field: pick(town.map.fields), square: pick(town.map.squares) };
    r.pos = { ...r.home };
    r.plan = null;
    r.path = [];
  }
  return town;
}

function relKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function getRel(town, a, b) {
  const key = relKey(a, b);
  if (!town.relationships.has(key)) town.relationships.set(key, { trust: 0.5, affinity: 0 });
  return town.relationships.get(key);
}

// Append a structured record. Prose is generated from these later (M4).
function recordEvent(town, type, actors, effects, causeEventId = null) {
  const event = {
    id: town.nextEventId++,
    tick: town.tick,
    type,
    actors,
    causeEventId,
    effects,
  };
  town.events.push(event);
  return event.id;
}

function step(town) {
  const rng = town.rng;
  town.tick += 1;
  const ids = [...town.residents.keys()];

  // 1. Decay needs.
  for (const id of ids) {
    const r = town.residents.get(id);
    r.needs.food = clamp(r.needs.food - (0.02 + rng() * 0.01));
    r.needs.rest = clamp(r.needs.rest - 0.03);
    r.needs.social = clamp(r.needs.social - 0.02);
  }

  // 2. Residents with no plan choose an action and a place to do it, in id
  //    order (stable). They keep the plan until they arrive, so they do not
  //    change their minds halfway across town.
  for (const id of ids) {
    const r = town.residents.get(id);
    if (r.plan) continue;
    let action;
    if (r.needs.food < 0.3) {
      // Hungry and the market is empty: go to the fields to grow food instead.
      if (town.stock.food >= 1) action = 'eat';
      else {
        recordEvent(town, 'scarcity', [id], { resident: id, food_stock: Number(town.stock.food.toFixed(2)) });
        action = 'work';
      }
    }
    else if (r.needs.rest < 0.3) action = 'rest';
    else if (r.needs.social < 0.4) action = 'socialize';
    else if (rng() < 0.2) action = 'gossip';
    else action = 'work';

    const target = {
      eat: r.spots.market,
      rest: r.home,
      socialize: town.map.square, // one central meeting spot, so friends can find each other
      gossip: r.spots.square,
      work: r.spots.field,
    }[action];
    const path = mapTools.findPath(town.map, r.pos, target);
    r.plan = { action, target: { ...target } };
    r.path = path || [];
  }

  // 3. Walk one cell toward each plan. When a resident arrives, resolve the
  //    action and update relationships.
  for (const id of ids) {
    const r = town.residents.get(id);
    if (!r.plan) continue; // freed as a partner earlier this tick
    if (r.path.length) {
      r.pos = r.path.shift();
      if (r.path.length) continue;
    }
    const action = r.plan.action;
    const target = r.plan.target;

    // M3: a socializer waits on the square (up to 20 ticks) for a friend who is
    // also there and waiting. Both get the social boost and both are freed.
    if (action === 'socialize') {
      const waiting = town.gossip.get(id).filter((f) => {
        const o = town.residents.get(f);
        return o.plan && o.plan.action === 'socialize' && samePos(o.pos, target);
      });
      if (!waiting.length) {
        r.wait = (r.wait || 0) + 1;
        if (r.wait < 20) continue; // keep the plan and wait another tick
        r.wait = 0;
        r.plan = null;
        continue;
      }
      r.wait = 0;
      const otherId = waiting[Math.floor(rng() * waiting.length)];
      const otherR = town.residents.get(otherId);
      r.plan = null;
      otherR.plan = null;
      const rel = getRel(town, id, otherId);
      const gap = Math.abs(r.traits.honesty - otherR.traits.honesty) + Math.abs(r.traits.sociability - otherR.traits.sociability);
      const before = rel.trust;
      if (gap < 0.5) {
        rel.trust = clamp(rel.trust + 0.05);
        rel.affinity = clamp(rel.affinity + 0.1);
        r.needs.social = clamp(r.needs.social + 0.3);
        otherR.needs.social = clamp(otherR.needs.social + 0.3);
      } else {
        rel.trust = clamp(rel.trust - 0.08);
        rel.affinity = clamp(rel.affinity - 0.1);
        // A slight creates a grudge in the other resident.
        const old = otherR.grudges.get(id) || 0;
        otherR.grudges.set(id, clamp(old + 0.2));
        if (old === 0) recordEvent(town, 'grudge_formed', [otherId, id], { holder: otherId, target: id, strength: 0.2 });
      }
      if (Math.abs(rel.trust - before) >= 0.05 && gap >= 0.5) {
        recordEvent(town, 'trust_changed', [id, otherId], { trust: Number(rel.trust.toFixed(2)) });
      }
      continue;
    }
    r.plan = null;

    if (action === 'eat') {
      if (town.stock.food >= 1) {
        town.stock.food -= 1;
        r.needs.food = clamp(r.needs.food + 0.5);
      } else {
        // The stock ran out while this resident was walking.
        r.mood = clamp(r.mood - 0.05);
      }
    } else if (action === 'rest') {
      r.needs.rest = clamp(r.needs.rest + 0.4);
    } else if (action === 'work') {
      town.stock.food += 4 + r.traits.sociability * 0.5;
    } else if (action === 'gossip') {
      // Gossip: pass a rumor about a random third resident to a friend.
      const friends = town.gossip.get(id);
      const other = friends[Math.floor(rng() * friends.length)];
      const subject = Math.floor(rng() * town.residents.size);
      if (subject !== other) {
        const strength = clamp(0.6 + rng() * 0.3);
        town.rumors.push({ subject, source: id, claim: 'slight', strength, tick: town.tick });
      }
    }
  }

  // 5. Propagate a limited number of rumors (strength decays per hop,
  //    dishonest residents distort the claim).
  const hop = town.rumors.slice(-20);
  for (const rumor of hop) {
    const listeners = town.gossip.get(rumor.source) || [];
    if (!listeners.length) continue;
    const to = listeners[Math.floor(rng() * listeners.length)];
    const speaker = town.residents.get(rumor.source);
    const distorted = speaker.traits.honesty < 0.3 && rng() < 0.5;
    const strength = clamp(rumor.strength * 0.8);
    if (strength < 0.2) continue;
    town.rumors.push({ subject: rumor.subject, source: to, claim: distorted ? 'exaggerated' : rumor.claim, strength, tick: town.tick, via: rumor.source });
    const listener = town.residents.get(to);
    const old = listener.grudges.get(rumor.subject) || 0;
    listener.grudges.set(rumor.subject, clamp(old + strength * 0.1));
  }

  // 6. M3: proposals, votes and factions (see governance.js).
  governanceStep(town, (type, actors, effects, cause) => recordEvent(town, type, actors, effects, cause));

  return town;
}

// Run N ticks and return the town.
function run(seed, ticks, population) {
  const town = createTown(seed, population);
  for (let i = 0; i < ticks; i++) step(town);
  return town;
}

// Plain snapshot for comparison and saving (no functions, no Maps).
function snapshot(town) {
  return JSON.stringify({
    tick: town.tick,
    stock: town.stock,
    residents: [...town.residents.values()].map((r) => ({
      ...r,
      grudges: [...r.grudges.entries()],
    })),
    relationships: [...town.relationships.entries()],
    events: town.events,
  });
}

module.exports = { seededRandom, createTown, step, run, snapshot, map: mapTools };

  };
  defs["chronicle"] = function (module, exports, require) {
// Town Meeting M4: chronicle. Prose is generated FROM the event records, never the other way round.
// Each line is "[tick N] text". A record with causeEventId gets a "because" clause that quotes its cause.
const { run } = require('./core');
const { ORDINANCES } = require('./governance');

const titleOf = (key) => (ORDINANCES.find((o) => o.key === key) || { title: key }).title;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const nameOf = (town, id) => (town.residents.get(id) ? town.residents.get(id).name : `resident ${id}`);

// One short sentence per event type. Keep these pure: same record, same text.
const TEMPLATES = {
  trust_changed: (e, t) => `${nameOf(t, e.actors[0])} and ${nameOf(t, e.actors[1])} now trust each other at ${e.effects.trust}.`,
  grudge_formed: (e, t) => `${nameOf(t, e.effects.holder)} begins to hold a grudge against ${nameOf(t, e.effects.target)} (strength ${e.effects.strength}).`,
  scarcity: (e, t) => `${nameOf(t, e.effects.resident)} goes hungry; the town's food is down to ${e.effects.food_stock}.`,
  proposal: (e) => `The mayor-hamster proposes: “${titleOf(e.effects.ordinance)}”.`,
  vote_result: (e) => {
    const f = e.effects.flips;
    const head = e.effects.passed
      ? `The vote on “${titleOf(e.effects.ordinance)}” passes, ${e.effects.yes} to ${e.effects.no}.`
      : `The vote on “${titleOf(e.effects.ordinance)}” fails, ${e.effects.yes} to ${e.effects.no}.`;
    return `${head} Without personal taste, ${f.taste} residents would vote differently; without need, ${f.self}; without gossip, ${f.social}.`;
  },
  ordinance_passed: (e) => {
    const done = {
      well: `A shared well is dug. The food stock rises to ${e.effects.food_stock}.`,
      tax: `The harvest tax is collected. The food stock falls to ${e.effects.food_stock}.`,
      festival: 'The harvest festival lifts everyone\'s social spirits.',
      curfew: 'A night curfew is in force, and everyone rests a little more.',
    };
    return done[e.effects.ordinance] || `“${titleOf(e.effects.ordinance)}” becomes law.`;
  },
  faction_formed: () => 'After the first vote, the town splits into two blocs: Yea and Nay.',
  faction_shift: (e) => `${plural(e.effects.changed, 'resident')} switch blocs. The town now has ${e.effects.sizes.Yea} Yea and ${e.effects.sizes.Nay} Nay.`,
};

// Plain text for a cause, without its own because clause (keeps lines short).
function causeText(town, byId, id) {
  const c = byId.get(id);
  if (!c) return `#${id}`;
  const fn = TEMPLATES[c.type];
  return fn ? fn(c, town) : c.type;
}

// Build the chronicle as an array of lines. Throws on an event type with no template.
function chronicle(town) {
  const byId = new Map(town.events.map((e) => [e.id, e]));
  return town.events.map((e) => {
    const fn = TEMPLATES[e.type];
    if (!fn) throw new Error(`no chronicle template for event type ${e.type}`);
    let line = `[tick ${e.tick}] ${fn(e, town)}`;
    if (e.causeEventId !== null) {
      line += ` (because: ${causeText(town, byId, e.causeEventId)})`;
    }
    return line;
  });
}

module.exports = { chronicle, TEMPLATES };

// CLI: node chronicle.js [seed] [ticks]
if (require.main === module) {
  const seed = Number(process.argv[2] || 20261028);
  const ticks = Number(process.argv[3] || 300);
  const town = run(seed, ticks, 150);
  console.log(chronicle(town).join('\n'));
}

  };
  defs["bake"] = function (module, exports, require) {
// Town Meeting M6: turn a town into playback frames. Shared by build-site.js (baked towns) and the browser (typed seeds).
// The page plays these frames and never runs the sim itself, so the baked towns and a typed seed look the same.
const { createTown, step, map } = require('./core');
const { chronicle } = require('./chronicle');

// Zone letters: M market, , field, = square, . other open ground, # wall.
function encodeMap(m) {
  let rows = [];
  for (let y = 0; y < m.h; y++) {
    let row = '';
    for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      if (m.cells[i] === map.WALL) row += '#';
      else if (m.zone[i] === 'market') row += 'M';
      else if (m.zone[i] === 'field') row += ',';
      else if (m.zone[i] === 'square') row += '=';
      else row += '.';
    }
    rows.push(row);
  }
  return rows;
}

// Run a town for `ticks` ticks and record one frame per state (frame 0 is the start).
function bake(seed, name, ticks, population = 150) {
  const town = createTown(seed, population);
  const ids = [...town.residents.keys()];
  const frames = [];
  // Frame t is the state after t ticks: flat positions plus a faction code (0 none, 1 Yea, 2 Nay) per resident.
  const record = () => {
    const p = [];
    let f = '';
    for (const id of ids) {
      const r = town.residents.get(id);
      p.push(r.pos.x, r.pos.y);
      f += r.faction === 'Yea' ? '1' : r.faction === 'Nay' ? '2' : '0';
    }
    frames.push({ p, f, food: Number(town.stock.food.toFixed(1)) });
  };
  record();
  for (let t = 0; t < ticks; t++) {
    step(town);
    record();
  }
  const events = chronicle(town).map((line, i) => ({ tick: town.events[i].tick, type: town.events[i].type, text: line }));
  return {
    seed,
    name,
    map: encodeMap(town.map),
    residents: ids.length,
    frames,
    events,
  };
}

module.exports = { bake, encodeMap };

  };
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
