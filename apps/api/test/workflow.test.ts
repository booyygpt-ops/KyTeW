import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { io, type Socket } from "socket.io-client";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const base = "http://localhost:4101",
  origin = "http://localhost:5173";
const lanOrigin = "http://192.168.1.50:5173";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
let processApi: ChildProcess;
let logs = "";
const sockets: Socket[] = [];
const suffix = Date.now().toString(36);
const password = "KYTEW test password! 2026";
type Client = { cookie: string; id: string; username: string };
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
  expected = 200,
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      origin,
      cookie,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  assert.equal(
    r.status,
    expected,
    `${method} ${path}: ${JSON.stringify(data)}`,
  );
  return { data, cookie: r.headers.get("set-cookie")?.split(";")[0] ?? cookie };
}
async function register(name: string): Promise<Client> {
  const username = `${name}_${suffix}`;
  const { data, cookie } = await request(
    "/auth/register",
    "POST",
    {
      username,
      displayName: name,
      email: `${username}@example.test`,
      password,
      remember: true,
    },
    "",
    201,
  );
  assert.equal(data.passwordHash, undefined);
  assert.equal(data.email, undefined);
  return { id: data.id, cookie, username };
}
async function connect(client: Client) {
  const socket = io(base, {
    extraHeaders: { Cookie: client.cookie, Origin: origin },
    transports: ["websocket"],
    reconnection: false,
  });
  sockets.push(socket);
  await Promise.race([
    once(socket, "connect"),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Socket timeout")), 5000),
    ),
  ]);
  return socket;
}
before(async () => {
  processApi = spawn(process.execPath, ["dist/main.js"], {
    env: {
      ...process.env,
      PORT: "4101",
      WEB_ORIGIN: origin,
      WEB_ORIGINS: lanOrigin,
      ALLOW_LAN_ORIGINS: "false",
      RATE_NAMESPACE: `test-${suffix}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  processApi.stdout?.on("data", (d) => {
    logs += d;
  });
  processApi.stderr?.on("data", (d) => {
    logs += d;
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/health")).ok) return;
    } catch {
      /* wait for actual health */
    }
    if (processApi.exitCode !== null) throw new Error(logs);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`API not ready: ${logs}`);
});
after(async () => {
  for (const s of sockets) s.disconnect();
  processApi?.kill("SIGTERM");
  await db.$disconnect();
});

test(
  "configured tablet origin supports registration, authenticated requests and live messages while foreign origins are denied",
  { timeout: 15000 },
  async () => {
    const username = `tablet_${suffix}`;
    const registration = await fetch(base + "/auth/register", {
      method: "POST",
      headers: { origin: lanOrigin, "content-type": "application/json" },
      body: JSON.stringify({
        username,
        displayName: "Tablet",
        email: `${username}@example.test`,
        password,
      }),
    });
    assert.equal(registration.status, 201, await registration.clone().text());
    assert.equal(
      registration.headers.get("access-control-allow-origin"),
      lanOrigin,
    );
    assert.equal(
      registration.headers.get("access-control-allow-credentials"),
      "true",
    );
    const cookie = registration.headers.get("set-cookie")!.split(";")[0];
    const serverResponse = await fetch(base + "/servers", {
      method: "POST",
      headers: {
        origin: lanOrigin,
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Tablet sunucusu" }),
    });
    assert.equal(serverResponse.status, 201);
    const server = await serverResponse.json();
    const roomId = server.channels.find(
      (channel: { kind: string }) => channel.kind === "text",
    ).id;
    const socket = io(base, {
      extraHeaders: { Cookie: cookie, Origin: lanOrigin },
      transports: ["websocket"],
      reconnection: false,
      autoConnect: false,
    });
    sockets.push(socket);
    const connection = once(socket, "connect");
    socket.connect();
    await connection;
    assert.deepEqual(
      await socket.timeout(3000).emitWithAck("room:join", { roomId }),
      { ok: true },
    );
    const received = once(socket, "message:created");
    // Existing PC origin continues working alongside the tablet origin.
    const { data: message } = await request(
      `/rooms/${roomId}/messages`,
      "POST",
      { content: "PC ve tablet aynı sohbette." },
      cookie,
      201,
    );
    const [event] = await received;
    assert.equal(event.message.id, message.id);
    for (const foreignOrigin of [
      "https://attacker.invalid",
      "http://192.168.1.51:5173",
    ]) {
      const denied = await fetch(base + "/servers", {
        method: "POST",
        headers: {
          origin: foreignOrigin,
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "Denied" }),
      });
      assert.equal(denied.status, 403);
      assert.notEqual(
        denied.headers.get("access-control-allow-origin"),
        foreignOrigin,
      );
      const untrusted = io(base, {
        extraHeaders: { Cookie: cookie, Origin: foreignOrigin },
        transports: ["websocket"],
        reconnection: false,
        autoConnect: false,
      });
      sockets.push(untrusted);
      const rejected = once(untrusted, "connect_error");
      untrusted.connect();
      await rejected;
      assert.equal(untrusted.connected, false);
      untrusted.disconnect();
    }
  },
);

test(
  "KYTEW: two accounts, protected communities, invitation, live messages, durable history and private DM",
  { timeout: 30000 },
  async () => {
    const alice = await register("alice"),
      bob = await register("bob"),
      outsider = await register("outsider");
    const user = await db.user.findUniqueOrThrow({ where: { id: alice.id } });
    assert.match(user.passwordHash, /^\$argon2id\$/);
    assert.ok(!user.passwordHash.includes(password));
    await request("/auth/me", "GET", undefined, "", 401);
    await request(
      "/auth/login",
      "POST",
      {
        email: `${alice.username}@example.test`,
        password: "incorrect password",
      },
      "",
      401,
    );
    const spoof = await fetch(base + "/servers", {
      method: "POST",
      headers: {
        cookie: alice.cookie,
        origin: "https://attacker.invalid",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "denied" }),
    });
    assert.equal(spoof.status, 403);
    const { data: server } = await request(
      "/servers",
      "POST",
      { name: "KYTEW test community", description: "Integration run" },
      alice.cookie,
      201,
    );
    const channel = server.channels.find(
      (c: { kind: string }) => c.kind === "text",
    );
    assert.ok(channel);
    assert.ok(
      server.channels.some((c: { kind: string }) => c.kind === "voice"),
    );
    const path = `/rooms/${channel.id}/messages`;
    await request(path, "GET", undefined, bob.cookie, 403);
    await request(path, "POST", { content: "unauthorized" }, bob.cookie, 403);
    const { data: invite } = await request(
      `/servers/${server.id}/invites`,
      "POST",
      undefined,
      alice.cookie,
      201,
    );
    await request(
      `/invites/${invite.code}/join`,
      "POST",
      undefined,
      bob.cookie,
      201,
    );
    await request(
      `/servers/${server.id}/channels`,
      "POST",
      { name: "unauthorized" },
      bob.cookie,
      403,
    );
    await request(
      `/servers/${server.id}/channels`,
      "POST",
      { name: "development" },
      alice.cookie,
      201,
    );
    const bobSocket = await connect(bob),
      outsiderSocket = await connect(outsider);
    assert.deepEqual(
      await bobSocket
        .timeout(3000)
        .emitWithAck("room:join", { roomId: channel.id }),
      { ok: true },
    );
    assert.deepEqual(
      await outsiderSocket
        .timeout(3000)
        .emitWithAck("room:join", { roomId: channel.id }),
      { ok: false },
    );
    const received = once(bobSocket, "message:created");
    const { data: message } = await request(
      path,
      "POST",
      { content: "Merhaba KYTEW! **Gerçek zamanlı.**" },
      alice.cookie,
      201,
    );
    const [event] = await received;
    assert.equal(event.message.id, message.id);
    assert.equal(event.message.author.id, alice.id);
    assert.equal(
      (await request(path, "GET", undefined, bob.cookie)).data.items[0].content,
      message.content,
    );
    assert.equal(
      (await db.message.findUniqueOrThrow({ where: { id: message.id } }))
        .content,
      message.content,
    );
    await request(
      `${path}/${message.id}`,
      "PATCH",
      { content: "stolen" },
      bob.cookie,
      403,
    );
    await request(
      `${path}/${message.id}`,
      "PATCH",
      { content: "Düzenlenmiş mesaj" },
      alice.cookie,
    );
    const results = await request(
      `${path}?search=${encodeURIComponent("Düzenlenmiş")}`,
      "GET",
      undefined,
      bob.cookie,
    );
    assert.equal(results.data.items.length, 1);
    for (let i = 0; i < 52; i++)
      await db.message.create({
        data: {
          content: `Pagination ${i}`,
          authorId: alice.id,
          channelId: channel.id,
        },
      });
    const page1 = (await request(path, "GET", undefined, bob.cookie)).data;
    assert.equal(page1.items.length, 50);
    assert.equal(page1.hasMore, true);
    const page2 = (
      await request(
        `${path}?before=${page1.items[0].id}`,
        "GET",
        undefined,
        bob.cookie,
      )
    ).data;
    assert.equal(page2.items.length, 3);
    assert.equal(page2.hasMore, false);
    assert.equal(
      new Set([...page1.items, ...page2.items].map((m) => m.id)).size,
      53,
    );
    const { data: friend } = await request(
      "/friends",
      "POST",
      { username: bob.username },
      alice.cookie,
      201,
    );
    await request(
      `/friends/${friend.id}/accept`,
      "POST",
      undefined,
      alice.cookie,
      403,
    );
    await request(
      "/conversations",
      "POST",
      { userId: bob.id },
      alice.cookie,
      403,
    );
    await request(
      `/friends/${friend.id}/accept`,
      "POST",
      undefined,
      bob.cookie,
      201,
    );
    const { data: dm } = await request(
      "/conversations",
      "POST",
      { userId: bob.id },
      alice.cookie,
      201,
    );
    await request(
      `/rooms/${dm.id}/messages`,
      "POST",
      { content: "Özel bir merhaba" },
      bob.cookie,
      201,
    );
    await request(
      `/rooms/${dm.id}/messages`,
      "GET",
      undefined,
      outsider.cookie,
      403,
    );
    assert.equal(
      (
        await request(
          `/rooms/${dm.id}/messages`,
          "GET",
          undefined,
          alice.cookie,
        )
      ).data.items.length,
      1,
    );
    await request(
      `${path}/${message.id}`,
      "DELETE",
      undefined,
      bob.cookie,
      403,
    );
    await request(`${path}/${message.id}`, "DELETE", undefined, alice.cookie);
    await request(
      `/servers/${server.id}/membership`,
      "DELETE",
      undefined,
      bob.cookie,
    );
    await request(path, "GET", undefined, bob.cookie, 403);
    const session = await db.session.findFirstOrThrow({
      where: { userId: alice.id },
    });
    assert.notEqual(session.id, alice.cookie.split("=")[1]);
    await request("/auth/logout", "POST", undefined, alice.cookie, 201);
    await request("/auth/me", "GET", undefined, alice.cookie, 401);
    const login = await request(
      "/auth/login",
      "POST",
      { email: `${alice.username}@example.test`, password },
      "",
      201,
    );
    assert.equal(login.data.id, alice.id);
    assert.equal(
      (
        await request(
          `/rooms/${dm.id}/messages`,
          "GET",
          undefined,
          login.cookie,
        )
      ).data.items[0].content,
      "Özel bir merhaba",
    );
  },
);

test("validation, expired invites, duplicate identities and revoked sessions are enforced", async () => {
  await request(
    "/auth/register",
    "POST",
    {
      username: "invalid",
      displayName: "Test",
      email: "not-an-email",
      password: "short",
    },
    "",
    400,
  );
  const a = await register("validation"),
    b = await register("expired");
  await request(
    "/auth/register",
    "POST",
    {
      username: a.username,
      displayName: "Duplicate",
      email: `${a.username}@example.test`,
      password,
    },
    "",
    409,
  );
  const { data: s } = await request(
    "/servers",
    "POST",
    { name: "Expiry tests" },
    a.cookie,
    201,
  );
  const { data: invite } = await request(
    `/servers/${s.id}/invites`,
    "POST",
    undefined,
    a.cookie,
    201,
  );
  await db.invite.update({
    where: { code: invite.code },
    data: { expiresAt: new Date(0) },
  });
  await request(
    `/invites/${invite.code}/join`,
    "POST",
    undefined,
    b.cookie,
    403,
  );
  await request(
    `/rooms/${s.channels.find((c: { kind: string }) => c.kind === "text").id}/messages`,
    "POST",
    { content: " ".repeat(3) },
    a.cookie,
    400,
  );
  const socket = await connect(a);
  const roomId = s.channels.find((c: { kind: string }) => c.kind === "text").id;
  assert.equal(
    (await socket.timeout(3000).emitWithAck("room:join", { roomId })).ok,
    true,
  );
  await request("/auth/logout", "POST", undefined, a.cookie, 201);
  assert.equal(
    (await socket.timeout(3000).emitWithAck("room:join", { roomId })).ok,
    false,
  );
});

test(
  "password rotation revokes prior sessions and invite capacity cannot be raced",
  { timeout: 30000 },
  async () => {
    const a = await register("rotation"),
      b = await register("capacityb"),
      c = await register("capacityc");
    const { data: server } = await request(
      "/servers",
      "POST",
      { name: "Limited capacity" },
      a.cookie,
      201,
    );
    const { data: invite } = await request(
      `/servers/${server.id}/invites`,
      "POST",
      undefined,
      a.cookie,
      201,
    );
    await db.invite.update({
      where: { code: invite.code },
      data: { maxUses: 1 },
    });
    const results = await Promise.all(
      [b, c].map((client) =>
        fetch(`${base}/invites/${invite.code}/join`, {
          method: "POST",
          headers: { origin, cookie: client.cookie },
        }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 403]);
    assert.equal(
      (await db.invite.findUniqueOrThrow({ where: { code: invite.code } }))
        .uses,
      1,
    );
    await request(
      "/auth/password",
      "POST",
      { currentPassword: "incorrect", newPassword: "New valid password! 2026" },
      a.cookie,
      401,
    );
    const newSession = await request(
      "/auth/password",
      "POST",
      { currentPassword: password, newPassword: "New valid password! 2026" },
      a.cookie,
      201,
    );
    await request("/auth/me", "GET", undefined, a.cookie, 401);
    assert.equal(
      (await request("/auth/me", "GET", undefined, newSession.cookie)).data.id,
      a.id,
    );
    await request(
      "/auth/login",
      "POST",
      { email: `${a.username}@example.test`, password },
      "",
      401,
    );
    await request(
      "/auth/login",
      "POST",
      {
        email: `${a.username}@example.test`,
        password: "New valid password! 2026",
      },
      "",
      201,
    );
  },
);
