# Contributing to Personalitify · Personalitify'a Katkı

[English](#english) · [Türkçe](#türkçe)

---

## English

Thank you for considering a contribution.

### Ground rules

- **JavaScript only.** No TypeScript, no `.ts` / `.tsx` files.
- **Business rules live in the backend.** React components render state and submit intents.
- **The API is a public contract.** Never shape an endpoint around a web-only need; a Rust
  client must be able to use it equally well.
- **No hardcoded user-facing text.** Add keys to `packages/localization` in both Turkish and
  English.
- **Every user-owned query is scoped by `userId`.**
- **No secrets in Git.** Configuration comes from environment variables; `.env.example`
  documents them.

### Workflow

1. Create a branch from `main`.
2. Make a focused change, with tests.
3. Run `npm run lint` and `npm run test` (the backend suite needs a running local MongoDB).
4. Open a pull request describing what changed and why.

### Commit messages

[Conventional Commits](https://www.conventionalcommits.org/):

```
feat(habits): add custom recurring schedules
fix(sync): stop the reader at an in-flight sequence gap
docs(architecture): document conflict resolution
test(api): cover refresh token reuse detection
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`.
A commit represents one real change. No empty or artificial commits.

### Code conventions

- ES modules, named exports, one responsibility per file.
- Module layout in the API: `*.model.js`, `*.schemas.js`, `*.service.js`, `*.routes.js`.
- Errors are thrown as `AppError` with a stable code; never swallow an error silently.
- Dates: instants in UTC ISO 8601, calendar days as `YYYY-MM-DD` in the user's time zone.
- Formatting is enforced by Prettier, linting by ESLint.

### Architecture

Start with [docs/architecture/overview.md](docs/architecture/overview.md) and
[docs/architecture/decisions.md](docs/architecture/decisions.md).

---

## Türkçe

Katkıda bulunmayı düşündüğünüz için teşekkürler.

### Temel kurallar

- **Yalnızca JavaScript.** TypeScript ve `.ts` / `.tsx` dosyaları kullanılmaz.
- **İş kuralları backend'de yaşar.** React bileşenleri durumu gösterir ve istekleri iletir.
- **API herkese açık bir sözleşmedir.** Bir uç noktayı yalnızca web istemcisine göre
  şekillendirmeyin; Rust istemcisi de aynı rahatlıkla kullanabilmelidir.
- **Arayüz metinleri koda gömülmez.** Anahtarları `packages/localization` içine hem Türkçe
  hem İngilizce olarak ekleyin.
- **Kullanıcıya ait her sorgu `userId` ile sınırlandırılır.**
- **Git'e gizli bilgi girmez.** Yapılandırma ortam değişkenlerinden gelir; `.env.example`
  bunları belgeler.

### İş akışı

1. `main` dalından yeni bir dal oluşturun.
2. Testleriyle birlikte odaklı bir değişiklik yapın.
3. `npm run lint` ve `npm run test` komutlarını çalıştırın (backend testleri için yerel
   MongoDB çalışıyor olmalıdır).
4. Neyin neden değiştiğini anlatan bir pull request açın.

### Commit mesajları

[Conventional Commits](https://www.conventionalcommits.org/) biçimi kullanılır:

```
feat(habits): add custom recurring schedules
fix(sync): stop the reader at an in-flight sequence gap
```

Türler: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`.
Her commit gerçek bir değişikliği temsil eder. Boş veya yapay commit oluşturulmaz.

### Kod kuralları

- ES modülleri, isimli export'lar, dosya başına tek sorumluluk.
- API modül düzeni: `*.model.js`, `*.schemas.js`, `*.service.js`, `*.routes.js`.
- Hatalar kararlı bir kodla `AppError` olarak fırlatılır; hiçbir hata sessizce yutulmaz.
- Tarihler: anlar UTC ISO 8601, takvim günleri kullanıcının saat diliminde `YYYY-MM-DD`.
- Biçimlendirme Prettier, statik denetim ESLint ile sağlanır.

### Mimari

[docs/architecture/overview.md](docs/architecture/overview.md) ve
[docs/architecture/decisions.md](docs/architecture/decisions.md) belgeleriyle başlayın.
