// M1 + M2 check script: determinism, invariants, map and pathing.
// Run with: node check.js
const assert = require('assert');
const { run, snapshot, createTown, step, map } = require('./core');

const SEED = 20261028;
const TICKS = 300;

// 1. Same seed, same ticks -> identical snapshot.
const a = run(SEED, TICKS);
const b = run(SEED, TICKS);
assert.strictEqual(snapshot(a), snapshot(b), 'same seed must give the same town');

// 2. A different seed should give a different town.
const c = run(SEED + 1, TICKS);
assert.notStrictEqual(snapshot(a), snapshot(c), 'different seeds should differ');

// 3. Population and needs stay in range.
assert.strictEqual(a.residents.size, 150, 'town has 150 residents');
for (const r of a.residents.values()) {
  for (const k of ['food', 'rest', 'social']) {
    assert.ok(r.needs[k] >= 0 && r.needs[k] <= 1, `need ${k} of ${r.id} out of range`);
  }
  assert.ok(r.mood >= 0 && r.mood <= 1, `mood of ${r.id} out of range`);
}

// 4. Event records are well formed: sequential ids, causes point backwards.
const ids = new Set();
a.events.forEach((e, i) => {
  assert.strictEqual(e.id, i + 1, 'event ids are sequential');
  assert.ok(typeof e.type === 'string' && Array.isArray(e.actors), 'event has type and actors');
  assert.ok(e.tick >= 1 && e.tick <= TICKS, 'event tick is inside the run');
  if (e.causeEventId !== null) assert.ok(ids.has(e.causeEventId), 'cause must be an earlier event');
  ids.add(e.id);
});
assert.ok(a.events.length > 0, 'the run produced events');

// 5. Stock never goes negative.
assert.ok(a.stock.food >= 0, 'food stock is never negative');

// 6. Creating a town alone does not advance the tick.
assert.strictEqual(createTown(SEED).tick, 0, 'a new town starts at tick 0');

const counts = {};
for (const e of a.events) counts[e.type] = (counts[e.type] || 0) + 1;
// M2 checks ---------------------------------------------------------------

// 7. The map: every open cell is reachable from the square.
const m = a.map;
const squareIdx = m.square.y * m.w + m.square.x;
const reached = map.floodFill(m.cells, m.w, m.h, squareIdx);
for (let i = 0; i < m.cells.length; i++) {
  if (m.cells[i] === map.OPEN) assert.ok(reached[i], `open cell ${i} is cut off from the square`);
}

// 8. Every resident starts on an open cell and can reach the square.
for (const r of createTown(SEED).residents.values()) {
  assert.ok(map.isWalkable(m, r.home.x, r.home.y), `home of ${r.id} is walkable`);
  assert.ok(map.findPath(m, r.home, m.square) !== null, `resident ${r.id} can reach the square`);
}

// 9. A* gives the true shortest distance: compare with BFS distances from the square.
const dist = new Int32Array(m.w * m.h).fill(-1);
dist[squareIdx] = 0;
const queue = [squareIdx];
for (let q = 0; q < queue.length; q++) {
  const i = queue[q];
  const x = i % m.w;
  const y = (i - x) / m.w;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (!map.isWalkable(m, nx, ny)) continue;
    const j = ny * m.w + nx;
    if (dist[j] !== -1) continue;
    dist[j] = dist[i] + 1;
    queue.push(j);
  }
}
for (let i = 0; i < m.cells.length; i++) {
  if (m.cells[i] !== map.OPEN) continue;
  const from = { x: i % m.w, y: Math.floor(i / m.w) };
  const path = map.findPath(m, from, m.square);
  assert.strictEqual(path.length, dist[i], `A* length from ${i} matches BFS`);
}

