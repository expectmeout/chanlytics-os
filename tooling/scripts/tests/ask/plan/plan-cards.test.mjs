/**
 * Ask's plan, live (the marketing manager's spec §5.4, Task 17): propose_campaign with action plan reads the workspace
 * once through the readers its own reads answer from (the Library as campaigns.messages reads it, the lists as
 * people.lists does, the campaigns and the journey as campaigns.journey composes them, the room as calendar.room counts
 * it, the notes, and the channels an offer may go by), contracts planOf makes the steps, and each step is built by its
 * sibling action's own handler as an ordinary card, with its input as the plan wrote it, a step's token (`@step:n`)
 * included. Every card comes back from the one call, stamped as one plan: its id, its step of how many, whether it sends
 * nothing, and the steps a send waits for. A step its handler refuses is the plan's refusal, naming the step. The loop
 * keeps every card one call made. A new campaign takes its last day (`until`), judged by core's one judge of an end and
 * written through POST playbooks.
 *
 * Executed through the real registry over a workspace in memory; the edge's answer about email and the calendar's feed
 * are a stubbed fetch. The world is tooling/scripts/tests/playbooks/ask-setup/starter-card.test.mjs's, with Harbor's
 * month's offer on its email version alone.
 */
import { test, beforeEach, after, mock } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const k of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[k];
delete process.env.ASK_MODEL;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { buildProposal, newToolContext, runTool } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
// Read as a module, so a name contracts does not export yet is a failing assertion, not a file that will not load.
const C = await import("@chanlytics/contracts");
const { PLAN_WORDS: W, PLAYBOOK_PATCH_WORDS, PROPOSAL_SPECS, planOf, stepToken } = C;
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { emailWire } = await import(at("apps/dashboard/src/server/connections/email-readiness.ts"));
const { runAskTurn } = await import(at("apps/dashboard/src/server/ask/loop.ts"));
const { workspaceFacts } = await import(at("apps/dashboard/src/server/ask/prompt.ts"));
const { forgetFeeds } = await import(at("apps/dashboard/src/server/ask/openings.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const playbooksRoute = await import(at("apps/dashboard/app/api/v1/playbooks/route.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const TZ = "America/New_York";
/** Sunday 11 Oct 2026, 10:00 AM in New York. */
const NOW = new Date("2026-10-11T14:00:00Z");
const DAY = 86_400_000;
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
/** The month's offer starter's email version, approved: the one version of it this workspace holds. */
const OFFER_EMAIL = "77777777-7777-4777-8777-000000000002";
/** The month's offer, running on it. */
const MONTHLY = "88888888-8888-4888-8888-888888888888";
/** The win-back's message, approved on WhatsApp: what a new campaign card is made on. */
const WINBACK = "77777777-7777-4777-8777-000000000011";
const ICAL = "https://cal.example/harbor.ics";
const WORDS = "10% off colour all November";
const LINE = "10% off colour all November.";
const OFFERS = "seg:offers_ok";

/** A person People's list answers: a yes to offers and to messages, an address and a number, who wrote once. */
const row = (n, over = {}) => ({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${n}`,
  display_name: `Person ${n}`,
  wa_profile_name: null,
  phone_e164: `+1555010${n}00`,
  email: `p${n}@example.com`,
  email_suppressed_at: null,
  consent: "opted_in",
  consent_source: "keyword",
  consent_updated_at: ago(40 * DAY),
  marketing_consent: "opted_in",
  marketing_consent_source: "customer_message",
  marketing_consent_updated_at: ago(40 * DAY),
  consent_channels: ["whatsapp", "sms", "email"],
  marketing_channels: ["whatsapp", "email"],
  email_marketing: "opted_in",
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
  last_message_at: ago(10 * DAY),
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
const PEOPLE = [row(1), row(2), row(3)];

/** The month's offer starter's four values, as the starter files them. */
const OFFER_VARIABLES = [
  { position: 1, label: "First name", example: "Dani" },
  { position: 2, label: "Business name", example: "Harbor" },
  { position: 3, label: "The offer", example: "20% off any service booked before Friday." },
  { position: 4, label: "Booking link", example: "https://book.example/harbor" },
];
/** A templates row as the table holds it: English filed under en_US, as the starters are. */
const tpl = (id, over = {}) => ({
  id,
  tenant_id: A,
  channel: "email",
  name: "this_months_offer",
  language: "en_US",
  body_preview: "Hi {{1}},\n\nThis month at {{2}}: {{3}}\n\nBook here: {{4}}, or reply with a day that suits you.",
  variables: OFFER_VARIABLES,
  category: "marketing",
  meta_status: "approved",
  quality: null,
  rejected_reason: null,
  synced_at: null,
  source: "starter",
  hidden_at: null,
  title: null,
  components: {
    subject: "This month at {{2}}",
    body: "Hi {{1}},\n\nThis month at {{2}}: {{3}}\n\nBook here: {{4}}, or reply with a day that suits you.",
  },
  ...over,
});
/** A playbook row as the page's read selects it: the month's offer, running on the starter's email version. */
const pbRow = (id, over = {}) => ({
  id,
  tenant_id: A,
  kind: "moment",
  name: "This month's offer",
  trigger: "everyone_monthly",
  list_id: null,
  list_key: null,
  template_id: OFFER_EMAIL,
  template_name: "this_months_offer",
  template_language: "en_US",
  params: [],
  policy_class: "campaign",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 30,
  cadence_days: 30,
  channels: ["email"],
  until: null,
  trial_until: null,
  last_run_for: null,
  last_run_at: null,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});

const PROFILE = {
  address: "12 Main St, Springfield",
  hours: {
    mon: { open: "09:00", close: "17:00" },
    tue: { open: "09:00", close: "17:00" },
    wed: { open: "09:00", close: "17:00" },
    thu: { open: "09:00", close: "17:00" },
    fri: { open: "09:00", close: "17:00" },
    sat: {},
    sun: {},
  },
  closures: [],
  services: [{ name: "Colour", duration_min: 60 }],
  booking_rules: { lead_hours: 2, max_days_ahead: 14, slot_min: 30 },
};

/**
 * Harbor on the day an owner asks: email set up to send offers, no WhatsApp number, no calendar, the month's offer
 * starter on its email version alone, and the month's offer running on it. `over` replaces a table whole.
 */
const tables = (over = {}) => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
    { user_id: "u2", tenant_id: A, role: "operator", tenants: { slug: "harbor" }, created_at: "2026-01-02T00:00:00Z" },
  ],
  tenants: [{ id: A, name: "Harbor", timezone: TZ, sells_by: "appointment" }],
  tenant_config: [
    {
      tenant_id: A,
      config: {
        brain: {
          business_name: "Harbor",
          booking_link: "https://book.example/harbor",
          system_prompt: "Answer as the front desk of Harbor: brief and warm.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
          profile: PROFILE,
        },
      },
      version: 1,
    },
  ],
  tenant_channels: [],
  lines: [],
  mailboxes: [{ tenant_id: A, local_part: "harbor" }],
  policies: [],
  templates: [tpl(OFFER_EMAIL)],
  contacts: PEOPLE.map((p) => ({ id: p.id, tenant_id: A, erased_at: null, display_name: p.display_name })),
  segments: [],
  segment_members: [],
  playbooks: [pbRow(MONTHLY)],
  deals: [],
  events: [],
  contact_identities: [],
  broadcasts: [],
  ...over,
});
/** Harbor with a calendar at ICAL and its WhatsApp number (not a US one: offers on it are open), nothing running. */
const withCalendar = (over = {}) => {
  const t = tables();
  const [cfg] = t.tenant_config;
  return tables({
    tenant_config: [{ ...cfg, config: { ...cfg.config, calendar: { ical_url: ICAL } } }],
    tenant_channels: [
      {
        id: "ch-wa",
        tenant_id: A,
        kind: "whatsapp",
        status: "active",
        number_e164: "+442079460958",
        config: { quality_rating: "GREEN", messaging_limit: "TIER_1K" },
      },
    ],
    templates: [],
    playbooks: [],
    ...over,
  });
};

/** The calendar's feed: one appointment next Tuesday afternoon. */
const ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:a1",
  "SUMMARY:Colour",
  "DTSTART;TZID=America/New_York:20261013T140000",
  "DTEND;TZID=America/New_York:20261013T150000",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");
/** The network: the edge's answer about its email wire (offers by email open) and the calendar's feed; nothing else. */
const real = globalThis.fetch;
beforeEach(async () => {
  readerCache.clear();
  forgetFeeds();
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u === ICAL) return new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
    if (u.endsWith("/api/admin/email/wire"))
      return new Response(JSON.stringify({ ok: true, ready: true, offers: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    throw new Error(`nothing else is reachable: ${u}`);
  };
  await emailWire({ fresh: true });
  // The month's emails and texts so far, which the service client counts (campaigns/month-sent.ts): none yet.
  setServiceClient(fakeDb({}, {}, { campaign_month_sent: () => 0 }));
});
after(() => {
  globalThis.fetch = real;
  setServiceClient(null);
});

/** A request over `rows`, People being `people`, and `faults` failing a read the way PostgREST fails one. */
const ctxOf = (rows, user = USER, people = PEOPLE, faults = {}) => ({
  supabase: fakeDb(rows, faults, { people_list: () => people }),
  userId: user,
  email: "ada@example.com",
  params: {},
});
/** A call of propose_campaign by a member of `role` over `rows`, People being `people`: its outcome. */
const call = (input, rows = tables(), role = "owner", people = PEOPLE, faults = {}) => {
  const t = newToolContext(ctxOf(rows, role === "owner" ? USER : "u2", people, faults), A, role, TZ, NOW);
  return buildProposal(t, "propose_campaign", input);
};
const plan = (intent, rows, role) => call({ action: "plan", ...intent }, rows, role);
const said = (r) => JSON.parse(r.result);
const offer = (over = {}, say) => ({
  intent: "offer",
  offer: { words: WORDS, from: "2026-11-01", until: "2026-11-30", ...over },
  ...(say ? { say } : {}),
});
/** The card each step's kind is built as: its sibling action's. */
const CARD_KIND = {
  message: "message",
  note: "settings",
  change: "playbook_change",
  broadcast: "broadcast",
  playbook: "playbook",
};

/**
 * The world the plan should have read off `tables()` (and its variants), with what decides the steps: the channels an
 * offer may go by, the Library, the offers list, the month's offer, no notes, no room and no calendar.
 */
const worldOf = (over = {}) => ({
  now: NOW,
  tz: TZ,
  language: "en",
  channels: { whatsapp: false, email_offers: true },
  messages: [
    {
      name: "this_months_offer",
      language: "en_US",
      category: "marketing",
      versions: [{ channel: "email", id: OFFER_EMAIL, state: "approved" }],
      slots: [
        { position: 1, label: "First name", kind: "first_name" },
        { position: 2, label: "Business name", kind: "business_name" },
        { position: 3, label: "The offer", kind: "text" },
        { position: 4, label: "Booking link", kind: "booking_link" },
      ],
      used_by: [{ id: MONTHLY, name: "This month's offer" }],
    },
  ],
  lists: [{ token: OFFERS, name: "Can receive offers", count: PEOPLE.length }],
  playbooks: [
    {
      id: MONTHLY,
      name: "This month's offer",
      trigger: "everyone_monthly",
      state: "running",
      template_name: "this_months_offer",
    },
  ],
  notes: [],
  room: null,
  journey: [
    { id: "first_contact", covered: false, moment: null },
    { id: "quiet", covered: false, moment: "quiet_30" },
  ],
  offersList: OFFERS,
  // An owner asks: a note for the receptionist is theirs to approve.
  canNote: true,
  ...over,
});

/** Every card a plan made, against the steps planOf makes of `world`: one card a step, in order, each stamped. */
function cardsAreSteps(r, intent, world) {
  assert.equal(r.isError, false, r.result);
  assert.equal(r.proposal, null, "a plan's cards come as several, never as one");
  const planned = planOf(intent, world);
  assert.ok("steps" in planned, JSON.stringify(planned));
  const cards = r.proposals;
  assert.equal(cards.length, planned.steps.length, "one card a step");
  const id = cards[0].plan.id;
  assert.match(id, /^plan-[0-9a-f-]{36}$/);
  cards.forEach((p, i) => {
    const s = planned.steps[i];
    assert.equal(p.kind, CARD_KIND[s.kind], `step ${s.n} is a ${s.kind}`);
    assert.deepEqual(p.plan, { id, step: s.n, of: planned.steps.length, silent: s.silent, after: s.after });
  });
  assert.equal(new Set(cards.map((p) => p.id)).size, cards.length, "each card its own id");
  const out = said(r);
  assert.deepEqual(
    out.steps,
    cards.map((p, i) => ({ n: i + 1, kind: planned.steps[i].kind, card: p.title, silent: planned.steps[i].silent })),
  );
  assert.deepEqual([out.proposed, out.plan, out.words], [true, id, planned.words]);
  return { cards, planned };
}

/* ------------------------------------------------------------------ an offer */

test("a November offer, on email alone (no WhatsApp number) and the month's offer starter approved by email: one card a step of planOf's, in step order, stamped 1..3 with silent and after; the send reuses the starter's real version", async () => {
  const intent = offer();
  const r = await plan(intent);
  const { cards } = cardsAreSteps(r, intent, worldOf());
  assert.deepEqual(
    cards.map((p) => [p.kind, p.plan.silent, p.plan.after]),
    [
      ["settings", true, []],
      ["playbook_change", true, []],
      ["broadcast", false, [1, 2]],
    ],
  );
  const [note, pause, send] = cards;
  // The note, in the plan's words and with its last day; the month's offer paused; the send on the starter's email version.
  assert.deepEqual(note.payload.change, {
    op: "add_note",
    title: `Offer: ${WORDS}`,
    text: `The offer: ${LINE} It runs from Nov 1 to Nov 30.`,
    until: "2026-11-30",
  });
  assert.deepEqual([pause.payload.playbook_id, pause.payload.state], [MONTHLY, "paused"]);
  assert.equal(send.payload.template_id, OFFER_EMAIL, "the reused message's real id");
  assert.deepEqual(send.payload.params, [
    { kind: "first_name" },
    { kind: "business_name" },
    { kind: "text", value: LINE },
    { kind: "booking_link" },
  ]);
  assert.deepEqual(
    [send.payload.audience_kind, send.payload.audience_id, send.payload.scheduled_for, send.payload.channels],
    ["list", "offers_ok", "2026-11-01T15:00:00.000Z", ["email"]],
  );
  assert.equal(send.payload.count, PEOPLE.length);
  assert.ok(!send.summary.includes("made by step"), "a real message is quoted, never a step's");
  // `say` is kept: in the note's text and in the words the send types into the offer.
  const owned = await plan(offer({}, "Ten percent off any colour, all of November"));
  const [n2, , s2] = owned.proposals;
  assert.match(n2.payload.change.text, /^The offer: Ten percent off any colour, all of November\./);
  assert.equal(s2.payload.params[2].value, "Ten percent off any colour, all of November.");
});

test("the same offer with no message that fits: a message card first, written for email alone, whose token (@step:1) the send's template_id carries, and the send's card says the message is made by step 1", async () => {
  const intent = offer();
  const rows = tables({ templates: [], playbooks: [] });
  const r = await plan(intent, rows);
  const { cards } = cardsAreSteps(r, intent, worldOf({ messages: [], playbooks: [] }));
  assert.deepEqual(
    cards.map((p) => [p.kind, p.plan.silent, p.plan.after]),
    [
      ["message", true, []],
      ["settings", true, []],
      ["broadcast", false, [1, 2]],
    ],
  );
  const [message, , send] = cards;
  assert.deepEqual(Object.keys(message.payload.versions), ["email"], "no WhatsApp number: email alone, never a text");
  assert.equal(message.payload.name, "offer");
  assert.equal(send.payload.template_id, stepToken(1));
  assert.equal(send.payload.template_name, null, "a message not filed yet has no name of its own to say");
  assert.ok(send.summary.includes(W.stepMessage(1)), send.summary);
  assert.ok(W.stepMessage(1).includes("made by step 1"));
  // Who it reaches is counted all the same, by the channels it goes by.
  assert.deepEqual([send.payload.count, send.payload.channels], [PEOPLE.length, ["email"]]);
  // The commit fills the token from what step 1 made before the route sees it (Task 16): the body keeps it until then.
  assert.equal(PROPOSAL_SPECS.broadcast.commit(send, { settings: null }).body.template_id, stepToken(1));
});

test("a token outside a plan, or naming a step that is not an earlier one, names nothing: the send's template_id is refused as any other non-id", async () => {
  const send = (template_id) => ({
    action: "broadcast",
    template_id,
    audience_kind: "list",
    audience_id: "offers_ok",
    params: ["@first_name", "@business_name", LINE, "@booking_link"],
    channels: ["email"],
  });
  const r = await call(send(stepToken(1)));
  assert.equal(r.isError, true);
  assert.match(said(r).error, /^template_id must be an id/);
  // As step 2 of a plan: step 1 is an earlier one, its own step and a later one are not.
  const asStep = (n, token) =>
    buildProposal(
      { ...newToolContext(ctxOf(tables()), A, "owner", TZ, NOW), step: n },
      "propose_campaign",
      send(token),
    );
  for (const token of [stepToken(2), stepToken(3), "@step:0"]) {
    const no = await asStep(2, token);
    assert.match(said(no).error, /^template_id must be an id/, token);
  }
  const yes = await asStep(2, stepToken(1));
  assert.equal(yes.isError, false, yes.result);
  assert.equal(yes.proposal.payload.template_id, stepToken(1));
});

test("a new campaign on a step's message that names no channels ticks them by the composer's own rule, as for any message: by email on a workspace with no number, never WhatsApp alone; and counts who the offer reaches (fix round 1)", async () => {
  const asStep = (input) =>
    buildProposal({ ...newToolContext(ctxOf(tables()), A, "owner", TZ, NOW), step: 2 }, "propose_campaign", {
      action: "playbook",
      trigger: "saved_list",
      list: OFFERS,
      policy_class: "campaign",
      template_id: stepToken(1),
      params: ["@first_name", "@business_name", LINE, "@booking_link"],
      ...input,
    });
  const r = await asStep({});
  assert.equal(r.isError, false, r.result);
  assert.deepEqual(r.proposal.payload.channels, ["email"], "what a new campaign opens on here: email, its one channel");
  assert.equal(r.proposal.payload.candidates, PEOPLE.length, "everyone who can receive the offer by email");
  // Texts named for an offer are refused in the route's own words.
  const text = await asStep({ channels: ["sms"] });
  assert.equal(said(text).error, C.CHANNEL_WORDS.noOffersByText);
});

test("a change to the campaign an earlier step makes (no plan names one today) takes what is said without its row: a pause, its words, its end; the rest is refused in words, and the card names the step", async () => {
  const asStep = (input) =>
    buildProposal({ ...newToolContext(ctxOf(tables()), A, "owner", TZ, NOW), step: 2 }, "propose_campaign", {
      action: "change",
      playbook_id: stepToken(1),
      ...input,
    });
  const pause = await asStep({ state: "paused", until: "2026-11-30" });
  assert.equal(pause.isError, false, pause.result);
  assert.equal(pause.proposal.title, `Pause: ${W.stepCampaign(1)}`);
  assert.deepEqual(
    [pause.proposal.payload.playbook_id, pause.proposal.payload.state, pause.proposal.payload.until],
    [stepToken(1), "paused", "2026-11-30"],
  );
  assert.equal(pause.proposal.summary, [PLAYBOOK_PATCH_WORDS.paused, PLAYBOOK_PATCH_WORDS.until("Nov 30")].join(" · "));
  for (const input of [{ state: "running" }, { run_hour: 9 }, { trial_until: null }])
    assert.equal(said(await asStep(input)).error, W.stepChangeOnly(1), JSON.stringify(input));
  assert.equal(said(await asStep({ until: "2026-10-01" })).error, PLAYBOOK_PATCH_WORDS.untilPast("Oct 11"));
});

test("an operator's November offer: no note for the receptionist, which is an owner's or a partner's to approve, and the words say the receptionist is not told until one of them adds it; the rest of the plan is the operator's, renumbered; an owner's plan has the note as before", async () => {
  // The words name who may approve a note: the settings card's role (contracts settingsSpec).
  assert.equal(PROPOSAL_SPECS.settings.needs, "partner", "W.noteLeftOut names an owner or a partner");
  const intent = offer();
  const op = await plan(intent, tables(), "operator");
  const { cards } = cardsAreSteps(op, intent, worldOf({ canNote: false }));
  assert.deepEqual(
    cards.map((p) => [p.kind, p.plan.step, p.plan.silent, p.plan.after]),
    [
      ["playbook_change", 1, true, []],
      ["broadcast", 2, false, [1]],
    ],
    "the pause and the send, stamped 1..2, the send waiting for the pause alone",
  );
  assert.equal(cards[1].payload.template_id, OFFER_EMAIL);
  assert.ok(said(op).words.includes(W.noteLeftOut), said(op).words);
  assert.ok(!said(op).words.includes("Tells the receptionist"), "no note said made");
  // An owner's: the note, as before.
  const owner = await plan(intent, tables(), "owner");
  assert.deepEqual(
    owner.proposals.map((p) => p.kind),
    ["settings", "playbook_change", "broadcast"],
  );
  assert.ok(!said(owner).words.includes(W.noteLeftOut));
});

test("a step its handler refuses is the plan's refusal, naming the step in its words; the plan's own refusal is planOf's", async () => {
  // Everyone on the list pressed Unsubscribe on the business's email: the send's step is refused in its own words.
  const unsubscribed = PEOPLE.map((p) => ({ ...p, email_marketing: "opted_out" }));
  const nobody = await call({ action: "plan", ...offer() }, tables(), "owner", unsubscribed);
  assert.equal(nobody.isError, true);
  assert.match(said(nobody).error, /^Step 3 \(broadcast\): nobody on "Can receive offers" can receive this message: /);
  // A first day already past: planOf's own refusal, whole.
  const past = await plan(offer({ from: "2026-10-01" }));
  assert.deepEqual([past.isError, said(past).error], [true, W.fromPast]);
  // An offer named with no offer: refused before anything is read.
  const bare = await plan({ intent: "offer" });
  assert.equal(bare.isError, true);
  assert.match(said(bare).error, /offer/);
});

test("texts never carry an offer: a plan asked for by text alone says so, in words of its own (Task 15, carry-forward e)", async () => {
  const r = await plan(offer({ channels: ["sms"] }));
  assert.equal(r.isError, true);
  assert.equal(said(r).error, W.textOnly);
  assert.notEqual(W.textOnly, W.noChannel);
  assert.match(W.textOnly, /[Tt]exts/);
});

/* ------------------------------------------------------------------ a read that fails */

const BOOM = { message: "connection reset" };
/** A plan whose read failed: refused in the plan's own words, no card made. */
const refusedFor = (r, words) => {
  assert.equal(r.isError, true, r.result);
  assert.deepEqual([r.proposal, r.proposals], [null, undefined], "no card of the plan is made");
  assert.equal(said(r).error, words);
};

test("which channels can carry an offer, unread: the plan refuses in its own words, never planning on a guess of WhatsApp alone (fix round 1)", async () => {
  // The mailbox's read fails, so the channels' readiness is none (campaigns/channels-ready.ts channelsReadyOrNull).
  const r = await call({ action: "plan", ...offer() }, tables(), "owner", PEOPLE, { "mailboxes.select": BOOM });
  refusedFor(r, W.channelsUnread);
  assert.ok(!r.result.includes(W.withoutEmail), "never says email is not set up when it could not be read");
  const journey = await call({ action: "plan", intent: "cover_journey" }, withCalendar(), "owner", PEOPLE, {
    "mailboxes.select": BOOM,
  });
  refusedFor(journey, W.channelsUnread);
});

test("the Library or the campaigns unread: refused in the plan's words; the journey unread refuses a setup in journeyUnread; the room unread is not known, and an offer goes on (fix round 1)", async () => {
  for (const intent of [offer(), { intent: "cover_journey" }])
    refusedFor(
      await call({ action: "plan", ...intent }, withCalendar(), "owner", PEOPLE, { "templates.select": BOOM }),
      W.libraryUnread,
    );
  // The campaigns' read fails: an offer cannot know the month's offer to pause; a setup cannot know the journey.
  refusedFor(
    await call({ action: "plan", ...offer() }, tables(), "owner", PEOPLE, { "playbooks.select": BOOM }),
    W.playbooksUnread,
  );
  refusedFor(
    await call({ action: "plan", intent: "cover_journey" }, withCalendar(), "owner", PEOPLE, {
      "playbooks.select": BOOM,
    }),
    W.journeyUnread,
  );
  // The calendar's appointments on record unread: calendar.room says it cannot count (`unavailable`), the room is not
  // known (never full), and the offer is its broadcast. A room read that throws is the same: not known (act/plan.ts).
  const roomless = await call(
    { action: "plan", ...offer() },
    withCalendar({ templates: [tpl(OFFER_EMAIL)] }),
    "owner",
    PEOPLE,
    {
      "appointments.select": BOOM,
    },
  );
  assert.equal(roomless.isError, false, roomless.result);
  assert.ok(!said(roomless).words.includes("open slot"), said(roomless).words);
  assert.equal(roomless.proposals.at(-1).kind, "broadcast");
});

test("the receptionist's notes are the settings read's own (the notes in force the receptionist is told), and a configuration that does not read is refused in words, never read as no notes (fix round 1)", async () => {
  const [cfg] = tables().tenant_config;
  const withNotes = (notes) => [
    { ...cfg, config: { ...cfg.config, brain: { ...cfg.config.brain, profile: { ...PROFILE, notes } } } },
  ];
  // The offer's note already in force: the plan makes none, and says the receptionist has it.
  const held = await plan(
    offer(),
    tables({
      tenant_config: withNotes([
        { title: `Offer: ${WORDS}`, text: "Ten percent off colour through November.", until: "2026-11-30" },
      ]),
    }),
  );
  assert.equal(held.isError, false, held.result);
  assert.deepEqual(
    held.proposals.map((p) => p.kind),
    ["playbook_change", "broadcast"],
  );
  assert.ok(said(held).words.includes(W.noteKnown));
  // A configuration that does not parse: not "no notes", which would make a second note over the first.
  const broken = tables({ tenant_config: withNotes("not a list") });
  refusedFor(await plan(offer(), broken), W.notesUnread);
  // Every note in force is read, with no cap of the prompt's: the offer's note last of as many as a profile holds
  // (PROFILE_LIMITS.notes) is held, and no second one is proposed.
  const others = (n) =>
    Array.from({ length: n }, (_, i) => ({
      title: `House rule ${i + 1}`,
      text: "Ask at the desk.",
      until: "2026-12-31",
    }));
  const offersNote = { title: `Offer: ${WORDS}`, text: "Ten percent off colour.", until: "2026-11-30" };
  const full = await plan(
    offer(),
    tables({ tenant_config: withNotes([...others(C.PROFILE_LIMITS.notes - 1), offersNote]) }),
  );
  assert.equal(full.isError, false, full.result);
  assert.ok(!full.proposals.some((p) => p.kind === "settings"), "the offer's note, last, is held");
  assert.ok(said(full).words.includes(W.noteKnown));
  // One past what a profile holds does not parse (the profile's own limit), so it is unread, never planned on.
  refusedFor(
    await plan(offer(), tables({ tenant_config: withNotes([...others(C.PROFILE_LIMITS.notes), offersNote]) })),
    W.notesUnread,
  );
});

/* ------------------------------------------------------------------ the journey */

/** The journey Harbor can run with a calendar and no deals, nothing covered but first contact, as the guide offers it. */
const CALENDAR_JOURNEY = [
  { id: "first_contact", covered: true, moment: null },
  { id: "before", covered: false, moment: "visit_tomorrow" },
  { id: "after", covered: false, moment: "visited" },
  { id: "quiet", covered: false, moment: "lapsed" },
];

test("cover_journey with a calendar: a campaign card on each moment not covered yet, one a step of planOf's, no silent step; the day after with no review starter goes by its own starter, after_visit_check, where the step names no message", async () => {
  const intent = { intent: "cover_journey" };
  const r = await plan(intent, withCalendar());
  const { cards } = cardsAreSteps(
    r,
    intent,
    worldOf({
      channels: { whatsapp: true, email_offers: true },
      messages: [],
      playbooks: [],
      journey: CALENDAR_JOURNEY,
    }),
  );
  assert.deepEqual(
    cards.map((p) => [p.kind, p.payload.trigger, p.plan.silent, p.plan.after]),
    [
      ["playbook", "visit_tomorrow", false, []],
      ["playbook", "visited", false, []],
      ["playbook", "lapsed", false, []],
    ],
  );
  // Nothing in the Library: each goes by its moment's own starter, which its Approve adds.
  assert.deepEqual(
    cards.map((p) => p.payload.starter_key),
    ["visit_reminder", "after_visit_check", "winback_reply"],
    "the day after's own starter, never the review ask the Library does not hold",
  );
});

test("an offer starting today on a calendar with less room than half its audience, and no message that fits: the campaign's card goes by the message step 1 writes, named by its token, says so, and ends with the offer", async () => {
  const intent = offer({ from: "2026-10-11", until: "2026-11-15" });
  // One hour on Mondays: four half-hour slots in the next fourteen days, for ten people who can receive offers.
  const tight = withCalendar({ tenant_channels: [] });
  const [cfg] = tight.tenant_config;
  const profile = { ...PROFILE, hours: { mon: { open: "09:00", close: "10:00" } } };
  tight.tenant_config = [{ ...cfg, config: { ...cfg.config, brain: { ...cfg.config.brain, profile } } }];
  const ten = Array.from({ length: 10 }, (_, i) =>
    row(i, { id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab${String(i).padStart(2, "0")}` }),
  );
  const r = await call({ action: "plan", ...intent }, tight, "owner", ten);
  const { cards } = cardsAreSteps(
    r,
    intent,
    worldOf({
      messages: [],
      playbooks: [],
      lists: [{ token: OFFERS, name: "Can receive offers", count: 10 }],
      room: { open: 4, days: 14 },
      journey: CALENDAR_JOURNEY,
    }),
  );
  assert.deepEqual(
    cards.map((p) => [p.kind, p.plan.silent, p.plan.after]),
    [
      ["message", true, []],
      ["settings", true, []],
      ["playbook", false, [1, 2]],
    ],
  );
  const campaign = cards[2];
  assert.deepEqual(
    [
      campaign.payload.trigger,
      campaign.payload.list_key,
      campaign.payload.template_id,
      campaign.payload.cap_per_run,
      campaign.payload.until,
      campaign.payload.channels,
    ],
    ["saved_list", "offers_ok", stepToken(1), 1, "2026-11-15", ["email"]],
  );
  assert.equal(campaign.payload.template_name, null);
  assert.ok(campaign.summary.includes(`Says: ${W.stepMessage(1)}`), campaign.summary);
  assert.ok(campaign.summary.includes(PLAYBOOK_PATCH_WORDS.until("Nov 15")), campaign.summary);
  assert.equal(PROPOSAL_SPECS.playbook.commit(campaign, { settings: null }).body.template_id, stepToken(1));
});

