/**
 * The calendar closing its loop through Outbound: a reminder the day before
 * an appointment, a thank-you with the booking link the day after a visit.
 * Day-keyed by the calendar's own clock, one message per visit, exempt from
 * the gap and the week's breath, the visit's own words in the slots.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIFECYCLE_WORDS,
  MOMENT_TRIGGERS,
  momentOffered,
  PLAYBOOK_CLASS_LABEL,
  stateOf,
  channelsReady,
  eligibleForPlaybook,
  playbookRunReach,
  scheduleLine,
  triggerOf,
  visitFactsFor,
  toPersonRowVM,
  parseParamSpec,
  resolveParams,
  exampleParams,
  PARAM_SOURCE_LABELS,
  starterForTrigger,
  starterDraft,
  starterText,
  visitDateKey,
  visitStartTime,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";
import { installLegacyReact, fresh, find, byTestId, textOf } from "../_legacy-react.mjs";

/**
 * How a run goes (step 3, contracts reachFor): by WhatsApp alone, which the workspace can send on, as every playbook went
 * before it ticked channels.
 */
const HOW = {
  channels: ["whatsapp"],
  ready: channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: null,
    email: { mailbox: false, domain: false },
  }),
};
// 10:00 in New York on Sunday 6 September 2026.
const NOW = new Date("2026-09-06T14:00:00Z");
const nowMs = NOW.getTime();
const TZ = "America/New_York";
const H = 3_600_000,
  D = 24 * H;
const iso = (msAgo) => new Date(nowMs - msAgo).toISOString();

function dto(id, over = {}) {
  return {
    id,
    display_name: `Person ${id}`,
    wa_profile_name: null,
    phone_e164: `+1305555${id.padStart(4, "0")}`,
    consent: "opted_in",
    consent_source: "keyword",
    consent_updated_at: iso(30 * D),
    dnc: false,
    marketing_consent: "opted_in",
    marketing_consent_source: "customer_message",
    marketing_consent_updated_at: iso(30 * D),
    channels: ["whatsapp"],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: `cv-${id}`,
    latest_state: "open",
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: iso(3 * D),
    last_message_at: iso(3 * D),
    last_message_direction: "inbound",
    last_message_sender: "customer",
    last_inbound_text: "hi",
    last_inbound_at: iso(3 * D),
    last_call_at: null,
    last_inbound_call_at: null,
    last_inbound_call_summary: null,
    call_count: 0,
    call_seconds: 0,
    first_contact_at: iso(60 * D),
    earliest_row_at: iso(60 * D),
    has_backfill: false,
    has_chat: true,
    queued_reply_at: null,
    effective_reply_mode: "auto",
    visits: null,
    ...over,
  };
}
const visit = (startIso, title, hours = 1) => ({
  id: `v-${startIso}`,
  start: startIso,
  end: new Date(Date.parse(startIso) + hours * H).toISOString(),
  title,
  all_day: false,
  via: "phone",
});
const withVisits = (id, next, last, over = {}) =>
  toPersonRowVM(
    dto(id, { visits: { timezone: TZ, source: "Google Calendar", state: "ok", next, last }, ...over }),
    TZ,
    NOW,
  );
const untouched = { byThis: new Map(), byAny: new Map() };

/* ---- the composer, drawn: TSX since decision 0015, on the stub React over the view model the seam hands the page ---- */

installLegacyReact({ __DEMO_MODE: false });
const SRC = "../../../../apps/dashboard/src";
// The shell's own components the composer draws by name (PolicyChip, the record kit's sheet), loaded as the app loads them.
await import(`${SRC}/legacy/components/data-bits.jsx`);
Object.assign(globalThis, {
  canDo: () => true,
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
  __chrome: { state: stateOf },
});
// The Autonomy store as the app builds it, over the workspace's own rows: the booking class has its row.
const { installPolicyStore } = await import(`${SRC}/legacy-bridge/policy-store.ts`);
installPolicyStore(globalThis);
globalThis.__POLICIES = { role: "owner", rows: [{ class: "booking", mode: "auto", limits: {} }], dealsOn: false };
const { PlaybookComposer } = await import(`${SRC}/surfaces/campaigns/playbooks/composer.tsx`);
const { CmRuleWord } = await import(`${SRC}/surfaces/campaigns/parts/rule.tsx`);
const { setSurfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);
/** The playbooks surface as the bridge publishes it: every moment offered, none set up, the reminder approved. */
const playbooksVM = (over = {}) => {
  const reminder = starterForTrigger("visit_tomorrow");
  const words = starterText(reminder, "en_US");
  return {
    rows: [],
    timezone: TZ,
    countsRead: true,
    calendar: "ok",
    // How the business works (the surface's shape, 9 Oct 2026): the words this file pins are the word "visit"'s.
    shape: { calendar: "feed", dealsOn: true, word: "visit" },
    triggers: MOMENT_TRIGGERS.map((t) => ({
      id: t.id,
      label: t.label,
      hint: t.hint,
      cls: t.cls,
      list: t.list,
      kind: t.kind,
      // 2 Oct 2026: the surface says which moments a NEW playbook may start from (surface.ts), as contracts does.
      offered: momentOffered(t, { dealsOn: true, calendarOn: true }),
      candidates: 3,
      held: 0,
      named: null,
    })),
    lists: [],
    templates: [
      {
        id: "tpl-visit_reminder",
        channel: "whatsapp",
        name: reminder.name,
        language: "en_US",
        meta_status: "approved",
        category: reminder.category,
        purpose: "conversational",
        source: "starter",
        title: null,
        body_preview: words.body,
        variables: words.slots.map((x, i) => ({ position: i + 1, label: x.label, example: x.example })),
      },
    ],
    number: { present: true, health: { canSend: true } },
    businessName: "Northside Studio",
    bookingLink: true,
    replyWindow: "24 hours",
    fetchedAt: nowMs,
    ...over,
  };
};
/**
 * The composer on the visit reminder's moment, as the home's sheet draws it for a Turn on pressed there
 * (campaigns/new:moment:visit_tomorrow), over a calendar that is `calendar`.
 */
