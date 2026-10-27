import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import Redis from "ioredis";
import { Access, Sessions } from "./security";
import { browserOrigins } from "./origins";
import type { IncomingMessage } from "node:http";

@Injectable()
export class Runtime implements OnModuleDestroy {
  readonly redis = new Redis(
    process.env.REDIS_URL ?? "redis://localhost:6379",
    { maxRetriesPerRequest: 1 },
  );
  async onModuleDestroy() {
    await this.redis.quit();
  }
}
@WebSocketGateway({
  cors: {
    origin: browserOrigins.allowed,
    credentials: true,
  },
  maxHttpBufferSize: 8192,
  allowRequest: (
    request: IncomingMessage,
    callback: (error: string | null, allowed: boolean) => void,
  ) => {
    callback(null, browserOrigins.isAllowed(request.headers.origin));
  },
})
export class Realtime implements OnGatewayConnection {
  @WebSocketServer() io!: Server;
  constructor(
    @Inject(Sessions) private readonly sessions: Sessions,
    @Inject(Access) private readonly access: Access,
    @Inject(Runtime) private readonly runtime: Runtime,
  ) {}
  async handleConnection(socket: Socket) {
    try {
      if (!browserOrigins.isAllowed(socket.handshake.headers.origin))
        throw new Error("origin");
      socket.data.user = await this.sessions.resolve(
        socket.handshake.headers.cookie,
      );
    } catch {
      socket.disconnect(true);
    }
  }
  @SubscribeMessage("room:join")
  async join(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    try {
      const user = await this.sessions.resolve(socket.handshake.headers.cookie);
      if (
        !body ||
        typeof body !== "object" ||
        !("roomId" in body) ||
        typeof body.roomId !== "string"
      )
        return { ok: false };
      await this.access.room(user.id, body.roomId);
      for (const room of socket.rooms)
        if (room.startsWith("room:")) await socket.leave(room);
      await socket.join(`room:${body.roomId}`);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }
  @SubscribeMessage("typing")
  async typing(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { roomId?: unknown },
  ) {
    try {
      const user = await this.sessions.resolve(socket.handshake.headers.cookie);
      if (typeof body?.roomId !== "string") return;
      await this.access.room(user.id, body.roomId);
      const key = `typing:${user.id}:${body.roomId}`;
      if (await this.runtime.redis.set(key, "1", "EX", 2, "NX"))
        socket.to(`room:${body.roomId}`).emit("typing", {
          roomId: body.roomId,
          userId: user.id,
          displayName: user.displayName,
        });
    } catch {
      /* Unauthorized or unavailable typing is deliberately dropped. */
    }
  }
  async publish(roomId: string, event: string, payload: unknown) {
    // Recheck authorization before delivery, including revoked sessions and memberships.
    const sockets = await this.io.in(`room:${roomId}`).fetchSockets();
    for (const socket of sockets) {
      try {
        const user = await this.sessions.resolve(
          socket.handshake.headers.cookie,
        );
        await this.access.room(user.id, roomId);
        socket.emit(event, { roomId, ...(payload as object) });
      } catch {
        await socket.leave(`room:${roomId}`);
      }
    }
  }
}
