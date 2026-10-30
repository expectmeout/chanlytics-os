/**
 * A new campaign's card is made only where it could reach someone, and says what it does in one plain line (the 30 Oct
 * 2026 review of the live app, item 6). On production Today's "Ask found 3" was three campaign cards, each one run-on
 * paragraph of its rules, "0 people on the list said yes to messages" and "WhatsApp waits: Meta reports a problem with
 * the payment method…" in the middle of each, with Approve under it. Now: where nobody could ever be sent it (nobody said
 * the yes it needs, no channel it goes by can carry it, nobody to send to), no card is made, and the model is told what
 * stops it in the owner's words and where that is fixed; where it could, the card carries one line (what, to whom, when,
 * how) and its sheet says the rest in the owner's words, a day with nobody on it said as such. The real act runs over the
 * world tooling/scripts/tests/playbooks/ask-setup/starter-card.test.mjs builds, copied whole as that file copies its own.
 */
import { test, beforeEach, after } from "node:test";
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
const {
  FIX_CARD_WORDS,
  PLAYBOOK_CARD_REFUSALS,
  PLAYBOOK_CARD_WORDS,
  PROPOSAL_SPECS,
  appointmentWordOf,
  campaignBlockWords,
  campaignLine,
  campaignReachable,
  readyOrWhatsApp,
} = await import("@chanlytics/contracts");
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { emailWire } = await import(at("apps/dashboard/src/server/connections/email-readiness.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const TZ = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");
const DAY = 86_400_000;
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
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
  last_message_at: ago(40 * DAY),
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
  first_contact_at: ago(60 * DAY),
  earliest_row_at: ago(60 * DAY),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  created_at: ago(60 * DAY),
  ...over,
});
const IDS = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"];
/** Two people who said yes to messages and to offers, each with a number and an address. */
const SAID_YES = IDS.map((id) => row(id));
/**
 * The same two as a list of contacts brought in from an address book: a number and an address each, a yes to messages,
 * and no word about offers on any channel, nor a line of their own on record (an offer by email rests on one, D1).
 */
const NO_OFFERS_YES = IDS.map((id) =>
  row(id, {
    marketing_consent: "unknown",
    marketing_consent_source: null,
    marketing_consent_updated_at: null,
    marketing_channels: [],
    last_wrote_at: null,
  }),
);

const template = (id, name, over = {}) => ({
  id,
  tenant_id: A,
  channel: "whatsapp",
  name,
  language: "en",
  meta_status: "approved",
  category: "utility",
  variables: [],
  body_preview: "This month: 20% off.",
  hidden_at: null,
  components: null,
  ...over,
});

/** WhatsApp's number as Meta keeps it: green, or with the account's payment method failing (Connections' "Payment needed"). */
const whatsapp = (standing = null) => [
  {
    tenant_id: A,
    kind: "whatsapp",
    status: "active",
    config: { quality_rating: "GREEN", messaging_limit: "TIER_1K", ...(standing ? { standing } : {}) },
  },
];
const PAYMENT_FAILING = {
  can_send: "AVAILABLE",
  problems: [{ entity: "WABA", code: 131042, said: "There is an error with the payment method.", fix: null }],
  notes: [],
  has_payment_method: true,
  owner_business_id: "1234567890",
  waba_id: "9876543210",
};

const tables = (over = {}) => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  tenants: [{ id: A, name: "Harbor", timezone: TZ, appointment_word: "meeting" }],
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
  tenant_channels: whatsapp(),
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
  templates: [],
  segments: [],
  segment_members: [],
  playbooks: [],
  deals: [],
  events: [],
  contact_identities: [],
  ...over,
});

/** The workspace's settings with a calendar connected (the feed's address on file). */
const withCalendar = () => {
  const [r] = tables().tenant_config;
  return [{ ...r, config: { ...r.config, calendar: { ical_url: "https://calendar.example/harbor.ics" } } }];
};

