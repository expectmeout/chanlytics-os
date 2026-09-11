# The Typed Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One `api()` in the browser, typed from the routes themselves: every request the bridge makes names a route key, and the compiler knows what that route takes and answers, so the 88 fetch sites in 19 bridge files stop hand-typing the server's answers and stop re-implementing the envelope, the sign-out, the timeout and the refresh.

**Architecture:** Plan 2C put every handler on `route()`, which already carries the policy on the export. This plan makes the export carry the *shape* too, as a phantom type: `InputOf<typeof POST>` is the body (or, for a read, the query) the schema accepts, `OutputOf<typeof GET>` is what `handle` returns. A generated registry maps `"METHOD path"` keys to those exports with `typeof import(...)`, which TypeScript resolves and the bundler never sees. A pure `createApi(deps)` in `src/client/` owns the URL (params, query, `?workspace=`), the envelope, 401, timeouts, the in-flight collapser for reads and the refresh map for writes; the bridge instantiates it once with the real window. Then the sites move, domain by domain, deleting each hand-rolled courier as its last caller goes; the last PR turns "every bridge request goes through `api()`" into a lint.

**Tech Stack:** as the earlier plans. `route()` is `apps/dashboard/src/server/route.ts`; the bridge is `apps/dashboard/src/legacy-bridge/` (type-checked; only `src/legacy` is excluded); tests are `tooling/scripts/tests/*.test.mjs` run with `node --conditions=react-server --import tsx --test`; `fakeDb` is not needed here, a fake `fetch` is.

**Rules:** the house rules of the earlier plans apply. Never add a `readCode`/`readRaw` assertion; a pin that names a courier's text moves to the `api()` form. A compile error in a consumer after a site moves is a *finding*, not a nuisance: the hand-typed shape was wrong, and the PR says what the real shape is and what the consumer now does. Nothing a page shows changes; the legacy `.jsx` pages read the same window globals.

---

## What is there today

- `apps/dashboard/src/legacy-bridge/surface-data.ts` has `fetchEnvelope<T>(url)`: `scoped()` appends `?workspace=`, an in-flight map collapses identical reads for two seconds, a 401 throws `UnauthorizedError`, anything else throws. Its 36 call sites each spell the answer's type by hand, e.g. `fetchEnvelope<{ config: { brain?: { business_name?: string } } | null }>("/api/v1/settings")`, which is a second copy of the route's output that nothing checks.
- Eleven files carry their own courier for writes, each a copy of the same twenty lines: `inbox-verbs.ts` `call()`, `templates.ts` and `playbooks.ts` `call<T>()`, `ask/api.ts` `viaAsk()`, and inline `fetch(scoped(...))` in `people-detail.ts`, `people-lists.ts`, `broadcast-verbs.ts`, `google.ts`, `billing.ts`, `business-record.ts`, `platform.ts`, `setup.ts`, `whatsapp-connect.ts`, `calendar.ts`, `identity.ts`, `notifications.ts`, `CreateWorkspace.tsx`. Each does: JSON headers, the 401 → `clearSurfaceCache()` + `location.assign("/login")`, the envelope parse, "Network error — nothing was changed.", `invalidateInFlight()`, and its own list of surfaces to refresh.
- The server's envelope is `{ ok: true, data }` or `{ ok: false, error: { code, message, details? } }` (`with-route.ts`), on every `/api/v1` response.
- Three routes answer something other than the envelope: `GET google/connect` and `GET google/callback` redirect, `POST ask` streams JSON lines. They keep a raw path.
- `tooling/scripts/tests/route-policy.json` lists all 113 handlers as `"METHOD path"` keys; the generator below walks the same files the same way.

## File structure

- Modify `apps/dashboard/src/server/route.ts`: the phantom `Shape<I, O>` on the export, `InputOf`, `OutputOf`.
- Create `tooling/scripts/gen-route-types.mjs`: walks `apps/dashboard/app/api/v1/**/route.ts`, emits `apps/dashboard/src/client/routes.generated.ts` (`ROUTES` const + `Routes` type). `--check` exits non-zero when the file is stale.
- Create `apps/dashboard/src/client/routes.generated.ts`: generated, committed, checked in CI by `route-types.test.mjs`.
- Create `apps/dashboard/src/client/api.ts`: `createApi(deps)`, `ApiResult`, `ApiError`, `unwrap`. No `window` at module scope; loadable under node.
- Create `apps/dashboard/src/legacy-bridge/refresh-map.ts`: which surfaces a write refreshes, by route key. One table, replacing the lists in eleven couriers.
- Create `apps/dashboard/src/legacy-bridge/api.ts`: the one instance, wired to `window`, `getActiveWorkspace`, `clearSurfaceCache`, `invalidateInFlight` and the refresh map.
- Create `tooling/scripts/tests/typed-client.test.mjs`: `createApi` run with a fake fetch.
- Create `tooling/scripts/tests/route-types.test.mjs`: the generated registry is current, and agrees with `route-policy.json`.
- Modify, per domain PR: the bridge files above; the tests that pin their text.
- Modify, last: `tooling/scripts/tests/hygiene.test.mjs` gains the lint "no `fetch(` in `src/legacy-bridge` outside `api.ts` and the two raw paths".

