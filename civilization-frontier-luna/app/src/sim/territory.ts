/**
 * Territorio continuo estilo OpenFront: expansión dirigida sobre tiles
 * neutrales, presión sobre tiles enemigos y sostenibilidad ligada a
 * hábitats y puntos de control (una colonia sin ancla pierde terreno).
 */
import type { MatchState, Player } from "./types";
import {
  ATTACK_TILE_COST_ENERGY,
  ATTACK_TILE_COST_OXYGEN,
  CONTROL_POINT_DEFENSE_FACTOR,
  CONTROL_POINT_DEFENSE_RADIUS,
  EXPAND_BASE_COST_ENERGY,
  EXPAND_BASE_COST_OXYGEN,
  EXPAND_RATE,
  STRUCTURE_DAMAGE_PER_ATTACK,
  TERRAIN_EXPAND_FACTOR,
} from "./constants";
import { distTiles, neighbors4 } from "./grid";
import { pushEvent } from "./match";
import type { Rng } from "./rng";

export function territoryTiles(state: MatchState, playerId: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.tiles.length; i++) if (state.tiles[i].owner === playerId) out.push(i);
  return out;
}

/** Tiles frontera reclamables (neutrales adyacentes al territorio propio). */
export function borderTiles(state: MatchState, playerId: number, includeEnemy = false): number[] {
  const cols = state.config.cols;
  const rows = state.config.rows;
  const seen = new Set<number>();
  for (let i = 0; i < state.tiles.length; i++) {
    if (state.tiles[i].owner !== playerId) continue;
    for (const n of neighbors4(i, cols, rows)) {
      const owner = state.tiles[n].owner;
      if (owner === playerId) continue;
      if (owner === -1 || includeEnemy) seen.add(n);
    }
  }
  return [...seen];
}

export function expandCost(state: MatchState, tile: number): { energy: number; oxygen: number } {
  const factor = TERRAIN_EXPAND_FACTOR[state.tiles[tile].terrain] ?? 1;
  return { energy: EXPAND_BASE_COST_ENERGY * factor, oxygen: EXPAND_BASE_COST_OXYGEN * factor };
}

/**
 * Avanza la expansión dirigida del jugador hacia su `expandTarget`,
 * reclamando tiles neutrales de frontera lo más cerca posible del objetivo.
 */
export function stepExpansion(state: MatchState, p: Player, dt: number, rng: Rng): void {
  if (!p.alive || p.expandTarget < 0) return;
  if (state.tiles[p.expandTarget]?.owner === p.id) {
    p.expandTarget = -1;
    return;
  }
  const budget = EXPAND_RATE * dt;
  // Presupuesto fraccional: redondeo estocástico determinista.
  let claims = Math.floor(budget);
  if (rng.next() < budget - claims) claims++;
  if (claims <= 0) return;
  const cols = state.config.cols;
  const rows = state.config.rows;
  // Frontera calculada una vez por tick y mantenida incrementalmente,
  // ordenada por cercanía al objetivo.
  const goal = p.expandTarget;
  const distToGoal = (t: number) => distTiles(t, goal, cols);
  const frontier = borderTiles(state, p.id).filter((t) => state.tiles[t].owner === -1);
  frontier.sort((a, b) => distToGoal(a) - distToGoal(b));
  const inFrontier = new Set(frontier);
  while (claims-- > 0 && frontier.length) {
    const target = frontier.shift()!;
    inFrontier.delete(target);
    if (state.tiles[target].owner !== -1) continue;
    const cost = expandCost(state, target);
    if (p.stocks.energy < cost.energy || p.stocks.oxygen < cost.oxygen) return;
    p.stocks.energy -= cost.energy;
    p.stocks.oxygen -= cost.oxygen;
    state.tiles[target].owner = p.id;
    p.stats.tilesClaimed++;
    if (target === goal) {
      p.expandTarget = -1;
      return;
    }
    for (const n of neighbors4(target, cols, rows)) {
      if (state.tiles[n].owner !== -1 || inFrontier.has(n)) continue;
      inFrontier.add(n);
      const d = distToGoal(n);
      let lo = 0;
      let hi = frontier.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (distToGoal(frontier[mid]) < d) lo = mid + 1;
        else hi = mid;
      }
      frontier.splice(lo, 0, n);
    }
  }
}