const OPEN_EDGE = { status: 200, body: { ok: true, ready: true, offers: true } };
const real = globalThis.fetch;
beforeEach(async () => {
  readerCache.clear();
  globalThis.fetch = async () =>
    new Response(JSON.stringify(OPEN_EDGE.body), { status: 200, headers: { "content-type": "application/json" } });
  await emailWire({ fresh: true });
});
after(() => (globalThis.fetch = real));

const propose = (input, db = {}, people = SAID_YES) => {
  const rows = tables(db);
  rows.contacts = people.map((p) => ({ id: p.id, tenant_id: A, erased_at: null, display_name: p.display_name }));
  const supabase = fakeDb(rows, {}, { people_list: () => people });
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
  return { made: buildProposal(t, "propose_sequence", { action: "moment", ...input }), rows };
};
const said = (r) => JSON.parse(r.result).error;
const word = appointmentWordOf("meeting");

/** What a card the owner presses nothing but its door on holds: its kind, words and door; and that it commits nothing. */
const fixOf = (r) => {
  assert.equal(r.isError, false, r.result);
  const p = r.proposal;
  assert.deepEqual(
    PROPOSAL_SPECS.fix.commit(p, { settings: null }),
    { refused: FIX_CARD_WORDS.nothingToApprove },
    "REGRESSION: a fix card commits a call",
  );
  assert.equal(PROPOSAL_SPECS.fix.open(p, null), p.payload.to, "its Open is its door");
  assert.equal(JSON.parse(r.result).note, FIX_CARD_WORDS.note, "the model is told it has nothing to approve");
  return { kind: p.kind, title: p.title, line: p.line, door: p.payload.door, to: p.payload.to };
};

test("a win-back where nobody has said yes to offers is no campaign card: one card of that one thing, with Get their yes for its door, and nothing filed", async () => {
  // Brought in from an address book: they may hear from the business about their own meetings, but nobody said yes to
  // offers, on any channel, so the win-back would reach no one, by its starter or by a message on file.
  for (const input of [{ trigger: "quiet_30" }, { trigger: "quiet_30", template_id: OFFER }]) {
    const offer = template(OFFER, "month_offer", { category: "marketing" });
    const { made, rows } = propose(input, { templates: input.template_id ? [offer] : [] }, NO_OFFERS_YES);
    const r = await made;
    assert.notEqual(
      r.proposal?.kind,
      "playbook",
      `REGRESSION: a campaign card that reaches nobody was made: ${r.result}`,
    );
    assert.deepEqual(fixOf(r), {
      kind: "fix",
      title: "Get their yes to offers",
      line: "Nobody has said yes to offers yet, so the “Win-back” campaign would reach no one.",
      door: "Get their yes",
      to: "clients/get-yes",
    });
    assert.deepEqual([rows.playbooks, rows.templates.length], [[], input.template_id ? 1 : 0], "nothing is filed");
  }
});

test("a campaign whose only channel cannot deliver is a card of what to fix: WhatsApp's payment method, in the words Connections says it, with Connections for its door; a reminder too", async () => {
  // WhatsApp alone (no text line, no mailbox), and Meta holding the account's payment method: every reminder and campaign
  // waits, so a campaign card would start a campaign that sends nothing.
  const offer = template(OFFER, "month_offer", { category: "marketing" });
  const world = { tenant_channels: whatsapp(PAYMENT_FAILING), lines: [], mailboxes: [], templates: [offer] };
  const { made, rows } = propose({ trigger: "quiet_30", template_id: OFFER }, world);
  const PAYMENT =
    "Meta reports a problem with the payment method on your WhatsApp account: reminders and campaigns are not delivered until it is fixed.";
  assert.deepEqual(fixOf(await made), {
    kind: "fix",
    title: "Fix WhatsApp first",
    line: `${PAYMENT} Until then the “Win-back” campaign would reach no one.`,
    door: "Open Connections",
    to: "admin/integrations",
  });
  assert.deepEqual(rows.playbooks, [], "nothing is filed");
  // An appointment's moment is stopped by its channels alone, whoever is booked: here they are, so the reminder the day
  // before is the same card, naming it.
  const REMINDER = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
  const reminder = template(REMINDER, "meeting_note", { body_preview: "Your meeting is tomorrow." });
  const visit = await propose(
    { trigger: "visit_tomorrow", template_id: REMINDER, params: [] },
    { ...world, templates: [reminder], tenant_config: withCalendar() },
  ).made;
  assert.equal(fixOf(visit).line, `${PAYMENT} Until then the “Meeting reminder” campaign would reach no one.`);
});

