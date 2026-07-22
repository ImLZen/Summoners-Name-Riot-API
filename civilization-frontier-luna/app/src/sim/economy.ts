/**
 * Economía autoritativa de cuatro recursos (GDD §4). Producción y consumo
 * por segundo; las estructuras sin suministro tiran de reserva y se degradan
 * con una ventana de reacción visible en lugar de morir al instante.
 */
import type { MatchState, Player, Structure } from "./types";
import {
  BASE_CAPACITY,
  HABITAT_CAPACITY_BONUS,
  OXYGEN_PER_POP,
  POP_GROWTH,
  POP_PER_HABITAT,
  PRODUCTION,
  RESOURCES,
  STRUCTURES,
} from "./constants";
import { isTradeRouteOperational } from "./network";
import { pushEvent } from "./match";

function habitats(state: MatchState, playerId: number): Structure[] {
  return state.structures.filter((s) => s.owner === playerId && s.kind === "habitat" && s.hp > 0);
}

export function stepEconomy(state: MatchState, dt: number): void {
  for (const p of state.players) {
    if (!p.alive) continue;
    const before: Record<string, number> = {};
    for (const r of RESOURCES) before[r] = p.stocks[r];

    updateCapacity(state, p);
    produce(state, p, dt);
    consume(state, p, dt);
    growPopulation(state, p, dt);
    clampStocks(p);

    for (const r of RESOURCES) p.netRates[r] = (p.stocks[r] - before[r]) / dt;
  }
  tradeIncome(state, dt);
}

function updateCapacity(state: MatchState, p: Player): void {
  const habs = habitats(state, p.id).length;
  for (const r of RESOURCES) {
    p.capacity[r] = BASE_CAPACITY[r] + HABITAT_CAPACITY_BONUS[r] * habs;
  }
}

function produce(state: MatchState, p: Player, dt: number): void {
  for (const st of state.structures) {
    if (st.owner !== p.id || st.hp <= 0) continue;
    const operating = structureOperating(st);
    if (!operating) continue;
    switch (st.kind) {
      case "generator": {
        const factor = state.tiles[st.tile].terrain === "polar_shadow" ? PRODUCTION.polarShadowFactor : 1;
        p.stocks.energy += PRODUCTION.generatorEnergy * factor * dt;
        break;
      }
      case "oxygen_node": {
        const iceNeeded = PRODUCTION.oxygenNodeIceUse * dt;
        if (p.stocks.water_ice >= iceNeeded) {
          p.stocks.water_ice -= iceNeeded;
          p.stocks.oxygen += PRODUCTION.oxygenNodeOxygen * dt;
        } else {
          p.stocks.oxygen += PRODUCTION.oxygenNodeFallback * dt;
        }
        break;
      }
      case "mine":
        p.stocks.minerals += PRODUCTION.mineMinerals * dt;
        break;
      case "ice_extractor":
        p.stocks.water_ice += PRODUCTION.iceExtractorIce * dt;
        break;
      default:
        break;
    }
  }
}

/** Una estructura opera si tiene energía de red o reserva; se actualiza aquí. */
export function structureOperating(st: Structure): boolean {
  const spec = STRUCTURES[st.kind];
  if (!spec.needsPower) return true;
  return st.powered || st.energyReserve > 0;
}

function consume(state: MatchState, p: Player, dt: number): void {
  for (const st of state.structures) {
    if (st.owner !== p.id || st.hp <= 0) continue;
    const spec = STRUCTURES[st.kind];
    if (spec.needsPower) {
      if (st.powered && p.stocks.energy >= spec.energyUse * dt) {
        p.stocks.energy -= spec.energyUse * dt;
        st.energyReserve = Math.min(spec.reserveSeconds, st.energyReserve + dt * 2);
      } else {
        const hadReserve = st.energyReserve > 0;
        st.energyReserve = Math.max(0, st.energyReserve - dt);
        if (hadReserve && st.energyReserve === 0 && p.human) {
          pushEvent(state, `${spec.label} sin energía: fuera de servicio hasta reconectar.`, true, p.id);
        }
      }
    }
    if (st.kind === "habitat") {
      const oxygenNeed = OXYGEN_PER_POP * populationOf(state, p, st) * dt;
      if (st.oxygenated && p.stocks.oxygen >= oxygenNeed) {
        p.stocks.oxygen -= oxygenNeed;
        st.oxygenReserve = Math.min(spec.reserveSeconds, st.oxygenReserve + dt * 2);
      } else {
        const hadReserve = st.oxygenReserve > 0;
        st.oxygenReserve = Math.max(0, st.oxygenReserve - dt);
        if (hadReserve && st.oxygenReserve === 0) {
          pushEvent(state, `Corte de oxígeno en un hábitat de ${p.name}.`, p.human, p.id);
        }
        if (st.oxygenReserve === 0) {
          p.population = Math.max(0, p.population - 1.4 * dt);
        }
      }
    }
  }
}

/** Población asignada a un hábitat (repartida a partes iguales). */
function populationOf(state: MatchState, p: Player, _st: Structure): number {
  const habs = habitats(state, p.id).length;
  return habs > 0 ? p.population / habs : 0;
}

function growPopulation(state: MatchState, p: Player, dt: number): void {
  const habs = habitats(state, p.id);
  const cap = habs.length * POP_PER_HABITAT;
  const healthy = habs.filter((h) => h.oxygenated && h.oxygenReserve > 0 && structureOperating(h));
  if (healthy.length > 0 && p.stocks.oxygen > 10 && p.population < cap) {
    p.population += POP_GROWTH * healthy.length * dt;
  }
  if (habs.length === 0) p.population = Math.max(0, p.population - 2.5 * dt);
}

function tradeIncome(state: MatchState, dt: number): void {
  for (const edge of state.edges) {
    if (!isTradeRouteOperational(state, edge)) continue;
    const p = state.players[edge.owner];
    if (!p.alive) continue;
    p.stocks.minerals += PRODUCTION.tradeMinerals * dt;
    p.stocks.energy += PRODUCTION.tradeEnergy * dt;
    p.stats.tradeIncome += PRODUCTION.tradeMinerals * dt;
  }
}

function clampStocks(p: Player): void {
  for (const r of RESOURCES) {
    p.stocks[r] = Math.max(0, Math.min(p.capacity[r], p.stocks[r]));
  }
}
