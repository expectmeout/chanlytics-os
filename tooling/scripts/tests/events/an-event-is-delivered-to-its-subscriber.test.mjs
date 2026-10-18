/**
 * One event's delivery to one subscriber (00334, decision 0032), run through the job runner's dispatch over a database
 * in memory: the handler runs the subscriber over the event as the ledger holds it and settles the delivery row; a
 * subscriber this build does not know is kept as an unknown kind; a paused subscription pauses the delivery; an event
 * the ledger no longer holds fails it, says so under its own name and pages the operator (the job is done, so the
 * tick's own page for a delivery that fails for good never comes); a subscriber that throws fails it with why and the
 * job throws on. And the harness every subscriber must pass: run twice on one delivery, the same rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { rows } from "../_rows.mjs";
import { dispatchJob } from "../../../../packages/jobs/src/handlers.ts";
// The registry as the handler reaches it: core's built package, the same module instance handlers.ts imports, so a
// subscriber swapped here is the one the dispatch runs (repo/dist-freshness.test.mjs holds dist to src).
import { SUBSCRIBERS } from "../../../../packages/core/dist/index.js";
import { EVENT_SUBSCRIBERS } from "../../../../packages/contracts/src/shared/enums.ts";
import { fieldsOf, logLineOf } from "../_log-lines.mjs";

/** The logger's lines (one JSON object per console call) written while `fn` ran, and what it answered. */
async function logged(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...args) => lines.push(args);
  try {
    const answer = await fn();
    return { answer, lines: lines.map(logLineOf).filter(Boolean) };
  } finally {
    Object.assign(console, real);
  }
}

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const E = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

/** The kind each subscriber reads, and an event of it: an appointment kept on the record for reach_out_booked. */
const READS = {
  reach_out_booked: {
    kind: "appointment.changed",
    category: "appointment",
    subject_type: "appointment",
    subject_id: "a-1",
    data: { change: "added", source: "booking_email", starts_at: "2026-10-12T15:00:00Z" },
  },
  owner_notice: {
    kind: "escalation.opened",
    category: "message",
    subject_type: "conversation",
    subject_id: "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0",
    data: { reason: "rate_cap" },
  },
  // A customer's typed STOP, as ingest_inbound writes it in the message's own transaction (00361).
  consent_notice: {
    kind: "contact.consent_changed",
    category: "contact",
    subject_type: "contact",
    subject_id: "d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0",
    data: { consent: "opted_out", source: "customer_message", channel: "sms", words: "STOP" },
    created_at: "2026-10-06T00:00:00Z",
  },
  // A booking tool's email kept on the record (00389's trigger writes it in the row's own transaction).
  visit_notice: {
    kind: "appointment.changed",
    category: "appointment",
    subject_type: "appointment",
    subject_id: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1",
    data: { change: "added", source: "booking_email", starts_at: "2999-10-12T15:00:00Z" },
    created_at: "2026-10-06T00:00:00Z",
  },
  // The seat an accepted invitation made (acceptOpenInvites writes it).
  team_notice: {
    kind: "member.joined",
    category: "team",
    subject_type: "invitation",
    subject_id: "1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b",
    data: { by: "99999999-9999-4999-8999-999999999999", role: "operator" },
    created_at: "2026-10-06T00:00:00Z",
  },
};

const CONV = "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0";
const PERSON = "d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0";
const APPT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const INVITATION = "1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b";

/** A visit of the record, booked and far ahead, as a booking tool's email left it. */
const aVisit = (over = {}) => ({
  id: APPT,
  tenant_id: T,
  starts_at: "2999-10-12T15:00:00Z",
  ends_at: "2999-10-12T16:00:00Z",
  all_day: false,
  timezone: "America/New_York",
  status: "booked",
  source: "booking_email",
  client_name: "Rosa Diaz",
  service: "Gel manicure",
  contact_id: null,
  vanished_at: null,
  ...over,
});

/** A booking that arrived, and a bell with nothing on it yet (S1-01). */
const aBooking = () => ({ appointments: [aVisit()], contacts: [], notifications: [] });

/** An invitation that was accepted, and a bell with nothing on it yet (S1-19). */
const anAcceptedInvitation = () => ({
  invitations: [
    {
      id: INVITATION,
      tenant_id: T,
      email: "ada@example.com",
      role: "operator",
      accepted_at: "2026-10-06T00:00:00Z",
      revoked_at: null,
    },
  ],
  notifications: [],
});
/** A thread waiting for a person: the hold, the thread, the person, their words and the receptionist's (decision 0043). */
const heldThread = () => ({
  escalations: [
    {
      id: "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5",
      tenant_id: T,
      conversation_id: CONV,
      reason: "rate_cap",
      details: "Thread hit 20 automatic replies today — the receptionist stopped and is waiting for a human.",
      state: "open",
      created_at: "2026-10-06T00:00:00Z",
    },
  ],
  conversations: [rows.conversation({ id: CONV, tenant_id: T, contact_id: PERSON })],
  contacts: [rows.contact({ id: PERSON, tenant_id: T, display_name: "Rosa Diaz", phone_e164: "+13055550142" })],
  messages: [
    rows.message({
      tenant_id: T,
      conversation_id: CONV,
      contact_id: PERSON,
      direction: "inbound",
      sender: "customer",
      channel: "whatsapp",
      body: "Can I move my visit to Friday?",
      created_at: "2026-10-05T23:59:00Z",
    }),
  ],
  notifications: [],
});

/** A person who said no, and a bell with nothing on it yet (decision 0048). */
const aPerson = () => ({
  contacts: [rows.contact({ id: PERSON, tenant_id: T, display_name: "Rosa Diaz", phone_e164: "+13055550142" })],
  notifications: [],
});

/** A world with one event, its subscription and the delivery the relay wrote; the booking door counts its calls. */
function world({ paused = false, withEvent = true, subscriber = "reach_out_booked" } = {}) {
  const read = READS[subscriber] ?? READS.reach_out_booked;
  const kind = read.kind;
  const booked = [];
  const tables = {
    ...(subscriber === "owner_notice" ? heldThread() : {}),
    ...(subscriber === "consent_notice" ? aPerson() : {}),
    ...(subscriber === "visit_notice" ? aBooking() : {}),
    ...(subscriber === "team_notice" ? anAcceptedInvitation() : {}),
    events: withEvent ? [rows.event({ id: E, tenant_id: T, ...read })] : [],
    event_subscriptions: [{ kind, subscriber, lane: 2, paused, created_at: "2026-10-06T00:00:00Z" }],
    event_deliveries: [
      {
        event_id: E,
        subscriber,
        tenant_id: T,
        kind,
        event_at: "2026-10-06T00:00:00Z",
        state: "scheduled",
        job_id: null,
        attempts: 0,
        last_error: null,
        created_at: "2026-10-06T00:00:01Z",
        updated_at: "2026-10-06T00:00:01Z",
      },
    ],
  };
  // The booking door over one appointment (00389): what it was asked, and one lead moved.
  const db = fakeDb(
    tables,
    {},
    {
      reach_out_booked_from: ({ p_tenant_id, p_appointment_id }) => {
        booked.push([p_tenant_id, p_appointment_id]);
        return 1;
      },
    },
  );
  // The platform's pager, recorded: a delivery's failure is never an owner's (ledger PAGES_THE_PLATFORM).
  const pages = [];
  // The workspace told as the edge's alertFor tells it: the bell's row, keeping the event it answers.
  const told = [];
  const ctx = {
    db,
    wire: { whatsapp: null, sms: null },
    alert: async (news) => {
      told.push(news);
      const kept = await db.from("notifications").insert({
        tenant_id: T,
        kind: news.kind,
        title: news.subject,
        body: news.body,
        route: news.route,
        subject_type: news.about?.type ?? null,
        subject_id: news.about?.id ?? null,
        source_event: news.sourceEvent ?? null,
        created_at: "2026-10-06T00:00:02Z",
      });
      if (kept.error) throw new Error(kept.error.message);
    },
    page: async (key, subject, body) => {
      pages.push({ key, subject, body });
    },
  };
  const job = {
    id: "j-1",
    tenant_id: T,
    kind: "event_deliver",
    payload: { event_id: E, subscriber, kind, lane: "2" },
  };
  return { tables, ctx, job, pages, booked, told, delivery: () => tables.event_deliveries[0] };
}

