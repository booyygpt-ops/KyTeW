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
import { z } from "zod";
import { Database, publicUser } from "./database";
import { AuthRequest, SessionGuard } from "./security";

@Controller()
@UseGuards(SessionGuard)
export class SocialController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get("friends")
  list(@Req() req: AuthRequest) {
    return this.db.friendship.findMany({
      where: {
        OR: [{ requesterId: req.user.id }, { recipientId: req.user.id }],
      },
      include: {
        requester: { select: publicUser },
        recipient: { select: publicUser },
      },
      orderBy: { createdAt: "desc" },
    });
  }
  @Post("friends")
  async request(@Req() req: AuthRequest, @Body() body: unknown) {
    const { username } = z
      .object({ username: z.string().trim().toLowerCase().min(3).max(24) })
      .parse(body);
    const recipient = await this.db.user.findUnique({ where: { username } });
    if (!recipient) throw new NotFoundException("Kullanıcı bulunamadı.");
    if (recipient.id === req.user.id)
      throw new ForbiddenException("Kendinize istek gönderemezsiniz.");
    return this.db.friendship.create({
      data: {
        pair: [req.user.id, recipient.id].sort().join(":"),
        requesterId: req.user.id,
        recipientId: recipient.id,
      },
    });
  }
  @Post("friends/:id/accept")
  async accept(@Req() req: AuthRequest, @Param("id") id: string) {
    const friend = await this.db.friendship.findUnique({ where: { id } });
    if (
      !friend ||
      friend.recipientId !== req.user.id ||
      friend.status !== "pending"
    )
      throw new ForbiddenException("Bu isteği kabul edemezsiniz.");
    return this.db.friendship.update({
      where: { id },
      data: { status: "accepted" },
    });
  }
  @Delete("friends/:id")
  async remove(@Req() req: AuthRequest, @Param("id") id: string) {
    const friend = await this.db.friendship.findUnique({ where: { id } });
    if (
      !friend ||
      ![friend.requesterId, friend.recipientId].includes(req.user.id)
    )
      throw new ForbiddenException();
    await this.db.friendship.delete({ where: { id } });
    return { ok: true };
  }
  @Get("conversations")
  conversations(@Req() req: AuthRequest) {
    return this.db.conversation.findMany({
      where: { participants: { some: { userId: req.user.id } } },
      include: { participants: { select: { user: { select: publicUser } } } },
      orderBy: { createdAt: "desc" },
    });
  }
  @Post("conversations")
  async conversation(@Req() req: AuthRequest, @Body() body: unknown) {
    const { userId } = z
      .object({ userId: z.string().min(1).max(64) })
      .parse(body);
    const pair = [req.user.id, userId].sort().join(":");
    const friendship = await this.db.friendship.findUnique({ where: { pair } });
    if (friendship?.status !== "accepted")
      throw new ForbiddenException("Önce arkadaşlık isteği kabul edilmeli.");
    return this.db.conversation.upsert({
      where: { pair },
      update: {},
      create: {
        pair,
        participants: { create: [{ userId: req.user.id }, { userId }] },
      },
      include: { participants: { select: { user: { select: publicUser } } } },
    });
  }
}
