/**
 * Creación de partida, jugadores y alunizaje. La fase `spawn_selection`
 * muestra el mapa con indicadores aproximados; al confirmar el spawn humano
 * los bots eligen el suyo con las mismas reglas y comienza `running`.
 */
import { createRng, type Rng } from "./rng";
import { generateMap } from "./mapgen";
import { distTiles, idx, tilesInRadius, xyOf } from "./grid";
import type { BotArchetype, MatchConfig, MatchState, Player, Rover, Structure } from "./types";
import {
  BASE_CAPACITY,
  BOT_NAMES,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  INITIAL_POPULATION,
  INITIAL_STOCKS,
  MATCH_CUTOFF_MINUTES,
  PLAYER_COLORS,
  RESPAWN_POPULATION,
  RESPAWN_PROTECTION_SECONDS,
  RESPAWN_STOCKS,
  SPAWN_CLAIM_RADIUS,
  SPAWN_MIN_DISTANCE,
  SPAWN_PROTECTION_SECONDS,
  STRUCTURES,
  VICTORY_HOLD_SECONDS,
  VICTORY_THRESHOLD,
} from "./constants";

const ARCHETYPES: BotArchetype[] = ["engineer", "prospector", "expansive", "saboteur"];

export function defaultConfig(seed: number): MatchConfig {
  return {
    seed,
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    botCount: 7,
    targetMinutes: MATCH_CUTOFF_MINUTES,
    victoryThreshold: VICTORY_THRESHOLD,
    victoryHoldSeconds: VICTORY_HOLD_SECONDS,
  };
}

function createPlayer(id: number, name: string, human: boolean, archetype: BotArchetype | null, tileCount: number): Player {
  return {
    id,
    name,
    human,
    archetype,
    color: PLAYER_COLORS[id % PLAYER_COLORS.length],
    alive: false,
    evacuated: false,
    respawnsLeft: 1,
    evacUntil: 0,
    protectionUntil: 0,
    stocks: { ...INITIAL_STOCKS },
    capacity: { ...BASE_CAPACITY },
    netRates: { energy: 0, oxygen: 0, minerals: 0, water_ice: 0 },
    population: 0,
    expandTarget: -1,
    control: 0,
    controlHoldSeconds: 0,
    score: 0,
    stats: {
      tilesClaimed: 0,
      structuresBuilt: 0,
      edgesBuilt: 0,
      edgesCut: 0,
      structuresLost: 0,
      tradeIncome: 0,
      attacksLaunched: 0,
    },
    explored: new Uint8Array(tileCount),
    lastSeen: new Uint32Array(tileCount),
  };
}

export function createMatch(config: MatchConfig): MatchState {
  const rng = createRng(config.seed);
  const tiles = generateMap(rng, config.cols, config.rows);
  const state: MatchState = {
    config,
    rngState: rng.getState(),
    phase: "spawn_selection",
    elapsed: 0,
    tickCount: 0,
    tiles,
    structures: [],
    edges: [],
    rovers: [],
    players: [],
    events: [],
    nextStructureId: 0,
    nextEdgeId: 0,
    nextRoverId: 0,
    winner: -1,
  };
  const tileCount = config.cols * config.rows;
  state.players.push(createPlayer(0, "Tú", true, null, tileCount));
  for (let b = 0; b < config.botCount; b++) {
    state.players.push(
      createPlayer(b + 1, BOT_NAMES[b % BOT_NAMES.length], false, ARCHETYPES[b % ARCHETYPES.length], tileCount),
    );
  }
  return state;
}

export function rngOf(state: MatchState): Rng {
  return createRng(state.rngState);
}

export function saveRng(state: MatchState, rng: Rng): void {
  state.rngState = rng.getState();
}

export function pushEvent(state: MatchState, text: string, important = false, playerId = -1): void {
  state.events.push({ at: state.elapsed, text, important, playerId });
  if (state.events.length > 400) state.events.splice(0, state.events.length - 400);
}

/** Un tile admite alunizaje: terreno construible, neutral y lejos de rivales. */
export function isValidSpawn(state: MatchState, tile: number, playerId: number): boolean {
  const t = state.tiles[tile];
  if (!t || t.owner !== -1 || t.structure !== -1) return false;
  if (t.terrain === "polar_shadow" || t.terrain === "highland") return false;
  for (const p of state.players) {
    if (p.id === playerId || !p.alive) continue;
    const hab = homeStructure(state, p.id);
    if (hab >= 0 && distTiles(tile, state.structures[hab].tile, state.config.cols) < SPAWN_MIN_DISTANCE) return false;
  }
  return true;
}

/** id (índice en structures) del primer hábitat vivo del jugador, o -1. */
export function homeStructure(state: MatchState, playerId: number): number {
  for (let s = 0; s < state.structures.length; s++) {
    const st = state.structures[s];
    if (st.owner === playerId && st.kind === "habitat" && st.hp > 0) return s;
  }
  return -1;
}

