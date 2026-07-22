/**
 * Grafo autoritativo de redes (GDD §7): nodos = estructuras, aristas =
 * líneas/conductos/rutas. La conectividad se recalcula por tick con BFS
 * sobre grafos pequeños por jugador.
 */
import type { EdgeKind, MatchState, NetworkEdge, Structure } from "./types";
import { EDGES } from "./constants";
import { distTiles, tilesOnSegment } from "./grid";

export function structureById(state: MatchState, id: number): Structure | undefined {
  return state.structures[id];
}

function isStructureActive(st: Structure | undefined): st is Structure {
  return !!st && st.hp > 0;
}

/** Valida la creación de una arista sin aplicar el coste. */
export function validateEdge(
  state: MatchState,
  playerId: number,
  kind: EdgeKind,
  aId: number,
  bId: number,
): { ok: boolean; reason?: string; cost?: number } {
  const spec = EDGES[kind];
  const a = structureById(state, aId);
  const b = structureById(state, bId);
  if (!isStructureActive(a) || !isStructureActive(b)) return { ok: false, reason: "Extremo inexistente" };
  if (a.owner !== playerId || b.owner !== playerId) return { ok: false, reason: "Solo entre estructuras propias" };
  if (aId === bId) return { ok: false, reason: "Extremos idénticos" };
  for (const e of state.edges) {
    if (e.kind === kind && ((e.a === aId && e.b === bId) || (e.a === bId && e.b === aId)) && e.status !== "cut") {
      return { ok: false, reason: "Conexión ya existente" };
    }
  }
  const dist = distTiles(a.tile, b.tile, state.config.cols);
  if (dist > spec.maxLength) return { ok: false, reason: "Distancia excesiva" };
  if (spec.endpointKinds && !spec.endpointKinds.includes(a.kind) && !spec.endpointKinds.includes(b.kind)) {
    return { ok: false, reason: "Extremos no válidos para esta red" };
  }
  if (kind === "trade_route" && a.kind !== "lunar_port" && b.kind !== "lunar_port") {
    return { ok: false, reason: "Una ruta comercial requiere un puerto lunar" };
  }
  const cost = Math.ceil(dist * spec.costPerTile);
  return { ok: true, cost };
}

export function addEdge(state: MatchState, playerId: number, kind: EdgeKind, aId: number, bId: number): NetworkEdge {
  const spec = EDGES[kind];
  const edge: NetworkEdge = {
    id: state.nextEdgeId++,
    kind,
    owner: playerId,
    a: aId,
    b: bId,
    status: "operational",
    hp: spec.hp,
    maxHp: spec.hp,
  };
  state.edges.push(edge);
  return edge;
}

/**
 * Conectividad por tipo de red para un jugador: BFS desde las fuentes.
 * - energía: fuentes = generadores → marca `powered`.
 * - oxígeno: fuentes = nodos de oxígeno operativos → marca `oxygenated`.
 */
export function recomputeConnectivity(state: MatchState): void {
  for (const st of state.structures) {
    if (st.hp <= 0) continue;
    st.powered = st.kind === "generator";
    if (st.kind === "habitat") st.oxygenated = false;
  }
  for (const p of state.players) {
    if (!p.alive) continue;
    propagate(state, p.id, "energy_line", (st) => st.kind === "generator", (st) => {
      st.powered = true;
    });
    // Un nodo de oxígeno sigue siendo fuente mientras le quede reserva.
    propagate(
      state,
      p.id,
      "oxygen_conduit",
      (st) => st.kind === "oxygen_node" && (st.powered || st.energyReserve > 0),
      (st) => {
        if (st.kind === "habitat") st.oxygenated = true;
      },
    );
  }
}

function propagate(
  state: MatchState,
  playerId: number,
  kind: EdgeKind,
  isSource: (st: Structure) => boolean,
  mark: (st: Structure) => void,
): void {
  const adjacency = new Map<number, number[]>();
  for (const e of state.edges) {
    if (e.owner !== playerId || e.kind !== kind || e.status === "cut") continue;
    if (!adjacency.has(e.a)) adjacency.set(e.a, []);
    if (!adjacency.has(e.b)) adjacency.set(e.b, []);
    adjacency.get(e.a)!.push(e.b);
    adjacency.get(e.b)!.push(e.a);
  }
  const queue: number[] = [];
  const visited = new Set<number>();
  for (const st of state.structures) {
    if (st.owner !== playerId || st.hp <= 0) continue;
    if (isSource(st)) {
      queue.push(st.id);
      visited.add(st.id);
      mark(st);
    }
  }
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nxt of adjacency.get(cur) ?? []) {
      if (visited.has(nxt)) continue;
      const st = structureById(state, nxt);
      if (!isStructureActive(st) || st.owner !== playerId) continue;
      visited.add(nxt);
      mark(st);
      queue.push(nxt);
    }
  }
}

/** Una ruta comercial es operativa si sus extremos viven, con energía. */
export function isTradeRouteOperational(state: MatchState, edge: NetworkEdge): boolean {
  if (edge.kind !== "trade_route" || edge.status === "cut") return false;
  const a = structureById(state, edge.a);
  const b = structureById(state, edge.b);
  return isStructureActive(a) && isStructureActive(b) && a.powered && b.powered && a.owner === edge.owner && b.owner === edge.owner;
}

/**
 * Reparación automática: una arista dañada/cortada se recupera lentamente
 * cuando ningún tile de su trazado pertenece a un enemigo, pagando minerales.
 */
export function repairEdges(state: MatchState, dt: number): void {
  for (const edge of state.edges) {
    if (edge.hp >= edge.maxHp) continue;
    const owner = state.players[edge.owner];
    if (!owner.alive) continue;
    const a = structureById(state, edge.a);
    const b = structureById(state, edge.b);
    if (!isStructureActive(a) || !isStructureActive(b)) continue;
    let hostile = false;
    for (const t of tilesOnSegment(a.tile, b.tile, state.config.cols)) {
      const ownerId = state.tiles[t].owner;
      if (ownerId >= 0 && ownerId !== edge.owner) {
        hostile = true;
        break;
      }
    }
    if (hostile) continue;
    const repairCost = 0.6 * dt;
    if (owner.stocks.minerals < repairCost) continue;
    owner.stocks.minerals -= repairCost;
    edge.hp = Math.min(edge.maxHp, edge.hp + 4.5 * dt);
    if (edge.status === "cut" && edge.hp > edge.maxHp * 0.35) edge.status = "damaged";
    if (edge.status === "damaged" && edge.hp >= edge.maxHp) edge.status = "operational";
  }
}

/** Elimina aristas cuyos extremos han muerto. */
export function pruneEdges(state: MatchState): void {
  for (const edge of state.edges) {
    if (edge.status === "cut") continue;
    const a = structureById(state, edge.a);
    const b = structureById(state, edge.b);
    if (!isStructureActive(a) || !isStructureActive(b)) {
      edge.status = "cut";
      edge.hp = 0;
    }
  }
}
