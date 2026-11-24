# Personalitify Desktop

This directory is reserved for the native desktop client, which will be written in **Rust**.
No desktop code exists yet, by design: the backend is being built first as a
platform-independent service, and the desktop client will be an independent implementation
of its documented contracts.

What the desktop client will consume:

- The versioned REST API under `/api/v1` (OpenAPI document).
- Token authentication with device registration.
- The synchronization protocol: initial snapshot, incremental changes by cursor, realtime
  events, operation submission and conflict handling.
- The application update manifest API and remote configuration.

The integration guide is published as
`docs/architecture/rust-client-compatibility.md` once the contracts it describes are
implemented (see the [roadmap](../../docs/roadmap.md), Phase 15).

---

Bu dizin, **Rust** ile yazılacak yerel masaüstü istemcisi için ayrılmıştır. Henüz masaüstü
kodu yoktur: önce backend, platformdan bağımsız bir servis olarak geliştirilmektedir.
Masaüstü istemcisi, belgelenmiş sözleşmelerin bağımsız bir uygulaması olacaktır.
