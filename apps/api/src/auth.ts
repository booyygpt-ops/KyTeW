import {
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import * as argon2 from "argon2";
import { z } from "zod";
import { Database, publicUser } from "./database";
import { AuthRequest, SessionGuard, Sessions } from "./security";

const credentials = z.object({
  email: z.email().max(254).toLowerCase(),
  password: z.string().min(12).max(128),
  remember: z.boolean().default(false),
});
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Sessions) private readonly sessions: Sessions,
  ) {}
  @Post("register")
  async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = credentials
      .extend({
        username: z.string().regex(/^[a-z0-9_]{3,24}$/),
        displayName: z.string().trim().min(1).max(48),
      })
      .parse(body);
    const passwordHash = await argon2.hash(data.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
    const user = await this.db.user.create({
      data: {
        email: data.email,
        username: data.username,
        displayName: data.displayName,
        passwordHash,
      },
      select: publicUser,
    });
    await this.sessions.create(user.id, data.remember, res);
    return user;
  }
  @Post("login")
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = credentials.parse(body);
    const user = await this.db.user.findUnique({
      where: { email: data.email },
    });
    // Perform Argon2 even for unknown accounts to reduce account enumeration by timing.
    const hash =
      user?.passwordHash ??
      (await argon2.hash("unavailable-account", { type: argon2.argon2id }));
    const valid = await argon2.verify(hash, data.password);
    if (!user || !valid)
      throw new UnauthorizedException("E-posta veya şifre hatalı.");
    await this.sessions.create(user.id, data.remember, res);
    return this.db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: publicUser,
    });
  }
  @Get("me")
  @UseGuards(SessionGuard)
  me(@Req() req: AuthRequest) {
    return req.user;
  }
  @Patch("me")
  @UseGuards(SessionGuard)
  update(@Req() req: AuthRequest, @Body() body: unknown) {
    const data = z
      .object({
        displayName: z.string().trim().min(1).max(48),
        bio: z.string().max(190),
        status: z.enum(["online", "idle", "dnd", "invisible"]),
      })
      .parse(body);
    return this.db.user.update({
      where: { id: req.user.id },
      data,
      select: publicUser,
    });
  }
  @Post("logout")
  @UseGuards(SessionGuard)
  async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.sessions.revoke(req, res);
    return { ok: true };
  }
  @Post("password")
  @UseGuards(SessionGuard)
  async password(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = z
      .object({
        currentPassword: z.string().min(1).max(128),
        newPassword: z.string().min(12).max(128),
      })
      .parse(body);
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: req.user.id },
    });
    if (!(await argon2.verify(user.passwordHash, data.currentPassword)))
      throw new UnauthorizedException("Mevcut şifreniz hatalı.");
    const passwordHash = await argon2.hash(data.newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
    await this.db.$transaction([
      this.db.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.db.session.deleteMany({ where: { userId: user.id } }),
    ]);
    await this.sessions.create(user.id, false, res);
    return { ok: true };
  }
}