const composingVisit = (calendar) => {
  const data = playbooksVM({ calendar });
  setSurfaceValue("playbooks", data);
  fresh();
  return PlaybookComposer({ data, editing: null, initialTrigger: "visit_tomorrow", onDone() {}, onCancel() {} });
};

test("the moments: People's lists and a cadence, two the calendar makes possible, Lapsed, the workspace's own lists and a proposal waiting, each under one of the four autonomy rows", () => {
  assert.deepEqual(
    MOMENT_TRIGGERS.map((t) => t.id),
    [
      "quiet_30",
      "new_week",
      "phoned_only",
      "everyone_monthly",
      "visit_tomorrow",
      "visited",
      "lapsed",
      "saved_list",
      "proposal_waiting",
    ],
  );
  assert.deepEqual(
    MOMENT_TRIGGERS.map((t) => t.kind),
    ["list", "list", "list", "cadence", "visit", "visit", "list", "saved", "deal"],
  );
  assert.equal(
    triggerOf("visit_tomorrow").cls,
    "booking",
    "the same setting that governs bookings governs their reminders",
  );
  // 2 Oct 2026: the visit follow-up asks how it went and offers nothing, so it runs under Bookings as the reminder does.
  assert.equal(triggerOf("visited").cls, "booking");
  assert.equal(PLAYBOOK_CLASS_LABEL.booking, "Bookings");
  assert.equal(
    scheduleLine({ trigger: "visit_tomorrow", run_hour: 10, cap_per_run: 25, gap_days: 90, cadence_days: 30 }, "visit"),
    "Daily 10:00 AM · everyone with a visit tomorrow · up to 25",
  );
  assert.equal(
    scheduleLine({ trigger: "visited", run_hour: 18, cap_per_run: 25, gap_days: 90, cadence_days: 30 }, "visit"),
    "Daily 6:00 PM · everyone who visited yesterday · up to 25",
  );
  assert.equal(
    scheduleLine({ trigger: "quiet_30", run_hour: 10, cap_per_run: 25, gap_days: 90, cadence_days: 30 }, "visit"),
    "Daily 10:00 AM · up to 25 · once per person, again after 90 days",
    "the old lines are the old lines",
  );
});

test("a visit's day is the calendar's day: eleven at night tomorrow is still tomorrow, nine in the morning the day after is not", () => {
  const lateTomorrow = withVisits("a", visit("2026-09-08T03:00:00Z", "Balayage"), null); // Mon 7 Sep, 11:00 PM New York
  const dayAfter = withVisits("b", visit("2026-09-08T13:00:00Z", "Gloss"), null); // Tue 8 Sep, 9:00 AM New York
  const today = withVisits("c", visit("2026-09-06T20:00:00Z", "Trim"), null); // Sun 6 Sep, 4:00 PM New York
  const earlyTomorrow = withVisits("d", visit("2026-09-07T12:30:00Z", "Cut"), null); // Mon 7 Sep, 8:30 AM New York
  assert.equal(lateTomorrow.nextVisitDate, "2026-09-07");
  assert.equal(lateTomorrow.calendarTz, TZ);
  const p = { trigger: "visit_tomorrow", cap_per_run: 25, gap_days: 90, cadence_days: 30, ...HOW };
  assert.deepEqual(
    eligibleForPlaybook([lateTomorrow, dayAfter, today, earlyTomorrow], p, untouched, nowMs).map((r) => r.id),
    ["d", "a"],
    "tomorrow's visits, earliest first",
  );
  assert.deepEqual(
    eligibleForPlaybook([lateTomorrow, earlyTomorrow], { ...p, cap_per_run: 1 }, untouched, nowMs).map((r) => r.id),
    ["d", "a"],
    "the cap is a fatigue limit for offers: a reminder is owed to everyone with a visit tomorrow",
  );
  const noCalendar = toPersonRowVM(dto("e"), TZ, NOW);
  assert.deepEqual(eligibleForPlaybook([noCalendar], p, untouched, nowMs), [], "no calendar, nobody");
  const notYes = withVisits("f", visit("2026-09-07T15:00:00Z", "Cut"), null, { consent: "unknown" });
  assert.deepEqual(
    eligibleForPlaybook([notYes], p, untouched, nowMs),
    [],
    "a reminder is still a message: only to people who said yes",
  );

  // AND the yes it needs is the one about appointments, not the one about
  // offers. This is the loss the consent split repairs: a customer with a visit
  // on the calendar tomorrow was skipped with `not_opted_in` unless they had
  // also asked for promotions.
  const noOffers = withVisits("g", visit("2026-09-07T15:00:00Z", "Cut"), null, { marketing_consent: "unknown" });
  assert.deepEqual(
    eligibleForPlaybook([noOffers], p, untouched, nowMs).map((r) => r.id),
    ["g"],
    "their own appointment reaches them without a yes about offers",
  );
});

