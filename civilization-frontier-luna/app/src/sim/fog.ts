/**
 * Niebla de guerra (GDD §8). La geografía general es visible desde el inicio;
 * los depósitos, estructuras y actividad solo dentro del radio de visión.
 * `explored` recuerda lo visto; `lastSeen` permite mostrar información
 * desactualizada. Bots y humano usan exactamente la misma función.
 */
import type { MatchState } from "./types";
import { ROVER_VISION, STRUCTURES } from "./constants";
import { idx } from "./grid";

/**
 * Devuelve un bitset de visibilidad actual para el jugador.
 * Camino caliente: el territorio se dilata dos pasadas (radio 2 manhattan)
 * en lugar de marcar radios por tile, para evitar asignaciones por tick.
 */
export function computeVisibility(state: MatchState, playerId: number): Uint8Array {
  const cols = state.config.cols;
  const rows = state.config.rows;
  const total = cols * rows;
  const visible = new Uint8Array(total);
  const markRadius = (center: number, radius: number) => {
    const cx = center % cols;
    const cy = (center / cols) | 0;
    const r = Math.ceil(radius);
    const r2 = radius * radius;
    for (let y = Math.max(0, cy - r); y <= Math.min(rows - 1, cy + r); y++) {
      const dy = y - cy;
      for (let x = Math.max(0, cx - r); x <= Math.min(cols - 1, cx + r); x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2) visible[y * cols + x] = 1;
      }
    }
  };
  for (let i = 0; i < total; i++) {
    if (state.tiles[i].owner === playerId) visible[i] = 1;
  }
  // Dos dilataciones de 4 vecinos ≈ radio 2 alrededor del territorio.
  for (let pass = 0; pass < 2; pass++) {
    const snapshot = visible.slice();
    for (let i = 0; i < total; i++) {
      if (!snapshot[i]) continue;
      const x = i % cols;
      if (x > 0) visible[i - 1] = 1;
      if (x < cols - 1) visible[i + 1] = 1;
      if (i >= cols) visible[i - cols] = 1;
      if (i < total - cols) visible[i + cols] = 1;
    }
  }
  for (const st of state.structures) {
    if (st.owner === playerId && st.hp > 0) markRadius(st.tile, STRUCTURES[st.kind].vision);
  }
  for (const rover of state.rovers) {
    if (rover.owner === playerId) {
      markRadius(idx(Math.floor(rover.x), Math.floor(rover.y), cols), ROVER_VISION);
    }
  }
  return visible;
}

/** Actualiza memoria de exploración de todos los jugadores. */
export function updateExploration(state: MatchState): void {
  for (const p of state.players) {
    if (!p.alive && !p.evacuated) continue;
    const visible = computeVisibility(state, p.id);
    for (let i = 0; i < visible.length; i++) {
      if (visible[i]) {
        p.explored[i] = 1;
        p.lastSeen[i] = state.tickCount;
      }
    }
  }
}
