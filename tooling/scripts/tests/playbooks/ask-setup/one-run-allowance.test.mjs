/**
 * The month's allowance is held against ONE run of a campaign, by one rule, wherever it is said before a campaign starts:
 * Ask's campaign card counts it (contracts heldBackOfOneRun), as the playbook composer's To row did until it went with
 * its Every time (the closed-loop audit of 17 Oct 2026, G).
 * A run reaches at most its cap, the longest unheard first, each person once, on the first channel that can reach them
 * (contracts playbookRunReach), so how many of one run go by email is not how many of everyone the moment reaches do.
 *
 * - The composer said the allowance over everyone the moment reaches today, before the cap, and the card over one run at
 *   its cap: a win-back reaching eight, four of them by email, with one email left this month, read "3 held back" in the
 *   composer and "2 held back" on the card. GET playbooks now answers one run's split at each cap the composer offers
 *   (`run_split`, counted in the pools' own pass), the card counts its own cap from the same draw, and both say it in
 *   contracts' one sentence (allowanceBeforeSend).
 * - The card drew with nobody touched this week, while the pools hold whoever any campaign reached in the week (the week's
 *   breath): its count was larger than the page's. It reads the week's touches as the pools read them.
 *
 * One world, a fake database: the card's tool reads it, GET playbooks' and GET templates' readers read it, and the surface
 * the bridge builds from those answers is the one the page reads. The rows are
 * tooling/scripts/tests/playbooks/ask-setup/twins-and-allowance.test.mjs's.
 */
import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact } from "../../_legacy-react.mjs";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const k of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const SRC = "apps/dashboard/src";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const TZ = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");
const DAY = 86_400_000;
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();

