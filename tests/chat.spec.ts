import { test, expect, type Page } from "@playwright/test";

test("IP-address browser origin supports registration and persisted live chat", async ({
  page,
}) => {
  // A different browser origin than localhost reproduces the original rejection.
  // Use loopback in cloud runners whose browser egress proxy blocks private IPs.
  // Set KYTEW_TEST_LAN_IP to this PC's actual LAN IP for a local network run.
  const address = process.env.KYTEW_TEST_LAN_IP ?? "127.0.0.1";
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`http://${address}:5173`);
  const suffix = Date.now().toString(36);
  await page
    .getByRole("button", { name: "Hesap oluştur", exact: true })
    .click();
  await page.getByLabel("Görünen ad").fill("Tablet");
  await page.getByLabel("Kullanıcı adı", { exact: true }).fill(`lan_${suffix}`);
  await page.getByLabel("E-posta adresi").fill(`lan_${suffix}@example.test`);
  await page
    .getByLabel("Şifre", { exact: true })
    .fill("KYTEW LAN test password! 2026");
  await page
    .getByRole("button", { name: "Hesap oluştur", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Merhaba, Tablet" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sunucu oluştur", exact: true })
    .click();
  await page.getByLabel("Sunucu adı").fill(`Tablet ağı ${suffix}`);
  await page
    .getByRole("button", { name: "Sunucuyu oluştur", exact: true })
    .click();
  await expect(page.getByText("Canlı bağlantı", { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Mesaj", exact: true })
    .fill("Yerel ağdan merhaba!");
  await page.getByRole("button", { name: "Mesaj gönder", exact: true }).click();
  await expect(
    page.getByText("Yerel ağdan merhaba!", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Arkadaşlar", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Tablet ağı ${suffix}`, exact: true })
    .click();
  await expect(page.getByText("Canlı bağlantı", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Yerel ağdan merhaba!", { exact: true }),
  ).toBeVisible();
});

test("two separate sessions can create, join and exchange persisted messages", async ({
  browser,
  page,
}) => {
  const suffix = Date.now().toString(36);
  const contextB = await browser.newContext();
  const bob = await contextB.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  bob.on("pageerror", (e) => errors.push(e.message));
  async function register(p: Page, name: string) {
    await p.goto("/");
    await p.getByRole("button", { name: "Hesap oluştur", exact: true }).click();
    await p.getByLabel("Görünen ad").fill(name);
    await p
      .getByLabel("Kullanıcı adı", { exact: true })
      .fill(`${name.toLowerCase()}_${suffix}`);
    await p.getByLabel("E-posta adresi").fill(`${name}_${suffix}@example.test`);
    await p
      .getByLabel("Şifre", { exact: true })
      .fill("KYTEW browser password! 2026");
    await p.getByRole("button", { name: "Hesap oluştur", exact: true }).click();
    await expect(
      p.getByRole("heading", { name: new RegExp(`Merhaba, ${name}`) }),
    ).toBeVisible();
  }
  await register(page, "Aylin");
  await register(bob, "Deniz");
  await page
    .getByRole("button", { name: "Sunucu oluştur", exact: true })
    .click();
  await page.getByLabel("Sunucu adı").fill(`KYTEW Atölye ${suffix}`);
  await page
    .getByLabel("Açıklama")
    .fill("Birlikte üretiyor, birlikte paylaşıyoruz.");
  await page
    .getByRole("button", { name: "Sunucuyu oluştur", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "genel", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Arkadaşlarını davet et", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Davet kodu oluştur", exact: true })
    .click();
  const code = await page.locator(".invite-code code").innerText();
  await page.getByRole("button", { name: "Kapat", exact: true }).click();
  await bob.getByRole("button", { name: "Davetle katıl", exact: true }).click();
  await bob.getByLabel("Davet kodu", { exact: true }).fill(code);
  await bob
    .getByRole("button", { name: "Sunucuya katıl", exact: true })
    .click();
  await expect(
    bob.getByRole("heading", { name: "genel", exact: true }),
  ).toBeVisible();
  await expect(bob.getByText("Canlı bağlantı", { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Mesaj", exact: true })
    .fill("Merhaba Deniz, KYTEW artık canlı!");
  await page.getByRole("button", { name: "Mesaj gönder", exact: true }).click();
  await expect(
    bob.getByText("Merhaba Deniz, KYTEW artık canlı!", { exact: true }),
  ).toBeVisible();
  await bob
    .getByRole("textbox", { name: "Mesaj", exact: true })
    .fill("Merhaba Aylin! Mesajın ulaştı.");
  await bob.getByRole("button", { name: "Mesaj gönder", exact: true }).click();
  await expect(
    page.getByText("Merhaba Aylin! Mesajın ulaştı.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/kytew-community.png",
    fullPage: true,
  });
  await bob.reload();
  await expect(
    bob.getByRole("heading", { name: "Arkadaşlar", exact: true }),
  ).toBeVisible();
  await bob
    .getByRole("button", { name: `KYTEW Atölye ${suffix}`, exact: true })
    .click();
  await expect(
    bob.getByText("Merhaba Deniz, KYTEW artık canlı!", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mesajı düzenle", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Mesajı düzenle", exact: true })
    .fill("KYTEW: Düzenlenmiş gerçek mesaj.");
  await page
    .getByRole("button", { name: "Düzenlemeyi kaydet", exact: true })
    .click();
  await expect(
    bob.getByText("KYTEW: Düzenlenmiş gerçek mesaj.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Arkadaşlar ve özel mesajlar", exact: true })
    .click();
  await bob
    .getByRole("button", { name: "Arkadaşlar ve özel mesajlar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Arkadaş ekle", exact: true })
    .filter({ hasText: "Arkadaş ekle" })
    .click();
  await page
    .getByLabel("Kullanıcı adı", { exact: true })
    .fill(`deniz_${suffix}`);
  await page
    .getByRole("button", { name: "Arkadaşlık isteği gönder", exact: true })
    .click();
  await bob.getByRole("button", { name: "Bekleyen", exact: false }).click();
  await expect(
    bob.getByRole("button", { name: "İsteği kabul et", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await bob
    .getByRole("button", { name: "İsteği kabul et", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Deniz ile sohbet et", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await page
    .getByRole("button", { name: "Deniz ile sohbet et", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Mesaj", exact: true })
    .fill("Sadece ikimizin özel sohbeti.");
  await page.getByRole("button", { name: "Mesaj gönder", exact: true }).click();
  await bob
    .getByRole("button", { name: "Tüm arkadaşlar", exact: false })
    .click();
  await bob
    .getByRole("button", { name: "Aylin ile sohbet et", exact: true })
    .click();
  await expect(
    bob.getByText("Sadece ikimizin özel sohbeti.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Kullanıcı ayarları", exact: true })
    .click();
  await page.getByRole("button", { name: "Açık tema", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Koyu tema", exact: true }).click();
  await page
    .getByRole("button", { name: "Güvenli çıkış", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Giriş yap", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await contextB.close();
});

test("authentication screen is responsive and has no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tekrar hoş geldin." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/kytew-login-mobile.png",
    fullPage: true,
  });
});
