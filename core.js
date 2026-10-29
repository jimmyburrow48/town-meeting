// Town Meeting - M1 headless core, M2 map and pathing.
// Plain JavaScript, no dependencies. Same seed + same ticks = same town.
const { seededRandom } = require('./rng');
const mapTools = require('./map');
const { governanceStep } = require('./governance');

const SYLLABLES = ['ba', 'lo', 'ri', 'ka', 'mo', 'ten', 'ver', 'su', 'pe', 'han', 'ol', 'dri'];
// M8 food balance, in food stock per resident. Below LOW, hungry residents go to
// the fields instead of the market. Above HIGH, fed residents rest instead of farming.
const FOOD_LOW = 0.6;
const FOOD_HIGH = 3;

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
    const food = town.stock.food;
    const residents = town.residents.size;
    if (r.needs.food < 0.3) {
      // Hungry. When the stock is low, go to the fields to grow food instead of
      // walking to an empty market. An empty market is a scarcity event.
      if (food < FOOD_LOW * residents) action = 'work';
      else action = 'eat';
      if (food < 1) recordEvent(town, 'scarcity', [id], { resident: id, food_stock: Number(food.toFixed(2)) });
    }
    else if (r.needs.rest < 0.3) action = 'rest';
    else if (r.needs.social < 0.4) action = 'socialize';
    else if (rng() < 0.2) action = 'gossip';
    else if (food > FOOD_HIGH * residents) action = 'rest'; // plenty in the stores: no need to farm
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
      // The harvest shrinks as the stores fill, so walks already under way
      // do not overshoot the high-water mark.
      const fill = Math.max(0, 1 - town.stock.food / (FOOD_HIGH * town.residents.size));
      town.stock.food += (4 + r.traits.sociability * 0.5) * fill;
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
