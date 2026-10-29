// M10 check: the divergence finder must tell the truth about the friends term.
// Run with: node check-divergence.js
// Part 1 is a scripted fixture: one vote at tick 30 (the ordinance and each noise draw are keyed, so they are the same in both runs),
// run twice on the same town. In run A every friend voted yes last time; in run B every friend voted no.
// Need fit is 0 for every ordinance, so a resident's score is 0.4 * taste + noise + W_SOCIAL (A) or 0.4 * taste + noise - W_SOCIAL (B).
// Part 2 runs divergence.js for real on the seed in the README and checks its report.
const assert = require('assert');
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const { createTown } = require('./core');
const { governanceStep } = require('./governance');

const SEED = 20261028;

// One festival vote on a fresh town. friendsVoted: true, false, or null (no friend has voted yet).
function festivalVote(friendsVoted) {
  const town = createTown(SEED);
  town.tick = 30;               // the first proposal tick
  for (const r of town.residents.values()) {
    // lean 0 for every ordinance (well, tax, festival, curfew), so the need term is 0 whichever one is proposed
    r.needs.food = 0.6; r.needs.rest = 0.6; r.traits.honesty = 0.5; r.traits.sociability = 0.5;
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
// With need 0, removing the self term can never change a vote.
assert.strictEqual(A.vote.effects.flips.self, 0, 'self term is zero here, so it flips nobody');
// Noise is keyed and the same in A and B, so it can flip residents on its own but never explains the gap between them.

// 2. Honest no-difference case: when no friend has voted, the friends term is zero and changes nothing.
const N = festivalVote(null);
assert.strictEqual(N.vote.effects.flips.social, 0, 'no friend votes: the friends term decides nobody');

// 3. Real runs: the finder's report for the README seed.
const out = execFileSync(process.execPath, [path.join(__dirname, 'divergence.js'), String(SEED)]).toString();
assert.ok(out.includes('first ballot change: tick 90, "festival", 9 resident(s) vote differently'), 'first ballot change on the README seed is tick 90 festival, 9 residents');
assert.ok(out.includes('friends on: 70 yes, 80 no (fails); friends off: 73 yes, 77 no (fails)'), 'tallies at tick 90 on the README seed: same fail either way');
assert.ok(out.includes('first outcome change: vote 4 at tick 270'), 'first outcome change on the README seed is vote 4 at tick 270 (keyed noise)');
const again = execFileSync(process.execPath, [path.join(__dirname, 'divergence.js'), String(SEED)]).toString();
assert.strictEqual(again, out, 'the finder is deterministic');

// 4. The page card quotes the same numbers (its 105-of-200 line comes from the batch run: TM_SEEDS=200 node divergence.js).
// The tick 270 pair is from the child runs (TM_W_SOCIAL 0.15 and 0 on the README seed, ballots compared per vote).
const page = fs.readFileSync(path.join(__dirname, 'site', 'index.html'), 'utf8');
for (const s of ['83 yes, 67 no', '69 yes, 81 no', '14 residents vote differently', '105 have a pass or fail difference']) {
  assert.ok(page.includes(s), `page card quotes "${s}"`);
}

console.log('M10 divergence checks passed.');
console.log(`fixture: ${flipped} residents flip to yes with friends on; no-friend run flips ${N.vote.effects.flips.social}.`);
