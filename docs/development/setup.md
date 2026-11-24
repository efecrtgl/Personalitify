# Local Development Setup · Yerel Geliştirme Kurulumu

[English](#english) · [Türkçe](#türkçe)

---

## English

### Prerequisites

| Tool                     | Version      | Notes                                                 |
| ------------------------ | ------------ | ----------------------------------------------------- |
| Node.js                  | 22 LTS or 24 | Includes npm                                          |
| MongoDB Community Server | 7 or newer   | Must be installed **and running**                     |
| MongoDB Compass          | any          | Optional graphical client for inspecting the database |

Docker, Redis and cloud services are **not** required.

MongoDB Compass is only a viewer. The database itself is MongoDB Community Server; installing
Compass alone is not enough.

### Start

```bash
git clone https://github.com/efecrtgl/Personalitify.git
cd Personalitify
npm install
npm run dev
```

`npm run dev` does three things:

1. Creates `.env` from `.env.example` on the first run and generates a random
   `JWT_ACCESS_SECRET` for your machine. An existing `.env` is never touched.
2. Starts the API on `http://127.0.0.1:4000/api/v1`.
3. Starts the web client on `http://localhost:5173`. Requests to `/api` and `/socket.io` are
   proxied to the API, so the browser uses a single origin.

Check that everything is up: open `http://localhost:5173`, or call
`http://127.0.0.1:4000/api/v1/health/ready`.

### MongoDB

The default connection string is `mongodb://127.0.0.1:27017/personalitify`. The database and
its collections are created automatically on first use.

To look at the data, open MongoDB Compass and connect to `mongodb://127.0.0.1:27017`.

Starting the server:

- **Windows** — the installer registers a service named `MongoDB`. Check it in `services.msc`
  or run `Get-Service MongoDB` in PowerShell.
- **macOS** — `brew services start mongodb-community`
- **Linux** — `sudo systemctl start mongod`

### Scripts

| Command                | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | API and web client together, with reload |
| `npm run dev:api`      | API only                                 |
| `npm run dev:web`      | Web client only                          |
| `npm run build`        | Production build                         |
| `npm run start`        | Run the API without file watching        |
| `npm run test`         | All test suites                          |
| `npm run test:api`     | Backend tests (needs MongoDB)            |
| `npm run test:web`     | Web client tests                         |
| `npm run lint`         | ESLint                                   |
| `npm run format`       | Format with Prettier                     |
| `npm run format:check` | Verify formatting without changing files |

### Tests and the database

Backend tests run against a real MongoDB. They use databases named
`personalitify_test_<n>` on the same server, one per test worker, and drop them when they
finish. Your development database is never touched. Set `MONGODB_TEST_URI` to point the tests
at another server.

### Environment variables

All variables are described in [`.env.example`](../../.env.example) and validated at startup.
An invalid configuration stops the API with a list of the offending variables.

Problems? See [troubleshooting.md](./troubleshooting.md).

---

## Türkçe

### Gereksinimler

| Araç                     | Sürüm          | Not                                                    |
| ------------------------ | -------------- | ------------------------------------------------------ |
| Node.js                  | 22 LTS veya 24 | npm ile birlikte gelir                                 |
| MongoDB Community Server | 7 veya üzeri   | Kurulu **ve çalışıyor** olmalıdır                      |
| MongoDB Compass          | herhangi       | Veritabanını incelemek için isteğe bağlı grafik arayüz |

Docker, Redis veya bulut servisleri **gerekmez**.

MongoDB Compass yalnızca bir görüntüleyicidir. Veritabanının kendisi MongoDB Community
Server'dır; yalnızca Compass kurmak yeterli değildir.

### Başlatma

```bash
git clone https://github.com/efecrtgl/Personalitify.git
cd Personalitify
npm install
npm run dev
```

`npm run dev` üç iş yapar:

1. İlk çalıştırmada `.env.example` dosyasından `.env` oluşturur ve makinenize özel rastgele
   bir `JWT_ACCESS_SECRET` üretir. Var olan `.env` dosyasına dokunulmaz.
2. API'yi `http://127.0.0.1:4000/api/v1` adresinde başlatır.
3. Web istemcisini `http://localhost:5173` adresinde başlatır. `/api` ve `/socket.io`
   istekleri API'ye yönlendirilir; tarayıcı tek bir kaynak (origin) kullanır.

Her şeyin çalıştığını doğrulamak için `http://localhost:5173` adresini açın veya
`http://127.0.0.1:4000/api/v1/health/ready` adresini çağırın.

### MongoDB

Varsayılan bağlantı adresi `mongodb://127.0.0.1:27017/personalitify` şeklindedir. Veritabanı
ve koleksiyonlar ilk kullanımda otomatik oluşturulur.

Verileri görmek için MongoDB Compass'ı açıp `mongodb://127.0.0.1:27017` adresine bağlanın.

Sunucuyu başlatma:

- **Windows** — kurulum `MongoDB` adlı bir servis oluşturur. `services.msc` üzerinden veya
  PowerShell'de `Get-Service MongoDB` komutuyla denetleyin.
- **macOS** — `brew services start mongodb-community`
- **Linux** — `sudo systemctl start mongod`

### Komutlar

| Komut                  | Amaç                                                |
| ---------------------- | --------------------------------------------------- |
| `npm run dev`          | API ve web istemcisi birlikte, otomatik yenilemeyle |
| `npm run dev:api`      | Yalnızca API                                        |
| `npm run dev:web`      | Yalnızca web istemcisi                              |
| `npm run build`        | Üretim derlemesi                                    |
| `npm run start`        | API'yi dosya izleme olmadan çalıştırır              |
| `npm run test`         | Tüm testler                                         |
| `npm run test:api`     | Backend testleri (MongoDB gerekir)                  |
| `npm run test:web`     | Web istemcisi testleri                              |
| `npm run lint`         | ESLint                                              |
| `npm run format`       | Prettier ile biçimlendirme                          |
| `npm run format:check` | Dosyaları değiştirmeden biçim denetimi              |

### Testler ve veritabanı

Backend testleri gerçek bir MongoDB üzerinde çalışır. Aynı sunucuda, her test işçisi için
`personalitify_test_<n>` adlı veritabanları kullanılır ve testler bitince silinir. Geliştirme
veritabanınıza dokunulmaz. Testleri başka bir sunucuya yönlendirmek için `MONGODB_TEST_URI`
değişkenini ayarlayın.

### Ortam değişkenleri

Tüm değişkenler [`.env.example`](../../.env.example) dosyasında açıklanmıştır ve başlangıçta
doğrulanır. Geçersiz bir yapılandırmada API, hatalı değişkenleri listeleyerek durur.

Sorun mu yaşıyorsunuz? [troubleshooting.md](./troubleshooting.md) belgesine bakın.
