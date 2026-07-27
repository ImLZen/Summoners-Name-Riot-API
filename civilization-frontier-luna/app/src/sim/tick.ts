/**
 * Tick autoritativo: orden fijo y determinista de subsistemas.
 * Toda mutación del estado durante la partida pasa por aquí o por
 * `applyCommand`.
 */
import type { MatchState } from "./types";
import { EVAC_SECONDS, TICK_SECONDS } from "./constants";
import { homeStructure, pushEvent, rngOf, saveRng } from "./match";
import { pruneEdges, recomputeConnectivity, repairEdges } from "./network";
import { stepEconomy } from "./economy";
import { stepExpansion, stepSustain } from "./territory";
import { stepRovers } from "./rovers";
import { updateExploration } from "./fog";
import { stepBots } from "./bots";
import { checkVictory, updateControl } from "./victory";

export function tick(state: MatchState, dt: number = TICK_SECONDS): void {
  if (state.phase !== "running") return;
  state.elapsed += dt;
  state.tickCount++;

  // Limpiar marcas de disputa del tick anterior (solo informativas).
  for (const t of state.tiles) t.contestedBy = -1;

  const rng = rngOf(state);

  pruneEdges(state);
  recomputeConnectivity(state);
  stepEconomy(state, dt);
  repairEdges(state, dt);

  for (const p of state.players) stepExpansion(state, p, dt, rng);
  stepSustain(state, dt, rng);
  stepRovers(state, dt);
  saveRng(state, rng);

  stepBots(state, dt);

  updateExploration(state);
  handleElimination(state);
  updateControl(state, dt);
  checkVictory(state);
}

/** Un jugador sin hábitats pasa a evacuación (si le queda) o eliminación. */
function handleElimination(state: MatchState): void {
  for (const p of state.players) {
    if (!p.alive) continue;
    if (homeStructure(state, p.id) >= 0 && p.population > 0.5) continue;
    p.alive = false;
    // Liberar territorio salvo tiles con estructuras supervivientes.
    for (let i = 0; i < state.tiles.length; i++) {
      if (state.tiles[i].owner === p.id) {
        state.tiles[i].owner = -1;
      }
    }
    // Las estructuras restantes quedan abandonadas (se destruyen).
    for (const st of state.structures) {
      if (st.owner === p.id && st.hp > 0) {
        st.hp = 0;
        if (state.tiles[st.tile].structure === st.id) state.tiles[st.tile].structure = -1;
      }
    }
    state.rovers = state.rovers.filter((r) => r.owner !== p.id || r.kind === "logistics");
    if (p.respawnsLeft > 0) {
      p.evacuated = true;
      p.evacUntil = state.elapsed + EVAC_SECONDS;
      pushEvent(
        state,
        p.human
          ? "Tu colonia ha caído. Población evacuada a un módulo orbital: podrás realunizar una vez."
          : `${p.name} ha evacuado su colonia.`,
        true,
        p.id,
      );
    } else {
      p.evacuated = false;
      pushEvent(state, p.human ? "Tu colonia ha caído definitivamente." : `${p.name} ha sido eliminado.`, true, p.id);
    }
  }
}
