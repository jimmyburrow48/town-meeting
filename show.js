// Print the town map with residents at a given tick. Usage: node show.js [ticks]
const { run } = require('./core');
const map = require('./map');
const ticks = Number(process.argv[2] || 100);
const town = run(20261028, ticks);
const at = [...town.residents.values()].map((r) => r.pos);
console.log(map.render(town.map, at));
const plans = {};
for (const r of town.residents.values()) plans[r.plan ? r.plan.action : 'idle'] = (plans[r.plan ? r.plan.action : 'idle'] || 0) + 1;
console.log(`tick ${town.tick}, food ${town.stock.food.toFixed(1)}, plans`, plans);
