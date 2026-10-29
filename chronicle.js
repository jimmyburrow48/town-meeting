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