// The page's window is the stub React's (window IS globalThis), with the workspace in it, as the shell publishes it.
installLegacyReact({
  location: {
    pathname: "/w/harbor/",
    hash: "#/campaigns",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __WORKSPACES: [{ id: A, slug: "harbor", name: "Harbor", status: "active", timezone: TZ }],
  __ACTIVE_WORKSPACE: A,
  __DEMO_MODE: false,
  setInterval: () => 1,
  clearInterval() {},
});
const { installClock } = await import(at(`${SRC}/legacy-bridge/zone.ts`));
installClock();

const { buildProposal, newToolContext } = await import(at(`${SRC}/server/ask/tools/index.ts`));
const { load, readerCache, readerContext } = await import(at(`${SRC}/server/readers/index.ts`));
const { playbooks: playbooksReader } = await import(at(`${SRC}/server/readers/playbooks.ts`));
const { templates: templatesReader } = await import(at(`${SRC}/server/readers/templates.ts`));
const { emailWire } = await import(at(`${SRC}/server/connections/email-readiness.ts`));
const { setServiceClient } = await import(at(`${SRC}/server/service-db.ts`));
const { playbooksOverride } = await import(at(`${SRC}/surfaces/campaigns/playbooks/surface.ts`));
const { setSurfaceValue, surfaceValue } = await import(at(`${SRC}/surfaces/surface-values.ts`));

/** The month's offer (marketing), with an email version: an offer by email, which the month's allowance meters. */
const OFFER = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
const MOMENT = "everyone_monthly";

/** A person: a number and a yes to offers on WhatsApp, an address and a yes to offers by email. */
const row = (n, over = {}) => ({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${n}`,
  display_name: `Person ${n}`,
  wa_profile_name: null,
  phone_e164: `+1555010${n}00`,
  email: `p${n}@example.com`,
  email_suppressed_at: null,
  email_marketing: "opted_in",
  consent: "opted_in",
  consent_source: "keyword",
  consent_updated_at: ago(40 * DAY),
  marketing_consent: "opted_in",
  marketing_consent_source: "customer_message",
  marketing_consent_updated_at: ago(40 * DAY),
  consent_channels: ["whatsapp", "sms"],
  marketing_channels: ["whatsapp"],
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 1,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${n}`,
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: ago(10 * DAY),
  last_message_direction: "inbound",
  last_message_sender: "client",
  last_inbound_text: "hi",
  last_inbound_at: ago(40 * DAY),
  last_wrote_at: ago(40 * DAY),
  last_inbound_channel: null,
  last_call_at: null,
  last_outbound_call_at: null,
  last_inbound_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: ago(200 * DAY),
  earliest_row_at: ago(200 * DAY),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  created_at: ago(200 * DAY),
  // The longest unheard first: person 1 last heard from 100 days ago, person 8 sixty-five.
  last_message_at: ago((105 - 5 * n) * DAY),
  ...over,
});
/** Reached by email: an address and no number, so WhatsApp cannot reach them. */
const byEmail = (n) => row(n, { phone_e164: null });
/**
 * Eight people, in the order a run takes them (the longest unheard first): email, email, WhatsApp, email, WhatsApp,
 * WhatsApp, email, WhatsApp. Everyone the moment reaches: four by email. One run of five: three by email.
 */
const PEOPLE = [byEmail(1), byEmail(2), row(3), byEmail(4), row(5), row(6), byEmail(7), row(8)];

const template = (id, name, over = {}) => ({
  id,
  tenant_id: A,
  channel: "whatsapp",
  name,
  language: "en",
  meta_status: "approved",
  category: "marketing",
  variables: [],
  body_preview: "This month: 20% off.",
  hidden_at: null,
  components: null,
  ...over,
});

/** Two runs of other campaigns this week, as touchesSince reads them: whom the week's breath holds. */
const touched = (people) => ({
  broadcasts: people.map((p, i) => ({
    id: `eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee${i}`,
    tenant_id: A,
    playbook_id: null,
    state: "sent",
    scheduled_for: null,
    created_at: ago(2 * DAY),
    run_for: null,
    params: [],
  })),
  broadcast_recipients: people.map((p, i) => ({
    broadcast_id: `eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee${i}`,
    tenant_id: A,
    contact_id: p.id,
    sent_at: ago(2 * DAY),
    state: "sent",
    facts: null,
  })),
});

const tables = (over = {}) => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  tenants: [{ id: A, name: "Harbor", timezone: TZ, sells_by: null }],
  tenant_config: [
    {
      tenant_id: A,
      config: {
        brain: {
          business_name: "Harbor Studio",
          system_prompt: "Answer as the front desk of Harbor Studio: brief and warm.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
          profile: { address: "12 Main St, Springfield" },
        },
      },
      version: 1,
    },
  ],
  tenant_channels: [
    {
      tenant_id: A,
      kind: "whatsapp",
      status: "active",
      config: { quality_rating: "GREEN", messaging_limit: "TIER_1K" },
    },
  ],
  lines: [],
  mailboxes: [{ tenant_id: A, local_part: "harbor" }],
  policies: [],
  templates: [
    template(OFFER, "month_offer"),
    {
      ...template("ffffffff-ffff-4fff-8fff-fffffffff2a0", "month_offer", { channel: "email", category: null }),
      components: { subject: "This month", body: "This month: 20% off." },
    },
  ],
  contacts: PEOPLE.map((p) => ({ id: p.id, tenant_id: A, erased_at: null, display_name: p.display_name })),
  segments: [],
  segment_members: [],
  playbooks: [],
  deals: [],
  events: [],
  contact_identities: [],
  broadcasts: [],
  broadcast_recipients: [],
  ...over,
});

