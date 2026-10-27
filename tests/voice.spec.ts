import { test, expect, type BrowserContext, type Page } from "@playwright/test";

const origin = "http://localhost:5173";
async function instrument(context: BrowserContext) {
  await context.addInitScript(() => {
    const pcs: RTCPeerConnection[] = [];
    const sockets: WebSocket[] = [];
    (
      window as unknown as { __voiceTestSockets: WebSocket[] }
    ).__voiceTestSockets = sockets;
    window.WebSocket = new Proxy(window.WebSocket, {
      construct(target, args) {
        const socket = new target(...args);
        sockets.push(socket);
        return socket;
      },
    });
    (
      window as unknown as { __voiceTestPCs: RTCPeerConnection[] }
    ).__voiceTestPCs = pcs;
    window.RTCPeerConnection = new Proxy(window.RTCPeerConnection, {
      construct(target, args) {
        const pc = new target(...args);
        pcs.push(pc);
        return pc;
      },
    });
  });
}
async function audioStats(page: Page) {
  return page.evaluate(async () => {
    let bytes = 0,
      energy = 0,
      samples = 0;
    const pcs = (window as unknown as { __voiceTestPCs: RTCPeerConnection[] })
      .__voiceTestPCs;
    for (const pc of pcs) {
      if (pc.connectionState === "closed") continue;
      const report = await pc.getStats();
      report.forEach((stat) => {
        if (
          stat.type === "inbound-rtp" &&
          (stat.kind === "audio" || stat.mediaType === "audio")
        ) {
          bytes += stat.bytesReceived || 0;
          energy += stat.totalAudioEnergy || 0;
          samples += stat.totalSamplesReceived || 0;
        }
      });
    }
    return { bytes, energy, samples };
  });
}

