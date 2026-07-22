/**
 * Render Canvas 2D (ADR 0007): terreno prerenderizado una vez, capas de
 * propiedad y niebla como canvases de 1 px/tile escalados sin suavizado,
 * y vectores para estructuras, redes y rovers. El cliente solo dibuja lo
 * que la visibilidad autoritativa permite; mantiene memoria local de lo ya
 * visto para mostrar información desactualizada atenuada.
 */
import type { MatchState, Structure, StructureKind } from "../sim/types";
import { computeVisibility } from "../sim/fog";
import { xyOf } from "../sim/grid";
import { Camera, TILE } from "./camera";
import { structureOperating } from "../sim/economy";

const TERRAIN_COLORS: Record<string, string> = {
  mare: "#3a3f4a",
  highland: "#565b66",
  crater: "#2e3340",
  polar_shadow: "#1c2230",
  corridor: "#454d57",
};

const EDGE_STYLE = {
  energy_line: { color: "#e8c268", width: 1.6, dash: [] as number[] },
  oxygen_conduit: { color: "#6fa8e8", width: 2.6, dash: [] as number[] },
  trade_route: { color: "#5fd6d0", width: 1.8, dash: [5, 4] },
};

export interface ClientMemory {
  knownOwner: Int16Array;
  knownStructKind: Int8Array; // -1 = ninguno; índice en STRUCT_KINDS
  knownStructOwner: Int16Array;
}

export const STRUCT_KINDS: StructureKind[] = [
  "habitat",
  "generator",
  "oxygen_node",
  "mine",
  "ice_extractor",
  "control_point",
  "lunar_port",
];

export function createMemory(tileCount: number): ClientMemory {
  return {
    knownOwner: new Int16Array(tileCount).fill(-1),
    knownStructKind: new Int8Array(tileCount).fill(-1),
    knownStructOwner: new Int16Array(tileCount).fill(-1),
  };
}

export class Renderer {
  private terrainCanvas: HTMLCanvasElement;
  private ownerCanvas: HTMLCanvasElement;
  private ownerCtx: CanvasRenderingContext2D;
  private ownerData: ImageData;
  private fogCanvas: HTMLCanvasElement;
  private fogCtx: CanvasRenderingContext2D;
  private fogData: ImageData;
  private playerRgb: Array<[number, number, number]> = [];

  constructor(
    private state: MatchState,
    private memory: ClientMemory,
  ) {
    const { cols, rows } = state.config;
    this.terrainCanvas = document.createElement("canvas");
    this.terrainCanvas.width = cols * TILE;
    this.terrainCanvas.height = rows * TILE;
    this.renderTerrain();

    this.ownerCanvas = document.createElement("canvas");
    this.ownerCanvas.width = cols;
    this.ownerCanvas.height = rows;
    this.ownerCtx = this.ownerCanvas.getContext("2d")!;
    this.ownerData = this.ownerCtx.createImageData(cols, rows);

    this.fogCanvas = document.createElement("canvas");
    this.fogCanvas.width = cols;
    this.fogCanvas.height = rows;
    this.fogCtx = this.fogCanvas.getContext("2d")!;
    this.fogData = this.fogCtx.createImageData(cols, rows);

    for (const p of state.players) this.playerRgb.push(hexToRgb(p.color));
  }

