/**
 * A change to a running ad made here, as its routes answer it (apps/dashboard/src/server/ads/presses.ts changeAd: the
 * routes budget, end-date, area and end; decision 0050, Routes; the Ads plan's 4.5 and 5.2), and Fix it for one Meta
 * turned down (fix.ts fixAd), over a workspace in memory, with the edge a stubbed fetch that keeps what it is handed and
 * the model a stream handed in. Nothing reaches Meta: neither has a way to.
 *
 * What must hold. A change is judged before the edge is asked, by the one rule the drawer drew its press with, against
 * what Meta holds as the ad's row keeps it: a raise past the owner's most, under Meta's least, or whose most is not the
 * one the press named is refused in words, and so is a press drawn from a total changed in Meta since. One change at a
 * time; four amounts an hour; while AI is stopped a raise is refused. What the edge is handed is the ask, what Meta held
 * when it was drawn, and the most. Fix it asks AI to rewrite each version from Meta's words, keeps the ad as a draft with
 * AI's change made, and is refused for an ad Meta is not turning down.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-the-change";
process.env.EDGE_URL = "https://edge.example.com";
process.env.EDGE_PROVIDERS = "live";
for (const k of ["DIAG_KEY", "VERCEL_ENV"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { changeAd } = await import(at("apps/dashboard/src/server/ads/presses.ts"));
const { fixAd } = await import(at("apps/dashboard/src/server/ads/fix.ts"));
const { readerContext, readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { setModelStream } = await import(at("apps/dashboard/src/server/shared/model-json.ts"));
const { forgetFeeds } = await import(at("apps/dashboard/src/server/calendar/openings.ts"));

const USER = "b0b0b0b0-8888-4000-8000-000000000001";
const ACCOUNT = "c0c0c0c0-8888-4000-8000-000000000001";
const AD = "adadadad-8888-4000-8000-000000000001";
const PHOTO = "f0f0f0f0-8888-4000-8000-000000000001";
const TZ = "America/New_York";
const DAY = 86_400_000;

const VERSIONS = [
  { headline: "Lose weight fast", text: "Are you tired of your body? Message Harbor Studio on WhatsApp." },
  { headline: "Harbor Studio", text: "Do you hate how you look? A first visit takes 45 minutes." },
];
const APPROVED = {
  name: "First visit",
  service: "Consultation",
  picture: PHOTO,
  picture_kind: "photo",
  miles: 5,
  total_minor: 7000,
  most_minor: 7000,
  end_day: "2026-12-30",
  ends_at: "2026-12-31T04:59:00.000Z",
  versions: VERSIONS,
  address: "12 Harbor St, Miami",
  whatsapp: "+13055550142",
  declared: "none",
  currency: "USD",
  page_id: "2000000000000092",
  instagram: false,
};

function tablesOf(tenantId, over = {}) {
  const now = Date.now();
  return {
    memberships: [
      {
        user_id: USER,
        tenant_id: tenantId,
        role: "owner",
        tenants: { slug: "harbor" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    tenants: [
      { id: tenantId, name: "Harbor", timezone: TZ, appointment_word: "appointment", sending_stopped_at: null },
    ],
    tenant_config: [
      {
        tenant_id: tenantId,
        version: 1,
        config: {
          brain: {
            business_name: "Harbor Studio",
            system_prompt: "Answer as the front desk of Harbor Studio, warmly and in a few words.",
            fallbacks: { greeting: "g", error: "e", non_text: "n" },
            profile: {
              address: "12 Harbor St, Miami",
              services: [{ name: "Consultation", duration_min: 45 }],
              guardrails: { never_quote_prices: false },
            },
          },
          ...over.config,
        },
      },
    ],
    tenant_channels: [
      { id: "ch-wa", tenant_id: tenantId, kind: "whatsapp", status: "active", number_e164: "+13055550142", config: {} },
    ],
    ad_accounts: [
      {
        id: ACCOUNT,
        tenant_id: tenantId,
        platform: "meta",
        external_id: "1000000000000091",
        name: "Harbor ads",
        currency: "USD",
        timezone: TZ,
        status: "connected",
        standing: { account: "active", funding: "ok" },
        most_minor: null,
        config: {
          page_id: "2000000000000092",
          page_name: "Harbor Studio",
          min_daily_minor: 100,
          scopes: ["ads_read", "ads_management"],
        },
        connected_at: "2026-11-18T10:00:00Z",
        read_at: new Date(now - 60_000).toISOString(),
        read_error: null,
        ...over.account,
      },
    ],
    ads: [
      {
        id: AD,
        tenant_id: tenantId,
        account_id: ACCOUNT,
        platform: "meta",
        origin: "chanlytics",
        name: "First visit",
        door: "whatsapp",
        platform_ad_id: "23850000000000073",
        platform_set_id: "23850000000000071",
        platform_campaign_id: "23850000000000072",
        status: "made",
        intent: "on",
        version: 3,
        platform_state: "ACTIVE",
        platform_issue: null,
        budget_kind: "total",
        budget_minor: 7000,
        budget_left_minor: 5000,
        budget_shared: false,
        starts_at: new Date(now - 5 * DAY).toISOString(),
        ends_at: new Date(now + 9 * DAY).toISOString(),
        created_at: new Date(now - 5 * DAY).toISOString(),
        approved: APPROVED,
        change: null,
        amounts_at: null,
        ...over.ad,
      },
    ],
    files: [
      {
        id: PHOTO,
        tenant_id: tenantId,
        status: "filed",
        source: "upload",
        name: "front-desk",
        mime: "image/jpeg",
        kind: "image",
        bytes: 200_000,
        width: 1440,
        height: 1800,
        seconds: null,
        sound: null,
        look: { line: "The front desk.", people: { count: 0, recognizable: 0 }, issues: [] },
        look_status: "done",
        shows: "interior",
        who_in_it: "not_asked",
        removed_at: null,
        copy_state: "here",
        created_at: "2026-11-10T10:00:00Z",
        updated_at: "2026-11-10T10:00:00Z",
      },
    ],
    appointments: [],
    ad_drafts: [],
  };
}

/** What the edge's press door was handed, and how it answers. */
let handed;
let edgeSays;
const real = globalThis.fetch;
beforeEach(() => {
  handed = [];
  edgeSays = () => ({ status: 200, body: { ok: true, outcome: "told", version: 4 } });
  readerCache.clear();
  forgetFeeds();
  globalThis.fetch = async (url, init) => {
    const where = String(url);
    const json = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (where.endsWith("/api/admin/ads/account"))
      return json(200, {
        ok: true,
        ready: true,
        on: true,
        writes: "live",
        app: { client_id: "1", config_id: "2", redirect_uri: "https://app.example.com/cb" },
      });
    if (where.endsWith("/api/admin/ads/press")) {
      handed.push(JSON.parse(String(init?.body ?? "{}")));
      const said = edgeSays();
      return json(said.status, said.body);
    }
    throw new Error(`nothing else is reachable: ${where}`);
  };
});
after(() => {
  globalThis.fetch = real;
  setModelStream(null);
});