test("a reminder's yes with no number to send to is a yes: who said it is counted by the yes a reminder needs, the one about their visit", () => {
  const p = { trigger: "visit_tomorrow", cap_per_run: 25, gap_days: 90, cadence_days: 30, ...HOW };
  // A visit tomorrow, a yes to messages and none to offers, and no number: the reminder cannot reach them.
  const noNumber = withVisits("h", visit("2026-09-07T15:00:00Z", "Cut"), null, {
    marketing_consent: "unknown",
    phone_e164: null,
  });
  const drawn = playbookRunReach([noNumber], p, untouched, nowMs);
  assert.deepEqual([drawn.reach.pool, drawn.reach.will, drawn.reach.noNumber], [1, 0, 1]);
  assert.equal(drawn.saidYes, 1, "the yes it needs is theirs; what is missing is a number (#663's rule)");
});

test("by email a visit's message is about their own visit (decision D1): it asks an address and no yes, and only a STOP or a dead address holds it; an unsubscribe from offers does not", () => {
  const byEmail = {
    channels: ["email"],
    ready: channelsReady({ whatsapp: null, textLine: null, email: { mailbox: true, domain: true } }),
  };
  const run = (trigger, rows) =>
    playbookRunReach(
      rows,
      { trigger, cap_per_run: 25, gap_days: 90, cadence_days: 30, message: null, ...byEmail },
      untouched,
      nowMs,
      null,
    );
  // An address and nothing else on record: no yes of any kind, no number, no relationship, nobody they have dealt with.
  const nothing = { consent: "unknown", marketing_consent: "unknown", phone_e164: null, email: "ana@example.com" };
  const tomorrow = (id, over) => withVisits(id, visit("2026-09-07T15:00:00Z", "Cut"), null, { ...nothing, ...over });
  const yesterday = (id, over) =>
    withVisits(id, null, visit("2026-09-06T00:00:00Z", "Balayage"), { ...nothing, ...over });
  assert.equal(tomorrow("a").consent.relationship, false, "the fixture is nobody the business has dealt with");
  const reminder = run("visit_tomorrow", [tomorrow("a")]);
  assert.deepEqual(
    [reminder.reach.pool, reminder.reach.will, reminder.reach.noYes, reminder.reach.by_channel.email],
    [1, 1, 0, 1],
    "the reminder reaches them by email with no yes",
  );
  assert.deepEqual(reminder.channelOf, { a: "email" });
  assert.equal(run("visited", [yesterday("b")]).reach.will, 1, "so does the check after the visit");
  // Their unsubscribe from offers by email is no request to stop hearing about their own visit; a STOP is.
  assert.equal(run("visit_tomorrow", [tomorrow("c", { email_marketing: "opted_out" })]).reach.will, 1);
  const stopped = run("visit_tomorrow", [tomorrow("d", { consent: "opted_out" }), tomorrow("e", { dnc: true })]);
  assert.deepEqual([stopped.reach.will, stopped.reach.stopped], [0, 2]);
  // A bounced address is no address.
  const bounced = run("visit_tomorrow", [tomorrow("f", { email_suppressed_at: iso(3 * D) })]);
  assert.deepEqual([bounced.reach.will, bounced.reach.address_stopped], [0, 1]);
  // Any other moment is the business's own news, and these run on lists and cadences as offers: by email they wait for the
  // workspace's offers to open (a read with no facts about offers is closed), so the same person is held, not reached.
  const month = run("everyone_monthly", [tomorrow("g", { marketing_consent: "opted_in" })]);
  assert.deepEqual(
    [month.reach.pool, month.reach.will, month.reach.no_channel],
    [1, 0, 1],
    "no visit of theirs is behind it",
  );
});

test("after the visit: yesterday's visit with nothing booked next; the gap and the week's breath do not apply to either", () => {
  const yesterday = withVisits("a", null, visit("2026-09-06T00:00:00Z", "Balayage")); // Sat 5 Sep, 8:00 PM New York
  const yesterdayRebooked = withVisits(
    "b",
    visit("2026-09-20T15:00:00Z", "Gloss"),
    visit("2026-09-05T22:00:00Z", "Balayage"),
  );
  const twoDaysAgo = withVisits("c", null, visit("2026-09-04T18:00:00Z", "Cut"));
  const p = { trigger: "visited", cap_per_run: 25, gap_days: 90, cadence_days: 30, ...HOW };
  assert.deepEqual(
    eligibleForPlaybook([yesterday, yesterdayRebooked, twoDaysAgo], p, untouched, nowMs).map((r) => r.id),
    ["a"],
  );
  const heardThisWeek = { byThis: new Map([["a", nowMs - 2 * D]]), byAny: new Map([["a", nowMs - 1 * D]]) };
  assert.deepEqual(
    eligibleForPlaybook([yesterday], p, heardThisWeek, nowMs).map((r) => r.id),
    ["a"],
    "the reminder two days ago does not hold the thank-you",
  );
  const tomorrow = withVisits("d", visit("2026-09-07T19:00:00Z", "Cut"), null);
  assert.deepEqual(
    eligibleForPlaybook([tomorrow], { ...p, trigger: "visit_tomorrow" }, heardThisWeek, nowMs).map((r) => r.id),
    ["d"],
    "nor does the month's offer hold a reminder",
  );

  // 2 Oct 2026: both visit playbooks are classed `booking`: the visit follow-up asks how it went and offers nothing (it was a
  // re-engagement, and its "book your next visit" made it an offer). So with no message in view the yes it needs is
  // the one about their own visit, as the reminder's is. With the message in view (a playbook made before the change,
  // still sending the marketing thank-you) the stricter of the class and the message holds: only a yes to offers.
  const noOffers = withVisits("e", null, visit("2026-09-06T00:00:00Z", "Balayage"), { marketing_consent: "unknown" });
  assert.deepEqual(
    eligibleForPlaybook([noOffers], { ...p, message: null }, untouched, nowMs).map((r) => r.id),
    ["e"],
    "their own visit reaches them without a yes about offers",
  );
  assert.deepEqual(
    eligibleForPlaybook([noOffers], { ...p, message: { category: "marketing" } }, untouched, nowMs),
    [],
    "the thank-you that asks them to rebook is an offer: it does not enrol who never said yes to offers",
  );
  assert.deepEqual(
    eligibleForPlaybook([noOffers], { ...p, message: { category: "utility" } }, untouched, nowMs).map((r) => r.id),
    ["e"],
    "a message about the visit reaches them",
  );
});

