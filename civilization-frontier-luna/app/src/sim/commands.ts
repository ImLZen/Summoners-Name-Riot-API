/**
 * Punto único de entrada de acciones. Cada comando se valida contra el
 * estado autoritativo: el cliente nunca muta recursos, territorio o redes
 * directamente (regla no negociable de PROJECT.md).
 */
import type { Command, CommandResult, MatchState } from "./types";
import { EDGE_SABOTAGE_DAMAGE, SABOTAGE_COST_ENERGY, STRUCTURES } from "./constants";
import { allHumansLanded, isValidSpawn, landPlayer, placeBots, pushEvent, rngOf, saveRng } from "./match";
import { addEdge, validateEdge } from "./network";
import { attackTile } from "./territory";
import { addStructure } from "./match";
import { computeVisibility } from "./fog";
import { neighbors4, tilesOnSegment, xyOf } from "./grid";
import { structureOperating } from "./economy";

export function applyCommand(state: MatchState, cmd: Command): CommandResult {
  const p = state.players[cmd.playerId];
  if (!p) return { ok: false, reason: "Jugador inexistente" };

  switch (cmd.type) {
    case "select_spawn": {
      if (state.phase !== "spawn_selection") return { ok: false, reason: "La partida ya ha empezado" };
      if (!p.human) return { ok: false, reason: "Solo humanos eligen spawn manualmente" };
      if (p.alive) return { ok: false, reason: "Ya has alunizado" };
      if (!isValidSpawn(state, cmd.tile, cmd.playerId)) return { ok: false, reason: "Punto de alunizaje no válido" };
      landPlayer(state, cmd.playerId, cmd.tile, false);
      pushEvent(state, `${p.name} ha alunizado.`, false, -1);
      // La partida arranca cuando todos los humanos han alunizado.
      if (allHumansLanded(state)) {
        placeBots(state);
        state.phase = "running";
        pushEvent(state, "Colonización iniciada. Energía y oxígeno primero.", true, -1);
      }
      return { ok: true };
    }

    case "build": {
      if (state.phase !== "running" || !p.alive) return { ok: false, reason: "No puedes construir ahora" };
      const spec = STRUCTURES[cmd.kind];
      const tile = state.tiles[cmd.tile];
      if (!tile) return { ok: false, reason: "Tile inexistente" };
      if (tile.owner !== cmd.playerId) return { ok: false, reason: "Solo en territorio propio" };
      if (tile.structure !== -1) return { ok: false, reason: "Tile ocupado" };
      if (spec.requiresDeposit && tile.deposit !== spec.requiresDeposit) {
        return {
          ok: false,
          reason: spec.requiresDeposit === "minerals" ? "Requiere un depósito de minerales" : "Requiere un depósito de hielo",
        };
      }
      for (const [res, amount] of Object.entries(spec.cost)) {
        if (p.stocks[res as keyof typeof p.stocks] < (amount ?? 0)) return { ok: false, reason: "Recursos insuficientes" };
      }
      for (const [res, amount] of Object.entries(spec.cost)) {
        p.stocks[res as keyof typeof p.stocks] -= amount ?? 0;
      }
      addStructure(state, cmd.kind, cmd.playerId, cmd.tile);
      p.stats.structuresBuilt++;
      if (p.human) pushEvent(state, `${spec.label} construido.`, false, cmd.playerId);
      return { ok: true };
    }

    case "connect": {
      if (state.phase !== "running" || !p.alive) return { ok: false, reason: "No puedes conectar ahora" };
      const validation = validateEdge(state, cmd.playerId, cmd.kind, cmd.a, cmd.b);
      if (!validation.ok) return { ok: false, reason: validation.reason };
      if (p.stocks.minerals < validation.cost!) return { ok: false, reason: "Minerales insuficientes" };
      p.stocks.minerals -= validation.cost!;
      addEdge(state, cmd.playerId, cmd.kind, cmd.a, cmd.b);
      p.stats.edgesBuilt++;
      return { ok: true };
    }

    case "expand_toward": {
      if (state.phase !== "running" || !p.alive) return { ok: false, reason: "No puedes expandirte ahora" };
      const tile = state.tiles[cmd.tile];
      if (!tile) return { ok: false, reason: "Tile inexistente" };
      if (tile.owner === cmd.playerId) return { ok: false, reason: "Ya es tu territorio" };
      p.expandTarget = cmd.tile;
      return { ok: true };
    }

    case "attack_tile": {
      if (state.phase !== "running" || !p.alive) return { ok: false, reason: "No puedes atacar ahora" };
      const rng = rngOf(state);
      const ok = attackTile(state, p, cmd.tile, rng);
      saveRng(state, rng);
      return ok ? { ok: true } : { ok: false, reason: "Ataque no válido (adyacencia, protección o recursos)" };
    }

    case "sabotage_edge": {
      if (state.phase !== "running" || !p.alive) return { ok: false, reason: "No puedes sabotear ahora" };
      const edge = state.edges.find((e) => e.id === cmd.edgeId);
      if (!edge || edge.status === "cut") return { ok: false, reason: "Conexión inexistente" };
      if (edge.owner === cmd.playerId) return { ok: false, reason: "Es tu propia conexión" };
      if (state.elapsed < state.players[edge.owner].protectionUntil) return { ok: false, reason: "Objetivo protegido" };
      if (p.stocks.energy < SABOTAGE_COST_ENERGY) return { ok: false, reason: "Energía insuficiente" };
      // Alcance: algún tile del trazado debe ser visible y estar junto a
      // territorio propio o bajo un rover propio.
      const a = state.structures[edge.a];
      const b = state.structures[edge.b];
      const visible = computeVisibility(state, cmd.playerId);
      const cols = state.config.cols;
      const rows = state.config.rows;
      const reachable = tilesOnSegment(a.tile, b.tile, cols).some(
        (t) =>
          visible[t] &&
          (state.tiles[t].owner === cmd.playerId ||
            neighbors4(t, cols, rows).some((n) => state.tiles[n].owner === cmd.playerId)),
      );
      if (!reachable) return { ok: false, reason: "Conexión fuera de alcance" };
      p.stocks.energy -= SABOTAGE_COST_ENERGY;
      p.stats.attacksLaunched++;
      edge.hp -= EDGE_SABOTAGE_DAMAGE;
      if (edge.hp <= edge.maxHp * 0.35 && edge.status === "operational") edge.status = "damaged";
      if (edge.hp <= 0) {
        edge.hp = 0;
        edge.status = "cut";
        p.stats.edgesCut++;
        pushEvent(state, `${p.name} ha cortado una conexión de ${state.players[edge.owner].name}.`, true);
      }
      return { ok: true };
    }

    case "move_rover": {
      if (state.phase !== "running" || !p.alive) return { ok: false, reason: "Rover no disponible" };
      const rover = state.rovers.find((r) => r.id === cmd.roverId && r.owner === cmd.playerId);
      if (!rover || rover.kind !== "explorer") return { ok: false, reason: "Rover no válido" };
      if (!state.tiles[cmd.tile]) return { ok: false, reason: "Destino no válido" };
      rover.order = { targetTile: cmd.tile };
      return { ok: true };
    }

    case "respawn": {
      if (state.phase !== "running") return { ok: false, reason: "La partida no está activa" };
      if (!p.evacuated || p.respawnsLeft <= 0) return { ok: false, reason: "Sin evacuación pendiente" };
      if (state.elapsed < p.evacUntil) return { ok: false, reason: "Evacuación en curso" };
      if (!isValidSpawn(state, cmd.tile, cmd.playerId)) return { ok: false, reason: "Punto de alunizaje no válido" };
      p.respawnsLeft--;
      landPlayer(state, cmd.playerId, cmd.tile, true);
      pushEvent(state, `${p.name} ha realunizado y funda una colonia sucesora.`, true, cmd.playerId);
      return { ok: true };
    }

    default:
      return { ok: false, reason: "Comando desconocido" };
  }
}

/** ¿Puede operar este jugador (para la UI)? Reexporta utilidades del núcleo. */
export { structureOperating, xyOf };
