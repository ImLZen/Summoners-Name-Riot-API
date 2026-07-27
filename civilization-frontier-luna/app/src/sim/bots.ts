/**
 * Bots (GDD §9): cuatro arquetipos que juegan con las mismas reglas, costes
 * y niebla que el humano. Toman decisiones a intervalos cortos usando solo
 * información explorada (p.explored / computeVisibility) — nunca leen tiles
 * sin revelar.
 */
import type { MatchState, Player, StructureKind } from "./types";
import { applyCommand } from "./commands";
import { computeVisibility } from "./fog";
import { borderTiles } from "./territory";
import { distTiles, tilesInRadius, xyOf, idx } from "./grid";
import { homeStructure, isValidSpawn, rngOf, saveRng } from "./match";
import { EDGES, STRUCTURES } from "./constants";
import type { Rng } from "./rng";

/** Segundos entre decisiones de cada bot. */
const DECISION_INTERVAL = 2.0;

export function stepBots(state: MatchState, dt: number): void {
  const rng = rngOf(state);
  for (const p of state.players) {
    if (p.human) continue;
    // Respawn de bots evacuados.
    if (!p.alive && p.evacuated && p.respawnsLeft > 0 && state.elapsed >= p.evacUntil) {
      tryBotRespawn(state, p, rng);
      continue;
    }
    if (!p.alive) continue;
    // Decisión estocástica determinista con frecuencia media fija.
    if (rng.next() < dt / DECISION_INTERVAL) {
      botDecide(state, p, rng);
    }
  }
  saveRng(state, rng);
}

function tryBotRespawn(state: MatchState, p: Player, rng: Rng): void {
  for (let attempt = 0; attempt < 80; attempt++) {
    const tile = idx(
      3 + rng.int(state.config.cols - 6),
      6 + rng.int(state.config.rows - 9),
      state.config.cols,
    );
    if (isValidSpawn(state, tile, p.id)) {
      applyCommand(state, { type: "respawn", playerId: p.id, tile });
      return;
    }
  }
}

function botDecide(state: MatchState, p: Player, rng: Rng): void {
  const home = homeStructure(state, p.id);
  if (home < 0) return;
  const visible = computeVisibility(state, p.id);

  // 1) Supervivencia: energía y oxígeno primero.
  if (ensureInfrastructure(state, p, visible, rng)) return;

  // 2) Comportamiento por arquetipo.
  switch (p.archetype) {
    case "engineer":
      if (buildRedundancy(state, p, rng)) return;
      break;
    case "prospector":
      if (exploreOrExtract(state, p, visible, rng)) return;
      break;
    case "saboteur":
      if (sabotage(state, p, visible, rng)) return;
      break;
    case "expansive":
    default:
      break;
  }

  // 3) Común: extraer, expandir, comerciar, presionar.
  if (buildExtractors(state, p, visible, rng)) return;
  if (rng.next() < 0.35 && buildTrade(state, p, rng)) return;
  expandOrAttack(state, p, rng);
}

/** Cuenta estructuras vivas del jugador por tipo. */
function count(state: MatchState, playerId: number, kind: StructureKind): number {
  let n = 0;
  for (const st of state.structures) if (st.owner === playerId && st.kind === kind && st.hp > 0) n++;
  return n;
}

function ownedFreeTiles(state: MatchState, p: Player): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.tiles.length; i++) {
    if (state.tiles[i].owner === p.id && state.tiles[i].structure === -1) out.push(i);
  }
  return out;
}

function connect(state: MatchState, p: Player, kind: "energy_line" | "oxygen_conduit" | "trade_route", a: number, b: number): boolean {
  return applyCommand(state, { type: "connect", playerId: p.id, kind, a, b }).ok;
}