/* ---- A visit found by name alone is a guess: a message is never sent on one (the 4 Oct 2026 wiring review, P1 1) ---- */

/** The visit as the calendar matched it: by `via`, which the receptionist says to a person and a run must weigh. */
const foundBy = (via, v) => ({ ...v, via });
const TOMORROW = visit("2026-09-07T15:00:00Z", "Balayage · Maria Lopez");
const YESTERDAY = visit("2026-09-06T00:00:00Z", "Balayage · Maria Lopez");

test("a row carries how its visits were found, and none without a visit", () => {
  const r = withVisits("a", foundBy("name", TOMORROW), foundBy("email", YESTERDAY));
  assert.deepEqual([r.nextVisitVia, r.lastVisitVia], ["name", "email"]);
  const none = toPersonRowVM(dto("b"), TZ, NOW);
  assert.deepEqual([none.nextVisitVia, none.lastVisitVia], [null, null]);
});

test("a visit found by name alone enrols only on a full saved name no one else holds: a number or an address is exact, a first name never is", () => {
  const p = { trigger: "visit_tomorrow", cap_per_run: 25, gap_days: 90, cadence_days: 30, ...HOW };
  const who = (id, via, name, over = {}) =>
    withVisits(id, foundBy(via, TOMORROW), null, { display_name: name, wa_profile_name: null, ...over });
  const reach = (rows) => playbookRunReach(rows, p, untouched, nowMs, null);
  const enrolled = (rows) => reach(rows).eligible.map((r) => r.id);

  // The client saved as "Maria" is not the Maria Lopez of this appointment: a first name never enrols.
  assert.deepEqual(enrolled([who("a", "name", "Maria")]), [], "a first name alone");
  assert.deepEqual(
    reach([who("a", "name", "Maria")]).reach.pool,
    0,
    "and is not even named: the visit is not known to be theirs",
  );
  assert.deepEqual(enrolled([who("a", "name", "Maria L.")]), [], "a first name and an initial is no full name");
  // The whole saved name, held by one person: enrolled.
  assert.deepEqual(enrolled([who("a", "name", "Maria Lopez")]), ["a"]);
  assert.deepEqual(enrolled([who("a", "name", "  maria   LOPEZ ")]), ["a"], "the same name however it is written");
  // The same full name held by two people in the workspace: which of them is it? Neither is reminded by it.
  assert.deepEqual(enrolled([who("a", "name", "Maria Lopez"), who("b", "name", "Maria Lopez")]), []);
  assert.deepEqual(
    enrolled([who("a", "name", "Maria Lopez"), who("b", "name", "Maria Lopez"), who("c", "phone", "Maria Lopez")]),
    ["c"],
    "the one whose number is on the event is reminded; her namesake is not",
  );
  // A number or an address is exact: a single name enrols as it always has.
  assert.deepEqual(enrolled([who("a", "phone", "Maria")]), ["a"]);
  assert.deepEqual(enrolled([who("a", "email", "Maria")]), ["a"]);
  // A name another person holds only as a WhatsApp name still counts as held.
  assert.deepEqual(
    enrolled([who("a", "name", "Maria Lopez"), who("b", "phone", null, { wa_profile_name: "Maria Lopez" })]),
    ["b"],
  );
});

test("after the visit: the same rule, read from the last visit's match", () => {
  const p = { trigger: "visited", cap_per_run: 25, gap_days: 90, cadence_days: 30, ...HOW };
  const who = (id, via, name) =>
    withVisits(id, null, foundBy(via, YESTERDAY), { display_name: name, wa_profile_name: null });
  const enrolled = (rows) => playbookRunReach(rows, p, untouched, nowMs, null).eligible.map((r) => r.id);
  assert.deepEqual(enrolled([who("a", "name", "Maria")]), []);
  assert.deepEqual(enrolled([who("a", "name", "Maria Lopez")]), ["a"]);
  assert.deepEqual(enrolled([who("a", "name", "Maria Lopez"), who("b", "name", "Maria Lopez")]), []);
  assert.deepEqual(enrolled([who("a", "phone", "Maria")]), ["a"]);
  assert.deepEqual(enrolled([who("a", "email", "Maria")]), ["a"]);
});

