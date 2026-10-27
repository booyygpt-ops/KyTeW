import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { parse, serialize } from "cookie";
import type { Request, Response } from "express";
import { Database, publicUser } from "./database";

export type Profile = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  status: string;
};
export type AuthRequest = Request & { user: Profile };
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const production = () => process.env.NODE_ENV === "production";
export const cookieName = () =>
  production() ? "__Host-kytew_session" : "kytew_session";

@Injectable()
export class Sessions {
  constructor(@Inject(Database) private readonly db: Database) {}
  async resolve(cookie?: string) {
    const token = parse(cookie ?? "")[cookieName()];
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException("Oturum açmanız gerekiyor.");
    const session = await this.db.session.findUnique({
      where: { id: digest(token) },
      include: { user: { select: publicUser } },
    });
    if (!session || session.expiresAt <= new Date())
      throw new UnauthorizedException("Oturumunuzun süresi doldu.");
    return session.user;
  }
  async create(userId: string, remember: boolean, response: Response) {
    const token = randomBytes(32).toString("hex");
    const seconds = (remember ? 30 : 1) * 86400;
    await this.db.session.create({
      data: {
        id: digest(token),
        userId,
        expiresAt: new Date(Date.now() + seconds * 1000),
      },
    });
    response.setHeader(
      "Set-Cookie",
      serialize(cookieName(), token, {
        httpOnly: true,
        secure: production(),
        sameSite: "lax",
        path: "/",
        ...(remember ? { maxAge: seconds } : {}),
      }),
    );
  }
  async revoke(request: Request, response: Response) {
    const token = parse(request.headers.cookie ?? "")[cookieName()];
    if (token)
      await this.db.session.deleteMany({ where: { id: digest(token) } });
    response.setHeader(
      "Set-Cookie",
      serialize(cookieName(), "", {
        httpOnly: true,
        secure: production(),
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      }),
    );
  }
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(Sessions) private readonly sessions: Sessions) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.user = await this.sessions.resolve(request.headers.cookie);
    return true;
  }
}
@Injectable()
export class Access {
  constructor(@Inject(Database) private readonly db: Database) {}
  async member(userId: string, serverId: string, manage = false) {
    const membership = await this.db.member.findUnique({
      where: { userId_serverId: { userId, serverId } },
    });
    if (!membership || (manage && membership.role !== "owner"))
      throw new ForbiddenException("Bu işlem için yetkiniz yok.");
    return membership;
  }
  async room(userId: string, roomId: string) {
    const channel = await this.db.channel.findUnique({ where: { id: roomId } });
    if (channel) {
      await this.member(userId, channel.serverId);
      if (channel.kind !== "text")
        throw new ForbiddenException("Bu kanal metin mesajı kabul etmiyor.");
      return { channelId: roomId, conversationId: null };
    }
    const participant = await this.db.participant.findUnique({
      where: { userId_conversationId: { userId, conversationId: roomId } },
    });
    if (!participant)
      throw new ForbiddenException("Bu sohbete erişiminiz yok.");
    return { conversationId: roomId, channelId: null };
  }
}
