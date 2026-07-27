/**
 * Sala de partida privada autoritativa. Independiente del transporte:
 * el servidor WebSocket (index.ts) y los tests le entregan conexiones que
 * implementan `ClientConn`. Toda la verdad vive aquí; cada cliente recibe
 * solo lo que su niebla permite (docs/03-technical-architecture.md).
 */
import { createMatch, defaultConfig, homeStructure, pushEvent } from "../src/sim/match";
import { applyCommand } from "../src/sim/commands";
import { tick } from "../src/sim/tick";
import { computeVisibility } from "../src/sim/fog";
import { TICK_SECONDS, PLAYER_COLORS } from "../src/sim/constants";
import type { Command, MatchState } from "../src/sim/types";
import {
  DEPOSIT_CODES,
  PROTOCOL_VERSION,
  TERRAIN_CODES,
  encodeRle,
  type ClientMessage,
  type FinishedStats,
  type LobbyPlayer,
  type ServerMessage,
  type SnapshotEdge,
  type SnapshotMessage,
  type SnapshotRover,
  type SnapshotStructure,
} from "../src/net/protocol";

export interface ClientConn {
  send(msg: ServerMessage): void;
  close(): void;
}

const MAX_HUMANS = 16;

interface ClientSlot {
  playerId: number;
  name: string;
  conn: ClientConn | null;
  isHost: boolean;
  // seguimiento por cliente para deltas
  lastOwner: Int16Array | null;
  depositRevealed: Uint8Array | null;
  eventIndex: number;
}

export class Room {
  readonly code: string;
  botCount: number;
  seed: number;
  private slots: ClientSlot[] = [];
  private state: MatchState | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private finishedNotified = false;
  onEmpty: (() => void) | null = null;

  constructor(code: string, botCount: number, seed: number) {
    this.code = code;
    this.botCount = Math.max(0, Math.min(15, botCount));
    this.seed = seed;
  }

  get started(): boolean {
    return this.state !== null;
  }

  get humanCount(): number {
    return this.slots.length;
  }

  /** Une un cliente a la sala (o lo reconecta si el nombre coincide). */
  join(conn: ClientConn, name: string): { ok: boolean; reason?: string; playerId?: number } {
    const trimmed = name.trim().slice(0, 24) || `Colono ${this.slots.length + 1}`;
    const existing = this.slots.find((s) => s.name === trimmed && s.conn === null);
    if (existing) {
      existing.conn = conn;
      if (this.state) this.sendGameStart(existing);
      else this.broadcastLobby();
      return { ok: true, playerId: existing.playerId };
    }
    if (this.state) return { ok: false, reason: "La partida ya ha empezado" };
    if (this.slots.length >= MAX_HUMANS) return { ok: false, reason: "Sala completa (16)" };
    const slot: ClientSlot = {
      playerId: this.slots.length,
      name: trimmed,
      conn,
      isHost: this.slots.length === 0,
      lastOwner: null,
      depositRevealed: null,
      eventIndex: 0,
    };
    this.slots.push(slot);
    this.broadcastLobby();
    return { ok: true, playerId: slot.playerId };
  }

  leave(conn: ClientConn): void {
    const slot = this.slots.find((s) => s.conn === conn);
    if (!slot) return;
    slot.conn = null;
    if (!this.state) {
      // En lobby, el hueco se libera del todo y se reasignan ids.
      this.slots = this.slots.filter((s) => s !== slot);
      this.slots.forEach((s, i) => {
        s.playerId = i;
        s.isHost = i === 0;
      });
      this.broadcastLobby();
    }
    if (this.slots.every((s) => s.conn === null)) {
      this.dispose();
      this.onEmpty?.();
    }
  }

  handleMessage(conn: ClientConn, msg: ClientMessage): void {
    const slot = this.slots.find((s) => s.conn === conn);
    if (!slot) return;
    switch (msg.type) {
      case "start_game": {
        if (!slot.isHost) {
          conn.send({ type: "error", reason: "Solo el anfitrión puede empezar" });
          return;
        }
        if (this.state) return;
        this.start();
        return;
      }
      case "command": {
        if (!this.state) {
          conn.send({ type: "cmd_result", seq: msg.seq, ok: false, reason: "La partida no ha empezado" });
          return;
        }
        // Anticheat: el playerId del comando siempre es el del socket.
        const cmd = { ...msg.cmd, playerId: slot.playerId } as Command;
        const result = applyCommand(this.state, cmd);
        conn.send({ type: "cmd_result", seq: msg.seq, ok: result.ok, reason: result.reason });
        // Reacción inmediata: snapshot tras un comando aceptado para que la
        // UI no espere al siguiente tick.
        if (result.ok) this.broadcastSnapshots();
        return;
      }
      case "ping":
        conn.send({ type: "pong", t: msg.t });
        return;
      default:
        return;
    }
  }

