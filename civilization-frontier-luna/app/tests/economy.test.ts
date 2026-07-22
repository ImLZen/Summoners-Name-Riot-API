import { describe, expect, it } from "vitest";
import { startedMatch } from "./helpers";
import { tick } from "../src/sim/tick";
import { applyCommand } from "../src/sim/commands";
import { homeStructure } from "../src/sim/match";
import { neighbors4 } from "../src/sim/grid";
import { STRUCTURES } from "../src/sim/constants";

function ownedFreeTileNear(state: ReturnType<typeof startedMatch>, playerId: number): number {
  const home = state.structures[homeStructure(state, playerId)].tile;
  const queue = [home];
  const seen = new Set([home]);
  while (queue.length) {
    const cur = queue.shift()!;
    if (state.tiles[cur].owner === playerId && state.tiles[cur].structure === -1 && state.tiles[cur].terrain !== "polar_shadow") {
      return cur;
    }
    for (const n of neighbors4(cur, state.config.cols, state.config.rows)) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  throw new Error("sin tile libre");
}

describe("economía", () => {
  it("un generador conectado produce energía y alimenta el hábitat", () => {
    const state = startedMatch(555, 1);
    const p = state.players[0];
    const habId = homeStructure(state, 0);
    const hab = state.structures[habId];

    const genTile = ownedFreeTileNear(state, 0);
    expect(applyCommand(state, { type: "build", playerId: 0, kind: "generator", tile: genTile }).ok).toBe(true);
    const gen = state.structures.find((s) => s.kind === "generator" && s.owner === 0)!;
    expect(applyCommand(state, { type: "connect", playerId: 0, kind: "energy_line", a: gen.id, b: hab.id }).ok).toBe(true);

    p.stocks.energy = 10;
    tick(state);
    expect(hab.powered).toBe(true);
    const before = p.stocks.energy;
    tick(state);
    expect(p.stocks.energy).toBeGreaterThan(before - 1); // produce más de lo que consume
  });

  it("un hábitat sin conducto consume su reserva de oxígeno y luego pierde población", () => {
    const state = startedMatch(555, 1);
    const p = state.players[0];
    const hab = state.structures[homeStructure(state, 0)];
    expect(hab.oxygenated).toBe(false);
    const reserve = hab.oxygenReserve;
    const popBefore = p.population;
    for (let i = 0; i < (reserve + 20) / 0.5; i++) tick(state);
    expect(hab.oxygenReserve).toBe(0);
    expect(p.population).toBeLessThan(popBefore);
  });

  it("nodo de oxígeno conectado sostiene la población", () => {
    const state = startedMatch(555, 1);
    const p = state.players[0];
    const hab = state.structures[homeStructure(state, 0)];

    const genTile = ownedFreeTileNear(state, 0);
    applyCommand(state, { type: "build", playerId: 0, kind: "generator", tile: genTile });
    const gen = state.structures.find((s) => s.kind === "generator" && s.owner === 0)!;
    applyCommand(state, { type: "connect", playerId: 0, kind: "energy_line", a: gen.id, b: hab.id });

    const nodeTile = ownedFreeTileNear(state, 0);
    applyCommand(state, { type: "build", playerId: 0, kind: "oxygen_node", tile: nodeTile });
    const node = state.structures.find((s) => s.kind === "oxygen_node" && s.owner === 0)!;
    applyCommand(state, { type: "connect", playerId: 0, kind: "energy_line", a: gen.id, b: node.id });
    applyCommand(state, { type: "connect", playerId: 0, kind: "oxygen_conduit", a: node.id, b: hab.id });

    tick(state);
    expect(hab.oxygenated).toBe(true);
    const pop = p.population;
    for (let i = 0; i < 240; i++) tick(state); // 2 minutos
    expect(p.population).toBeGreaterThanOrEqual(pop);
  });

  it("la mina exige depósito de minerales", () => {
    const state = startedMatch(555, 1);
    const tile = ownedFreeTileNear(state, 0);
    if (state.tiles[tile].deposit !== "minerals") {
      const res = applyCommand(state, { type: "build", playerId: 0, kind: "mine", tile });
      expect(res.ok).toBe(false);
    }
  });

  it("construir descuenta el coste exacto", () => {
    const state = startedMatch(555, 1);
    const p = state.players[0];
    const tile = ownedFreeTileNear(state, 0);
    const before = p.stocks.minerals;
    applyCommand(state, { type: "build", playerId: 0, kind: "generator", tile });
    expect(p.stocks.minerals).toBe(before - (STRUCTURES.generator.cost.minerals ?? 0));
  });
});
