// M10 check: the divergence finder must tell the truth about the friends term.
// Run with: node check-divergence.js
// Part 1 is a scripted fixture: one festival vote (rng fixed so the ordinance is "festival" and the noise is 0),
// run twice on the same town. In run A every friend voted yes last time; in run B every friend voted no.
// With need fit 0 and noise 0, a resident's score is 0.4 * taste + W_SOCIAL (A) or 0.4 * taste - W_SOCIAL (B).
// Part 2 runs divergence.js for real on the seed in the README and checks its report.
const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');
const { createTown } = require('./core');
const { governanceStep } = require('./governance');

const SEED = 20261028;

// One festival vote on a fresh town. friendsVoted: true, false, or null (no friend has voted yet).
function festivalVote(friendsVoted) {
  const town = createTown(SEED);
  town.tick = 30;               // the first proposal tick
  town.rng = () => 0.5;         // ordinance index 2 (festival), noise 0
  for (const r of town.residents.values()) {
    r.traits.sociability = 0.5; // lean 0, so the need term is 0
    r.lastVote = friendsVoted;
  }
  const events = [];
  const record = (type, actors, effects) => { events.push({ type, effects }); return events.length; };
  governanceStep(town, record);
  const vote = events.find((e) => e.type === 'vote_result');
  const ballots = [...town.residents.keys()].map((id) => town.residents.get(id).lastVote);
  return { vote, ballots };
}

// 1. Friends on (all yes) and friends off (all no): the same residents, one difference.
const A = festivalVote(true);
const B = festivalVote(false);
let flipped = 0;
A.ballots.forEach((a, i) => {
  const b = B.ballots[i];
  assert.ok(a || !b, `resident ${i}: more yes when friends voted no`); // friends voting yes never lowers a yes
  if (a && !b) flipped++;
});
assert.ok(flipped > 0, 'the friends term must flip at least one resident in this fixture');
assert.strictEqual(A.vote.effects.yes - B.vote.effects.yes, flipped, 'yes-count gap equals the flipped residents');

// The flip counts record which residents the friends term decided: they add up to the same flipped residents.
assert.strictEqual(A.vote.effects.flips.social + B.vote.effects.flips.social, flipped,
  'flips.social of both runs add up to the residents the friends term decided');
// With need 0 and noise 0, removing those terms can never change a vote.
assert.strictEqual(A.vote.effects.flips.self, 0, 'self term is zero here, so it flips nobody');
assert.strictEqual(A.vote.effects.flips.noise, 0, 'noise is zero here, so it flips nobody');

// 2. Honest no-difference case: when no friend has voted, the friends term is zero and changes nothing.
const N = festivalVote(null);
assert.strictEqual(N.vote.effects.flips.social, 0, 'no friend votes: the friends term decides nobody');

// 3. Real runs: the finder's report for the README seed.
const out = execFileSync(process.execPath, [path.join(__dirname, 'divergence.js'), String(SEED)]).toString();
assert.ok(out.includes('first ballot change: tick 90, "festival"'), 'first ballot change on the README seed is tick 90 festival');
assert.ok(out.includes('friends on: 85 yes, 65 no (passes); friends off: 64 yes, 86 no (fails)'), 'tallies on the README seed');
assert.ok(out.includes('first outcome change: vote 1 at tick 90'), 'first outcome change on the README seed');
const again = execFileSync(process.execPath, [path.join(__dirname, 'divergence.js'), String(SEED)]).toString();
assert.strictEqual(again, out, 'the finder is deterministic');

console.log('M10 divergence checks passed.');
console.log(`fixture: ${flipped} residents flip to yes with friends on; no-friend run flips ${N.vote.effects.flips.social}.`);