test("a step of a plan that would reach nobody is the plan's refusal, never a fix card among its steps: the model hears what stops it", async () => {
  const rows = tables({ templates: [] });
  rows.contacts = NO_OFFERS_YES.map((p) => ({ id: p.id, tenant_id: A, erased_at: null, display_name: p.display_name }));
  const supabase = fakeDb(rows, {}, { people_list: () => NO_OFFERS_YES });
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
  const r = await buildProposal({ ...t, step: 2 }, "propose_sequence", { action: "moment", trigger: "quiet_30" });
  assert.equal(r.isError, true, r.result);
  assert.equal(
    said(r),
    PLAYBOOK_CARD_REFUSALS.reachesNobody("Nobody has said yes to offers yet.", "People › Get their yes"),
  );
});

test("a reminder on a day with nobody on the calendar is still a card, said in one plain line, its rules in the owner's words on its sheet; its summary no longer says 0 people said yes", async () => {
  // The calendar is connected and holds no meeting tomorrow: the reminder reaches each one as they are booked, by text
  // and by email (WhatsApp waits for its version's review), so it is worth approving.
  const { made, rows } = propose({ trigger: "visit_tomorrow" }, { tenant_config: withCalendar() });
  const r = await made;
  assert.equal(r.isError, false, r.result);
  const p = r.proposal;
  assert.equal(p.line, "Reminds everyone the day before their meeting, 10:00 AM, by text and by email");
  // The sheet: who it reaches today said as a day with nobody on it, and the once-a-week rule in the owner's words.
  const value = (label) => p.sheet.rows.find((x) => x.label === label)?.value;
  assert.equal(value("Reaches"), "Nobody has a meeting tomorrow");
  assert.equal(value("Other messages"), "Sent whatever else they hear from you within a week of it");
  assert.equal(PLAYBOOK_CARD_WORDS.appointmentBreath, "sent whatever else they hear from you within a week of it");
  for (const s of [p.summary, p.line, ...p.sheet.rows.map((x) => `${x.label} ${x.value}`)]) {
    assert.doesNotMatch(s, /0 people on the list|exempt from|one a week per person/, s);
  }
  assert.deepEqual([rows.templates, rows.playbooks], [[], []], "nothing is filed at the card");
});

test("a win-back that reaches people now says how many in its line, when it runs and how it goes", async () => {
  // Two quiet for 30 days who said yes on WhatsApp: on the message on file, by WhatsApp.
  const quiet = SAID_YES.map((x) => ({ ...x, last_message_at: ago(40 * DAY), latest_wa_inbound_at: ago(40 * DAY) }));
  const offer = template(OFFER, "month_offer", { category: "marketing" });
  const r = await propose({ trigger: "quiet_30", template_id: OFFER }, { templates: [offer] }, quiet).made;
  assert.equal(r.isError, false, r.result);
  assert.equal(r.proposal.line, "Invites back 2 people quiet for 30 days, daily at 10:00 AM, on WhatsApp");
});