/** Asegura generador + línea al hábitat y nodo de oxígeno + conducto. */
function ensureInfrastructure(state: MatchState, p: Player, _visible: Uint8Array, rng: Rng): boolean {
  const cols = state.config.cols;
  const home = homeStructure(state, p.id);
  const homeSt = state.structures[home];

  if (count(state, p.id, "generator") === 0) {
    const spot = nearestFreeTile(state, p, homeSt.tile, (t) => state.tiles[t].terrain !== "polar_shadow");
    if (spot >= 0) return applyCommand(state, { type: "build", playerId: p.id, kind: "generator", tile: spot }).ok;
    return false;
  }
  // Conectar hábitat a un generador si no está alimentado.
  if (!homeSt.powered) {
    const gen = state.structures.find((s) => s.owner === p.id && s.kind === "generator" && s.hp > 0);
    if (gen && distTiles(gen.tile, homeSt.tile, cols) <= EDGES.energy_line.maxLength) {
      if (connect(state, p, "energy_line", gen.id, homeSt.id)) return true;
    }
  }
  if (count(state, p.id, "oxygen_node") === 0) {
    const spot = nearestFreeTile(state, p, homeSt.tile, () => true);
    if (spot >= 0) return applyCommand(state, { type: "build", playerId: p.id, kind: "oxygen_node", tile: spot }).ok;
    return false;
  }
  if (!homeSt.oxygenated) {
    const node = state.structures.find((s) => s.owner === p.id && s.kind === "oxygen_node" && s.hp > 0);
    if (node) {
      if (!node.powered) {
        const gen = state.structures.find((s) => s.owner === p.id && s.kind === "generator" && s.hp > 0);
        if (gen && connect(state, p, "energy_line", gen.id, node.id)) return true;
      }
      if (connect(state, p, "oxygen_conduit", node.id, homeSt.id)) return true;
    }
  }
  // Conectar estructuras sin energía a la red.
  for (const st of state.structures) {
    if (st.owner !== p.id || st.hp <= 0 || st.powered) continue;
    if (!STRUCTURES[st.kind].needsPower) continue;
    const sources = state.structures.filter(
      (s) => s.owner === p.id && s.hp > 0 && (s.kind === "generator" || s.powered) && s.id !== st.id,
    );
    sources.sort((a, b) => distTiles(a.tile, st.tile, cols) - distTiles(b.tile, st.tile, cols));
    for (const src of sources.slice(0, 2)) {
      if (connect(state, p, "energy_line", src.id, st.id)) return true;
    }
  }
  // Generador extra si la energía neta es negativa (con tope: sin él, el
  // bucle consumo→construcción degenera en spam de generadores).
  if (p.netRates.energy < 0 && p.stocks.minerals > 80 && count(state, p.id, "generator") < 6 && rng.next() < 0.6) {
    const spot = nearestFreeTile(state, p, homeSt.tile, (t) => state.tiles[t].terrain !== "polar_shadow");
    if (spot >= 0) return applyCommand(state, { type: "build", playerId: p.id, kind: "generator", tile: spot }).ok;
  }
  return false;
}

/** Tile propio libre más cercano a `origin` que cumpla el filtro. */
function nearestFreeTile(state: MatchState, p: Player, origin: number, filter: (t: number) => boolean): number {
  const cols = state.config.cols;
  const candidates = ownedFreeTiles(state, p).filter(filter);
  if (!candidates.length) return -1;
  candidates.sort((a, b) => distTiles(a, origin, cols) - distTiles(b, origin, cols));
  return candidates[0];
}

/** Ingeniera: redundancia de generación y conexiones dobles. */
function buildRedundancy(state: MatchState, p: Player, rng: Rng): boolean {
  const home = homeStructure(state, p.id);
  const homeSt = state.structures[home];
  if (count(state, p.id, "generator") < 2 && p.stocks.minerals > 90) {
    const spot = nearestFreeTile(state, p, homeSt.tile, (t) => state.tiles[t].terrain !== "polar_shadow");
    if (spot >= 0) return applyCommand(state, { type: "build", playerId: p.id, kind: "generator", tile: spot }).ok;
  }
  if (count(state, p.id, "control_point") < 1 && p.stocks.minerals > 120 && rng.next() < 0.5) {
    const spot = nearestFreeTile(state, p, homeSt.tile, () => true);
    if (spot >= 0) return applyCommand(state, { type: "build", playerId: p.id, kind: "control_point", tile: spot }).ok;
  }
  return false;
}

/** Prospectora: mueve el rover hacia lo inexplorado y prioriza depósitos. */
function exploreOrExtract(state: MatchState, p: Player, _visible: Uint8Array, rng: Rng): boolean {
  const rover = state.rovers.find((r) => r.owner === p.id && r.kind === "explorer");
  if (rover && !rover.order && rng.next() < 0.8) {
    const cols = state.config.cols;
    const rows = state.config.rows;
    for (let attempt = 0; attempt < 30; attempt++) {
      const t = rng.int(cols * rows);
      if (!p.explored[t]) {
        applyCommand(state, { type: "move_rover", playerId: p.id, roverId: rover.id, tile: t });
        return true;
      }
    }
  }
  return buildExtractors(state, p, _visible, rng);
}

