/**
 * Rovers: el explorador se mueve hacia órdenes del jugador y revela terreno;
 * el rover logístico es la representación abstracta del tráfico de una ruta
 * comercial (se mueve a lo largo de la arista mientras esté operativa).
 */
import type { MatchState } from "./types";
import { ROVER_SPEED } from "./constants";
import { xyOf } from "./grid";
import { isTradeRouteOperational } from "./network";

export function stepRovers(state: MatchState, dt: number): void {
  const cols = state.config.cols;

  // Alta/baja de rovers logísticos según rutas operativas.
  const activeTradeEdges = new Set<number>();
  for (const edge of state.edges) {
    if (isTradeRouteOperational(state, edge)) activeTradeEdges.add(edge.id);
  }
  for (const edge of state.edges) {
    if (!activeTradeEdges.has(edge.id)) continue;
    if (!state.rovers.some((r) => r.kind === "logistics" && r.edgeId === edge.id)) {
      const a = state.structures[edge.a];
      const [x, y] = xyOf(a.tile, cols);
      state.rovers.push({
        id: state.nextRoverId++,
        kind: "logistics",
        owner: edge.owner,
        x: x + 0.5,
        y: y + 0.5,
        order: null,
        edgeId: edge.id,
        progress: 0,
      });
    }
  }
  state.rovers = state.rovers.filter((r) => r.kind !== "logistics" || activeTradeEdges.has(r.edgeId));

  for (const rover of state.rovers) {
    if (rover.kind === "logistics") {
      const edge = state.edges.find((e) => e.id === rover.edgeId);
      if (!edge) continue;
      const a = state.structures[edge.a];
      const b = state.structures[edge.b];
      const [ax, ay] = xyOf(a.tile, cols);
      const [bx, by] = xyOf(b.tile, cols);
      const length = Math.max(1, Math.hypot(bx - ax, by - ay));
      rover.progress = (rover.progress + (ROVER_SPEED * 0.6 * dt) / length) % 1;
      const t = rover.progress < 0.5 ? rover.progress * 2 : (1 - rover.progress) * 2;
      rover.x = ax + 0.5 + (bx - ax) * t;
      rover.y = ay + 0.5 + (by - ay) * t;
      continue;
    }
    // Explorador: perece si su dueño no está ni vivo ni evacuado.
    const owner = state.players[rover.owner];
    if (!owner.alive) {
      rover.order = null;
      continue;
    }
    if (!rover.order) continue;
    const [tx, ty] = xyOf(rover.order.targetTile, cols);
    const dx = tx + 0.5 - rover.x;
    const dy = ty + 0.5 - rover.y;
    const dist = Math.hypot(dx, dy);
    const step = ROVER_SPEED * dt;
    if (dist <= step) {
      rover.x = tx + 0.5;
      rover.y = ty + 0.5;
      rover.order = null;
    } else {
      rover.x += (dx / dist) * step;
      rover.y += (dy / dist) * step;
    }
  }
}
