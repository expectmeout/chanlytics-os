/**
 * One workspace, resolved once, applied everywhere.
 *
 * Multi-tenancy here failed in a way that reads as working: the database layer
 * is correct — RLS on all 19 tables, the (select auth.uid()) initPlan form, and
 * an index that serves it — so nothing leaked. What broke was the layer above.
 *
 * RLS answers "may this caller see this row". For someone who belongs to two
 * workspaces the answer is YES to both, so the read endpoints, scoped by RLS
 * alone, returned two businesses' customers interleaved in one inbox. Meanwhile
 * three routes each picked a default tenant by a DIFFERENT rule — oldest
 * membership, name-sorted tenant, oldest tenant — so the role chip could
 * describe one business and the data beneath it another. And the routes that
 * did resolve membership threw outright, because the client never sent a
 * workspace at all.
 *
 * These tests pin the shape of the fix rather than the queries: one resolver,
 * every read filtered, every write refusing to guess.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";
import { bridgeHolds } from "../shell/_bridge-holds.mjs";

// The list routes run below build no service client; a module that ever does reads these, and nothing dials it.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-test-only";
// Next's request stores, as a server gives them (globalThis.AsyncLocalStorage), for the cookie read below.
globalThis.AsyncLocalStorage ??= AsyncLocalStorage;

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "../..");
const API = path.join(ROOT, "apps/dashboard/app/api/v1");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").split("\r\n").join("\n");

// The seam and each surface's module beside it (bridge/surfaces/), read as one text.
const surfaceData = [
  "apps/dashboard/src/bridge/surface-data.ts",
  "apps/dashboard/src/surfaces/reports/surface.ts",
  ...fs
    .readdirSync(path.join(ROOT, "apps/dashboard/src/bridge/surfaces"))
    .map((f) => `apps/dashboard/src/bridge/surfaces/${f}`),
]
  .map((p) => read(p))
  .join("\n");
const runner = read("apps/dashboard/src/bridge/surface-runner.ts");

/* ------------------------ one resolver, one rule -------------------------- */

