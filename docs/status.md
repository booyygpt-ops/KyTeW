# KYTEW 0.1.0 — aşama raporu

27 Ekim 2026 tarihinde bu bulut makinesinde doğrulandı.

| Aşama | Durum |
| --- | --- |
| 1 — Temel | Monorepo, NestJS/React/Electron kabuğu, PostgreSQL, Prisma şeması, migration, Redis, temel güvenlik ve özgün tasarım sistemi tamamlandı. Native Electron pencere testi ortam sınırlaması nedeniyle yapılmadı. |
| 2 — Metin iletişimi | Hesaplar, temel profil, arkadaşlık, birebir DM, sunucu/kanal, canlı metin ve kalıcı geçmiş çalışıyor. Gelişmiş profil görselleri ve grup DM yok. |
| 3 — Ses/görüntü | Uygulanmadı. Sonraki geliştirme aşaması: üyelik kontrollü LiveKit token endpoint'i, gerçek ses odası ve iki cihazla ses testi. |
| 4 — Topluluk yönetimi | Temel sahip/üye denetimi ve sınırlı davet var. Özel roller, moderasyon, dosyalar ve bildirimler uygulanmadı. |
| 5 — Son kalite/paket | Testler, sanallaştırma, güvenlik kontrolleri, belgeler, Windows paketleme yapılandırması ve CI dosyaları hazır. Windows installer üretimi, imzalama ve cihaz testi yapılmadı. |

## Doğrulanan kontroller

- PostgreSQL 16 ve Redis 7 Docker healthcheck: başarılı.
- `npm run db:generate`: başarılı, Rust gerektirmeyen Prisma istemcisi.
- `npm run db:migrate`: iki migration uygulandı; tekrarlı çalıştırmada değişiklik yok.
- `npm run typecheck`, `npm run build`: başarılı.
- `npm test`: **8 test, 8 başarılı**. Dört kaynak politikası testi ve dört gerçek API/PostgreSQL/Redis/Socket.IO entegrasyon akışı içerir.
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:ui`: **3 test, 3 başarılı**. İki bağımsız oturum, kanal mesajları, yeniden yüklemede geçmiş, canlı mesaj düzenleme, arkadaşlık, DM, tema, çıkış ve mobil giriş test edildi. JavaScript çalışma zamanı hatası görülmedi.
- Temiz bir geçici dizinde `npm ci`, Prisma generate ve üretim derlemesi başarılı.
- Tam `npm audit` taraması: doğrulama anında **0 bildirim**. Bu sonuç kapsamlı uygulama güvenlik incelemesinin yerine geçmez.
- API `/health` ve Vite üzerinden `/api/health`: PostgreSQL/Redis sorgularıyla başarılı.

## Önemli teknik notlar

- Bağımlılık taramasının işaret ettiği dolaylı paketler için root `overrides`: `multer 2.5.0`, Prisma config altında `deepmerge-ts 8.0.2` ve `effect 3.22.4`. Prisma istemci üretimi ve tüm akışlar bu sürümlerle tekrar doğrulandı. Electron 45.0.0'a güncellendi. Kilit dosyası temiz kurulumla sınandı.
- Eski Prisma Rust motor domain izni gerekmiyor. Paket bütünlüğü ve TLS doğrulaması kapatılmadı.
- Prisma deneysel JS migration CLI'sinin PostgreSQL `name` türü hatası, gözden geçirilebilir SQL ve atomik/checksum denetimli migration runner ile aşıldı; `prisma migrate deploy` kullanılmamalı.
- Electron Linux açılışı grafik oturumu/sandbox helper gereksinimleri nedeniyle doğrulanamadı; sandbox kapatılmadı. Windows `.exe` dosyası mevcut değil. `.github/workflows/windows.yml` gerçek HTTPS adresi girilerek Windows runner'da manuel çalıştırılabilecek paketleme işini tanımlar; uzaktaki CI burada çalıştırılmadı.
- Kaynak kodu GitHub main dalında tutulur; üretime yayın ve Windows cihaz testi yapılmadı. Bulut yapılandırmasının yayımlanması ve yeni görevde geri yüklenmesi ayrıca doğrulanmalıdır.

## Yerel ağ kaynak hatası düzeltmesi

Tablet kayıt isteği, sayfa PC'nin IP adresiyle açıldığında yalnızca localhost'a izin veren kaynak kontrolüne takılıyordu. HTTP CORS, yazma istekleri ve WebSocket handshake aynı politika altında birleştirildi. Geliştirmede makinenin özel IPv4 adresleri aynı portta otomatik kabul edilir; üretimde ek adresler açıkça `WEB_ORIGINS` ile tanımlanır. Başka makinelere ait özel IP'ler, farklı portlar ve güvenilmeyen alan adları reddedilmeye devam eder.

API entegrasyonu LAN Origin başlığıyla kayıt, kimlik doğrulama ve canlı mesaj teslimatını; birim testleri gerçek arayüz adreslerinden türetilen listenin sınırlarını doğrular. Tarayıcı regresyonu localhost yerine IP kaynağıyla (bulutta 127.0.0.1) kayıt, çerez oturumu, WebSocket ve geçmişi sınar. Bulut tarayıcısının egress proxy'si gerçek özel IP navigasyonunu engellediği için fiziksel tablet/PC ağ bağlantısı burada doğrulanmadı. Yerel cihazda tam ağ testi için `KYTEW_TEST_LAN_IP` değerini PC'nin IPv4 adresi yapıp `npm run test:ui` çalıştırabilirsiniz. Test başlatıcısı artık yalnızca ön yüz portu yerine `/api/health` hazırlığını bekler.
