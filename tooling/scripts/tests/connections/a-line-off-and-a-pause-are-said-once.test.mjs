/**
 * A switched-off line and a paused workspace are each said ONCE (finding D1-line-off-words).
 *
 * Four pages told a switched-off phone line four ways -- Connections "calls are picked up without your facts", Live
 * "the receptionist is not picking up", Start "the receptionist is not answering it", Today's red alert "messages
 * coming in are not being answered" -- and a paused workspace three: the shell and the bell "calls are answered only
 * to take a message", Today "the receptionist is not answering anything", Start "nothing is answered". Only the first of
 * each is what the code does, and what the code does is read here from the edge, not from a page: a call to a line that
 * is off is routed to nobody and still picked up (the answer is always 200; the receptionist is handed the shell's "no
 * facts" variables and the call is dead-lettered), and a call to a paused workspace is answered with the take-a-message
 * script.
 *
 * So contracts holds one standing value per state (lines/caller-gets.ts: what a caller gets, and its tone), and this file
 * draws every page's words for the two states over their real view models and holds them to it: each page's sentence
 * carries the value, and none says "not answering", "not picking up" or "nothing is answered" of a state whose value says
 * the call is picked up. A page that grows a sentence of its own for either state is a red build.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as C from "@chanlytics/contracts";
import { FACTS_UNAVAILABLE, GREETING_DEFAULT } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";
import { installLegacyReact, fresh, again, textOf } from "../_legacy-react.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

const NOW = new Date("2026-09-14T14:00:00Z");
const NOW_MS = NOW.getTime();
const ZONE = "America/New_York";
const VOICE = "+13055550123";

/** Every sentence a view model holds: its strings, however deep. Pages draw these and add none of their own. */
const words = (value, out = []) => {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object") for (const v of Object.values(value)) words(v, out);
  return out;
};

/**
 * A page's words that say the receptionist is not picking up, not answering, or that nothing is answered. "Not answering
 * yet" is Start's own milestone (the receptionist is not set up to answer with the business's facts), not a claim about
 * what a caller gets, and is left to it.
 */
const CONTRADICTION =
  /not (picking up|answering)(?! yet)|nothing (is |gets )?(being )?answered|not being answered|go(es)? unanswered/i;
const contradicting = (strings) => strings.filter((s) => CONTRADICTION.test(s));

const channelDto = (kind, over = {}) => ({
  id: `ch-${kind}`,
  kind,
  number_e164: kind === "voice" ? VOICE : "+13055550188",
  status: "disabled",
  created_at: "2026-09-01T00:00:00Z",
  last_inbound_at: null,
  ...over,
});

/* ------------------------------ what the code does ------------------------------ */

const BRAIN = {
  business_name: "Harbor Moving",
  booking_link: "https://book.example/harbor",
  system_prompt: "Answer as the front desk of Harbor Moving: brief and warm, and never guess a price.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
  profile: { hours: { mon: { open: "09:00", close: "17:00" } } },
};
let seq = 0;
/** An agent and a workspace of this file's own: the channel resolver and the runtime loader cache by them. */
const fresh_ = () => {
  seq += 1;
  return { agent: `agent_off_${seq}`, tenant: `aaaaaaaa-aaaa-4aaa-8aaa-${String(seq).padStart(12, "0")}` };
};
const worldOf = (w, { line = "active", workspace = "active" } = {}) =>
  fakeDb(
    {
      tenant_channels: [
        {
          id: `ch-${w.agent}`,
          tenant_id: w.tenant,
          kind: "voice",
          external_id: w.agent,
          number_e164: VOICE,
          credentials_ref: null,
          config: {},
          status: line,
        },
      ],
      tenant_config: [{ tenant_id: w.tenant, config: { brain: BRAIN } }],
      policies: [],
      tenants: [{ id: w.tenant, name: "Harbor", timezone: ZONE, status: workspace }],
      google_listings: [],
      contacts: [],
      conversations: [],
      messages: [],
    },
    {},
    { runtime_stamp: () => "stamp-1" },
  );

let planCallStartWithin;
before(async () => {
  ({ planCallStartWithin } = await import(at("apps/edge/lib/voice/call-start.ts")));
});
const callTo = async (db, w) => {
  const r = await planCallStartWithin({ agentId: w.agent, from: "+16465550123", db, now: NOW });
  assert.equal(r.late, false);
  return r;
};

