import { describe, expect, it } from "vitest";
import { Room, type ClientConn } from "../server/room";
import { applySnapshot, createMirror, type NetMirror } from "../src/net/mirror";
import { isValidSpawn, homeStructure } from "../src/sim/match";
import type { ServerMessage, SnapshotMessage } from "../src/net/protocol";
import type { MatchState } from "../src/sim/types";

/** Conexión falsa que acumula mensajes (transporte de test). */
class FakeConn implements ClientConn {
  messages: ServerMessage[] = [];
  send(msg: ServerMessage): void {
    // Simular el viaje por la red: el cliente nunca comparte referencias.
    this.messages.push(JSON.parse(JSON.stringify(msg)) as ServerMessage);
  }
  close(): void {}
  last<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].type === type) return this.messages[i] as Extract<ServerMessage, { type: T }>;
    }
    return undefined;
  }
}

interface TestClient {
  conn: FakeConn;
  mirror: NetMirror | null;
  playerId: number;
}

/** Crea sala + n clientes, arranca, aluniza a todos y devuelve espejos. */
function setupMatch(n: number, botCount = 2, seed = 4242): { room: Room; clients: TestClient[]; state: MatchState } {
  const room = new Room("TESTS", botCount, seed);
  const clients: TestClient[] = [];
  for (let i = 0; i < n; i++) {
    const conn = new FakeConn();
    const res = room.join(conn, `Jugador${i + 1}`);
    expect(res.ok).toBe(true);
    clients.push({ conn, mirror: null, playerId: res.playerId! });
  }
  room.handleMessage(clients[0].conn, { type: "start_game" });
  room.dispose(); // paramos el setInterval: los tests avanzan con step()
  const state = room.getStateForTest()!;
  for (const c of clients) {
    const start = c.conn.last("game_start")!;
    expect(start).toBeDefined();
    c.mirror = createMirror(start);
    // consumir snapshots pendientes
    syncMirror(c);
  }
  // Alunizar a todos con comandos normales.
  for (const c of clients) {
    let landed = false;
    for (let t = 0; t < state.tiles.length && !landed; t++) {
      if (!isValidSpawn(state, t, c.playerId)) continue;
      room.handleMessage(c.conn, { type: "command", seq: 1, cmd: { type: "select_spawn", playerId: c.playerId, tile: t } });
      landed = c.conn.last("cmd_result")!.ok;
    }
    expect(landed).toBe(true);
  }
  for (const c of clients) syncMirror(c);
  return { room, clients, state };
}

function syncMirror(c: TestClient): void {
  for (const msg of c.conn.messages) {
    if (msg.type === "snapshot") applySnapshot(c.mirror!, msg as SnapshotMessage);
  }
  c.conn.messages = c.conn.messages.filter((m) => m.type !== "snapshot");
}