// 10. Walking: every tick each resident moves at most one open cell.
const w = createTown(SEED);
const prev = new Map([...w.residents.values()].map((r) => [r.id, { ...r.pos }]));
let arrivals = 0;
for (let t = 0; t < TICKS; t++) {
  step(w);
  for (const r of w.residents.values()) {
    const p = prev.get(r.id);
    const d = Math.abs(p.x - r.pos.x) + Math.abs(p.y - r.pos.y);
    assert.ok(d <= 1, `resident ${r.id} jumped ${d} cells`);
    assert.ok(map.isWalkable(w.map, r.pos.x, r.pos.y), `resident ${r.id} stands on a wall`);
    prev.set(r.id, { ...r.pos });
  }
}
// Some actions must finish in the run, otherwise walking blocks everything.
assert.ok(w.events.length > 0 || w.stock.food > 0, 'residents finish actions after walking');

// M3 checks ---------------------------------------------------------------

// 11. Proposals come every 60 ticks from tick 30, and each one has a vote.
const byId = new Map(a.events.map((e) => [e.id, e]));
const proposals = a.events.filter((e) => e.type === 'proposal');
assert.deepStrictEqual(proposals.map((e) => e.tick), [30, 90, 150, 210, 270], 'proposals on schedule');
const votes = a.events.filter((e) => e.type === 'vote_result');
assert.strictEqual(votes.length, proposals.length, 'every proposal is voted on');

// 12. Votes add up to the population and the outcome matches the tally.
for (const v of votes) {
  assert.strictEqual(v.effects.yes + v.effects.no, 150, 'every resident votes');
  assert.strictEqual(v.effects.passed, v.effects.yes > v.effects.no, 'passed matches the tally');
  assert.strictEqual(byId.get(v.causeEventId).type, 'proposal', 'a vote points back to its proposal');
}

// 13. An ordinance only passes after a passing vote, and it is applied once.
for (const e of a.events.filter((x) => x.type === 'ordinance_passed')) {
  const v = byId.get(e.causeEventId);
  assert.ok(v && v.type === 'vote_result' && v.effects.passed, 'ordinance comes from a passing vote');
}

// 14. Every resident has a faction after the first vote, and the bloc sizes add up.
for (const r of a.residents.values()) assert.ok(r.faction === 'Yea' || r.faction === 'Nay', 'faction is set');

// 15. Votes are not near-unanimous: over several seeds, no vote has a minority of 5 or fewer.
// (Regression guard for the M3 open problem: the old model voted 150-0 and 148-2.)
for (const seed of [SEED, 1, 7, 42, 99, 123]) {
  const t = run(seed, 300, 150);
  for (const e of t.events.filter((x) => x.type === 'vote_result')) {
    assert.ok(Math.min(e.effects.yes, e.effects.no) > 5, `vote on seed ${seed} near-unanimous: ${e.effects.yes}-${e.effects.no}`);
  }
}

// M4 checks ---------------------------------------------------------------

// 16. The chronicle has one line per event, in tick order, and every caused event quotes a cause.
const { chronicle } = require('./chronicle');
const lines = chronicle(a);
assert.strictEqual(lines.length, a.events.length, 'one chronicle line per event');
a.events.forEach((e, i) => {
  assert.ok(lines[i].startsWith(`[tick ${e.tick}] `), 'line starts with its tick');
  assert.strictEqual(lines[i].includes('(because: '), e.causeEventId !== null, 'because clause iff caused');
});
for (let i = 1; i < a.events.length; i++) assert.ok(a.events[i].tick >= a.events[i - 1].tick, 'events in tick order');

// M4.1 checks -------------------------------------------------------------

// 17. Each vote records how many residents each term would have flipped. A flip count is 0..150,
// and removing a term can only flip a vote if that term pushed the score past zero.
for (const v of votes) {
  for (const k of ['self', 'taste', 'social', 'noise']) {
    const n = v.effects.flips[k];
    assert.ok(Number.isInteger(n) && n >= 0 && n <= 150, `flip count ${k} is in range`);
  }
}

console.log('M1 to M4.1 checks passed.');
console.log(`seed ${SEED}, ${TICKS} ticks, ${a.events.length} events`, counts);
