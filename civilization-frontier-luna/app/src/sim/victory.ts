/**
 * Victoria por control estratégico (GDD §13): territorio sostenible,
 * puntos de control y puertos operativos. El umbral debe mantenerse
 * durante un tiempo de confirmación; al corte gana la puntuación más alta.
 */
import type { MatchState, Player } from "./types";
import { pushEvent } from "./match";
import { isTradeRouteOperational } from "./network";
import { structureOperating } from "./economy";

export function updateControl(state: MatchState, dt: number): void {
  const totalTiles = state.tiles.length;
  const counts = new Map<number, number>();
  for (const t of state.tiles) {
    if (t.owner >= 0) counts.set(t.owner, (counts.get(t.owner) ?? 0) + 1);
  }
  for (const p of state.players) {
    const territory = counts.get(p.id) ?? 0;
    let controlPoints = 0;
    let ports = 0;
    for (const st of state.structures) {
      if (st.owner !== p.id || st.hp <= 0) continue;
      if (st.kind === "control_point" && structureOperating(st)) controlPoints++;
      if (st.kind === "lunar_port" && structureOperating(st)) ports++;
    }
    let activeRoutes = 0;
    for (const e of state.edges) {
      if (e.owner === p.id && isTradeRouteOperational(state, e)) activeRoutes++;
    }
    const territoryShare = territory / totalTiles;
    p.control = Math.min(100, territoryShare * 320 + controlPoints * 9 + ports * 7 + activeRoutes * 4);
    p.score = Math.round(
      territory * 2 +
        p.population * 1.5 +
        controlPoints * 40 +
        ports * 35 +
        activeRoutes * 25 +
        p.stats.structuresBuilt * 10 +
        p.stats.edgesCut * 15,
    );
    if (p.alive && p.control >= state.config.victoryThreshold) {
      p.controlHoldSeconds += dt;
    } else {
      p.controlHoldSeconds = 0;
    }
  }
}

export function checkVictory(state: MatchState): void {
  if (state.phase !== "running") return;
  for (const p of state.players) {
    if (p.alive && p.controlHoldSeconds >= state.config.victoryHoldSeconds) {
      finish(state, p);
      return;
    }
  }
  // Corte por tiempo.
  if (state.elapsed >= state.config.targetMinutes * 60) {
    const ranked = [...state.players].sort((a, b) => b.score - a.score);
    finish(state, ranked[0]);
    return;
  }
  // Solo queda un jugador con colonia.
  const withColony = state.players.filter((p) => p.alive);
  const pendingReturn = state.players.filter((p) => p.evacuated && p.respawnsLeft > 0);
  if (withColony.length === 1 && pendingReturn.length === 0 && state.elapsed > 60) {
    finish(state, withColony[0]);
  }
}

function finish(state: MatchState, winner: Player): void {
  state.phase = "finished";
  state.winner = winner.id;
  pushEvent(state, `${winner.name} domina la región lunar. Fin de la partida.`, true);
}