/* ------------------------------------------------------------------ the loop */

test("the loop keeps every card one call made: a plan's three cards are the turn's, said as a plan to review (its steps that send nothing and its send, counted)", async () => {
  const blocks = [
    {
      type: "tool_use",
      id: "t-plan",
      name: "propose_campaign",
      text: "",
      json: JSON.stringify({ action: "plan", ...offer() }),
    },
  ];
  const rounds = [{ blocks, stopReason: "tool_use", streamError: null }];
  const events = [];
  const ctx = ctxOf(tables());
  const r = await runAskTurn(
    {
      ctx,
      tenantId: A,
      role: "owner",
      facts: workspaceFacts("Harbor", TZ, null, NOW, []),
      timezone: TZ,
      personLabel: "ada@example.com (owner)",
      language: "en",
      scope: null,
      surface: "campaigns",
      history: [],
      text: `I want to offer ${WORDS}`,
      emit: (ev) => events.push(ev),
      now: NOW,
    },
    {
      round: async () => {
        const next = rounds.shift();
        if (!next) throw new Error("the loop asked for a round the script does not have");
        return next;
      },
      context: async () => ({
        blocks: [],
        refs: [],
        rows: 0,
        chars: 0,
        stamp: 1,
        failed: false,
        warm: "hit",
      }),
      shape: async () => "The workspace: Harbor · zone America/New_York",
      tool: runTool,
      propose: buildProposal,
    },
  );
  assert.equal(r.failed, false, JSON.stringify(r));
  assert.deepEqual(
    r.proposals.map((p) => [p.kind, p.plan.step]),
    [
      ["settings", 1],
      ["playbook_change", 2],
      ["broadcast", 3],
    ],
  );
  assert.equal(r.answer.say.headline, "A plan of 2 steps and 1 send to review.");
  assert.equal(
    r.answer.say.detail,
    "The steps that send nothing are approved with one press; each send is its own press once the steps it waits for are done. Nothing happens until you do.",
  );
  assert.deepEqual(r.tools, ["propose_campaign.plan"]);
});