test("the line says what a campaign does, to whom and when, and how it goes, for each moment Ask proposes", () => {
  const base = { word, list: null, run_hour: 10, cadence_days: 30, goesBy: ["sms", "email"] };
  const line = (c) => campaignLine({ ...base, ...c });
  assert.equal(
    line({ trigger: "visit_tomorrow", pool: 4, will: 4 }),
    "Reminds tomorrow's 4 meetings, 10:00 AM, by text and by email",
  );
  assert.equal(
    line({ trigger: "visit_tomorrow", pool: 4, will: 2 }),
    "Reminds 2 of tomorrow's 4 meetings, 10:00 AM, by text and by email",
  );
  assert.equal(
    line({ trigger: "visit_tomorrow", pool: 0, will: 0 }),
    "Reminds everyone the day before their meeting, 10:00 AM, by text and by email",
  );
  assert.equal(
    line({ trigger: "visited", pool: 1, will: 1, goesBy: ["email"] }),
    "Follows up yesterday's 1 meeting, 10:00 AM, by email",
  );
  assert.equal(
    line({ trigger: "lapsed", pool: 12, will: 12, goesBy: ["whatsapp", "email"] }),
    "Invites back 12 people with no meeting in 45 days, daily at 10:00 AM, on WhatsApp and by email",
  );
  assert.equal(
    line({ trigger: "everyone_monthly", pool: 40, will: 31, goesBy: ["whatsapp"], run_hour: 14 }),
    "Sends the month's offer to 31 of 40 people, every 30 days at 2:00 PM, on WhatsApp",
  );
  assert.equal(
    line({ trigger: "saved_list", pool: 0, will: 0, list: "VIPs", goesBy: ["email"] }),
    "Sends to everyone on VIPs, daily at 10:00 AM, by email",
  );
  assert.equal(
    line({ trigger: "proposal_waiting", pool: 3, will: 3, goesBy: ["email"] }),
    "Follows up 3 proposals waiting on an answer, daily at 10:00 AM, by email",
  );
});

test("an empty book stops nothing, and the words name what stops a campaign and where it is fixed: a missing yes, a reason of theirs", () => {
  const ready = readyOrWhatsApp(null);
  const p = { trigger: "quiet_30", message: null, channels: ["whatsapp"], ready };
  assert.equal(campaignReachable([], p, null).block, null, "nothing in an empty book says who could not be reached");
  // Email the workspace cannot send on stops an offer that goes by email alone; email that could not be checked just now
  // (the edge did not answer) is no no, and leaves it unjudged. One person, who said nothing about offers.
  const book = [{ id: "p1", consent: { state: "unknown", marketing: "unknown" } }];
  const message = { category: "marketing", versions: { whatsapp: null, email: null, sms: null } };
  const byEmail = (email) => ({ ...p, channels: ["email"], ready: { ...ready, email }, message });
  const down = campaignReachable(book, byEmail({ ready: false, why: "Connect a mailbox first." }), null).block;
  assert.deepEqual([down?.kind, down?.channels, down?.mend], ["channels", ["email"], "connections"]);
  const unchecked = { ready: false, why: "This could not be checked just now.", unchecked: true };
  assert.equal(
    campaignReachable(book, byEmail(unchecked), null).block,
    null,
    "REGRESSION: a check not made read as a no",
  );
  const o = { ready, about: "ours" };
  assert.deepEqual(campaignBlockWords({ kind: "yes", purpose: "utility" }, o), {
    says: "Nobody has said yes to messages yet.",
    fix: "People › Get their yes",
  });
  const held = (h, n, ticks = ["whatsapp"]) =>
    campaignBlockWords({ kind: "held", held: h, purpose: "marketing", saidYes: n, ticks }, o).says;
  assert.equal(held("no_number", 1), "1 person said yes to offers, and has no number to send to.");
  assert.equal(held("no_number", 3), "3 people said yes to offers, and none has a number to send to.");
  assert.equal(held("no_yes", 2, ["email"]), "2 people said yes to offers, but not by email.");
});
