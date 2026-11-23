/**
 * A deal marked won is a moment a campaign can start on (22 Nov 2026), the second that comes after something. A business
 * that sells by proposal has deals and no visits, so the thank-you after a kept visit (decision 0123) never reached its
 * customers, and it had no moment to ask for a review in. Modelled on that one: it thanks, may ask for a review, goes
 * once for a deal, and only for a deal the record says is won. It is never chosen by how the deal went beyond that.
 *
 * It runs as an occasion does (decision 0119): the deal's own event, written with the fact (deal_record), enrols the
 * person in each campaign on the moment, due the next day at the campaign's hour, and the record is asked again when its
 * time comes and once more at the send.
 *
 *   The moment   offered with or without a calendar, under the follow-ups' row, and worded.
 *   The rule     what names it, the event it comes of, when its step is due, whether it is still owed (contracts).
 *   Enrolling    the edge's door, over a database in memory (apps/edge/lib/campaigns/occasions/enrol.ts).
 *   Its time     the edge's door that settles what is due (occasions/due.ts): a deal no longer won is left.
 *   The run      core runPlaybook with the occasion: the person's row keeps the deal it is owed for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HELD_REASONS,
  MOMENT_TRIGGERS,
  SUBSCRIBED_EVENTS,
  appointmentWords,
  channelsReady,
  dealIdsOf,
  dealStillWon,
  isOccasionTrigger,
  messageAboutOfTrigger,
  momentNamesVisit,
  momentOffered,
  momentReadsCalendar,
  numberHealth,
  occasionAppointment,
  occasionDeal,
  occasionEventOf,
  occasionGone,
  occasionIsSingle,
  occasionWords,
  owedOncePerMoment,
  purposeOfPlaybook,
  readyRunNotice,
  runApprovalRefusal,
  runDaysAt,
  sequenceModesFor,
  startersForTrigger,
  startersOffered,
  starterText,
  toPersonRowVM,
  triggerOf,
  triggerWords,
  waitsForKept,
  wonOccasion,
  wonThanksAt,
} from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";

const { enrolOccasions } = await importSrc("apps/edge/lib/campaigns/occasions/enrol.ts");
const { runDueOccasions } = await importSrc("apps/edge/lib/campaigns/occasions/due.ts");
const { runPlaybook } = await importSrc("packages/core/src/campaigns/run-playbook.ts");

const TZ = "America/New_York";
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SEQ = "5e5e5e5e-5e5e-45e5-85e5-5e5e5e5e5e5e";
const DEAL = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";
const PERSON = "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0";
const OTHER = "c9c9c9c9-c9c9-4c9c-8c9c-c9c9c9c9c9c9";
const BATCH = "b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0";
const at = (iso) => Date.parse(iso);
/** Monday 9 November 2026 at 3:12 PM in New York (five hours behind UTC in November). */
const MARKED = at("2026-11-09T20:12:00Z");
const TRIGGER = "deal_won";

/* ------------------------------------------------ the moment ------------------------------------------------ */

test("a deal marked won is a moment: an occasion's, under the follow-ups' row, about the person's own deal", () => {
  const moment = triggerOf(TRIGGER);
  assert.deepEqual(
    { kind: moment?.kind, cls: moment?.cls, list: moment?.list },
    { kind: "occasion", cls: "follow_up", list: null },
  );
  assert.equal(isOccasionTrigger(TRIGGER), true);
  assert.ok(
    MOMENT_TRIGGERS.some((t) => t.id === TRIGGER),
    "one of the moments a campaign starts on",
  );
  // About their own deal: a yes to messages is enough, as it is for a visit's thank-you.
  assert.equal(purposeOfPlaybook(moment.cls), "conversational");
  assert.equal(messageAboutOfTrigger(TRIGGER), "theirs");
  // Once for a deal, so no two campaigns run on it, and one thank-you conversation at a time for a person.
  assert.equal(owedOncePerMoment(TRIGGER), true);
  assert.equal(occasionIsSingle(TRIGGER), true);
  // Each person at their own time: it sends, or holds for a stop, and never asks for each one.
  assert.deepEqual(sequenceModesFor(TRIGGER), sequenceModesFor("visit_missed"));
  // It names no visit, and waits for no word about one.
  assert.equal(momentNamesVisit(TRIGGER), false);
  assert.equal(waitsForKept(TRIGGER), false);
});