let seat = 0;
function workspace(over = {}, role = "owner") {
  seat += 1;
  const tenantId = `a0a0a0a0-8888-4000-8000-${String(seat).padStart(12, "0")}`;
  const tables = tablesOf(tenantId, over);
  const db = fakeDb(
    tables,
    {},
    {
      ads_page_counts: () => ({
        from: "2026-10-22",
        to: "2026-11-20",
        ads: [],
        unnamed: { people: 0, booked: 0 },
        spend: [],
      }),
      ad_draft_keep: ({ p_draft }) => {
        tables.ad_drafts.splice(0, tables.ad_drafts.length, {
          id: "d0d0d0d0-8888-4000-8000-000000000001",
          tenant_id: tenantId,
          account_id: ACCOUNT,
          draft: p_draft,
          kept_by: USER,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        return { kept: true };
      },
    },
  );
  const ctx = { supabase: db, userId: USER, email: "ada@example.com", params: {} };
  const member = { tenantId, role };
  return { tables, ctx, member, rc: readerContext(ctx, member) };
}
const refusal = async (pressed) => {
  try {
    await pressed;
  } catch (error) {
    return error.message;
  }
  return null;
};
const raise = (to = 9000, from = 7000) => ({
  adId: AD,
  version: 3,
  ask: { what: "total", total_minor: to },
  pressed: { from_minor: from, expect_max_minor: to },
});

test("a raise drawn from what Meta holds is handed to the edge with the most it names", async () => {
  const w = workspace();
  assert.deepEqual(await changeAd(w.ctx, w.member, raise()), { outcome: "told", version: 4 });
  assert.equal(handed.length, 1);
  assert.deepEqual(
    [handed[0].op, handed[0].ad_id, handed[0].version, handed[0].change],
    ["change", AD, 3, { what: "total", total_minor: 9000, from_minor: 7000, expect_max_minor: 9000 }],
  );
});

test("a raise past the owner's most, under Meta's least, or naming another most is refused in words, and the edge never asked", async () => {
  const capped = workspace({ account: { most_minor: 8000 } });
  assert.match(await refusal(changeAd(capped.ctx, capped.member, raise())), /more than the most you set for any ad/);
  const w = workspace();
  // $20 spent: Meta keeps a total of at least $22.
  assert.match(await refusal(changeAd(w.ctx, w.member, raise(2100))), /above what this ad has spent/);
  const named = { ...raise(), pressed: { from_minor: 7000, expect_max_minor: 8000 } };
  assert.match(await refusal(changeAd(w.ctx, w.member, named)), /changed since the page was read/);
  assert.deepEqual(handed, []);
});

test("a press drawn from a total or a last day changed in Meta since is refused: Meta's own is never put back", async () => {
  const w = workspace({ ad: { budget_minor: 8000, budget_left_minor: 6000 } });
  assert.match(await refusal(changeAd(w.ctx, w.member, raise(9000, 7000))), /changed since the page was read/);
  const later = new Date(Date.now() + 12 * DAY).toISOString().slice(0, 10);
  const moved = {
    adId: AD,
    version: 3,
    ask: { what: "end_day", end_day: later },
    pressed: { from_ends_at: "2026-11-30T04:59:00.000Z" },
  };
  assert.match(await refusal(changeAd(w.ctx, w.member, moved)), /changed since the page was read/);
  assert.deepEqual(handed, []);
});

test("what Meta holds already is the same press again, answered as itself, with nothing sent", async () => {
  const w = workspace({ ad: { budget_minor: 9000, budget_left_minor: 7000 } });
  assert.deepEqual(await changeAd(w.ctx, w.member, raise(9000, 7000)), { outcome: "same", version: 3 });
  assert.deepEqual(handed, []);
});

test("one change at a time, none while Meta hasn't said whether it took the last, and four amounts an hour", async () => {
  const onWay = workspace({ ad: { change: { what: "end_day", end_day: "2026-12-30", asked_at: "x" } } });
  assert.match(await refusal(changeAd(onWay.ctx, onWay.member, raise())), /Another change to this ad is on its way/);
  const unsure = workspace({ ad: { change: { what: "total", total_minor: 8000, sent_at: "x" } } });
  assert.match(await refusal(changeAd(unsure.ctx, unsure.member, raise())), /hasn't said yet whether it took/);
  const minutes = (n) => new Date(Date.now() - n * 60_000).toISOString();
  const four = workspace({ ad: { amounts_at: [minutes(40), minutes(30), minutes(20), minutes(10)] } });
  assert.match(await refusal(changeAd(four.ctx, four.member, raise())), /four changes of an amount an hour/);
  // Ending it takes the place of a change on its way.
  assert.deepEqual(await changeAd(onWay.ctx, onWay.member, { adId: AD, version: 3, ask: { what: "end" } }), {
    outcome: "told",
    version: 4,
  });
  assert.deepEqual(
    handed.map((one) => one.change.what),
    ["end"],
  );
});

test("while AI is stopped a raise is refused; a cut goes", async () => {
  const w = workspace({ config: { ask: { stopped: { at: "2026-11-21T10:00:00Z", playbooks: [], reply: null } } } });
  assert.match(await refusal(changeAd(w.ctx, w.member, raise())), /AI is stopped, so no ad is given more to spend/);
  const cut = { adId: AD, version: 3, ask: { what: "total", total_minor: 6000 }, pressed: { from_minor: 7000 } };
  assert.equal((await changeAd(w.ctx, w.member, cut)).outcome, "told");
  assert.deepEqual(handed[0].change, { what: "total", total_minor: 6000, from_minor: 7000 });
});

test("an ad made in Meta, or one ended, is not changed here", async () => {
  const inMeta = workspace({ ad: { origin: "platform" } });
  assert.match(await refusal(changeAd(inMeta.ctx, inMeta.member, raise())), /changed in Meta/);
  const ended = workspace({ ad: { intent: "ended" } });
  assert.match(await refusal(changeAd(ended.ctx, ended.member, raise())), /has ended/);
});

test("the edge's refusal is said in words: Meta's own in quotes where it refused", async () => {
  const w = workspace();
  edgeSays = () => ({
    status: 502,
    body: { ok: false, error: "meta_refused", detail: "The budget is too low for this schedule." },
  });
  assert.equal(
    await refusal(changeAd(w.ctx, w.member, raise())),
    "Meta didn't take the change: “The budget is too low for this schedule.” Nothing was changed.",
  );
  edgeSays = () => ({ status: 409, body: { ok: false, error: "ad_stale" } });
  assert.match(await refusal(changeAd(w.ctx, w.member, raise())), /changed since the page was read/);
});

/* ------------------------------------------------------------------------------------------------- Fix it */

/** The model, rewriting each version it is handed as its one version, and the questions it was asked. */
let questions;
const writerRewrites = () => {
  questions = [];
  setModelStream(async function* (call) {
    questions.push(JSON.stringify(call));
    const n = questions.length;
    const answer = {
      versions: [REWRITES[(n - 1) % REWRITES.length]],
      change: { kind: "words", service: "", miles: 0, place_kind: "none", place: "", within: "", amount: 0, end: "" },
      could_not: "",
      label: "",
    };
    yield { type: "text", index: 0, text: JSON.stringify(answer) };
    yield { type: "stop", stopReason: "end_turn" };
  });
};
/** What AI writes again, one version a call. */
const REWRITES = [
  {
    text: "A first visit at Harbor Studio takes 45 minutes. Message us on WhatsApp to pick a time.",
    headline: "First visit",
  },
  { text: "First visits at Harbor Studio take 45 minutes. Message us on WhatsApp.", headline: "Harbor Studio" },
];
const MET_SAID = "Your ad uses language that asserts or implies personal attributes.";

test("Fix it rewrites each version from Meta's own words and keeps the ad as a draft with AI's change made", async () => {
  writerRewrites();
  const w = workspace({ ad: { platform_state: "DISAPPROVED", platform_issue: MET_SAID } });
  assert.deepEqual(await fixAd({ rc: w.rc, userId: USER }, AD), { opened: "new_ad", versions: 2 });
  assert.equal(questions.length, 2, "one rewrite for each version, side by side");
  assert.ok(
    questions.every((one) => one.includes("personal attributes")),
    "each told Meta's own words",
  );
  const [kept] = w.tables.ad_drafts;
  assert.deepEqual(
    [kept.draft.service, kept.draft.picture, kept.draft.miles, kept.draft.total_minor, kept.draft.fixes],
    ["Consultation", PHOTO, 5, 7000, { id: AD, name: "First visit" }],
  );
  assert.equal(kept.draft.versions.length, 2);
  assert.ok(kept.draft.versions.every((one) => !/tired of your body|hate how you look/.test(one.text)));
  assert.deepEqual(handed, [], "and nothing is sent to Meta: Turn on on New ad does that");
});

test("Fix it is refused for an ad Meta isn't turning down, and while AI is stopped", async () => {
  writerRewrites();
  const running = workspace();
  assert.match(await refusal(fixAd({ rc: running.rc, userId: USER }, AD)), /nothing to fix/);
  const stopped = workspace({
    ad: { platform_state: "DISAPPROVED", platform_issue: MET_SAID },
    config: { ask: { stopped: { at: "2026-11-21T10:00:00Z", playbooks: [], reply: null } } },
  });
  assert.match(await refusal(fixAd({ rc: stopped.rc, userId: USER }, AD)), /AI is stopped/);
  assert.equal(questions.length, 0, "the writer is never asked");
});