test("getMemberContext is the only place a default workspace is chosen", () => {
  // Each of these was a route resolving the tenant for itself, by its own rule.
  const offenders = [];
  for (const f of ["metrics/route.ts", "workspaces/route.ts"]) {
    const src = fs.readFileSync(path.join(API, f), "utf8");
    // Picking [0] off a tenants query IS the second rule. The list of
    // workspaces may still be returned — it just cannot decide which is active.
    if (/tenants\?\.\[0\]|tenants\[0\]/.test(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], "these routes still pick a default tenant themselves");
});

/* The resolver, run: a member of two workspaces, harbor (the older membership) and bayside, on a session that has
 * shown its second factor, so a workspace not found is not a partner's hidden seat. Pinned as with-route.ts's text
 * until 26 Nov 2026. */
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { getMemberContext, withRoute } = await import(at("apps/dashboard/src/server/shared/with-route.ts"));
const HARBOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BAYSIDE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STRANGER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const seat = (tenant_id, slug, created_at) => ({
  user_id: "u-two",
  tenant_id,
  role: "owner",
  tenants: { slug, name: slug, timezone: "America/New_York" },
  created_at,
});
const memberOf = (...seats) => ({
  supabase: fakeDb({ memberships: seats }),
  userId: "u-two",
  email: "two@example.com",
  aal: "aal2",
});
const memberOfTwo = () =>
  memberOf(seat(HARBOR, "harbor", "2026-01-01T00:00:00Z"), seat(BAYSIDE, "bayside", "2026-02-01T00:00:00Z"));
const refusedAs = (code, status) => (e) => {
  assert.equal(e.code, code, e.message);
  if (status) assert.equal(e.status, status, e.message);
  return true;
};

test("an explicit workspace resolves by id OR slug", async () => {
  // /metrics accepted slugs and nothing else did, so the same query string meant different things depending on which
  // endpoint received it.
  assert.equal((await getMemberContext(memberOfTwo(), BAYSIDE)).tenantId, BAYSIDE, "by its id");
  assert.equal((await getMemberContext(memberOfTwo(), "bayside")).tenantId, BAYSIDE, "by its slug");
  assert.equal((await getMemberContext(memberOfTwo(), "harbor")).tenantId, HARBOR);
});

test("a workspace the caller is not a member of is never silently swapped", async () => {
  // RLS means the query cannot see other people's memberships, so a forged id finds nothing -- and that must 404, not
  // fall through to their own default.
  await assert.rejects(getMemberContext(memberOfTwo(), STRANGER), refusedAs("not_found", 404));
  await assert.rejects(getMemberContext(memberOfTwo(), "someone-elses-slug"), refusedAs("not_found", 404));
});

/* --------------------------- reads are scoped ----------------------------- */

test("every list endpoint filters by tenant, not by RLS alone", async () => {
  // RLS is the floor: it stops cross-tenant reads no matter what. It is NOT a
  // scope — it happily returns every workspace the caller belongs to.
  //
  // Run, not read: the query lives in the route's reader (server/readers), not
  // in the route, and the database in memory has no RLS at all, so a list the
  // workspace does not filter answers both businesses' rows here.
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const member = (tenant_id, slug, created_at) => ({
    user_id: "u1",
    tenant_id,
    role: "viewer",
    tenants: { slug },
    created_at,
  });
  const both = [A, B];
  const world = () => ({
    memberships: [member(A, "harbor", "2026-01-01T00:00:00Z"), member(B, "bayside", "2026-02-01T00:00:00Z")],
    conversations: both.map((tenant_id, i) => ({
      id: `c${i}`,
      tenant_id,
      state: "open",
      paused_until: null,
      snooze_until: null,
      assignee_user_id: null,
      last_wa_inbound_at: null,
      last_message_at: "2026-09-10T10:00:00Z",
      contacts: { id: `k${i}` },
    })),
    messages: [],
    calls: both.map((tenant_id, i) => ({
      id: `k${i}`,
      tenant_id,
      retell_call_id: `r${i}`,
      direction: "inbound",
      call_type: "phone_call",
      status: "ended",
      from_e164: "+15550000001",
      from_raw: null,
      to_e164: "+15550000002",
      started_at: "2026-09-10T10:00:00Z",
      ended_at: null,
      updated_at: null,
      duration_ms: null,
      disconnection_reason: null,
      sentiment: null,
      call_successful: null,
      in_voicemail: null,
      summary: null,
      transcript_object: null,
      recording: null,
      conversation_id: `c${i}`,
      contact_id: null,
      message_id: null,
    })),
    escalations: both.map((tenant_id, i) => ({
      id: `e${i}`,
      tenant_id,
      reason: "price",
      details: null,
      state: "open",
      created_at: "2026-09-10T10:00:00Z",
      conversation_id: `c${i}`,
    })),
  });
  const unscoped = [];
  for (const [list, bayside] of [
    ["conversations", "c1"],
    ["calls", "k1"],
    ["escalations", "e1"],
  ]) {
    const { GET } = await importSrc(`apps/dashboard/app/api/v1/${list}/route.ts`);
    const ctx = { supabase: fakeDb(world()), userId: "u1", email: "ada@example.com", params: {} };
    const out = await GET.run(new Request(`http://localhost/api/v1/${list}?workspace=${B}`), ctx);
    const reads = ctx.supabase.seen.filter((q) => q.table === list && q.op === "select");
    const filtered =
      reads.length > 0 &&
      reads.every((q) => q.filters.some(([op, col, val]) => op === "eq" && col === "tenant_id" && val === B));
    if (GET.policy.scope !== "workspace" || !filtered || out[list].map((r) => r.id).join() !== bayside)
      unscoped.push(list);
  }
  assert.deepEqual(unscoped, [], "these endpoints would merge two businesses into one list");
});

/* --------------------------- writes never guess --------------------------- */

test("a request refuses to act on a workspace nobody named, read or write", async () => {
  // Reads used to fall back to the oldest membership, so a member of two workspaces saw one business under another's
  // name until the workspace surface answered. Since plan 3.4 the resolver refuses before it picks: one rule, in
  // getMemberContext, for every route, read or write.
  await assert.rejects(getMemberContext(memberOfTwo(), null), refusedAs("choose_workspace"));
  await assert.rejects(getMemberContext(memberOfTwo(), ""), refusedAs("choose_workspace"), "an empty name is none");
  const one = memberOf(seat(HARBOR, "harbor", "2026-01-01T00:00:00Z"));
  assert.equal((await getMemberContext(one, null)).tenantId, HARBOR, "a member of one workspace is in it");
});

test("only /workspaces may take the default: answering where am I is its job", async () => {
  // The list's own default is run in workspace/account-routes.test.mjs ("where you are"): the oldest membership.
  const taken = await getMemberContext(memberOfTwo(), null, { defaultAllowed: true });
  assert.equal(taken.tenantId, HARBOR, "the oldest membership");
  // route() never takes it: a workspace's route asked with no workspace is refused, and named, it acts there.
  const { read: readRoute, workspace } = await import(at("apps/dashboard/src/server/shared/route.ts"));
  const probe = readRoute({ scope: workspace, handle: ({ member }) => member.tenantId });
  const asked = (q) => probe.run(new Request(`http://localhost/api/v1/probe${q}`), memberOfTwo());
  await assert.rejects(asked(""), refusedAs("choose_workspace"));
  assert.equal(await asked(`?workspace=${BAYSIDE}`), BAYSIDE);
});

/* ------------------------------ the client -------------------------------- */

test("the workspace is appended at the fetch chokepoint", () => {
  // Not at the call sites. Three overrides fetch five endpoints between them,
  // and a sixth added later must not have to remember this.
  assert.ok(
    !surfaceData.includes("fetch("),
    "the seam owns no fetch: the client appends the workspace at its one chokepoint (typed-client.test.mjs)",
  );
  assert.ok(surfaceData.includes('read("GET '), "every read goes through the typed client");
});

test("a caller that names its own workspace is not overridden", async () => {
  // Run, not read: the client with a fake fetch, told the tab holds one
  // workspace, asked for another by name.
  const { createApi } = await importSrc("apps/dashboard/src/client/api.ts");
  const sent = [];
  const api = createApi({
    fetch: async (url) => {
      sent.push(url);
      return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
    },
    workspace: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    onSignedOut: () => {},
    refresh: async () => {},
  });
  await api("GET conversations", { query: { workspace: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } });
  assert.equal(sent[0], "/api/v1/conversations?workspace=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
});

test("the server has the last word on which workspace is active", () => {
  // The stored preference is a REQUEST. The server validates membership and may
  // override it; whatever it decides is what later requests must agree with,
  // or the page renders one workspace's data under another's name.
  assert.match(surfaceData, /data\.active_workspace_id/);
  assert.match(surfaceData, /rememberWorkspace\(slug\)/, "the server's word is what the home returns to");
  assert.match(
    surfaceData,
    /window\.location\.replace\(addressInWorkspace\(slug, window\.location\)\)/,
    "and what the address says",
  );
});

test("switching workspace clears and seals the cache before it reloads", () => {
  // sessionStorage holds real transcripts. Reloading without clearing would
  // restore the previous business's rows under the new one's name; clearing
  // without sealing let a read landing before the unload write them back.
  // Run below, in "a workspace created a moment ago".
  const fn = surfaceData.slice(surfaceData.indexOf("export function switchWorkspace"));
  assert.ok(fn.indexOf("sealSurfaceCache()") >= 0, "sealed, not only cleared");
  assert.ok(
    fn.indexOf("sealSurfaceCache()") < fn.indexOf("window.location.assign"),
    "the cache must be cleared BEFORE navigating away",
  );
});

test("a workspace created a moment ago opens at its slug, once: the app never boots under its id", async () => {
  // Run, not read. A new workspace is not in __WORKSPACES yet. Addressed by its
  // id, the app booted twice -- under the id, then again when the workspaces
  // read corrected the address -- and Setup's once-a-session landing fired on
  // the first boot and was lost with it (the nightly's workspace-create spec,
  // 13 Sep 2026).
  const store = () => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      key: (i) => [...m.keys()][i] ?? null,
      get length() {
        return m.size;
      },
    };
  };
  const saved = {
    window: globalThis.window,
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
  };
  const assigned = [];
  globalThis.localStorage = store();
  globalThis.sessionStorage = store();
  bridgeHolds(
    { who: { workspaces: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", slug: "harbor-moving" }] } },
    { fresh: true },
  );
  globalThis.window = {
    location: { pathname: "/w/harbor-moving", hash: "#/today", assign: (u) => assigned.push(u) },
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  };
  try {
    const { switchWorkspace } = await importSrc("apps/dashboard/src/bridge/surface-data.ts");
    const cache = await importSrc("apps/dashboard/src/bridge/surface-cache.ts");
    // The workspace being left, read and cached, as a reload would paint it.
    bridgeHolds({ values: { inbox: { threads: ["harbor-moving's"] } } });
    cache.snapshotSurface("inbox", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", undefined, "inbox");
    cache.flushSurfaceCache();
    assert.ok(globalThis.localStorage.getItem("chanlytics.surfaces.v2:harbor-moving"), "cached");
    switchWorkspace("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "glow-studio");
    assert.deepEqual(
      assigned,
      ["/w/glow-studio"],
      "one navigation, to the address the workspaces read would otherwise have corrected it to",
    );
    assert.equal(
      globalThis.localStorage.getItem("chanlytics.workspace"),
      "glow-studio",
      "and the home returns to the slug, not the id",
    );
    assert.equal(
      globalThis.localStorage.getItem("chanlytics.surfaces.v2:harbor-moving"),
      null,
      "the cache cleared before it left",
    );
    // A read lands before the page unloads: the runner persists it, as it persists every read, and the hide writes it.
    cache.snapshotSurface("inbox", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", undefined, "inbox");
    cache.flushSurfaceCache();
    assert.equal(
      globalThis.localStorage.getItem("chanlytics.surfaces.v2:harbor-moving"),
      null,
      "REGRESSION: the workspace left had its rows written back into the tab it was leaving (the sign-out's defect 52)",
    );
  } finally {
    Object.assign(globalThis, saved);
  }
});

test("the cache is keyed on the ACTIVE workspace", () => {
  // Keyed on the list's first workspace this was constant for a member of two workspaces,
  // so the guard against restoring one tenant's rows under another's name could
  // never fire — the exact case it exists for. The one the server resolved is who.ts's.
  assert.match(runner, /const viewedWorkspace = \(\) => whoIsLooking\(\)\.activeWorkspaceId;/);
});

/* ---------------- the checks every mutation should pass ------------------- */
// Run since 26 Nov 2026; until then this block read with-route.ts, request-guards.ts, verbs.ts, core reply.ts and the
// reply route as text. Two are run elsewhere, as they were said here:
//   - a cross-site write is refused before anything reads the database: auth/bearer.test.mjs ("without a bearer the
//     cookie's path is taken: a cross-site POST is refused before any session is read"), a 403 with the verifier never
//     asked;
//   - template params come from config, never from the browser: conversations/reply/core-reply.test.mjs ("outside the
//     window ... the params are the workspace's facts, never the client's").

const NEXT = createRequire(path.join(ROOT, "apps/dashboard/package.json"));
const { workAsyncStorage } = NEXT("next/dist/server/app-render/work-async-storage.external");
/** A browser with no session cookie: Next's request store answers cookies() with none. */
const withNoCookie = (fn) => workAsyncStorage.run({ route: "/api/v1/probe", forceStatic: true }, fn);
const crossSite = (method) =>
  new Request("http://localhost/api/v1/probe", {
    method,
    headers: { "sec-fetch-site": "cross-site" },
    ...(method === "POST" ? { body: "{}" } : {}),
  });

test("reads stay exempt from the origin check", async () => {
  // A GET changes nothing, and cross-site GETs are how link previews and prefetches legitimately arrive: one is asked who
  // is signed in (no one, here: 401), never refused for where it came from. A POST from the same page is refused first.
  const ran = [];
  const probe = withRoute(async () => ran.push("handler"));
  const answer = async (method) => {
    const res = await withNoCookie(() => probe(crossSite(method), { params: Promise.resolve({}) }));
    const body = method === "HEAD" ? null : await res.json();
    return [res.status, body?.error?.code ?? null];
  };
  assert.deepEqual(await answer("GET"), [401, "unauthorized"], "a cross-site read goes on to the session");
  assert.equal((await answer("HEAD"))[0], 401, "and so does a HEAD");
  assert.deepEqual(await answer("POST"), [403, "forbidden"], "a cross-site write does not");
  assert.deepEqual(ran, [], "and none reached the handler");
});

test("a malformed id is a 404, not a 500", async () => {
  // PostgREST answers 22P02 for a bad uuid, which withRoute turns into "Something went wrong" -- a typo in a URL reading
  // as a server fault. Checked once at the chokepoint, each scope's loader, before anything reads the database. A
  // playbook's loader says "campaign", the word its reader reads (decision 19 of 9 Oct 2026).
  const { requireUuid } = await import(at("apps/dashboard/src/server/shared/request-guards.ts"));
  assert.throws(() => requireUuid("not-a-uuid", "conversation"), refusedAs("not_found", 404));
  assert.equal(requireUuid(HARBOR, "conversation"), HARBOR);
  const verbs = await import(at("apps/dashboard/src/server/shared/verbs.ts"));
  const untouched = new Proxy(
    {},
    {
      get: (_, k) => {
        throw new Error(`the database was asked (${String(k)}) before the id was checked`);
      },
    },
  );
  const ctx = { ...memberOfTwo(), supabase: untouched };
  for (const [scope, what] of [
    ["conversationScope", "conversation"],
    ["contactScope", "contact"],
    ["messageScope", "message"],
    ["callScope", "call"],
    ["listScope", "list"],
    ["broadcastScope", "broadcast"],
    ["templateScope", "template"],
    ["playbookScope", "campaign"],
  ])
    await assert.rejects(verbs[scope].load(ctx, { id: "not-a-uuid" }), (e) => {
      assert.deepEqual([e.code, e.status, e.message], ["not_found", 404, `That ${what} does not exist.`], scope);
      return true;
    });
});

test("the reply body is validated at the door", async () => {
  // The one route that reaches a real person took whatever the body held. An over-length reply was stored, reported
  // queued, and failed 15 seconds later as an escalation plus an alert email. Each wire's own limit is the verb's now,
  // asked before anything is queued (core-reply.test.mjs runs a 4097-character WhatsApp reply); the door bounds what any
  // wire could take. What the route declares it takes is what route() parses before its handler runs.
  const { REPLY_MAX_ANY } = await import("@chanlytics/contracts");
  const reply = await import(at("apps/dashboard/app/api/v1/conversations/[id]/reply/route.ts"));
  const takes = (body) => reply.POST.input.safeParse(body).success;
  assert.ok(takes({ text: "x".repeat(REPLY_MAX_ANY) }), "the longest any channel carries");
  assert.ok(!takes({ text: "x".repeat(REPLY_MAX_ANY + 1) }), "one character more is refused at the door");
  assert.ok(!takes({ text: "hi", tenant_id: STRANGER }), "a field the door does not take is refused, not ignored");
  assert.ok(!takes({ template: { name: "reservar_ahora", language: "en_US", link: "https://elsewhere.example" } }));
  assert.ok(takes({ template: { name: "reservar_ahora", language: "en_US", params: ["kept for an older client"] } }));
});