/** What the edge answers about its email wire: the deployment sends, and the campaigns domain is verified (offers by email). */
const EDGE = { ok: true, ready: true, offers: true };
/** What the dashboard's routes answer the page in this world (set by worldOf), by path. */
let routes = {};
const real = globalThis.fetch;
beforeEach(async () => {
  readerCache.clear();
  globalThis.fetch = async (url) => {
    const p = new URL(String(url), "https://app.chanlytics.com").pathname;
    const body = p.startsWith("/api/v1/") ? { ok: true, data: routes[p] ?? {} } : EDGE;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  await emailWire({ fresh: true });
});
after(() => (globalThis.fetch = real));
afterEach(() => setServiceClient(null));

/**
 * One world: the database, the month's emails already sent, and what the dashboard answers the page from it (GET
 * playbooks and GET templates by their own readers, as their routes do). `answer` changes the GET playbooks answer the page
 * reads (an older server's), never the database. The page's messages are the settings read's, the one read of the templates
 * (offered-templates.ts): the templates reader's rows are published as Settings publishes the ones it reads (WhatsApp's, the
 * email and text versions, and the messages made of all), and the surface is made of them.
 */
async function worldOf({ db = {}, emailsSent = 0, answer = (x) => x } = {}) {
  const rows = tables(db);
  setServiceClient(fakeDb(rows, {}, { campaign_month_sent: (a) => (a.p_channel === "email" ? emailsSent : 0) }));
  const supabase = fakeDb(rows, {}, { people_list: () => PEOPLE });
  const ctx = { supabase, userId: USER, email: "ada@example.com", params: {} };
  const rc = readerContext(ctx, { tenantId: A, role: "owner" }, NOW);
  const pb = JSON.parse(JSON.stringify((await load(rc, playbooksReader, undefined)).data));
  const tpl = JSON.parse(JSON.stringify((await load(rc, templatesReader, { all: false })).data));
  routes = {
    "/api/v1/playbooks": answer(pb),
    "/api/v1/channels": {
      channels: [{ kind: "whatsapp", status: "active", quality: "GREEN", messaging_limit: "TIER_1K" }],
    },
    "/api/v1/settings": { config: { brain: { business_name: "Harbor Studio" } }, version: 1 },
  };
  setSurfaceValue("settings", {
    templatesAll: tpl.templates.filter((t) => t.channel === "whatsapp"),
    templateVersions: tpl.templates.filter((t) => t.channel !== "whatsapp"),
    messages: tpl.messages,
  });
  await playbooksOverride.apply();
  readerCache.clear();
  return { ctx, pb, data: surfaceValue("playbooks") };
}

/** Ask's card for the same campaign: the month's offer by WhatsApp and email at the same cap. */
async function card(ctx, cap) {
  const t = newToolContext(ctx, A, "owner", TZ, NOW);
  const r = await buildProposal(t, "propose_sequence", {
    action: "moment",
    trigger: MOMENT,
    template_id: OFFER,
    params: [],
    channels: ["whatsapp", "email"],
    cap_per_run: cap,
  });
  assert.equal(r.isError, false, r.result);
  return r.proposal;
}

/** The sentence contracts says before a send, over a split, with one email left this month. */
const sentence = (email) =>
  contracts.allowanceBeforeSend(
    { email, sms: 0 },
    { email: contracts.CAMPAIGN_MONTH_ALLOWANCE.email - 1, sms: 0 },
    MOMENT,
    "marketing",
  );
/** A paused campaign on the moment, made at a cap of its own. */
const campaignAt = (cap) => ({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5",
  tenant_id: A,
  kind: "moment",
  name: "The month's offer",
  trigger: MOMENT,
  list_id: null,
  list_key: null,
  template_id: OFFER,
  template_name: "month_offer",
  template_language: "en",
  params: [],
  policy_class: "campaign",
  state: "paused",
  run_hour: 10,
  cap_per_run: cap,
  gap_days: 90,
  cadence_days: 30,
  created_at: "2026-09-01T00:00:00Z",
  channels: ["whatsapp", "email"],
});
/** A moment's count for WhatsApp and email together (an offer: texts carry none), as GET playbooks answers it. */
const pairOf = (pool) => pool.by.find((b) => b.channels.length === 2 && b.channels.includes("email"));

test("one world, a cap below the reach and two channels: the card says one run's held-back number, never everyone's", async () => {
  const { ctx, pb } = await worldOf({ emailsSent: contracts.CAMPAIGN_MONTH_ALLOWANCE.email - 1 });
  // Everyone the moment reaches now, before the cap: eight, four of them by email.
  assert.equal(pairOf(pb.pools[MOMENT]).candidates, 8);
  // One run of five takes three of them by email (GET playbooks' run_split, below).
  assert.equal(pairOf(pb.pools[MOMENT]).run_split[5].email, 3);
  // One run of five, the longest unheard first: three by email, and one email left this month holds back two.
  const one = sentence(3);
  assert.equal(one, "Only 1 email is left this month: 2 of these people will be held back.");
  const proposed = await card(ctx, 5);
  assert.ok(proposed.summary.includes(` · ${one} · `), proposed.summary);
  assert.doesNotMatch(proposed.summary, /3 of these people/);
});

test("a cap that covers everyone the moment reaches: one run is the whole split, on both", async () => {
  const { ctx } = await worldOf({ emailsSent: contracts.CAMPAIGN_MONTH_ALLOWANCE.email - 1 });
  const whole = sentence(4);
  assert.equal(whole, "Only 1 email is left this month: 3 of these people will be held back.");
  assert.ok((await card(ctx, 25)).summary.includes(` · ${whole} · `));
});

test("a month with room holds back nothing, on both", async () => {
  const { ctx } = await worldOf({ emailsSent: 0 });
  assert.doesNotMatch((await card(ctx, 5)).summary, /held back/);
});

test("GET playbooks counts one run's split at each cap the composer offers, in the pools' own pass, and only where it differs from the whole", async () => {
  const { pb } = await worldOf();
  const both = pairOf(pb.pools[MOMENT]);
  assert.deepEqual(both.channels, ["whatsapp", "email"]);
  // The caps below the eight it reaches, and nothing for the ones that reach everyone (their split is the whole).
  assert.deepEqual(both.run_split, { 5: { whatsapp: 2, sms: 0, email: 3 } });
  // WhatsApp alone carries one channel: its whole split is every run's, and nothing more is answered.
  assert.equal(pb.pools[MOMENT].run_split, undefined);
  // A campaign made at a cap the composer does not offer keeps its own among them (words.tsx pbWith): counted at it too.
  const own = await worldOf({ db: { playbooks: [campaignAt(7)] } });
  assert.deepEqual(Object.keys(pairOf(own.pb.pools[MOMENT]).run_split), ["5", "7"]);
  assert.deepEqual(pairOf(own.pb.pools[MOMENT]).run_split[7], { whatsapp: 3, sms: 0, email: 4 });
});

test("the week's breath: a person a campaign reached this week is held on the card as on the page, and the card's count is the page's", async () => {
  // Person 3 (WhatsApp) and person 4 (email) heard from another campaign two days ago.
  const { ctx, pb } = await worldOf({ db: touched([PEOPLE[2], PEOPLE[3]]) });
  const page = pairOf(pb.pools[MOMENT]);
  assert.equal(page.candidates, 6, "the page's pools hold them for the week's breath");
  assert.equal(page.held, 2);
  const proposed = await card(ctx, 25);
  assert.equal(proposed.payload.candidates, page.candidates, "the card's count is the page's");
  assert.equal(pb.pools[MOMENT].candidates, 3, "WhatsApp alone: four, one of them held");
});

test("the week's touches could not be read: the card declines in its words, and never counts without the week's breath", async () => {
  // The read the week's breath is made of (touchesSince, over every send of the week) fails; every other read answers.
  const rows = tables();
  setServiceClient(fakeDb(rows, {}, { campaign_month_sent: () => 0 }));
  const supabase = fakeDb(
    rows,
    { "sequence_batches.select": { message: "the read failed" } },
    { people_list: () => PEOPLE },
  );
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
  const r = await buildProposal(t, "propose_sequence", {
    action: "moment",
    trigger: MOMENT,
    template_id: OFFER,
    params: [],
    channels: ["whatsapp", "email"],
    cap_per_run: 5,
  });
  assert.equal(r.isError, true, "no card on a count the page would not make");
  assert.equal(JSON.parse(r.result).error, contracts.PLAYBOOK_CARD_REFUSALS.weekUnread);
  // Any message sent or due within a week of it holds a person, a member's own among them: the words say both sides, as
  // a broadcast's door says them (core createBroadcast), never "this week" and never "from a campaign".
  assert.match(
    contracts.PLAYBOOK_CARD_REFUSALS.weekUnread,
    /^who has had a message from you lately, or has one due, could not be read just now/,
  );
  assert.doesNotMatch(contracts.PLAYBOOK_CARD_REFUSALS.weekUnread, /this week/);
});

test("the autonomy modes could not be read: the card declines in its words, and never guesses its class's mode (a guess of ask under auto would drop the trial week)", async () => {
  // The read the class's mode is made of (the turn's policies) fails; every other read answers.
  const rows = tables({
    policies: [{ tenant_id: A, class: "campaign", mode: "auto", subject_type: null, limits: null }],
  });
  setServiceClient(fakeDb(rows, {}, { campaign_month_sent: () => 0 }));
  const supabase = fakeDb(rows, { "policies.select": { message: "the read failed" } }, { people_list: () => PEOPLE });
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
  const r = await buildProposal(t, "propose_sequence", {
    action: "moment",
    trigger: MOMENT,
    template_id: OFFER,
    params: [],
    channels: ["whatsapp", "email"],
    cap_per_run: 5,
  });
  assert.equal(r.isError, true, "no card that says a mode it does not know");
  assert.equal(r.proposal, null);
  assert.equal(JSON.parse(r.result).error, contracts.PLAYBOOK_CARD_REFUSALS.modeUnread);
  assert.equal(
    contracts.PLAYBOOK_CARD_REFUSALS.modeUnread,
    "the sending mode of this campaign's class could not be read just now, so the card cannot say what its runs would do; say so, and try again in a moment",
  );
});
