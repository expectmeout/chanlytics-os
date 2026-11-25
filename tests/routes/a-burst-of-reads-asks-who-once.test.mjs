/**
 * A burst of one session's reads asks who is asking once (server/shared/auth/burst.ts, with-route.ts; 25 Nov 2026).
 *
 * Every request to /api/v1 read the memberships before anything else, and a page load sends fourteen to twenty-seven
 * requests in the same second: on the night of 24 Nov 2026 one sign-in's 6,337 requests asked that one question 6,337
 * times (Supabase's gateway log), 12% of everything it asked the database. A read now shares the answer another read of
 * its session asked for inside two seconds, on the same instance. A write never does, and forgets what the reads held.
 *
 * Run over the store with a clock of its own, and through the real wrapper and a real route with a database in memory;
 * the session is a stand-in bearer verifier, as auth/bearer.test.mjs does it.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { burstsOf, BURST_MS } = await import(at("apps/dashboard/src/server/shared/auth/burst.ts"));
const { setBearerVerifier } = await import(at("apps/dashboard/src/server/shared/auth/bearer.ts"));
const { withRoute, getMemberContext, resetMembershipBursts } = await import(
  at("apps/dashboard/src/server/shared/with-route.ts")
);
const { getTenantFacts } = await import(at("apps/dashboard/src/server/shared/tenant.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const viewsRoute = await import(at("apps/dashboard/app/api/v1/views/route.ts"));

/* ------------------------------------------------------------ the store */

/** A store with a clock the test moves, and an `ask` that counts. */
function store() {
  let now = 1_000_000;
  let asked = 0;
  const bursts = burstsOf(() => now);
  return {
    bursts,
    ask: async () => `answer ${(asked += 1)}`,
    count: () => asked,
    pass: (ms) => (now += ms),
  };
}

test("reads of one session inside the burst share one answer, the one out now or one a moment old", async () => {
  const s = store();
  const [one, two] = await Promise.all([s.bursts.shared("ada", "s1", s.ask), s.bursts.shared("ada", "s1", s.ask)]);
  assert.deepEqual([one, two], ["answer 1", "answer 1"], "the one out now");
  s.pass(BURST_MS - 1);
  assert.equal(await s.bursts.shared("ada", "s1", s.ask), "answer 1", "and one begun inside the burst");
  assert.equal(s.count(), 1);
  s.pass(1);
  assert.equal(await s.bursts.shared("ada", "s1", s.ask), "answer 2", "two seconds on, the database is asked again");
  assert.equal(s.count(), 2);
});

test("by session, never by person: another sign-in asks for itself, and so does a request that names no session", async () => {
  const s = store();
  await s.bursts.shared("ada", "s1", s.ask);
  assert.equal(await s.bursts.shared("ada", "s2", s.ask), "answer 2", "her other sign-in");
  assert.equal(await s.bursts.shared("grace", "s1", s.ask), "answer 3", "another person");
  assert.equal(await s.bursts.shared("ada", undefined, s.ask), "answer 4", "a write, or a test's context");
  assert.equal(await s.bursts.shared("ada", undefined, s.ask), "answer 5", "every time");
  assert.equal(await s.bursts.shared("ada", "s1", s.ask), "answer 1", "and none of them took the burst's place");
});

test("a failure is nobody else's answer: the next read asks for itself", async () => {
  const s = store();
  let n = 0;
  const flaky = async () => {
    n += 1;
    if (n === 1) throw new Error("the database did not answer");
    return "the list";
  };
  await assert.rejects(s.bursts.shared("ada", "s1", flaky), /did not answer/);
  assert.equal(await s.bursts.shared("ada", "s1", flaky), "the list");
  assert.equal(n, 2);
});