describe("sala privada", () => {
  it("lobby: asigna ids, anfitrión y rechaza salas llenas o empezadas", () => {
    const room = new Room("AAAAA", 3, 1);
    const conns = Array.from({ length: 16 }, () => new FakeConn());
    for (const c of conns) expect(room.join(c, "x").ok).toBe(true);
    expect(room.join(new FakeConn(), "sobra").ok).toBe(false);
    room.handleMessage(conns[1], { type: "start_game" });
    expect(room.started).toBe(false); // solo el anfitrión puede
    room.handleMessage(conns[0], { type: "start_game" });
    expect(room.started).toBe(true);
    expect(room.join(new FakeConn(), "tarde").ok).toBe(false);
    room.dispose();
  });

  it("una partida 16 humanos + bots avanza sin errores hasta terminar", () => {
    const { room, state } = setupMatch(16, 4, 777);
    expect(state.phase).toBe("running");
    expect(state.players.filter((p) => p.human).length).toBe(16);
    let guard = (state.config.targetMinutes * 60) / 0.5 + 20;
    while (state.phase === "running" && guard-- > 0) room.step();
    expect(state.phase).toBe("finished");
    expect(state.winner).toBeGreaterThanOrEqual(0);
  }, 240000);

  it("la niebla no viaja: los snapshots nunca incluyen enemigos ni depósitos fuera de visión", async () => {
    const { room, clients, state } = setupMatch(2, 2, 999);
    const { decodeRle } = await import("../src/net/protocol");
    for (let i = 0; i < 40; i++) room.step();

    for (const c of clients) {
      // Verificar el último snapshot tal y como viaja por la red.
      const snap = c.conn.last("snapshot")! as SnapshotMessage;
      expect(snap.visibility).toBeDefined();
      const vis = decodeRle(snap.visibility!, state.tiles.length);
      // Ninguna estructura ajena fuera de la visibilidad actual.
      for (const st of snap.structures) {
        if (st.owner === c.playerId) continue;
        expect(vis[st.tile]).toBe(1);
        // Y nunca con datos internos (reservas, powered).
        expect(st.powered).toBeUndefined();
        expect(st.energyReserve).toBeUndefined();
      }
      // Ningún depósito revelado fuera de visión.
      for (let k = 0; k < snap.depositReveals.length; k += 2) {
        expect(vis[snap.depositReveals[k]]).toBe(1);
      }
      // El hábitat del rival está fuera de visión (distancia mínima de
      // spawn ≫ radio de visión inicial) y no aparece en este snapshot.
      const rival = clients.find((o) => o !== c)!;
      const rivalHome = state.structures[homeStructure(state, rival.playerId)];
      expect(vis[rivalHome.tile]).toBe(0);
      expect(snap.structures.some((st) => st.id === rivalHome.id)).toBe(false);
      // La semilla del mapa jamás viaja al cliente.
      syncMirror(c);
      expect(c.mirror!.state.config.seed).toBe(0);
    }
    room.dispose();
  });

  it("anticheat: el servidor reescribe el playerId y valida recursos", () => {
    const { room, clients, state } = setupMatch(2, 0, 555);
    const attacker = clients[0];
    const victim = clients[1];
    // Intentar actuar como el rival: el servidor fuerza el playerId propio.
    const victimHome = state.structures[homeStructure(state, victim.playerId)];
    room.handleMessage(attacker.conn, {
      type: "command",
      seq: 7,
      cmd: { type: "build", playerId: victim.playerId, kind: "generator", tile: victimHome.tile + 1 },
    });
    const res = attacker.conn.last("cmd_result")!;
    expect(res.ok).toBe(false); // no es su territorio
    // Los recursos del rival no cambian por comandos ajenos.
    expect(state.players[victim.playerId].stocks.minerals).toBeGreaterThan(0);
    room.dispose();
  });

  it("los espejos de todos los clientes coinciden en el estado público (sin divergencia)", () => {
    const { room, clients } = setupMatch(3, 2, 2025);
    for (let i = 0; i < 120; i++) room.step();
    for (const c of clients) syncMirror(c);
    const [a, b, cc] = clients;
    expect(a.mirror!.state.elapsed).toBe(b.mirror!.state.elapsed);
    expect(b.mirror!.state.elapsed).toBe(cc.mirror!.state.elapsed);
    for (let id = 0; id < a.mirror!.state.players.length; id++) {
      expect(a.mirror!.state.players[id].alive).toBe(b.mirror!.state.players[id].alive);
      expect(b.mirror!.state.players[id].alive).toBe(cc.mirror!.state.players[id].alive);
    }
    room.dispose();
  });

  it("reconexión: un cliente caído recupera la partida con el mismo id", () => {
    const { room, clients } = setupMatch(2, 1, 31);
    for (let i = 0; i < 10; i++) room.step();
    const dropped = clients[1];
    room.leave(dropped.conn);
    for (let i = 0; i < 10; i++) room.step();
    const fresh = new FakeConn();
    const res = room.join(fresh, "Jugador2");
    expect(res.ok).toBe(true);
    expect(res.playerId).toBe(dropped.playerId);
    const start = fresh.last("game_start");
    expect(start).toBeDefined();
    const mirror = createMirror(start!);
    room.step();
    for (const msg of fresh.messages) {
      if (msg.type === "snapshot") applySnapshot(mirror, msg as SnapshotMessage);
    }
    expect(mirror.state.phase).toBe("running");
    expect(mirror.state.players[dropped.playerId].alive).toBe(true);
    room.dispose();
  });
});
