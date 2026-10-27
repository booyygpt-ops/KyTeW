# Yayınlama ve sonraki servisler

## Metin sürümü

Yerel `compose.yaml` yalnızca PostgreSQL ve Redis'i çalıştırır. Varsayılan parolayı internete açık kullanmayın. Üretimde yönetilen/özel ağ veritabanı, Redis erişim kontrolü, TLS ve yedekleme gerekir.

1. Merkezi API için Node 22/24 ortamında `npm ci`, `.env`/güvenli değişken enjeksiyonu, `npm run db:generate`, `npm run db:migrate`, `npm run build` çalıştırın.
2. `NODE_ENV=production`, `WEB_ORIGIN=https://chat.sizin-alan-adiniz.com`, `DATABASE_URL` ve `REDIS_URL` ayarlayın. API `apps/api` çalışma dizininde `node dist/main.js` ile servis yöneticisi altında açılmalıdır. Üretimde gerçek değişkenler enjekte edildiğinde yerel `.env` gerekmez.
3. `apps/desktop/dist` dosyalarını aynı HTTPS hostname üzerinde servis edin. `/api/` isteklerini API'nin `/` yoluna; `/socket.io/` isteklerini WebSocket upgrade desteğiyle yönlendirin. `infra/nginx.conf` TLS sonlandıran bir yük dengeleyici arkasındaki örnektir; varsayılan upstream `127.0.0.1:4000` adresini topolojinize uyarlayın.
4. `/api/health` yanıtı PostgreSQL ve Redis'i doğrulamalıdır. İki bağımsız hesapla mesajlaşma testi yapın. Ardından bu HTTPS adresiyle Windows paketini üretin.

Statik Vite `preview` sunucusu üretim API ters proxy'si sağlamaz. Dağıtılacak istemci ve API aynı origin olmalıdır; Electron `file://` kaynağından cross-site oturum çerezi kullanımına dayanmaz. Masaüstü kabuğu güvenilen sunucudan web uygulamasını yükler; çevrimdışı sohbet çalışmaz. İlk sürümde uzaktan güncellenen web UI bu dağıtım modelinin açık bir tercihidir.

Windows paketleme ortamında Electron/GitHub release ve electron-builder NSIS araçlarına ağ erişimi gerekir. Sertifikalar kaynak koda konulmaz; CI secret olarak yapılandırılır. Bu depoda otomatik yayınlama, sertifika veya gerçek sunucu alan adı tanımlanmamıştır.

## Aşama 3: LiveKit / WebRTC (henüz uygulanmadı)

Gerçek çok kullanıcılı ses/görüntü için merkezi LiveKit SFU gerekir. Önerilen akış: istemci yetkili API'den kısa ömürlü, kanal/katılımcı kapsamlı LiveKit token'ı alır; API kanal bağlanma/konuşma/paylaşma yetkilerini denetler. `LIVEKIT_API_SECRET` hiçbir zaman istemciye verilmez. TLS sinyal sunucusu, UDP medya portları, NAT ve TURN gereksinimleri dağıtıma göre yapılandırılmalıdır. Varsayılan yaygın portlar TCP 7880 sinyal, TCP 7881 ve UDP 50000–60000 medyadır; kesin değerler LiveKit sunucu sürümüne göre resmî yapılandırmadan seçilmelidir.

Örnek değişken adları `.env.example` içindedir; v0.1 bunları okumaz. Gerçek iki cihazda NAT/TURN, mikrofon/kamera izinleri, kopma-yeniden bağlanma, hoparlör seçimi, katılımcı yetkileri ve ekran paylaşımı test edilmeden ses aşaması tamamlanmış sayılmaz. Electron'da medya izinleri ve güvenli ekran kaynağı seçimi bu aşamada dar kapsamlı olarak açılmalıdır; mevcut sürüm bunları reddeder.

## Aşama 4: S3 (henüz uygulanmadı)

S3 uyumlu bucket, endpoint, sunucu taraflı erişim anahtarı, sınırlı CORS ve kısa ömürlü presigned upload/download akışı gerekir. MIME içerik tespiti, boyut/kota, izinler, malware taraması, güvenli indirme başlıkları ve özel bucket varsayılanı uygulanmalıdır. `.env.example` yalnızca değişken adlarını belgeler; dosya yükleme bu sürümde sunulmaz.