test("what the edge does, which the two standing values are read from: a call to a line that is off is still picked up, without the business's facts; one to a paused workspace takes a message", async () => {
  // OFF: the routing answers nobody for a channel that is not active (db routing.ts), so the call is "unrouted" -- and a
  // call is never refused (inbound-call.ts: past the key the answer is always 200): the receptionist is handed the
  // shell's own "no facts" words, a greeting that names nobody, and the platform is told. The call's later webhooks find
  // no workspace and are dead-lettered (call-webhook.ts), which is why it is not recorded.
  const off = fresh_();
  const r = await callTo(worldOf(off, { line: "disabled" }), off);
  assert.deepEqual([r.facts, r.alert], ["unrouted", true], "routed to nobody, and the platform is told");
  assert.equal(r.variables.business_facts, FACTS_UNAVAILABLE, "picked up, with no facts to answer from");
  assert.equal(r.variables.greeting, GREETING_DEFAULT, "and the caller is greeted, not refused");
  assert.equal(r.tenantId, null, "so nothing of the call is kept under the workspace");

  // PAUSED: the workspace is routed and read, and its whole prompt for the call is the take-a-message script.
  const paused = fresh_();
  const p = await callTo(worldOf(paused, { workspace: "paused" }), paused);
  assert.equal(p.facts, "paused");
  assert.equal(p.variables.business_facts, C.pausedVoiceFacts("Harbor Moving"));
  assert.equal(p.variables.greeting, C.pausedGreetingFor("Harbor Moving"));
  assert.equal("handoff_number" in p.variables, false, "and nobody is put through");

  // The values say exactly that, and no more than that.
  assert.match(C.PHONE_LINE_OFF.gets, /picked up/);
  assert.match(C.PHONE_LINE_OFF.gets, /without your facts/);
  assert.match(C.PHONE_LINE_OFF.gets, /not recorded/);
  assert.match(C.WORKSPACE_PAUSED.gets, /answered only to take a message/);
  assert.match(C.WORKSPACE_PAUSED.gets, /new messages wait in the Inbox/);
});

test("the standing values: what a caller gets and the tone it is drawn in, once", () => {
  assert.equal(C.PHONE_LINE_OFF.state, "line_off");
  assert.equal(C.PHONE_LINE_OFF.tone, "warn", "a line the owner switched off or let lapse: a person should look");
  assert.equal(C.WORKSPACE_PAUSED.state, "workspace_paused");
  assert.equal(C.WORKSPACE_PAUSED.tone, "danger", "the whole receptionist has stopped for billing");
  assert.equal(
    C.callerSentence(C.WORKSPACE_PAUSED),
    "Calls are answered only to take a message, and new messages wait in the Inbox for you to answer.",
    "the sentence that stands alone is the clause, capitalised and stopped",
  );
  assert.equal(C.PAUSED_WORDS, C.callerSentence(C.WORKSPACE_PAUSED), "billing's PAUSED_WORDS is the value, not a copy");
  // A line that carries text, not calls: what a message to it gets is a different, equally plain, fact.
  assert.equal(C.lineOffGets("voice", "call"), C.PHONE_LINE_OFF, "the phone line is the one value");
  const texting = C.lineOffGets("sms", "message");
  assert.equal(texting.gets, "messages to it are neither answered nor recorded");
  assert.equal(texting.tone, C.PHONE_LINE_OFF.tone);
  assert.equal(C.lineOffGets("email", "email").gets, "emails to it are neither answered nor recorded");
});

/* ------------------------------ a switched-off phone line ------------------------------ */

test("Connections: the phone line row says what a caller gets, in the tone the value gives", () => {
  const voice = C.toChannelVM(channelDto("voice"), NOW);
  assert.equal(voice.healthLabel, `Switched off — ${C.PHONE_LINE_OFF.gets}; Chanlytics is told, you are not`);
  const row = C.connectionRows(
    {
      channels: [voice],
      whatsapp: null,
      lines: { rows: [], ready: false },
      lineRequestedAt: null,
      google: null,
      calendar: null,
    },
    NOW_MS,
  ).find((r) => r.kind === "phone");
  assert.equal(row.state, "off");
  assert.equal(row.sentence, voice.healthLabel);
  assert.equal(row.tone, C.PHONE_LINE_OFF.tone, "the row's tone is the value's");
  assert.deepEqual(contradicting(words(row)), []);
  // Text and WhatsApp are told from the same function, each with its own noun.
  const wa = C.toChannelVM(channelDto("whatsapp"), NOW);
  assert.equal(
    wa.healthLabel,
    `Switched off — ${C.lineOffGets("whatsapp", "message").gets}; Chanlytics is told they are arriving, you are not`,
  );
});

