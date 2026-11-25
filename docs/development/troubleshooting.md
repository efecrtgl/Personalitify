# Troubleshooting · Sorun Giderme

[English](#english) · [Türkçe](#türkçe)

---

## English

### "Could not connect to MongoDB"

The API refuses to start without a database. It never falls back to a fake one.

1. Is MongoDB Community Server installed? Compass alone is not a server.
2. Is the service running?
   - Windows: `Get-Service MongoDB` → `Start-Service MongoDB` (administrator PowerShell)
   - macOS: `brew services start mongodb-community`
   - Linux: `sudo systemctl start mongod`
3. Does `MONGODB_URI` in `.env` match the server address and port (default `27017`)?

### "Invalid environment configuration"

The message lists each invalid variable. Compare `.env` with `.env.example`. Deleting `.env`
and running `npm run dev` again recreates it with fresh defaults.

### "Port 4000 is already in use" / Vite reports port 5173 in use

Another process holds the port, usually an earlier development session.

- Windows: `Get-NetTCPConnection -LocalPort 4000 | Select OwningProcess`, then
  `Stop-Process -Id <pid>`
- macOS / Linux: `lsof -i :4000`, then `kill <pid>`

The API port can be changed with `API_PORT` in `.env`; start the web client with
`VITE_API_PROXY_TARGET=http://127.0.0.1:<port>` so its proxy follows.

### The web page says the server cannot be reached

The web client is running but the API is not. Look at the `[api]` lines in the terminal where
`npm run dev` runs; the cause is printed there.

### Backend tests fail immediately

They need MongoDB. Start it, or set `MONGODB_TEST_URI` to a reachable server.

### A test run ends with "Worker exited unexpectedly with exit code 3221226505" (Windows)

That code (`0xC0000409`) is a native crash of a Node.js process, not a failing assertion.
The tests it interrupted are simply not counted.

It was observed on a development machine where a system customization tool injects a DLL
into every process, including `node.exe` (in that case `windhawk.dll`). The crash appeared
in roughly one run out of five, in a different test file each time, and never on Linux CI.

- Run the suite again; a clean run is the valid result.
- If it keeps happening, exclude `node.exe` from tools that inject code into processes
  (shell customizers, overlays, some antivirus products).

### Verification or password-reset emails do not arrive

Without `SMTP_HOST` in `.env` no email is sent. The message, with its link, is written to
the API log instead (the `[api]` lines of `npm run dev`). Fill in the `SMTP_*` variables
and `MAIL_FROM` to send real email.

### "Unsafe production configuration"

With `NODE_ENV=production` the API refuses to start with settings that are only safe on a
developer machine. The message lists each one:

- `COOKIE_SECURE` must be `true`
- every entry of `WEB_ORIGINS` must start with `https://`
- `PUBLIC_WEB_URL` must start with `https://`

To try a production build locally without HTTPS, keep `NODE_ENV=development`.

### "Too many requests" (HTTP 429)

Requests are limited per client address and minute: 300 in general, 10 for sign-in,
registration and password endpoints, 30 for `POST /sync/push`. The response carries a
`Retry-After` header; wait that long. Scripts that seed data should pause between batches.

### Behind a reverse proxy everyone shares one rate limit

The API sees the proxy's address instead of the client's. Set `TRUST_PROXY_HOPS` to the
number of proxies in front of the API (1 for a single nginx or Caddy). Do not set it higher
than the real number: a client could then choose its own address.

### The Administration section is not shown, or registration was closed by mistake

The section appears only for accounts with the `admin` role, which is granted from the
command line: `npm run admin:grant -- you@example.com`, then sign in again. Closing
registration never locks out existing accounts; an administrator can open it again in
**Settings → Administration**.

### `npm install` fails

Check `node --version`: Node.js 22 or newer is required.

---

## Türkçe

### "Could not connect to MongoDB"

API veritabanı olmadan başlamaz; hiçbir zaman sahte bir veritabanına geçmez.

1. MongoDB Community Server kurulu mu? Compass tek başına bir sunucu değildir.
2. Servis çalışıyor mu?
   - Windows: `Get-Service MongoDB` → `Start-Service MongoDB` (yönetici PowerShell)
   - macOS: `brew services start mongodb-community`
   - Linux: `sudo systemctl start mongod`
3. `.env` içindeki `MONGODB_URI`, sunucu adresi ve portuyla (varsayılan `27017`) uyuşuyor mu?

### "Invalid environment configuration"

Mesaj, geçersiz her değişkeni listeler. `.env` dosyanızı `.env.example` ile karşılaştırın.
`.env` dosyasını silip `npm run dev` komutunu yeniden çalıştırmak, dosyayı varsayılanlarla
yeniden oluşturur.

### "Port 4000 is already in use" / Vite 5173 portunun kullanımda olduğunu söylüyor

Portu başka bir süreç tutuyor; çoğunlukla önceki bir geliştirme oturumudur.

- Windows: `Get-NetTCPConnection -LocalPort 4000 | Select OwningProcess`, ardından
  `Stop-Process -Id <pid>`
- macOS / Linux: `lsof -i :4000`, ardından `kill <pid>`

API portu `.env` içindeki `API_PORT` ile değiştirilebilir; web istemcisinin yönlendirmesi
için `VITE_API_PROXY_TARGET=http://127.0.0.1:<port>` değişkeniyle başlatın.

### Web sayfası sunucuya ulaşılamadığını söylüyor

Web istemcisi çalışıyor ancak API çalışmıyor. `npm run dev` komutunun çalıştığı terminalde
`[api]` satırlarına bakın; neden orada yazar.

### Backend testleri hemen başarısız oluyor

MongoDB gerekir. Sunucuyu başlatın veya `MONGODB_TEST_URI` değişkenini erişilebilir bir
sunucuya ayarlayın.

### Test çalıştırması "Worker exited unexpectedly with exit code 3221226505" ile bitiyor (Windows)

Bu kod (`0xC0000409`), başarısız bir doğrulama değil, bir Node.js sürecinin yerel (native)
çökmesidir. Yarıda kalan testler yalnızca sayılmamış olur.

Bu durum, bir sistem özelleştirme aracının `node.exe` dâhil her sürece DLL enjekte ettiği
bir geliştirme makinesinde gözlemlendi (o örnekte `windhawk.dll`). Çökme yaklaşık beş
çalıştırmadan birinde, her seferinde farklı bir test dosyasında görüldü; Linux CI üzerinde
hiç görülmedi.

- Testleri yeniden çalıştırın; temiz geçen çalıştırma geçerli sonuçtur.
- Sürekli tekrarlanıyorsa, süreçlere kod enjekte eden araçlarda (kabuk özelleştiriciler,
  ekran katmanları, bazı antivirüs ürünleri) `node.exe` için istisna tanımlayın.

### Doğrulama veya parola sıfırlama e-postaları gelmiyor

`.env` içinde `SMTP_HOST` yoksa e-posta gönderilmez. İleti, bağlantısıyla birlikte API
günlüğüne yazılır (`npm run dev` çıktısındaki `[api]` satırları). Gerçek e-posta göndermek
için `SMTP_*` değişkenlerini ve `MAIL_FROM` değerini doldurun.

### "Unsafe production configuration"

`NODE_ENV=production` iken API, yalnızca geliştirici makinesinde güvenli olan ayarlarla
başlamayı reddeder. Mesaj her birini listeler:

- `COOKIE_SECURE` değeri `true` olmalıdır
- `WEB_ORIGINS` içindeki her adres `https://` ile başlamalıdır
- `PUBLIC_WEB_URL` `https://` ile başlamalıdır

Üretim derlemesini HTTPS olmadan yerelde denemek için `NODE_ENV=development` bırakın.

### "Too many requests" (HTTP 429)

İstekler istemci adresi başına dakikalık olarak sınırlanır: genel olarak 300; giriş, kayıt
ve parola uç noktaları için 10; `POST /sync/push` için 30. Yanıtta `Retry-After` başlığı
bulunur; o kadar bekleyin. Veri yükleyen betikler gruplar arasında beklemelidir.

### Ters vekil (reverse proxy) arkasında herkes aynı istek sınırını paylaşıyor

API, istemcinin değil vekilin adresini görüyor. `TRUST_PROXY_HOPS` değerini API'nin
önündeki vekil sayısına ayarlayın (tek bir nginx veya Caddy için 1). Gerçek sayıdan büyük
bir değer vermeyin: o durumda istemci kendi adresini seçebilir.

### Yönetim bölümü görünmüyor veya kayıt yanlışlıkla kapatıldı

Bölüm yalnızca `admin` rolündeki hesaplara gösterilir; rol komut satırından verilir:
`npm run admin:grant -- siz@example.com`, ardından yeniden giriş yapın. Kaydı kapatmak var
olan hesapları hiçbir zaman dışarıda bırakmaz; bir yönetici **Ayarlar → Yönetim** bölümünden
yeniden açabilir.

### `npm install` başarısız oluyor

`node --version` çıktısını denetleyin: Node.js 22 veya üzeri gerekir.