test("it is offered where there is no calendar at all: a business that sells by proposal has deals and no visits", () => {
  const moment = triggerOf(TRIGGER);
  assert.equal(momentReadsCalendar(moment), false);
  assert.equal(momentOffered(moment, { calendarOn: false }), true);
  assert.equal(momentOffered(moment, { calendarOn: true }), true);
  // The other moments an occasion starts still read the calendar.
  for (const id of ["visit_soon", "visit_missed", "asked_no_booking"])
    assert.equal(momentOffered(triggerOf(id), { calendarOn: false }), false, id);
});

test("what the moment is called, wherever a moment is worded, whatever the workspace calls an appointment", () => {
  const moment = triggerOf(TRIGGER);
  assert.deepEqual(
    { label: moment.label, hint: moment.hint },
    { label: "After they become a client", hint: "The day after you mark someone as a client" },
  );
  for (const word of ["appointment", "session"]) {
    assert.deepEqual(triggerWords(moment, word), { label: moment.label, hint: moment.hint }, word);
    const words = occasionWords(TRIGGER, word);
    assert.equal(words.starts, "New client");
    assert.equal(words.sentence(" at 10:00 AM"), "The day after you mark someone as a client at 10:00 AM");
    assert.equal(words.line, "Thank everyone who becomes a client");
    assert.equal(words.who, "everyone you mark as a client");
    assert.equal(words.pool, "marked as a client");
    assert.equal(words.each, "each was marked as a client");
    assert.equal(words.schedule(" at 10:00 AM"), "The next day at 10:00 AM · once per proposal");
  }
  // The other occasions keep their words: the ask's are no longer whatever is left over.
  assert.equal(occasionWords("asked_no_booking", "appointment").starts, "Asked, not booked");
  assert.equal(occasionWords("visit_missed", "appointment").starts, `Missed ${appointmentWords("appointment").one}`);
});

test("its ready-made messages: a thank-you, and one with a review ask where there is a review link", () => {
  const starters = startersForTrigger(TRIGGER);
  assert.deepEqual(
    starters.map((s) => [s.key, s.category]),
    [
      ["new_client_thanks", "utility"],
      ["new_client_review", "utility"],
    ],
    "the plain thank-you first: what a composer opens on, and what goes when nothing is picked",
  );
  const [thanks, review] = starters;
  assert.deepEqual(
    starterText(thanks, "en_US").slots.map((s) => s.kind),
    ["first_name", "business_name"],
  );
  assert.deepEqual(
    starterText(review, "en_US").slots.map((s) => s.kind),
    ["first_name", "business_name", "review_link"],
  );
  for (const s of starters) {
    assert.ok(
      s.texts.es && s.email?.en_US && s.email?.es && s.sms?.en_US && s.sms?.es,
      `${s.key}: every channel, both languages`,
    );
    // No offer, no price and no day in its words: it goes the day after the mark, whatever day they said yes.
    for (const text of [s.texts.en_US.body, s.email.en_US.body, s.sms.en_US.body])
      assert.doesNotMatch(text, /yesterday|today|tomorrow|%|\$|offer/i, s.key);
  }
  // The review ask is offered only where a review link is on file, as the visit's is.
  const offered = (reviewLink) => startersOffered({ reviewLink }).map((s) => s.key);
  assert.ok(offered(true).includes("new_client_review"));
  assert.ok(!offered(false).includes("new_client_review"));
  assert.ok(offered(false).includes("new_client_thanks"));
});

/* ------------------------------------------------- the rule ------------------------------------------------- */

