# FindMyStuff — Web app (PWA)

An installable Progressive Web App for FindMyStuff, built with React + TypeScript + Vite.
One codebase runs on desktop and phone; on iOS and Android it installs to the home screen
from the browser, so there is no separate native app to build or ship.

```bash
nvm use            # Node 22 (see .nvmrc)
npm install
npm run dev        # http://localhost:5173, /api is proxied to the backend
```

Out of the box `npm run dev` proxies to the **deployed** backend at
`https://findmystuff-api-b3so.onrender.com`, so nothing needs to run locally. Sign in with a
seeded account (`owner@findmystuff.test` / `Password123`); the login screen lists them in dev.
To use a local backend instead, set `API_PROXY_TARGET=http://localhost:3000` in `.env`.

> **Cold starts are handled automatically.** The deployed API is on Render's free tier: it
> spins down when idle and answers `502` for 30–60s while waking. Rather than showing an
> error, the HTTP client retries through it and the UI says so — see below.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with HMR; proxies `/api` → `API_PROXY_TARGET` |
| `npm run build` | Typecheck, then a production build into `dist/` |
| `npm run preview` | Serve the built app (the only way to exercise the service worker) |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run api:types` | Regenerate `src/api/schema.d.ts` from `openapi/api.json` |

## Configuration

Copy `.env.example` to `.env`:

- `VITE_API_BASE_URL` — leave empty in dev (requests go to `/api`, Vite proxies them).
  In production set it to the API origin, e.g. `https://api.findmystuff.app/api`.
- `API_PROXY_TARGET` — dev only; where the proxy forwards `/api`. Defaults to `http://localhost:3000`.

To refresh the API contract, copy the backend's `openapi/openapi.json` over `openapi/api.json`
and run `npm run api:types`.

## Waking a sleeping backend

The API sleeps when idle, so the first request after a quiet spell fails for up to a minute.
That is a wait, not an error, so the client treats it as one ([client.ts](src/api/client.ts)):

- Transient failures — a fetch that never got a response, or a `502/503/504` whose body is not
  JSON — are retried with backoff (`1, 2, 4, 8, 12, 16, 20s`, ~63s total), with a 30s cap on
  any single attempt.
- While retrying, a banner appears: **"Waking the server… Retrying (3 of 8) · 12s"**. The
  screen behind it stays usable and the submit button stays disabled, so nothing is
  double-submitted. It only appears after 2s, so a momentary blip shows nothing.
- If it still fails, the normal error path takes over: a readable sentence, and on startup the
  **Try again** screen that keeps you signed in rather than logging you out.

**Retries are not blindly applied to writes.** Replaying a `POST` that already succeeded would
create a duplicate item. So reads are always replayed, but a write is only replayed when we
know it never reached the API — either no response arrived at all, or the error body was not
JSON (our API always answers with JSON, so an HTML body means a proxy produced it). A genuine
5xx *from the API* is never replayed.

React Query's own retry is therefore turned off: the client has already retried, so an error
reaching a component is final. Leaving both on would multiply into a request storm against a
server that is merely asleep.

## Which URL does the app actually call?

In dev the browser calls `/api/...` on the dev origin and **Vite proxies it server-side** to
the API. So the network tab shows `http://localhost:5173/api/places/...` even though the data
comes from the deployed backend — it is a proxy hop, not a different server. You can prove it:

```bash
curl -i http://localhost:5173/api/health | grep -i x-render
# x-render-routing: ...   ← Render's own header, coming back through the proxy
```

This is the default because it keeps the browser same-origin: no CORS dependency, no preflight
round-trip, and it still works if Vite falls back to port 5174 when 5173 is taken.

**To call the API directly instead** (network tab then shows the real URL), set in `.env`:

```
VITE_API_BASE_URL=https://findmystuff-api-b3so.onrender.com/api
```

and restart the dev server. This requires the API's `CORS_ORIGINS` to list your dev origin
*exactly* — as of now the deployed API allows only `http://localhost:5173`, so a fallback to
`:5174` would be rejected by the browser.

## Deploying this frontend

`npm run build` bakes `VITE_API_BASE_URL` from `.env.production` into the bundle — there is no
proxy once built, so the origin must be compiled in. It currently points at the Render API.

**Before the deployed frontend will work, add its origin to the API's `CORS_ORIGINS`.** The
deployed API currently allows only `http://localhost:5173`; every other origin gets no
`Access-Control-Allow-Origin` header and the browser blocks the request:

```
CORS_ORIGINS=http://localhost:5173,https://your-frontend-domain
```

## How it is put together

