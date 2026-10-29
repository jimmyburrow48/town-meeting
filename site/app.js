// Town Meeting M5: plays back the baked towns in site/towns.json.
// M6: a typed seed is run once by TownSim (sim.bundle.js) into the same frames, then played back the same way.
(function () {
  const CELL = 26;
  const MAX_SEED = 4294967295; // the sim's rng reads a 32-bit seed, so only 0 to this value is a real seed
  const COLORS = {
    '#': '#5b4a3a', '.': '#efe3c8', M: '#e8c77a', ',': '#c9dd9a', '=': '#f2d7a6',
  };
  const BLOC = { '0': '#8a8478', '1': '#3f8f5a', '2': '#c0534a' };

  const canvas = document.getElementById('map');
  const ctx = canvas.getContext('2d');
  const townSelect = document.getElementById('town');
  const playBtn = document.getElementById('play');
  const speedSel = document.getElementById('speed');
  const replayBtn = document.getElementById('replay');
  const seedInput = document.getElementById('seed');
  const seedMsg = document.getElementById('seedmsg');
  const newBtn = document.getElementById('new');
  const storyOnly = document.getElementById('story');
  const scrub = document.getElementById('scrub');
  const tickLabel = document.getElementById('tick');
  const log = document.getElementById('log');
  const el = { food: document.getElementById('food'), yea: document.getElementById('yea'), nay: document.getElementById('nay') };

  let data = null;
  let town = null;
  let tick = 0;
  let timer = null;
  let customIndex = null; // index in data.towns of the town made from a typed seed
  let customOpt = null;

  // Each resident gets a fixed offset inside its cell, so crowds stay readable.
  function offset(i) {
    const a = ((i * 37) % 7) / 6 - 0.5;
    const b = ((i * 91) % 7) / 6 - 0.5;
    return [a * 0.6, b * 0.6];
  }

  function drawMap() {
    const rows = town.map;
    const w = rows[0].length;
    const h = rows.length;
    canvas.width = w * CELL;
    canvas.height = h * CELL;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        ctx.fillStyle = COLORS[rows[y][x]];
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
    const f = data.frames[tick];
    const faction = f.f;
    for (let i = 0; i < town.residents; i++) {
      const x = f.p[i * 2];
      const y = f.p[i * 2 + 1];
      const [ox, oy] = offset(i);
      ctx.fillStyle = BLOC[faction[i]];
      ctx.beginPath();
      ctx.arc((x + 0.5 + ox) * CELL, (y + 0.5 + oy) * CELL, CELL * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawStats() {
    const f = data.frames[tick];
    let yea = 0;
    let nay = 0;
    for (const c of f.f) {
      if (c === '1') yea++;
      else if (c === '2') nay++;
    }
    el.food.textContent = f.food;
    el.yea.textContent = yea;
    el.nay.textContent = nay;
    tickLabel.textContent = `tick ${tick} of ${data.ticks}`;
    scrub.value = tick;
  }

  // The story types: votes, laws, factions and proposals. The rest (hunger, trust, grudges) is the background.
  const STORY = new Set(['proposal', 'vote_result', 'ordinance_passed', 'faction_formed', 'faction_shift']);

  // The chronicle shows events up to the current tick, newest first. Votes and laws are bold.
  // With the story filter on (the default), hunger and trust lines are hidden, so the end of a town is not a list of "goes hungry".
  function drawLog() {
    const pool = storyOnly.checked ? town.events.filter((e) => STORY.has(e.type)) : town.events;
    const shown = pool.filter((e) => e.tick <= tick).slice(-60).reverse();
    log.textContent = '';
    if (shown.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      // Under the story filter the first vote comes at tick 30 (governance.js: a proposal every 60 ticks from tick 30).
      empty.textContent = storyOnly.checked && tick > 0
        ? 'No votes or laws yet. The first proposal comes at tick 30; uncheck the filter to see the daily life.'
        : 'Nothing has happened yet. Press Play to start the town.';
      log.appendChild(empty);
    }
    for (const e of shown) {
      const li = document.createElement('li');
      if (e.type === 'vote_result' || e.type === 'ordinance_passed' || e.type === 'faction_formed') li.className = 'key';
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = `[${e.tick}]`;
      li.appendChild(t);
      li.appendChild(document.createTextNode(e.text.replace(/^\[tick \d+\] /, '')));
      log.appendChild(li);
    }
  }

  function render() {
    drawMap();
    drawStats();
    drawLog();
  }

  function setTick(t) {
    tick = Math.max(0, Math.min(data.ticks, t));
    render();
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    playBtn.textContent = 'Play';
  }

  function play() {
    if (tick >= data.ticks) setTick(0);
    playBtn.textContent = 'Pause';
    timer = setInterval(() => {
      if (tick >= data.ticks) { stop(); return; }
      setTick(tick + 1);
    }, 1000 / Number(speedSel.value) / 4);
  }

  function loadTown(index) {
    stop();
    const raw = data.towns[index];
    town = { name: raw.name, map: raw.map, residents: raw.residents, events: raw.events };
    // frames are kept on data.towns[index]; expose them under the same name the draw code uses.
    data.frames = raw.frames;
    data.ticks = raw.frames.length - 1;
    scrub.max = data.ticks;
    setTick(0);
  }

  // Only whole numbers from 0 to MAX_SEED are seeds. Anything else is refused, never mapped to another seed.
  function parseSeed(text) {
    const s = text.trim();
    if (!/^\d{1,10}$/.test(s)) return null;
    const n = Number(s);
    return n <= MAX_SEED ? n : null;
  }

  function newTown() {
    if (!data) { seedMsg.textContent = 'Still loading the towns. Try again in a moment.'; return; }
    const seed = parseSeed(seedInput.value);
    if (seed === null) {
      seedMsg.textContent = 'Use a whole number from 0 to 4294967295, for example 20261028. The town on screen did not change.';
      return;
    }
    seedInput.value = String(seed); // show the seed as it will be used, so the town can be reproduced
    seedMsg.textContent = `Making town ${seed}...`;
    stop();
    // A short delay lets the message paint before the sim runs (about 50 to 80 ms in a desktop browser).
    setTimeout(() => {
      const made = TownSim.bake(seed, 'Your town', data.ticks, 150);
      if (customIndex === null) {
        customIndex = data.towns.length;
        data.towns.push(made);
        customOpt = document.createElement('option');
        customOpt.value = String(customIndex);
        townSelect.appendChild(customOpt);
      } else {
        data.towns[customIndex] = made;
      }
      customOpt.textContent = `Your town (seed ${seed})`;
      townSelect.value = String(customIndex);
      loadTown(customIndex);
      seedMsg.textContent = `Playing seed ${seed}. The same seed gives the same town every time.`;
    }, 20);
  }

  playBtn.addEventListener('click', () => (timer ? stop() : play()));
  replayBtn.addEventListener('click', () => { stop(); setTick(0); play(); });
  newBtn.addEventListener('click', newTown);
  seedInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') newTown(); });
  storyOnly.addEventListener('change', () => render());
  scrub.addEventListener('input', () => { stop(); setTick(Number(scrub.value)); });
  townSelect.addEventListener('change', () => loadTown(Number(townSelect.value)));
  speedSel.addEventListener('change', () => { if (timer) { stop(); play(); } });

  fetch('towns.json')
    .then((r) => r.json())
    .then((json) => {
      // A copy, so a typed town is added to the page's list without touching the fetched towns.
      data = { ticks: json.ticks, towns: json.towns.slice(), frames: null };
      json.towns.forEach((t, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `${t.name} (seed ${t.seed})`;
        townSelect.appendChild(opt);
      });
      loadTown(0);
    })
    .catch((err) => {
      log.textContent = `Could not load towns.json: ${err}`;
    });
})();
