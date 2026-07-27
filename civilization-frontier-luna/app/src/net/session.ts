/**
 * Sesión de red del cliente: conexión WebSocket, lobby y espejo de partida.
 * Expone callbacks para que main.ts pinte pantallas sin conocer el transporte.
 */
import type { Command } from "../sim/types";
import { applySnapshot, createMirror, type NetMirror } from "./mirror";
import type { ClientMessage, FinishedStats, LobbyPlayer, ServerMessage } from "./protocol";

export interface SessionCallbacks {
  onLobby(code: string, yourPlayerId: number, players: LobbyPlayer[], botCount: number): void;
  onGameStart(mirror: NetMirror): void;
  onSnapshot(mirror: NetMirror): void;
  onFinished(winner: number, stats: FinishedStats[]): void;
  onCmdResult(ok: boolean, reason?: string): void;
  onError(reason: string): void;
  onClose(): void;
}

export class NetSession {
  private ws: WebSocket | null = null;
  mirror: NetMirror | null = null;
  code = "";
  playerId = -1;
  private seq = 0;

  constructor(private callbacks: SessionCallbacks) {}

  connect(url: string, onOpen: () => void): void {
    this.ws = new WebSocket(url);
    this.ws.addEventListener("open", onOpen);
    this.ws.addEventListener("message", (ev) => this.handle(JSON.parse(String(ev.data)) as ServerMessage));
    this.ws.addEventListener("error", () => this.callbacks.onError("No se pudo conectar con el servidor"));
    this.ws.addEventListener("close", () => this.callbacks.onClose());
  }

  private send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  createRoom(name: string, botCount: number, seed?: number): void {
    this.send({ type: "create_room", name, botCount, seed });
  }

  joinRoom(code: string, name: string): void {
    this.send({ type: "join_room", code, name });
  }

  startGame(): void {
    this.send({ type: "start_game" });
  }

  issueCommand(cmd: Command): void {
    this.send({ type: "command", seq: this.seq++, cmd });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.mirror = null;
  }

  private handle(msg: ServerMessage): void {
    switch (msg.type) {
      case "lobby":
        this.code = msg.code;
        this.playerId = msg.yourPlayerId;
        this.callbacks.onLobby(msg.code, msg.yourPlayerId, msg.players, msg.botCount);
        return;
      case "game_start":
        this.playerId = msg.yourPlayerId;
        this.mirror = createMirror(msg);
        this.callbacks.onGameStart(this.mirror);
        return;
      case "snapshot":
        if (!this.mirror) return;
        applySnapshot(this.mirror, msg);
        this.callbacks.onSnapshot(this.mirror);
        return;
      case "match_finished":
        this.callbacks.onFinished(msg.winner, msg.stats);
        return;
      case "cmd_result":
        this.callbacks.onCmdResult(msg.ok, msg.reason);
        return;
      case "error":
        this.callbacks.onError(msg.reason);
        return;
      case "pong":
        return;
    }
  }
}
