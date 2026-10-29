// Hunger check: why most residents are hungry most of the time.
// Per tick after tick 50: the share of residents hungry (food need under 0.3),
// the share walking, and the share of hungry residents who are walking to the
// market. Also the average market walk from a home. Run with: node hunger.js
const { createTown, step } = require('./core');
const map = require('./map');

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1).map((i) => 20261028 + i * 97);
const TICKS = 300;
let samples = 0, hungry = 0, walking = 0, hungryWalking = 0, hungryToMarket = 0, hungryZeroFood = 0;
let walkTotal = 0, walkN = 0, eats = 0, works = 0, rests = 0, socials = 0, gossips = 0;
let residentTicks = 0;
let stockMin = Infinity, stockMax = 0, stockSum = 0, stockN = 0, scarce = 0;
for (const seed of SEEDS) {
  const town = createTown(seed);
  // average home-to-market walk, for the record
  for (const r of town.residents.values()) {
    const p = map.findPath(town.map, r.home, r.spots.market);
    if (p) { walkTotal += p.length; walkN++; }
  }
  for (let i = 0; i < TICKS; i++) {
    step(town);
    if (town.tick < 50) continue;
    stockMin = Math.min(stockMin, town.stock.food); stockMax = Math.max(stockMax, town.stock.food); stockSum += town.stock.food; stockN++;
    if (town.stock.food < 1) scarce++;
    for (const r of town.residents.values()) {
      samples++;
      const isHungry = r.needs.food < 0.3;
      const isWalking = r.path.length > 0;
      if (isHungry) hungry++;
      if (isWalking) walking++;
      if (isHungry && isWalking) hungryWalking++;
      if (isHungry && r.plan && r.plan.action === 'eat') hungryToMarket++;
      if (r.needs.food <= 0.001) hungryZeroFood++;
      if (r.plan) {
        const a = r.plan.action;
        if (a === 'eat') eats++;
        else if (a === 'work') works++;
        else if (a === 'rest') rests++;
        else if (a === 'socialize') socials++;
        else if (a === 'gossip') gossips++;
      }
    }
  }
}
const pct = (x) => (100 * x / samples).toFixed(1) + '%';
console.log(`seeds ${SEEDS.length}, ticks 50-${TICKS}, resident-ticks ${samples}`);
console.log(`hungry (food < 0.3): ${pct(hungry)}`);
console.log(`  of hungry, walking: ${pct(hungryWalking)} of all; hungry heading to market: ${pct(hungryToMarket)} of all`);
console.log(`food at zero: ${pct(hungryZeroFood)}`);
console.log(`walking (any plan): ${pct(walking)}`);
console.log(`current plan share: eat ${pct(eats)}, work ${pct(works)}, rest ${pct(rests)}, socialize ${pct(socials)}, gossip ${pct(gossips)}`);
console.log(`stock after tick 50: min ${stockMin.toFixed(0)}, mean ${(stockSum/stockN).toFixed(0)}, max ${stockMax.toFixed(0)}, ticks under 1 food: ${scarce}`);
console.log(`average home to market walk: ${(walkTotal / walkN).toFixed(1)} steps`);
