// Feedback-loop check: per vote, how many residents switch their vote, how many
// of those come from the friends term, and what happens after a lopsided vote.
// Run with: node fl.js. Each weight runs in its own process (W_SOCIAL is read at require time).
const { execFileSync } = require('child_process');
const path = require('path');

if (process.argv[2] !== undefined) {
  const { createTown, step } = require('./core');
  const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1).map((i) => 20261028 + i * 97);
  const TICKS = 300;
  let votes = 0, switches = 0, socialFlips = 0, sameAsPrev = 0, pairs = 0;
  let finalMin = [], lopsided = 0, nextMinority = 0, nextCount = 0, minorityTotal = 0, minorityN = 0;
  for (const seed of SEEDS) {
    const town = createTown(seed);
    let prevLast = null, prevOutcome = null, prevMinorityShare = null;
    for (let i = 0; i < TICKS; i++) {
      step(town);
      const ev = town.events[town.events.length - 1];
      // the last event of a vote tick is the vote_result (or a later faction/ordinance event)
      const vr = [...town.events].reverse().find((e) => e.type === 'vote_result' && e.tick === town.tick);
      if (!vr) continue;
      const N = town.residents.size;
      const last = [...town.residents.values()].map((r) => r.lastVote);
      votes++;
      const minority = Math.min(vr.effects.yes, vr.effects.no) / N;
      minorityTotal += minority; minorityN++;
      if (prevLast) {
        let sw = 0;
        for (let k = 0; k < N; k++) if (last[k] !== prevLast[k]) sw++;
        switches += sw;
        // social flips reported by governance for this vote
        socialFlips += vr.effects.flips.social;
        const outcome = vr.effects.passed;
        pairs++;
        if (outcome === prevOutcome) sameAsPrev++;
        if (prevMinorityShare !== null && prevMinorityShare <= 0.2) {
          lopsided++; nextMinority += minority; nextCount++;
        }
        prevOutcome = outcome;
      } else {
        prevOutcome = vr.effects.passed;
      }
      prevLast = last;
      prevMinorityShare = minority;
    }
  }
  for (const seed of SEEDS) { const t = createTown(seed); for (let i = 0; i < TICKS; i++) step(t); const c = { Yea: 0, Nay: 0 }; for (const r of t.residents.values()) if (r.faction) c[r.faction]++; finalMin.push(Math.min(c.Yea, c.Nay) / t.residents.size); }
  console.log(JSON.stringify({
    finalMinorityBlocAvg: +(finalMin.reduce((a, b) => a + b, 0) / finalMin.length).toFixed(3),
    finalMinorityBlocUnder10pct: finalMin.filter((x) => x < 0.1).length,
    votes,
    switchPerVote: +(switches / (votes - SEEDS.length)).toFixed(1),
    socialFlipPerVote: +(socialFlips / (votes - SEEDS.length)).toFixed(1),
    sameOutcomeAsPrev: +(sameAsPrev / pairs).toFixed(2),
    avgMinority: +(minorityTotal / minorityN).toFixed(3),
    lopsidedVotes: lopsided,
    minorityAfterLopsided: nextCount ? +(nextMinority / nextCount).toFixed(3) : null,
  }));
} else {
  for (const w of [0, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5]) {
    const out = execFileSync(process.execPath, [path.join(__dirname, 'fl.js'), 'child'], {
      env: { ...process.env, TM_W_SOCIAL: String(w) },
    });
    console.log(`W_SOCIAL=${w}`, out.toString().trim());
  }
}