---

### Task 1: The export carries its shape

**Files:**
- Modify: `apps/dashboard/src/server/route.ts`
- Test: `tooling/scripts/tests/route-definition.test.mjs` (add one test; it already imports `route.ts`)

- [x] **Step 1: Write the failing test**

```js
test("the export carries what the route takes and answers, as a type the client can read", async () => {
  // Types are erased, so the executed half is that nothing is added at runtime;
  // the typed half is Task 2's generated file compiling against every export.
  const GET = read({ scope: workspace, query: z.object({ days: z.string().optional() }), handle: async () => ({ n: 1 }) });
  assert.deepEqual(Object.keys(GET).sort(), ["policy", "run"], "a phantom type adds nothing at runtime");
  assert.deepEqual(Object.getOwnPropertySymbols(GET), [], "and no symbol either");
});
```

- [x] **Step 2: Run it to see it pass already** (it pins the invariant Step 3 must keep)

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/route-definition.test.mjs`
Expected: PASS

- [x] **Step 3: Add the phantom shape to route.ts**

Below `Policy`:

```ts
declare const shape: unique symbol;
/**
 * What a route takes and answers, carried on the export as a phantom type so
 * the client can read them: `InputOf<typeof POST>` is the body (or, for a
 * read, the query) the schema accepts; `OutputOf<typeof GET>` is what
 * `handle` returns. Nothing exists at runtime: the symbol is never created,
 * and the property is optional so the handler object is unchanged.
 */
export type Shape<I, O> = { readonly [shape]?: { input: I; output: O } };
export type InputOf<R> = R extends Shape<infer I, unknown> ? I : never;
export type OutputOf<R> = R extends Shape<unknown, infer O> ? O : never;
```

And the last line of `build()`:

```ts
  const handler = Object.assign(withRoute((req, ctx) => run(req, ctx)), { policy, run });
  return handler as typeof handler & Shape<I, O>;
```

- [x] **Step 4: Typecheck and run the test**

Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm -C apps/dashboard typecheck` then the test from Step 2.
Expected: both pass.

- [x] **Step 5: Commit**

```bash
git add apps/dashboard/src/server/route.ts tooling/scripts/tests/route-definition.test.mjs
git commit -m "route(): the export carries its input and output as a phantom type"
```

### Task 2: The generated registry

**Files:**
- Create: `tooling/scripts/gen-route-types.mjs`
- Create: `apps/dashboard/src/client/routes.generated.ts`
- Test: `tooling/scripts/tests/route-types.test.mjs`

- [x] **Step 1: Write the failing test**

```js
/**
 * The registry the client is typed from is generated from the route files and
 * committed; this test regenerates it in memory and refuses a stale copy, and
 * holds it to the policy file's inventory so the two can never name different
 * routes. UPDATE_ROUTE_TYPES=1 rewrites it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generate, OUT } from "../gen-route-types.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const current = generate(ROOT);
const file = path.join(ROOT, OUT);

test("the generated registry is current", () => {
  if (process.env.UPDATE_ROUTE_TYPES === "1") fs.writeFileSync(file, current.text);
  assert.equal(fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"), current.text, "run UPDATE_ROUTE_TYPES=1 to regenerate");
});

test("the registry and the policy file name the same handlers", () => {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, "tooling/scripts/tests/route-policy.json"), "utf8"));
  assert.deepEqual(current.keys, Object.keys(policy.routes).sort(), "one inventory, two readers");
});

test("the registry imports types only: no route module reaches the client bundle", () => {
  for (const line of current.text.split("\n")) assert.ok(!/^import /.test(line), line);
  assert.ok(/typeof import\("\.\.\/\.\.\/app\/api\/v1\/settings\/route"\)\.GET/.test(current.text), "type-only import expressions");
});
```

