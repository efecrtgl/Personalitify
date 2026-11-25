# Personalitify Desktop

This directory is reserved for the native desktop client, which will be written in **Rust**.
No desktop code exists yet, by design: the backend was built first as a platform-independent
service, and the desktop client will be an independent implementation of its documented
contracts.

Everything the client needs is implemented, tested and documented:

| Need                                          | Where                                                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| The integration guide — start here            | [`docs/architecture/rust-client-compatibility.md`](../../docs/architecture/rust-client-compatibility.md) |
| Every endpoint (OpenAPI 3.0)                  | [`docs/api/openapi.json`](../../docs/api/openapi.json)                                                   |
| Every entity's shape (JSON Schema)            | [`docs/api/schemas/`](../../docs/api/schemas/index.json)                                                 |
| Sign-in, tokens, conventions                  | [`docs/api/overview.md`](../../docs/api/overview.md)                                                     |
| Offline copy: snapshot, pull, push, conflicts | [`docs/architecture/synchronization.md`](../../docs/architecture/synchronization.md)                     |
| Live updates                                  | [`docs/architecture/event-system.md`](../../docs/architecture/event-system.md)                           |
| Update check and remote configuration         | [`docs/architecture/updates-and-configuration.md`](../../docs/architecture/updates-and-configuration.md) |
| A readable reference implementation           | [`packages/api-client`](../../packages/api-client)                                                       |

---

Bu dizin, **Rust** ile yazılacak yerel masaüstü istemcisi için ayrılmıştır. Henüz masaüstü
kodu yoktur: önce backend, platformdan bağımsız bir servis olarak geliştirildi. Masaüstü
istemcisi, belgelenmiş sözleşmelerin bağımsız bir uygulaması olacaktır.

İstemcinin ihtiyaç duyduğu her şey uygulanmış, test edilmiş ve belgelenmiştir. Başlangıç
noktası: [`docs/architecture/rust-client-compatibility.md`](../../docs/architecture/rust-client-compatibility.md).
Uç noktalar [`docs/api/openapi.json`](../../docs/api/openapi.json) dosyasında, veri
biçimleri [`docs/api/schemas/`](../../docs/api/schemas/index.json) dizininde, okunabilir bir
başvuru uygulaması ise [`packages/api-client`](../../packages/api-client) paketindedir.