test("the message's service slot carries the service alone: a person's name never rides in it, and nothing left says \"your appointment\"", () => {
  const service = (title, names) =>
    visitFactsFor("visit_tomorrow", visit("2026-09-07T18:00:00Z", title), TZ, names)?.visit_service;
  const maria = ["Maria Lopez", null];
  assert.equal(service("Balayage · Maria Lopez", maria), "Balayage");
  assert.equal(service("Maria Lopez - Balayage", maria), "Balayage");
  assert.equal(service("Balayage (Maria Lopez)", maria), "Balayage");
  assert.equal(service("Haircut with Maria Lopez", maria), "Haircut");
  assert.equal(service("Haircut w/ Maria Lopez", maria), "Haircut");
  assert.equal(service("Colour for Maria Lopez - 2 hours", maria), "Colour · 2 hours");
  assert.equal(service("BALAYAGE | maria lopez", maria), "BALAYAGE", "in any case");
  assert.equal(service("Maria Lopez", maria), "your appointment", "nothing is left of it");
  assert.equal(service("Maria Lopez · ", maria), "your appointment");
  assert.equal(service("   ", maria), "your appointment");
  // A title that carries no name is the service as it stands, and a name that is only part of a word or a phrase is left.
  assert.equal(service("Balayage", maria), "Balayage");
  assert.equal(service("Lopez Salon cut", maria), "Lopez Salon cut");
  assert.equal(
    service("Mariana Lopez - Gloss", maria),
    "Mariana Lopez - Gloss",
    "another woman's name is not hers to strip",
  );
  // Every name the person is saved under comes out; a number or an address made words is no name to strip.
  assert.equal(service("Gloss · Mari Lopez · Maria Lopez", ["Maria Lopez", "Mari Lopez"]), "Gloss");
  assert.equal(service("Gloss · +1 305 555 0100", ["+1 305 555 0100"]), "Gloss · +1 305 555 0100");
  // A name of two letters is as likely a word of the service's; an apostrophe is a letter's own.
  assert.equal(service("Al - Gloss", ["Al"]), "Al - Gloss");
  assert.equal(service("Alan's Cuts", ["Alan"]), "Alan's Cuts");
  assert.equal(service("Consultation · Tom Baker", ["Tom Baker"]), "Consultation");
});

test("the visit's own words: when and what for, from the visit the run read", () => {
  assert.deepEqual(visitFactsFor("visit_tomorrow", visit("2026-09-07T18:00:00Z", "Balayage"), TZ, []), {
    visit_when: "tomorrow at 2:00 PM",
    visit_service: "Balayage",
  });
  assert.deepEqual(visitFactsFor("visited", visit("2026-09-05T18:00:00Z", "  "), TZ, []), {
    visit_when: "yesterday",
    visit_service: "your appointment",
  });
  assert.equal(visitFactsFor("quiet_30", visit("2026-09-07T18:00:00Z", "Balayage"), TZ, []), null);
  assert.equal(visitFactsFor("visit_tomorrow", null, TZ, []), null);
  assert.equal(visitStartTime({ start: "2026-09-07T18:00:00Z" }, TZ), "2:00 PM");
  assert.equal(visitDateKey("2026-09-08T03:00:00Z", TZ), "2026-09-07");
  assert.deepEqual(parseParamSpec("@visit_when"), { kind: "visit_when" });
  assert.deepEqual(parseParamSpec({ kind: "visit_service" }), { kind: "visit_service" });
  assert.equal(PARAM_SOURCE_LABELS.visit_when, "Their booked time");
  const specs = [{ kind: "first_name" }, { kind: "business_name" }, { kind: "visit_when" }, { kind: "visit_service" }];
  assert.deepEqual(
    resolveParams(specs, {
      firstName: "Ana",
      businessName: "Marisa's",
      bookingLink: null,
      visitWhen: "tomorrow at 2:00 PM",
      visitService: "a consultation",
    }),
    ["Ana", "Marisa's", "tomorrow at 2:00 PM", "a consultation"],
  );
  assert.deepEqual(
    resolveParams(specs, { firstName: "Ana", businessName: "Marisa's", bookingLink: null }).slice(2),
    ["", ""],
    "no facts, no words: the send holds the person rather than sending a blank",
  );
  assert.deepEqual(exampleParams(specs, "Marisa's").slice(2), ["tomorrow at 2:00 PM", "a consultation"]);
});

test("two starters written for the two moments: a utility reminder with the visit's words, a utility check on how it went, in both languages", () => {
  const reminder = starterForTrigger("visit_tomorrow");
  assert.equal(reminder.name, "visit_reminder");
  assert.equal(reminder.category, "utility", "a reminder of their own appointment is not marketing");
  assert.deepEqual(
    starterText(reminder, "en_US").slots.map((s) => s.kind),
    ["first_name", "business_name", "visit_when", "visit_service"],
  );
  assert.equal(starterText(reminder, "en_US").footer, null, "no opt-out line on a reminder");
  assert.ok(
    starterText(reminder, "es").body.includes("{{3}}") && starterText(reminder, "es").slots[2].label === "Cuándo",
  );
  // 2 Oct 2026: the thank-you that pushed a rebooking was an offer; its place asks how it went and offers nothing.
  const thanks = starterForTrigger("visited");
  assert.equal(thanks.name, "after_visit_check");
  assert.equal(thanks.category, "utility", "a check on the visit they had is not marketing: it runs under Bookings");
  assert.deepEqual(
    starterText(thanks, "en_US").slots.map((s) => s.kind),
    ["first_name", "business_name"],
  );
  assert.equal(starterText(thanks, "en_US").footer, null, "no opt-out line on a message about their own visit");
  const draft = starterDraft(reminder, "en_US");
  assert.deepEqual(draft.examples, ["Dani", "Luna Studio", "tomorrow at 2:00 PM", "a consultation"]);
});

