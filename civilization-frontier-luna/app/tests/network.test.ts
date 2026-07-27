import { describe, expect, it } from "vitest";
import { startedMatch } from "./helpers";
import { tick } from "../src/sim/tick";
import { applyCommand } from "../src/sim/commands";
import { homeStructure } from "../src/sim/match";
import { neighbors4 } from "../src/sim/grid";

function freeTiles(state: ReturnType<typeof startedMatch>, playerId: number, count: number): number[] {
  const home = state.structures[homeStructure(state, playerId)].tile;
  const queue = [home];
  const seen = new Set([home]);
  const out: number[] = [];
  while (queue.length && out.length < count) {
    const cur = queue.shift()!;
    if (state.tiles[cur].owner === playerId && state.tiles[cur].structure === -1 && state.tiles[cur].terrain !== "polar_shadow") {
      out.push(cur);
    }
    for (const n of neighbors4(cur, state.config.cols, state.config.rows)) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return out;
}

describe("redes", () => {
  it("no permite conectar estructuras ajenas ni duplicar aristas", () => {
    const state = startedMatch(31337, 3);
    const hab = state.structures[homeStructure(state, 0)];
    const enemyHab = state.structures.find((s) => s.kind === "habitat" && s.owner !== 0)!;
    expect(applyCommand(state, { type: "connect", playerId: 0, kind: "energy_line", a: hab.id, b: enemyHab.id }).ok).toBe(false);

    const [t] = freeTiles(state, 0, 1);
    applyCommand(state, { type: "build", playerId: 0, kind: "generator", tile: t });
    const gen = state.structures.find((s) => s.kind === "generator" && s.owner === 0)!;
    expect(applyCommand(state, { type: "connect", playerId: 0, kind: "energy_line", a: gen.id, b: hab.id }).ok).toBe(true);
    expect(applyCommand(state, { type: "connect", playerId: 0, kind: "energy_line", a: hab.id, b: gen.id }).ok).toBe(false);
  });

  it("una ruta comercial requiere un puerto lunar y genera ingresos", () => {
    const state = startedMatch(31337, 1);
    const p = state.players[0];
    const hab = state.structures[homeStructure(state, 0)];
    const tiles = freeTiles(state, 0, 3);
    p.stocks.minerals = 500;
    p.stocks.energy = 200;

    applyCommand(state, { type: "build", playerId: 0, kind: "generator", tile: tiles[0] });
    const gen = state.structures.find((s) => s.kind === "generator" && s.owner === 0)!;
    applyCommand(state, { type: "connect", playerId: 0, kind: "energy_line", a: gen.id, b: hab.id });

    // Sin puerto: rechazada.
    expect(applyCommand(state, { type: "connect", playerId: 0, kind: "trade_route", a: hab.id, b: gen.id }).ok).toBe(false);

    applyCommand(state, { type: "build", playerId: 0, kind: "lunar_port", tile: tiles[1] });
    const port = state.structures.find((s) => s.kind === "lunar_port" && s.owner === 0)!;
    applyCommand(state, { type: "connect", playerId: 0, kind: "energy_line", a: gen.id, b: port.id });
    expect(applyCommand(state, { type: "connect", playerId: 0, kind: "trade_route", a: port.id, b: hab.id }).ok).toBe(true);

    tick(state);
    p.stocks.minerals = 100;
    const before = 100;
    for (let i = 0; i < 20; i++) tick(state);
    expect(p.stocks.minerals).toBeGreaterThan(before - 20); // ingresos compensan reparaciones
    expect(p.stats.tradeIncome).toBeGreaterThan(0);
    // Rover logístico creado sobre la ruta.
    expect(state.rovers.some((r) => r.kind === "logistics" && r.owner === 0)).toBe(true);
  });

  it("cortar una línea de energía deja la estructura tirando de reserva (causa → efecto → recuperación)", () => {
    const state = startedMatch(31337, 1);
    const hab = state.structures[homeStructure(state, 0)];
    const [t] = freeTiles(state, 0, 1);
    applyCommand(state, { type: "build", playerId: 0, kind: "generator", tile: t });
    const gen = state.structures.find((s) => s.kind === "generator" && s.owner === 0)!;
    applyCommand(state, { type: "connect", playerId: 0, kind: "energy_line", a: gen.id, b: hab.id });
    tick(state);
    expect(hab.powered).toBe(true);

    // Corte forzoso (equivalente autoritativo de un sabotaje consumado).
    const edge = state.edges.find((e) => e.owner === 0 && e.kind === "energy_line")!;
    edge.hp = 0;
    edge.status = "cut";
    tick(state);
    expect(hab.powered).toBe(false);
    expect(hab.energyReserve).toBeGreaterThan(0); // ventana de reacción, no muerte instantánea

    // Recuperación: la reparación automática termina reconectando.
    state.players[0].stocks.minerals = 300;
    let recovered = false;
    for (let i = 0; i < 600 && !recovered; i++) {
      tick(state);
      recovered = hab.powered;
    }
    expect(recovered).toBe(true);
  });

  it("el sabotaje enemigo requiere alcance", () => {
    const state = startedMatch(31337, 7);
    // El humano acaba de aterrizar: las redes de bots lejanas no son saboteables.
    for (const edge of state.edges) {
      if (edge.owner !== 0) {
        const res = applyCommand(state, { type: "sabotage_edge", playerId: 0, edgeId: edge.id });
        expect(res.ok).toBe(false);
      }
    }
  });
});