/** Indicadores de spawn para la UI: 0..1 cada uno (GDD §3). */
export function spawnIndicators(state: MatchState, tile: number): { safety: number; resources: number; rivals: number } {
  const cols = state.config.cols;
  const rows = state.config.rows;
  const area = tilesInRadius(tile, 10, cols, rows);
  let deposits = 0;
  let hostileTiles = 0;
  for (const i of area) {
    if (state.tiles[i].deposit !== "none") deposits++;
    if (state.tiles[i].owner >= 0) hostileTiles++;
  }
  let nearestRival = Infinity;
  for (const p of state.players) {
    if (!p.alive) continue;
    const hab = homeStructure(state, p.id);
    if (hab >= 0) nearestRival = Math.min(nearestRival, distTiles(tile, state.structures[hab].tile, cols));
  }
  const safety = nearestRival === Infinity ? 1 : Math.max(0, Math.min(1, (nearestRival - SPAWN_MIN_DISTANCE) / 25));
  const resources = Math.max(0, Math.min(1, deposits / 9));
  const rivals = Math.max(0, Math.min(1, hostileTiles / (area.length * 0.35) + (nearestRival < 28 ? 0.4 : 0)));
  return { safety, resources, rivals };
}

export function addStructure(state: MatchState, kind: Structure["kind"], owner: number, tile: number): Structure {
  const spec = STRUCTURES[kind];
  const st: Structure = {
    id: state.nextStructureId++,
    kind,
    owner,
    tile,
    hp: spec.hp,
    maxHp: spec.hp,
    powered: !spec.needsPower,
    oxygenated: kind !== "habitat",
    energyReserve: spec.reserveSeconds,
    oxygenReserve: spec.reserveSeconds,
    builtAt: state.elapsed,
  };
  state.structures.push(st);
  state.tiles[tile].structure = st.id;
  return st;
}

export function addRover(state: MatchState, kind: Rover["kind"], owner: number, tile: number): Rover {
  const [x, y] = xyOf(tile, state.config.cols);
  const rover: Rover = {
    id: state.nextRoverId++,
    kind,
    owner,
    x: x + 0.5,
    y: y + 0.5,
    order: null,
    edgeId: -1,
    progress: 0,
  };
  state.rovers.push(rover);
  return rover;
}

/** Aluniza a un jugador: hábitat inicial, territorio, rover y protección. */
export function landPlayer(state: MatchState, playerId: number, tile: number, returning: boolean): void {
  const p = state.players[playerId];
  p.alive = true;
  p.evacuated = false;
  p.stocks = { ...(returning ? RESPAWN_STOCKS : INITIAL_STOCKS) };
  p.population = returning ? RESPAWN_POPULATION : INITIAL_POPULATION;
  p.protectionUntil = state.elapsed + (returning ? RESPAWN_PROTECTION_SECONDS : SPAWN_PROTECTION_SECONDS);
  p.expandTarget = -1;
  addStructure(state, "habitat", playerId, tile);
  for (const i of tilesInRadius(tile, SPAWN_CLAIM_RADIUS, state.config.cols, state.config.rows)) {
    if (state.tiles[i].owner === -1) {
      state.tiles[i].owner = playerId;
      p.stats.tilesClaimed++;
    }
  }
  addRover(state, "explorer", playerId, tile);
}

/** Elige spawns de bots con las mismas reglas que el humano. */
export function placeBots(state: MatchState): void {
  const rng = rngOf(state);
  const cols = state.config.cols;
  const rows = state.config.rows;
  for (const p of state.players) {
    if (p.human || p.alive) continue;
    let best = -1;
    let bestScore = -Infinity;
    // Muestreo determinista de candidatos: los bots prefieren recursos y
    // distancia, con sesgo por arquetipo.
    for (let attempt = 0; attempt < 220; attempt++) {
      const tile = idx(3 + rng.int(cols - 6), 6 + rng.int(rows - 9), cols);
      if (!isValidSpawn(state, tile, p.id)) continue;
      const ind = spawnIndicators(state, tile);
      let score = ind.resources * 2 + ind.safety;
      if (p.archetype === "prospector") score += ind.resources * 1.5;
      if (p.archetype === "saboteur") score += (1 - ind.safety) * 1.2;
      if (p.archetype === "expansive") score += ind.safety * 0.8;
      score += rng.next() * 0.3;
      if (score > bestScore) {
        bestScore = score;
        best = tile;
      }
    }
    if (best >= 0) {
      landPlayer(state, p.id, best, false);
      pushEvent(state, `${p.name} ha alunizado.`, false, p.id);
    }
  }
  saveRng(state, rng);
}
