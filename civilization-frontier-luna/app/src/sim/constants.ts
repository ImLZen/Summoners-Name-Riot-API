import type { EdgeKind, ResourceKind, StructureKind } from "./types";

/** Duración de un tick autoritativo en segundos. */
export const TICK_SECONDS = 0.5;

export const DEFAULT_COLS = 112;
export const DEFAULT_ROWS = 70;

export const RESOURCES: ResourceKind[] = ["energy", "oxygen", "minerals", "water_ice"];

export const RESOURCE_LABELS: Record<ResourceKind, string> = {
  energy: "Energía",
  oxygen: "Oxígeno",
  minerals: "Minerales",
  water_ice: "Agua/Hielo",
};

export interface StructureSpec {
  label: string;
  cost: Partial<Record<ResourceKind, number>>;
  hp: number;
  /** radio de visión en tiles */
  vision: number;
  /** consumo de energía por segundo cuando opera */
  energyUse: number;
  /** necesita línea de energía hasta un generador para operar */
  needsPower: boolean;
  /** solo puede construirse sobre este depósito */
  requiresDeposit: "minerals" | "water_ice" | null;
  /** segundos de reserva al perder suministro */
  reserveSeconds: number;
}

export const STRUCTURES: Record<StructureKind, StructureSpec> = {
  habitat: {
    label: "Hábitat",
    cost: { minerals: 60 },
    hp: 220,
    vision: 6,
    energyUse: 1.2,
    needsPower: true,
    requiresDeposit: null,
    reserveSeconds: 75,
  },
  generator: {
    label: "Generador",
    cost: { minerals: 35 },
    hp: 120,
    vision: 3,
    energyUse: 0,
    needsPower: false,
    requiresDeposit: null,
    reserveSeconds: 0,
  },
  oxygen_node: {
    label: "Nodo de oxígeno",
    cost: { minerals: 40 },
    hp: 120,
    vision: 3,
    energyUse: 1.0,
    needsPower: true,
    requiresDeposit: null,
    reserveSeconds: 45,
  },
  mine: {
    label: "Mina",
    cost: { minerals: 30, energy: 15 },
    hp: 110,
    vision: 3,
    energyUse: 1.0,
    needsPower: true,
    requiresDeposit: "minerals",
    reserveSeconds: 45,
  },
  ice_extractor: {
    label: "Extractor de hielo",
    cost: { minerals: 45, energy: 20 },
    hp: 110,
    vision: 3,
    energyUse: 1.2,
    needsPower: true,
    requiresDeposit: "water_ice",
    reserveSeconds: 45,
  },
  control_point: {
    label: "Punto de control",
    cost: { minerals: 55, energy: 25 },
    hp: 200,
    vision: 8,
    energyUse: 0.8,
    needsPower: true,
    requiresDeposit: null,
    reserveSeconds: 60,
  },
  lunar_port: {
    label: "Puerto lunar",
    cost: { minerals: 90, energy: 40 },
    hp: 180,
    vision: 5,
    energyUse: 1.5,
    needsPower: true,
    requiresDeposit: null,
    reserveSeconds: 60,
  },
};

export interface EdgeSpec {
  label: string;
  /** coste de minerales por tile de distancia */
  costPerTile: number;
  /** distancia máxima en tiles entre extremos */
  maxLength: number;
  hp: number;
  /** extremos válidos: al menos uno debe estar en esta lista, o null = cualquiera */
  endpointKinds: StructureKind[] | null;
}

export const EDGES: Record<EdgeKind, EdgeSpec> = {
  energy_line: { label: "Línea de energía", costPerTile: 2, maxLength: 18, hp: 60, endpointKinds: null },
  oxygen_conduit: { label: "Conducto de oxígeno", costPerTile: 2.5, maxLength: 18, hp: 60, endpointKinds: null },
  trade_route: {
    label: "Ruta comercial",
    costPerTile: 3,
    maxLength: 34,
    hp: 80,
    endpointKinds: ["lunar_port", "habitat"],
  },
};

