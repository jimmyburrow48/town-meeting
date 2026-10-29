// Counterfactual: how much does the friends term (W_SOCIAL) change votes and factions?
// Run with: node cf.js. Each weight runs in its own process, because W_SOCIAL is read at require time.
const { execFileSync } = require('child_process');
const path = require('path');

if (process.argv[2] !== undefined) {
  // Child mode: print the stats for the weight in TM_W_SOCIAL.
  const { run } = require('./core');
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => 20261028 + i * 97);
  const TICKS = 300;
  let votes = 0, minorityTotal = 0, unanimous = 0, shifts = 0, shiftPeople = 0, passed = 0;
  for (const seed of SEEDS) {
    const town = run(seed, TICKS);
    for (const e of town.events) {
      if (e.type === 'vote_result') {
        votes++;
        const minority = Math.min(e.effects.yes, e.effects.no);
        minorityTotal += minority;
        if (minority === 0) unanimous++;
        if (e.effects.passed) passed++;
      }
      if (e.type === 'faction_shift') { shifts++; shiftPeople += e.actors.length; }
    }
  }
  console.log(JSON.stringify({
    votes,
    passed,
    unanimous,
    avgMinority: +(minorityTotal / votes).toFixed(1),
    factionShifts: shifts,
    peopleShifted: shiftPeople,
  }));
} else {
  for (const w of [0.25, 0, 0.5]) {
    const out = execFileSync(process.execPath, [path.join(__dirname, 'cf.js'), 'child'], {
      env: { ...process.env, TM_W_SOCIAL: String(w) },
    });
    console.log(`W_SOCIAL=${w}`, out.toString().trim());
  }
}
