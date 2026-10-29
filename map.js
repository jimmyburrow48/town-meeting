// Town Meeting - M2 map and pathing.
// Plain JavaScript, no dependencies. The map uses its own RNG stream,
// so adding it does not change who the residents are.
const { seededRandom } = require('./rng');

const SIZE = 24;
const MAP_SALT = 0x6d617073;
const WALL = 1;
const OPEN = 0;
// 4-neighbour moves, in a fixed order so paths are deterministic.
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const cellIndex = (x, y, w) => y * w + x;
const inBox = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

// BFS over open cells from one start cell. Returns a Uint8Array of reached cells.
function floodFill(cells, w, h, start) {
  const reached = new Uint8Array(w * h);
  const queue = [start];
  reached[start] = 1;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = cellIndex(nx, ny, w);
      if (cells[j] === WALL || reached[j]) continue;
      reached[j] = 1;
      queue.push(j);
    }
  }
  return reached;
}

// Build the town map: square in the middle, a market top-left, fields along the
// bottom, and scattered walls (ponds, hedges). Every open cell is reachable from
// the square; sealed pockets are turned into walls.
function makeMap(seed, size = SIZE) {
  const rng = seededRandom((seed ^ MAP_SALT) >>> 0);
  const w = size;
  const h = size;
  const mid = Math.floor(size / 2);
  const cells = new Uint8Array(w * h);
  const zone = new Array(w * h).fill(null);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = cellIndex(x, y, w);
      if (inBox(x, y, mid - 1, mid - 1, mid + 1, mid + 1)) zone[i] = 'square';
      else if (inBox(x, y, 3, 3, 6, 5)) zone[i] = 'market';
      else if (y >= h - 4 && x >= 3 && x <= w - 4) zone[i] = 'field';
    }
  }

  for (let i = 0; i < w * h; i++) {
    if (!zone[i] && rng() < 0.14) cells[i] = WALL;
  }

  const reached = floodFill(cells, w, h, cellIndex(mid, mid, w));
  for (let i = 0; i < w * h; i++) {
    if (cells[i] === OPEN && !reached[i]) cells[i] = WALL;
  }

  const houses = [];
  const markets = [];
  const fields = [];
  const squares = [];
  for (let i = 0; i < w * h; i++) {
    if (cells[i] === WALL) continue;
    const pos = { x: i % w, y: Math.floor(i / w) };
    if (zone[i] === 'market') markets.push(pos);
    else if (zone[i] === 'field') fields.push(pos);
    else if (zone[i] === 'square') squares.push(pos);
    else houses.push(pos);
  }

  return { w, h, cells, zone, square: { x: mid, y: mid }, squares, markets, fields, houses };
}

function isWalkable(map, x, y) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  return map.cells[cellIndex(x, y, map.w)] === OPEN;
}

// A* on the grid with a Manhattan heuristic. Returns the list of steps after
// the start (empty if already there), or null if no path exists.
function findPath(map, from, to) {
  if (!isWalkable(map, to.x, to.y) || !isWalkable(map, from.x, from.y)) return null;
  const { w, h } = map;
  const n = w * h;
  const start = cellIndex(from.x, from.y, w);
  const goal = cellIndex(to.x, to.y, w);
  if (start === goal) return [];

  const g = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open = [start];
  const h0 = (i) => Math.abs((i % w) - to.x) + Math.abs(Math.floor(i / w) - to.y);
  g[start] = 0;

  while (open.length) {
    // Pick the lowest f; ties go to the lower cell index so results are stable.
    let best = 0;
    for (let k = 1; k < open.length; k++) {
      const a = open[k];
      const b = open[best];
      const fa = g[a] + h0(a);
      const fb = g[b] + h0(b);
      if (fa < fb || (fa === fb && a < b)) best = k;
    }
    const cur = open[best];
    open.splice(best, 1);
    if (cur === goal) break;
    closed[cur] = 1;

    const x = cur % w;
    const y = Math.floor(cur / w);
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkable(map, nx, ny)) continue;
      const j = cellIndex(nx, ny, w);
      if (closed[j]) continue;
      const ng = g[cur] + 1;
      if (ng < g[j]) {
        g[j] = ng;
        came[j] = cur;
        if (!open.includes(j)) open.push(j);
      }
    }
  }

  if (came[goal] === -1) return null;
  const steps = [];
  for (let i = goal; i !== start; i = came[i]) steps.push({ x: i % w, y: Math.floor(i / w) });
  return steps.reverse();
}

// Render the map as text. Residents can be marked by a list of positions.
function render(map, marks = []) {
  const rows = [];
  for (let y = 0; y < map.h; y++) {
    let row = '';
    for (let x = 0; x < map.w; x++) {
      const i = cellIndex(x, y, map.w);
      let ch = map.cells[i] === WALL ? '#' : '.';
      if (map.cells[i] === OPEN && map.zone[i] === 'market') ch = 'M';
      if (map.cells[i] === OPEN && map.zone[i] === 'field') ch = ',';
      if (map.cells[i] === OPEN && map.zone[i] === 'square') ch = '=';
      if (marks.some((p) => p.x === x && p.y === y)) ch = '@';
      row += ch;
    }
    rows.push(row);
  }
  return rows.join('\n');
}

module.exports = { SIZE, WALL, OPEN, makeMap, isWalkable, findPath, floodFill, render };
