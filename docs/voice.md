# KYTEW sesli sohbet

Güncel sesli sürüm üst çubukta **v0.2.0** gösterir. Ses kanalları başlığında “Yakında” yazısı bulunmaz. Ana sayfadaki **VİDEO YAKINDA** etiketi yalnızca kamera ve ekran paylaşımını ifade eder.

## Eski arayüz görünüyorsa

`npm run dev` mevcut klasördeki dosyaları çalıştırır, GitHub'dan güncelleme indirmez. ZIP ile kurduysanız Git komutları yerine GitHub'dan güncel ZIP'i indirip yeni bir klasöre çıkarın; eski kurulumun `.env` ve `.local` dosyalarını koruyun. Yalnızca derleme çıktıları kullanılıyorsa `npm run build` ile yeniden derleyin. Eski sunucu terminalini Ctrl+C ile kapatıp doğru klasörde yeniden başlatın, ardından tarayıcıyı Ctrl+F5 ile yenileyin. Git klonunda güncellemeyi `git pull origin main` ile alabilirsiniz. Mevcut veritabanı volume'larını silmeyin.

Sunucu ses kanalları LiveKit SFU üzerinden çok katılımcılı gerçek ses taşır. Bu sürüm mikrofon, susturma, ses çıkışını kapatma, cihaz seçimi, kişi bazında ses seviyesi, konuşan kullanıcı vurgusu, bağlantı kalitesi ve yeniden bağlanma içerir. Kamera, ekran paylaşımı, grup DM araması ve Push-to-Talk henüz yoktur.

## PC'de yerel kurulum

Geliştirme sunucusunu kapatın. Depo kökünde:

```sh
npm ci
npm run db:generate
npm run voice:setup
docker compose --profile voice up -d --wait
npm run dev
```

PC'de uygulamayı `http://localhost:5173` üzerinden açın. Sunucudaki **Sohbet Odası** kanalını seçip **Ses kanalına katıl** düğmesine basın. Tarayıcının/Windows'un mikrofon iznini onaylayın. İkinci kullanıcı başka bir oturumdan aynı sunucunun aynı ses kanalına katılmalıdır. Sunucu sahibi yeni kanal oluştururken “Ses kanalı” türünü de seçebilir.

`voice:setup` eksik yerel API anahtarlarını kriptografik rastgelelikle üretir; değerlerini ekrana yazmaz, var olan değerleri değiştirmez. `.env` ve `.local/livekit.yaml` Git dışında tutulur. Scriptteki yerel yapılandırma LiveKit Cloud hesabı gerektirmez. LiveKit imajı, doğrulanan 1.13.11 sürümünün çoklu platform digest'iyle sabitlenmiştir.

Varsayılan `LIVEKIT_URL=/livekit`, tarayıcının açtığı HTTP/HTTPS adresindeki aynı kaynak proxy'sini kullanır. Backend yönetim bağlantısı `LIVEKIT_INTERNAL_URL=http://localhost:7880` üzerindendir. Tarayıcı API anahtarı veya yönetim sırrını almaz; yalnızca kendi kullanıcı/kanal kapsamındaki 60 saniyelik katılma token'ını alır.

## Tablet / telefon: HTTPS gerekiyor

Metin sohbeti yerel HTTP IP adresiyle çalışabilir. **Mikrofon erişimi için tarayıcılar güvenli kaynak ister:** PC'de `localhost` güvenli istisnadır; tablette `http://192.168…` değildir. Sertifika hatasını geçmek her cihazda mikrofonu etkinleştirmez. Cihazın güvendiği geçerli bir HTTPS sertifikası veya güvenli yayınlanmış bir HTTPS alan adı kullanın.

Windows yerel ağ örneği (örnek IP'yi PC'nin aktif Wi-Fi/Ethernet IPv4 adresiyle değiştirin):

```powershell
winget install FiloSottile.mkcert
mkcert -install
New-Item -ItemType Directory -Force .local
mkcert -cert-file .local/kytew-cert.pem -key-file .local/kytew-key.pem localhost 127.0.0.1 192.168.1.50
```

`mkcert -install`, geliştirme makinesine yerel sertifika otoritesi ekler. Yalnızca güvendiğiniz kendi geliştirme otoritenizi kurun. Tablete `mkcert -CAROOT` dizinindeki **yalnızca `rootCA.pem`** sertifikasını güvenli yolla aktarın ve tabletin sertifika ayarlarında kök CA olarak güvenilir yapın. **`rootCA-key.pem`, sunucu özel anahtarı, `.env` ve LiveKit sırları paylaşılmaz.** iPad/iPhone'da profil kurulumundan sonra Sertifika Güven Ayarları'nda tam güven ayrıca gerekebilir; Android'de CA sertifikası kurulum yolu sürüme göre değişir.

Mevcut `.env` içindeki diğer değerleri koruyarak:

```dotenv
WEB_ORIGIN=https://localhost:5173
KYTEW_APP_URL=https://localhost:5173
KYTEW_TLS_CERT=.local/kytew-cert.pem
KYTEW_TLS_KEY=.local/kytew-key.pem
LIVEKIT_NODE_IP=192.168.1.50
```

Ardından:

```sh
npm run voice:setup
docker compose --profile voice up -d --wait
npm run dev
```

