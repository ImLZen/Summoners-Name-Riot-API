/**
 * Espejo de estado del cliente en partidas de red: un `MatchState` parcial
 * reconstruido solo con lo que el servidor permite ver. El renderer y el HUD
 * trabajan sobre esta estructura exactamente igual que sobre una partida
 * local; lo que la niebla oculta simplemente no existe aquí.
 */
import type { MatchState, Player, Structure, Tile } from "../sim/types";
import { BASE_CAPACITY, INITIAL_STOCKS } from "../sim/constants";
import { DEPOSIT_CODES, TERRAIN_CODES, decodeRle, type ServerMessage, type SnapshotMessage } from "./protocol";

export interface NetMirror {
  state: MatchState;
  humanId: number;
  /** visibilidad actual enviada por el servidor (null en fase de spawn) */
  visibility: Uint8Array | null;
}

function emptyPlayer(id: number, name: string, color: string, human: boolean, tileCount: number): Player {
  return {
    id,
    name,
    human,
    archetype: null,
    color,
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

export function createMirror(start: Extract<ServerMessage, { type: "game_start" }>): NetMirror {
  const tileCount = start.cols * start.rows;
  const terrain = decodeRle(start.terrain, tileCount);
  const tiles: Tile[] = new Array(tileCount);
  for (let i = 0; i < tileCount; i++) {
    tiles[i] = {
      terrain: TERRAIN_CODES[terrain[i]] ?? "mare",
      deposit: "none",
      owner: -1,
      structure: -1,
      contestedBy: -1,
    };
  }
  const state: MatchState = {
    config: {
      seed: 0, // la semilla nunca viaja al cliente: evitaría la niebla
      cols: start.cols,
      rows: start.rows,
      humanCount: start.humanCount,
      botCount: start.botCount,
      targetMinutes: start.targetMinutes,
      victoryThreshold: start.victoryThreshold,
      victoryHoldSeconds: start.victoryHoldSeconds,
    },
    rngState: 0,
    phase: "spawn_selection",
    elapsed: 0,
    tickCount: 0,
    tiles,
    structures: [],
    edges: [],
    rovers: [],
    players: start.playerNames.map((name, i) =>
      emptyPlayer(i, name, start.playerColors[i], i < start.humanCount, tileCount),
    ),
    events: [],
    nextStructureId: 0,
    nextEdgeId: 0,
    nextRoverId: 0,
    winner: -1,
  };
  return { state, humanId: start.yourPlayerId, visibility: null };
}

/** Aplica un snapshot filtrado al espejo. */
export function applySnapshot(mirror: NetMirror, snap: SnapshotMessage): void {
  const s = mirror.state;
  s.phase = snap.phase;
  s.elapsed = snap.elapsed;
  s.tickCount = snap.tickCount;
  s.winner = snap.winner;

  mirror.visibility = snap.visibility ? Uint8Array.from(decodeRle(snap.visibility, s.tiles.length)) : null;

  for (let k = 0; k < snap.ownerChanges.length; k += 2) {
    s.tiles[snap.ownerChanges[k]].owner = snap.ownerChanges[k + 1];
  }
  for (let k = 0; k < snap.depositReveals.length; k += 2) {
    s.tiles[snap.depositReveals[k]].deposit = DEPOSIT_CODES[snap.depositReveals[k + 1]] ?? "none";
  }

  // Estructuras: array disperso indexado por id (igual que en el núcleo).
  // Primero se retiran del tile las que dejaron de ser visibles/vivas.
  const seen = new Set<number>();
  for (const st of snap.structures) seen.add(st.id);
  for (const st of s.structures) {
    if (!st) continue;
    const vis = mirror.visibility;
    const stillVisible = !vis || vis[st.tile] === 1 || st.owner === mirror.humanId;
    if (!seen.has(st.id) && stillVisible) {
      // Visible pero ya no existe (destruida): retirar del espejo.
      if (s.tiles[st.tile].structure === st.id) s.tiles[st.tile].structure = -1;
      st.hp = 0;
    }
  }
  for (const st of snap.structures) {
    const prev = s.structures[st.id];
    const merged: Structure = {
      id: st.id,
      kind: st.kind,
      owner: st.owner,
      tile: st.tile,
      hp: st.hp,
      maxHp: st.maxHp,
      powered: st.powered ?? prev?.powered ?? true,
      oxygenated: st.oxygenated ?? prev?.oxygenated ?? true,
      energyReserve: st.energyReserve ?? prev?.energyReserve ?? 0,
      oxygenReserve: st.oxygenReserve ?? prev?.oxygenReserve ?? 0,
      builtAt: prev?.builtAt ?? snap.elapsed,
    };
    s.structures[st.id] = merged;
    s.tiles[st.tile].structure = st.id;
  }

  // Aristas: reemplazo completo de las conocidas este tick (pocas).
  s.edges = snap.edges.map((e) => ({
    id: e.id,
    kind: e.kind,
    owner: e.owner,
    a: e.a,
    b: e.b,
    status: e.status,
    hp: e.hp,
    maxHp: e.maxHp,
    aTile: e.aTile,
    bTile: e.bTile,
  }));

  s.rovers = snap.rovers.map((r) => ({
    id: r.id,
    kind: r.kind,
    owner: r.owner,
    x: r.x,
    y: r.y,
    order: null,
    edgeId: -1,
    progress: 0,
  }));

  for (const pub of snap.players) {
    const p = s.players[pub.id];
    if (!p) continue;
    p.alive = pub.alive;
    p.evacuated = pub.evacuated;
  }

  const me = s.players[mirror.humanId];
  const you = snap.you;
  me.stocks = you.stocks as Player["stocks"];
  me.capacity = you.capacity as Player["capacity"];
  me.netRates = you.netRates as Player["netRates"];
  me.population = you.population;
  me.expandTarget = you.expandTarget;
  me.control = you.control;
  me.controlHoldSeconds = you.controlHoldSeconds;
  me.respawnsLeft = you.respawnsLeft;
  me.evacUntil = you.evacUntil;
  me.protectionUntil = you.protectionUntil;
  me.alive = you.alive;
  me.evacuated = you.evacuated;

  // Exploración acumulada del cliente (memoria propia, sin fuga: solo
  // registra lo que el servidor ya dejó ver).
  if (mirror.visibility) {
    for (let i = 0; i < mirror.visibility.length; i++) {
      if (mirror.visibility[i]) {
        me.explored[i] = 1;
        me.lastSeen[i] = snap.tickCount;
      }
    }
  }

  for (const ev of snap.events) s.events.push(ev);
  if (s.events.length > 400) s.events.splice(0, s.events.length - 400);
}