- [x] **Step 2: Run it to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/route-types.test.mjs`
Expected: FAIL, `Cannot find module '../gen-route-types.mjs'`

- [x] **Step 3: Write the generator**

```js
#!/usr/bin/env node
/**
 * The route registry the typed client reads: one key per handler, in the
 * form route-policy.json already uses ("GET conversations/[id]"), with the
 * method and path at runtime and the handler's type via `typeof import()`,
 * which TypeScript resolves and no bundler ever loads.
 *
 *   node tooling/scripts/gen-route-types.mjs          # write
 *   node tooling/scripts/gen-route-types.mjs --check  # exit 1 when stale
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OUT = "apps/dashboard/src/client/routes.generated.ts";
const API = "apps/dashboard/app/api/v1";
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export function generate(root) {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts") files.push(p);
    }
  })(path.join(root, API));
  const entries = [];
  for (const f of files.sort()) {
    const rel = path.relative(path.join(root, API), f).replace(/\\/g, "/").replace(/\/route\.ts$/, "");
    const src = fs.readFileSync(f, "utf8");
    for (const m of METHODS) {
      if (!new RegExp(`^export const ${m} = `, "m").test(src)) continue;
      entries.push({ key: `${m} ${rel}`, method: m, path: `/api/v1/${rel}`, module: `../../app/api/v1/${rel}/route` });
    }
  }
  entries.sort((a, b) => (a.key < b.key ? -1 : 1));
  const lines = [
    "/* Generated by tooling/scripts/gen-route-types.mjs from apps/dashboard/app/api/v1 — do not edit. */",
    "",
    "/** Every handler under /api/v1, keyed the way route-policy.json keys it. */",
    "export const ROUTES = {",
    ...entries.map((e) => `  ${JSON.stringify(e.key)}: { method: ${JSON.stringify(e.method)}, path: ${JSON.stringify(e.path)} },`),
    "} as const;",
    "",
    "/** The handler each key names, as a type: what it takes and answers rides on it (route.ts, Shape). */",
    "export type Routes = {",
    ...entries.map((e) => `  ${JSON.stringify(e.key)}: typeof import(${JSON.stringify(e.module)}).${e.method};`),
    "};",
    "",
  ];
  return { text: lines.join("\n"), keys: entries.map((e) => e.key) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const { text } = generate(root);
  const out = path.join(root, OUT);
  if (process.argv.includes("--check")) {
    const same = fs.existsSync(out) && fs.readFileSync(out, "utf8").replace(/\r\n/g, "\n") === text;
    console.log(same ? "route types: current" : "route types: STALE — run node tooling/scripts/gen-route-types.mjs");
    process.exit(same ? 0 : 1);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  console.log(`wrote ${OUT}`);
}
```

- [x] **Step 4: Generate, typecheck, run the test**

Run: `node tooling/scripts/gen-route-types.mjs` then the typecheck, then the test.
Expected: the file exists with 113 keys; `tsc` resolves every `typeof import(...)`; the three tests pass. If `tsc` refuses a `typeof import()` of a route module, the cause is a route exporting something that is not a `route()` handler under a method name — fix the route, not the generator.

- [x] **Step 5: Commit**

```bash
git add tooling/scripts/gen-route-types.mjs apps/dashboard/src/client/routes.generated.ts tooling/scripts/tests/route-types.test.mjs
git commit -m "The route registry: every handler's key, method, path and type, generated and checked"
```

### Task 3: The client

**Files:**
- Create: `apps/dashboard/src/client/api.ts`
- Test: `tooling/scripts/tests/typed-client.test.mjs`

- [x] **Step 1: Write the failing test**

```js
/**
 * The typed client, run with a fake fetch: what it sends, what it answers,
 * and what it does on the way (sign-out, invalidation, refresh). The types
 * are proved by the bridge compiling against it; this is the behaviour.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { createApi, ApiError, unwrap } = await import(at("apps/dashboard/src/client/api.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const envelope = (data) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const refusal = (status, code, message) => new Response(JSON.stringify({ ok: false, error: { code, message } }), { status });

function harness(answer, { workspace = A } = {}) {
  const sent = [];
  const events = [];
  let clock = 1_000;
  const api = createApi({
    fetch: async (url, init) => { sent.push({ url, init }); const a = typeof answer === "function" ? await answer(url, init) : answer; return a; },
    workspace: () => workspace,
    onSignedOut: () => events.push("signed-out"),
    invalidate: () => events.push("invalidate"),
    refresh: async (key) => { events.push(`refresh:${key}`); },
    now: () => clock,
  });
  return { api, sent, events, tick: (ms) => { clock += ms; } };
}

test("a read: the path with its params, the query, the workspace the tab holds, and the envelope's data", async () => {
  const h = harness(envelope({ conversation: { id: C1 }, messages: [] }));
  const r = await h.api("GET conversations/[id]", { params: { id: C1 }, query: { before: "2026-09-01T00:00:00Z" } });
  assert.deepEqual(r, { ok: true, data: { conversation: { id: C1 }, messages: [] } });
  assert.equal(h.sent[0].url, `/api/v1/conversations/${C1}?before=2026-09-01T00%3A00%3A00Z&workspace=${A}`);
  assert.equal(h.sent[0].init.method, "GET");
  assert.deepEqual(h.events, [], "a read invalidates and refreshes nothing");
});

test("a write: JSON in, the idempotency key and the via marker on the wire, then invalidate and the refresh map", async () => {
  const h = harness(envelope({ message_id: "m1", status: "queued" }));
  const r = await h.api("POST conversations/[id]/reply", { params: { id: C1 }, body: { text: "On our way." }, idempotencyKey: "k1", via: "ask" });
  assert.equal(r.ok, true);
  const { init } = h.sent[0];
  assert.equal(init.method, "POST");
  assert.equal(init.body, JSON.stringify({ text: "On our way." }));
  assert.equal(init.headers["content-type"], "application/json");
  assert.equal(init.headers["idempotency-key"], "k1");
  assert.equal(init.headers["x-via"], "ask");
  assert.deepEqual(h.events, ["invalidate", "refresh:POST conversations/[id]/reply"], "after a 2xx, in that order");
});

test("a refusal is the server's words and code; a 401 signs out; a network failure changes nothing and says so", async () => {
  const refused = harness(refusal(403, "forbidden", "Viewers can see everything and change nothing."));
  assert.deepEqual(await refused.api("POST conversations/[id]/reply", { params: { id: C1 }, body: { text: "x" } }), { ok: false, code: "forbidden", status: 403, message: "Viewers can see everything and change nothing." });
  assert.deepEqual(refused.events, [], "nothing refreshed for a refusal");
  const out = harness(refusal(401, "unauthorized", "Sign in required."));
  assert.deepEqual(await out.api("GET conversations"), { ok: false, code: "unauthorized", status: 401, message: "Signed out." });
  assert.deepEqual(out.events, ["signed-out"]);
  const down = harness(() => { throw new TypeError("fetch failed"); });
  assert.deepEqual(await down.api("PUT settings", { body: { config: {}, version: 1 } }), { ok: false, code: "network", status: 0, message: "Network error — nothing was changed." });
  const gone = harness(new Response("<html>", { status: 502 }));
  assert.deepEqual(await gone.api("GET conversations"), { ok: false, code: "internal", status: 502, message: "Request failed (502)." });
});

test("identical reads within two seconds share one request; a write never does; a settled read is not shared past its burst", async () => {
  let n = 0;
  const h = harness(() => { n += 1; return envelope({ conversations: [] }); });
  await Promise.all([h.api("GET conversations"), h.api("GET conversations")]);
  assert.equal(n, 1, "the second joined the first");
  h.tick(2_001);
  await h.api("GET conversations");
  assert.equal(n, 2, "after the burst, a fresh request");
  await Promise.all([h.api("POST billing/sync"), h.api("POST billing/sync")]);
  assert.equal(n, 4, "writes are never collapsed");
});

test("raw: the Response itself, for the two redirects and the stream", async () => {
  const h = harness(new Response("line\n", { status: 200 }));
  const res = await h.api.raw("POST ask", { body: { text: "Who booked this week?" } });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "line\n");
});

test("unwrap throws the refusal as an ApiError the runner can read", async () => {
  const h = harness(refusal(503, "upstream_auth", "Signing in is not working right now."));
  await assert.rejects(async () => unwrap(await h.api("GET conversations")), (e) => e instanceof ApiError && e.code === "upstream_auth" && e.status === 503);
  assert.deepEqual(unwrap({ ok: true, data: 7 }), 7);
});
```

- [x] **Step 2: Run it to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/typed-client.test.mjs`
Expected: FAIL, cannot find `apps/dashboard/src/client/api.ts`

- [x] **Step 3: Write the client**

```ts
/**
 * The one way the browser talks to /api/v1.
 *
 * Every request names a route key from the generated registry, and the
 * compiler knows from it what the route takes (`InputOf`) and answers
 * (`OutputOf`), so a site that hand-typed the server's answer, or sent a body
 * the route never read, stops compiling. Eleven couriers used to each own the
 * envelope, the 401, the timeout and their own list of surfaces to refresh;
 * this owns them once. Pure: no `window`, so it runs under node with a fake
 * fetch, and the bridge instantiates it with the real one.
 */
import type { InputOf, OutputOf } from "../server/route";
import { ROUTES, type Routes } from "./routes.generated";

export type RouteKey = keyof Routes;
type ParamNames<S extends string> = S extends `${string}[${infer P}]${infer Rest}` ? P | ParamNames<Rest> : never;
export type Params<K extends RouteKey> = Record<ParamNames<K>, string>;
type MethodOf<K extends RouteKey> = (typeof ROUTES)[K]["method"];
/** A read's query, as its schema declares it; a write has none. */
type QueryOf<K extends RouteKey> = MethodOf<K> extends "GET" ? InputOf<Routes[K]> : never;
/** A write's body: the declared schema, or anything JSON for a route that reads its own. */
type BodyOf<K extends RouteKey> = MethodOf<K> extends "GET" ? never : InputOf<Routes[K]> extends undefined ? unknown : InputOf<Routes[K]>;

export interface ApiOptions<K extends RouteKey> {
  params?: Params<K>;
  query?: QueryOf<K>;
  body?: BodyOf<K>;
  /** For the reply: the same key on a retry means the same message, never a second one. */
  idempotencyKey?: string;
  /** The Ask palette commits through the same routes a button does; the ledger keeps that a card was tapped. */
  via?: "ask";
  timeoutMs?: number;
}

export type ApiResult<O> = { ok: true; data: O } | { ok: false; code: string; status: number; message: string };
type Envelope = { ok: true; data: unknown } | { ok: false; error?: { code?: string; message?: string } };

export class ApiError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** The data, or the refusal thrown: for the overrides, whose failure is "stay seeded". */
export function unwrap<O>(r: ApiResult<O>): O {
  if (r.ok) return r.data;
  throw new ApiError(r.code, r.status, r.message);
}

export interface ApiDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** The workspace this tab holds; appended as ?workspace= unless the caller named one. */
  workspace: () => string | null;
  /** A 401: the session is gone. The bridge clears the cache and goes to /login. */
  onSignedOut: () => void;
  /** After a 2xx write, before the refresh: nothing in flight can describe the world any more. */
  invalidate: () => void;
  /** After a 2xx write: which surfaces to re-read, by the refresh map. */
  refresh: (key: RouteKey) => Promise<void>;
  now?: () => number;
}

