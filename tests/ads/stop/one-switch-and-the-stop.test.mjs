/**
 * The one switch that draws Ads, and AI's stop on the page's read (the Ads plan's 6.2 and G17), run on the dashboard's
 * own server code over a database in memory, with the edge's word answered where the edge would be.
 *
 * What must hold. Ads is drawn where the edge offers it in the workspace (its list, ADS_WORKSPACES), and where the
 * workspace holds an ad account whatever the list says now; nowhere else, and the old workspace flag draws nothing.
 * The settings read carries that one answer. The page's read says when AI was stopped, and while it is, a press that
 * would turn an ad back on is refused before the edge is asked anything; a pause still goes.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_URL = "https://edge.example.com";
// The edge is asked whether Ads is on here, as production asks it; the fetch below answers.
process.env.EDGE_PROVIDERS = "live";
for (const k of ["DIAG_KEY", "VERCEL_ENV"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readAdsShown } = await import(at("apps/dashboard/src/server/connections/ads-ready.ts"));
const { adsPage, aiStoppedAt } = await import(at("apps/dashboard/src/server/readers/ads-page.ts"));
const { pressAd } = await import(at("apps/dashboard/src/server/ads/presses.ts"));
const { readerContext, readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));

const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACCOUNT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const AD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TZ = "America/New_York";
const NOW = new Date("2026-11-20T15:00:00Z");
const STOPPED_AT = "2026-11-20T14:30:00.000Z";
const NO_COUNTS = { from: "2026-10-22", to: "2026-11-20", ads: [], unnamed: { people: 0, booked: 0 }, spend: [] };

/** What the edge says, and what was asked of it. */
let edge;
const real = globalThis.fetch;
beforeEach(() => {
  edge = { on: true, asked: [], press: { ok: true, outcome: "told", version: 4 } };
  readerCache.clear();
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    edge.asked.push(`${new URL(String(url)).pathname} ${body.op}`);
    const answer = String(url).endsWith("/api/admin/ads/press")
      ? edge.press
      : {
          ok: true,
          ready: true,
          on: edge.on,
          writes: "sandbox",
          app: { client_id: "1", config_id: "2", redirect_uri: "https://app.example.com/cb" },
        };
    return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
  };
});
after(() => {
  globalThis.fetch = real;
});

const account = (tenantId, status) => ({
  id: ACCOUNT,
  tenant_id: tenantId,
  platform: "meta",
  external_id: "1000000000000001",
  name: "Harbor ads",
  currency: "USD",
  timezone: TZ,
  status,
  standing: { account: "active", funding: "ok" },
  config: { page_name: "Harbor Studio", scopes: ["ads_read", "ads_management"] },
  connected_at: "2026-11-18T10:00:00Z",
  disconnected_at: status === "disconnected" ? "2026-11-19T10:00:00Z" : null,
  revoked_at: null,
  read_at: "2026-11-20T14:00:00Z",
  read_error: null,
});

const adRow = (tenantId) => ({
  id: AD,
  tenant_id: tenantId,
  account_id: ACCOUNT,
  platform: "meta",
  origin: "platform",
  door: "whatsapp",
  name: "Spring colour offer",
  platform_ad_id: "23850000000000071",
  status: "made",
  intent: "on",
  version: 3,
  intent_at: null,
  told_at: null,
  platform_state: "ACTIVE",
  platform_issue: null,
  ends_at: null,
  budget_kind: null,
  budget_minor: null,
  budget_left_minor: null,
  budget_shared: null,
  created_at: "2026-11-01T00:00:00Z",
});

/** A workspace no two tests share (the edge's word is kept by workspace a while), with an account as `status` says. */
let seat = 0;
function seated({ status = null, stopped = false, role = "owner", config = {} } = {}) {
  seat += 1;
  const tenantId = `aaaaaaaa-aaaa-4aaa-8aaa-${String(seat).padStart(12, "0")}`;
  const db = fakeDb(
    {
      memberships: [{ user_id: USER, tenant_id: tenantId, role, created_at: "2026-01-01T00:00:00Z" }],
      tenant_config: [
        {
          tenant_id: tenantId,
          version: 1,
          config: stopped ? { ...config, ask: { stopped: { at: STOPPED_AT, playbooks: [], reply: null } } } : config,
        },
      ],
      ad_accounts: status ? [account(tenantId, status)] : [],
      ads: status ? [adRow(tenantId)] : [],
    },
    {},
    { ads_page_counts: () => NO_COUNTS },
  );
  const ctx = { supabase: db, userId: USER, email: "ada@example.com", params: {} };
  return { tenantId, db, ctx, rc: readerContext(ctx, { tenantId, role }, NOW) };
}

test("Ads is drawn where the edge offers it, and where an ad account is held whatever the list says now", async () => {
  const listed = seated();
  assert.equal(await readAdsShown(listed.db, listed.tenantId), true, "on the edge's list, with no account held");
  edge.on = false;
  for (const [status, drawn] of [
    [null, false],
    ["choosing", false],
    ["connected", true],
    ["revoked", true],
    ["disconnected", true],
  ]) {
    const off = seated({ status });
    assert.equal(await readAdsShown(off.db, off.tenantId), drawn, `off the list, with ${status ?? "no"} account`);
  }
});

test("the old workspace flag draws nothing: the edge's word and the account are the whole answer", async () => {
  edge.on = false;
  const flagged = seated({ config: { features: { ads_preview: true } } });
  assert.equal(await readAdsShown(flagged.db, flagged.tenantId), false);
});

test("the page's read says when AI was stopped, and null while AI runs", async () => {
  const running = seated({ status: "connected" });
  assert.equal((await adsPage.read(running.rc)).data.stopped_at, null);
  const stopped = seated({ status: "connected", stopped: true });
  const read = (await adsPage.read(stopped.rc)).data;
  assert.equal(read.stopped_at, STOPPED_AT);
  assert.equal(read.ads.length, 1, "the ads are read as ever: what is on is the page's to say");
  // One reading of the stop: a config that cannot be read is no stop, and nothing is guessed.
  assert.equal(aiStoppedAt(null), null);
  assert.equal(aiStoppedAt({ ask: { stopped: null } }), null);
  assert.equal(aiStoppedAt("nonsense"), null);
});

test("while AI is stopped no ad is turned back on from here, before the edge is asked; a pause still goes", async () => {
  const stopped = seated({ status: "connected", stopped: true });
  const member = { tenantId: stopped.tenantId, role: "owner" };
  await assert.rejects(pressAd(stopped.ctx, member, { op: "resume", adId: AD, version: 3 }), (e) => {
    assert.equal(e.status, 409);
    assert.equal(e.message, "AI is stopped, so no ad is turned back on. Start AI again first.");
    return true;
  });
  assert.deepEqual(
    edge.asked.filter((one) => one.includes("press")),
    [],
    "the edge was asked nothing",
  );
  assert.deepEqual(await pressAd(stopped.ctx, member, { op: "pause", adId: AD, version: 3 }), {
    outcome: "told",
    version: 4,
  });
  assert.deepEqual(edge.asked, ["/api/admin/ads/press pause"]);
  // With AI running, turning back on goes to the edge as it did.
  const running = seated({ status: "connected" });
  await pressAd(running.ctx, { tenantId: running.tenantId, role: "owner" }, { op: "resume", adId: AD, version: 3 });
  assert.deepEqual(edge.asked.at(-1), "/api/admin/ads/press resume");
});