test("the wiring: the CHECKs, the facts column, the runner attaching the calendar and keeping the words, the send reading them, the page and the assistant", () => {
  const mig = readRaw("supabase/migrations/00063_visit_playbooks.sql");
  assert.ok(
    mig.includes("'visit_tomorrow', 'visited'") &&
      mig.includes("('reengage', 'campaign', 'booking')") &&
      mig.includes("add column if not exists facts jsonb"),
  );
  const runner = readCode("apps/edge/lib/playbooks.ts");
  for (const s of [
    /feedItemsFor\(tenantId, url, tz, now, daysAhead\)/,
    // The pool's one reading (contracts audience-pool.ts): the visits, marked, and the rows over them.
    /visits = peopleVisitsOf\(\s*items,\s*rows,/,
    /poolRowsOf\(withVisitsOf\(rows, visits, \{ state: calendar,/,
  ])
    assert.ok(s.test(runner), String(s));
  const handler = readCode("packages/jobs/src/broadcast-send.ts");
  assert.ok(
    // The batch's read is packages/db queuedRecipients (step 3): the words and the channel their run picked for them,
    // read again without the channel on a database 00298 has not reached, run in before-the-channel-columns.test.mjs.
    handler.includes("queuedRecipients(db,"),
    "the row's own words ride the batch; the slots are filled from them (run in core-broadcast.test.mjs)",
  );
  const sd = readCode("apps/dashboard/src/surfaces/campaigns/playbooks/surface.ts");
  assert.ok(
    sd.includes("kind: t.kind") && sd.includes('calendar: pb.calendar ?? "none"'),
    "the page knows which triggers need the calendar, and whether there is one -- from the route that counts the pools",
  );
  // The composer is composer*.tsx (moved whole from outbound-real.jsx, Reach out Part 2.5), drawn on the visit moment.
  const composer = composingVisit("none");
  assert.ok(
    textOf(byTestId(composer, "pb-calendar")).includes(LIFECYCLE_WORDS.compose.calendar.words),
    "the composer says it plainly where there is no calendar, with its door (playbook-composer.test.mjs)",
  );
  assert.equal(byTestId(composingVisit("ok"), "pb-calendar"), null, "and says nothing where the calendar is connected");
  // The rule its runs keep is a word of the composer's sentence (Ruben, 11 Oct 2026), named by the moment's class.
  const runsUnder = find(byTestId(composer, "pb-recipe"), (n) => n.type === CmRuleWord);
  assert.equal(runsUnder?.props.cls, triggerOf("visit_tomorrow").cls, "the Autonomy row the reminder's runs keep to");
  assert.ok(
    !textOf(byTestId(composer, "pb-recipe")).includes(" a run") && byTestId(composer, "pb-cap") === null,
    "a visit moment has no cap and no gap: one message per visit",
  );
  // No gap and no breath promised for a visit trigger, and the card's count of the day's visits, are run in
  // playbook-composer.test.mjs; the preview's visit words are drawn there too. The assistant counts with the calendar
  // too: campaigns.playbooks runs over a feed in ask-turn.test.mjs, and the pool it counts from is read once a turn there.
});

/* ---- the run context: one workspace's bad read is one workspace's problem ---- */

const ctxDb = (over = {}, faults = {}, people = []) =>
  fakeDb(
    {
      tenants: [{ id: "t1", timezone: "America/New_York", status: "active" }],
      policies: [],
      tenant_channels: [],
      tenant_config: [],
      broadcasts: [
        {
          id: "b1",
          tenant_id: "t1",
          playbook_id: "p1",
          state: "sent",
          scheduled_for: "2026-09-10T12:00:00Z",
          created_at: "2026-09-10T12:00:00Z",
        },
      ],
      broadcast_recipients: [
        { broadcast_id: "b1", contact_id: "c1", tenant_id: "t1", state: "sent", sent_at: "2026-09-10T12:00:00Z" },
      ],
      ...over,
    },
    faults,
    { people_list: () => people },
  );

test("the touch history is read whole, and a workspace that cannot be read is RETURNED as an error, not thrown", async () => {
  const { loadTenantRunContext } = await import("../../../../apps/edge/lib/playbooks.ts");
  const now = new Date("2026-09-12T15:00:00Z");

  const ok = await loadTenantRunContext(ctxDb(), "t1", now);
  assert.ok(!("error" in ok), JSON.stringify(ok));
  assert.equal(ok.touches.byAny.size, 1, "the person a broadcast already reached");
  assert.equal(ok.touches.byThis.get("p1")?.size, 1, "and the playbook that reached them");

  // The hourly sweep calls this with no try/catch and reads `{ error }` to
  // count ONE workspace off and carry on (api/cron/playbooks.ts). A throw
  // escapes the whole handler, so one unreadable touch history would end the
  // tick for every workspace after it and skip the backlog note saying so.
  const bad = await loadTenantRunContext(
    ctxDb({}, { "sequence_sends.select": { message: "statement timeout" } }),
    "t1",
    now,
  );
  assert.ok("error" in bad, "returned, never thrown");
  assert.match(bad.error, /broadcast_recipients: statement timeout/);

  // And never "assume nobody was touched": that reading is what messages
  // people twice, which is the defect the paging was added for.
  assert.ok(!("touches" in bad));
});

test("a broadcasts read that fails is an ERROR, never 'nobody has been touched'", async () => {
  const { loadTenantRunContext } = await import("../../../../apps/edge/lib/playbooks.ts");
  // Caught to null, a failed read empties the touch history: no run ids, so
  // the whole block is skipped and the week's breath and every playbook's gap
  // stop holding -- and the people it can no longer see it touched are
  // messaged again. That reading is the defect the paging was added for.
  const bad = await loadTenantRunContext(
    ctxDb({}, { "sequence_batches.select": { message: "statement timeout" } }),
    "t1",
    new Date("2026-09-12T15:00:00Z"),
  );
  assert.ok("error" in bad, "returned as an error");
  assert.match(bad.error, /broadcasts: statement timeout/);
  assert.ok(!("touches" in bad));
});

test("a texting line or a mailbox that cannot be read is that channel not ready, said in the log: never the whole workspace's sweep, so a WhatsApp-only playbook still runs", async (t) => {
  const { loadTenantRunContext } = await import("../../../../apps/edge/lib/playbooks.ts");
  const now = new Date("2026-09-12T15:00:00Z");
  const said = [];
  t.mock.method(console, "warn", (line) => said.push(String(line)));
  // Email can send on this deployment: a mail domain and the provider's key.
  for (const [name, value] of [
    ["EMAIL_DOMAIN", "mail.example.com"],
    ["RESEND_API_KEY", "re_test"],
  ]) {
    const before = process.env[name];
    process.env[name] = value;
    t.after(() => (before === undefined ? delete process.env[name] : (process.env[name] = before)));
  }
  const number = {
    tenant_id: "t1",
    kind: "whatsapp",
    status: "active",
    config: { quality_rating: "GREEN", messaging_limit: "TIER_1K" },
  };
  const ctx = await loadTenantRunContext(
    ctxDb(
      { tenant_channels: [number], lines: [], mailboxes: [] },
      { "lines.select": { message: "statement timeout" }, "mailboxes.select": { message: "statement timeout" } },
    ),
    "t1",
    now,
  );
  assert.ok(!("error" in ctx), `returned a context, not the workspace's error: ${JSON.stringify(ctx)}`);
  assert.equal(ctx.ready.whatsapp.ready, true, "WhatsApp as read: the number is there");
  assert.deepEqual(
    [ctx.ready.sms.ready, ctx.ready.email.ready],
    [false, false],
    "the two it could not read are not ready",
  );
  assert.deepEqual(
    said.map((l) => JSON.parse(l)).map((l) => [l.event, l.channel]),
    [
      ["playbooks_channels_unread", "sms"],
      ["playbooks_channels_unread", "email"],
    ],
    "and each is said, so it does not fall back unseen",
  );
  // The WhatsApp number's own read is still the workspace's error: a number nobody can see is not a number that is not there.
  const noNumber = await loadTenantRunContext(
    ctxDb({ tenant_channels: [number] }, { "tenant_channels.select": { message: "statement timeout" } }),
    "t1",
    now,
  );
  assert.ok("error" in noNumber);
  assert.match(noNumber.error, /^channels: .*statement timeout/);
});

test("email is ready on the edge only when its wire can send: a mail domain alone is not, so a run never enrols people the send then holds", async (t) => {
  const { emailCanSend } = await import("../../../../apps/edge/lib/email/email.ts");
  const keep = { EMAIL_DOMAIN: process.env.EMAIL_DOMAIN, RESEND_API_KEY: process.env.RESEND_API_KEY };
  t.after(() => {
    for (const [name, value] of Object.entries(keep)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  for (const [domain, key, can] of [
    ["mail.example.com", "re_test", true],
    ["mail.example.com", undefined, false],
    [undefined, "re_test", false],
    [undefined, undefined, false],
  ]) {
    for (const [name, value] of [
      ["EMAIL_DOMAIN", domain],
      ["RESEND_API_KEY", key],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    assert.equal(emailCanSend(), can, JSON.stringify([domain, key]));
  }
});

test("the touch history looks back as far as a gap can reach, and no further", async () => {
  const { loadTenantRunContext } = await import("../../../../apps/edge/lib/playbooks.ts");
  const now = new Date("2026-09-12T15:00:00Z");
  const old = new Date(now.getTime() - 400 * 24 * 3600 * 1000).toISOString();
  // 400 days back is past the longest gap a playbook may set (365) plus the
  // week's breath, so it can hold nobody back -- and every id read here is
  // listed in the recipients query, where an unbounded set is a URL no proxy
  // will accept.
  const ctx = await loadTenantRunContext(
    ctxDb({
      broadcasts: [
        {
          id: "b1",
          tenant_id: "t1",
          playbook_id: "p1",
          state: "sent",
          scheduled_for: "2026-09-10T12:00:00Z",
          created_at: "2026-09-10T12:00:00Z",
        },
        { id: "b-ancient", tenant_id: "t1", playbook_id: "p1", state: "sent", scheduled_for: old, created_at: old },
      ],
      broadcast_recipients: [
        { broadcast_id: "b1", contact_id: "c1", tenant_id: "t1", state: "sent", sent_at: "2026-09-10T12:00:00Z" },
        { broadcast_id: "b-ancient", contact_id: "c-old", tenant_id: "t1", state: "sent", sent_at: old },
      ],
    }),
    "t1",
    now,
  );
  assert.ok(!("error" in ctx), JSON.stringify(ctx));
  assert.deepEqual(
    [...ctx.touches.byAny.keys()],
    ["c1"],
    "the recent touch holds; the one from over a year ago is not read at all",
  );
});

test("the day a visit moment is about is the calendar's own tomorrow and yesterday, a 23- or 25-hour day included", async () => {
  const { visitMomentDay } = await import("@chanlytics/contracts");
  const NY = "America/New_York";
  // 7 Mar 2026, 11:30 PM EST: clocks spring forward that night, so 24 hours on is the 9th. Tomorrow is the 8th.
  assert.equal(visitMomentDay("visit_tomorrow", NY, Date.parse("2026-03-08T04:30:00Z")), "2026-03-08");
  // 1 Nov 2026, 12:30 AM EDT: clocks fall back that night, so 24 hours on is still the 1st. Tomorrow is the 2nd.
  assert.equal(visitMomentDay("visit_tomorrow", NY, Date.parse("2026-11-01T04:30:00Z")), "2026-11-02");
  // 2 Nov 2026, 1:00 AM EST, the morning after the 25-hour day: yesterday is the 1st.
  assert.equal(visitMomentDay("visited", NY, Date.parse("2026-11-02T06:00:00Z")), "2026-11-01");
});

test("a run reads the record with the feed (0002's readers): a visit a member said missed is no last visit, a booking a notice stated is a next one, and a list's missed_visit finds who missed", async () => {
  const { loadTenantRunContext } = await import("../../../../apps/edge/lib/playbooks.ts");
  const { forgetFeeds } = await import("../../../../apps/edge/lib/calendar/availability.ts");
  const now = new Date("2026-09-12T15:00:00Z");
  const CAL = "+13055550133";
  const ANA = "+13055550111";
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:ev-came",
    "DTSTART:20260820T140000Z",
    "DTEND:20260820T150000Z",
    "SUMMARY:Colour",
    `DESCRIPTION:${CAL}`,
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:ev-missed",
    "DTSTART:20260910T140000Z",
    "DTEND:20260910T150000Z",
    "SUMMARY:Colour",
    `DESCRIPTION:${CAL}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(ics, { status: 200, headers: { "content-type": "text/calendar" } });
  const person = (id, phone) => ({
    id,
    display_name: id,
    phone_e164: phone,
    consent: "opted_in",
    marketing_consent: "opted_in",
    dnc: false,
    channels: ["sms"],
    conversation_count: 1,
    has_chat: true,
    has_backfill: false,
  });
  const appt = (over) => ({
    tenant_id: "t1",
    vanished_at: null,
    all_day: false,
    title: null,
    service: null,
    staff: null,
    price: null,
    note: null,
    client_name: null,
    client_phone: null,
    client_email: null,
    contact_id: null,
    ...over,
  });
  try {
    const ctx = await loadTenantRunContext(
      ctxDb(
        {
          tenant_config: [
            { tenant_id: "t1", config: { calendar: { ical_url: "https://calendar.example.com/run-record.ics" } } },
          ],
          appointments: [
            // The feed's row for Cal's visit on the 10th, a member's "missed" on it.
            appt({
              id: "f1",
              source: "calendar_feed",
              tool: "calendar",
              status: "missed",
              external_id: "ev-missed",
              starts_at: "2026-09-10T14:00:00Z",
              ends_at: "2026-09-10T15:00:00Z",
            }),
            // Ana's booking, from a tool's emailed notice: on no calendar.
            appt({
              id: "n1",
              source: "booking_email",
              tool: "booksy",
              status: "booked",
              external_id: "bk-1",
              service: "Balayage",
              client_name: "Ana Ruiz",
              client_phone: ANA,
              starts_at: "2026-09-14T14:00:00Z",
              ends_at: "2026-09-14T15:00:00Z",
            }),
          ],
          segments: [
            {
              id: "l-missed",
              tenant_id: "t1",
              name: "Missed lately",
              rule: { all: [{ field: "missed_visit", op: "within", days: 7 }] },
            },
          ],
          segment_members: [],
        },
        {},
        [person("p-cal", CAL), person("p-ana", ANA)],
      ),
      "t1",
      now,
    );
    assert.ok(!("error" in ctx), JSON.stringify(ctx));
    assert.equal(ctx.calendar, "ok");
    const cal = ctx.visits.get("p-cal");
    assert.equal(cal?.last?.start, "2026-08-20T14:00:00.000Z", "the last visit Cal came to, not the one they missed");
    assert.equal(cal?.missed?.start, "2026-09-10T14:00:00.000Z");
    assert.equal(
      ctx.visits.get("p-ana")?.next?.start,
      "2026-09-14T14:00:00.000Z",
      "the notice's booking is Ana's next",
    );
    const members = ctx.listMembers({ kind: "saved", id: "l-missed" });
    assert.deepEqual(members?.state === "ok" ? [...members.ids] : members, ["p-cal"]);
    // A record that cannot be read is the calendar unavailable, as a feed is: a visit a member cancelled could not be
    // told from one that stands, so no visit's message goes that hour, and a list on the calendar cannot be counted.
    const blind = await loadTenantRunContext(
      ctxDb(
        {
          tenant_config: [
            { tenant_id: "t1", config: { calendar: { ical_url: "https://calendar.example.com/run-record.ics" } } },
          ],
          segments: [],
          segment_members: [],
        },
        { "appointments.select": { message: "statement timeout" } },
        [person("p-cal", CAL)],
      ),
      "t1",
      now,
    );
    assert.ok(!("error" in blind), JSON.stringify(blind));
    assert.equal(blind.calendar, "unavailable");
    assert.equal(blind.visits.size, 0);
  } finally {
    globalThis.fetch = realFetch;
    forgetFeeds();
  }
});