  private renderTerrain(): void {
    const { cols, rows } = this.state.config;
    const ctx = this.terrainCanvas.getContext("2d")!;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const t = this.state.tiles[y * cols + x];
        ctx.fillStyle = TERRAIN_COLORS[t.terrain];
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        // Textura sutil determinista por posición.
        if ((x * 7 + y * 13) % 5 === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.025)";
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        }
        if (t.terrain === "crater" && (x + y) % 3 === 0) {
          ctx.fillStyle = "rgba(0,0,0,0.12)";
          ctx.fillRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4);
        }
      }
    }
  }

  /** Dibuja el frame completo para el jugador humano. */
  draw(ctx: CanvasRenderingContext2D, camera: Camera, viewW: number, viewH: number, opts: DrawOptions): void {
    const state = this.state;
    const { cols, rows } = state.config;
    const visible = computeVisibility(state, 0);
    const human = state.players[0];
    const spawnMode = state.phase === "spawn_selection" || opts.respawnMode;

    // Actualizar memoria del cliente con lo visible ahora.
    const mem = this.memory;
    for (let i = 0; i < visible.length; i++) {
      if (spawnMode || visible[i]) {
        // En selección de spawn se ve la geografía y ocupación general
        // (GDD §3: el mapa está inicialmente abierto, sin recursos exactos).
        mem.knownOwner[i] = state.tiles[i].owner;
        const sid = state.tiles[i].structure;
        if (sid >= 0 && state.structures[sid].hp > 0 && (visible[i] || spawnMode)) {
          mem.knownStructKind[i] = STRUCT_KINDS.indexOf(state.structures[sid].kind);
          mem.knownStructOwner[i] = state.structures[sid].owner;
        } else {
          mem.knownStructKind[i] = -1;
          mem.knownStructOwner[i] = -1;
        }
      }
    }

    ctx.clearRect(0, 0, viewW, viewH);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(camera.scale, 0, 0, camera.scale, -camera.x * camera.scale, -camera.y * camera.scale);

    // 1. Terreno.
    ctx.drawImage(this.terrainCanvas, 0, 0);

    // 2. Propiedad (memoria del cliente: visible = vivo, recordado = atenuado).
    const od = this.ownerData.data;
    for (let i = 0; i < cols * rows; i++) {
      const owner = mem.knownOwner[i];
      const base = i * 4;
      if (owner < 0) {
        od[base + 3] = 0;
        continue;
      }
      const rgb = this.playerRgb[owner] ?? [150, 150, 150];
      od[base] = rgb[0];
      od[base + 1] = rgb[1];
      od[base + 2] = rgb[2];
      od[base + 3] = visible[i] || spawnMode ? 120 : 60;
    }
    this.ownerCtx.putImageData(this.ownerData, 0, 0);
    ctx.drawImage(this.ownerCanvas, 0, 0, cols, rows, 0, 0, cols * TILE, rows * TILE);

    // 3. Depósitos explorados.
    for (let i = 0; i < cols * rows; i++) {
      if (!spawnMode && !human.explored[i]) continue;
      if (spawnMode && !opts.revealDeposits) continue;
      const dep = state.tiles[i].deposit;
      if (dep === "none") continue;
      const [x, y] = xyOf(i, cols);
      const cx = x * TILE + TILE / 2;
      const cy = y * TILE + TILE / 2;
      if (dep === "minerals") {
        ctx.fillStyle = "#c9a27b";
        ctx.fillRect(cx - 2.4, cy - 2.4, 4.8, 4.8);
      } else {
        ctx.fillStyle = "#a8d8e8";
        ctx.beginPath();
        ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 4. Aristas de red conocidas (propias siempre; enemigas si algún extremo visible).
    for (const edge of state.edges) {
      const a = state.structures[edge.a];
      const b = state.structures[edge.b];
      if (!a || !b) continue;
      const known =
        edge.owner === 0 || visible[a.tile] || visible[b.tile] || (human.explored[a.tile] && human.explored[b.tile]);
      if (!known || (a.hp <= 0 && b.hp <= 0 && edge.status === "cut")) continue;
      if (edge.status === "cut" && edge.owner !== 0) continue;
      const [ax, ay] = xyOf(a.tile, cols);
      const [bx, by] = xyOf(b.tile, cols);
      const style = EDGE_STYLE[edge.kind];
      ctx.beginPath();
      ctx.moveTo(ax * TILE + TILE / 2, ay * TILE + TILE / 2);
      ctx.lineTo(bx * TILE + TILE / 2, by * TILE + TILE / 2);
      ctx.setLineDash(edge.status === "damaged" ? [2, 3] : style.dash);
      ctx.strokeStyle = edge.status === "cut" ? "#d0716b" : style.color;
      ctx.globalAlpha = edge.status === "cut" ? 0.55 : 0.9;
      ctx.lineWidth = style.width / Math.max(1, camera.scale * 0.45);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      if (edge.status !== "operational") {
        const mx = ((ax + bx) / 2) * TILE + TILE / 2;
        const my = ((ay + by) / 2) * TILE + TILE / 2;
        ctx.fillStyle = edge.status === "cut" ? "#d0716b" : "#e8c268";
        ctx.font = `${10 / Math.max(1, camera.scale * 0.5)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(edge.status === "cut" ? "✕" : "!", mx, my);
      }
    }

    // 5. Estructuras conocidas.
    for (let i = 0; i < cols * rows; i++) {
      const kindIdx = mem.knownStructKind[i];
      if (kindIdx < 0) continue;
      const [x, y] = xyOf(i, cols);
      const owner = mem.knownStructOwner[i];
      const stale = !visible[i] && !spawnMode;
      const live = state.tiles[i].structure >= 0 ? state.structures[state.tiles[i].structure] : undefined;
      drawStructureGlyph(
        ctx,
        STRUCT_KINDS[kindIdx],
        x * TILE + TILE / 2,
        y * TILE + TILE / 2,
        TILE,
        state.players[owner]?.color ?? "#999",
        stale,
        !stale && live ? live : undefined,
      );
    }

    // 6. Rovers visibles.
    for (const rover of state.rovers) {
      const t = Math.floor(rover.y) * cols + Math.floor(rover.x);
      if (rover.owner !== 0 && !visible[t]) continue;
      const px = rover.x * TILE;
      const py = rover.y * TILE;
      ctx.fillStyle = state.players[rover.owner].color;
      ctx.strokeStyle = "#0b0e14";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      if (rover.kind === "explorer") {
        ctx.moveTo(px, py - 3.2);
        ctx.lineTo(px + 3, py + 2.6);
        ctx.lineTo(px - 3, py + 2.6);
        ctx.closePath();
      } else {
        ctx.rect(px - 2.4, py - 2.4, 4.8, 4.8);
      }
      ctx.fill();
      ctx.stroke();
    }

    // 7. Marcas: objetivo de expansión, tiles disputados, selección.
    if (human.expandTarget >= 0) {
      const [x, y] = xyOf(human.expandTarget, cols);
      ctx.strokeStyle = "#e8c268";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
      ctx.setLineDash([]);
    }
    for (let i = 0; i < cols * rows; i++) {
      if (state.tiles[i].contestedBy >= 0 && visible[i]) {
        const [x, y] = xyOf(i, cols);
        ctx.strokeStyle = "#d0716b";
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x * TILE + 0.8, y * TILE + 0.8, TILE - 1.6, TILE - 1.6);
      }
    }
    if (opts.selectedStructure) {
      const st = opts.selectedStructure;
      const [x, y] = xyOf(st.tile, cols);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE * 0.9, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (opts.hoverTile >= 0) {
      const [x, y] = xyOf(opts.hoverTile, cols);
      ctx.strokeStyle = opts.hoverValid ? "#8fc18d" : "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1.6;
      ctx.strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
    }
    if (opts.pendingEdgeFrom) {
      const [x, y] = xyOf(opts.pendingEdgeFrom.tile, cols);
      ctx.strokeStyle = "#5fd6d0";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 8. Niebla: nada de negro total (la geografía se ve), pero sí atenuación.
    if (!spawnMode) {
      const fd = this.fogData.data;
      for (let i = 0; i < cols * rows; i++) {
        const base = i * 4;
        fd[base] = 5;
        fd[base + 1] = 7;
        fd[base + 2] = 12;
        fd[base + 3] = visible[i] ? 0 : human.explored[i] ? 96 : 150;
      }
      this.fogCtx.putImageData(this.fogData, 0, 0);
      ctx.drawImage(this.fogCanvas, 0, 0, cols, rows, 0, 0, cols * TILE, rows * TILE);
    }

    ctx.restore();
  }
}

export interface DrawOptions {
  hoverTile: number;
  hoverValid: boolean;
  selectedStructure: Structure | null;
  pendingEdgeFrom: Structure | null;
  respawnMode: boolean;
  /** en spawn no se revelan depósitos exactos */
  revealDeposits: boolean;
}

/** Siluetas inequívocas por estructura (GDD §6) en vector. */
export function drawStructureGlyph(
  ctx: CanvasRenderingContext2D,
  kind: StructureKind,
  cx: number,
  cy: number,
  size: number,
  color: string,
  stale: boolean,
  live?: Structure,
): void {
  const s = size * 0.62;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = stale ? 0.45 : 1;
  ctx.fillStyle = color;
  ctx.strokeStyle = "#0b0e14";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  switch (kind) {
    case "habitat": // cúpula
      ctx.arc(0, s * 0.25, s, Math.PI, 0);
      ctx.closePath();
      break;
    case "generator": // rombo (panel)
      ctx.moveTo(0, -s);
      ctx.lineTo(s, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s, 0);
      ctx.closePath();
      break;
    case "oxygen_node": // círculo
      ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2);
      break;
    case "mine": // triángulo invertido
      ctx.moveTo(-s, -s * 0.7);
      ctx.lineTo(s, -s * 0.7);
      ctx.lineTo(0, s);
      ctx.closePath();
      break;
    case "ice_extractor": // hexágono
      for (let a = 0; a < 6; a++) {
        const ang = (Math.PI / 3) * a - Math.PI / 6;
        const px = Math.cos(ang) * s * 0.9;
        const py = Math.sin(ang) * s * 0.9;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    case "control_point": // torre (rect + asta)
      ctx.rect(-s * 0.4, -s, s * 0.8, s * 2);
      break;
    case "lunar_port": // plataforma con muesca
      ctx.rect(-s, -s * 0.5, s * 2, s);
      ctx.moveTo(-s * 0.4, -s * 0.5);
      ctx.lineTo(0, -s * 1.1);
      ctx.lineTo(s * 0.4, -s * 0.5);
      break;
  }
  ctx.fill();
  ctx.stroke();

  // Indicadores de estado en vivo: sin energía / sin oxígeno / dañado.
  if (live) {
    if (live.hp < live.maxHp * 0.999) {
      ctx.fillStyle = "#0b0e14";
      ctx.fillRect(-s, s * 1.15, s * 2, 1.6);
      ctx.fillStyle = live.hp / live.maxHp > 0.5 ? "#8fc18d" : "#d0716b";
      ctx.fillRect(-s, s * 1.15, (s * 2 * live.hp) / live.maxHp, 1.6);
    }
    if (!structureOperating(live)) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#d0716b";
      ctx.font = `${size * 0.9}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("⚡", 0, -s * 1.2);
    } else if (kind === "habitat" && !live.oxygenated) {
      ctx.fillStyle = "#6fa8e8";
      ctx.font = `${size * 0.9}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("!", 0, -s * 1.2);
    }
  }
  ctx.restore();
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
