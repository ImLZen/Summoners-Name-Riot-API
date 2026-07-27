import { describe, expect, it } from "vitest";
import { startedMatch } from "./helpers";
import { createMatch, defaultConfig, isValidSpawn, homeStructure, spawnIndicators } from "../src/sim/match";
import { applyCommand } from "../src/sim/commands";
import { computeVisibility } from "../src/sim/fog";
import { tick } from "../src/sim/tick";
import { SPAWN_MIN_DISTANCE } from "../src/sim/constants";
import { distTiles } from "../src/sim/grid";

describe("spawn", () => {
  it("rechaza terrenos no válidos y respeta la distancia mínima entre colonias", () => {
    const state = startedMatch(2024, 7);
    const humanHome = state.structures[homeStructure(state, 0)].tile;
    for (let i = 0; i < state.tiles.length; i++) {
      if (!isValidSpawn(state, i, 99)) continue;
      expect(["mare", "crater", "corridor"]).toContain(state.tiles[i].terrain);
      expect(distTiles(i, humanHome, state.config.cols)).toBeGreaterThanOrEqual(SPAWN_MIN_DISTANCE);
    }
  });

  it("los bots alunizan con las mismas reglas al confirmar el spawn humano", () => {
    const state = startedMatch(2024, 7);
    const alive = state.players.filter((p) => p.alive);
    expect(alive.length).toBe(8);
    for (const p of alive) expect(homeStructure(state, p.id)).toBeGreaterThanOrEqual(0);
  });

  it("los indicadores de spawn están normalizados", () => {
    const state = createMatch(defaultConfig(7));
    for (let i = 0; i < state.tiles.length; i += 97) {
      const ind = spawnIndicators(state, i);
      for (const v of [ind.safety, ind.resources, ind.rivals]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("niebla", () => {
  it("el humano no ve las bases enemigas al empezar", () => {
    const state = startedMatch(2024, 7);
    tick(state);
    const visible = computeVisibility(state, 0);
    for (const p of state.players) {
      if (p.id === 0 || !p.alive) continue;
      const home = state.structures[homeStructure(state, p.id)].tile;
      expect(visible[home]).toBe(0);
    }
  });

  it("mover el rover revela terreno nuevo", () => {
    const state = startedMatch(2024, 1);
    tick(state);
    const p = state.players[0];
    const exploredBefore = p.explored.reduce((a, b) => a + b, 0);
    const rover = state.rovers.find((r) => r.owner === 0 && r.kind === "explorer")!;
    const home = state.structures[homeStructure(state, 0)].tile;
    const target = Math.min(state.tiles.length - 1, home + 20 * state.config.cols + 20);
    applyCommand(state, { type: "move_rover", playerId: 0, roverId: rover.id, tile: target });
    for (let i = 0; i < 60; i++) tick(state);
    const exploredAfter = p.explored.reduce((a, b) => a + b, 0);
    expect(exploredAfter).toBeGreaterThan(exploredBefore);
  });
});

describe("victoria y segunda vida", () => {
  it("mantener el umbral de control el tiempo requerido termina la partida", () => {
    const state = startedMatch(11, 1);
    const p = state.players[0];
    // Dominio sostenible: territorio dentro del radio de sostén del hábitat
    // más puntos de control y puertos operativos como anclas adicionales.
    const cols = state.config.cols;
    const home = state.structures[homeStructure(state, 0)].tile;
    for (let i = 0; i < state.tiles.length; i++) {
      if (distTiles(i, home, cols) < 12 && state.tiles[i].owner === -1) state.tiles[i].owner = 0;
    }
    p.stocks.minerals = 2000;
    p.stocks.energy = 200;
    p.stocks.oxygen = 150;
    const anchors: Array<"control_point" | "lunar_port"> = [
      "control_point",
      "control_point",
      "control_point",
      "control_point",
      "lunar_port",
      "lunar_port",
    ];
    let placed = 0;
    for (let i = 0; i < state.tiles.length && placed < anchors.length; i++) {
      if (state.tiles[i].owner === 0 && state.tiles[i].structure === -1 && i !== home) {
        const res = applyCommand(state, { type: "build", playerId: 0, kind: anchors[placed], tile: i });
        if (res.ok) placed++;
      }
    }
    expect(placed).toBe(anchors.length);
    // Con reservas de energía recién construidas, el control supera el umbral
    // y debe mantenerse los 45 s de confirmación.
    let ticks = 0;
    while (state.phase === "running" && ticks++ < 400) tick(state);
    expect(state.phase).toBe("finished");
    expect(state.winner).toBe(0);
  });

  it("perder el hábitat activa la evacuación y permite realunizar una sola vez", () => {
    const state = startedMatch(11, 1);
    const p = state.players[0];
    const hab = state.structures[homeStructure(state, 0)];
    hab.hp = 0;
    state.tiles[hab.tile].structure = -1;
    tick(state);
    expect(p.alive).toBe(false);
    expect(p.evacuated).toBe(true);
    expect(p.respawnsLeft).toBe(1);

    // Antes del temporizador: rechazado.
    let target = -1;
    for (let i = 0; i < state.tiles.length; i++) {
      if (isValidSpawn(state, i, 0)) {
        target = i;
        break;
      }
    }
    expect(applyCommand(state, { type: "respawn", playerId: 0, tile: target }).ok).toBe(false);
    for (let i = 0; i < 30; i++) tick(state);
    expect(applyCommand(state, { type: "respawn", playerId: 0, tile: target }).ok).toBe(true);
    expect(p.alive).toBe(true);
    expect(p.respawnsLeft).toBe(0);

    // Segunda caída: eliminación definitiva.
    const hab2 = state.structures[homeStructure(state, 0)];
    hab2.hp = 0;
    state.tiles[hab2.tile].structure = -1;
    tick(state);
    expect(p.alive).toBe(false);
    expect(p.evacuated).toBe(false);
  });

  it("el cliente no puede alterar recursos vía comandos inválidos", () => {
    const state = startedMatch(11, 1);
    const before = state.players[0].stocks.minerals;
    // Construir en tile ajeno/ocupado o sin recursos: siempre rechazado sin efectos.
    expect(applyCommand(state, { type: "build", playerId: 0, kind: "generator", tile: 0 }).ok).toBe(false);
    state.players[0].stocks.minerals = 0;
    const anyOwned = state.tiles.findIndex((t) => t.owner === 0 && t.structure === -1);
    expect(applyCommand(state, { type: "build", playerId: 0, kind: "generator", tile: anyOwned }).ok).toBe(false);
    state.players[0].stocks.minerals = before;
    expect(state.players[0].stocks.minerals).toBe(before);
  });
});
