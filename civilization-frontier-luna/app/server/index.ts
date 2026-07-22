/**
 * Servidor WebSocket de partidas privadas.
 *   npm run server         → ws://localhost:8790
 *   PORT=9000 npm run server
 *
 * Un proceso aloja varias salas identificadas por código de 5 letras.
 */
import { WebSocketServer, WebSocket } from "ws";
import { Room, type ClientConn } from "./room";
import { DEFAULT_PORT, type ClientMessage, type ServerMessage } from "../src/net/protocol";

const port = Number(process.env.PORT) || DEFAULT_PORT;
const rooms = new Map<string, Room>();

function makeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}

class WsConn implements ClientConn {
  constructor(private ws: WebSocket) {}
  send(msg: ServerMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
  close(): void {
    this.ws.close();
  }
}

const wss = new WebSocketServer({ port });

wss.on("connection", (ws) => {
  const conn = new WsConn(ws);
  let room: Room | null = null;

  ws.on("message", (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(data));
    } catch {
      conn.send({ type: "error", reason: "Mensaje ilegible" });
      return;
    }
    if (msg.type === "create_room") {
      if (room) return;
      const code = makeCode();
      const seed = msg.seed && Number.isFinite(msg.seed) ? Math.floor(msg.seed) : Math.floor(Math.random() * 2147483647);
      const created = new Room(code, msg.botCount ?? 7, seed);
      created.onEmpty = () => rooms.delete(code);
      rooms.set(code, created);
      const res = created.join(conn, msg.name);
      if (res.ok) room = created;
      else conn.send({ type: "error", reason: res.reason ?? "No se pudo crear la sala" });
      return;
    }
    if (msg.type === "join_room") {
      if (room) return;
      const target = rooms.get(msg.code.trim().toUpperCase());
      if (!target) {
        conn.send({ type: "error", reason: "Sala inexistente" });
        return;
      }
      const res = target.join(conn, msg.name);
      if (res.ok) room = target;
      else conn.send({ type: "error", reason: res.reason ?? "No se pudo entrar" });
      return;
    }
    room?.handleMessage(conn, msg);
  });

  ws.on("close", () => {
    room?.leave(conn);
    room = null;
  });
});

console.log(`[cf-luna] servidor de partidas privadas en ws://0.0.0.0:${port}`);
