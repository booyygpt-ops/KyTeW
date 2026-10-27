# Mimari

```text
apps/desktop/ React 19 + TypeScript + Vite + Tailwind 4
  src/        Auth, Workspace, Chat, profil ve işlem formları
  electron/   contextIsolation/sandbox; izinleri kapalı, dar preload
apps/api/     NestJS 11
  auth.ts     kayıt, oturum, profil, şifre değişimi
  security.ts oturum doğrulama, üye/sahip ve sohbet erişim denetimi
  community.ts sunucu, kanal, üye ve süre/kullanım sınırlı davet
  social.ts   arkadaşlık ve iki taraflı DM
  voice.ts    LiveKit mikrofon token, Redis lease ve sunucu taraflı iptal denetimi
  messages.ts kalıcı mesaj komutları, imleç sayfalama ve arama
  realtime.ts Socket.IO yetkili oda abonelikleri; Redis yazıyor sınırlaması
  database.ts Prisma + PostgreSQL sürücü adaptörü
infra/        atomik SQL migration runner
```

HTTP komutları `/api` ters proxy'si üzerinden API'ye ulaşır. Socket.IO `/socket.io` üzerinde WebSocket kullanır. Sunucu mesajı önce PostgreSQL'e kaydeder, ardından yalnızca odaya yetkili abonelere gönderir. Yeniden bağlanma sonrası istemci son sayfayı tekrar alır. Son 50 mesaj dışındakiler imleçle yüklenir; geçmişin görünür satırları Virtuoso ile sanallaştırılır. Arama scope'u backend'de üyelikle sınırlıdır. Büyük veri hacimleri için sonraki adım PostgreSQL full-text/trigram indeksleri ve mesaj olayları için durable outbox'tır.

Redis API hız sınırlarını ve yazıyor olaylarını koordine eder. **Bu sürüm tek API instance içindir.** Socket.IO Redis adapter / çoklu instance fan-out henüz kurulmamıştır; Redis kullanımı tek başına yatay ölçekleme sağlamaz. Liste yenilemeleri 10 saniyelik polling kullanır.

## Veri güvenliği

- Argon2id (64 MiB, üç tur) ve parola uzunluk sınırı; oturum anahtarı 256 bit rastgele, veritabanında yalnızca SHA-256 özeti.
- Geliştirmede HttpOnly/SameSite=Lax; üretimde ek olarak Secure ve `__Host-` öneki. Token localStorage'a yazılmaz. Kalıcı giriş 30 gün; normal giriş sunucuda en fazla bir gün ve tarayıcı oturum çerezi.
- Zod doğrulama, 16 KiB HTTP ve 8 KiB socket gövde sınırı; Prisma parametreli sorgular.
- Değiştiren HTTP isteklerinde kesin Origin kontrolü; WebSocket handshake ve oda aboneliğinde oturum/Origin kontrolü.
- HTTP CORS, yazma istekleri ve Socket.IO ortak kaynak politikasını kullanır. `WEB_ORIGIN` birincil adres, `WEB_ORIGINS` ek tam adreslerdir. Yalnızca `NODE_ENV=development` altında, `ALLOW_LAN_ORIGINS=false` değilse, makinenin gerçek özel IPv4 arayüzleri birincil adresin protokolü ve portunda otomatik eklenir. Başka yerel IP'ler, yanlış portlar ve istemciden gelen Host/forwarded başlıkları güven kaynağı değildir. Üretimde otomatik genişletme yapılmaz.
- Her mesaj gönderme, okuma, düzenleme, silme ve socket aboneliğinde sunucu tarafında yetki kontrolü. Teslimattan önce üyelik/oturum tekrar denetlenir.
- Sunucu sahibi kanal/davet oluşturabilir; üye okuyabilir/yazabilir. İlk sürüm özel rol ve özel kanal yetki motoru içermez.
- Çıkış ve şifre değişimi oturum kayıtlarını iptal eder; sonraki socket teslimatları da bunu denetler.
- Redis IP hız sınırı: giriş/kayıt 20/dakika; diğer HTTP istekleri 120/10 saniye. Güvenilmeyen X-Forwarded-For yok sayılır. Üretim proxy politikasına göre IP rate limit mimarisi gözden geçirilmelidir (proxy arkasında istemciler aynı IP'yi paylaşabilir).
- Markdown ham HTML çalıştırmaz; dış görseller otomatik indirilmez. Electron yeni pencere, keyfi gezinme, webview, kamera ve ekran paylaşımı izinlerini reddeder; yalnızca güvenilen ana çerçevede mikrofon ve ses çıkışı seçimine izin verir. Preload yalnızca platform/sürüm bilgisini açar.

Sınırlar: e-posta sahipliği doğrulanmaz, parola kurtarma yoktur; profil durum alanı bir tercih değeridir. Üretim için mail doğrulama, abuse/moderasyon, olay denetimi, retention/yedekleme, uygulama güvenlik değerlendirmesi ve kod imzalama gereklidir. Doğrulanmamış özelliklere görsel başarı simülasyonu eklenmedi.

## Dil ve tasarım

Varsayılan Türkçe. `src/locales/index.ts` anahtar türüyle denetlenen TR/EN sözlük çekirdeğidir; ilk auth metinleri bunu kullanır. Tam İngilizce çeviri henüz sunulmaz. CSS değişkenleri istenen KYTEW renklerini kullanır. Logo depodaki özgün SVG'dir. Harici font veya Discord varlığı yoktur.

## Geliştirme ilkeleri

Bulut görevleri zaten izoledir; mevcut checkout'u kullanın, kullanıcı istemedikçe worktree oluşturmayın. Şifreleri veya `.env` içeriğini commit etmeyin. Gerçek veri yollarını test edin; tamamlanmayan özellikleri hazır gibi sunmayın.

Ses akışı ve güvenlik sınırları [sesli sohbet belgesinde](voice.md) açıklanır. LiveKit SDK yalnızca ilk ses katılımında dinamik yüklenir. UI bağlantı durumu hem medya hem sinyal yeniden bağlantısını izler; görüşme metin/DM gezinmesinden bağımsız yaşar.