test("its occasion is named by the deal alone, so it goes once for a deal whatever is said of the deal afterwards", () => {
  const occasion = wonOccasion(DEAL);
  assert.equal(occasion, `won:${DEAL}`);
  assert.equal(occasionDeal(occasion), DEAL);
  assert.equal(occasionAppointment(occasion), null, "it names no visit");
  assert.equal(occasionDeal(`missed:${DEAL}`), null);
  assert.equal(occasionDeal("ask:b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2"), null);
});

test("it comes of the deal's own event, written with the fact, and of no other deal event", () => {
  const event = (kind, over = {}) => ({
    kind,
    subject_type: "deal",
    subject_id: DEAL,
    data: { stage: "won" },
    ...over,
  });
  assert.deepEqual(occasionEventOf(event("deal.won")), { about: "deal", dealId: DEAL });
  for (const kind of ["deal.proposed", "deal.lost", "deal.ended"])
    assert.equal(occasionEventOf(event(kind)), null, kind);
  assert.equal(occasionEventOf(event("deal.won", { subject_id: null })), null);
  assert.equal(occasionEventOf(event("deal.won", { subject_type: "contact" })), null);
  // Something reacts to it now, so its deliveries read it through a shape (what-reacts-is-written-with-its-fact).
  assert.ok(Object.hasOwn(SUBSCRIBED_EVENTS, "deal.won"));
});

test("the thank-you goes the next day at the campaign's hour, kept inside the sending hours", () => {
  const next = (runHour, markedAt = MARKED) => new Date(wonThanksAt({ markedAt, tz: TZ, runHour })).toISOString();
  assert.equal(next(10), "2026-11-10T15:00:00.000Z", "Tuesday at 10:00 AM");
  assert.equal(next(6), "2026-11-10T14:00:00.000Z", "never before nine");
  assert.equal(next(23), "2026-11-11T01:00:00.000Z", "never after eight in the evening");
  // Marked late at night, it is still the next day by the business's clock: 11:30 PM Monday is Tuesday.
  assert.equal(next(10, at("2026-11-10T04:30:00Z")), "2026-11-10T15:00:00.000Z");
});

test("it is owed only while the record says the deal is won, and by nothing else", () => {
  const occasion = wonOccasion(DEAL);
  const facts = (over = {}) => ({
    nowMs: MARKED + 86_400_000,
    appointment: null,
    bookedAhead: false,
    bookedSince: false,
    deal: { stage: "won" },
    ...over,
  });
  assert.equal(occasionGone(TRIGGER, occasion, facts()), null);
  for (const stage of ["proposed", "lost", "ended"])
    assert.equal(occasionGone(TRIGGER, occasion, facts({ deal: { stage } })), "not_won", stage);
  assert.equal(occasionGone(TRIGGER, occasion, facts({ deal: null })), "deal_gone");
  assert.equal(occasionGone(TRIGGER, occasion, facts({ deal: undefined })), "deal_gone");
  // Whether they booked changes nothing: it is their deal that is thanked.
  assert.equal(occasionGone(TRIGGER, occasion, facts({ bookedAhead: true, bookedSince: true })), null);
});

test("a batch of it that waits for an approval has no day to pass, and says so", () => {
  const run = {
    state: "pending_approval",
    playbook_id: "pb1",
    run_for: null,
    audience: { kind: "playbook", id: "pb1", label: "A step", trigger: TRIGGER },
  };
  assert.equal(runApprovalRefusal(run, runDaysAt(TZ, new Date("2026-11-20T15:00:00Z"))), null);
  const told = (trigger) => readyRunNotice("A step", 1, trigger).body;
  assert.equal(told(TRIGGER), told("asked_no_booking"));
  assert.match(told(TRIGGER), /Waits for you to approve. Nothing goes until you do/);
});