/** Identical reads inside this window share one request: three overrides asking for the same list at boot. */
const INFLIGHT_MS = 2_000;
const READ_TIMEOUT_MS = 15_000;
const WRITE_TIMEOUT_MS = 30_000;

export function createApi(deps: ApiDeps) {
  const now = deps.now ?? (() => Date.now());
  const inFlight = new Map<string, { p: Promise<unknown>; at: number }>();

  function urlFor<K extends RouteKey>(key: K, opts: ApiOptions<K>): string {
    const params = (opts.params ?? {}) as Record<string, string>;
    const url = ROUTES[key].path.replace(/\[(\w+)\]/g, (_m, name: string) => encodeURIComponent(params[name] ?? ""));
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries((opts.query ?? {}) as Record<string, unknown>)) if (v !== undefined && v !== null) qs.set(k, String(v));
    const ws = deps.workspace();
    if (ws && !qs.has("workspace")) qs.set("workspace", ws);
    const q = qs.toString();
    return q ? `${url}?${q}` : url;
  }

  function initFor<K extends RouteKey>(key: K, opts: ApiOptions<K>): RequestInit {
    const { method } = ROUTES[key];
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
    if (opts.via) headers["x-via"] = opts.via;
    return {
      method,
      headers,
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      signal: AbortSignal.timeout(opts.timeoutMs ?? (method === "GET" ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS)),
    };
  }

  async function send<K extends RouteKey>(key: K, opts: ApiOptions<K> = {} as ApiOptions<K>): Promise<ApiResult<OutputOf<Routes[K]>>> {
    const isRead = ROUTES[key].method === "GET";
    const url = urlFor(key, opts);
    if (isRead) {
      const hit = inFlight.get(url);
      if (hit && now() - hit.at < INFLIGHT_MS) return hit.p as Promise<ApiResult<OutputOf<Routes[K]>>>;
    }
    const p = (async (): Promise<ApiResult<OutputOf<Routes[K]>>> => {
      let res: Response;
      try {
        res = await deps.fetch(url, initFor(key, opts));
      } catch {
        return { ok: false, code: "network", status: 0, message: isRead ? "Chanlytics could not be reached." : "Network error — nothing was changed." };
      }
      if (res.status === 401) {
        deps.onSignedOut();
        return { ok: false, code: "unauthorized", status: 401, message: "Signed out." };
      }
      const j = (await res.json().catch(() => null)) as Envelope | null;
      if (!j || !j.ok) {
        const e = j && !j.ok ? j.error : undefined;
        return { ok: false, code: e?.code ?? "internal", status: res.status, message: e?.message ?? `Request failed (${res.status}).` };
      }
      if (!isRead) {
        deps.invalidate();
        await deps.refresh(key);
      }
      return { ok: true, data: j.data as OutputOf<Routes[K]> };
    })();
    if (isRead) {
      // A rejection must not be shared beyond its burst: drop the entry as it settles.
      inFlight.set(url, { p, at: now() });
      p.finally(() => { if (inFlight.get(url)?.p === p) inFlight.delete(url); }).catch(() => {});
    }
    return p;
  }

  /** The Response itself: the two Google redirects and the Ask stream answer no envelope. */
  async function raw<K extends RouteKey>(key: K, opts: ApiOptions<K> = {} as ApiOptions<K>): Promise<Response> {
    const res = await deps.fetch(urlFor(key, opts), initFor(key, opts));
    if (res.status === 401) deps.onSignedOut();
    return res;
  }

  return Object.assign(send, { raw, url: urlFor });
}

