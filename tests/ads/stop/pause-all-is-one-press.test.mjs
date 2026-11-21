/**
 * "Pause all" as one press (the Ads plan's G17: AI stopped with ads still on): the edge's `pause_all` (apps/edge/lib/ads/
 * press.ts runAdPress) over a database in memory whose door answers as 00671's does, and the dashboard's
 * press (server/ads/presses.ts pauseAllAds) over an edge that answers as that door does. A made-up business.
 *
 * What must hold. Every pause of the set is kept by the database's one door before the edge answers, and Meta is asked
 * nothing in the request: each pause Meta is to be told of goes at Meta's pace, by its account's read. Each ad says what
 * it came to: kept and on its way, paused already, or refused on its own (drawn from an old version). Nothing is kept
 * while the switch is off, for anyone but the owner, or of a set that is not one (no ad, an ad twice, a version that is
 * no version). Where the edge gave no answer, whether the pauses were kept is not known, and each ad says so; a refusal
 * of the whole is said in an owner's words.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

const ENV = ["ADS_WORKSPACES", "ADS_WRITES", "SUPABASE_URL"];
for (const k of ENV) delete process.env[k];
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_URL = "https://edge.example.com";
process.env.EDGE_PROVIDERS = "live";
for (const k of ["DIAG_KEY", "VERCEL_ENV"]) delete process.env[k];

const T = "abababab-7777-4000-8000-000000000001";
const U = "cdcdcdcd-7777-4000-8000-000000000001";
const ACCOUNT = "acacacac-7777-4000-8000-000000000001";
const AD = (n) => `adadadad-7777-4000-8000-00000000000${n}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { runAdPress } = await import(at("apps/edge/lib/ads/press.ts"));
const { pauseAllAds } = await import(at("apps/dashboard/src/server/ads/presses.ts"));

const auth = { ok: true, via: "token", workspace: T, user: U };

/* ---------------------------------------------------------------------------------------------------- the edge --- */

/** Meta, which the request must never reach: every ask is kept, to say none was made. */
const metaAsked = [];
/** What the stand-in edge answers the dashboard, and what it was sent. */
let edge = { answer: null, sent: [] };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  if (u.hostname === "edge.example.com") {
    edge.sent.push(JSON.parse(String(init?.body ?? "{}")));
    return edge.answer();
  }
  metaAsked.push(u.href);
  return new Response("{}", { status: 500 });
};
after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
});
beforeEach(() => {
  metaAsked.length = 0;
  edge = { answer: null, sent: [] };
});

/**
 * A workspace whose owner is U, one connected account and three ads of it: one running, one paused already, one running.
 * The doors answer as 00652's and 00671's do: each ad by its version, taken in the ads' own order, all or none.
 */
function world({ owner = true, door = true } = {}) {
  Object.assign(process.env, { ADS_WORKSPACES: T, ADS_WRITES: "live" });
  const ads = new Map(
    [
      [AD(1), { intent: "on", version: 3 }],
      [AD(2), { intent: "paused", version: 5 }],
      [AD(3), { intent: "on", version: 2 }],
    ].map(([id, row]) => [id, { ...row, intent_at: null, told_at: null }]),
  );
  const kept = { order: [], decisions: 0, tellAsks: [], calls: 0 };
  const setIntent = (adId, version) => {
    const row = ads.get(adId);
    if (!row) return { outcome: "not_found" };
    const pending = row.intent_at !== null && (row.told_at === null || row.told_at < row.intent_at);
    const facts = { account_id: ACCOUNT, platform_ad_id: `2385${adId.slice(-8)}` };
    if (row.intent === "paused") return { outcome: "same", version: row.version, pending, ...facts };
    if (row.version !== version) return { outcome: "stale", version: row.version };
    Object.assign(row, { intent: "paused", intent_at: new Date().toISOString(), version: row.version + 1 });
    kept.decisions += 1;
    return { outcome: "asked", version: row.version, tell: !pending, ...facts };
  };
  const rpcs = {
    has_permission: ({ p_permission }) => owner && p_permission === "ads",
    ad_tell_ask: ({ p_ad_id }) => kept.tellAsks.push(p_ad_id),
  };
  // A database before 00671 has no such function, and says so as PostgREST does.
  rpcs.ad_pause_all = !door
    ? () => {
        throw Object.assign(new Error("Could not find the function public.ad_pause_all"), { code: "PGRST202" });
      }
    : ({ p_actor, p_presses }) => {
        kept.calls += 1;
        if (!(owner && p_actor === U)) return { outcome: "not_allowed" };
        const sorted = [...p_presses].sort((one, other) => one.ad_id.localeCompare(other.ad_id));
        return {
          outcome: "kept",
          ads: sorted.map((press) => {
            kept.order.push(press.ad_id);
            const answer = setIntent(press.ad_id, press.version);
            if (answer.outcome === "asked" && answer.tell) rpcs.ad_tell_ask({ p_ad_id: press.ad_id });
            return { ...answer, ad_id: press.ad_id };
          }),
        };
      };
  setPg(fakeDb({ ad_accounts: [], ads: [] }, {}, rpcs));
  const pauseAll = (set, over = {}) =>
    runAdPress(auth, { op: "pause_all", tenant_id: T, user_id: U, ads: set, ...over });
  return { ads, kept, pauseAll };
}
const heard = async (res) => [res.status, await res.json()];