test("Live: the line note says what a caller gets, and the page draws the view model's sentence", async () => {
  const vm = C.toLiveVM([], [channelDto("voice")], ZONE, NOW);
  assert.equal(vm.line.on, false);
  assert.equal(vm.line.offWords, `The line is switched off — ${C.PHONE_LINE_OFF.gets}.`);
  assert.deepEqual(contradicting(words(vm)), []);

  installLegacyReact({ __DEMO_MODE: false });
  const { LrList } = await import(at("apps/dashboard/src/surfaces/live/list.tsx"));
  fresh();
  const drawn = textOf(
    again(() => LrList({ live: [], line: vm.line, lineRead: true, activeId: null, elapsedOf: () => 0, onSelect() {} })),
  );
  assert.ok(drawn.includes(vm.line.offWords), `the page draws the sentence the view model holds: ${drawn}`);
  assert.deepEqual(contradicting([drawn]), [], "and says nothing of its own about the receptionist not picking up");
  // On, it says the line is on and nothing about what an off line does.
  const on = C.toLiveVM([], [channelDto("voice", { status: "active" })], ZONE, NOW);
  assert.ok(
    !textOf(
      again(() =>
        LrList({ live: [], line: on.line, lineRead: true, activeId: null, elapsedOf: () => 0, onSelect() {} }),
      ),
    ).includes("switched off"),
  );
});

const startInputs = (over = {}) => ({
  business: {
    name: "Northside Movers",
    hours: true,
    services: 4,
    bookingLink: true,
    address: true,
    handoff: null,
    broken: false,
    receptionist: "set",
  },
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: true, active: false, number: VOICE, lastInboundAt: null },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 0 },
  consent: { yes: 0, offers: 0, offersSaidYes: 0 },
  requests: { line: null },
  later: [],
  ...over,
});
const stepOf = (vm, id) => vm.rows.find((r) => r.id === id);

test("Start: the line row says what a caller gets, and no Start sentence says the receptionist is not answering", () => {
  const vm = C.setupSteps(startInputs(), NOW_MS);
  assert.equal(
    stepOf(vm, "line").sentence,
    `Your line ${C.formatPhoneDisplay(VOICE)} is switched off — ${C.PHONE_LINE_OFF.gets}.`,
  );
  assert.deepEqual(contradicting(words(vm)), [], "the whole page, every row and detail");
});

const metrics = ({ channels, status = "active" }) => ({
  workspace: { name: "Marisa's Beauty Salon", timezone: ZONE, status },
  channels,
  window: {
    days: 1,
    since: "2026-09-14T04:00:00+00:00",
    since_local: "2026-09-14T00:00:00",
    now_local: "2026-09-14T10:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: null,
    last_outbound_at: null,
  },
  period: {
    messages_in: 0,
    messages_out_ai: 0,
    messages_out_you: 0,
    conversations_active: 0,
    answered_by_ai: 0,
    answered_by_you: 0,
    unanswered_in_window: 0,
    median_reply_seconds_ai: null,
    send_failures: 0,
    escalations_new: 0,
    escalation_reasons: {},
    calls: 0,
    call_seconds: 0,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
  },
});
const WA = { kind: "whatsapp", status: "active", number: "+13055550188" };

test("Today: the red alert and the empty queue say what a caller gets of a dark phone line, wire by wire", () => {
  const vm = C.toTodayVM(
    metrics({ channels: [WA, { kind: "voice", status: "disabled", number: VOICE }] }),
    [],
    [],
    [],
    NOW,
  );
  assert.equal(vm.standing.alert, `Phone line is disconnected — ${C.PHONE_LINE_OFF.gets}.`);
  assert.equal(vm.queue.empty.title, `Nothing in the queue. ${vm.standing.alert}`);
  assert.equal(vm.queue.empty.testid, "today-queue-empty-down", "and it is still the warning, never the reassurance");
  assert.deepEqual(contradicting(words(vm)), []);
  // Two dark lines are two true sentences, each about its own wire.
  const two = C.toTodayVM(
    metrics({
      channels: [
        { kind: "sms", status: "disabled", number: "+13055550124" },
        { kind: "voice", status: "disabled", number: VOICE },
      ],
    }),
    [],
    [],
    [],
    NOW,
  );
  assert.equal(
    two.standing.alert,
    `Texting is disconnected — ${C.lineOffGets("sms", "message").gets}. Phone line is disconnected — ${C.PHONE_LINE_OFF.gets}.`,
  );
});

/* ------------------------------ a paused workspace ------------------------------ */

test("Today: a paused workspace says what a caller gets, in the alert and in the empty queue", () => {
  const vm = C.toTodayVM(metrics({ channels: [WA], status: "paused" }), [], [], [], NOW);
  assert.equal(vm.standing.alert, `This workspace is paused. ${C.PAUSED_WORDS}`);
  assert.equal(vm.queue.empty.title, `Nothing in the queue — the workspace is paused. ${C.PAUSED_WORDS}`);
  assert.equal(vm.queue.empty.testid, "today-queue-empty-paused");
  assert.deepEqual(contradicting(words(vm)), []);
});

