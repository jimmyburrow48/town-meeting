// Town Meeting M6: turn a town into playback frames. Shared by build-site.js (baked towns) and the browser (typed seeds).
// The page plays these frames and never runs the sim itself, so the baked towns and a typed seed look the same.
const { createTown, step, map } = require('./core');
const { chronicle } = require('./chronicle');

// Zone letters: M market, , field, = square, . other open ground, # wall.
function encodeMap(m) {
  let rows = [];
  for (let y = 0; y < m.h; y++) {
    let row = '';
    for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      if (m.cells[i] === map.WALL) row += '#';
      else if (m.zone[i] === 'market') row += 'M';
      else if (m.zone[i] === 'field') row += ',';
      else if (m.zone[i] === 'square') row += '=';
      else row += '.';
    }
    rows.push(row);
  }
  return rows;
}

// Run a town for `ticks` ticks and record one frame per state (frame 0 is the start).
function bake(seed, name, ticks, population = 150) {
  const town = createTown(seed, population);
  const ids = [...town.residents.keys()];
  const frames = [];
  // Frame t is the state after t ticks: flat positions plus a faction code (0 none, 1 Yea, 2 Nay) per resident.
  const record = () => {
    const p = [];
    let f = '';
    for (const id of ids) {
      const r = town.residents.get(id);
      p.push(r.pos.x, r.pos.y);
      f += r.faction === 'Yea' ? '1' : r.faction === 'Nay' ? '2' : '0';
    }
    frames.push({ p, f, food: Number(town.stock.food.toFixed(1)) });
  };
  record();
  for (let t = 0; t < ticks; t++) {
    step(town);
    record();
  }
  const events = chronicle(town).map((line, i) => ({ tick: town.events[i].tick, type: town.events[i].type, text: line }));
  return {
    seed,
    name,
    map: encodeMap(town.map),
    residents: ids.length,
    frames,
    events,
  };
}

module.exports = { bake, encodeMap };