test("the send asks the deal once more: a row made for a deal goes only while that deal is still won", () => {
  const facts = { occasion: wonOccasion(DEAL), deal: DEAL, deal_was: "won" };
  assert.equal(dealStillWon(new Map([[DEAL, "won"]]), facts), true);
  for (const stage of ["proposed", "lost", "ended"])
    assert.equal(dealStillWon(new Map([[DEAL, stage]]), facts), false, stage);
  assert.equal(dealStillWon(new Map(), facts), false, "a deal the record no longer holds");
  // A row about no deal is nobody's to hold: every other campaign's people go as they did.
  assert.equal(dealStillWon(new Map(), {}), true);
  assert.equal(dealStillWon(new Map(), { visit_when: "tomorrow at 2:00 PM" }), true);
  assert.deepEqual(
    dealIdsOf([{ facts }, { facts: null }, { facts: { visit_when: "today" } }, { facts }]),
    [DEAL],
    "the batch's deals, each once",
  );
  assert.equal(HELD_REASONS.deal_changed, "no longer marked as a client");
});

/* ------------------------------------------------ enrolling ------------------------------------------------ */

const stepRow = (over = {}) => ({
  id: SEQ,
  sequence_id: SEQ,
  tenant_id: T,
  state: "running",
  trigger: TRIGGER,
  run_hour: 10,
  words_ok_at: null,
  last_run_for: null,
  ...over,
});
const dealRow = (over = {}) => ({
  id: DEAL,
  tenant_id: T,
  contact_id: PERSON,
  stage: "won",
  service: "Kitchen refit",
  decided_at: new Date(MARKED).toISOString(),
  ...over,
});

function enrolWorld({ steps = [stepRow()], deals = [dealRow()], answer = "enrolled" } = {}) {
  const enrolled = [];
  const read = [];
  const db = fakeDb(
    {
      sequence_steps: steps,
      sequences: [{ id: SEQ, tenant_id: T, state: "on", name: "New clients", mode: null }],
      deals,
      tenants: [{ id: T, timezone: TZ, status: "active" }],
    },
    {},
    {
      sequence_occasion_enrol: (args) => {
        enrolled.push(args);
        return answer;
      },
      sequence_occasions_leave: () => {
        read.push("leave");
        return 0;
      },
    },
  );
  return { db, enrolled, read };
}
const enrolNow = (w, now = MARKED + 60_000) => enrolOccasions(w.db, T, { about: "deal", dealId: DEAL }, new Date(now));

test("a deal marked won enrols its person in the campaign on the moment, once, due the next day at its hour", async () => {
  const w = enrolWorld();
  assert.deepEqual(await enrolNow(w), { enrolled: 1, left: 0 });
  assert.equal(w.enrolled.length, 1);
  const [args] = w.enrolled;
  assert.deepEqual(
    {
      tenant: args.p_tenant_id,
      sequence: args.p_sequence_id,
      contact: args.p_contact_id,
      occasion: args.p_occasion,
      due: args.p_due_at,
      single: args.p_single,
    },
    {
      tenant: T,
      sequence: SEQ,
      contact: PERSON,
      occasion: wonOccasion(DEAL),
      due: "2026-11-10T15:00:00.000Z",
      single: true,
    },
  );
  assert.equal("p_replaces" in args, false, "nothing leaves for it");
  assert.equal("p_rest_days" in args, false);
});

test("a second word about the same deal enrols nobody twice: the row stands for good", async () => {
  const w = enrolWorld({ answer: "already" });
  assert.deepEqual(await enrolNow(w), { enrolled: 0, left: 0, why: "already" });
});

test("read as the record stands now: a Won taken back before its event was delivered owes nothing", async () => {
  for (const stage of ["proposed", "lost", "ended"]) {
    const w = enrolWorld({ deals: [dealRow({ stage })] });
    assert.deepEqual(await enrolNow(w), { enrolled: 0, left: 0, why: "not_owed" }, stage);
    assert.deepEqual(w.enrolled, []);
  }
  const gone = enrolWorld({ deals: [] });
  assert.deepEqual(await enrolNow(gone), { enrolled: 0, left: 0, why: "gone" });
});

