# 0011 · A bearer token beside the cookie

**Status:** decided and built in the same change (the phone app's PR 8). The code was read at commit `8c09bdb`
(PR #1136, 26 September 2026); where this note and the code disagree, the code wins. The PRD's row for PR 8: "the
first surface that is not a WebView: the Inbox thread. With it, the API takes a bearer token beside the cookie: a
decision note in `docs/decisions/` before a line of code, because it is a new door."

## Context

### Every /api/v1 route is the cookie's

`apps/dashboard/src/server/with-route.ts` is the one wrapper every route goes through (auth-gate.test.mjs, test 2,
holds every `route.ts` under `app/api/v1` to it). It refuses a cross-site write before anything else (`isSameOrigin`,
`request-guards.ts:34`), builds the session client from the request's cookies (`lib/supabase/server.ts:11`),
verifies the token's signature with `getClaims()` (with-route.ts:117; never `getSession()`, auth-gate.test.mjs test 4)
and runs the handler on that client, so RLS is the enforcement. `proxy.ts:161` verifies the same cookie first and
answers a machine-readable 401 to an `/api/` path without one (proxy.ts:196).

### The phone app has the cookie only inside the WebView

The shell (PR 1) is five WebViews of the live site; the cookie lives in each WebView's own store
(`sharedCookiesEnabled`, Surface.tsx). The page registers the phone and forgets it through its own client, on the
shell's ask (`legacy-bridge/app-bridge.ts`, PR 2), precisely so the cookie, the same-origin rule and the rate bucket
stay the page's. A native screen has none of that: `fetch` from React Native carries no WebView cookie on iOS, and a
form on another site cannot make a phone's `fetch`.

### What the session already is

The cookie's value is a Supabase session: an access token (a JWT, an hour at most) and a refresh token. `getClaims`
takes a token as its argument (`@supabase/auth-js`, `getClaims(jwt?)`), and `createServerClient` takes global headers,
so a client can run under RLS as a token that arrived in a header instead of a cookie.

## Decision

1. **A route accepts `Authorization: Bearer <access token>` beside the cookie, and reads no cookie when it does.**
   `server/bearer.ts` parses the header (`bearerOf`: a JWT's shape or nothing), `lib/supabase/server.ts`
   `createBearerClient(token)` builds a client with no cookie store and the token as its Authorization, and
   `with-route.ts` verifies the token with `getClaims(token)` on it, exactly as it verifies the cookie's. The handler
   runs on that client: RLS is the enforcement either way.
2. **The same-origin rule stays the cookie's.** It exists because a cookie is an ambient credential a foreign page can
   ride on. A bearer request carries no cookie and reads none, so `isSameOrigin` is not asked of it. A request that
   carries both is a bearer request: the cookie is never read, so nothing ambient is spent.
3. **The proxy lets a bearer `/api/v1` request through to the wrapper.** `proxy.ts` reads the cookie only; with a
   bearer and no cookie it answered 401 before the route could look. It now passes an `/api/v1/` path whose
   Authorization header starts with `Bearer` to the route, which is the verifier. Only that prefix, only with the
   header: a page request never passes on a header, and auth-gate.test.mjs asserts the bypass's shape.
4. **The page is the token authority; the shell holds the access token in memory only.** The shell asks the page
   `{t:"token"}`; the page answers `{t:"token", access, expires}` from its own client's session (`getSession()`, whose
   value is what the cookie already holds, on the page's own origin). Never the refresh token: the page refreshes,
   and the shell asks again when its token is within a minute of expiry or a route answers 401. A cold start with no
   page mounted has no token and mounts one (the tab's WebView) before its first native call; the Inbox thread opens
   from the Inbox page, so that page is always there. Nothing is written to SecureStore: a stolen phone's app is
   behind the lock (PR 3), and a token that lives an hour is not worth a second store.
5. **No new route, no new role, no new rate bucket.** A bearer request is the same person with the same membership,
   judged by the same `route()` policy, rate-limited by the same buckets. `route-policy.json` does not change.

## Shape

- `apps/dashboard/src/server/bearer.ts`: `bearerOf(req)`, `verifyBearer(token)`, `setBearerVerifier` (tests).
- `apps/dashboard/src/lib/supabase/server.ts`: `createBearerClient(token)`.
- `apps/dashboard/src/server/with-route.ts`: the bearer path beside the cookie's; `proxy.ts`: the pass-through.
- `packages/contracts/src/app-bridge.ts`: the shell's `{t:"token"}` ask and the page's `{t:"token", access, expires}`.
- `apps/dashboard/src/legacy-bridge/app-bridge.ts`: the `token` door on the page's own client.
- `apps/mobile/src/shell/api.ts`: `api(key, …)` with the bearer, the token asked of the page in front, one retry on 401.
- `packages/contracts/src/native-thread.ts`: what the native thread says, over `toConversationVM`.

## Steps

One change, either deploy order: the site accepts a bearer before any app sends one, and an app built before the site
deploys sends none (it opens the thread in its page as before) until the build that carries the native screen.

## Tests

`bearer.test.mjs`: the header parsed and refused; the wrapper executed with a stand-in verifier: a bearer request with
no cookie answers 200 as the token's person, a cross-site POST with a bearer is not refused for its origin, a token
the verifier refuses is 401 and an unreachable verifier 503. `auth-gate.test.mjs`: the proxy's bypass names the
prefix and the header. `app-bridge.test.mjs`, `app-bridge-page.test.mjs`: the two token messages. The app's
`api.test.mjs`: when a token is fresh, when the page is asked again. `native-thread.test.mjs`: the words.

## Risks

- **A bearer that leaks** is an hour of that person's session, the same as the cookie's access token. It never
  leaves the phone but to the site, over TLS, and is never written to disk.
- **A revoked session** is seen by the local signature check only when the token expires, as with the cookie
  (proxy.ts's own note). The bearer path is not worse.
- **Rate buckets keyed by cookie session** are keyed by user id and workspace, so a bearer request shares them.

## Open questions

- Whether the native Today (PR 9) should mount a hidden page for its token on a cold start, or whether the shell
  should hold a refresh token in SecureStore then. Decide in PR 9's note; nothing here forecloses either.