  start(): void {
    const config = defaultConfig(this.seed);
    config.humanCount = this.slots.length;
    config.botCount = this.botCount;
    this.state = createMatch(
      config,
      this.slots.map((s) => s.name),
    );
    pushEvent(this.state, "Sala privada iniciada: elegid punto de alunizaje.", true, -1);
    for (const slot of this.slots) {
      slot.lastOwner = new Int16Array(this.state.tiles.length).fill(-1);
      slot.depositRevealed = new Uint8Array(this.state.tiles.length);
      slot.eventIndex = 0;
      if (slot.conn) this.sendGameStart(slot);
    }
    this.broadcastSnapshots();
    this.timer = setInterval(() => this.step(), TICK_SECONDS * 1000);
  }

  /** Un paso de servidor: tick autoritativo + snapshots filtrados. */
  step(): void {
    if (!this.state) return;
    if (this.state.phase === "running") tick(this.state, TICK_SECONDS);
    this.broadcastSnapshots();
    if (this.state.phase === "finished" && !this.finishedNotified) {
      this.finishedNotified = true;
      const stats = this.buildStats();
      for (const slot of this.slots) {
        slot.conn?.send({ type: "match_finished", winner: this.state.winner, stats });
      }
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    }
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private sendGameStart(slot: ClientSlot): void {
    const s = this.state!;
    slot.conn?.send({
      type: "game_start",
      protocol: PROTOCOL_VERSION,
      yourPlayerId: slot.playerId,
      cols: s.config.cols,
      rows: s.config.rows,
      targetMinutes: s.config.targetMinutes,
      victoryThreshold: s.config.victoryThreshold,
      victoryHoldSeconds: s.config.victoryHoldSeconds,
      terrain: encodeRle(s.tiles.map((t) => TERRAIN_CODES.indexOf(t.terrain))),
      playerColors: s.players.map((p) => p.color),
      playerNames: s.players.map((p) => p.name),
      humanCount: s.config.humanCount,
      botCount: s.config.botCount,
    });
    // Reset de deltas para reenviar el estado conocido tras reconexión.
    slot.lastOwner = new Int16Array(s.tiles.length).fill(-1);
    slot.depositRevealed = new Uint8Array(s.tiles.length);
    slot.eventIndex = 0;
  }

  private broadcastLobby(): void {
    const players: LobbyPlayer[] = this.slots.map((s) => ({
      playerId: s.playerId,
      name: s.name,
      color: PLAYER_COLORS[s.playerId % PLAYER_COLORS.length],
      connected: s.conn !== null,
      isHost: s.isHost,
    }));
    for (const slot of this.slots) {
      slot.conn?.send({ type: "lobby", code: this.code, yourPlayerId: slot.playerId, players, botCount: this.botCount });
    }
  }

  broadcastSnapshots(): void {
    if (!this.state) return;
    for (const slot of this.slots) {
      if (!slot.conn) continue;
      slot.conn.send(this.buildSnapshot(slot));
    }
  }

  /** Construye el snapshot filtrado por la niebla del jugador del slot. */
  buildSnapshot(slot: ClientSlot): SnapshotMessage {
    const s = this.state!;
    const playerId = slot.playerId;
    const p = s.players[playerId];
    const spawnOpen = s.phase === "spawn_selection";
    const visible = spawnOpen ? null : computeVisibility(s, playerId);

    const ownerChanges: number[] = [];
    const depositReveals: number[] = [];
    const lastOwner = slot.lastOwner!;
    const revealed = slot.depositRevealed!;
    for (let i = 0; i < s.tiles.length; i++) {
      const canSee = spawnOpen || visible![i] === 1;
      if (!canSee) continue;
      const owner = s.tiles[i].owner;
      if (owner !== lastOwner[i]) {
        ownerChanges.push(i, owner);
        lastOwner[i] = owner;
      }
      // Los depósitos exactos solo se revelan con la partida en marcha (la
      // fase de spawn muestra el mapa abierto pero no los recursos: GDD §3).
      if (!spawnOpen && !revealed[i] && s.tiles[i].deposit !== "none") {
        revealed[i] = 1;
        depositReveals.push(i, DEPOSIT_CODES.indexOf(s.tiles[i].deposit));
      }
    }

    const structures: SnapshotStructure[] = [];
    for (const st of s.structures) {
      if (st.hp <= 0) continue;
      const mine = st.owner === playerId;
      if (!mine && !spawnOpen && visible![st.tile] !== 1) continue;
      const snap: SnapshotStructure = {
        id: st.id,
        kind: st.kind,
        owner: st.owner,
        tile: st.tile,
        hp: st.hp,
        maxHp: st.maxHp,
      };
      if (mine) {
        snap.powered = st.powered;
        snap.oxygenated = st.oxygenated;
        snap.energyReserve = st.energyReserve;
        snap.oxygenReserve = st.oxygenReserve;
      }
      structures.push(snap);
    }

    const edges: SnapshotEdge[] = [];
    for (const e of s.edges) {
      const a = s.structures[e.a];
      const b = s.structures[e.b];
      if (!a || !b) continue;
      const mine = e.owner === playerId;
      const seen = spawnOpen || visible![a.tile] === 1 || visible![b.tile] === 1;
      if (!mine && !seen) continue;
      if (!mine && e.status === "cut") continue;
      edges.push({
        id: e.id,
        kind: e.kind,
        owner: e.owner,
        a: e.a,
        b: e.b,
        aTile: a.tile,
        bTile: b.tile,
        status: e.status,
        hp: e.hp,
        maxHp: e.maxHp,
      });
    }

    const rovers: SnapshotRover[] = [];
    for (const r of s.rovers) {
      const t = Math.floor(r.y) * s.config.cols + Math.floor(r.x);
      if (r.owner !== playerId && !spawnOpen && visible![t] !== 1) continue;
      rovers.push({ id: r.id, kind: r.kind, owner: r.owner, x: r.x, y: r.y });
    }

    const events = [];
    while (slot.eventIndex < s.events.length) {
      const ev = s.events[slot.eventIndex++];
      if (ev.playerId === -1 || ev.playerId === playerId || ev.important) events.push(ev);
    }

    return {
      type: "snapshot",
      phase: s.phase,
      elapsed: s.elapsed,
      tickCount: s.tickCount,
      visibility: visible ? encodeRle(visible) : undefined,
      ownerChanges,
      depositReveals,
      structures,
      edges,
      rovers,
      players: s.players.map((q) => ({
        id: q.id,
        name: q.name,
        color: q.color,
        human: q.human,
        alive: q.alive,
        evacuated: q.evacuated,
      })),
      you: {
        stocks: { ...p.stocks },
        capacity: { ...p.capacity },
        netRates: { ...p.netRates },
        population: p.population,
        expandTarget: p.expandTarget,
        control: p.control,
        controlHoldSeconds: p.controlHoldSeconds,
        respawnsLeft: p.respawnsLeft,
        evacUntil: p.evacUntil,
        protectionUntil: p.protectionUntil,
        alive: p.alive,
        evacuated: p.evacuated,
      },
      events,
      winner: s.winner,
    };
  }

  private buildStats(): FinishedStats[] {
    const s = this.state!;
    const counts = new Map<number, number>();
    for (const t of s.tiles) if (t.owner >= 0) counts.set(t.owner, (counts.get(t.owner) ?? 0) + 1);
    return s.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      human: p.human,
      alive: p.alive,
      control: p.control,
      territory: counts.get(p.id) ?? 0,
      population: p.population,
      structuresBuilt: p.stats.structuresBuilt,
      edgesCut: p.stats.edgesCut,
      score: p.score,
    }));
  }

  /** Acceso solo para tests. */
  getStateForTest(): MatchState | null {
    return this.state;
  }
  getSlotForTest(playerId: number): ClientSlot | undefined {
    return this.slots.find((s) => s.playerId === playerId);
  }
  /** Comprueba si la sala sigue esperando el alunizaje de algún humano. */
  waitingForSpawns(): boolean {
    return this.state?.phase === "spawn_selection";
  }
}

/** ¿Sigue vivo el humano en su colonia? (útil para lógica de sala) */
export function humanHasColony(state: MatchState, playerId: number): boolean {
  return homeStructure(state, playerId) >= 0;
}
