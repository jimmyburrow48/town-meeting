// M10: where does the friends term first change a ballot?
// Same seed, two runs: the default friends weight (0.15) and no friends term (0).
// Reports the first ballot where any resident votes differently, the first vote
// where the outcome differs, and which residents flipped and what their friends
// had voted last time (the only thing that differs at the first flip).
// Run with: node divergence.js            (the seed in the script, 20261028)
//           node divergence.js 1234 5678  (seeds on the command line)
//           TM_SEEDS=100 node divergence.js (a batch summary over 100 seeds)
// Each weight runs in its own process, because W_SOCIAL is read at require time.
const { execFileSync } = require('child_process');
const path = require('path');

const WEIGHTS = { on: '0.15', off: '0' };
const TICKS = 300;

if (process.argv[2] === 'child') {
  // Child mode: print every vote's ballots for the seed in argv[3] and the weight in TM_W_SOCIAL.
  const { createTown, step } = require('./core');
  const seed = Number(process.argv[3]);
  const town = createTown(seed);
  const gossip = [...town.residents.keys()].map((id) => town.gossip.get(id));
  const votes = [];
  for (let i = 0; i < TICKS; i++) {
    step(town);
    const vr = town.events.filter((e) => e.type === 'vote_result' && e.tick === town.tick).pop();
    if (!vr) continue;
    const ballots = [...town.residents.values()].map((r) => (r.lastVote ? 'Y' : 'N')).join('');
    votes.push({ tick: town.tick, ordinance: vr.effects.ordinance, yes: vr.effects.yes, no: vr.effects.no, passed: vr.effects.passed, ballots });
  }
  console.log(JSON.stringify({ gossip, votes }));
} else {
  const seeds = process.argv.slice(2).length
    ? process.argv.slice(2).map(Number)
    : Array.from({ length: Number(process.env.TM_SEEDS || 1) }, (_, i) => 20261028 + i * 97);
  const child = (seed, w) => JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'divergence.js'), 'child', String(seed)], {
    env: { ...process.env, TM_W_SOCIAL: w },
    maxBuffer: 16 * 1024 * 1024,
  }).toString());

  let ballotSeeds = 0, outcomeSeeds = 0, neitherSeeds = 0;
  for (const seed of seeds) {
    const on = child(seed, WEIGHTS.on);
    const off = child(seed, WEIGHTS.off);
    const n = Math.min(on.votes.length, off.votes.length);
    let firstBallot = null, firstOutcome = null;
    for (let v = 0; v < n; v++) {
      const a = on.votes[v], b = off.votes[v];
      if (a.ordinance !== b.ordinance) break; // the schedules split: stop comparing
      if (firstBallot === null && a.ballots !== b.ballots) firstBallot = v;
      if (firstOutcome === null && a.passed !== b.passed) firstOutcome = v;
      if (firstBallot !== null && firstOutcome !== null) break;
    }

    const lines = [`seed ${seed}`];
    if (firstBallot === null) {
      lines.push('  no ballot differs: friends on and off give the same votes at every vote');
      neitherSeeds++;
    } else {
      ballotSeeds++;
      const a = on.votes[firstBallot], b = off.votes[firstBallot];
      const flipped = [];
      for (let k = 0; k < a.ballots.length; k++) if (a.ballots[k] !== b.ballots[k]) flipped.push(k);
      lines.push(`  first ballot change: tick ${a.tick}, "${a.ordinance}", ${flipped.length} resident(s) vote differently`);
      lines.push(`  friends on: ${a.yes} yes, ${a.no} no (${a.passed ? 'passes' : 'fails'}); friends off: ${b.yes} yes, ${b.no} no (${b.passed ? 'passes' : 'fails'})`);
      // The previous vote's ballots are the friends' "last vote" for this one.
      const prev = firstBallot > 0 ? on.votes[firstBallot - 1].ballots : null;
      for (const k of flipped.slice(0, 5)) {
        let fy = 0, fn = 0;
        if (prev) for (const f of on.gossip[k]) (prev[f] === 'Y' ? fy++ : fn++);
        lines.push(`    resident ${k}: to ${a.ballots[k] === 'Y' ? 'yes' : 'no'}; friends' last votes ${fy} yes, ${fn} no`);
      }
      if (flipped.length > 5) lines.push(`    ... and ${flipped.length - 5} more`);
    }
    if (firstOutcome === null) {
      lines.push('  outcome: the same pass or fail at every vote');
    } else {
      outcomeSeeds++;
      lines.push(`  first outcome change: vote ${firstOutcome} at tick ${on.votes[firstOutcome].tick}`);
    }
    console.log(lines.join('\n'));
  }
  if (seeds.length > 1) {
    console.log(`\n${seeds.length} seeds: ${ballotSeeds} with a ballot change, ${outcomeSeeds} with an outcome change, ${neitherSeeds} with no ballot change.`);
  }
}