test("Start: the billing row of a paused receptionist says what a caller gets", () => {
  const billing = {
    ready: true,
    livemode: true,
    mode: "stripe",
    status: "paused",
    trial_end: null,
    current_period_end: null,
    trial_days: 14,
  };
  const vm = C.setupSteps(
    startInputs({
      channels: {
        whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
        voice: { present: true, active: true, number: VOICE, lastInboundAt: null },
      },
      billing,
    }),
    NOW_MS,
  );
  assert.equal(stepOf(vm, "billing").sentence, `Your receptionist is paused. ${C.PAUSED_WORDS}`);
  assert.deepEqual(contradicting(words(vm)), []);
});

test("the shell's status line, the bell and the back office say the same sentence, in the value's tone", () => {
  const line = C.shellStatusLine({ stale: false, degraded: [], paused: true });
  assert.equal(line.detail, C.PAUSED_WORDS);
  assert.equal(line.tone, C.WORKSPACE_PAUSED.tone, "the shell's line is drawn in the value's tone");

  const SUB = {
    id: "sub_1",
    status: "paused",
    price_id: "price_1",
    current_period_end: null,
    trial_end: null,
    cancel_at: null,
    cancel_at_period_end: false,
    card_brand: null,
    card_last4: null,
  };
  const plan = C.planBilling({ mode: "stripe", status: "trialing", tenant_status: "active" }, SUB, NOW_MS);
  assert.ok(plan.bell.body.includes(C.PAUSED_WORDS), plan.bell.body);

  const tenant = (over) => ({
    tenant_id: "t1",
    slug: "harbor",
    name: "Harbor Moving",
    status: "active",
    timezone: ZONE,
    created_at: "2026-06-01T00:00:00Z",
    members: 2,
    billing_mode: "direct",
    billing_status: null,
    trial_end: null,
    current_period_end: null,
    line_e164: VOICE,
    line_kind: "chanlytics",
    voice_state: "answering",
    sms_state: "none",
    reg_step: null,
    reg_mock: null,
    reg_sole_prop: null,
    line_error: null,
    whatsapp_number: null,
    whatsapp_active: false,
    voice_number: VOICE,
    voice_active: true,
    last_inbound_at: null,
    ...over,
  });
  // Paused on purpose, and paused by billing (whose verdict outranks the pause, and which says what is coming first).
  const rows = C.platformRows(
    [
      tenant({ slug: "deliberate", status: "paused" }),
      tenant({ slug: "lapsed", billing_mode: "stripe", billing_status: "unpaid" }),
      tenant({ slug: "failing", billing_mode: "stripe", billing_status: "past_due" }),
    ],
    NOW_MS,
  );
  const [deliberate, lapsed, failing] = ["deliberate", "lapsed", "failing"].map((s) => rows.find((r) => r.slug === s));
  assert.equal(deliberate.verdict, "paused");
  // Its reader is Chanlytics staff: what a call gets, from the value's own clause, and nothing said "for you".
  assert.equal(deliberate.sentence, "The workspace is paused, by design: calls are answered only to take a message.");
  assert.ok(C.WORKSPACE_PAUSED.gets.startsWith("calls are answered only to take a message"));
  assert.deepEqual([lapsed.verdict, failing.verdict], ["billing", "billing"]);

  assert.deepEqual(
    contradicting([
      line.detail,
      plan.bell.title,
      plan.bell.body,
      deliberate.sentence,
      lapsed.sentence,
      failing.sentence,
    ]),
    [],
  );
});

/* ------------------------------ the check has teeth ------------------------------ */

test("the sweep fails the sentences the pages used to say", () => {
  // These are the literals the four pages carried before this file; the sweep above must flag each of them.
  for (const old of [
    "The line is switched off — the receptionist is not picking up.",
    "Your line +1 (305) 555-0123 is switched off — the receptionist is not answering it.",
    "This workspace is paused — the receptionist is not answering anything.",
    "Nothing in the queue — the workspace is paused, so nothing is being answered.",
    "Your receptionist is paused: messages land in the Inbox, nothing is answered.",
    "Phone line is disconnected — messages coming in are not being answered.",
  ]) {
    assert.deepEqual(contradicting([old]), [old]);
  }
  // And it does not flag what is true of a line that carries text, what the values say, or Start's milestone.
  for (const fine of [
    C.lineOffGets("sms", "message").gets,
    `Switched off — ${C.PHONE_LINE_OFF.gets}`,
    C.PAUSED_WORDS,
    "Your receptionist is not answering yet.",
  ]) {
    assert.deepEqual(contradicting([fine]), [], fine);
  }
});
