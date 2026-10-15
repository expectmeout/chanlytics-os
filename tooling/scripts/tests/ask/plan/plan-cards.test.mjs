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
const { readerCache, stableJson } = await import(at("apps/dashboard/src/server/readers/index.ts"));
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
/** The owner's own phrasing of the offer, kept apart from its words: what every send types into its offer. */
const OWN_SAY = "Ten percent off any colour, all of November";
/** What a send on the message step 1 writes says of it: that step, and the offer its values type, quoted (stepSays). */
const STEP_SAYS = `${W.stepMessage(1)}, with the offer “${OWN_SAY}.”`;

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
/**
 * The tool and action an input names, as propose_campaign's actions are now (the operator, 15 Oct 2026): the plan is
 * propose_plan's action offer; a broadcast, a playbook and a run are propose_sequence's once, moment and batch; the rest
 * keep their names under propose_sequence.
 */
const RENAMED = {
  plan: ["propose_plan", "offer"],
  broadcast: ["propose_sequence", "once"],
  playbook: ["propose_sequence", "moment"],
  run: ["propose_sequence", "batch"],
};
const routed = (input) => {
  const [tool, action] = RENAMED[input.action] ?? ["propose_sequence", input.action];
  return [tool, { ...input, action }];
};
/** A call of the campaign tools by a member of `role` over `rows`, People being `people`: its outcome. */
const call = (input, rows = tables(), role = "owner", people = PEOPLE, faults = {}) => {
  const t = newToolContext(ctxOf(rows, role === "owner" ? USER : "u2", people, faults), A, role, TZ, NOW);
  return buildProposal(t, ...routed(input));
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
  // As channelChoices answers them for an offer: no number, and email set up to send offers.
  channels: { whatsapp: { ok: false, why: C.CHANNEL_WORDS.noWhatsApp }, email: { ok: true, why: null } },
  whatsappSends: false,
  reviewLink: false,
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
      until: null,
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
  says: "en",
  // No calendar and no deals, as GET playbooks says Harbor works; nobody counted for a moment the setups below start.
  shape: { calendar: "none", dealsOn: false, word: "appointment" },
  reach: {},
  ...over,
});

/**
 * Every card a plan made, against the steps planOf makes of `world`: one card a step, in order, each stamped where the
 * plan has a step that sends nothing; where it has none (a setup's campaigns, D3) the cards are plain cards, unstamped,
 * each with a day's lapse and its own key, and the model is told no plan id.
 */