test("a subscriber runs and the delivery is done, counted once", async () => {
  const w = world();
  assert.equal(await dispatchJob(w.ctx, w.job), "done");
  assert.deepEqual([w.delivery().state, w.delivery().attempts, w.delivery().last_error], ["done", 1, null]);
});

test("a subscriber this build does not know is kept, as an unknown kind is", async () => {
  const w = world({ subscriber: "projector_from_a_newer_deploy" });
  assert.equal(await dispatchJob(w.ctx, w.job), "unknown_kind");
  assert.equal(w.delivery().state, "scheduled", "untouched: the runner that knows it will take it");
});

test("a paused subscription pauses the delivery for the re-drive; an event the ledger no longer holds fails it, said and paged, with the job done", async () => {
  const paused = world({ paused: true });
  assert.equal(await dispatchJob(paused.ctx, paused.job), "done");
  assert.deepEqual([paused.delivery().state, paused.delivery().attempts], ["paused", 1]);
  assert.deepEqual(paused.pages, [], "a pause is nobody's condition");

  // Purged before its delivery ran (the evidence kinds, 00115): no try could change it, so the job is done, and the
  // miss used to be nobody's. It is the platform's: said under its own name, and paged on the same condition the
  // tick pages a delivery that fails for good (one key, so the pager sends once per window).
  const gone = world({ withEvent: false });
  const { answer, lines } = await logged(() => dispatchJob(gone.ctx, gone.job));
  assert.equal(answer, "done");
  assert.deepEqual(
    [gone.delivery().state, gone.delivery().last_error],
    ["failed", "the ledger no longer holds the event"],
  );
  assert.deepEqual(
    lines.filter((l) => l.event === "event_deliver_event_gone").map((l) => [l.level, fieldsOf(l)]),
    [["error", { tenant_id: T, job: "j-1", event_id: E, subscriber: "reach_out_booked", kind: "appointment.changed" }]],
    "one line, under the name alerting greps for, with the delivery named",
  );
  assert.equal(gone.pages.length, 1);
  assert.equal(
    gone.pages[0].key,
    "event_deliver_failed:reach_out_booked",
    "the tick's own condition for a delivery to that subscriber that failed for good",
  );
  assert.equal(gone.pages[0].subject, "A change was not passed on to what reads it");
  assert.match(
    gone.pages[0].body,
    new RegExp(
      `^The delivery of event ${E} \\(appointment\\.changed\\) to the reach_out_booked subscriber failed for good in workspace ${T}: the ledger no longer holds the event\\.`,
    ),
  );
  assert.match(gone.pages[0].body, /Reference: job j-1 \(event_deliver\)\.$/);

  // A pager that cannot be reached costs the delivery nothing: the row is failed, the job done, the miss on the log.
  const unpaged = world({ withEvent: false });
  unpaged.ctx.page = async () => {
    throw new Error("pager down");
  };
  const second = await logged(() => dispatchJob(unpaged.ctx, unpaged.job));
  assert.equal(second.answer, "done");
  assert.equal(unpaged.delivery().state, "failed");
  assert.deepEqual(
    second.lines.filter((l) => l.event === "job_page_failed").map((l) => fieldsOf(l)),
    [{ tenant_id: T, job: "j-1", kind: "event_deliver", error: "pager down" }],
  );
});

