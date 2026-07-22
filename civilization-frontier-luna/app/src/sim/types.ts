/**
 * Tipos del núcleo determinista. El estado completo de la partida vive en
 * `MatchState` y solo muta dentro de `tick()` o al aplicar comandos validados,
 * de modo que un futuro servidor autoritativo pueda reutilizarlo sin cambios.
 */

export type Terrain = "mare" | "highland" | "crater" | "polar_shadow" | "corridor";

export type Deposit = "none" | "minerals" | "water_ice";

export type ResourceKind = "energy" | "oxygen" | "minerals" | "water_ice";

export type StructureKind =
  | "habitat"
  | "generator"
  | "oxygen_node"
  | "mine"
  | "ice_extractor"
  | "control_point"
  | "lunar_port";

export type EdgeKind = "energy_line" | "oxygen_conduit" | "trade_route";

export type EdgeStatus = "operational" | "damaged" | "cut";

export interface Tile {
  terrain: Terrain;
  deposit: Deposit;
  /** -1 = neutral */
  owner: number;
  /** id de estructura o -1 */
  structure: number;
  /** true si algún jugador humano/bot la disputa este tick (solo para render) */
  contestedBy: number;
}

export interface Structure {
  id: number;
  kind: StructureKind;
  owner: number;
  tile: number;
  hp: number;
  maxHp: number;
  /** true si le llega energía por la red este tick */
  powered: boolean;
  /** solo hábitats: true si le llega oxígeno */
  oxygenated: boolean;
  /** segundos de reserva restantes cuando pierde suministro */
  energyReserve: number;
  oxygenReserve: number;
  /** construida en el segundo de partida */
  builtAt: number;
}

export interface NetworkEdge {
  id: number;
  kind: EdgeKind;
  owner: number;
  /** ids de estructura en los extremos */
  a: number;
  b: number;
  status: EdgeStatus;
  hp: number;
  maxHp: number;
}

export interface RoverOrder {
  targetTile: number;
}

export interface Rover {
  id: number;
  kind: "explorer" | "logistics";
  owner: number;
  /** posición en tiles con subprecisión */
  x: number;
  y: number;
  order: RoverOrder | null;
  /** ruta comercial asociada (rovers logísticos) */
  edgeId: number;
  /** progreso 0..1 a lo largo de la arista */
  progress: number;
}

export type BotArchetype = "engineer" | "prospector" | "expansive" | "saboteur";

export interface PlayerStats {
  tilesClaimed: number;
  structuresBuilt: number;
  edgesBuilt: number;
  edgesCut: number;
  structuresLost: number;
  tradeIncome: number;
  attacksLaunched: number;
}

export interface Player {
  id: number;
  name: string;
  human: boolean;
  archetype: BotArchetype | null;
  color: string;
  alive: boolean;
  /** evacuado esperando realunizaje */
  evacuated: boolean;
  respawnsLeft: number;
  evacUntil: number;
  protectionUntil: number;
  stocks: Record<ResourceKind, number>;
  /** capacidad de almacenamiento por recurso */
  capacity: Record<ResourceKind, number>;
  /** producción neta del último tick, por segundo (para UI y bots) */
  netRates: Record<ResourceKind, number>;
  population: number;
  /** tile objetivo de expansión (humano) o -1 */
  expandTarget: number;
  /** puntuación de control estratégico 0..100 */
  control: number;
  /** segundos consecutivos por encima del umbral de victoria */
  controlHoldSeconds: number;
  score: number;
  stats: PlayerStats;
  /** memoria de niebla: bitset por tile de "explorado alguna vez" */
  explored: Uint8Array;
  /** tick de última visión por tile (0 = nunca), para info desactualizada */
  lastSeen: Uint32Array;
}

export interface MatchEvent {
  at: number;
  text: string;
  important: boolean;
  /** jugador al que atañe o -1 global */
  playerId: number;
}

export interface MatchConfig {
  seed: number;
  cols: number;
  rows: number;
  botCount: number;
  targetMinutes: number;
  /** umbral 0..100 de control estratégico */
  victoryThreshold: number;
  /** segundos que hay que mantener el umbral */
  victoryHoldSeconds: number;
}

export type Phase = "spawn_selection" | "running" | "finished";

export interface MatchState {
  config: MatchConfig;
  /** estado interno del RNG (mulberry32) */
  rngState: number;
  phase: Phase;
  /** segundos simulados */
  elapsed: number;
  tickCount: number;
  tiles: Tile[];
  structures: Structure[];
  edges: NetworkEdge[];
  rovers: Rover[];
  players: Player[];
  events: MatchEvent[];
  nextStructureId: number;
  nextEdgeId: number;
  nextRoverId: number;
  winner: number;
}

/** Comandos que un cliente (humano o bot) puede pedir; el núcleo los valida. */
export type Command =
  | { type: "select_spawn"; playerId: number; tile: number }
  | { type: "build"; playerId: number; kind: StructureKind; tile: number }
  | { type: "connect"; playerId: number; kind: EdgeKind; a: number; b: number }
  | { type: "expand_toward"; playerId: number; tile: number }
  | { type: "attack_tile"; playerId: number; tile: number }
  | { type: "sabotage_edge"; playerId: number; edgeId: number }
  | { type: "move_rover"; playerId: number; roverId: number; tile: number }
  | { type: "respawn"; playerId: number; tile: number };

export interface CommandResult {
  ok: boolean;
  reason?: string;
}