test("a write of theirs lets go of every session of the person's", async () => {
  const s = store();
  await s.bursts.shared("ada", "s1", s.ask);
  await s.bursts.shared("ada", "s2", s.ask);
  await s.bursts.shared("grace", "s1", s.ask);
  s.bursts.forget("ada");
  assert.equal(await s.bursts.shared("ada", "s1", s.ask), "answer 4");
  assert.equal(await s.bursts.shared("ada", "s2", s.ask), "answer 5");
  assert.equal(await s.bursts.shared("grace", "s1", s.ask), "answer 3", "another person's is theirs");
});

test("an instance does not grow with everyone who ever asked: the expired are swept", async () => {
  const s = store();
  for (let i = 0; i < 2_100; i += 1) await s.bursts.shared(`p${i}`, "s", s.ask);
  s.pass(BURST_MS);
  // The next new session passes the mark again, and the sweep lets the old ones go: each of them asks afresh after it.
  await s.bursts.shared("someone-new", "s", s.ask);
  const before = s.count();
  await s.bursts.shared("p0", "s", s.ask);
  assert.equal(s.count(), before + 1);
});

/* ------------------------------------------------------------ through the wrapper */

const T = "11111111-1111-4111-8111-111111111111";
const tables = () => ({
  memberships: [
    {
      user_id: "u-1",
      tenant_id: T,
      role: "owner",
      views: { today: { band: "queue" } },
      tenants: { slug: "harbor", name: "Harbor", timezone: "America/New_York" },
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
  tenants: [{ id: T, slug: "harbor", name: "Harbor", timezone: "America/New_York" }],
});

const part = (v) => Buffer.from(v).toString("base64url");
const JWT = [part('{"alg":"ES256"}'), part('{"sub":"u-1"}'), part("signature-signature")].join(".");
const asked = (method = "GET") =>
  new Request("http://localhost/api/v1/views?workspace=harbor", {
    method,
    headers: { authorization: `Bearer ${JWT}`, origin: "http://localhost" },
  });
const NO_PARAMS = { params: Promise.resolve({}) };

/** Sign in as a session over a database in memory: every request of the test reads through `db`. */
function signedIn(claims = { session_id: "sess-1", aal: "aal1" }, db = fakeDb(tables())) {
  setBearerVerifier(async () => ({ supabase: db, claims: { sub: "u-1", ...claims }, error: null }));
  return db;
}
/** How many times the resolver's read of the memberships was sent (its columns name the workspace's row). */
const lookups = (db) =>
  db.seen.filter((q) => q.table === "memberships" && String(q.select ?? q.columns ?? "").includes("tenants")).length;

const realVerifier = setBearerVerifier(null);
after(() => setBearerVerifier(realVerifier));
beforeEach(() => {
  resetMembershipBursts();
  setRateStore(memoryStore());
});

test("five reads of a page load ask who is asking once, and each is answered as its own request is", async () => {
  const db = signedIn();
  const answers = await Promise.all(Array.from({ length: 5 }, () => viewsRoute.GET(asked(), NO_PARAMS)));
  for (const res of answers) {
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).data, { views: { today: { band: "queue" } } });
  }
  assert.equal(lookups(db), 1, "one read of the memberships for the five");
  await viewsRoute.GET(asked(), NO_PARAMS);
  assert.equal(lookups(db), 1, "and a sixth a moment later still shares it");
});

test("another sign-in of the same person, and the same one once its second factor is shown, ask for themselves", async () => {
  const db = fakeDb(tables());
  signedIn({ session_id: "sess-1", aal: "aal1" }, db);
  await viewsRoute.GET(asked(), NO_PARAMS);
  signedIn({ session_id: "sess-2", aal: "aal1" }, db);
  await viewsRoute.GET(asked(), NO_PARAMS);
  assert.equal(lookups(db), 2, "her other sign-in");
  signedIn({ session_id: "sess-1", aal: "aal2" }, db);
  await viewsRoute.GET(asked(), NO_PARAMS);
  assert.equal(lookups(db), 3, "the same session, signed in further");
  signedIn({ aal: "aal1" }, db);
  await viewsRoute.GET(asked(), NO_PARAMS);
  await viewsRoute.GET(asked(), NO_PARAMS);
  assert.equal(lookups(db), 5, "a token that names no session shares nothing");
});