```
src/
  api/          the contract: client, endpoints, types, query keys
  auth/         session state, route guards, the terms gate
  hooks/        React Query hooks, one per resource
  components/   reusable UI — ui/ holds the primitives
  routes/       one file per screen
  layout/       app shell: sidebar on desktop, tab bar on phones
  lib/          image resizing, date/format helpers, role gates
```

**`src/api/types.ts` is hand-written on purpose.** `schema.d.ts` is generated from the spec
and is authoritative for shape, but the backend's Swagger decorators declare nullable fields
without a type, so the generator renders them as `Record<string, never> | null` — unusable for
a `description` that is really `string | null`. The hand-written types restate the same
contract with real value types; regenerate the schema whenever the API changes and reconcile
the two.

## The five things that were easy to get wrong

Everything below is implemented deliberately — read this before changing the API layer.

**1. Refresh is serialised.** Refresh tokens rotate: every call invalidates the one you sent,
and replaying a spent token is treated as theft and revokes *every* session on *every* device.
If several requests 401 at once and each fires its own refresh, all but one replay a spent
token and the user is signed out everywhere. So every caller queues behind a single in-flight
promise ([client.ts](src/api/client.ts)):

```ts
refreshing ??= doRefresh().finally(() => { refreshing = null; });
```

**2. A failed `/auth/me` does not mean "signed out".** Only a genuine `401` clears the
session. Offline, `429` or a `5xx` leaves the tokens alone and shows a retry screen — signing
someone out over a blip would throw away their refresh token for nothing
([AuthContext.tsx](src/auth/AuthContext.tsx)).

**3. Terms acceptance is handled globally.** When the backend bumps `TERMS_VERSION`, every
authenticated route starts returning `403 TERMS_ACCEPTANCE_REQUIRED`. The HTTP layer detects
that on *any* request and raises an app-wide event; `RequireAuth` then blocks the whole shell
with the terms screen rather than each screen handling it. `/auth/me` and `/auth/accept-terms`
keep working throughout, so the dialog can still load the user.

**4. Writes never round-trip a GET.** The API runs `forbidNonWhitelisted`, so any field that
is not on the write DTO is a `400` — and GET responses carry `id`, `createdAt`, `breadcrumb`
and more. Every form seeds itself field by field from only what the DTO accepts, and the
DTO types in [endpoints.ts](src/api/endpoints.ts) are narrow so the compiler catches it.

**5. `404` never means "no permission".** The API returns `404` both for things that do not
exist and for things that belong to someone else — deliberately, so it never confirms other
people's data. No copy anywhere says "you don't have access"; see
[NotFoundScreen.tsx](src/routes/NotFoundScreen.tsx).

## Other decisions worth knowing

- **Breadcrumbs are rendered, never built.** Every response carries a ready-made
  `breadcrumb` ("Bedroom › Almirah › Top shelf"); search results include the place name too.
  `<Breadcrumb>` only splits it for styling — the last segment is where the thing actually is.
- **Images are resized before encoding.** The API caps media at 8 MB decoded and base64 adds
  ~33%, so a raw camera photo fails. `prepareImage()` scales to 1600px on the long edge and
  steps JPEG quality down until it fits.
- **Media needs the auth header**, so a bare `<img src>` gets a 401. `<AuthImage>` fetches the
  bytes and hands the tag an object URL, cached per media id so one avatar in ten rows is one
  request.
- **Search is debounced at 250ms with a 2-character minimum**, and results are rendered in the
  order the server returned them — they are already sorted by relevance.
- **The UI is gated on `myRole`**, purely so it does not offer buttons that are guaranteed to
  fail; the server enforces roles regardless.
- **`itemCount` differs between members** because private items are excluded per viewer. That
  is correct, not a bug.

## PWA behaviour

- Installable, with maskable icons and shortcuts to Search and Scan.
- The service worker precaches the app shell only. **API responses are never cached** — the
  data is authenticated and privacy-sensitive; freshness is React Query's job. An offline
  banner appears instead of stale data.
- Updates use `registerType: 'prompt'`: a banner offers a reload rather than swapping the app
  out from under someone mid-edit.
- The service worker is only active in a production build — use `npm run preview` to test it.

## Security notes

The access token is held in memory (mirrored into `sessionStorage` so a tab reload does not
drop it). The refresh token is in `localStorage`, which is a deliberate, documented tradeoff:
a static SPA on a different origin from the API has no way to use an `httpOnly` cookie. The
mitigations that matter are server-side and already in place — refresh tokens rotate on every
use and any replay revokes the whole session. If the API is ever served from the same origin,
move the refresh token to an `httpOnly` cookie and delete `getRefreshToken()`.

`npm audit` is clean. Vite 8, react-router 7 and vite-plugin-pwa 1 were adopted over the older
majors specifically because the earlier lines carry advisories.