PC'de `https://localhost:5173`, tablette `https://192.168.1.50:5173` açın. Değiştirilen LiveKit yapılandırmasının yeni IP'yi aldığından emin olmak için çalışan LiveKit servisini `docker compose restart livekit` ile yeniden başlatın. İlk kurulumda bu yeniden başlatma gerekmez. Ağ IP'si değişirse sertifikayı yeni IP için tekrar üretin, `LIVEKIT_NODE_IP` değerini güncelleyin ve servisleri yeniden başlatın. Geliştirme kaynak politikası bu PC'nin kendi özel IPv4 adreslerini aynı HTTPS protokol/portunda otomatik tanır.

Windows Güvenlik Duvarı'nın özel ağ profilinde TCP 5173 (uygulama), UDP 7882 (ses), TCP 7881 (medya yedeği) erişimine izin gerekir. Güvenlik duvarını kapatmayın. 7880 yönetim/sinyal portu yalnızca loopback'e bağlıdır; tarayıcı `/livekit` proxy'sini kullanır. Docker Desktop'ın çalıştığından ve tabletin misafir ağ/istemci yalıtımında olmadığından emin olun. PC IP'sini `ipconfig` ile kontrol edin; Docker/VPN adaptörünün IP'sini kullanmayın.

## Sık karşılaşılan durumlar

- **“Ses hizmeti henüz yapılandırılmadı”**: `npm run voice:setup`, Compose voice profili ve API'nin yeniden başlatılması gerekir.
- **“Mikrofon için güvenli bağlantı gerekiyor”**: Yerel IP üzerinden HTTP kullanılıyor. Yukarıdaki HTTPS kurulumunu yapın.
- **Mikrofon izni reddedildi/cihaz yok**: Tarayıcının site izinlerini ve Windows Gizlilik → Mikrofon ayarlarını kontrol edin. Cihazı bağlayıp tekrar katılın.
- **Katılımcılar görünüyor, ses ulaşmıyor**: `LIVEKIT_NODE_IP` değerinin katılımcılardan erişilebilen PC adresi olduğunu, medya portlarını ve ses çıkışı/susturma durumlarını kontrol edin.
- **Ses otomatik başlamıyor**: Görüşmedeki **Sesi etkinleştir** düğmesine basın. Mobil tarayıcılar kullanıcı etkileşimi isteyebilir.
- **Cihaz seçilemiyor**: Destekleyen tarayıcılarda hoparlör seçimi sunulur. Diğerlerinde işletim sistemi çıkış cihazını kullanın.
- **Görüşme kesildi**: LiveKit sinyal/medya yeniden bağlantısını otomatik dener. Backend oturumu veya üyelik geçersizse yeniden bağlanmaya izin verilmez.

## Yetki ve oturum güvenliği

Token yalnızca ses kanalının sunucu üyelerine verilir. Kullanıcı kimliği backend oturumundan alınır; istemci başka kimlik veya oda seçemez. Grant yalnızca mikrofon yayını ve ses aboneliğine izin verir; kamera, ekran, veri yayını, metadata değiştirme ve yönetim yetkisi verilmez.

İstemci 15 saniyede ses oturumunu yeniler; Redis lease 60 saniyedir. Backend her 10 saniyede hem lease listesini hem SFU'daki gerçek katılımcıları veritabanı oturumu ve üyelikle karşılaştırır. Çıkış, şifre değişimi, üyeliğin kaldırılması veya süresi dolmuş lease görüşmeyi sunucu tarafından sonlandırır. Eski token tekrar kullanılsa bile geçerli lease/üyelik olmadan sonraki denetimde çıkarılır. Tek hesap için tek aktif ses kanalı kullanılır; eski sekmenin bırakma/yenileme isteği yeni lease'i geçersiz kılamaz.

Medya WebRTC'nin DTLS-SRTP taşıma şifrelemesini kullanır; **uçtan uca şifreleme iddiası yoktur**, SFU medyayı işler. Ses kaydı özelliği eklenmedi.

## Doğrulama kapsamı

İki bağımsız Chromium oturumuna bilinen bir WAV sesi mikrofon girdisi olarak verilir. Gerçek Docker LiveKit ve WebRTC üzerinden her iki tarafta `bytesReceived`, çözülen örnekler ve `totalAudioEnergy > 0` doğrulanır. Sinyal bağlantısı kesilip yeni bağlantı kurulması, ses akışının sürmesi, mikrofon susturma, ses çıkışı, metin kanalında görüşmenin korunması ve istemci heartbeat kontrolünü atlasa dahi backend'in üyelik/oturum iptali test edilir. Testler gerçek ses aktarımını doğrular; bu bulut ortamında fiziksel Windows mikrofonu veya tablet donanımı denenmedi.

## İnternetten kullanım

Yerel Compose ayarı LAN içindir. İnternet dağıtımında katılımcıların ulaşabildiği bir SFU, doğru dış IP/NAT, TLS/WSS ve gerektiğinde TURN gerekir. `infra/nginx.conf` aynı HTTPS alan adında `/livekit/` sinyal proxy'sini içerir; bu HTTP proxy tek başına UDP medyayı taşımaz. LiveKit Cloud kullanılıyorsa dış WSS adresini `LIVEKIT_URL`, sunucu yönetim adresini `LIVEKIT_INTERNAL_URL` ve gerçek anahtarları güvenli sunucu ayarlarına girin; yerel `voice:setup` yerine bu bağlamayı kullanın. Üretimde anahtar rotasyonu, kapasite/erişim yönetimi ve fiziksel cihaz/NAT testleri ayrıca yapılmalıdır.
