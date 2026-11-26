# Security Summary

**Reviewed Files:** 13 files (`index.html`, `style.css`, `core.js`, `presets.js`, `orcamento.js`, `operacional.js`, `aulas.js`, `hoje.js`, `app.js`, `snake.js`, `src/recharts-bridge.js`, `vite.config.js`, `package.json`).

## Issues Resolved

| Category | What Was Found | What Changed | Location | Status |
| :--- | :--- | :--- | :--- | :--- |
| Unsafe Links (`href`) | Dynamic links in quotes, supplier presets, and spreadsheet exports allowed non-HTTP(S) schemes such as `javascript:` or `data:`, which could run scripts when clicked. | Added `safeHttpUrl()` and `sanitizeOptionalLink()` to enforce `http:`/`https:` schemes and reject control characters, protocol-relative URLs, and scriptable schemes across forms, presets, renders, URL shortener calls, and Excel hyperlinks. | `core.js`, `orcamento.js`, `presets.js`, `operacional.js`, `app.js` | Fixed & Verified |
| Unescaped Dynamic Text in HTML | Certain state fields (`i.status`, `a.destaque`, record IDs, dates) were inserted directly into HTML templates without escaping, and `esc()` did not encode single quotes (`'`). | Updated `esc()` to escape single quotes (`&#39;`), escaped `i.status`, `a.destaque`, `br()`, and item/row IDs across views, and restricted `a.destaque` to `'nova'`, `'alterada'`, or `null`. | `core.js`, `app.js`, `aulas.js`, `orcamento.js`, `operacional.js`, `hoje.js` | Fixed & Verified |
| Prototype Pollution & State Hardening | Imported JSON backups, synced cloud state, and keyed profile/document maps did not strip `__proto__`, `constructor`, or `prototype` keys or reject array payloads. | Added `safePlainObj()` in `normalizarEstado()`, rejected array backups in `processarRestauracao()`, and blocked reserved object keys in `salvarProfPerfil()` and document/profile handlers. | `core.js`, `operacional.js`, `app.js` | Fixed & Verified |
| External Link Tab Isolation | The WhatsApp share link opened in a new tab without `rel="noopener noreferrer"`. | Added `rel="noopener noreferrer"` and escaped the link attribute. | `aulas.js` | Fixed & Verified |
| Outdated Build Dependencies | `bun audit` reported 9 advisories in `vite@5.4.21` and `esbuild@0.21.5`. | Upgraded `vite` devDependency to latest (`8.x`); `bun audit` now reports 0 vulnerabilities across 84 packages. | `package.json`, `bun.lock` | Fixed & Verified |
| Production Asset Packaging | `presets.js` and `style.css` were omitted from the Vite production copy plugin, which would break unbundled script/style loading in `dist/`. | Added `style.css` and `presets.js` to the `copy-scripts` plugin in `vite.config.js` and verified `dist/` output. | `vite.config.js` | Fixed & Verified |

## Safeguards Verified

| Area | Check Result | Notes |
| :--- | :--- | :--- |
| HTML & Attribute Escaping | Passed | Search results, quote tables, lesson lists, repair rows, presets, and quick notes escape user-provided strings and single quotes. |
| URL & Export Validation | Passed | Only valid `http://` and `https://` URLs are rendered as links, sent to the URL shortener, or written as Excel hyperlinks. |
| JSON Backup & State Sync Ingestion | Passed | Parsed JSON is normalized through `safePlainObj()` before entering application state `S`. |
| Dependency Security (`bun audit`) | Passed | 0 vulnerabilities found across 84 checked packages after upgrading Vite. |
| Supabase Access Control | Needs Follow-Up | `core.js` uses a client-safe publishable key (`sb_publishable_...`), not a service secret, which is expected for browser apps. However, the client reads and writes a shared `painel_estado` row without user authentication. If deployed outside a private network, enable Supabase Authentication and Row Level Security (RLS) policies on `painel_estado` so only authorized operators can read or update data. |

---

## PoC Verification

### 1. Scriptable URLs in Quote Links and Supplier Presets
- **Entry Point:** Submitting a quote item (`form[data-form="orcitem"]`), editing the single-supplier link (`[data-orc="link"]`), adding a supplier preset (`form#formAddPreset`), or loading a JSON backup / Supabase sync payload containing `link: "javascript:alert(1)"` or `"data:text/html,<script>alert(1)</script>"`.
- **Previous Behavior:** `orcamento.js` and `presets.js` placed the string into `<a href="...">` (or prepended `https://` blindly), allowing script execution when clicked.
- **Safeguard Verification:**
  - `safeHttpUrl("javascript:alert(1)")`, `safeHttpUrl("  JaVaScRiPt:alert(1)")`, `safeHttpUrl("data:text/html,<script>alert(1)</script>")`, `safeHttpUrl("vbscript:msgbox(1)")`, and `safeHttpUrl("//evil.com/phish")` all return `""`.
  - `adicionarPreset("orcamentos", "fornecedores", "EvilShop", "javascript:alert(1)")` rejects the entry and returns `false`, while valid domains such as `"kalunga.com.br"` normalize to `"https://kalunga.com.br/"`.
  - Rendering `viewOrc()` in both `comparativo_fornecedores` and `pedido_fornecedor` modes with in-memory `javascript:` / `data:` link payloads produces zero `href="javascript:` or `href="data:` attributes.

### 2. Unescaped Fields in Global Search and Lesson Badges
- **Entry Point:** Tampered JSON backup (`processarRestauracao`) or synced `painel_estado` document setting `orc.itens[0].status = "<script>alert(1)</script>"` or `aulas[0].destaque = "<img src=x onerror=alert(1)>"`.
- **Previous Behavior:** `app.js` interpolated `i.status` raw into global search HTML and `aulas.js` interpolated `a.destaque.toUpperCase()` raw into `aulaRow` and `aulaEdit`.
- **Safeguard Verification:**
  - `normalizarEstado()` resets invalid `a.destaque` values to `null`.
  - Running `views()` with `buscaGlobalTermo = "F1"` outputs `&lt;script&gt;alert(1)&lt;/script&gt;` with no raw `<script>` element.
  - `esc("' onmouseover=alert(1)")` outputs `&#39; onmouseover=alert(1)`.

### 3. Prototype Pollution via JSON Restore / Sync / Profile Keys
- **Entry Point:** Importing a backup JSON containing `{"__proto__": {"polluted": true}, "constructor": {"x": 1}, "docs": {"__proto__": {"p": 1}}}` or calling `salvarProfPerfil("__proto__", ...)`.
- **Previous Behavior:** Plain objects from `JSON.parse()` and dynamic keys were copied or indexed directly onto `S` and `S.profPerfis`.
- **Safeguard Verification:**
  - Passing the payload into `normalizarEstado()` leaves `({}).polluted === undefined`, strips own `__proto__` / `constructor` / `prototype` keys from `S` and `S.docs`, and `salvarProfPerfil("__proto__", ...)` returns `false`.