function cardsAreSteps(r, intent, world) {
  assert.equal(r.isError, false, r.result);
  assert.equal(r.proposal, null, "a plan's cards come as several, never as one");
  const planned = planOf(intent, world);
  assert.ok("steps" in planned, JSON.stringify(planned));
  const cards = r.proposals;
  assert.equal(cards.length, planned.steps.length, "one card a step");
  const stamped = planned.steps.some((s) => s.silent);
  const id = stamped ? cards[0].plan.id : undefined;
  if (stamped) assert.match(id, /^plan-[0-9a-f-]{36}$/);
  cards.forEach((p, i) => {
    const s = planned.steps[i];
    assert.equal(p.kind, CARD_KIND[s.kind], `step ${s.n} is a ${s.kind}`);
    assert.deepEqual(
      p.plan,
      stamped ? { id, step: s.n, of: planned.steps.length, silent: s.silent, after: s.after } : undefined,
    );
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
  const owned = await plan(offer({}, OWN_SAY));
  const [n2, , s2] = owned.proposals;
  assert.match(n2.payload.change.text, /^The offer: Ten percent off any colour, all of November\./);
  assert.equal(s2.payload.params[2].value, `${OWN_SAY}.`);
  // The note's card the owner approves quotes what the receptionist is told, the owner's phrasing among it.
  assert.ok(n2.summary.includes(`${OWN_SAY}.`), n2.summary);
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
  // The send's card the owner approves quotes the offer its values type, through the plan, the owner's own phrasing
  // (`say`) where it differs from the offer's words: what goes to everyone it reaches, never only "made by step 1".
  const owned = await plan(offer({}, OWN_SAY), rows);
  const s2 = owned.proposals.at(-1);
  assert.equal(s2.payload.params[2].value, `${OWN_SAY}.`);
  assert.ok(s2.summary.includes(STEP_SAYS), s2.summary);
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
    buildProposal({ ...newToolContext(ctxOf(tables()), A, "owner", TZ, NOW), step: n }, ...routed(send(token)));
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
    buildProposal({ ...newToolContext(ctxOf(tables()), A, "owner", TZ, NOW), step: 2 }, "propose_sequence", {
      action: "moment",
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
    buildProposal({ ...newToolContext(ctxOf(tables()), A, "owner", TZ, NOW), step: 2 }, "propose_sequence", {
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

/** Harbor's WhatsApp row on `number`, healthy, as the channels' reader reads it (the number judges offers on it). */
const waRow = (number) => ({
  id: "ch-wa",
  tenant_id: A,
  kind: "whatsapp",
  status: "active",
  number_e164: number,
  config: { quality_rating: "GREEN", messaging_limit: "TIER_1K" },
});

test("a US number, read through the channels' real reader: the plan says WhatsApp's pause on offers in the pause's own words, never that no number is connected, and the offer goes by email; WhatsApp asked for alone is refused in those words, naming email", async () => {
  const US = "+12125550123";
  const rows = tables({ tenant_channels: [waRow(US)] });
  const r = await plan(offer(), rows);
  assert.equal(r.isError, false, r.result);
  const words = said(r).words;
  assert.ok(words.includes(W.without("whatsapp", C.whatsappOffersOpen(US).why)), words);
  assert.ok(!words.includes(C.CHANNEL_WORDS.noWhatsApp) && !/no WhatsApp number/i.test(words), words);
  const send = r.proposals.at(-1);
  assert.deepEqual([send.kind, send.payload.channels, send.payload.template_id], ["broadcast", ["email"], OFFER_EMAIL]);
  readerCache.clear();
  const only = await plan(offer({ channels: ["whatsapp"] }), rows);
  assert.equal(only.isError, true);
  assert.equal(said(only).error, W.noChannel([{ channel: "whatsapp", why: C.whatsappOffersOpen(US).why }], ["email"]));
  assert.match(said(only).error, /Email can carry it/);
});

/** The month's offer starter on WhatsApp and by email, its WhatsApp version still in WhatsApp's review. */
const OFFER_WA = "77777777-7777-4777-8777-000000000001";
const reviewing = () => [
  tpl(OFFER_WA, {
    channel: "whatsapp",
    meta_status: "pending",
    body_preview: "Hi {{1}}, this month at {{2}}: {{3}} Book here: {{4}}",
    components: null,
  }),
  tpl(OFFER_EMAIL),
];

test("the one message that fits still in WhatsApp's review: a broadcast, built by the real broadcast handler, goes by its email version and the words say why, never core's 409 for the whole plan; a paced campaign by WhatsApp alone is refused in the plan's words, never as a step its handler refused", async () => {
  const both = withCalendar({ templates: reviewing() });
  const r = await plan(offer(), both);
  assert.equal(r.isError, false, r.result);
  const send = r.proposals.at(-1);
  // The card names the message by its anchor (its WhatsApp version, as every broadcast card does), and goes by email.
  assert.deepEqual([send.kind, send.payload.channels, send.payload.template_id], ["broadcast", ["email"], OFFER_WA]);
  assert.ok(said(r).words.includes(W.without("whatsapp", W.reviewing("this_months_offer"))), said(r).words);
  assert.ok(!r.proposals.some((p) => p.kind === "message"), "no twin of it is written");
  // WhatsApp the one channel that carries offers (no mailbox), and a room tight today: the paced campaign goes by
  // WhatsApp alone, which core holds for the review, so the plan refuses it itself.
  readerCache.clear();
  const tight = withCalendar({ templates: reviewing(), mailboxes: [] });
  const [cfg] = tight.tenant_config;
  const profile = { ...PROFILE, hours: { mon: { open: "09:00", close: "10:00" } } };
  tight.tenant_config = [{ ...cfg, config: { ...cfg.config, brain: { ...cfg.config.brain, profile } } }];
  const ten = Array.from({ length: 10 }, (_, i) =>
    row(i, { id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab${String(i).padStart(2, "0")}` }),
  );
  const paced = await call(
    { action: "plan", ...offer({ from: "2026-10-11", until: "2026-11-15" }) },
    tight,
    "owner",
    ten,
  );
  assert.equal(paced.isError, true);
  assert.equal(said(paced).error, W.reviewRefused("this_months_offer", false));
});

/* ------------------------------------------------------------------ a read that fails */

const BOOM = { message: "connection reset" };
/** A plan whose read failed: refused in the plan's own words, no card made. */
const refusedFor = (r, words) => {
  assert.equal(r.isError, true, r.result);
  assert.deepEqual([r.proposal, r.proposals], [null, undefined], "no card of the plan is made");
  assert.equal(said(r).error, words);
};

test("which channels can send, unread: the plan refuses in its own words, never planning on a guess of WhatsApp alone, in words a setup's plan is true of too (fix round 1)", async () => {
  // The mailbox's read fails, so the channels' readiness is none (campaigns/channels-ready.ts channelsReadyOrNull).
  const r = await call({ action: "plan", ...offer() }, tables(), "owner", PEOPLE, { "mailboxes.select": BOOM });
  refusedFor(r, W.channelsUnread);
  assert.ok(!r.result.includes("It goes without email"), "never says email is left out when it could not be read");
  assert.ok(!W.channelsUnread.includes("offer"), "a setup carries no offer");
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
    await call({ action: "plan", ...offer() }, tables(), "owner", PEOPLE, { "sequence_steps.select": BOOM }),
    W.playbooksUnread,
  );
  refusedFor(
    await call({ action: "plan", intent: "cover_journey" }, withCalendar(), "owner", PEOPLE, {
      "sequence_steps.select": BOOM,
    }),
    W.journeyUnread,
  );
  // The calendar's appointments on record unread: calendar.room says it cannot count (`unavailable`), the room is not
  // known (never full), and the offer is its broadcast. A room read that throws is the next test's.
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

test("an offer's lists or notes unread: refused in the plan's words, never a send to a list it did not read, nor a second note over the first; a room read that throws costs the offer nothing but its room (review after the merge)", async () => {
  // The lists (People's own, as people.lists reads them, and the workspace's) fail with the segments' read.
  refusedFor(
    await call({ action: "plan", ...offer() }, tables(), "owner", PEOPLE, { "segments.select": BOOM }),
    W.listsUnread,
  );
  // The configuration row fails: no notes are known, so none is guessed to be missing.
  refusedFor(
    await call({ action: "plan", ...offer() }, tables(), "owner", PEOPLE, { "tenant_config.select": BOOM }),
    W.notesUnread,
  );
  // The workspace's facts (its zone, which says which notes still hold) fail: the campaigns' read needs the zone too
  // (readers/playbooks.ts) and shares the turn's one read of it, so it is refused first, as the campaigns unread; a plan
  // never reaches the notes on a zone it could not read.
  refusedFor(
    await call({ action: "plan", ...offer() }, tables(), "owner", PEOPLE, { "tenants.select": BOOM }),
    W.playbooksUnread,
  );
  // calendar.room's read throws (its reader, readers/openings.ts, rejects where the zone or the settings cannot be read,
  // which other reads of a plan need too, so the turn's read of it alone is made to reject, as a reader's failure reaches
  // every caller of the turn's cache): the room is not known, never full, and the offer goes on as its broadcast.
  const t = newToolContext(ctxOf(withCalendar({ templates: [tpl(OFFER_EMAIL)] })), A, "owner", TZ, NOW);
  const failed = Promise.reject(new Error("the calendar's settings could not be read"));
  failed.catch(() => {});
  t.rc.turn.hits.set(`openings:${stableJson({ day: null, service: null })}`, failed);
  const roomThrew = await buildProposal(t, "propose_plan", { action: "offer", ...offer() });
  assert.equal(roomThrew.isError, false, roomThrew.result);
  assert.ok(!said(roomThrew).words.includes("open slot"), said(roomThrew).words);
  assert.equal(roomThrew.proposals.at(-1).kind, "broadcast");
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

/** Harbor's world with a calendar and its WhatsApp number (+44: offers on it are open), nothing in the Library. */
const calendarWorld = (over = {}) =>
  worldOf({
    channels: { whatsapp: { ok: true, why: null }, email: { ok: true, why: null } },
    whatsappSends: true,
    messages: [],
    playbooks: [],
    journey: CALENDAR_JOURNEY,
    shape: { calendar: "feed", dealsOn: false, word: "appointment" },
    // Who GET playbooks counts on each moment of Harbor today: nobody has a visit tomorrow or had one yesterday, and
    // nobody has lapsed.
    reach: { visit_tomorrow: 0, visited: 0, lapsed: 0 },
    ...over,
  });

test("cover_journey with a calendar: a campaign card on each moment not covered yet, one a step of planOf's; no step sends nothing, so they are plain cards (D3), unstamped, each its own press with a day's lapse; the day after with no review link goes by its own starter, after_visit_check", async () => {
  const intent = { intent: "cover_journey" };
  const r = await plan(intent, withCalendar());
  const { cards } = cardsAreSteps(r, intent, calendarWorld());
  assert.deepEqual(
    cards.map((p) => [p.kind, p.payload.trigger, p.plan]),
    [
      ["playbook", "visit_tomorrow", undefined],
      ["playbook", "visited", undefined],
      ["playbook", "lapsed", undefined],
    ],
  );
  // Fresh for a day, as every card of no plan (contracts askCardLapsed), never a plan's week.
  assert.equal(C.askCardLapsed(cards[0], Date.parse(cards[0].made_at) + 2 * DAY), true);
  // The model is told the plan's steps and words, and no plan id: there is no plan to press.
  assert.equal("plan" in said(r), false);
  // Nothing in the Library: each goes by its moment's own starter, which its Approve adds.
  assert.deepEqual(
    cards.map((p) => p.payload.starter_key),
    ["visit_reminder", "after_visit_check", "winback_reply"],
    "the day after's own starter, never the review ask, with no review link",
  );
});

test("cover_journey where the Google listing keeps a review link and the Library holds no review ask: the day after's card names the review starter and files it at its Approve", async () => {
  const intent = { intent: "cover_journey", stages: ["after"] };
  const rows = withCalendar({
    google_listings: [{ tenant_id: A, new_review_uri: "https://example.com/review/harbor" }],
  });
  const r = await plan(intent, rows);
  const { cards } = cardsAreSteps(r, intent, calendarWorld({ reviewLink: true }));
  assert.deepEqual(
    cards.map((p) => [p.kind, p.payload.trigger, p.payload.starter_key]),
    [["playbook", "visited", "after_visit_review"]],
  );
  // Its Approve files the review ask, the route's own starter card (POST playbooks with the starter's key).
  assert.equal(PROPOSAL_SPECS.playbook.commit(cards[0], { settings: null }).body.starter_key, "after_visit_review");
});

test("an offer starting today on a calendar with less room than half its audience, and no message that fits: the campaign's card goes by the message step 1 writes, named by its token, says so and quotes the offer its values type (the owner's phrasing), and ends with the offer", async () => {
  const intent = offer({ from: "2026-10-11", until: "2026-11-15" }, OWN_SAY);
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
  assert.ok(campaign.summary.includes(`Says: ${STEP_SAYS}`), campaign.summary);
  assert.ok(campaign.summary.includes(PLAYBOOK_PATCH_WORDS.until("Nov 15")), campaign.summary);
  assert.equal(PROPOSAL_SPECS.playbook.commit(campaign, { settings: null }).body.template_id, stepToken(1));
});

/* ------------------------------------------------------------------ the loop */

/** The plan's call, as the model writes it. */
const PLAN_CALL = {
  type: "tool_use",
  id: "t-plan",
  name: "propose_plan",
  text: "",
  json: JSON.stringify({ action: "offer", ...offer() }),
};
/** An answer the model writes beside its calls (ASK_ANSWER_FORMAT): its Say, and nothing shown or offered. */
const NO_SOURCE = { kind: "none", id: "", label: "" };
const saidBeside = (headline, detail) => ({
  type: "text",
  id: "",
  name: "",
  json: "",
  text: JSON.stringify({
    say: { headline, detail },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: NO_SOURCE } },
    do: { open: { source: NO_SOURCE, label: "", now: false }, next: [] },
    language: "en",
  }),
});
/**
 * The November offer asked for (or `text`, in `language`), the model's one round scripted as `blocks`, the plan's tool
 * run for real over `ctx`, asked by a member of `role`.
 */
const planTurn = (blocks, { text = `I want to offer ${WORDS}`, role = "owner", ctx = null, language = "en" } = {}) => {
  const rounds = [{ blocks, stopReason: "tool_use", streamError: null }];
  const events = [];
  return runAskTurn(
    {
      ctx: ctx ?? ctxOf(tables(), role === "owner" ? USER : "u2"),
      tenantId: A,
      role,
      facts: workspaceFacts("Harbor", TZ, null, NOW, []),
      timezone: TZ,
      personLabel: "ada@example.com (owner)",
      language,
      scope: null,
      surface: "campaigns",
      history: [],
      text,
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
};

/** The plan's words a turn's tool result carried, which the model never reads where the plan is the round's one call. */
const planWordsOf = async (input, rows = tables(), role = "owner") =>
  said(await call({ action: "plan", ...input }, rows, role)).words;

test("the loop keeps every card one call made: a plan's three cards are the turn's, counted as its steps, and the plan alone in its round answers with the plan's own words, which no card says (what it pauses and to resume it, what it leaves out and why)", async () => {
  const r = await planTurn([PLAN_CALL]);
  assert.equal(r.failed, false, JSON.stringify(r));
  assert.deepEqual(
    r.proposals.map((p) => [p.kind, p.plan.step]),
    [
      ["settings", 1],
      ["playbook_change", 2],
      ["broadcast", 3],
    ],
  );
  assert.equal(r.answer.say.headline, "A plan of 3 steps to review: 2 send nothing, then 1 sends.");
  readerCache.clear();
  const words = await planWordsOf(offer());
  assert.equal(r.answer.say.detail, words, "the plan's words whole, in place of the press sentence");
  assert.ok(words.includes(W.monthsOfferPaused("This month's offer", "Nov 30")), words);
  assert.ok(words.includes(W.without("whatsapp", C.CHANNEL_WORDS.noWhatsApp)), words);
  assert.ok(r.answer.say.detail.length <= C.ASK_ANSWER_CAPS.detail);
  // The offer's journey and Library ride in before round 1 (cross-page.ts OFFER_ASKED), then the plan.
  assert.deepEqual(r.tools, ["sequences.journey", "sequences.messages", "propose_plan.offer"]);
});

test("with a calendar, the plan alone in its round says when to ask for the reminder (its own question on the day), and an operator's plan says the receptionist is not told of the offer until an owner or a partner adds a note: words no card carries", async () => {
  const rows = () => withCalendar({ tenant_channels: [], templates: [tpl(OFFER_EMAIL)], playbooks: [pbRow(MONTHLY)] });
  const r = await planTurn([PLAN_CALL], { ctx: ctxOf(rows()) });
  assert.equal(r.failed, false, JSON.stringify(r));
  const detail = r.answer.say.detail;
  assert.ok(detail.includes(W.monthsOfferPaused("This month's offer", "Nov 30")), detail);
  assert.ok(detail.includes(W.reminderAsk("Nov 20", "Can receive offers")), detail);
  assert.ok(detail.length <= C.ASK_ANSWER_CAPS.detail, `${detail.length}`);
  readerCache.clear();
  const op = await planTurn([PLAN_CALL], { role: "operator" });
  assert.equal(op.failed, false, JSON.stringify(op));
  assert.ok(op.answer.say.detail.includes(W.noteLeftOut), op.answer.say.detail);
});

/** Harbor with a calendar open one hour on Mondays (four slots in the next fourteen days), the month's offer running. */
const tightRows = (over = {}) => {
  const rows = withCalendar({ templates: [tpl(OFFER_EMAIL)], playbooks: [pbRow(MONTHLY)], ...over });
  const [cfg] = rows.tenant_config;
  const profile = { ...PROFILE, hours: { mon: { open: "09:00", close: "10:00" } } };
  rows.tenant_config = [{ ...cfg, config: { ...cfg.config, brain: { ...cfg.config.brain, profile } } }];
  return rows;
};
/** Ten people who can receive offers: more than twice the room. */
const TEN = Array.from({ length: 10 }, (_, i) =>
  row(i, { id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab${String(i).padStart(2, "0")}` }),
);
/** The November offer's room, tight for the ten: its broadcast reaches the whole list on Nov 1. */
const ROOM_TIGHT = W.roomTight({ open: 4, days: 14 }, 10, "Nov 1");
const REMINDS = W.reminderAsk("Nov 20", "Can receive offers");

test("a US number, the month's offer running and a tight room for a later offer: the plan's words pass the answer's 700 characters, and the detail keeps whole what no card carries, the reminder last of it, losing only what the cards show (fix round of batch P)", async () => {
  const US = "+12125550123";
  const rows = () => tightRows({ tenant_channels: [waRow(US)] });
  const r = await planTurn([PLAN_CALL], { ctx: ctxOf(rows(), USER, TEN) });
  assert.equal(r.failed, false, JSON.stringify(r));
  readerCache.clear();
  const words = said(await call({ action: "plan", ...offer() }, rows(), "owner", TEN)).words;
  assert.ok(words.length > C.ASK_ANSWER_CAPS.detail, `past the cap: ${words.length}`);
  const detail = r.answer.say.detail;
  assert.ok(detail.length <= C.ASK_ANSWER_CAPS.detail, `${detail.length}`);
  for (const unseen of [
    W.without("whatsapp", C.whatsappOffersOpen(US).why),
    W.monthsOfferPaused("This month's offer", "Nov 30"),
    ROOM_TIGHT,
    REMINDS,
  ])
    assert.ok(detail.includes(unseen), `whole: ${unseen}\nin: ${detail}`);
  assert.ok(detail.indexOf(REMINDS) < detail.indexOf(W.reuseMessage("this_months_offer")), detail);
});

test("an operator's offer with email not set up, a new WhatsApp message, the month's offer running and a tight later room: the detail keeps what no card carries whole, the note left out, the room and the reminder (fix round of batch P)", async () => {
  const rows = () => tightRows({ mailboxes: [] });
  const op = await planTurn([PLAN_CALL], { role: "operator", ctx: ctxOf(rows(), "u2", TEN) });
  assert.equal(op.failed, false, JSON.stringify(op));
  assert.deepEqual(
    op.proposals.map((p) => p.kind),
    ["message", "playbook_change", "broadcast"],
  );
  readerCache.clear();
  const words = said(await call({ action: "plan", ...offer() }, rows(), "operator", TEN)).words;
  assert.ok(words.length > C.ASK_ANSWER_CAPS.detail, `past the cap: ${words.length}`);
  const detail = op.answer.say.detail;
  assert.ok(detail.length <= C.ASK_ANSWER_CAPS.detail, `${detail.length}`);
  for (const unseen of [W.noteLeftOut, ROOM_TIGHT, REMINDS])
    assert.ok(detail.includes(unseen), `whole: ${unseen}\nin: ${detail}`);
});

test("a setup's plan alone in its round: its campaigns are plain cards (D3), so the answer counts them as cards, and the plan's words are its detail", async () => {
  const setup = { ...PLAN_CALL, json: JSON.stringify({ action: "offer", intent: "cover_journey" }) };
  const r = await planTurn([setup], { text: "Set up my campaigns", ctx: ctxOf(withCalendar()) });
  assert.equal(r.failed, false, JSON.stringify(r));
  assert.deepEqual(
    r.proposals.map((p) => [p.kind, p.plan]),
    [
      ["playbook", undefined],
      ["playbook", undefined],
      ["playbook", undefined],
    ],
  );
  assert.equal(r.answer.say.headline, "3 cards to review.");
  assert.equal(
    r.answer.say.detail,
    "Starts 3 campaigns now, each its own card: a reminder the day before a booked time, a follow-up the day after a booked time and a win-back once they go quiet. The reminder, the follow-up and the win-back reach nobody today; each card says why.",
  );
  // A calendar connected and nothing else waited on: no lead, so no Open and no next question of the plan's.
  assert.deepEqual([r.answer.do.open, r.answer.do.next], [null, []]);
});

test("a setup with no calendar, asked in Spanish by a business that books a call and sends proposals: the answer leads with what to connect first, in Spanish, opens the calendar's row and asks how next; the win-back is the one card (the setup review)", async () => {
  const intent = { intent: "cover_journey", books: "llamada de diagnóstico", proposals: true };
  const setup = { ...PLAN_CALL, json: JSON.stringify({ action: "offer", ...intent }) };
  const r = await planTurn([setup], { text: "Prepara mis campañas", language: "es" });
  assert.equal(r.failed, false, JSON.stringify(r));
  assert.deepEqual(
    r.proposals.map((p) => [p.kind, p.payload.trigger]),
    [["playbook", "quiet_30"]],
  );
  assert.equal(
    r.answer.say.headline,
    "Conecta tu calendario y activa las propuestas primero: 1 campaña puede empezar ya, 3 más cuando estén los dos.",
  );
  assert.ok(
    r.answer.say.detail.startsWith(
      "Primero, conecta tu calendario en Ajustes › Negocio, para que cada llamada de diagnóstico",
    ),
    r.answer.say.detail,
  );
  assert.deepEqual(r.answer.do.open, { to: "admin/workspace/calendar", label: "Conectar un calendario", now: false });
  assert.deepEqual(r.answer.do.next, ["¿Cómo conecto mi calendario en Ajustes?"]);
  assert.equal(r.answer.language, "es");
});

test("an offer's journey and Library read before round 1 are the plan's own reads, answered from the turn's cache (readers/index.ts TurnCache): the plan's call after them asks the database for nothing more than the same call with nothing read ahead, and makes the same cards", async () => {
  /** Each request the workspace's database was asked, counted by table and verb or by door. */
  const asked = (ctx) => {
    const n = {};
    for (const q of ctx.supabase.seen) {
      const k = q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`;
      n[k] = (n[k] ?? 0) + 1;
    }
    return n;
  };
  const ahead = ctxOf(tables());
  const r = await planTurn([PLAN_CALL], { ctx: ahead });
  assert.deepEqual(r.tools, ["sequences.journey", "sequences.messages", "propose_plan.offer"]);
  readerCache.clear();
  // Words that name nothing to read ahead, the same call.
  const bare = ctxOf(tables());
  const r2 = await planTurn([PLAN_CALL], { text: "Make it so", ctx: bare });
  assert.deepEqual(r2.tools, ["propose_plan.offer"]);
  assert.deepEqual(asked(ahead), asked(bare));
  // The Library and the campaigns whole, which the reads ahead and the plan share, were asked once (a step's own read of
  // one message or one campaign by its id or name is its handler's).
  const whole = (ctx, table) =>
    ctx.supabase.seen.filter((q) => q.table === table && q.op === "select" && q.filters.length === 1).length;
  for (const table of ["templates", "sequence_steps"]) assert.equal(whole(ahead, table), 1, table);
  assert.deepEqual(
    r.proposals.map((p) => [p.kind, p.title]),
    r2.proposals.map((p) => [p.kind, p.title]),
  );
});

test("an answer written beside a plan's call was written before the plan's words came back: it is set aside, as one beside a read is, and the round answers with the plan's count and its own words, a claimed write and an honest answer alike", async () => {
  const words = await planWordsOf(offer());
  readerCache.clear();
  const r = await planTurn([saidBeside("I've set up your November offer.", "It starts on Nov 1."), PLAN_CALL]);
  assert.equal(r.failed, false, JSON.stringify(r));
  assert.equal(r.proposals.length, 3);
  assert.deepEqual(
    [r.answer.say.headline, r.answer.say.detail],
    ["A plan of 3 steps to review: 2 send nothing, then 1 sends.", words],
  );
  // An answer that claims nothing is set aside all the same: what the plan pauses and leaves out is the plan's to say.
  readerCache.clear();
  const honest = await planTurn([saidBeside("Here is a plan for your November offer.", ""), PLAN_CALL]);
  assert.deepEqual(
    [honest.answer.say.headline, honest.answer.say.detail],
    ["A plan of 3 steps to review: 2 send nothing, then 1 sends.", words],
  );
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
 * `start_playbook` (00357, as 00416 replaced it) for a database in memory: the row the door writes, of the columns it
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
