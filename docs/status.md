# KYTEW 0.1.0 — aşama raporu

27 Ekim 2026 tarihinde bu bulut makinesinde doğrulandı.

| Aşama | Durum |
| --- | --- |
| 1 — Temel | Monorepo, NestJS/React/Electron kabuğu, PostgreSQL, Prisma şeması, migration, Redis, temel güvenlik ve özgün tasarım sistemi tamamlandı. Native Electron pencere testi ortam sınırlaması nedeniyle yapılmadı. |
| 2 — Metin iletişimi | Hesaplar, temel profil, arkadaşlık, birebir DM, sunucu/kanal, canlı metin ve kalıcı geçmiş çalışıyor. Gelişmiş profil görselleri ve grup DM yok. |
| 3 — Ses/görüntü | LiveKit ile gerçek çok katılımcılı ses, mikrofon/ses çıkışı, cihaz/katılımcı sesi, bağlantı kalitesi ve yeniden bağlantı eklendi. İki bağımsız tarayıcıda çift yönlü çözülen ses doğrulandı. Kamera, ekran paylaşımı ve fiziksel PC/tablet testi henüz yok. |
| 4 — Topluluk yönetimi | Temel sahip/üye denetimi ve sınırlı davet var. Özel roller, moderasyon, dosyalar ve bildirimler uygulanmadı. |
| 5 — Son kalite/paket | Testler, sanallaştırma, güvenlik kontrolleri, belgeler, Windows paketleme yapılandırması ve CI dosyaları hazır. Windows installer üretimi, imzalama ve cihaz testi yapılmadı. |

## Doğrulanan kontroller

- PostgreSQL 16 ve Redis 7 Docker healthcheck: başarılı.
- `npm run db:generate`: başarılı, Rust gerektirmeyen Prisma istemcisi.
- `npm run db:migrate`: iki migration uygulandı; tekrarlı çalıştırmada değişiklik yok.
- `npm run typecheck`, `npm run build`: başarılı.
- `npm test`: **11 test, 11 başarılı**. Beş kaynak politikası testi, Electron ses izin testi ve beş gerçek API/PostgreSQL/Redis/Socket.IO/LiveKit entegrasyon akışı içerir.
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:ui`: **4 test, 4 başarılı**. İki bağımsız oturum, kanal mesajları, yeniden yüklemede geçmiş, canlı mesaj düzenleme, arkadaşlık, DM, tema, çıkış ve mobil giriş test edildi. Ek ses testi gerçek SFU üzerinden iki yönlü çözülen ses enerjisini, sinyal yeniden bağlantısını, mikrofon/ses çıkışı ve katılımcı ses seviyesini, gezinme sırasında görüşmenin sürmesini ve sunucu tarafından üyelik/oturum iptalini doğrular. JavaScript çalışma zamanı hatası görülmedi.
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

## Sesli sohbet eklemesi

- Yerel LiveKit 1.13.11 digest ile sabitlendi; Compose voice profili ve healthcheck eklendi. `voice:setup` mevcut sırları koruyarak eksikleri üretir. Tekrar çalıştırma ve temiz `npm ci` kurulumu sınandı.
- Üye erişimi, 60 saniyelik yalnızca mikrofon kapsamlı token, Redis ses lease'i ve 10 saniyelik SFU/veritabanı denetimi var. Token metadata'sındaki lease kimliği de eşleşmelidir; eski token yeni oturumun geçerli lease'ini kullanamaz.
- WebRTC medya testi bilinen WAV girdisiyle gerçek ağ yolunu kullanır; mock görüşme veya sahte katılımcı kullanılmaz. Yerel TLS sertifikasını açıkça güvenilen CA olarak vererek HTTPS API ve WSS sinyal proxy'si ayrıca sınandı; TLS doğrulaması kapatılmadı.
- Mikrofon, hoparlör ve kişi sesi ayarlanabilir. Desteklenmeyen tarayıcıda çıkış cihazı sistemden seçilir. Push-to-Talk, kamera, ekran paylaşımı ve görüşme kaydı yoktur. WAN/TURN ve fiziksel Windows/tablet mikrofon testi ayrıca gerekir.
- Ayrıntılı kullanıcı kurulumu: [PC ve tablet ses/HTTPS rehberi](voice.md). SDK ilk ses katılımında dinamik yüklenir; geliştirme derlemesinde SDK büyüklüğü nedeniyle Vite chunk uyarısı bulunabilir, derleme başarılıdır.
