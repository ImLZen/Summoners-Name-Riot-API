import { createMatch, defaultConfig, isValidSpawn } from "../src/sim/match";
import { applyCommand } from "../src/sim/commands";
import type { MatchState } from "../src/sim/types";

/** Crea una partida y aluniza al humano en el primer punto válido. */
export function startedMatch(seed = 12345, botCount = 7): MatchState {
  const config = defaultConfig(seed);
  config.botCount = botCount;
  const state = createMatch(config);
  for (let i = 0; i < state.tiles.length; i++) {
    if (isValidSpawn(state, i, 0)) {
      const res = applyCommand(state, { type: "select_spawn", playerId: 0, tile: i });
      if (res.ok) return state;
    }
  }
  throw new Error("No se encontró spawn válido");
}

/** Hash sencillo y estable del estado para comparar determinismo. */
export function stateHash(state: MatchState): string {
  let h = 2166136261;
  const mix = (n: number) => {
    h ^= n & 0xffffffff;
    h = Math.imul(h, 16777619);
    h ^= Math.floor(n * 1000) & 0xffffffff;
    h = Math.imul(h, 16777619);
  };
  mix(state.rngState);
  mix(state.tickCount);
  mix(Math.round(state.elapsed * 1000));
  for (const t of state.tiles) {
    mix(t.owner + 2);
    mix(t.structure + 2);
  }
  for (const st of state.structures) {
    mix(st.id);
    mix(Math.round(st.hp * 100));
    mix(st.powered ? 1 : 0);
    mix(Math.round(st.energyReserve * 100));
  }
  for (const e of state.edges) {
    mix(e.id);
    mix(Math.round(e.hp * 100));
  }
  for (const p of state.players) {
    mix(Math.round(p.population * 1000));
    for (const r of ["energy", "oxygen", "minerals", "water_ice"] as const) {
      mix(Math.round(p.stocks[r] * 1000));
    }
    mix(Math.round(p.control * 1000));
    mix(p.alive ? 1 : 0);
  }
  for (const r of state.rovers) {
    mix(r.id);
    mix(Math.round(r.x * 1000));
    mix(Math.round(r.y * 1000));
  }
  return (h >>> 0).toString(16);
}
