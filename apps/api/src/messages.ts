import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { Database, publicUser } from "./database";
import { Access, AuthRequest, SessionGuard } from "./security";
import { Realtime } from "./realtime";

const messageInput = z.object({ content: z.string().trim().min(1).max(4000) });
@Controller("rooms/:roomId/messages")
@UseGuards(SessionGuard)
export class MessagesController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Access) private readonly access: Access,
    @Inject(Realtime) private readonly realtime: Realtime,
  ) {}
  @Get()
  async list(
    @Req() req: AuthRequest,
    @Param("roomId") roomId: string,
    @Query() query: unknown,
  ) {
    const scope = await this.access.room(req.user.id, roomId);
    const { before, search } = z
      .object({
        before: z.string().max(64).optional(),
        search: z.string().max(100).optional(),
      })
      .parse(query);
    const cursor = before
      ? await this.db.message.findFirst({ where: { id: before, ...scope } })
      : null;
    if (before && !cursor)
      throw new NotFoundException("Mesaj imleci bulunamadı.");
    const items = await this.db.message.findMany({
      where: {
        ...scope,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
        ...(search
          ? { content: { contains: search, mode: "insensitive" } }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      include: { author: { select: publicUser } },
    });
    const hasMore = items.length > 50;
    return { items: items.slice(0, 50).reverse(), hasMore };
  }
  @Post()
  async send(
    @Req() req: AuthRequest,
    @Param("roomId") roomId: string,
    @Body() body: unknown,
  ) {
    const scope = await this.access.room(req.user.id, roomId);
    const data = messageInput.parse(body);
    const message = await this.db.message.create({
      data: { ...data, ...scope, authorId: req.user.id },
      include: { author: { select: publicUser } },
    });
    await this.realtime.publish(roomId, "message:created", { message });
    return message;
  }
  @Patch(":id")
  async edit(
    @Req() req: AuthRequest,
    @Param("roomId") roomId: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const scope = await this.access.room(req.user.id, roomId);
    const data = messageInput.parse(body);
    const existing = await this.db.message.findFirst({
      where: { id, ...scope },
    });
    if (!existing || existing.authorId !== req.user.id)
      throw new ForbiddenException(
        "Yalnızca kendi mesajınızı düzenleyebilirsiniz.",
      );
    const message = await this.db.message.update({
      where: { id },
      data: { ...data, editedAt: new Date() },
      include: { author: { select: publicUser } },
    });
    await this.realtime.publish(roomId, "message:updated", { message });
    return message;
  }
  @Delete(":id")
  async remove(
    @Req() req: AuthRequest,
    @Param("roomId") roomId: string,
    @Param("id") id: string,
  ) {
    const scope = await this.access.room(req.user.id, roomId);
    const existing = await this.db.message.findFirst({
      where: { id, ...scope },
    });
    if (!existing || existing.authorId !== req.user.id)
      throw new ForbiddenException("Yalnızca kendi mesajınızı silebilirsiniz.");
    await this.db.message.delete({ where: { id } });
    await this.realtime.publish(roomId, "message:deleted", { id });
    return { ok: true };
  }
}