test("a workspace with no campaign on the moment answers after one read, and nobody is enrolled", async () => {
  const none = enrolWorld({ steps: [] });
  assert.deepEqual(await enrolNow(none), { enrolled: 0, left: 0, why: "no_step" });
  // A campaign on another moment is not this one's.
  const other = enrolWorld({ steps: [stepRow({ trigger: "visit_missed" })] });
  assert.deepEqual(await enrolNow(other), { enrolled: 0, left: 0, why: "no_step" });
  assert.deepEqual(other.enrolled, []);
});

/* ------------------------------------------------ its time ------------------------------------------------ */

const runStep = (over = {}) => ({
  id: SEQ,
  tenant_id: T,
  sequence_id: SEQ,
  kind: "moment",
  name: "New clients",
  trigger: TRIGGER,
  template_id: "tpl-1",
  template_name: "new_client_thanks",
  template_language: "en_US",
  params: [],
  policy_class: "follow_up",
  state: "running",
  run_hour: 10,
  mode: "auto",
  // Its words are new: the first batch waits for an approval, and the people behind it wait ten minutes at a time.
  words_ok_at: null,
  ...over,
});
/** Tuesday at 10:00 AM in New York: the day after the mark, at the campaign's hour. */
const DUE = new Date("2026-11-10T15:00:00.000Z");

function dueWorld({ deals = [dealRow()], contact = PERSON } = {}) {
  const due = {
    id: "0d0d0d0d-0000-4000-8000-000000000001",
    sequence_id: SEQ,
    contact_id: contact,
    occasion: wonOccasion(DEAL),
    due_at: DUE.toISOString(),
    created_at: new Date(MARKED).toISOString(),
  };
  const tables = {
    deals,
    appointments: [],
    sequence_occasions: [{ ...due, tenant_id: T, state: "waiting", why: null, settled_at: null, try_at: due.due_at }],
    // A batch of the step already waits for its first approval.
    sequence_batches: [{ id: BATCH, tenant_id: T, step_id: SEQ, state: "pending_approval" }],
  };
  const db = fakeDb(tables, {}, { sequence_occasions_due: () => [{ ...due, step: runStep(), runs: true }] });
  const log = { info() {}, error() {} };
  const run = () =>
    runDueOccasions(
      { db, tenantId: T, now: new Date(DUE.getTime() + 60_000), until: Date.now() + 60_000, log },
      async () => ({}),
      async () => true,
    );
  return { tables, run };
}

test("when its time comes, a deal no longer won is left, with why, and nothing is sent", async () => {
  for (const [stage, why] of [
    ["proposed", "not_won"],
    ["lost", "not_won"],
    ["ended", "not_won"],
  ]) {
    const w = dueWorld({ deals: [dealRow({ stage })] });
    const out = await w.run();
    assert.deepEqual([out.due, out.left, out.sent, out.held, out.put_off], [1, 1, 0, 0, 0], stage);
    assert.deepEqual(
      w.tables.sequence_occasions.map((o) => [o.state, o.why]),
      [["left", why]],
      stage,
    );
  }
});

test("a deal the record no longer holds, or that is another person's since, is left too", async () => {
  const gone = dueWorld({ deals: [] });
  await gone.run();
  assert.deepEqual(
    gone.tables.sequence_occasions.map((o) => o.why),
    ["deal_gone"],
  );
  // Two records made one since: the deal is the kept person's, and this row was the other's.
  const moved = dueWorld({ deals: [dealRow({ contact_id: OTHER })] });
  await moved.run();
  assert.deepEqual(
    moved.tables.sequence_occasions.map((o) => o.why),
    ["deal_gone"],
  );
});

test("a deal still won is still owed: it is not left, and waits its turn behind the step's first approval", async () => {
  const w = dueWorld();
  const out = await w.run();
  assert.deepEqual([out.due, out.left, out.put_off], [1, 0, 1]);
  assert.deepEqual(
    w.tables.sequence_occasions.map((o) => o.state),
    ["waiting"],
  );
});

/* ------------------------------------------------- the run ------------------------------------------------- */

