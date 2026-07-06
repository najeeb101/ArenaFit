import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import type { QueueJoinPayload, RepCompletedPayload } from "@arenafit/shared";
import type { Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";
import { config } from "../config";
import { MatchEngineService } from "./match-engine.service";

interface GameSocket extends Socket {
  data: { userId: string; username: string };
}

@WebSocketGateway({
  cors: { origin: config().CORS_ORIGIN.split(","), credentials: true },
  // Tighter than Socket.IO's defaults (25s/20s) so a silently-hung socket
  // (process frozen, network cut without a clean FIN) is reaped quickly
  // instead of holding a match's reconnect-grace timer hostage.
  pingInterval: 10_000,
  pingTimeout: 5_000,
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name);

  constructor(
    private readonly auth: AuthService,
    private readonly engine: MatchEngineService,
  ) {}

  handleConnection(socket: GameSocket) {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) throw new Error("missing token");
      const payload = this.auth.verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.username = payload.username;
    } catch {
      this.logger.warn(`Rejected unauthenticated socket ${socket.id}`);
      socket.emit("error:game", { message: "Authentication required" });
      socket.disconnect(true);
      return;
    }
    this.engine.reconnect(socket, socket.data.userId);
  }

  handleDisconnect(socket: GameSocket) {
    this.engine.handleDisconnect(socket.id);
  }

  @SubscribeMessage("queue:join")
  onQueueJoin(@ConnectedSocket() socket: GameSocket, @MessageBody() payload: QueueJoinPayload) {
    void this.engine.joinQueue(socket, socket.data.userId, payload);
  }

  @SubscribeMessage("queue:leave")
  onQueueLeave(@ConnectedSocket() socket: GameSocket) {
    this.engine.leaveQueue(socket.id);
  }

  @SubscribeMessage("match:ready")
  onReady(@ConnectedSocket() socket: GameSocket, @MessageBody() payload: { matchId: string }) {
    this.engine.ready(socket.id, payload.matchId);
  }

  @SubscribeMessage("rep:completed")
  onRep(@ConnectedSocket() socket: GameSocket, @MessageBody() payload: RepCompletedPayload) {
    this.engine.repCompleted(socket.id, payload);
  }

  @SubscribeMessage("match:forfeit")
  onForfeit(@ConnectedSocket() socket: GameSocket, @MessageBody() payload: { matchId: string }) {
    this.engine.forfeit(socket.id, payload.matchId);
  }
}
