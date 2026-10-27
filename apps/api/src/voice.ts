import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from "livekit-server-sdk";
import { randomUUID, createHash } from "node:crypto";
import { parse } from "cookie";
import { z } from "zod";
import { Database } from "./database";
import {
  Access,
  AuthRequest,
  cookieName,
  Profile,
  SessionGuard,
} from "./security";
import { Runtime } from "./realtime";

type Lease = {
  id: string;
  userId: string;
  channelId: string;
  serverId: string;
  sessionId: string;
};
const leaseKey = (room: string, user: string) => `voice:lease:${room}:${user}`;
const sessionId = (cookie: string | undefined) =>
  createHash("sha256")
    .update(parse(cookie ?? "")[cookieName()] ?? "")
    .digest("hex");
const input = z.object({ leaseId: z.uuid() });

@Injectable()
export class VoiceService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private sweeping = false;
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Access) private readonly access: Access,
    @Inject(Runtime) private readonly runtime: Runtime,
  ) {}
  private config() {
    const { LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = process.env;
    if (!key || !secret)
      throw new ServiceUnavailableException(
        "Ses hizmeti henüz yapılandırılmadı. Sunucu yöneticisiyle iletişime geçin.",
      );
    return {
      key,
      secret,
      url: process.env.LIVEKIT_URL || "/livekit",
      internal: process.env.LIVEKIT_INTERNAL_URL || "http://localhost:7880",
    };
  }
  private client() {
    const c = this.config();
    return new RoomServiceClient(c.internal, c.key, c.secret);
  }
  private room(channelId: string) {
    return `kytew-${channelId}`;
  }
  async channel(userId: string, channelId: string) {
    const channel = await this.db.channel.findUnique({
      where: { id: channelId },
    });
    if (!channel || channel.kind !== "voice")
      throw new NotFoundException("Ses kanalı bulunamadı.");
    await this.access.member(userId, channel.serverId);
    return channel;
  }
  async join(user: Profile, channelId: string, cookie: string | undefined) {
    const channel = await this.channel(user.id, channelId);
    const config = this.config(),
      room = this.room(channelId);
    const lease: Lease = {
      id: randomUUID(),
      userId: user.id,
      channelId,
      serverId: channel.serverId,
      sessionId: sessionId(cookie),
    };
    try {
      await this.client().createRoom({
        name: room,
        emptyTimeout: 60,
        maxParticipants: 50,
      });
      // One active voice channel per account. Existing leases are revoked server-side.
      await this.disconnectWhere(
        (l) => l.userId === user.id && l.channelId !== channelId,
      );
      const key = leaseKey(room, user.id);
      await this.runtime.redis.set(key, JSON.stringify(lease), "EX", 60);
      await this.runtime.redis.sadd("voice:active", `${room}|${user.id}`);
      const token = new AccessToken(config.key, config.secret, {
        identity: user.id,
        name: user.displayName,
        ttl: 60,
        metadata: JSON.stringify({
          username: user.username,
          voiceLeaseId: lease.id,
        }),
      });
      token.addGrant({
        roomJoin: true,
        room,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
        canPublishSources: [TrackSource.MICROPHONE],
        canUpdateOwnMetadata: false,
      });
      return {
        token: await token.toJwt(),
        url: config.url,
        leaseId: lease.id,
        channelId,
        channelName: channel.name,
      };
    } catch (e) {
      if (e instanceof ServiceUnavailableException) throw e;
      throw new ServiceUnavailableException(
        "Ses bağlantısı şu anda kurulamıyor. Biraz sonra yeniden deneyin.",
      );
    }
  }
  async heartbeat(
    userId: string,
    channelId: string,
    cookie: string | undefined,
    id: string,
  ) {
    await this.channel(userId, channelId);
    const key = leaseKey(this.room(channelId), userId);
    const raw = await this.runtime.redis.get(key);
    const lease: Lease | null = raw ? JSON.parse(raw) : null;
    if (!lease || lease.id !== id || lease.sessionId !== sessionId(cookie))
      throw new ForbiddenException(
        "Ses oturumunun süresi doldu. Kanala yeniden katılın.",
      );
    // Compare-and-expire prevents an old tab extending a replacement session.
    const renewed = await this.runtime.redis.eval(
      "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('EXPIRE',KEYS[1],60) end; return 0",
      1,
      key,
      raw!,
    );
    if (!renewed) throw new ForbiddenException("Ses oturumu değişti.");
    return { ok: true };
  }
  async leave(userId: string, channelId: string, id: string) {
    const room = this.room(channelId),
      raw = await this.runtime.redis.get(leaseKey(room, userId));
    if (raw && (JSON.parse(raw) as Lease).id === id)
      await this.remove(room, userId);
    return { ok: true };
  }
  private async remove(room: string, userId: string) {
    try {
      await this.client().removeParticipant(room, userId);
    } catch (error) {
      // Not-found means the participant already disconnected. Retry other failures in the sweep.
      if (
        (error as { status?: number; code?: string }).status !== 404 &&
        (error as { code?: string }).code !== "not_found"
      )
        throw error;
    }
    await this.runtime.redis.del(leaseKey(room, userId));
    await this.runtime.redis.srem("voice:active", `${room}|${userId}`);
  }
  private async disconnectWhere(predicate: (lease: Lease) => boolean) {
    for (const entry of await this.runtime.redis.smembers("voice:active")) {
      const [room, userId] = entry.split("|");
      const raw = await this.runtime.redis.get(leaseKey(room, userId));
      if (raw && predicate(JSON.parse(raw))) await this.remove(room, userId);
    }
  }
  // Membership/session removal is authoritative, even if a modified client ignores heartbeat failures.
  async sweep() {
    if (this.sweeping || !process.env.LIVEKIT_API_SECRET) return;
    this.sweeping = true;
    try {
      const active = new Set(await this.runtime.redis.smembers("voice:active"));
      const connected = new Map<string, string>();
      // Inspect the SFU too: a previously issued JWT may be replayed until its
      // short expiry. A connection without the current lease must be removed.
      for (const room of await this.client().listRooms([])) {
        if (!room.name.startsWith("kytew-")) continue;
        for (const participant of await this.client().listParticipants(
          room.name,
        )) {
          active.add(`${room.name}|${participant.identity}`);
          connected.set(
            `${room.name}|${participant.identity}`,
            participant.metadata,
          );
        }
      }
      for (const entry of active) {
        const [room, userId] = entry.split("|");
        try {
          const raw = await this.runtime.redis.get(leaseKey(room, userId));
          const lease: Lease | null = raw ? JSON.parse(raw) : null;
          if (lease && connected.has(entry)) {
            let participantLease: string | undefined;
            try {
              participantLease = JSON.parse(connected.get(entry)!).voiceLeaseId;
            } catch {
              /* Invalid metadata cannot prove a current lease. */
            }
            if (participantLease !== lease.id) {
              // A replayed token cannot borrow another tab's current valid lease.
              await this.client().removeParticipant(room, userId);
              continue;
            }
          }
          const session = lease
            ? await this.db.session.findUnique({
                where: { id: lease.sessionId },
              })
            : null;
          const member = lease
            ? await this.db.member.findUnique({
                where: {
                  userId_serverId: { userId, serverId: lease.serverId },
                },
              })
            : null;
          if (!lease || !member || !session || session.expiresAt <= new Date())
            await this.remove(room, userId);
        } catch {
          /* Retry after the next interval if the media service is unavailable. */
        }
      }
    } finally {
      this.sweeping = false;
    }
  }
  async status() {
    try {
      await this.client().listRooms([]);
      return { ready: true };
    } catch {
      return { ready: false };
    }
  }
  onModuleInit() {
    this.timer = setInterval(() => void this.sweep().catch(() => {}), 10000);
    this.timer.unref();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }
}

@Controller("voice")
@UseGuards(SessionGuard)
export class VoiceController {
  constructor(@Inject(VoiceService) private readonly voice: VoiceService) {}
  @Get("status") status() {
    return this.voice.status();
  }
  @Post("channels/:id/join") join(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.voice.join(req.user, id, req.headers.cookie);
  }
  @Post("channels/:id/heartbeat") heartbeat(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.voice.heartbeat(
      req.user.id,
      id,
      req.headers.cookie,
      input.parse(body).leaseId,
    );
  }
  @Delete("channels/:id") leave(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.voice.leave(req.user.id, id, input.parse(body).leaseId);
  }
}