export type Api = ReturnType<typeof createApi>;
```

- [x] **Step 4: Run the test and the typecheck**

Expected: six tests pass; `tsc` clean. If `Record<never, string>` refuses `params` on a route with none, the fix is `Params<K>` as `[ParamNames<K>] extends [never] ? undefined : Record<...>`.

- [x] **Step 5: Commit**

```bash
git add apps/dashboard/src/client/api.ts tooling/scripts/tests/typed-client.test.mjs
git commit -m "The typed client: one api(), typed from the routes, run with a fake fetch"
```

### Task 4: The bridge's instance and the refresh map

**Files:**
- Create: `apps/dashboard/src/legacy-bridge/refresh-map.ts`
- Create: `apps/dashboard/src/legacy-bridge/api.ts`
- Test: `tooling/scripts/tests/typed-client.test.mjs` (one more test, on the map)

- [x] **Step 1: Write the refresh map**

Every write's surfaces, gathered from the couriers that own them today (inbox-verbs → inbox, conversations, today; playbooks → playbooks, broadcasts; templates → settings, inbox, plus the broadcasts and playbooks hooks; people → people, people detail; settings → settings; and so on). Keys not in the map refresh nothing.

```ts
import type { RouteKey } from "../client/api";
import {
  broadcastsOverride, calendarOverride, conversationsOverride, inboxOverride, liveOverride, peopleOverride,
  playbooksOverride, reportsOverride, settingsOverride, todayOverride, type SurfaceOverride,
} from "./surface-data";
import { refreshSurfaces } from "./surface-runner";

