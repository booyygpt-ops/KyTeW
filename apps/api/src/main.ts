import "reflect-metadata";
import {
  ArgumentsHost,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  HttpException,
  Inject,
  Module,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import { z, ZodError } from "zod";
import helmet from "helmet";
import type { Request, Response, NextFunction } from "express";
import { Database } from "./database";
import { Access, SessionGuard, Sessions } from "./security";
import { Realtime, Runtime } from "./realtime";
import { AuthController } from "./auth";
import { CommunityController } from "./community";
import { SocialController } from "./social";
import { MessagesController } from "./messages";
import { browserOrigins } from "./origins";
import { VoiceController, VoiceService } from "./voice";

@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500,
      message = "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.";
    if (error instanceof ZodError) {
      status = 400;
      message = error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      message = error.message;
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      status = 409;
      message = "Bu kullanıcı, e-posta veya kayıt zaten mevcut.";
    }
    if (status === 500) console.error(error);
    res.status(status).json({ statusCode: status, message });
  }
}
@Controller()
class Health {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Runtime) private readonly runtime: Runtime,
  ) {}
  @Get("health") async health() {
    await this.db.$queryRaw`SELECT 1`;
    await this.runtime.redis.ping();
    return { name: "KYTEW", status: "ok" };
  }
}
@Module({
  controllers: [
    Health,
    AuthController,
    CommunityController,
    SocialController,
    MessagesController,
    VoiceController,
  ],
  providers: [
    Database,
    Sessions,
    SessionGuard,
    Access,
    Realtime,
    Runtime,
    VoiceService,
  ],
})
class AppModule {}
async function bootstrap() {
  z.config(z.locales.tr());
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const { json } = await import("express");
  app.use(json({ limit: "16kb" }));
  app.use(helmet());
  app.enableCors({ origin: browserOrigins.allowed, credentials: true });
  const runtime = app.get(Runtime);
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !browserOrigins.isAllowed(req.headers.origin)
    ) {
      res.status(403).json({ message: "Güvenilmeyen istek kaynağı." });
      return;
    }
    try {
      const isAuth =
        req.path === "/auth/login" || req.path === "/auth/register";
      // Socket peer address is authoritative; untrusted forwarding headers are ignored.
      const key = `rate:${process.env.RATE_NAMESPACE ?? "kytew"}:${isAuth ? "auth" : "api"}:${req.ip}`;
      const count = (await runtime.redis.eval(
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
        1,
        key,
        isAuth ? 60 : 10,
      )) as number;
      if (count > (isAuth ? 20 : 120)) {
        res
          .status(429)
          .json({ message: "Çok fazla istek. Biraz bekleyip tekrar deneyin." });
        return;
      }
      next();
    } catch {
      res.status(503).json({ message: "Geçici olarak hizmet verilemiyor." });
    }
  });
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4000), "0.0.0.0");
}
bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
