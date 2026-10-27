import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Database, publicUser } from "./database";
import { Access, AuthRequest, SessionGuard } from "./security";

@Controller()
@UseGuards(SessionGuard)
export class CommunityController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Access) private readonly access: Access,
  ) {}
  @Get("servers")
  servers(@Req() req: AuthRequest) {
    return this.db.server.findMany({
      where: { members: { some: { userId: req.user.id } } },
      include: {
        channels: { orderBy: { createdAt: "asc" } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }
  @Post("servers")
  create(@Req() req: AuthRequest, @Body() body: unknown) {
    const data = z
      .object({
        name: z.string().trim().min(2).max(60),
        description: z.string().trim().max(240).default(""),
      })
      .parse(body);
    return this.db.server.create({
      data: {
        ...data,
        ownerId: req.user.id,
        members: { create: { userId: req.user.id, role: "owner" } },
        channels: {
          create: [
            { name: "genel", topic: "Topluluğun buluşma noktası" },
            { name: "Sohbet Odası", kind: "voice" },
          ],
        },
      },
      include: { channels: true },
    });
  }
  @Get("servers/:id/members")
  async members(@Req() req: AuthRequest, @Param("id") serverId: string) {
    await this.access.member(req.user.id, serverId);
    return this.db.member.findMany({
      where: { serverId },
      select: { role: true, user: { select: publicUser } },
      orderBy: { joinedAt: "asc" },
    });
  }
  @Post("servers/:id/channels")
  async channel(
    @Req() req: AuthRequest,
    @Param("id") serverId: string,
    @Body() body: unknown,
  ) {
    await this.access.member(req.user.id, serverId, true);
    const data = z
      .object({
        name: z.string().trim().min(1).max(40),
        topic: z.string().max(240).default(""),
        kind: z.enum(["text", "voice"]).default("text"),
      })
      .parse(body);
    return this.db.channel.create({ data: { ...data, serverId } });
  }
  @Post("servers/:id/invites")
  async invite(@Req() req: AuthRequest, @Param("id") serverId: string) {
    await this.access.member(req.user.id, serverId, true);
    return this.db.invite.create({
      data: {
        code: randomBytes(16).toString("hex"),
        serverId,
        expiresAt: new Date(Date.now() + 86400000),
        maxUses: 10,
      },
    });
  }
  @Post("invites/:code/join")
  async join(@Req() req: AuthRequest, @Param("code") code: string) {
    return this.db.$transaction(async (tx) => {
      // Atomic use reservation prevents concurrent joins exceeding the limit.
      const invite = await tx.invite.findUnique({ where: { code } });
      if (!invite) throw new NotFoundException("Davet bulunamadı.");
      const existing = await tx.member.findUnique({
        where: {
          userId_serverId: { userId: req.user.id, serverId: invite.serverId },
        },
      });
      if (existing) return { serverId: invite.serverId };
      const claimed = await tx.invite.updateMany({
        where: {
          code,
          expiresAt: { gt: new Date() },
          uses: { lt: invite.maxUses },
        },
        data: { uses: { increment: 1 } },
      });
      if (!claimed.count)
        throw new ForbiddenException(
          "Davetin süresi veya kullanım hakkı dolmuş.",
        );
      await tx.member.create({
        data: { userId: req.user.id, serverId: invite.serverId },
      });
      return { serverId: invite.serverId };
    });
  }
  @Delete("servers/:id/membership")
  async leave(@Req() req: AuthRequest, @Param("id") serverId: string) {
    const member = await this.access.member(req.user.id, serverId);
    if (member.role === "owner")
      throw new ForbiddenException("Sunucu sahibi sunucudan ayrılamaz.");
    await this.db.member.delete({
      where: { userId_serverId: { userId: req.user.id, serverId } },
    });
    return { ok: true };
  }
}
