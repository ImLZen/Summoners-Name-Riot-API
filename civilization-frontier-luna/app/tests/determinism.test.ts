import { describe, expect, it } from "vitest";
import { startedMatch, stateHash } from "./helpers";
import { tick } from "../src/sim/tick";
import { createMatch, defaultConfig } from "../src/sim/match";

describe("determinismo", () => {
  it("misma semilla → mismo mapa", () => {
    const a = createMatch(defaultConfig(777));
    const b = createMatch(defaultConfig(777));
    expect(a.tiles.map((t) => `${t.terrain}:${t.deposit}`).join("|")).toEqual(
      b.tiles.map((t) => `${t.terrain}:${t.deposit}`).join("|"),
    );
  });

  it("semillas distintas → mapas distintos", () => {
    const a = createMatch(defaultConfig(1));
    const b = createMatch(defaultConfig(2));
    expect(a.tiles.map((t) => t.terrain).join()).not.toEqual(b.tiles.map((t) => t.terrain).join());
  });

  it("misma semilla y mismos comandos → mismo estado tras 2400 ticks (20 min)", () => {
    const a = startedMatch(424242);
    const b = startedMatch(424242);
    for (let i = 0; i < 2400; i++) {
      tick(a);
      tick(b);
    }
    expect(a.elapsed).toBeCloseTo(b.elapsed);
    expect(stateHash(a)).toEqual(stateHash(b));
  });

  it("la simulación avanza sin errores hasta el corte de partida", () => {
    const state = startedMatch(99, 7);
    const maxTicks = (state.config.targetMinutes * 60) / 0.5 + 10;
    let i = 0;
    while (state.phase === "running" && i++ < maxTicks) tick(state);
    expect(state.phase).toBe("finished");
    expect(state.winner).toBeGreaterThanOrEqual(0);
  });
});
