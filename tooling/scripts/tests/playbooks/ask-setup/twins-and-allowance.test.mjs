/**
 * A playbook card is held to the running ones (D9): a second on the same moment, list and message is refused in words,
 * unless they named it apart; and a playbook card going by email or text says what the month's allowance will hold back
 * (A7, contracts allowanceBeforeSend), read only where a metered channel is named. The world is
 * tooling/scripts/tests/broadcasts/ask-campaign-channels.test.mjs's, copied whole; the month's count is the service role's
 * function, answered here.
 */
import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const k of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { CAMPAIGN_MONTH_ALLOWANCE, SENDING_HOURS_WORDS, sendsWaitWords } = await import("@chanlytics/contracts");
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { emailWire } = await import(at("apps/dashboard/src/server/connections/email-readiness.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const TZ = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");
const DAY = 86_400_000;
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
/** A message about their visit (a utility: only the yes to messages is needed), and an offer (marketing). */
const REMINDER = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const OFFER = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";

const row = (id, over = {}) => ({
  id,
  display_name: `Person ${id.slice(-1)}`,
  wa_profile_name: null,
  phone_e164: `+1555010${id.slice(-1)}00`,
  email: `p${id.slice(-1)}@example.com`,
  email_suppressed_at: null,
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
  latest_conversation_id: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${id.slice(-1)}`,
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: ago(10 * DAY),
  last_message_at: ago(10 * DAY),
  last_message_direction: "inbound",
  last_message_sender: "client",
  last_inbound_text: "hi",
  last_inbound_at: ago(40 * DAY),
  // They wrote in their own words once (people_list's last_wrote_at): a relationship on record, which is what lets an email
  // the business chose to send reach a person with no yes covering email (decision D1). Not the card's subject here.
  last_wrote_at: ago(40 * DAY),
  last_inbound_channel: null,
  last_call_at: null,
  last_outbound_call_at: null,
  last_inbound_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: ago(60 * DAY),
  earliest_row_at: ago(60 * DAY),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  created_at: ago(60 * DAY),
  ...over,
});
/** Three people: a number and an address, an address and no number, a number and no address. */
const PEOPLE = [
  row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"),
  row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", { phone_e164: null }),
  row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", { email: null }),
];

const template = (id, name, over = {}) => ({
  id,
  tenant_id: A,
  channel: "whatsapp",
  name,
  language: "en",
  meta_status: "approved",
  category: "utility",
  variables: [],
  body_preview: "Your visit is tomorrow.",
  hidden_at: null,
  components: null,
  ...over,
});
/** The email and text versions of a message: a templates row of the same name and language beside the WhatsApp one. */
const version = (channel, name) => ({
  ...template(
    `ffffffff-ffff-4fff-8fff-ffffffff${channel === "sms" ? "f1" : "f2"}${name.length % 10}0`.slice(0, 36),
    name,
    {
      channel,
      category: null,
    },
  ),
  components: channel === "email" ? { subject: "Your visit", body: "Your visit is tomorrow." } : null,
});

const tables = (over = {}) => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  tenants: [{ id: A, name: "Harbor", timezone: TZ, sells_by: "proposal" }],
  // With its postal address: a broadcast's email is the business's news, an offer at the door, whose foot names it (decision D2).
  tenant_config: [
    {
      tenant_id: A,
      config: {
        brain: {
          business_name: "Harbor Moving",
          system_prompt: "Answer as the front desk of Harbor Moving: brief and warm.",
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
  lines: [
    {
      tenant_id: A,
      sms_state: "active",
      reg_mock: false,
      messaging_service_sid: "MG1",
      voice_state: "ok",
      created_at: "2026-09-01T00:00:00Z",
    },
  ],
  mailboxes: [{ tenant_id: A, local_part: "harbor" }],
  policies: [],
  templates: [
    template(REMINDER, "visit_reminder"),
    version("sms", "visit_reminder"),
    version("email", "visit_reminder"),
    template(OFFER, "month_offer", { category: "marketing", body_preview: "This month: 20% off." }),
    version("email", "month_offer"),
  ],
  contacts: PEOPLE.map((p) => ({ id: p.id, tenant_id: A, erased_at: null, display_name: p.display_name })),
  segments: [],
  segment_members: [],
  playbooks: [],
  deals: [],
  events: [],
  contact_identities: [],
  ...over,
});

/** What the edge answers about its email wire; an Error is a network that failed. */
const OPEN_EDGE = { status: 200, body: { ok: true, ready: true, offers: true } };
let edge;
const real = globalThis.fetch;
/** The edge answers `answer` from now on, and the dashboard's kept answer is the one it gives. */
const edgeSays = async (answer) => {
  edge = answer;
  await emailWire({ fresh: true });
};
beforeEach(async () => {
  readerCache.clear();
  globalThis.fetch = async () => {
    if (edge instanceof Error) throw edge;
    return new Response(JSON.stringify(edge.body), {
      status: edge.status,
      headers: { "content-type": "application/json" },
    });
  };
  // The deployment can send email, and the campaigns domain is verified: offers by email, and the business's own news with them
  // (decision D2), can go.
  await edgeSays(OPEN_EDGE);
});
after(() => (globalThis.fetch = real));
afterEach(() => setServiceClient(null));

const OFFER_PB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5";
/** A win-back by silence that runs on the month's offer message. */
const running = {
  id: OFFER_PB,
  tenant_id: A,
  kind: "moment",
  name: "Win-back",
  trigger: "quiet_30",
  list_id: null,
  list_key: null,
  template_id: OFFER,
  template_name: "month_offer",
  template_language: "en",
  params: [],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  created_at: "2026-09-01T00:00:00Z",
  channels: null,
};
/** The same three people, each with a yes to offers by email too (email keeps its own answer): who an offer by email reaches. */
const OFFERS_BY_EMAIL = PEOPLE.map((p) => ({ ...p, email_marketing: "opted_in" }));
/** `monthSent`: the month's count per channel, or a function of the call's arguments (its p_channel and p_at). */
const propose = (input, db = {}, monthSent = { email: 0, sms: 0 }, people = PEOPLE, now = NOW) => {
  const rows = tables(db);
  const count = typeof monthSent === "function" ? monthSent : (a) => monthSent[a.p_channel] ?? 0;
  setServiceClient(fakeDb(rows, {}, { campaign_month_sent: count }));
  const supabase = fakeDb(rows, {}, { people_list: () => people });
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, now);
  return buildProposal(t, "propose_campaign", input);
};
const said = (r) => JSON.parse(r.result).error;
const WIN_BACK = { action: "playbook", trigger: "quiet_30", template_id: OFFER, params: [] };

test("a running twin is refused in words; a second named apart is a card", async () => {
  const twin = await propose(WIN_BACK, { playbooks: [running] });
  assert.equal(twin.isError, true);
  assert.equal(
    said(twin),
    "“Win-back” already runs on this moment with this message: say so, and propose a second only when they ask for another by a name of its own",
  );
  assert.equal(said(await propose({ ...WIN_BACK, name: "Win-back" }, { playbooks: [running] })), said(twin));
  const apart = await propose({ ...WIN_BACK, name: "Win-back for past clients" }, { playbooks: [running] });
  assert.equal(apart.isError, false, apart.result);
  assert.match(apart.proposal.title, /^Campaign: /, "the word a person reads");
  // A paused one, another message or another list is no twin.
  const paused = await propose(WIN_BACK, { playbooks: [{ ...running, state: "paused" }] });
  assert.equal(paused.isError, false, paused.result);
  const other = await propose(WIN_BACK, { playbooks: [{ ...running, template_id: REMINDER }] });
  assert.equal(other.isError, false, other.result);
  const onList = await propose(WIN_BACK, { playbooks: [{ ...running, list_key: "opted_in" }] });
  assert.equal(onList.isError, false, onList.result);
});

test("a card by email says what the month's allowance holds back, and says nothing while there is room or where it goes by WhatsApp alone", async () => {
  const byEmail = { ...WIN_BACK, channels: ["whatsapp", "email"] };
  const full = await propose(byEmail, {}, { email: CAMPAIGN_MONTH_ALLOWANCE.email, sms: 0 }, OFFERS_BY_EMAIL);
  assert.equal(full.isError, false, full.result);
  assert.match(full.proposal.summary, /used up: .* held back/);
  const room = await propose(byEmail, {}, { email: 0, sms: 0 }, OFFERS_BY_EMAIL);
  assert.equal(room.isError, false, room.result);
  assert.doesNotMatch(room.proposal.summary, /held back/);
  const whatsapp = await propose(
    { ...WIN_BACK, channels: ["whatsapp"] },
    {},
    { email: CAMPAIGN_MONTH_ALLOWANCE.email, sms: 0 },
    OFFERS_BY_EMAIL,
  );
  assert.equal(whatsapp.isError, false, whatsapp.result);
  assert.doesNotMatch(whatsapp.proposal.summary, /held back/);
  // A run reaches at most its cap, so the allowance is held against one run of it, never everyone the moment names: two
  // people can be reached by email here, and a run of one holds back one.
  const usedUp = { email: CAMPAIGN_MONTH_ALLOWANCE.email, sms: 0 };
  const byEmailAlone = { ...WIN_BACK, channels: ["email"] };
  const uncapped = await propose(byEmailAlone, {}, usedUp, OFFERS_BY_EMAIL);
  assert.equal(uncapped.isError, false, uncapped.result);
  assert.match(uncapped.proposal.summary, /used up: 2 people will be held back/);
  const one = await propose({ ...byEmailAlone, cap_per_run: 1 }, {}, usedUp, OFFERS_BY_EMAIL);
  assert.equal(one.isError, false, one.result);
  assert.match(one.proposal.summary, /used up: 1 person will be held back/);
});

test("a broadcast card by email says what the month's allowance holds back, as the send screen does; by WhatsApp alone it reads no count", async () => {
  const broadcast = { action: "broadcast", template_id: OFFER, audience_kind: "everyone", params: [] };
  const byEmail = { ...broadcast, channels: ["whatsapp", "email"] };
  const full = await propose(byEmail, {}, { email: CAMPAIGN_MONTH_ALLOWANCE.email, sms: 0 }, OFFERS_BY_EMAIL);
  assert.equal(full.isError, false, full.result);
  assert.match(full.proposal.summary, /used up: .* held back/);
  const room = await propose(byEmail, {}, { email: 0, sms: 0 }, OFFERS_BY_EMAIL);
  assert.equal(room.isError, false, room.result);
  assert.doesNotMatch(room.proposal.summary, /held back/);
  const whatsapp = await propose(broadcast, {}, { email: CAMPAIGN_MONTH_ALLOWANCE.email, sms: 0 }, OFFERS_BY_EMAIL);
  assert.equal(whatsapp.isError, false, whatsapp.result);
  assert.doesNotMatch(whatsapp.proposal.summary, /held back/);
  // The month the send is set to go in, as the send screen counts it (contracts monthSentAt): September's emails are used
  // up and October's are not, so one set for the 20th is held back and one set for the 2nd of October is not.
  const september = (a) =>
    a.p_at?.startsWith("2026-09") && a.p_channel === "email" ? CAMPAIGN_MONTH_ALLOWANCE.email : 0;
  const soon = await propose(
    { ...byEmail, scheduled_for: "2026-09-20T10:00:00-04:00" },
    {},
    september,
    OFFERS_BY_EMAIL,
  );
  assert.equal(soon.isError, false, soon.result);
  assert.match(soon.proposal.summary, /used up: .* held back/);
  const later = await propose(
    { ...byEmail, scheduled_for: "2026-10-02T10:00:00-04:00" },
    {},
    september,
    OFFERS_BY_EMAIL,
  );
  assert.equal(later.isError, false, later.result);
  assert.doesNotMatch(later.proposal.summary, /held back/);
  // Counted at the moment it really goes, as the door counts it (core createBroadcast, nextOpenMoment), and in the
  // workspace's own month, as the database's count is: set for 10 PM on 30 September in New York, it moves to 9 AM on
  // 1 October, so September's used-up emails hold nobody back.
  const monthIn = (iso) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).format(new Date(iso));
  const septemberHere = (a) =>
    a.p_channel === "email" && monthIn(a.p_at ?? NOW.toISOString()) === "2026-09" ? CAMPAIGN_MONTH_ALLOWANCE.email : 0;
  const lateOnTheLast = await propose(
    { ...byEmail, scheduled_for: "2026-09-30T22:00:00-04:00" },
    {},
    septemberHere,
    OFFERS_BY_EMAIL,
  );
  assert.equal(lateOnTheLast.isError, false, lateOnTheLast.result);
  assert.doesNotMatch(lateOnTheLast.proposal.summary, /held back/, lateOnTheLast.proposal.summary);
  const lastAfternoon = await propose(
    { ...byEmail, scheduled_for: "2026-09-30T15:00:00-04:00" },
    {},
    septemberHere,
    OFFERS_BY_EMAIL,
  );
  assert.match(lastAfternoon.proposal.summary, /used up: .* held back/, "within the hours, it goes in September");
  // And the card says that moment, the one the allowance was counted for, and why it moved: never the 10 PM that will not
  // happen. One set within the hours goes when it was set, with no clause.
  const moved = ` · Oct 1 · 9:00 AM — ${sendsWaitWords()}: `;
  assert.equal(sendsWaitWords(), `sends wait for ${SENDING_HOURS_WORDS.range}`);
  assert.ok(lateOnTheLast.proposal.summary.includes(moved), lateOnTheLast.proposal.summary);
  assert.doesNotMatch(lateOnTheLast.proposal.summary, /10:00 PM/);
  assert.ok(lastAfternoon.proposal.summary.includes(" · Sep 30 · 3:00 PM: "), lastAfternoon.proposal.summary);
  assert.doesNotMatch(lastAfternoon.proposal.summary, /sends wait/);
});

test("a broadcast card asked for now outside the sending hours says when it really goes and why, never now", async () => {
  const now = { action: "broadcast", template_id: OFFER, audience_kind: "everyone", params: [] };
  // Monday 14 September, 11 PM in New York: it goes at nine the next morning.
  const late = await propose(now, {}, { email: 0, sms: 0 }, PEOPLE, new Date("2026-09-15T03:00:00Z"));
  assert.equal(late.isError, false, late.result);
  assert.ok(late.proposal.summary.includes(` · tomorrow 9:00 AM — ${sendsWaitWords()}: `), late.proposal.summary);
  assert.doesNotMatch(late.proposal.summary, / · now: /);
  // At ten in the morning it goes now, and says so.
  const open = await propose(now, {}, { email: 0, sms: 0 }, PEOPLE);
  assert.ok(open.proposal.summary.includes(" · now: "), open.proposal.summary);
});