/* ------------------------------------------------------------------ a campaign's last day */

/** The win-back's message on WhatsApp, approved, with its two values: a new campaign's card is made on it. */
const winbackRows = () =>
  withCalendar({
    templates: [
      tpl(WINBACK, {
        channel: "whatsapp",
        name: "winback_reply",
        category: "marketing",
        variables: OFFER_VARIABLES.slice(0, 2),
        body_preview: "Hi {{1}}, it's been a while since we last saw you at {{2}}.",
        components: null,
      }),
    ],
  });
const CAMPAIGN = {
  action: "playbook",
  trigger: "saved_list",
  list: OFFERS,
  policy_class: "campaign",
  template_id: WINBACK,
  params: ["@first_name", "@business_name"],
  channels: ["whatsapp"],
};

test("a new campaign takes its last day: its card says “Ends …” and commits it; a day already past is refused in core's words, the one judge of an end", async () => {
  const r = await call({ ...CAMPAIGN, until: "2026-11-30" }, winbackRows());
  assert.equal(r.isError, false, r.result);
  assert.equal(r.proposal.payload.until, "2026-11-30");
  assert.ok(r.proposal.summary.includes(PLAYBOOK_PATCH_WORDS.until("Nov 30")), r.proposal.summary);
  assert.equal(PROPOSAL_SPECS.playbook.commit(r.proposal, { settings: null }).body.until, "2026-11-30");
  const none = await call(CAMPAIGN, winbackRows());
  assert.equal(none.isError, false, none.result);
  assert.equal("until" in none.proposal.payload, false, "no last day asked, none said or sent");
  assert.equal("until" in PROPOSAL_SPECS.playbook.commit(none.proposal, { settings: null }).body, false);
  const past = await call({ ...CAMPAIGN, until: "2026-10-10" }, winbackRows());
  assert.equal(past.isError, true);
  assert.equal(said(past).error, PLAYBOOK_PATCH_WORDS.untilPast("Oct 11"));
  const notADay = await call({ ...CAMPAIGN, until: "November 30" }, winbackRows());
  assert.equal(said(notADay).error, PLAYBOOK_PATCH_WORDS.untilDay);
});