test("every pause of the set is kept in one call before the edge answers, and Meta is asked nothing", async () => {
  const w = world();
  const [status, body] = await heard(
    await w.pauseAll([
      { ad_id: AD(3), version: 2 },
      { ad_id: AD(1), version: 3 },
    ]),
  );
  assert.equal(status, 200);
  assert.deepEqual(body, {
    ok: true,
    outcome: "kept",
    ads: [
      { ad_id: AD(1), outcome: "soon", version: 4 },
      { ad_id: AD(3), outcome: "soon", version: 3 },
    ],
  });
  assert.equal(w.kept.calls, 1, "one call: one transaction");
  assert.deepEqual(w.kept.order, [AD(1), AD(3)], "in the ads' own order");
  assert.deepEqual(w.kept.tellAsks, [AD(1), AD(3)], "each told to Meta at its pace, by its account's read");
  assert.deepEqual(metaAsked, [], "and Meta is asked nothing in the request");
});

test("a set with one drawn from an old version and one paused already: each says what it came to, and the rest is kept", async () => {
  const w = world();
  const [, body] = await heard(
    await w.pauseAll([
      { ad_id: AD(1), version: 2 },
      { ad_id: AD(2), version: 5 },
      { ad_id: AD(3), version: 2 },
    ]),
  );
  assert.deepEqual(
    body.ads.map((one) => [one.ad_id, one.outcome]),
    [
      [AD(1), "stale"],
      [AD(2), "same"],
      [AD(3), "soon"],
    ],
  );
  assert.deepEqual([w.ads.get(AD(1)).intent, w.ads.get(AD(3)).intent], ["on", "paused"]);
  assert.deepEqual(w.kept.tellAsks, [AD(3)]);
});

test("nothing is kept while the switch is off, for anyone but the owner, or of a set that is not one", async () => {
  const off = world();
  delete process.env.ADS_WRITES;
  assert.equal((await heard(await off.pauseAll([{ ad_id: AD(1), version: 3 }])))[1].error, "ads_writes_off");
  assert.equal(off.kept.calls, 0);

  const stranger = world({ owner: false });
  const [status, body] = await heard(await stranger.pauseAll([{ ad_id: AD(1), version: 3 }]));
  assert.deepEqual([status, body.error], [403, "ad_account_not_owner"]);
  assert.equal(stranger.kept.calls, 0, "asked before anything is kept");

  const w = world();
  for (const set of [
    [],
    "every ad",
    [
      { ad_id: AD(1), version: 3 },
      { ad_id: AD(1), version: 3 },
    ],
    [{ ad_id: AD(1), version: 0 }],
    [{ ad_id: AD(1), version: 3.5 }],
    [{ ad_id: "not-an-ad", version: 3 }],
    Array.from({ length: 201 }, (_, n) => ({
      ad_id: `adadadad-7777-4000-8000-${String(n).padStart(12, "0")}`,
      version: 1,
    })),
  ]) {
    const [code, said] = await heard(await w.pauseAll(set));
    assert.deepEqual([code, said.error], [400, "bad_request"], JSON.stringify(set).slice(0, 80));
  }
  assert.deepEqual([w.kept.calls, w.ads.get(AD(1)).intent], [0, "on"]);
});

test("a database before the door says the press is not ready, and keeps nothing", async () => {
  const w = world({ door: false });
  const [status, body] = await heard(await w.pauseAll([{ ad_id: AD(1), version: 3 }]));
  assert.deepEqual([status, body.error], [503, "not_ready"]);
  assert.equal(w.ads.get(AD(1)).intent, "on");
});

/* ----------------------------------------------------------------------------------------------- the dashboard --- */

const ctx = { supabase: fakeDb({}), userId: U, email: "ada@example.com", params: {} };
const member = { tenantId: T, role: "owner" };
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("the dashboard hands the edge the set in one call and says what each ad came to, in the order asked", async () => {
  edge.answer = () =>
    json(200, {
      ok: true,
      outcome: "kept",
      ads: [
        { ad_id: AD(1), outcome: "stale", version: 4 },
        { ad_id: AD(3), outcome: "soon", version: 3 },
      ],
    });
  const answer = await pauseAllAds(ctx, member, [
    { id: AD(3), version: 2 },
    { id: AD(1), version: 3 },
    { id: AD(2), version: 5 },
  ]);
  assert.equal(edge.sent.length, 1, "one call");
  assert.deepEqual(edge.sent[0], {
    op: "pause_all",
    tenant_id: T,
    user_id: U,
    ads: [
      { ad_id: AD(3), version: 2 },
      { ad_id: AD(1), version: 3 },
      { ad_id: AD(2), version: 5 },
    ],
  });
  assert.deepEqual(answer.ads, [
    { id: AD(3), outcome: "soon", version: 3 },
    { id: AD(1), outcome: "stale", version: 4 },
    { id: AD(2), outcome: "unknown", version: null },
  ]);
});

test("where the edge gave no answer in time, whether the pauses were kept is not known, and each ad says so", async () => {
  edge.answer = () => {
    throw Object.assign(new Error("slow"), { name: "TimeoutError" });
  };
  const answer = await pauseAllAds(ctx, member, [
    { id: AD(1), version: 3 },
    { id: AD(3), version: 2 },
  ]);
  assert.deepEqual(
    answer.ads.map((one) => [one.id, one.outcome]),
    [
      [AD(1), "unknown"],
      [AD(3), "unknown"],
    ],
  );
});

test("a refusal of the whole is said in an owner's words, never a code", async () => {
  edge.answer = () => json(403, { ok: false, error: "ad_account_not_owner" });
  await assert.rejects(pauseAllAds(ctx, member, [{ id: AD(1), version: 3 }]), {
    message: "Only the owner can pause an ad or turn one back on.",
  });
  edge.answer = () => json(500, { ok: false, error: "internal" });
  await assert.rejects(pauseAllAds(ctx, member, [{ id: AD(1), version: 3 }]), {
    message: "Couldn't pause them just now. Nothing was changed. Try again.",
  });
});
