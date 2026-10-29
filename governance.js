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

// A keyed draw in 0..1: derived from the town seed, a resident id (-1 for the town)
// and a text key, so the same key always gives the same number and it does not use
// up the main rng stream. Two configs of one town get the same draws for the same decision.
function keyedDraw(town, id, key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  const rng = seededRandom((town.seed ^ Math.imul(id + 1, 0x9e3779b1) ^ h) >>> 0);
  return rng();
}

// Fixed taste in -1..1 for one resident and one ordinance. It never changes between votes.
function taste(town, id, key) {
  return keyedDraw(town, id, key) * 2 - 1;
}

// record(type, actors, effects, causeEventId) appends an event and returns its id.
function governanceStep(town, record) {
  if (town.tick < FIRST_PROPOSAL || (town.tick - FIRST_PROPOSAL) % PERIOD !== 0) return;
  // The proposal and each resident's noise are keyed by the tick, so two configs vote on the same proposal with the same noise.
  const ord = ORDINANCES[Math.floor(keyedDraw(town, -1, `proposal:${town.tick}`) * ORDINANCES.length)];
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
      noise: (keyedDraw(town, id, `noise:${town.tick}:${ord.key}`) - 0.5) * NOISE,
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
