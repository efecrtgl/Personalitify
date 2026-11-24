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

### `npm install` başarısız oluyor

`node --version` çıktısını denetleyin: Node.js 22 veya üzeri gerekir.
