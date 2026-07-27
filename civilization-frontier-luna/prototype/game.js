(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const ui = Object.fromEntries([
    "startButton", "resetButton", "pauseButton", "speedButton", "settlementButton", "farmButton", "academyButton",
    "eraValue", "populationValue", "territoryValue", "scoreValue", "foodValue", "materialsValue", "knowledgeValue",
    "foodMeter", "materialsMeter", "knowledgeMeter", "statusBadge", "hintText", "worldPhaseValue", "worldProgress",
    "worldDescription", "eventLog", "mapToast"
  ].map(id => [id, document.getElementById(id)]));

  const COLS = 70;
  const ROWS = 43;
  const COLORS = ["#d9b15d", "#78a6d0", "#c67d6b", "#8fc18d", "#a78bd4", "#d58aac", "#79bdb5", "#d99b63", "#91a7d2", "#b9bf70"];
  const ERA_NAMES = ["Nomadic", "Agricultural", "Ancient"];
  const ERA_THRESHOLDS = [0, 95, 260];
  const WORLD_PHASES = [
    { name: "Foundations", at: 0, open: 0.58, text: "The central world is open. Frontier regions remain closed." },
    { name: "Migration", at: 65, open: 0.79, text: "New migration corridors are available. Exiles gain more possible return sites." },
    { name: "Known World", at: 145, open: 1.0, text: "Every region is now open. The final age of the match has begun." }
  ];

  let state;
  let raf;
  let lastFrame = performance.now();
  let accumulator = 0;
  const tickMs = 250;

  function rng(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function noiseMap(random) {
    const land = new Array(COLS * ROWS).fill(false);
    const height = new Array(COLS * ROWS).fill(0);
    const centers = [
      [0.34, 0.49, 0.27], [0.57, 0.43, 0.22], [0.72, 0.59, 0.18], [0.18, 0.66, 0.14], [0.83, 0.28, 0.12]
    ];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        let h = 0;
        for (const [cx, cy, radius] of centers) {
          const dx = x / COLS - cx;
          const dy = y / ROWS - cy;
          const d = Math.sqrt(dx * dx + dy * dy);
          h = Math.max(h, 1 - d / radius);
        }
        h += (random() - .5) * .25;
        const i = y * COLS + x;
        height[i] = h;
        land[i] = h > .13;
      }
    }
    // Soften isolated holes and islands.
    for (let pass = 0; pass < 2; pass++) {
      const copy = land.slice();
      for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
        const i = y * COLS + x;
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (dx || dy) neighbors += copy[(y + dy) * COLS + x + dx] ? 1 : 0;
        }
        if (neighbors >= 5) land[i] = true;
        if (neighbors <= 2) land[i] = false;
      }
    }
    return { land, height };
  }

  function createState() {
    const seed = Math.floor(Math.random() * 1e9);
    const random = rng(seed);
    const map = noiseMap(random);
    const cells = map.land.map((isLand, i) => ({
      land: isLand,
      owner: -1,
      structure: null,
      biome: isLand ? (map.height[i] > .62 ? "stone" : random() > .58 ? "fertile" : "plain") : "water"
    }));
    return {
      seed, random, cells, players: [], selectedSpawn: -1, started: false, paused: false, speed: 1,
      elapsed: 0, currentPhase: 0, targetCell: -1, playerId: 0, gameOver: false, toastTimer: 0,
      worldMedianEra: 0
    };
  }

  function createPlayer(id, name, human, color) {
    return {
      id, name, human, color, alive: true, exiled: false, respawns: 1, exileUntil: 0, protectionUntil: 0,
      food: 92, materials: 74, knowledge: 0, population: 44, era: 0, capital: -1, lastTarget: -1,
      structures: { settlement: 0, farm: 0, academy: 0 }, aggression: human ? .5 : .25 + state.random() * .65,
      growthBias: human ? .5 : .35 + state.random() * .55, score: 0
    };
  }

  function cellXY(i) { return [i % COLS, Math.floor(i / COLS)]; }
  function idx(x, y) { return y * COLS + x; }
  function neighbors(i) {
    const [x, y] = cellXY(i);
    const out = [];
    if (x > 0) out.push(i - 1);
    if (x < COLS - 1) out.push(i + 1);
    if (y > 0) out.push(i - COLS);
    if (y < ROWS - 1) out.push(i + COLS);
    return out;
  }

  function phaseOpenAt(cellIndex, phase = state.currentPhase) {
    if (!state.cells[cellIndex].land) return false;
    const [x, y] = cellXY(cellIndex);
    const nx = x / (COLS - 1);
    const ny = y / (ROWS - 1);
    const distance = Math.hypot(nx - .48, ny - .5);
    return distance <= WORLD_PHASES[phase].open * .72;
  }

  function validSpawn(i, playerId = -1) {
    if (i < 0 || !phaseOpenAt(i) || state.cells[i].owner !== -1) return false;
    for (const p of state.players) {
      if (!p.alive || p.id === playerId || p.capital < 0) continue;
      const [ax, ay] = cellXY(i), [bx, by] = cellXY(p.capital);
      if (Math.hypot(ax - bx, ay - by) < 5.5) return false;
    }
    return neighbors(i).filter(n => state.cells[n].land).length >= 2;
  }

  function claimStart(player, cellIndex, returning = false) {
    player.capital = cellIndex;
    player.alive = true;
    player.exiled = false;
    player.food = returning ? 58 : 92;
    player.materials = returning ? 42 : 74;
    player.population = returning ? 28 : 44;
    player.knowledge = returning ? Math.max(0, ERA_THRESHOLDS[Math.max(0, state.worldMedianEra - 1)] + 5) : 0;
    player.era = returning ? Math.max(0, state.worldMedianEra - 1) : 0;
    player.protectionUntil = returning ? state.elapsed + 12 : state.elapsed + 5;
    state.cells[cellIndex].owner = player.id;
    state.cells[cellIndex].structure = "capital";
    for (const n of neighbors(cellIndex)) {
      if (state.cells[n].land && state.cells[n].owner === -1 && phaseOpenAt(n)) state.cells[n].owner = player.id;
    }
  }

  function spawnBots(count) {
    for (let id = 1; id <= count; id++) {
      const bot = createPlayer(id, ["Aster", "Brann", "Cyrene", "Doran", "Elyra", "Faro", "Galen", "Hadria", "Iona", "Jorah", "Kara", "Lumen"][id - 1] || `Realm ${id}`, false, COLORS[id % COLORS.length]);
      state.players.push(bot);
      const candidates = state.cells.map((_, i) => i).filter(i => validSpawn(i));
      if (candidates.length) claimStart(bot, candidates[Math.floor(state.random() * candidates.length)]);
    }
  }

  function logEvent(text, important = false) {
    const li = document.createElement("li");
    const minutes = Math.floor(state.elapsed / 60).toString().padStart(2, "0");
    const seconds = Math.floor(state.elapsed % 60).toString().padStart(2, "0");
    li.innerHTML = `<time>${minutes}:${seconds}</time>${important ? "<strong>" : ""}${text}${important ? "</strong>" : ""}`;
    ui.eventLog.prepend(li);
    while (ui.eventLog.children.length > 18) ui.eventLog.lastChild.remove();
  }

  function toast(text) {
    ui.mapToast.textContent = text;
    ui.mapToast.classList.remove("hidden");
    state.toastTimer = 3.5;
  }

  function setup() {
    cancelAnimationFrame(raf);
    state = createState();
    state.players.push(createPlayer(0, "You", true, COLORS[0]));
    ui.eventLog.innerHTML = "";
    ui.startButton.disabled = true;
    ui.startButton.textContent = "Begin history";
    ui.pauseButton.textContent = "Pause";
    ui.speedButton.textContent = "Speed ×1";
    ui.statusBadge.textContent = "Choose a founding tile";
    ui.hintText.textContent = "Click a bright land tile. Crowded areas create faster conflict; quiet edges offer safer growth.";
    updateUI();
    lastFrame = performance.now();
    accumulator = 0;
    raf = requestAnimationFrame(frame);
  }

  function startGame() {
    if (state.started || state.selectedSpawn < 0) return;
    claimStart(state.players[0], state.selectedSpawn);
    spawnBots(9);
    state.started = true;
    state.selectedSpawn = -1;
    ui.startButton.disabled = true;
    logEvent("Your people founded their first homeland.", true);
    toast("History begins");
  }

  function territoryOf(playerId) {
    const out = [];
    for (let i = 0; i < state.cells.length; i++) if (state.cells[i].owner === playerId) out.push(i);
    return out;
  }

  function borderCandidates(playerId) {
    const set = new Set();
    for (const i of territoryOf(playerId)) for (const n of neighbors(i)) {
      if (phaseOpenAt(n) && state.cells[n].land && state.cells[n].owner !== playerId) set.add(n);
    }
    return [...set];
  }

  function visibleCells(playerId) {
    const visible = new Set();
    for (const i of territoryOf(playerId)) {
      visible.add(i);
      for (const n of neighbors(i)) {
        visible.add(n);
        for (const n2 of neighbors(n)) visible.add(n2);
      }
    }
    return visible;
  }

  function economy(player, dt) {
    if (!player.alive) return;
    const territory = territoryOf(player.id);
    let fertile = 0, stone = 0;
    for (const i of territory) {
      if (state.cells[i].biome === "fertile") fertile++;
      if (state.cells[i].biome === "stone") stone++;
    }
    const farms = player.structures.farm;
    const settlements = player.structures.settlement;
    const academies = player.structures.academy;
    player.food += dt * (0.12 * territory.length + .3 * fertile + 1.25 * farms + .08 * player.population);
    player.materials += dt * (0.08 * territory.length + .34 * stone + .7 * settlements);
    player.knowledge += dt * (.07 * settlements + .15 * player.era + 1.05 * academies + .025 * territory.length);
    const capacity = 36 + territory.length * (3.2 + player.era * .75) + settlements * 28;
    if (player.food > player.population * .18) {
      const growth = dt * (.18 + player.era * .07 + farms * .12) * Math.max(.2, 1 - player.population / Math.max(1, capacity));
      player.population += growth;
      player.food -= growth * .24;
    } else {
      player.population = Math.max(1, player.population - dt * .1);
    }
    const nextEra = player.era + 1;
    if (nextEra < ERA_NAMES.length && player.knowledge >= ERA_THRESHOLDS[nextEra]) {
      player.era = nextEra;
      if (player.human) {
        logEvent(`Your civilization entered the ${ERA_NAMES[nextEra]} era.`, true);
        toast(`${ERA_NAMES[nextEra]} era`);
      } else if (nextEra === 2) {
        logEvent(`${player.name} entered the Ancient era.`);
      }
    }
  }

  function expand(player, target) {
    if (!player.alive || target < 0 || !phaseOpenAt(target) || !state.cells[target].land) return false;
    if (!neighbors(target).some(n => state.cells[n].owner === player.id)) return false;
    const defenderId = state.cells[target].owner;
    if (defenderId === player.id) return false;
    if (defenderId === -1) {
      const cost = 5.5 + territoryOf(player.id).length * .018;
      if (player.food < cost || player.population < 5) return false;
      player.food -= cost;
      player.population -= .25;
      state.cells[target].owner = player.id;
      return true;
    }
    const defender = state.players[defenderId];
    if (!defender || !defender.alive || state.elapsed < player.protectionUntil || state.elapsed < defender.protectionUntil) return false;
    const attack = Math.min(player.population * .11, 16 + player.era * 5);
    const defenseStructure = state.cells[target].structure ? 1.35 : 1;
    const defense = Math.min(defender.population * .075, 13 + defender.era * 5) * defenseStructure;
    if (attack < 2 || player.food < 7) return false;
    player.population = Math.max(1, player.population - attack * .55);
    defender.population = Math.max(0, defender.population - attack * .6);
    player.food -= 7;
    if (attack * (.78 + state.random() * .42) > defense) {
      state.cells[target].owner = player.id;
      if (state.cells[target].structure === "capital") state.cells[target].structure = "ruins";
    }
    return true;
  }

  function build(player, type) {
    if (!player.alive) return;
    const rules = {
      settlement: { cost: 45, era: 0 },
      farm: { cost: 35, era: 1 },
      academy: { cost: 70, era: 2 }
    }[type];
    if (!rules || player.era < rules.era || player.materials < rules.cost) return;
    const candidates = territoryOf(player.id).filter(i => !state.cells[i].structure);
    if (!candidates.length) return;
    candidates.sort((a, b) => {
      const favored = type === "farm" ? "fertile" : type === "settlement" ? "plain" : "stone";
      return (state.cells[b].biome === favored ? 1 : 0) - (state.cells[a].biome === favored ? 1 : 0);
    });
    const tile = candidates[0];
    player.materials -= rules.cost;
    player.structures[type]++;
    state.cells[tile].structure = type;
    if (player.human) logEvent(`Built a ${type}.`);
  }

  function botStep(bot) {
    if (!bot.alive) {
      if (bot.exiled && bot.respawns > 0 && state.elapsed >= bot.exileUntil && state.currentPhase < 2) {
        const candidates = state.cells.map((_, i) => i).filter(i => validSpawn(i, bot.id));
        if (candidates.length) {
          bot.respawns--;
          claimStart(bot, candidates[Math.floor(state.random() * candidates.length)], true);
          logEvent(`${bot.name} returned from exile.`);
        }
      }
      return;
    }
    if (bot.era >= 1 && bot.materials > 65 && bot.structures.farm < 2 + bot.era) build(bot, "farm");
    if (bot.materials > 82 && bot.structures.settlement < 1 + bot.era) build(bot, "settlement");
    if (bot.era >= 2 && bot.materials > 105 && bot.structures.academy < 2) build(bot, "academy");
    const candidates = borderCandidates(bot.id);
    if (!candidates.length) return;
    const hostile = candidates.filter(i => state.cells[i].owner >= 0);
    let target;
    if (hostile.length && state.random() < bot.aggression) {
      hostile.sort((a, b) => {
        const pa = state.players[state.cells[a].owner];
        const pb = state.players[state.cells[b].owner];
        return (pa?.population || 0) - (pb?.population || 0);
      });
      target = hostile[0];
    } else {
      const neutral = candidates.filter(i => state.cells[i].owner === -1);
      if (neutral.length) {
        neutral.sort((a, b) => {
          const va = state.cells[a].biome === "fertile" ? 2 : state.cells[a].biome === "stone" ? 1 : 0;
          const vb = state.cells[b].biome === "fertile" ? 2 : state.cells[b].biome === "stone" ? 1 : 0;
          return vb - va;
        });
        target = neutral[Math.floor(state.random() * Math.min(4, neutral.length))];
      }
    }
    if (target !== undefined) expand(bot, target);
  }

  function eliminateIfNeeded(player) {
    if (!player.alive) return;
    const territory = territoryOf(player.id);
    if (territory.length && player.population > .5) return;
    player.alive = false;
    player.exiled = player.respawns > 0 && state.currentPhase < 2;
    player.exileUntil = state.elapsed + (player.human ? 8 : 10 + state.random() * 8);
    if (player.human) {
      if (player.exiled) {
        logEvent("Your civilization fell. A surviving people can return once the exile timer ends.", true);
        toast("Exile — one return remains");
      } else {
        logEvent("Your civilization has left history.", true);
      }
    } else logEvent(`${player.name} collapsed${player.exiled ? " and entered exile" : ""}.`);
  }

  function updateWorldPhase() {
    let next = state.currentPhase;
    for (let i = 0; i < WORLD_PHASES.length; i++) if (state.elapsed >= WORLD_PHASES[i].at) next = i;
    if (next !== state.currentPhase) {
      state.currentPhase = next;
      logEvent(`${WORLD_PHASES[next].name}: additional regions are now available.`, true);
      toast(`${WORLD_PHASES[next].name} begins`);
    }
  }

  function updateMedianEra() {
    const eras = state.players.filter(p => p.alive).map(p => p.era).sort();
    state.worldMedianEra = eras.length ? eras[Math.floor(eras.length / 2)] : 0;
  }

  function tick(dt) {
    if (!state.started || state.paused || state.gameOver) return;
    state.elapsed += dt;
    updateWorldPhase();
    updateMedianEra();
    for (const p of state.players) economy(p, dt);
    for (const bot of state.players.filter(p => !p.human)) {
      if (state.random() < .5 * dt) botStep(bot);
    }
    const human = state.players[0];
    if (human.alive && state.targetCell >= 0 && state.random() < 1.5 * dt) expand(human, state.targetCell);
    if (human.exiled && human.respawns > 0 && state.elapsed >= human.exileUntil) {
      ui.statusBadge.textContent = "Choose a return site";
      ui.hintText.textContent = "Your people survived. Click a valid neutral tile in any open region to return with reduced strength.";
    }
    for (const p of state.players) eliminateIfNeeded(p);
    for (const p of state.players) {
      p.score = Math.round(territoryOf(p.id).length * 3 + p.population * 1.4 + p.era * 130 + (p.structures.settlement + p.structures.farm + p.structures.academy) * 20);
    }
    if (state.elapsed >= 235) endGame();
    if (state.toastTimer > 0) {
      state.toastTimer -= dt;
      if (state.toastTimer <= 0) ui.mapToast.classList.add("hidden");
    }
  }

  function endGame() {
    state.gameOver = true;
    const ranking = [...state.players].sort((a, b) => b.score - a.score);
    const place = ranking.findIndex(p => p.id === 0) + 1;
    logEvent(`The chronicle closes. You finished ${place}${place === 1 ? "st" : place === 2 ? "nd" : place === 3 ? "rd" : "th"} with ${state.players[0].score} points.`, true);
    toast(place === 1 ? "Your civilization shaped the age" : `History ends — rank ${place}`);
  }

  function draw() {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const cw = w / COLS, ch = h / ROWS;
    ctx.fillStyle = "#13231f";
    ctx.fillRect(0, 0, w, h);
    const human = state.players[0];
    const visible = state.started && human.alive ? visibleCells(0) : null;

    for (let i = 0; i < state.cells.length; i++) {
      const cell = state.cells[i];
      const [x, y] = cellXY(i);
      const px = x * cw, py = y * ch;
      if (!cell.land) {
        ctx.fillStyle = (x + y) % 3 === 0 ? "#18302c" : "#172b28";
        ctx.fillRect(px, py, cw + .4, ch + .4);
        continue;
      }
      const open = phaseOpenAt(i);
      if (!open) {
        ctx.fillStyle = "#29302d";
        ctx.fillRect(px, py, cw + .4, ch + .4);
        if ((x + y) % 5 === 0) {
          ctx.fillStyle = "rgba(235,230,205,.035)";
          ctx.fillRect(px, py, cw, ch);
        }
        continue;
      }
      let fill = cell.biome === "fertile" ? "#657c62" : cell.biome === "stone" ? "#6d6e62" : "#596b59";
      if (cell.owner >= 0) fill = state.players[cell.owner]?.color || "#777";
      ctx.fillStyle = fill;
      ctx.fillRect(px, py, cw + .55, ch + .55);
      if (visible && !visible.has(i)) {
        ctx.fillStyle = "rgba(7,12,10,.72)";
        ctx.fillRect(px, py, cw + .55, ch + .55);
      } else if (cell.owner === -1) {
        ctx.fillStyle = cell.biome === "fertile" ? "rgba(218,225,150,.10)" : cell.biome === "stone" ? "rgba(230,230,225,.08)" : "rgba(255,255,255,.025)";
        ctx.fillRect(px, py, cw + .55, ch + .55);
      }
    }

    // Borders and structures.
    ctx.lineWidth = 1;
    for (let i = 0; i < state.cells.length; i++) {
      const cell = state.cells[i];
      if (cell.owner < 0 || (visible && !visible.has(i))) continue;
      const [x, y] = cellXY(i), px = x * cw, py = y * ch;
      ctx.strokeStyle = "rgba(12,15,13,.42)";
      for (const n of neighbors(i)) if (state.cells[n].owner !== cell.owner) {
        const [nx, ny] = cellXY(n);
        ctx.beginPath();
        if (nx < x) { ctx.moveTo(px, py); ctx.lineTo(px, py + ch); }
        if (nx > x) { ctx.moveTo(px + cw, py); ctx.lineTo(px + cw, py + ch); }
        if (ny < y) { ctx.moveTo(px, py); ctx.lineTo(px + cw, py); }
        if (ny > y) { ctx.moveTo(px, py + ch); ctx.lineTo(px + cw, py + ch); }
        ctx.stroke();
      }
      if (cell.structure) drawStructure(cell.structure, px + cw / 2, py + ch / 2, Math.min(cw, ch), cell.owner === 0);
    }

    // Selected spawn or target.
    const highlight = !state.started ? state.selectedSpawn : state.targetCell;
    if (highlight >= 0) {
      const [x, y] = cellXY(highlight);
      ctx.strokeStyle = "#fff0a8";
      ctx.lineWidth = 2.2;
      ctx.strokeRect(x * cw + 1, y * ch + 1, cw - 2, ch - 2);
    }

    // Exile overlay.
    if (state.started && human.exiled) {
      const ready = state.elapsed >= human.exileUntil;
      ctx.fillStyle = "rgba(8,11,9,.38)";
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = "center";
      ctx.fillStyle = "#f2e9c7";
      ctx.font = "28px Georgia";
      ctx.fillText(ready ? "Choose a new homeland" : `Exile — return in ${Math.ceil(human.exileUntil - state.elapsed)}s`, w / 2, h / 2 - 8);
      ctx.font = "14px system-ui";
      ctx.fillStyle = "#bac5bc";
      ctx.fillText(ready ? "Click any valid neutral tile in the open world" : "Your civilization survives as a displaced people", w / 2, h / 2 + 20);
    }
  }

  function drawStructure(type, x, y, size, friendly) {
    ctx.save();
    ctx.translate(x, y);
    const s = Math.max(3, size * .38);
    ctx.fillStyle = friendly ? "#fff3bd" : "rgba(250,244,220,.9)";
    ctx.strokeStyle = "rgba(10,12,10,.75)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (type === "capital") {
      ctx.moveTo(-s, s); ctx.lineTo(-s, -s * .2); ctx.lineTo(0, -s); ctx.lineTo(s, -s * .2); ctx.lineTo(s, s); ctx.closePath();
    } else if (type === "settlement") {
      ctx.rect(-s, -s * .15, s * 2, s * 1.15); ctx.moveTo(-s * 1.2, -s * .15); ctx.lineTo(0, -s); ctx.lineTo(s * 1.2, -s * .15);
    } else if (type === "farm") {
      ctx.rect(-s, -s * .65, s * 2, s * 1.3); ctx.moveTo(-s, -s * .2); ctx.lineTo(s, -s * .2); ctx.moveTo(-s, s * .25); ctx.lineTo(s, s * .25);
    } else if (type === "academy") {
      ctx.moveTo(-s, -s * .55); ctx.lineTo(0, -s); ctx.lineTo(s, -s * .55); ctx.moveTo(-s, -s * .45); ctx.lineTo(s, -s * .45); ctx.rect(-s * .75, -s * .45, s * 1.5, s * 1.35);
    } else {
      ctx.rect(-s, -s, s * 2, s * 2);
    }
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function updateUI() {
    const p = state.players[0];
    const territory = territoryOf(0).length;
    ui.eraValue.textContent = ERA_NAMES[p.era];
    ui.populationValue.textContent = Math.floor(p.population).toLocaleString();
    ui.territoryValue.textContent = territory.toLocaleString();
    ui.scoreValue.textContent = p.score.toLocaleString();
    ui.foodValue.textContent = Math.floor(p.food).toLocaleString();
    ui.materialsValue.textContent = Math.floor(p.materials).toLocaleString();
    ui.knowledgeValue.textContent = Math.floor(p.knowledge).toLocaleString();
    ui.foodMeter.style.width = `${Math.min(100, p.food / 2.2)}%`;
    ui.materialsMeter.style.width = `${Math.min(100, p.materials / 1.6)}%`;
    const nextThreshold = ERA_THRESHOLDS[Math.min(ERA_NAMES.length - 1, p.era + 1)] || ERA_THRESHOLDS.at(-1);
    ui.knowledgeMeter.style.width = `${Math.min(100, p.knowledge / Math.max(1, nextThreshold) * 100)}%`;
    const phase = WORLD_PHASES[state.currentPhase];
    const nextPhase = WORLD_PHASES[state.currentPhase + 1];
    const phaseStart = phase.at;
    const phaseEnd = nextPhase ? nextPhase.at : 235;
    ui.worldPhaseValue.textContent = phase.name;
    ui.worldDescription.textContent = phase.text;
    ui.worldProgress.style.width = `${Math.min(100, (state.elapsed - phaseStart) / (phaseEnd - phaseStart) * 100)}%`;
    const canAct = state.started && p.alive && !state.gameOver;
    ui.settlementButton.disabled = !canAct || p.materials < 45;
    ui.farmButton.disabled = !canAct || p.era < 1 || p.materials < 35;
    ui.academyButton.disabled = !canAct || p.era < 2 || p.materials < 70;
    if (state.gameOver) ui.statusBadge.textContent = "Chronicle complete";
    else if (p.exiled) ui.statusBadge.textContent = state.elapsed >= p.exileUntil ? "Choose a return site" : `Exile · ${Math.ceil(p.exileUntil - state.elapsed)}s`;
    else if (state.started) ui.statusBadge.textContent = p.alive ? (state.elapsed < p.protectionUntil ? "Founding protection" : "Civilization active") : "Eliminated";
  }

  function canvasCell(event) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / rect.width * COLS);
    const y = Math.floor((event.clientY - rect.top) / rect.height * ROWS);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return -1;
    return idx(x, y);
  }

  canvas.addEventListener("click", event => {
    if (state.gameOver) return;
    const i = canvasCell(event);
    const p = state.players[0];
    if (!state.started) {
      if (validSpawn(i)) {
        state.selectedSpawn = i;
        ui.startButton.disabled = false;
        ui.statusBadge.textContent = "Founding site selected";
        ui.hintText.textContent = "Press Begin history, or choose a different location. The pale border shows your selected tile.";
      }
      return;
    }
    if (p.exiled && p.respawns > 0 && state.elapsed >= p.exileUntil && validSpawn(i, p.id)) {
      p.respawns--;
      claimStart(p, i, true);
      state.targetCell = -1;
      logEvent("Your people returned from exile and founded a successor state.", true);
      toast("A second history begins");
      return;
    }
    if (!p.alive) return;
    if (phaseOpenAt(i) && state.cells[i].land && neighbors(i).some(n => state.cells[n].owner === p.id) && state.cells[i].owner !== p.id) {
      state.targetCell = i;
      const owner = state.cells[i].owner;
      ui.hintText.textContent = owner === -1 ? "Your civilization is directing expansion toward this land." : `Your frontier is pressuring ${state.players[owner]?.name || "a rival"}.`;
      if (owner >= 0 && state.elapsed < p.protectionUntil) toast("Founding protection prevents attacks");
    }
  });

  ui.startButton.addEventListener("click", startGame);
  ui.resetButton.addEventListener("click", setup);
  ui.pauseButton.addEventListener("click", () => {
    state.paused = !state.paused;
    ui.pauseButton.textContent = state.paused ? "Resume" : "Pause";
  });
  ui.speedButton.addEventListener("click", () => {
    state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1;
    ui.speedButton.textContent = `Speed ×${state.speed}`;
  });
  ui.settlementButton.addEventListener("click", () => build(state.players[0], "settlement"));
  ui.farmButton.addEventListener("click", () => build(state.players[0], "farm"));
  ui.academyButton.addEventListener("click", () => build(state.players[0], "academy"));

  function frame(now) {
    const delta = Math.min(100, now - lastFrame);
    lastFrame = now;
    accumulator += delta * state.speed;
    while (accumulator >= tickMs) {
      tick(tickMs / 1000);
      accumulator -= tickMs;
    }
    draw();
    updateUI();
    raf = requestAnimationFrame(frame);
  }

  setup();
})();