/** After a write lands: the surfaces that could now be stale. One table, not eleven couriers' lists. */
const AFTER: Partial<Record<RouteKey, () => SurfaceOverride[]>> = {
  "POST conversations/[id]/reply": () => [inboxOverride, conversationsOverride, todayOverride],
  "POST conversations/[id]/take-over": () => [inboxOverride, conversationsOverride, todayOverride],
  // … one line per write, copied from the courier that refreshes it today …
  "POST templates": () => [settingsOverride, inboxOverride],
  "POST playbooks": () => [playbooksOverride, broadcastsOverride],
};

/** Window hooks a few pages still register; they go when those pages read the surfaces directly. */
const HOOKS: Partial<Record<RouteKey, string[]>> = {
  "POST templates": ["__refreshBroadcasts", "__refreshPlaybooks"],
  "POST templates/starter": ["__refreshBroadcasts", "__refreshPlaybooks"],
};

export async function refreshAfter(key: RouteKey): Promise<void> {
  const overrides = AFTER[key]?.() ?? [];
  if (overrides.length) await refreshSurfaces(overrides);
  for (const name of HOOKS[key] ?? []) {
    const fn = (window as unknown as Record<string, (() => Promise<void>) | undefined>)[name];
    if (fn) await fn();
  }
}
```

The full table is written at execution by reading each courier's refresh list; the PR that moves a courier moves its list here.

- [x] **Step 2: Write the instance**

```ts
import { createApi } from "../client/api";
import { clearSurfaceCache } from "./surface-cache";
import { getActiveWorkspace, invalidateInFlight } from "./surface-data";
import { refreshAfter } from "./refresh-map";