/** Producción por segundo. */
export const PRODUCTION = {
  /** generador en sol pleno */
  generatorEnergy: 4.0,
  /** multiplicador en sombra polar */
  polarShadowFactor: 0.35,
  /** nodo de oxígeno: consume hielo y produce oxígeno */
  oxygenNodeOxygen: 2.6,
  oxygenNodeIceUse: 0.5,
  /** nodo sin hielo disponible: procesa regolito, mucho menos eficiente */
  oxygenNodeFallback: 0.9,
  mineMinerals: 1.6,
  iceExtractorIce: 1.4,
  /** ingreso de una ruta comercial operativa, en minerales/s */
  tradeMinerals: 0.9,
  tradeEnergy: 0.5,
};

/** Consumo de oxígeno por unidad de población y segundo. */
export const OXYGEN_PER_POP = 0.045;
/** Crecimiento de población por segundo con oxígeno de sobra (por hábitat). */
export const POP_GROWTH = 0.09;
export const POP_PER_HABITAT = 40;

export const BASE_CAPACITY: Record<ResourceKind, number> = {
  energy: 200,
  oxygen: 150,
  minerals: 400,
  water_ice: 200,
};
export const HABITAT_CAPACITY_BONUS: Record<ResourceKind, number> = {
  energy: 80,
  oxygen: 100,
  minerals: 150,
  water_ice: 80,
};

/** Recursos iniciales al alunizar. */
export const INITIAL_STOCKS: Record<ResourceKind, number> = {
  energy: 120,
  oxygen: 110,
  minerals: 210,
  water_ice: 40,
};
/** Recursos al realunizar tras evacuación. */
export const RESPAWN_STOCKS: Record<ResourceKind, number> = {
  energy: 90,
  oxygen: 90,
  minerals: 150,
  water_ice: 25,
};

export const INITIAL_POPULATION = 24;
export const RESPAWN_POPULATION = 14;

/** Expansión territorial. */
export const EXPAND_BASE_COST_ENERGY = 1.6;
export const EXPAND_BASE_COST_OXYGEN = 0.7;
export const TERRAIN_EXPAND_FACTOR: Record<string, number> = {
  mare: 1.0,
  corridor: 0.75,
  highland: 1.7,
  crater: 1.45,
  polar_shadow: 2.1,
};
/** Tiles por segundo que un jugador puede reclamar dirigiendo expansión. */
export const EXPAND_RATE = 2.4;

/** Combate abstracto. */
export const ATTACK_TILE_COST_ENERGY = 3.2;
export const ATTACK_TILE_COST_OXYGEN = 1.1;
export const STRUCTURE_DAMAGE_PER_ATTACK = 26;
export const EDGE_SABOTAGE_DAMAGE = 30;
export const SABOTAGE_COST_ENERGY = 6;
/** Factor defensivo de un punto de control sobre tiles cercanos. */
export const CONTROL_POINT_DEFENSE_RADIUS = 6;
export const CONTROL_POINT_DEFENSE_FACTOR = 0.55;

/** Distancia mínima entre spawns en tiles. */
export const SPAWN_MIN_DISTANCE = 14;
/** Radio de terreno reclamado al alunizar. */
export const SPAWN_CLAIM_RADIUS = 2;
export const SPAWN_PROTECTION_SECONDS = 45;
export const RESPAWN_PROTECTION_SECONDS = 60;
/** Segundos de evacuación antes de poder elegir nuevo alunizaje. */
export const EVAC_SECONDS = 12;

/** Rovers. */
export const ROVER_SPEED = 3.2; // tiles/s
export const ROVER_VISION = 4;
export const EXPLORER_COST_MINERALS = 25;

/** Victoria. */
export const VICTORY_THRESHOLD = 55;
export const VICTORY_HOLD_SECONDS = 45;
export const MATCH_CUTOFF_MINUTES = 28;

export const PLAYER_COLORS = [
  "#e8c268",
  "#d0716b",
  "#7fa8dc",
  "#8fc18d",
  "#a78bd4",
  "#d58aac",
  "#79bdb5",
  "#d99b63",
];

export const BOT_NAMES = ["Selene", "Korolev", "Aitken", "Tycho", "Mons", "Crisium", "Fecunda", "Umbra", "Clavius", "Rilke", "Luna-9", "Borealis", "Zenit", "Kaguya", "Surveyor"];