test("a subscriber that throws fails the delivery with why, and the job throws on so the ledger tries again", async () => {
  const w = world();
  const kept = SUBSCRIBERS.reach_out_booked;
  SUBSCRIBERS.reach_out_booked = async () => {
    throw new Error("the projection's table is away");
  };
  try {
    await assert.rejects(() => dispatchJob(w.ctx, w.job), /the projection's table is away/);
  } finally {
    SUBSCRIBERS.reach_out_booked = kept;
  }
  assert.deepEqual([w.delivery().state, w.delivery().last_error], ["failed", "the projection's table is away"]);
});

test("the harness: every subscriber run twice on one delivery leaves the same rows", async () => {
  assert.deepEqual(
    Object.keys(SUBSCRIBERS).sort(),
    [...EVENT_SUBSCRIBERS].sort(),
    "each named subscriber has its verb",
  );
  for (const subscriber of EVENT_SUBSCRIBERS) {
    const w = world({ subscriber });
    assert.equal(await dispatchJob(w.ctx, w.job), "done");
    const once = JSON.stringify(w.tables);
    assert.equal(await dispatchJob(w.ctx, w.job), "done");
    const twice = JSON.parse(JSON.stringify(w.tables));
    twice.event_deliveries[0].attempts = 1; // the delivery counts its runs; everything else is the same
    assert.equal(JSON.stringify(twice), once, `${subscriber}: a second run changes nothing but the count`);
  }
});

test("reach_out_booked hands the booking door the appointment its event names, and only for a change that books", async () => {
  const w = world({ subscriber: "reach_out_booked" });
  assert.equal(await dispatchJob(w.ctx, w.job), "done");
  assert.deepEqual(w.booked, [[T, "a-1"]], "the appointment of the event, in its workspace");
  assert.equal(w.delivery().state, "done");
  for (const change of ["confirmed", "moved"]) {
    const books = world({ subscriber: "reach_out_booked" });
    books.tables.events[0].data = { change, source: "booking_email", starts_at: "2026-10-12T15:00:00Z" };
    assert.equal(await dispatchJob(books.ctx, books.job), "done");
    assert.deepEqual(books.booked, [[T, "a-1"]], `${change}: books`);
  }
  for (const [change, source] of [
    ["cancelled", "booking_email"],
    ["vanished", "booking_email"],
    // The feed's own changes are the hourly sweep's to hand the door, over the feed's items.
    ["added", "calendar_feed"],
  ]) {
    const quiet = world({ subscriber: "reach_out_booked" });
    quiet.tables.events[0].data = { change, source, starts_at: "2026-10-12T15:00:00Z" };
    assert.equal(await dispatchJob(quiet.ctx, quiet.job), "done");
    assert.deepEqual(quiet.booked, [], `${change} from ${source}: books nobody`);
    assert.equal(quiet.delivery().state, "done", "and the delivery is done, not failed");
  }
});

test("owner_notice tells the workspace of a hold once, from its rows: who, why, their words, the hold's own, the thread", async () => {
  const w = world({ subscriber: "owner_notice" });
  assert.equal(await dispatchJob(w.ctx, w.job), "done");
  assert.equal(w.told.length, 1);
  const [n] = w.told;
  assert.deepEqual(
    [n.kind, n.route, n.about, n.sourceEvent],
    ["handoff", `inbox/th-${CONV}`, { type: "conversation", id: CONV }, E],
  );
  // The Inbox's own words for the reason (ESCALATION_REASON_SHORT), not a second set of the notice's (D1-hold-reasons).
  assert.equal(n.subject, "Rosa Diaz needs a person — too many replies too fast");
  assert.match(n.body, /^They wrote: “Can I move my visit to Friday\?”/);
  assert.match(n.body, /Thread hit 20 automatic replies today/);
  assert.match(n.body, /WhatsApp conversation · \+1 \(305\) 555-0142/);
  assert.match(n.body, /\nReply from the Inbox\.$/, "the reason's act: a reply to write");
  assert.match(n.redactedBody, /^A WhatsApp conversation needed a person \(too many replies too fast\)/);
  assert.doesNotMatch(n.redactedBody, /Rosa|Friday|305/, "the platform's copy holds no customer");
  assert.equal(await dispatchJob(w.ctx, w.job), "done");
  assert.equal(w.told.length, 1, "a second delivery of the same event tells nobody");
});

test("owner_notice tells nobody of a hold answered since, nor of one an edge from before already told inline", async () => {
  const answered = world({ subscriber: "owner_notice" });
  answered.tables.escalations[0].state = "resolved";
  assert.equal(await dispatchJob(answered.ctx, answered.job), "done");
  assert.equal(answered.told.length, 0, "the thread no longer waits for a person");

  const inline = world({ subscriber: "owner_notice" });
  inline.tables.notifications.push({
    id: "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1",
    tenant_id: T,
    kind: "handoff",
    title: "Rosa Diaz needs a person — rate cap",
    body: "They wrote: …",
    route: `inbox/th-${CONV}`,
    subject_type: "conversation",
    subject_id: CONV,
    source_event: null,
    recipient_user_id: null,
    created_at: "2026-10-05T23:59:30Z",
  });
  assert.equal(await dispatchJob(inline.ctx, inline.job), "done");
  assert.equal(inline.told.length, 0, "the old edge's notice, kept within the minute, is the notice");
});

test("owner_notice reads a change by its hold, and names nobody erased", async () => {
  const changed = world({ subscriber: "owner_notice" });
  Object.assign(changed.tables.events[0], {
    kind: "escalation.changed",
    subject_type: "escalation",
    subject_id: changed.tables.escalations[0].id,
    data: { from: "policy_block", to: "rate_cap" },
  });
  assert.equal(await dispatchJob(changed.ctx, changed.job), "done");
  assert.equal(changed.told.length, 1, "a hold taking another reason is a hold, and is told");
  assert.equal(changed.told[0].about.id, CONV);

  const erased = world({ subscriber: "owner_notice" });
  erased.tables.contacts[0].erased_at = "2026-10-05T00:00:00Z";
  assert.equal(await dispatchJob(erased.ctx, erased.job), "done");
  const [n] = erased.told;
  assert.equal(n.subject, "A customer needs a person — too many replies too fast");
  assert.doesNotMatch(n.body, /Rosa|Friday|305|Thread hit/, "no name, no words, no number of someone erased");
});

test("owner_notice tells a hold's new reason a moment after it told the first: its own notice answers that event, not this one", async () => {
  const w = world({ subscriber: "owner_notice" });
  Object.assign(w.tables.events[0], {
    kind: "escalation.changed",
    subject_type: "escalation",
    subject_id: w.tables.escalations[0].id,
    data: { from: "human_token", to: "rate_cap" },
  });
  // Told of the first reason seconds ago, by this subscriber, for the event that opened the hold.
  w.tables.notifications.push({
    id: "f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2",
    tenant_id: T,
    kind: "handoff",
    title: "Rosa Diaz needs a person — asked for a person",
    body: "They wrote: …",
    route: `inbox/th-${CONV}`,
    subject_type: "conversation",
    subject_id: CONV,
    source_event: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1",
    recipient_user_id: null,
    created_at: "2026-10-05T23:59:50Z",
  });
  assert.equal(await dispatchJob(w.ctx, w.job), "done");
  assert.deepEqual(
    w.told.map((n) => n.subject),
    ["Rosa Diaz needs a person — too many replies too fast"],
    "REGRESSION: a reason changed within the minute was swallowed by the first notice",
  );
});

test("owner_notice tells a hold as it stands: an opened event whose hold took another reason since tells nothing, its change tells", async () => {
  const w = world({ subscriber: "owner_notice" });
  Object.assign(w.tables.events[0], { data: { reason: "policy_block" } });
  assert.equal(await dispatchJob(w.ctx, w.job), "done");
  assert.deepEqual(w.told, [], "two deliveries out of order tell the hold once");
  assert.equal(w.delivery().state, "done");
});

test("owner_notice quotes the receptionist only in words that reached them: a failed or held reply was never said", async () => {
  for (const status of ["failed", "queued", "canceled"]) {
    const w = world({ subscriber: "owner_notice" });
    w.tables.messages.push(
      rows.message({
        tenant_id: T,
        conversation_id: CONV,
        contact_id: PERSON,
        direction: "outbound",
        sender: "ai",
        channel: "whatsapp",
        status,
        body: "Friday at 3 is yours.",
        created_at: "2026-10-05T23:59:30Z",
      }),
    );
    assert.equal(await dispatchJob(w.ctx, w.job), "done", status);
    assert.doesNotMatch(w.told[0].body, /The receptionist|Friday at 3/, status);
  }
  const said = world({ subscriber: "owner_notice" });
  said.tables.messages.push(
    rows.message({
      tenant_id: T,
      conversation_id: CONV,
      contact_id: PERSON,
      direction: "outbound",
      sender: "ai",
      channel: "whatsapp",
      status: "delivered",
      body: "Friday at 3 is yours.",
      created_at: "2026-10-05T23:59:30Z",
    }),
  );
  assert.equal(await dispatchJob(said.ctx, said.job), "done");
  assert.match(said.told[0].body, /The receptionist: “Friday at 3 is yours\.”/);
});

test("owner_notice leaves an email's hold to where it is taken in: opened, changed to it, or holding it now", async () => {
  // The intake tells it in its job (sender, subject), a reach-out's reading tells its reply, a dead job's notice tells
  // the rest: told here too, one email would be heard of twice.
  const opened = world({ subscriber: "owner_notice" });
  Object.assign(opened.tables.events[0], { data: { reason: "email_review" } });
  opened.tables.escalations[0].reason = "email_review";
  const changed = world({ subscriber: "owner_notice" });
  Object.assign(changed.tables.events[0], {
    kind: "escalation.changed",
    subject_type: "escalation",
    subject_id: changed.tables.escalations[0].id,
    data: { from: "carriers", to: "email_review" },
  });
  changed.tables.escalations[0].reason = "email_review";
  // Opened for the cap, then an email moved it before the delivery ran: the hold is the intake's to tell now.
  const since = world({ subscriber: "owner_notice" });
  since.tables.escalations[0].reason = "email_review";
  for (const [name, w] of [
    ["opened", opened],
    ["changed", changed],
    ["since", since],
  ]) {
    assert.equal(await dispatchJob(w.ctx, w.job), "done", name);
    assert.deepEqual(w.told, [], name);
    assert.equal(w.delivery().state, "done", `${name}: delivered, and nothing owed`);
  }
});

/* ------------------------------------------------------------------------ a customer's no (decision 0048) */

/** The consent event of a world, its data and its time said. */
function saying(w, data, over = {}) {
  Object.assign(w.tables.events[0], { data, ...over });
  return w;
}

test("consent_notice tells the workspace of a customer's STOP once, on the bell, in the Inbox's words, from the consent event: no hold, no handoff", async () => {
  const w = world({ subscriber: "consent_notice" });
  assert.equal(await dispatchJob(w.ctx, w.job), "done");
  assert.equal(w.told.length, 1);
  const [n] = w.told;
  assert.deepEqual(
    [n.kind, n.route, n.about, n.sourceEvent],
    ["opted_out", `clients/${PERSON}`, { type: "contact", id: PERSON }, E],
    "a kind of its own, on the person's page, answering the consent event",
  );
  assert.equal(n.subject, "Rosa Diaz asked to stop receiving messages");
  assert.equal(
    n.body,
    [
      "They wrote: “STOP”",
      "Nothing more will be sent to them. They can text START to opt back in.",
      "",
      "Text · +1 (305) 555-0142",
    ].join("\n"),
  );
  assert.doesNotMatch(n.redactedBody, /Rosa|305|STOP/, "the platform's copy holds no customer");
  assert.equal(w.tables.escalations, undefined, "and it opened nothing to wait on");
  assert.equal(await dispatchJob(w.ctx, w.job), "done");
  assert.equal(w.told.length, 1, "a second delivery of the same event tells nobody");
});

test("consent_notice tells every door's no in the same one kind: an unsubscribe, a complaint, a carrier's STOP, WhatsApp's report on an offer", async () => {
  const doors = [
    [
      { consent: "opted_out", source: "carrier", channel: "sms" },
      "Rosa Diaz asked to stop receiving messages",
      /Their carrier told us they replied STOP to your number\./,
    ],
    [
      { purpose: "email_marketing", consent: "opted_out", source: "unsubscribe", channel: "email" },
      "Rosa Diaz unsubscribed from your emails",
      /Offers and news by email to them have stopped\. Reminders and confirmations still reach them./,
    ],
    [
      { purpose: "email_marketing", consent: "opted_out", source: "complaint", channel: "email" },
      "Rosa Diaz reported one of your emails as spam",
      /Offers and news by email to them have stopped\./,
    ],
    [
      { purpose: "marketing", consent: "opted_out", source: "whatsapp", channel: "whatsapp" },
      "Rosa Diaz stopped offers on WhatsApp",
      /Offers to them on WhatsApp have stopped\./,
    ],
    [
      {
        consent: "opted_out",
        source: "customer_message",
        channel: "email",
        words: "Stop all messages",
        via: "unsubscribe_page",
      },
      "Rosa Diaz asked to stop receiving messages",
      /They wrote: “Stop all messages”/,
    ],
  ];
  for (const [data, subject, body] of doors) {
    const w = saying(world({ subscriber: "consent_notice" }), data);
    assert.equal(await dispatchJob(w.ctx, w.job), "done", JSON.stringify(data));
    assert.deepEqual(
      [w.told.length, w.told[0]?.kind, w.told[0]?.subject],
      [1, "opted_out", subject],
      JSON.stringify(data),
    );
    assert.match(w.told[0].body, body);
  }
});

test("consent_notice tells nobody of a yes, of a no a member recorded themselves, of a merge, or of the end of a yes to offers by a STOP", async () => {
  for (const data of [
    { consent: "opted_in", source: "customer_message", channel: "sms", words: "START" },
    { consent: "opted_out", source: "operator", by: "u1" },
    { consent: "opted_out", source: "in_person", by: "u1" },
    { consent: "opted_out", source: "merge" },
    { purpose: "marketing", consent: "unknown", previous: "opted_in", source: "stop", stopped_by: "customer_message" },
    { consent: "opted_in", source: "form", purpose: "marketing" },
    "not an object",
  ]) {
    const w = saying(world({ subscriber: "consent_notice" }), data);
    assert.equal(await dispatchJob(w.ctx, w.job), "done", JSON.stringify(data));
    assert.deepEqual(w.told, [], JSON.stringify(data));
    assert.equal(w.delivery().state, "done");
  }
  // An event that is not about a person's consent at all.
  const other = world({ subscriber: "consent_notice" });
  Object.assign(other.tables.events[0], { kind: "message.received", subject_type: null, subject_id: null });
  assert.equal(await dispatchJob(other.ctx, other.job), "done");
  assert.deepEqual(other.told, []);
});

test("consent_notice tells one press of Stop all messages once: its STOP and its unsubscribe are two events of one person within the minute", async () => {
  // The first event's notice is kept; the second's delivery finds it and says nothing.
  const w = saying(world({ subscriber: "consent_notice" }), {
    purpose: "email_marketing",
    consent: "opted_out",
    source: "unsubscribe",
    channel: "email",
  });
  const first = {
    id: "f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3",
    tenant_id: T,
    kind: "opted_out",
    title: "Rosa Diaz asked to stop receiving messages",
    body: "…",
    route: `clients/${PERSON}`,
    subject_type: "contact",
    subject_id: PERSON,
    source_event: "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2",
    recipient_user_id: null,
    mail_due_at: null,
    created_at: "2026-10-06T00:00:01Z",
  };
  w.tables.notifications.push(first);
  assert.equal(await dispatchJob(w.ctx, w.job), "done");
  assert.deepEqual(w.told, [], "the person is told of once");

  // Another person's no is their own news.
  const other = saying(world({ subscriber: "consent_notice" }), { consent: "opted_out", source: "customer_message" });
  other.tables.notifications.push({ ...first, subject_id: "e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0" });
  assert.equal(await dispatchJob(other.ctx, other.job), "done");
  assert.equal(other.told.length, 1);

  // And an earlier notice of the person's, from before the minute, is another time they said it.
  const earlier = saying(world({ subscriber: "consent_notice" }), { consent: "opted_out", source: "customer_message" });
  earlier.tables.notifications.push({ ...first, created_at: "2026-10-05T23:00:00Z" });
  assert.equal(await dispatchJob(earlier.ctx, earlier.job), "done");
  assert.equal(earlier.told.length, 1);
});

test("consent_notice names no one erased, and a notice whose mail is still owed is told again, for the mail alone", async () => {
  const erased = world({ subscriber: "consent_notice" });
  erased.tables.contacts[0].erased_at = "2026-10-05T00:00:00Z";
  assert.equal(await dispatchJob(erased.ctx, erased.job), "done");
  const [n] = erased.told;
  assert.equal(n.subject, "A customer asked to stop receiving messages");
  assert.doesNotMatch(n.body, /Rosa|305|STOP|wrote/, "no name, no words, no number of someone erased");

  // The row and the phones went and the mail did not (mail_due_at): the delivery is not told in full, so the subscriber
  // tells again, and the notice door (edge notify.ts) finds the row by its event and sends the mail alone.
  const row = (mail_due_at) => ({
    id: "f4f4f4f4-f4f4-4f4f-8f4f-f4f4f4f4f4f4",
    tenant_id: T,
    kind: "opted_out",
    title: "Rosa Diaz asked to stop receiving messages",
    body: "…",
    route: `clients/${PERSON}`,
    subject_type: "contact",
    subject_id: PERSON,
    source_event: E,
    recipient_user_id: null,
    mail_due_at,
    created_at: "2026-10-06T00:00:01Z",
  });
  const owed = world({ subscriber: "consent_notice" });
  owed.tables.notifications.push(row("2026-10-06T00:00:01Z"));
  // The edge's door keeps no second row for the event; this world's stand-in only records what it was asked to tell.
  owed.ctx.alert = async (news) => {
    owed.told.push(news);
  };
  assert.equal(await dispatchJob(owed.ctx, owed.job), "done");
  assert.deepEqual(
    owed.told.map((t) => t.sourceEvent),
    [E],
    "bell told, mail owed: told again",
  );
  const done = world({ subscriber: "consent_notice" });
  done.tables.notifications.push(row(null));
  assert.equal(await dispatchJob(done.ctx, done.job), "done");
  assert.deepEqual(done.told, [], "told in full: nothing more");
});

test("owner_notice does not tell a hold that waits on nobody: a STOP an edge from before still opened is consent_notice's to tell", async () => {
  const w = world({ subscriber: "owner_notice" });
  Object.assign(w.tables.events[0], { data: { reason: "opt_out" } });
  w.tables.escalations[0].reason = "opt_out";
  assert.equal(await dispatchJob(w.ctx, w.job), "done");
  assert.deepEqual(w.told, [], "not as 'needs a person', and not twice");
  assert.equal(w.delivery().state, "done");
});

/* ------------------------------------------------------------ a booking that arrived (S1-01, 00410) */

test("visit_notice tells the workspace of a booking once, on the bell, opening the visit on its day: no mail, no phone, no name in the platform's copy", async () => {
  const w = world({ subscriber: "visit_notice" });
  assert.equal(await dispatchJob(w.ctx, w.job), "done");
  assert.equal(w.told.length, 1);
  const [n] = w.told;
  assert.deepEqual(
    [n.kind, n.route, n.about, n.sourceEvent],
    ["booking", `calendar/2999-10-12:a-${APPT}`, { type: "appointment", id: APPT }, E],
    "a kind of its own, at the visit on its day (the business's, by the visit's zone), answering the event",
  );
  assert.equal(n.subject, "Rosa Diaz booked with you");
  assert.match(n.body, /^\w{3}, Oct 12 · 11:00\sAM – 12:00\sPM\nGel manicure\n\nFrom your booking tool's email$/);
  assert.doesNotMatch(n.redactedBody, /Rosa|manicure/, "the platform's copy holds no customer");
  assert.equal(await dispatchJob(w.ctx, w.job), "done");
  assert.equal(w.told.length, 1, "a second delivery of the same event tells nobody");
});

test("visit_notice names the person a visit is linked to when the booking states no name, and nobody who is erased", async () => {
  const linked = world({ subscriber: "visit_notice" });
  linked.tables.appointments[0] = aVisit({ client_name: null, contact_id: PERSON });
  linked.tables.contacts.push(rows.contact({ id: PERSON, tenant_id: T, display_name: "Dulce Amaro" }));
  assert.equal(await dispatchJob(linked.ctx, linked.job), "done");
  assert.equal(linked.told[0].subject, "Dulce Amaro booked with you");

  const erased = world({ subscriber: "visit_notice" });
  erased.tables.appointments[0] = aVisit({ client_name: "Dulce Amaro", contact_id: PERSON });
  erased.tables.contacts.push(
    rows.contact({ id: PERSON, tenant_id: T, display_name: "Dulce Amaro", erased_at: "2026-10-05T00:00:00Z" }),
  );
  assert.equal(await dispatchJob(erased.ctx, erased.job), "done");
  assert.equal(erased.told[0].subject, "Someone booked with you");
  assert.doesNotMatch(erased.told[0].body, /Dulce/);
});

test("visit_notice tells a hold the tool confirmed, and nobody of a move, a cancellation, a vanished or returned visit, or a member's own entry", async () => {
  const confirmed = world({ subscriber: "visit_notice" });
  confirmed.tables.events[0].data = { change: "confirmed", source: "booking_email", starts_at: "2999-10-12T15:00:00Z" };
  assert.equal(await dispatchJob(confirmed.ctx, confirmed.job), "done");
  assert.equal(confirmed.told.length, 1, "a proposed visit the tool booked is a booking arriving");

  for (const [change, source] of [
    ["moved", "booking_email"],
    ["cancelled", "booking_email"],
    ["vanished", "calendar_feed"],
    ["back", "calendar_feed"],
    ["moved", "calendar_feed"],
    ["added", "person"],
    ["confirmed", "calendar_feed"],
  ]) {
    const w = world({ subscriber: "visit_notice" });
    w.tables.events[0].data = { change, source, starts_at: "2999-10-12T15:00:00Z" };
    assert.equal(await dispatchJob(w.ctx, w.job), "done", `${change} from ${source}`);
    assert.deepEqual(w.told, [], `${change} from ${source}: not a booking arriving`);
    assert.equal(w.delivery().state, "done");
  }
  // An event that is not about an appointment at all.
  const other = world({ subscriber: "visit_notice" });
  Object.assign(other.tables.events[0], { kind: "message.received", subject_type: null, subject_id: null });
  assert.equal(await dispatchJob(other.ctx, other.job), "done");
  assert.deepEqual(other.told, []);
});

test("visit_notice tells what stands: a visit withdrawn, vanished, cancelled, already past, or entered by a member by the time it runs is not news", async () => {
  for (const over of [
    { status: "cancelled" },
    { status: "proposed" },
    { vanished_at: "2026-10-06T00:30:00Z" },
    { starts_at: "2020-01-01T15:00:00Z", ends_at: "2020-01-01T16:00:00Z" },
    { source: "person" },
  ]) {
    const w = world({ subscriber: "visit_notice" });
    w.tables.appointments[0] = aVisit(over);
    assert.equal(await dispatchJob(w.ctx, w.job), "done", JSON.stringify(over));
    assert.deepEqual(w.told, [], JSON.stringify(over));
  }
  const gone = world({ subscriber: "visit_notice" });
  gone.tables.appointments.length = 0;
  assert.equal(await dispatchJob(gone.ctx, gone.job), "done");
  assert.deepEqual(gone.told, [], "a visit the record no longer holds");
});

test("visit_notice tells a booking the customer cancelled or moved through their booking tool, once, while it is ahead, opening the visit on its day; never a member's own word, and nothing from before 00436 (the wiring's second audit, R11 S6-6)", async () => {
  const STARTS = "2999-10-12T15:00:00Z";
  const cancelled = world({ subscriber: "visit_notice" });
  cancelled.tables.appointments[0] = aVisit({ status: "cancelled" });
  cancelled.tables.events[0].data = { change: "cancelled", source: "booking_email", starts_at: STARTS, by: "service" };
  assert.equal(await dispatchJob(cancelled.ctx, cancelled.job), "done");
  assert.equal(cancelled.told.length, 1);
  const [c] = cancelled.told;
  assert.deepEqual(
    [c.kind, c.route, c.about, c.sourceEvent, c.subject],
    [
      "booking",
      `calendar/2999-10-12:a-${APPT}`,
      { type: "appointment", id: APPT },
      E,
      "Rosa Diaz cancelled their booking",
    ],
    "the time freed, at the visit on its day, answering the event",
  );
  assert.match(
    c.body,
    /^\w{3}, Oct 12 · 11:00\sAM – 12:00\sPM\nGel manicure\nThat time is free again\.\n\nFrom your booking tool's email$/,
  );
  assert.doesNotMatch(c.redactedBody, /Rosa|manicure/, "the platform's copy holds no customer");
  assert.equal(await dispatchJob(cancelled.ctx, cancelled.job), "done");
  assert.equal(cancelled.told.length, 1, "a second delivery of the same event tells nobody");

  const moved = world({ subscriber: "visit_notice" });
  moved.tables.appointments[0] = aVisit({ source: "booking_tool" });
  moved.tables.events[0].data = { change: "moved", source: "booking_tool", starts_at: STARTS, by: "service" };
  assert.equal(await dispatchJob(moved.ctx, moved.job), "done");
  assert.deepEqual(
    moved.told.map((n) => [
      n.subject,
      n.body.split("\n")[0].startsWith("Now "),
      n.body.endsWith("From your booking tool"),
    ]),
    [["Rosa Diaz moved their booking", true, true]],
    "the new time, said as now",
  );

  for (const [why, data, visit] of [
    ["a member's own cancel", { change: "cancelled", source: "booking_email", by: "member" }, { status: "cancelled" }],
    [
      "an event from before 00436, which says no by",
      { change: "cancelled", source: "booking_email" },
      { status: "cancelled" },
    ],
    ["the owner's calendar moving its own diary", { change: "moved", source: "calendar_feed", by: "service" }, {}],
    ["a member's own entry", { change: "moved", source: "person", by: "service" }, { source: "person" }],
    [
      "a cancelled visit already past",
      { change: "cancelled", source: "booking_email", by: "service" },
      { status: "cancelled", starts_at: "2020-01-01T15:00:00Z", ends_at: "2020-01-01T16:00:00Z" },
    ],
    [
      "a move whose visit was cancelled since",
      { change: "moved", source: "booking_email", by: "service" },
      { status: "cancelled" },
    ],
  ]) {
    const w = world({ subscriber: "visit_notice" });
    w.tables.appointments[0] = aVisit(visit);
    w.tables.events[0].data = { starts_at: STARTS, ...data };
    assert.equal(await dispatchJob(w.ctx, w.job), "done", why);
    assert.deepEqual(w.told, [], why);
  }
});

/** A made-up uuid of one kind of row, numbered: ordered the way the ledger orders ids. */
const numbered = (prefix, i) => `${prefix}${String(i).padStart(7, "0")}-0000-4000-8000-000000000000`;

/** What the sweep stamps on a calendar's addition that is a customer's booking (00419): a person's, one-off, no copy, not a first read. */
const BOOKED_FACTS = { named: true, series: false, twin: false, first: false };

/**
 * The additions one read of the owner's calendar wrote together: n events of one transaction, each a visit linked to a person
 * with no name on record, stamped with `facts` (or `facts(i)` for the i-th, the order event ids sort in). `first` is the
 * event the job delivers.
 */
function aCalendarRead(n, { first = 0, facts = BOOKED_FACTS } = {}) {
  const w = world({ subscriber: "visit_notice" });
  w.tables.appointments.length = 0;
  w.tables.events.length = 0;
  w.tables.contacts.push(rows.contact({ id: PERSON, tenant_id: T, display_name: null, wa_profile_name: null }));
  const at = "2026-10-06T00:00:00.123456+00:00";
  for (let i = 0; i < n; i++) {
    const day = String(12 + i).padStart(2, "0");
    w.tables.appointments.push(
      aVisit({
        id: numbered("a", i),
        source: "calendar_feed",
        client_name: null,
        contact_id: PERSON,
        service: i === 0 ? "Consultation" : null,
        starts_at: `2999-10-${day}T15:00:00Z`,
        ends_at: `2999-10-${day}T16:00:00Z`,
      }),
    );
    w.tables.events.push(
      rows.event({
        id: numbered("e", i),
        tenant_id: T,
        kind: "appointment.changed",
        category: "appointment",
        subject_type: "appointment",
        subject_id: numbered("a", i),
        data: {
          change: "added",
          source: "calendar_feed",
          starts_at: `2999-10-${day}T15:00:00Z`,
          ...(typeof facts === "function" ? facts(i) : facts),
        },
        created_at: at,
      }),
    );
  }
  const mine = w.tables.events[first];
  Object.assign(w.job.payload, { event_id: mine.id });
  w.tables.event_deliveries[0].event_id = mine.id;
  return w;
}

test("visit_notice tells the visits one read of the calendar added as one line, by the first of their events and no other", async () => {
  const first = aCalendarRead(3, { first: 0 });
  assert.equal(await dispatchJob(first.ctx, first.job), "done");
  assert.equal(first.told.length, 1);
  const [n] = first.told;
  assert.equal(n.kind, "booking");
  assert.equal(n.subject, "3 new bookings on your calendar");
  assert.equal(n.about, null, "a group is about no one visit");
  assert.equal(n.route, `calendar/2999-10-12:a-${numbered("a", 0)}`, "it opens the earliest");
  assert.match(n.body, /Consultation/);
  assert.match(n.body, /From your calendar$/);
  assert.equal(n.sourceEvent, numbered("e", 0), "answering the first event of the read");

  // The others' deliveries, run over the same read, tell nobody: the first one did.
  for (const i of [1, 2]) {
    const w = aCalendarRead(3, { first: i });
    assert.equal(await dispatchJob(w.ctx, w.job), "done");
    assert.deepEqual(w.told, [], `the event at ${i} is not the first of its read`);
  }

  // One visit added by a read is told in its own words, from the calendar.
  const alone = aCalendarRead(1);
  assert.equal(await dispatchJob(alone.ctx, alone.job), "done");
  assert.equal(alone.told[0].subject, "Someone booked with you");
  assert.match(alone.told[0].body, /From your calendar$/);
});

test("visit_notice tells nobody of a read that adds more than a customer could book in an hour: a calendar newly connected", async () => {
  const { CATCH_UP_VISITS } = await import("../../../../packages/contracts/src/notices/visit-news.ts");
  const atTheLimit = aCalendarRead(CATCH_UP_VISITS);
  assert.equal(await dispatchJob(atTheLimit.ctx, atTheLimit.job), "done");
  assert.equal(atTheLimit.told.length, 1, "up to the limit is news");
  const over = aCalendarRead(CATCH_UP_VISITS + 1);
  assert.equal(await dispatchJob(over.ctx, over.job), "done");
  assert.deepEqual(over.told, [], "beyond it, it is a calendar read and not customers booking");
  assert.equal(over.delivery().state, "done");
});

test("REGRESSION: visit_notice tells nobody of what the owner's calendar holds that is no customer's booking -- their own entry, the next of a series, the copy of a booking already told, a calendar just connected, an addition from before its facts were stamped (the wiring's second audit, S11-1)", async () => {
  for (const [why, facts] of [
    ["linked to nobody: the owner's own entry", { ...BOOKED_FACTS, named: false }],
    ["the next of a repeating series coming into the window", { ...BOOKED_FACTS, series: true }],
    ["the calendar's copy of a booking its tool's email told", { ...BOOKED_FACTS, twin: true }],
    ["one of a calendar's first read", { ...BOOKED_FACTS, first: true }],
    ["stamped before 00419: no facts at all", {}],
  ]) {
    const w = aCalendarRead(1, { facts });
    assert.equal(await dispatchJob(w.ctx, w.job), "done", why);
    assert.deepEqual(w.told, [], why);
    assert.equal(w.delivery().state, "done");
  }
  // A visit linked to a person when it was added, and to nobody by the time the delivery runs (the person merged away):
  // the record is read as it stands, and an entry nobody's is not a booking.
  const unlinked = aCalendarRead(1);
  unlinked.tables.appointments[0].contact_id = null;
  assert.equal(await dispatchJob(unlinked.ctx, unlinked.job), "done");
  assert.deepEqual(unlinked.told, []);
});

test("REGRESSION: a booking whose calendar copy was told first (its email held, then read again) is not told again; a copy not told, or of another visit, leaves it to be told (the wiring's second audit, S11-2)", async () => {
  const COPY = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2";
  const COPY_EVENT = "e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2";
  /** The email's visit linked to the person, and the calendar's copy of it `minutes` later, told or not. */
  const both = ({ minutes = 5, told = true, person = PERSON } = {}) => {
    const w = world({ subscriber: "visit_notice" });
    w.tables.contacts.push(rows.contact({ id: PERSON, tenant_id: T, display_name: "Rosa Diaz" }));
    w.tables.appointments[0] = aVisit({ contact_id: PERSON });
    const start = new Date(Date.parse("2999-10-12T15:00:00Z") + minutes * 60_000).toISOString();
    w.tables.appointments.push(
      aVisit({ id: COPY, source: "calendar_feed", client_name: null, contact_id: person, starts_at: start }),
    );
    w.tables.events.push(
      rows.event({
        id: COPY_EVENT,
        tenant_id: T,
        kind: "appointment.changed",
        category: "appointment",
        subject_type: "appointment",
        subject_id: COPY,
        data: { change: "added", source: "calendar_feed", starts_at: start, ...BOOKED_FACTS },
        created_at: "2026-10-05T23:00:00Z",
      }),
    );
    if (told)
      w.tables.notifications.push({
        id: "f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2",
        tenant_id: T,
        kind: "booking",
        title: "Rosa Diaz booked with you",
        body: "From your calendar",
        source_event: COPY_EVENT,
        mail_due_at: null,
        created_at: "2026-10-05T23:00:01Z",
      });
    return w;
  };
  const twice = both();
  assert.equal(await dispatchJob(twice.ctx, twice.job), "done");
  assert.deepEqual(twice.told, [], "the visit was told once, as the calendar's copy");

  for (const [why, over] of [
    ["the copy was never told (a series, a first read)", { told: false }],
    ["another visit of the same person: half an hour apart", { minutes: 30 }],
    ["another person's visit at the same time", { person: "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1" }],
  ]) {
    const w = both(over);
    assert.equal(await dispatchJob(w.ctx, w.job), "done", why);
    assert.equal(w.told.length, 1, why);
  }
  // A booking linked to nobody cannot be matched to a copy: it is told.
  const nobody = both();
  nobody.tables.appointments[0].contact_id = null;
  assert.equal(await dispatchJob(nobody.ctx, nobody.job), "done");
  assert.equal(nobody.told.length, 1);
});

test("REGRESSION: a read that adds a booking beside the owner's own entry, a booking's copy or a series' next occurrence tells the booking once, whichever event sorts first, and never names the other (the review of the wiring's second audit, M1, B1, B2)", async () => {
  for (const [why, other] of [
    ["the owner's own entry", { ...BOOKED_FACTS, named: false }],
    ["a booking's copy", { ...BOOKED_FACTS, twin: true }],
    ["a series' next occurrence", { ...BOOKED_FACTS, series: true }],
  ]) {
    for (const otherFirst of [true, false]) {
      const booking = otherFirst ? 1 : 0;
      const facts = (i) => (i === booking ? BOOKED_FACTS : other);
      const told = [];
      // Each addition's own delivery, run over the same read.
      for (const deliver of [0, 1]) {
        const w = aCalendarRead(2, { first: deliver, facts });
        assert.equal(await dispatchJob(w.ctx, w.job), "done");
        told.push(...w.told);
      }
      const order = otherFirst ? "sorting first" : "sorting second";
      assert.equal(told.length, 1, `${why} ${order}: the booking is told, once`);
      assert.equal(told[0].subject, "Someone booked with you", `${why} ${order}: one visit, in its own words`);
      assert.deepEqual(told[0].about, { type: "appointment", id: numbered("a", booking) });
    }
  }
});

test("REGRESSION: the calendar's copy of a booking told first is not told again, even when the sweep read the calendar before the booking's row existed and could not mark it (the review's B4)", async () => {
  const COPY = "a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3";
  const COPY_EVENT = "e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3";
  const copyOf = ({ told = true, minutes = 5, booking = {} } = {}) => {
    const w = world({ subscriber: "visit_notice" });
    w.tables.contacts.push(rows.contact({ id: PERSON, tenant_id: T, display_name: "Rosa Diaz" }));
    // The booking email's visit, and its arrival (event E) told on the bell.
    w.tables.appointments[0] = aVisit({ contact_id: PERSON, ...booking });
    if (told)
      w.tables.notifications.push({
        id: "f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3",
        tenant_id: T,
        kind: "booking",
        title: "Rosa Diaz booked with you",
        body: "From your booking tool's email",
        source_event: E,
        mail_due_at: null,
        created_at: "2026-10-06T00:00:01Z",
      });
    // The calendar's copy, stamped a booking (no twin: the sweep had no row to match), and its addition delivered.
    const start = new Date(Date.parse("2999-10-12T15:00:00Z") + minutes * 60_000).toISOString();
    w.tables.appointments.push(
      aVisit({ id: COPY, source: "calendar_feed", client_name: null, contact_id: PERSON, starts_at: start }),
    );
    w.tables.events.push(
      rows.event({
        id: COPY_EVENT,
        tenant_id: T,
        kind: "appointment.changed",
        category: "appointment",
        subject_type: "appointment",
        subject_id: COPY,
        data: { change: "added", source: "calendar_feed", starts_at: start, ...BOOKED_FACTS },
        created_at: "2026-10-06T01:00:00Z",
      }),
    );
    w.job.payload.event_id = COPY_EVENT;
    w.tables.event_deliveries[0].event_id = COPY_EVENT;
    return w;
  };
  const again = copyOf();
  assert.equal(await dispatchJob(again.ctx, again.job), "done");
  assert.deepEqual(again.told, [], "told as the booking: the copy says nothing");
  // The booking not told (yet), another visit of the person, or a booking cancelled since and booked again at that time
  // through the calendar (the review's follow-up: only a sighting that stands is the visit's): the copy is news.
  for (const over of [{ told: false }, { minutes: 30 }, { booking: { status: "cancelled" } }]) {
    const w = copyOf(over);
    assert.equal(await dispatchJob(w.ctx, w.job), "done");
    assert.equal(w.told.length, 1, JSON.stringify(over));
  }
});

test("a read whose line holds a visit already told as its booking names only the rest, under the lead's event, whichever leads (the review's follow-up)", async () => {
  const BOOKING = "a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4";
  const BOOKING_EVENT = "e4e4e4e4-e4e4-4e4e-8e4e-e4e4e4e4e4e4";
  for (const toldFirst of [0, 1]) {
    for (const deliver of [0, 1]) {
      const w = aCalendarRead(2, { first: deliver });
      // The visit at index `toldFirst` was booked through its tool's email and told before the sweep could mark its copy.
      const copy = w.tables.appointments[toldFirst];
      w.tables.appointments.push(
        aVisit({
          id: BOOKING,
          source: "booking_email",
          contact_id: PERSON,
          starts_at: copy.starts_at,
          ends_at: copy.ends_at,
        }),
      );
      w.tables.events.push(
        rows.event({
          id: BOOKING_EVENT,
          tenant_id: T,
          kind: "appointment.changed",
          category: "appointment",
          subject_type: "appointment",
          subject_id: BOOKING,
          data: { change: "added", source: "booking_email", starts_at: copy.starts_at },
          created_at: "2026-10-05T23:00:00Z",
        }),
      );
      w.tables.notifications.push({
        id: "f4f4f4f4-f4f4-4f4f-8f4f-f4f4f4f4f4f4",
        tenant_id: T,
        kind: "booking",
        title: "Someone booked with you",
        body: "From your booking tool's email",
        source_event: BOOKING_EVENT,
        mail_due_at: null,
        created_at: "2026-10-05T23:00:01Z",
      });
      assert.equal(await dispatchJob(w.ctx, w.job), "done");
      if (deliver !== 0) {
        assert.deepEqual(w.told, [], "only the read's first event tells its line");
        continue;
      }
      assert.equal(w.told.length, 1);
      const [n] = w.told;
      assert.equal(n.subject, "Someone booked with you", "one visit: the other was told as its booking");
      assert.deepEqual(n.about, { type: "appointment", id: numbered("a", 1 - toldFirst) });
      assert.equal(n.sourceEvent, numbered("e", 0), "under the lead's event");
    }
  }
});

test("a calendar copy told, then gone from the calendar, does not silence the booking that books that time again (the review's follow-up)", async () => {
  const COPY = "a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5";
  const COPY_EVENT = "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5";
  const w = world({ subscriber: "visit_notice" });
  w.tables.contacts.push(rows.contact({ id: PERSON, tenant_id: T, display_name: "Rosa Diaz" }));
  w.tables.appointments[0] = aVisit({ contact_id: PERSON });
  w.tables.appointments.push(
    aVisit({
      id: COPY,
      source: "calendar_feed",
      client_name: null,
      contact_id: PERSON,
      vanished_at: "2026-10-05T22:00:00Z",
    }),
  );
  w.tables.events.push(
    rows.event({
      id: COPY_EVENT,
      tenant_id: T,
      kind: "appointment.changed",
      category: "appointment",
      subject_type: "appointment",
      subject_id: COPY,
      data: { change: "added", source: "calendar_feed", starts_at: "2999-10-12T15:00:00Z", ...BOOKED_FACTS },
      created_at: "2026-10-05T20:00:00Z",
    }),
  );
  w.tables.notifications.push({
    id: "f5f5f5f5-f5f5-4f5f-8f5f-f5f5f5f5f5f5",
    tenant_id: T,
    kind: "booking",
    title: "Rosa Diaz booked with you",
    body: "From your calendar",
    source_event: COPY_EVENT,
    mail_due_at: null,
    created_at: "2026-10-05T20:00:01Z",
  });
  assert.equal(await dispatchJob(w.ctx, w.job), "done");
  assert.equal(w.told.length, 1, "the booking is told");
});

/* --------------------------------------------------------------- a teammate who joined (S1-19, 00410) */

test("team_notice tells the workspace that a teammate joined once, on the bell, opening Settings > Team", async () => {
  const w = world({ subscriber: "team_notice" });
  assert.equal(await dispatchJob(w.ctx, w.job), "done");
  assert.equal(w.told.length, 1);
  const [n] = w.told;
  assert.deepEqual(
    [n.kind, n.route, n.about, n.sourceEvent],
    ["member_joined", "admin/team", { type: "invitation", id: INVITATION }, E],
  );
  assert.equal(n.subject, "ada@example.com joined your team");
  assert.equal(
    n.body,
    "They accepted your invitation and joined as Operator.\nTheir role can be changed, or the seat removed, under Settings > Team.",
  );
  assert.doesNotMatch(n.redactedBody, /ada/, "the platform's copy holds no address");
  assert.equal(await dispatchJob(w.ctx, w.job), "done");
  assert.equal(w.told.length, 1, "a second delivery tells nobody");
});

test("team_notice tells an arrival once however many events wrote it, and nothing of an event that is not a seat or an invitation that is gone", async () => {
  // Two tabs took the one seat at once and each wrote the ledger line: the owner is told of one arrival.
  const twice = world({ subscriber: "team_notice" });
  twice.tables.notifications.push({
    id: "f5f5f5f5-f5f5-4f5f-8f5f-f5f5f5f5f5f5",
    tenant_id: T,
    kind: "member_joined",
    title: "ada@example.com joined your team",
    body: "…",
    route: "admin/team",
    subject_type: "invitation",
    subject_id: INVITATION,
    source_event: "a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3",
    recipient_user_id: null,
    mail_due_at: null,
    created_at: "2026-10-06T00:00:01Z",
  });
  assert.equal(await dispatchJob(twice.ctx, twice.job), "done");
  assert.deepEqual(twice.told, []);

  const gone = world({ subscriber: "team_notice" });
  gone.tables.invitations.length = 0;
  assert.equal(await dispatchJob(gone.ctx, gone.job), "done");
  assert.deepEqual(gone.told, [], "an invitation the workspace no longer holds");

  for (const over of [
    { kind: "member.left", subject_type: "workspace", subject_id: T },
    { subject_type: "membership" },
    { subject_id: null },
  ]) {
    const w = world({ subscriber: "team_notice" });
    Object.assign(w.tables.events[0], over);
    assert.equal(await dispatchJob(w.ctx, w.job), "done", JSON.stringify(over));
    assert.deepEqual(w.told, [], JSON.stringify(over));
  }
});

test("team_notice tells the workspace that a teammate left, once, on the bell, opening Settings > Team, named while their account stands; a deleted account is told without a name (the wiring's second audit, R11 W-channel-team-plus-5, 00437)", async () => {
  const LEAVER = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";
  const left = world({ subscriber: "team_notice" });
  Object.assign(left.tables.events[0], {
    kind: "member.left",
    subject_type: "workspace",
    subject_id: T,
    data: { by: LEAVER, how: "left", had_role: "operator" },
  });
  const asked = [];
  // The identity store, as the service role reads it (packages/db memberEmailOf).
  left.ctx.db.auth = {
    admin: {
      getUserById: async (id) => {
        asked.push(id);
        return { data: { user: { id, email: "ada@example.com" } }, error: null };
      },
    },
  };
  assert.equal(await dispatchJob(left.ctx, left.job), "done");
  assert.deepEqual(asked, [LEAVER]);
  assert.equal(left.told.length, 1);
  const [n] = left.told;
  assert.deepEqual(
    [n.kind, n.route, n.about, n.sourceEvent, n.subject],
    ["member_left", "admin/team", null, E, "ada@example.com left your team"],
  );
  assert.match(n.body, /^They left the workspace, where they were /);
  assert.doesNotMatch(n.redactedBody, /ada@/, "the platform's copy holds nobody");
  assert.equal(await dispatchJob(left.ctx, left.job), "done");
  assert.equal(left.told.length, 1, "a second delivery of the same event tells nobody");

  const deleted = world({ subscriber: "team_notice" });
  Object.assign(deleted.tables.events[0], {
    kind: "member.left",
    subject_type: "workspace",
    subject_id: T,
    data: { by: LEAVER, how: "account_deleted" },
  });
  assert.equal(await dispatchJob(deleted.ctx, deleted.job), "done");
  assert.deepEqual(
    deleted.told.map((t) => [t.kind, t.subject]),
    [["member_left", "A teammate deleted their account"]],
    "the account is gone: no address is asked for, and none is said",
  );
});