/** Construye minas/extractores sobre depósitos explorados en territorio propio. */
function buildExtractors(state: MatchState, p: Player, _visible: Uint8Array, rng: Rng): boolean {
  const mines = count(state, p.id, "mine");
  const extractors = count(state, p.id, "ice_extractor");
  for (const i of ownedFreeTiles(state, p)) {
    if (!p.explored[i]) continue;
    const dep = state.tiles[i].deposit;
    if (dep === "minerals" && mines < 4) {
      if (applyCommand(state, { type: "build", playerId: p.id, kind: "mine", tile: i }).ok) return true;
    }
    if (dep === "water_ice" && extractors < 3) {
      if (applyCommand(state, { type: "build", playerId: p.id, kind: "ice_extractor", tile: i }).ok) return true;
    }
  }
  // Sin depósitos propios: expandir hacia el depósito explorado más cercano.
  if (rng.next() < 0.6) {
    const cols = state.config.cols;
    const home = homeStructure(state, p.id);
    if (home < 0) return false;
    const origin = state.structures[home].tile;
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < state.tiles.length; i++) {
      if (!p.explored[i] || state.tiles[i].deposit === "none" || state.tiles[i].owner !== -1) continue;
      const d = distTiles(i, origin, cols);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best >= 0) {
      applyCommand(state, { type: "expand_toward", playerId: p.id, tile: best });
      return true;
    }
  }
  return false;
}

/** Puerto lunar + ruta comercial entre estructuras propias. */
function buildTrade(state: MatchState, p: Player, rng: Rng): boolean {
  const home = homeStructure(state, p.id);
  if (home < 0) return false;
  const homeSt = state.structures[home];
  if (count(state, p.id, "lunar_port") === 0) {
    if (p.stocks.minerals < 140) return false;
    const spot = nearestFreeTile(state, p, homeSt.tile, () => true);
    if (spot >= 0) return applyCommand(state, { type: "build", playerId: p.id, kind: "lunar_port", tile: spot }).ok;
    return false;
  }
  const port = state.structures.find((s) => s.owner === p.id && s.kind === "lunar_port" && s.hp > 0);
  if (!port) return false;
  const hasRoute = state.edges.some((e) => e.owner === p.id && e.kind === "trade_route" && e.status !== "cut");
  if (hasRoute && rng.next() < 0.8) return false;
  return connect(state, p, "trade_route", port.id, homeSt.id);
}

/** Saboteadora: corta aristas enemigas al alcance; si no, presiona tiles. */
function sabotage(state: MatchState, p: Player, _visible: Uint8Array, rng: Rng): boolean {
  const targets = state.edges.filter((e) => e.owner !== p.id && e.status !== "cut");
  // Intentos acotados: la validación de alcance recorre el trazado y la
  // visibilidad, así que no se prueba cada arista del mapa en cada decisión.
  let attempts = 4;
  for (const edge of targets) {
    if (attempts <= 0) break;
    if (rng.next() < 0.5) continue;
    attempts--;
    if (applyCommand(state, { type: "sabotage_edge", playerId: p.id, edgeId: edge.id }).ok) return true;
  }
  return false;
}

/** Expansión hacia territorio neutral valioso o presión sobre vecinos. */
function expandOrAttack(state: MatchState, p: Player, rng: Rng): void {
  const cols = state.config.cols;
  const rows = state.config.rows;
  const aggression =
    p.archetype === "saboteur" ? 0.5 : p.archetype === "expansive" ? 0.35 : p.archetype === "engineer" ? 0.12 : 0.2;

  const enemyBorder = borderTiles(state, p.id, true).filter((t) => state.tiles[t].owner >= 0);
  if (enemyBorder.length && rng.next() < aggression) {
    // Preferir tiles con estructuras de red (presión sobre infraestructura).
    enemyBorder.sort((a, b) => {
      const sa = state.tiles[a].structure >= 0 ? 1 : 0;
      const sb = state.tiles[b].structure >= 0 ? 1 : 0;
      return sb - sa;
    });
    applyCommand(state, { type: "attack_tile", playerId: p.id, tile: enemyBorder[0] });
    return;
  }

  if (p.expandTarget >= 0 && rng.next() < 0.7) return;

  // Objetivo de expansión: depósito explorado neutral cercano o frente amplio.
  const home = homeStructure(state, p.id);
  if (home < 0) return;
  const origin = state.structures[home].tile;
  const reach = p.archetype === "expansive" ? 34 : 24;
  let best = -1;
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 40; attempt++) {
    const t = rng.int(cols * rows);
    if (state.tiles[t].owner !== -1) continue;
    const d = distTiles(t, origin, cols);
    if (d > reach) continue;
    let score = -d * 0.1;
    if (p.explored[t] && state.tiles[t].deposit !== "none") score += 3;
    if (state.tiles[t].terrain === "corridor") score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (best >= 0) applyCommand(state, { type: "expand_toward", playerId: p.id, tile: best });

  // Mantener el rover explorando.
  const rover = state.rovers.find((r) => r.owner === p.id && r.kind === "explorer");
  if (rover && !rover.order) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const t = rng.int(cols * rows);
      if (!p.explored[t]) {
        applyCommand(state, { type: "move_rover", playerId: p.id, roverId: rover.id, tile: t });
        break;
      }
    }
  }
}
