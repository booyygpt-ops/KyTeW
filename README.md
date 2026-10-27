# KYTEW

Özgün bir görsel kimliğe sahip, Türkçe öncelikli masaüstü topluluk uygulaması. **v0.1, çalışan metin iletişimi sürümüdür; ürünün tamamı değildir.** Örnek kullanıcı, mesaj veya sahte veri eklenmez. İlk açılışta hesap ve sunucu oluşturun.

## Çalışan özellikler

- Kayıt, giriş, HttpOnly oturum çerezi, oturumu hatırlama, güvenli çıkış ve diğer oturumları iptal eden şifre değişimi.
- Argon2id şifre hashleri; veritabanında yalnızca SHA-256 özeti tutulan rastgele oturum anahtarları.
- Görünen ad, biyografi, benzersiz kullanıcı adı ve durum **tercihi**. Durum tercihi canlı çevrimiçi takibi değildir.
- Sunucu oluşturma; varsayılan metin ve henüz kullanılamayan ses kanalı; sahip tarafından yeni metin kanalı oluşturma.
- 24 saat/10 kullanım sınırlı davet, katılma, üye listesi ve üyenin sunucudan ayrılması.
- Arkadaşlık isteği, kabul/ret/iptal, arkadaş silme; kabul edilmiş arkadaşlar arasında birebir özel sohbet.
- PostgreSQL'de saklanan kanal ve DM mesajları; Socket.IO canlı iletim ve yeniden bağlantı; yazıyor göstergesi.
- Mesaj düzenleme/silme (yazar kontrolü), Markdown/kod blokları, arama, 50 mesajlık imleç sayfalama ve sanallaştırılmış liste.
- Özgün K logosu, koyu/açık tema, sürüklenerek boyutlandırılan masaüstü panelleri, klavye erişimi ve hata durumları.
- Electron güvenlik kabuğu ve Windows NSIS paketleme altyapısı.

**Bu sürümde yok:** canlı ses/görüntü/ekran paylaşımı, dosya yükleme, profil görselleri, grup DM, engelleme, e-posta doğrulama/sıfırlama, özel roller/kanal istisnaları, moderasyon, tepkiler/yanıtlar/sabitleme, okunmamış sayaçları, bildirimler, tam İngilizce arayüz, otomatik güncelleme ve Windows başlangıç ayarı. Ses kanalları “Yakında” olarak işaretlidir ve bağlantı başlatmaz. Üyeler/arkadaşlık listeleri 10 saniyede güncellenir; mesajlar gerçek zamanlıdır.

## Gereksinimler

- Node.js 22 veya 24, npm 10+, Docker Engine/Desktop ve Docker Compose v2.
- Masaüstü geliştirme için Windows 10/11 x64 veya grafik oturumlu bir Electron destekli sistem.
- Windows kurulum dosyası üretimi için Windows x64 önerilir. Linux üzerinde Windows çapraz paketleme ve Wine bu kurulumda doğrulanmadı.

## İlk kurulum

Depo kökünde:

```sh
cp .env.example .env
npm ci
# PostgreSQL ve Redis: yalnızca loopback'e açılır, veriler Docker volume içinde kalır.
docker compose up -d --wait
npm run db:generate
npm run db:migrate
npm run dev
```

PowerShell'de ilk komut `Copy-Item .env.example .env` olmalıdır. Var olan `.env` dosyasını üzerine yazmayın. PostgreSQL 5432 ve Redis 6379 portları başka servislerle çakışıyorsa Compose ve `.env` değerlerini birlikte değiştirin. Örnek veritabanı parolası yalnızca yerel geliştirme içindir.

API 4000, Vite 5173 portunda çalışır. Yeni terminalde `npm run desktop` Electron'u açar. İki kullanıcı için iki ayrı tarayıcı profili veya iki ayrı masaüstü veri profili kullanın. Aynı tarayıcı profilindeki sekmeler oturumu paylaşır.

Geliştirme sunucusu çalışırken API kontrolü:

```sh
curl http://localhost:4000/health
# {"name":"KYTEW","status":"ok"}; PostgreSQL ve Redis gerçekten sorgulanır.
```

Durdurmak için uygulama terminalinde Ctrl+C, servisler için `docker compose stop`. `docker compose down` volume verilerini korur. `down -v` verileri siler; rutin kurulumda kullanmayın.

## Aynı ağdaki tablet veya telefondan erişim

Bilgisayarda `npm run dev` açıkken tablette tarayıcıdan `http://BILGISAYARIN-YEREL-IP-ADRESI:5173` adresini açın. Örneğin PC'nin Wi-Fi IPv4 adresi `192.168.1.50` ise adres `http://192.168.1.50:5173` olur. Windows'ta bu adresi `ipconfig` çıktısındaki aktif Wi-Fi/Ethernet bağdaştırıcısının IPv4 satırından bulabilirsiniz. Tablette `localhost` tabletin kendisidir. Aynı PostgreSQL veritabanı kullanıldığı için bilgisayarda açılan hesapla tablette de giriş yapılabilir.

`NODE_ENV=development` olduğunda API, `WEB_ORIGIN` adresine ek olarak **bu bilgisayarın kendi özel IPv4 ağ adreslerini**, aynı protokol ve portta otomatik kabul eder. Kayıt/giriş, CORS ve Socket.IO aynı izin listesini kullanır. Yeni sürüme geçtikten sonra `npm run dev` sürecini tamamen durdurup yeniden başlatın; ağ adaptörü/IP değiştiğinde de yeniden başlatın. Otomatik LAN erişimini kapatmak için `.env` içine `ALLOW_LAN_ORIGINS=false` ekleyin.

Özel hostname, Docker içinde çalışan API veya elle adres tanımlamak için mevcut `.env` içindeki bağlantıları/parolaları değiştirmeden şunları kullanabilirsiniz:

```dotenv
WEB_ORIGIN=http://localhost:5173
WEB_ORIGINS=http://192.168.1.50:5173,http://bilgisayarim.local:5173
```

Örnek IP'yi kendi PC adresinizle değiştirin. `WEB_ORIGINS`, virgülle ayrılmış tam kaynak adresleri içermelidir; `*`, yol ve davet bağlantısı kullanmayın. Kaynak kontrolü istemcinin aynı Wi-Fi'da olmasına veya isteğin Host başlığına göre gevşetilmez. Üretimde otomatik LAN ekleme kapalıdır; yalnızca yapılandırılmış adresler kabul edilir ve HTTPS gerekir. Yerel HTTP geliştirmesini internetten erişilebilir şekilde yayınlamayın.

Sayfa hiç açılmıyorsa aynı ana ağda olduğunuzu (misafir Wi-Fi istemci yalıtımı olmadan), sunucunun açık olduğunu ve Windows Güvenlik Duvarı'nın özel ağ profilinde geliştirme sunucusunun TCP 5173 portuna izin verdiğini kontrol edin. Güvenlik duvarını tamamen kapatmayın. Tablette 4000/5432/6379 portlarını açmanız gerekmez; API ve sohbet bağlantısı Vite üzerinden gider.

## Test ve derleme

```sh
npm run typecheck
npm run build
npm test
# İlk kez Playwright tarayıcısını kurun:
npx playwright install chromium
npm run test:ui
```

Mevcut sistem Chromium'u varsa `CHROMIUM_PATH=/usr/bin/chromium npm run test:ui` kullanılabilir; PowerShell'de değişkeni `$env:CHROMIUM_PATH` ile ayarlayın. API testleri 4101 portunda kendi API sürecini açar; derleme önceden yapılmalıdır. PostgreSQL ve Redis açık olmalıdır. Testler `.env` veritabanında benzersiz adlarla gerçek test kayıtları oluşturur, mevcut verileri silmez. Ayrı test veritabanı tercih ediyorsanız `.env` bağlantısını o veritabanına yöneltip migration uygulayın. UI testleri `npm run dev` çalıştırır veya var olan geliştirme sunucusunu kullanır.

Test kapsamı: hesaplar/hashler, kaynak/oturum denetimi, kanal üyeliği, sahip yetkisi, davet süresi ve eşzamanlı kapasite, canlı Socket.IO iletimi, sayfalama/arama, yazar yetkisi, DM gizliliği, çıkış/şifre değişimi; iki bağımsız tarayıcı oturumuyla gerçek kanal ve DM akışları, yeniden yüklemede geçmiş ve tema/mobil giriş.

## Veritabanı ve migration kararı

Prisma 6.19, `engineType = "client"` ve `@prisma/adapter-pg` kullanılır. Çalışma zamanı Rust binary indirmesi istemez. Şema `apps/api/prisma/schema.prisma`, gözden geçirilebilir SQL migration dosyaları `apps/api/prisma/migrations` altındadır.

Bu sürümde Prisma'nın deneysel JS migration motoru PostgreSQL katalog türü `name` için hata verdiğinden **`prisma migrate deploy` yerine `npm run db:migrate` kullanılır**. Bu komut `infra/migrate.cjs` ile sıralı SQL dosyalarını tek transaction/advisory lock altında uygular; `_kytew_migrations` tablosunda SHA-256 checksum saklar. Aynı komut güvenle tekrar çalıştırılır; uygulanmış SQL değiştirilirse hata verir. Prisma'nın `_prisma_migrations` ledger'ıyla karıştırmayın. Yeni değişiklikleri yeni migration klasörüne ekleyin; uygulanmış migration'ları düzenlemeyin. İlk migration Prisma WASM diff ile üretildi, ikinci migration veritabanı CHECK kısıtlarını ekler.

`prisma.config.ts` JS motorunu yalnızca şema/istemci üretimi için etkinleştirir. Node'un `--env-file` seçeneğiyle `.env` yüklenmeden Prisma komutu çalıştırmayın. npm paket bütünlüğü/TLS doğrulaması devrededir; checksum veya TLS kontrolünü kapatmayın.

## Windows kurulabilir paket

Önce web istemcisini ve API'yi aynı HTTPS alan adı altında yayınlayın ([yayınlama notları](docs/deployment.md)). Masaüstü kabuğu bu güvenilen uygulama adresini açar. Her kullanıcı yerel PostgreSQL veya Node kurmaz; merkezi API'ye bağlanır.

Windows PowerShell:

```powershell
npm ci
$env:KYTEW_APP_URL = "https://chat.sizin-alan-adiniz.com"
npm run dist:win
```

Paket `apps/desktop/release/` altına çıkar. HTTPS adresi verilmezse paketleme bilerek durur; kurulum dosyasına localhost gömülmez. `electron/build-config.cjs` yalnızca herkese açık uygulama adresini `.local/app-config.json` içine yazar; gizli anahtar içermez. Üretimde kod imzalama sertifikası ve Windows cihazında kurulum/smoke testi ayrıca gereklidir. Bu bulut çalışmasında `.exe` oluşturulmadı veya Windows üzerinde test edilmedi.

## Mimari ve sonraki aşamalar

- [Mimari ve güvenlik sınırları](docs/architecture.md)
- [Yayınlama ve harici servisler](docs/deployment.md)
- [Aşama durumu ve doğrulama](docs/status.md)

Discord bağlantıları yalnızca işlevsel referanstır; logo, görsel veya kaynak kod alınmadı. KYTEW sunucu/kanal akışları verilen gereksinimlerden geliştirildi; bu ortamda Discord destek sayfası ağ politikası nedeniyle okunamadı.