/**
 * `start_playbook` (00357, as 00395 replaced it) for a database in memory: the row the door writes, of the columns it
 * names, `until` among them, running and the caller's.
 */
const startDoor = (rows) => ({
  people_list: () => PEOPLE,
  start_playbook: (a) => {
    const made = { id: crypto.randomUUID(), tenant_id: a.p_tenant_id, ...a.p_playbook, state: "running" };
    rows.playbooks.push(made);
    return { id: made.id, decision_id: "decision-1", undo_dropped: false };
  },
});
const postPlaybook = async (rows, body) => {
  setRateStore(memoryStore());
  mock.timers.enable({ apis: ["Date"], now: NOW });
  try {
    return await playbooksRoute.POST.run(
      new Request(`http://localhost/api/v1/x?workspace=${A}`, { method: "POST", body: JSON.stringify(body) }),
      { supabase: fakeDb(rows, {}, startDoor(rows)), userId: USER, email: "ada@example.com", params: {} },
    );
  } finally {
    mock.timers.reset();
  }
};

test("POST playbooks takes until: judged by core's judge of an end at the route's clock, and written through start_playbook; a past one is refused there in the same words", async () => {
  const rows = winbackRows();
  const r = await call({ ...CAMPAIGN, until: "2026-11-30" }, rows);
  const made = await postPlaybook(rows, PROPOSAL_SPECS.playbook.commit(r.proposal, { settings: null }).body);
  const filed = rows.playbooks.find((p) => p.id === made.id);
  assert.equal(filed.until, "2026-11-30");
  // With no last day named, none is written.
  const { until: _until, ...withoutUntil } = PROPOSAL_SPECS.playbook.commit(r.proposal, { settings: null }).body;
  const without = await postPlaybook(rows, { ...withoutUntil, name: "Win-back, no end" });
  assert.equal(rows.playbooks.find((p) => p.id === without.id).until, null);
  const before = rows.playbooks.length;
  await assert.rejects(
    postPlaybook(rows, { ...PROPOSAL_SPECS.playbook.commit(r.proposal, { settings: null }).body, until: "2026-10-01" }),
    (e) => e.message === PLAYBOOK_PATCH_WORDS.untilPast("Oct 11"),
  );
  assert.equal(rows.playbooks.length, before, "nothing started");
  // Judged before a starter is filed: a past end on a card that names a starter files nothing and asks nothing of Meta.
  const templates = rows.templates.length;
  await assert.rejects(
    postPlaybook(rows, { trigger: "visit_tomorrow", starter_key: "visit_reminder", until: "2026-10-01" }),
    (e) => e.message === PLAYBOOK_PATCH_WORDS.untilPast("Oct 11"),
  );
  assert.deepEqual(
    [rows.templates.length, rows.playbooks.length],
    [templates, before],
    "no starter filed, nothing started",
  );
});