test("a write reads who is asking for itself, and the read after it asks again", async () => {
  const db = signedIn();
  await viewsRoute.GET(asked(), NO_PARAMS);
  assert.equal(lookups(db), 1);
  // Any write through the wrapper: it resolves the workspace as a write's pipeline does.
  const write = withRoute(async (_req, ctx) => {
    assert.equal(ctx.burst, undefined, "a write is handed no burst");
    return getMemberContext(ctx, "harbor");
  });
  assert.equal((await write(asked("POST"), NO_PARAMS)).status, 200);
  assert.equal(lookups(db), 2, "the write's own read");
  await viewsRoute.GET(asked(), NO_PARAMS);
  assert.equal(lookups(db), 3, "what the reads held was let go: a change it made is seen");
  await viewsRoute.GET(asked(), NO_PARAMS);
  assert.equal(lookups(db), 3, "and the reads share again from there");
});

test("a write that fails forgets too, and a read of the memberships that failed is not shared", async () => {
  const db = signedIn();
  await viewsRoute.GET(asked(), NO_PARAMS);
  const failing = withRoute(async () => {
    throw new Error("the write did not land");
  });
  assert.equal((await failing(asked("POST"), NO_PARAMS)).status, 500);
  await viewsRoute.GET(asked(), NO_PARAMS);
  assert.equal(lookups(db), 2, "it may have changed something before it failed");

  resetMembershipBursts();
  const broken = signedIn(undefined, fakeDb(tables(), { "memberships.select": { message: "upstream" } }));
  assert.equal((await viewsRoute.GET(asked(), NO_PARAMS)).status >= 500, true);
  const mended = signedIn();
  assert.equal((await viewsRoute.GET(asked(), NO_PARAMS)).status, 200, "the next read asked for itself");
  assert.equal(lookups(mended), 1);
  assert.ok(lookups(broken) >= 0);
});

test("only a read through its route shares: any other caller, and a context with no session, reads the memberships", async () => {
  const db = fakeDb(tables());
  const ctx = { supabase: db, userId: "u-1", email: "ada@example.com", params: {}, burst: "sess-1|aal1" };
  await getMemberContext(ctx, "harbor", { burst: true });
  await getMemberContext(ctx, "harbor", { burst: true });
  assert.equal(lookups(db), 1, "a route's read");
  await getMemberContext(ctx, "harbor");
  await getMemberContext(ctx, "harbor", { defaultAllowed: true });
  assert.equal(lookups(db), 3, "who is looking (GET workspaces) and the doors that resolve for themselves always read");
  const bare = { supabase: db, userId: "u-1", email: "ada@example.com", params: {} };
  await getMemberContext(bare, "harbor", { burst: true });
  await getMemberContext(bare, "harbor", { burst: true });
  assert.equal(lookups(db), 5, "a context that names no session (a test's, a write's) shares none");
});

test("beneath a read, the workspace's name and clock are answered from who is asking; beneath a write they are read", async () => {
  const db = fakeDb(tables());
  const reading = { supabase: db, userId: "u-1", email: "ada@example.com", params: {}, burst: "sess-1|aal1" };
  const member = await getMemberContext(reading, "harbor", { burst: true });
  const before = db.seen.length;
  assert.deepEqual(await getTenantFacts(db, member.tenantId), { name: "Harbor", timezone: "America/New_York" });
  assert.equal(db.seen.length, before, "no call: the membership's row carried them");

  const other = fakeDb(tables());
  const writing = { supabase: other, userId: "u-1", email: "ada@example.com", params: {} };
  const writer = await getMemberContext(writing, "harbor");
  const asked2 = other.seen.length;
  assert.deepEqual(await getTenantFacts(other, writer.tenantId), { name: "Harbor", timezone: "America/New_York" });
  assert.equal(other.seen.length, asked2 + 1, "a write may change them: what it reads after is the database's to say");
});