/** The browser's one client. Built lazily so importing this file never touches `window`. */
let instance: ReturnType<typeof createApi> | null = null;
export function api() {
  instance ??= createApi({
    fetch: (url, init) => window.fetch(url, init),
    workspace: getActiveWorkspace,
    onSignedOut: () => {
      // Clear BEFORE redirecting: the surface cache holds real customer
      // transcripts in sessionStorage, and a session expiring mid-click must
      // not leave one workspace's messages for whoever signs in next.
      clearSurfaceCache();
      window.location.assign("/login");
    },
    invalidate: invalidateInFlight,
    refresh: refreshAfter,
  });
  return instance;
}
```

- [x] **Step 3: Add the map's test**

```js
test("the refresh map names a surface list for every write that refreshed one before, and nothing for reads", async () => {
  const { ROUTES } = await import(at("apps/dashboard/src/client/routes.generated.ts"));
  // The map module imports surface-data, which touches nothing at import time; the table is data.
  const { AFTER_KEYS } = await import(at("apps/dashboard/src/legacy-bridge/refresh-map.ts"));
  for (const k of AFTER_KEYS) assert.notEqual(ROUTES[k].method, "GET", `${k}: a read refreshes nothing`);
});
```

(Export `AFTER_KEYS = Object.keys(AFTER)` from the map for this.)

- [x] **Step 4: Typecheck, run the client test, commit**

```bash
git add apps/dashboard/src/legacy-bridge/refresh-map.ts apps/dashboard/src/legacy-bridge/api.ts tooling/scripts/tests/typed-client.test.mjs
git commit -m "The bridge's one client, and the refresh map the couriers' lists move into"
```

PR 1 ends here: `route.ts` shape, the registry, the client, the instance, the map. Nothing moved yet. Typecheck, full suite, lint, PR, merge when green.

### Task 5: The reads move (PR 2)

**Files:**
- Modify: `apps/dashboard/src/legacy-bridge/surface-data.ts` (36 sites), `setup.ts`, `google.ts`, `billing.ts`, `people-detail.ts` (their reads), `whatsapp-connect.ts` (`config`), `ask/api.ts` (`threads`, `thread`, `openings`)
- Modify: the tests that pin those sites (measured at execution with `grep -rn "fetchEnvelope<" tooling/scripts/tests`)

- [ ] **Step 1: Move each `fetchEnvelope<T>(url)` to `unwrap(await api()("GET …", { … }))`**

Before:

```ts
fetchEnvelope<{ conversations: ConversationDto[] }>("/api/v1/conversations"),
fetchEnvelope<{ escalations: EscalationRow[] }>("/api/v1/escalations?state=open"),
fetchEnvelope<{ calendar: CalendarWeekDto }>(`/api/v1/calendar?from=${w.from}&days=${w.days}`),
```

After:

```ts
unwrap(await api()("GET conversations")),
unwrap(await api()("GET escalations", { query: { state: "open" } })),
unwrap(await api()("GET calendar", { query: { from: w.from, days: String(w.days) } })),
```

The hand-typed generic goes; the consumer is now typed by the route. Where the two disagree, `tsc` says where: fix the consumer (or, rarely, the route's type), and name it in the PR.

- [ ] **Step 2: The runner's 401 check reads `ApiError`**

In `surface-data.ts` `activateOverride` and wherever `err instanceof UnauthorizedError` is tested: `err instanceof ApiError && err.code === "unauthorized"`. `UnauthorizedError` is deleted when its last thrower goes.

- [ ] **Step 3: `fetchEnvelope` is deleted**, its in-flight map with it (the client owns one).

- [ ] **Step 4: Typecheck, the suite, lint; move the pins the suite names; PR; merge when green.**

### Task 6: The inbox and people couriers move (PR 3)

**Files:** `inbox-verbs.ts` (`call()` and `runVerb`), `broadcast-verbs.ts`, `people-lists.ts`, `people-detail.ts` (its writes), `notifications.ts`; their refresh lists into `refresh-map.ts`; their pins.

- [ ] **Step 1: Each courier's `call(url, body, …)` becomes `api()(key, { params, body, idempotencyKey })`**, and its `refresh()` goes: the map refreshes after the client reports a 2xx. `VerbResult` becomes `ApiResult<…>`; the one-verb-per-thread lock in `inboxVerb` stays, it is the courier's job, not the client's.
- [ ] **Step 2: Typecheck, suite, lint, pins, PR, merge when green.**

### Task 7: The rest of the couriers move (PR 4)

**Files:** `templates.ts`, `playbooks.ts`, `google.ts`, `billing.ts`, `business-record.ts`, `setup.ts`, `whatsapp-connect.ts`, `calendar.ts`, `identity.ts`, `platform.ts`; their refresh lists and window hooks into the map; their pins (`starter-templates.test.mjs` names `call<StarterData>(…)` and `"PUT", { title }, true)`; `forwarding.test.mjs`, `setup.test.mjs` and `whatsapp-connect.test.mjs` name paths on the bridge).

- [ ] **Step 1: Move them**, the same way. `google/connect`'s redirect is followed by the browser, not fetched: unchanged.
- [ ] **Step 2: Typecheck, suite, lint, pins, PR, merge when green.**

### Task 8: Ask, sign-up, and the wall (PR 5)

**Files:** `ask/api.ts` (`viaAsk` → `api()(key, { via: "ask", … })`, `send` → `api().raw("POST ask", …)` then the same line reader), `ask/commit.ts`, `CreateWorkspace.tsx` (`api()("POST workspaces/create", { body })`), `LegacyApp.tsx` (`/api/version` is not a v1 route; it stays a plain fetch and is named in the lint's allowance); `tooling/scripts/tests/hygiene.test.mjs`.

- [ ] **Step 1: Move the last sites.**
- [ ] **Step 2: The wall.** In `hygiene.test.mjs` (a repo-wide lint file, exempt from the source-scan ratchet):

```js
test("every bridge request goes through the typed client", () => {
  const dir = path.join(ROOT, "apps/dashboard/src/legacy-bridge");
  const offenders = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && e.name !== "api.ts") {
        const src = fs.readFileSync(p, "utf8");
        // The one fetch that is not a /api/v1 route: the version check on boot.
        if (/\bfetch\(/.test(src.replace('fetch("/api/version"', ""))) offenders.push(path.relative(ROOT, p));
      }
    }
  })(dir);
  assert.deepEqual(offenders, [], "a request outside api() re-implements the envelope, the sign-out and the refresh");
});
```

- [ ] **Step 3: Delete `scoped` from `surface-data.ts`** when its last caller goes (the client builds the URL), and `clearSurfaceCache` stays where it is.
- [ ] **Step 4: Typecheck, suite, lint, pins, PR, merge when green.**

---

## After this plan

- The generated registry is the API's table of contents: 113 handlers, each with a type the compiler holds the bridge to. `route-policy.json` says who may call each; `routes.generated.ts` says what each takes and answers.
- `/w/[slug]`: the workspace in the page URL, so a reload and a shared link land in the right business without `?workspace=` on every call. The client's `workspace()` dependency is where that lands.
- The `.jsx` pages: as they move onto typed modules, they can call `api()` directly and the window globals go one by one.

## Self-review

- **Spec coverage.** The program's sentence for this phase: "One `api()` replaces the fetch sites, and owns the envelope, 401/503, timeouts and the refresh map." Envelope: Task 3. 401: `onSignedOut`, Task 3 and 4. 503 and every other refusal: the result's `code` and `status`, Task 3 (`upstream_auth` reaches the runner as an `ApiError` it can read). Timeouts: `AbortSignal.timeout`, Task 3. The refresh map: Task 4, filled in Tasks 6 and 7. The sites: Tasks 5 to 8, all 88, and the wall.
- **Placeholders.** The refresh table's full contents are copied from the couriers at execution, one line each; the plan shows the shape and two rows rather than guessing eleven lists.
- **Types.** `InputOf`/`OutputOf` (Task 1) are what `api.ts` (Task 3) reads; `Routes`/`ROUTES` (Task 2) are what it indexes; `RouteKey` (Task 3) is what the map (Task 4) is keyed by. `unwrap`/`ApiError` (Task 3) are what the reads (Task 5) throw for the runner.