test(
  "two users exchange decoded audio through LiveKit; mute, deafen, text navigation and server revocation work",
  { timeout: 90000 },
  async ({ browser }) => {
    const a = await browser.newContext({ permissions: ["microphone"] }),
      b = await browser.newContext({ permissions: ["microphone"] });
    await instrument(a);
    await instrument(b);
    const suffix = Date.now().toString(36);
    async function account(context: BrowserContext, name: string) {
      const response = await context.request.post(
        origin + "/api/auth/register",
        {
          headers: { Origin: origin },
          data: {
            username: `${name.toLowerCase()}_${suffix}`,
            displayName: name,
            email: `${name}_${suffix}@example.test`,
            password: "KYTEW voice test password 2026!",
          },
        },
      );
      expect(response.status(), await response.text()).toBe(201);
      return response.json();
    }
    try {
      const alice = await account(a, "SesA"),
        bob = await account(b, "SesB");
      const created = await a.request.post(origin + "/api/servers", {
        headers: { Origin: origin },
        data: { name: `Ses testi ${suffix}` },
      });
      expect(created.status()).toBe(201);
      const server = await created.json();
      const invite = await a.request.post(
        `${origin}/api/servers/${server.id}/invites`,
        { headers: { Origin: origin } },
      );
      const code = (await invite.json()).code;
      expect(
        (
          await b.request.post(`${origin}/api/invites/${code}/join`, {
            headers: { Origin: origin },
          })
        ).status(),
      ).toBe(201);
      expect(
        (await (await a.request.get(origin + "/api/voice/status")).json())
          .ready,
      ).toBe(true);
      const pageA = await a.newPage(),
        pageB = await b.newPage();
      const errors: string[] = [];
      pageA.on("pageerror", (e) => errors.push(e.message));
      pageB.on("pageerror", (e) => errors.push(e.message));
      for (const page of [pageA, pageB]) {
        await page.goto(origin);
        await page
          .getByRole("button", { name: server.name, exact: true })
          .click();
        await page
          .getByRole("button", { name: "Sohbet Odası ses kanalı", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Ses kanalına katıl", exact: true })
          .click();
        await expect(
          page.getByRole("status").filter({ hasText: "Bağlandı" }),
        ).toBeVisible({ timeout: 20000 });
      }
      await expect(pageA.locator("[data-voice-member]")).toHaveCount(2);
      await expect(pageB.locator("[data-voice-member]")).toHaveCount(2);
      for (const page of [pageA, pageB]) {
        await expect
          .poll(async () => (await audioStats(page)).bytes, { timeout: 15000 })
          .toBeGreaterThan(0);
        await expect
          .poll(async () => (await audioStats(page)).samples, {
            timeout: 15000,
          })
          .toBeGreaterThan(0);
        await expect
          .poll(async () => (await audioStats(page)).energy, { timeout: 15000 })
          .toBeGreaterThan(0);
        expect(
          await page.locator("audio[data-voice-audio]").count(),
        ).toBeGreaterThan(0);
      }
      const signalsBefore = await pageA.evaluate(() => {
        const sockets = (
          window as unknown as { __voiceTestSockets: WebSocket[] }
        ).__voiceTestSockets.filter((s) => s.url.includes("/livekit/rtc"));
        sockets
          .find((s) => s.readyState === WebSocket.OPEN)!
          .close(4000, "Connection recovery test");
        return sockets.length;
      });
      await expect
        .poll(
          () =>
            pageA.evaluate(
              () =>
                (
                  window as unknown as { __voiceTestSockets: WebSocket[] }
                ).__voiceTestSockets.filter((s) =>
                  s.url.includes("/livekit/rtc"),
                ).length,
            ),
          { timeout: 20000 },
        )
        .toBeGreaterThan(signalsBefore);
      await expect(
        pageA.getByRole("status").filter({ hasText: "Bağlandı" }),
      ).toBeVisible({ timeout: 20000 });
      const beforeRecovery = (await audioStats(pageA)).bytes;
      await expect
        .poll(async () => (await audioStats(pageA)).bytes, { timeout: 10000 })
        .toBeGreaterThan(beforeRecovery);
      await pageA
        .locator(".voice-main-controls")
        .getByRole("button", { name: "Mikrofonu kapat", exact: true })
        .click();
      await expect(
        pageB.locator(`[data-voice-member="${alice.id}"] .voice-person-status`),
      ).toHaveText("Mikrofon kapalı");
      await pageA
        .locator(".voice-main-controls")
        .getByRole("button", { name: "Mikrofonu aç", exact: true })
        .click();
      await expect(
        pageB.locator(`[data-voice-member="${alice.id}"] .voice-person-status`),
      ).not.toHaveText("Mikrofon kapalı");
      await pageB
        .locator(".voice-main-controls")
        .getByRole("button", { name: "Ses çıkışını kapat", exact: true })
        .click();
      expect(
        await pageB
          .locator("audio[data-voice-audio]")
          .evaluateAll((elements) =>
            elements.every((el) => (el as HTMLAudioElement).muted),
          ),
      ).toBe(true);
      await pageB
        .locator(".voice-main-controls")
        .getByRole("button", { name: "Ses çıkışını aç", exact: true })
        .click();
      expect(
        await pageB
          .locator("audio[data-voice-audio]")
          .evaluateAll((elements) =>
            elements.every((el) => !(el as HTMLAudioElement).muted),
          ),
      ).toBe(true);
      await pageB.getByRole("slider", { name: "SesA ses seviyesi" }).fill("25");
      await expect
        .poll(() =>
          pageB
            .locator("audio[data-voice-audio]")
            .evaluateAll((elements) =>
              elements.every((el) => (el as HTMLAudioElement).volume <= 0.26),
            ),
        )
        .toBe(true);
      await pageB
        .getByRole("slider", { name: "SesA ses seviyesi" })
        .fill("100");
      await pageA.getByRole("button", { name: "genel", exact: true }).click();
      await expect(
        pageA.getByRole("region", { name: "Ses bağlantısı" }),
      ).toBeVisible();
      expect((await audioStats(pageA)).bytes).toBeGreaterThan(0);
      await pageA
        .getByRole("button", { name: "Sohbet Odası ses kanalı", exact: true })
        .click();
      await pageA.screenshot({
        path: "test-results/kytew-voice.png",
        fullPage: true,
      });
      // A modified client ignoring heartbeat denial is still kicked by server enforcement.
      await pageB.route("**/api/voice/**/heartbeat", (route) =>
        route.fulfill({ status: 201, json: { ok: true } }),
      );
      expect(
        (
          await b.request.delete(
            `${origin}/api/servers/${server.id}/membership`,
            { headers: { Origin: origin } },
          )
        ).status(),
      ).toBe(200);
      await expect(
        pageA.locator(`[data-voice-member="${bob.id}"]`),
      ).toHaveCount(0, { timeout: 20000 });
      await expect(
        pageB.getByRole("button", { name: "Ses kanalına katıl", exact: true }),
      ).toBeVisible({ timeout: 10000 });
      expect(
        (
          await a.request.post(origin + "/api/auth/logout", {
            headers: { Origin: origin },
          })
        ).status(),
      ).toBe(201);
      await expect(
        pageA.getByRole("button", { name: "Ses kanalına katıl", exact: true }),
      ).toBeVisible({ timeout: 20000 });
      expect(errors).toEqual([]);
    } finally {
      await a.close();
      await b.close();
    }
  },
);