const DAY_MS = 86_400_000;
const person = (id, now) => {
  const ago = (ms) => new Date(now.getTime() - ms).toISOString();
  return toPersonRowVM(
    {
      id,
      display_name: `Person ${id}`,
      wa_profile_name: null,
      phone_e164: "+13055550101",
      consent: "opted_in",
      consent_source: "keyword",
      consent_updated_at: ago(30 * DAY_MS),
      dnc: false,
      marketing_consent: "unknown",
      marketing_consent_source: null,
      marketing_consent_updated_at: null,
      channels: ["whatsapp"],
      conversation_count: 1,
      escalation_count: 0,
      needs_human: false,
      latest_conversation_id: `cv-${id}`,
      latest_state: "open",
      latest_wa_inbound_at: ago(3 * DAY_MS),
      last_message_at: ago(3 * DAY_MS),
      last_message_direction: "inbound",
      last_message_sender: "customer",
      last_inbound_text: "hi",
      last_inbound_at: ago(3 * DAY_MS),
      call_count: 0,
      call_seconds: 0,
      first_contact_at: ago(60 * DAY_MS),
      earliest_row_at: ago(60 * DAY_MS),
      has_backfill: false,
      has_chat: true,
      effective_reply_mode: "auto",
      visits: null,
    },
    TZ,
    now,
  );
};
const runWorld = (now = DUE) => ({
  tz: TZ,
  now,
  people: [person("a", now)],
  health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
  ready: channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: null,
    email: { mailbox: false, domain: false },
  }),
  touches: { byThis: new Map(), byAny: new Map(), followUps: new Map(), followUpKeys: new Map() },
  // No calendar at all: a business that sells by proposal.
  calendar: "none",
  visits: new Map(),
  listMembers: () => null,
  pace: null,
});
function runFakes() {
  const calls = [];
  const answers = {
    message: (name, language) => [
      {
        id: "tpl-whatsapp",
        channel: "whatsapp",
        name,
        language,
        meta_status: "approved",
        // About their own deal and nothing else, as WhatsApp files it: a yes to messages is enough.
        category: "utility",
        variables: [],
        hidden_at: null,
        title: null,
        source: "meta",
        components: [],
        body_preview: null,
        rejected_reason: null,
      },
    ],
    alreadyRan: false,
    record: undefined,
    assemble: (_row, _people, _sendAt, decision) => ({ id: "b1", decisionId: decision ? "d1" : null }),
    monthSent: 0,
    holdRecipients: (_id, ids) => ({ skipped: ids, error: null }),
    notify: undefined,
  };
  const ports = {};
  for (const [name, answer] of Object.entries(answers))
    ports[name] = async (...args) => {
      calls.push([name, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  return { ports, of: (name) => calls.filter((c) => c[0] === name) };
}

test("its run reaches the one person with no calendar read, as a batch with no day, and their row keeps the deal it is owed for", async () => {
  const { ports, of } = runFakes();
  const r = await runPlaybook(ports, {
    playbook: runStep({
      id: "p1",
      tenant_id: "t1",
      words_ok_at: "2026-11-01T10:00:00.000Z",
      cap_per_run: 25,
      gap_days: 90,
      cadence_days: 30,
      created_by: "owner",
      last_run_for: null,
    }),
    ctx: runWorld(),
    by: { kind: "system" },
    occasion: { contactId: "a", occasion: wonOccasion(DEAL), visit: null },
  });
  assert.equal(r.outcome, "sent");
  const [, row, people] = of("assemble")[0];
  assert.equal("run_for" in row, false, "an occasion has no day");
  assert.equal("late" in row.audience, false, "and no visit to be late for");
  assert.equal(row.audience.trigger, TRIGGER);
  assert.equal(people.length, 1);
  assert.equal(people[0].contact_id, "a");
  // What the send asks the record again by: the deal, and that it is owed only while it is won.
  assert.deepEqual(people[0].facts, { occasion: wonOccasion(DEAL), deal: DEAL, deal_was: "won" });
});