/**
 * Ataque abstracto a un tile enemigo adyacente (GDD §10): cuesta recursos,
 * daña estructuras y puede voltear el tile según defensa local.
 */
export function attackTile(state: MatchState, attacker: Player, tile: number, rng: Rng): boolean {
  const t = state.tiles[tile];
  const defenderId = t.owner;
  if (defenderId < 0 || defenderId === attacker.id) return false;
  const defender = state.players[defenderId];
  if (!defender.alive) return false;
  if (state.elapsed < attacker.protectionUntil || state.elapsed < defender.protectionUntil) return false;
  const cols = state.config.cols;
  const rows = state.config.rows;
  if (!neighbors4(tile, cols, rows).some((n) => state.tiles[n].owner === attacker.id)) return false;
  if (attacker.stocks.energy < ATTACK_TILE_COST_ENERGY || attacker.stocks.oxygen < ATTACK_TILE_COST_OXYGEN) return false;

  attacker.stocks.energy -= ATTACK_TILE_COST_ENERGY;
  attacker.stocks.oxygen -= ATTACK_TILE_COST_OXYGEN;
  attacker.stats.attacksLaunched++;
  t.contestedBy = attacker.id;

  // Defensa: puntos de control cercanos del defensor reducen el impacto.
  let defense = 1;
  for (const st of state.structures) {
    if (st.owner !== defenderId || st.hp <= 0 || st.kind !== "control_point") continue;
    if (!st.powered && st.energyReserve <= 0) continue;
    if (distTiles(st.tile, tile, cols) <= CONTROL_POINT_DEFENSE_RADIUS) {
      defense += CONTROL_POINT_DEFENSE_FACTOR;
    }
  }

  const structure = t.structure >= 0 ? state.structures[t.structure] : undefined;
  if (structure && structure.hp > 0) {
    structure.hp -= STRUCTURE_DAMAGE_PER_ATTACK / defense;
    if (structure.hp <= 0) {
      structure.hp = 0;
      state.players[defenderId].stats.structuresLost++;
      if (structure.kind === "control_point") {
        // Captura: el punto de control cambia de dueño con el tile.
        structure.owner = attacker.id;
        structure.hp = structure.maxHp * 0.4;
        t.owner = attacker.id;
        pushEvent(state, `${attacker.name} ha capturado un punto de control de ${defender.name}.`, true);
      } else {
        t.structure = -1;
        pushEvent(
          state,
          `${attacker.name} ha destruido ${structureLabel(structure.kind)} de ${defender.name}.`,
          attacker.human || defender.human,
        );
      }
    }
    return true;
  }

  const roll = rng.next();
  if (roll < 0.62 / defense) {
    t.owner = attacker.id;
    attacker.stats.tilesClaimed++;
    return true;
  }
  return false;
}

function structureLabel(kind: string): string {
  const labels: Record<string, string> = {
    habitat: "un hábitat",
    generator: "un generador",
    oxygen_node: "un nodo de oxígeno",
    mine: "una mina",
    ice_extractor: "un extractor de hielo",
    lunar_port: "un puerto lunar",
  };
  return labels[kind] ?? "una estructura";
}

/**
 * Sostenibilidad: los tiles a más de cierta distancia de un hábitat o punto
 * de control operativo del dueño se revierten lentamente a neutrales.
 */
const SUSTAIN_RADIUS = 13;

export function stepSustain(state: MatchState, dt: number, rng: Rng): void {
  // Revisión estocástica de una fracción de tiles por tick para repartir coste.
  const total = state.tiles.length;
  const checks = Math.max(1, Math.floor(total * 0.02 * dt * 2));
  const cols = state.config.cols;
  const anchors = new Map<number, number[]>();
  for (const st of state.structures) {
    if (st.hp <= 0 || (st.kind !== "habitat" && st.kind !== "control_point")) continue;
    if (!anchors.has(st.owner)) anchors.set(st.owner, []);
    anchors.get(st.owner)!.push(st.tile);
  }
  for (let c = 0; c < checks; c++) {
    const i = rng.int(total);
    const owner = state.tiles[i].owner;
    if (owner < 0) continue;
    const list = anchors.get(owner);
    const sustained = !!list && list.some((a) => distTiles(a, i, cols) <= SUSTAIN_RADIUS);
    if (!sustained && state.tiles[i].structure === -1) {
      state.tiles[i].owner = -1;
    }
  }
}
