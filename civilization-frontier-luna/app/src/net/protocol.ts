/**
 * Protocolo JSON del multijugador privado. El servidor es la única autoridad:
 * los clientes envían `Command`s y reciben snapshots ya filtrados por su
 * niebla — nunca el estado completo de la partida.
 */
import type { Command, Deposit, EdgeKind, EdgeStatus, MatchEvent, Phase, StructureKind, Terrain } from "../sim/types";

export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 8790;

/** RLE simple [valor, longitud, valor, longitud, ...] */
export type Rle = number[];

export function encodeRle(values: ArrayLike<number>): Rle {
  const out: number[] = [];
  let i = 0;
  while (i < values.length) {
    const v = values[i];
    let run = 1;
    while (i + run < values.length && values[i + run] === v) run++;
    out.push(v, run);
    i += run;
  }
  return out;
}

export function decodeRle(rle: Rle, length: number): Int16Array {
  const out = new Int16Array(length);
  let pos = 0;
  for (let k = 0; k < rle.length; k += 2) {
    const v = rle[k];
    const run = rle[k + 1];
    out.fill(v, pos, pos + run);
    pos += run;
  }
  return out;
}

// ------------------------------------------------------------ cliente → servidor

export type ClientMessage =
  | { type: "create_room"; name: string; botCount: number; seed?: number }
  | { type: "join_room"; code: string; name: string }
  | { type: "start_game" }
  | { type: "command"; seq: number; cmd: Command }
  | { type: "ping"; t: number };

// ------------------------------------------------------------ servidor → cliente

export interface LobbyPlayer {
  playerId: number;
  name: string;
  color: string;
  connected: boolean;
  isHost: boolean;
}

export interface SnapshotStructure {
  id: number;
  kind: StructureKind;
  owner: number;
  tile: number;
  hp: number;
  maxHp: number;
  /** solo estructuras propias */
  powered?: boolean;
  oxygenated?: boolean;
  energyReserve?: number;
  oxygenReserve?: number;
}

export interface SnapshotEdge {
  id: number;
  kind: EdgeKind;
  owner: number;
  a: number;
  b: number;
  aTile: number;
  bTile: number;
  status: EdgeStatus;
  hp: number;
  maxHp: number;
}

export interface SnapshotRover {
  id: number;
  kind: "explorer" | "logistics";
  owner: number;
  x: number;
  y: number;
}

export interface PublicPlayer {
  id: number;
  name: string;
  color: string;
  human: boolean;
  alive: boolean;
  evacuated: boolean;
}

export interface OwnPlayer {
  stocks: Record<string, number>;
  capacity: Record<string, number>;
  netRates: Record<string, number>;
  population: number;
  expandTarget: number;
  control: number;
  controlHoldSeconds: number;
  respawnsLeft: number;
  evacUntil: number;
  protectionUntil: number;
  alive: boolean;
  evacuated: boolean;
}

/** Snapshot por tick, filtrado para un jugador concreto. */
export interface SnapshotMessage {
  type: "snapshot";
  phase: Phase;
  elapsed: number;
  tickCount: number;
  /** visibilidad actual (RLE de 0/1); ausente en spawn (mapa abierto) */
  visibility?: Rle;
  /** cambios de propiedad: pares [tile, owner] de tiles visibles que cambiaron */
  ownerChanges: number[];
  /** depósitos recién revelados: pares [tile, depositCode] (1=min, 2=hielo) */
  depositReveals: number[];
  /** estructuras actualmente conocidas (visibles o propias) */
  structures: SnapshotStructure[];
  /** aristas propias + enemigas con ambos extremos explorados */
  edges: SnapshotEdge[];
  rovers: SnapshotRover[];
  players: PublicPlayer[];
  you: OwnPlayer;
  /** eventos nuevos desde el último snapshot (globales + propios) */
  events: MatchEvent[];
  winner: number;
}

export interface FinishedStats {
  id: number;
  name: string;
  color: string;
  human: boolean;
  alive: boolean;
  control: number;
  territory: number;
  population: number;
  structuresBuilt: number;
  edgesCut: number;
  score: number;
}

export type ServerMessage =
  | { type: "error"; reason: string }
  | { type: "lobby"; code: string; yourPlayerId: number; players: LobbyPlayer[]; botCount: number }
  | {
      type: "game_start";
      protocol: number;
      yourPlayerId: number;
      cols: number;
      rows: number;
      targetMinutes: number;
      victoryThreshold: number;
      victoryHoldSeconds: number;
      terrain: Rle; // códigos de TERRAIN_CODES
      playerColors: string[];
      playerNames: string[];
      humanCount: number;
      botCount: number;
    }
  | SnapshotMessage
  | { type: "cmd_result"; seq: number; ok: boolean; reason?: string }
  | { type: "match_finished"; winner: number; stats: FinishedStats[] }
  | { type: "pong"; t: number };

export const TERRAIN_CODES: Terrain[] = ["mare", "highland", "crater", "polar_shadow", "corridor"];
export const DEPOSIT_CODES: Deposit[] = ["none", "minerals", "water_ice"];
