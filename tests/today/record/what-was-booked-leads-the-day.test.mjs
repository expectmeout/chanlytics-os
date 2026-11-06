/**
 * What was booked today, the figure Today's four lead with (decision 0076, as amended 2 Nov 2026: the figures measured
 * activity, and a receptionist's day is measured by what it booked). Counted by the server beside metrics_summary
 * (server/metrics/bookings.ts) by the bell's own rule, run here over the record in memory: a booking arriving
 * (bookingArriving: a visit a booking tool, its email or the owner's calendar added or confirmed, never the owner's own
 * entry or a calendar's first read), since the day's own midnight, still booked, and each once. Then said by contracts:
 * how many, the soonest as the clause, who for when as the receipt; a zero on a workspace no booking can reach asks for a
 * calendar; and a read that says nothing of bookings keeps the four figures they were.
 */
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { BOOKED_NEEDS_A_LINK, bookedOnce, toTodayVM, visitDay, visitStartTime, visitTime } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { rows, TENANT } from "../../_rows.mjs";
import { importSrc } from "../../_source.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { metricsSummaryFor } = await importSrc("apps/dashboard/src/server/metrics/metrics.ts");

// 11:00 in New York on Friday 18 September 2026; the day began at 04:00 UTC.
const NOW = new Date("2026-09-18T15:00:00Z");
const TZ = "America/New_York";
const SUMMARY = {
  workspace: { name: "Harbor Studio", timezone: TZ, status: "active" },
  channels: [],
  window: {
    days: 1,
    since: "2026-09-18T04:00:00+00:00",
    since_local: "2026-09-18T00:00:00",
    now_local: "2026-09-18T11:00:00",
  },
  now: {},
  period: { messages_in: 4, median_reply_seconds_ai: 62 },
};

/** A visit on the record, booked, an hour long. */
const visit = (id, startsAt, over = {}) => ({
  id,
  tenant_id: TENANT,
  contact_id: null,
  lead_id: null,
  source: "booking_tool",
  tool: null,
  external_id: null,
  status: "booked",
  starts_at: startsAt,
  ends_at: new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
  all_day: false,
  title: null,
  service: null,
  staff: null,
  price: null,
  note: null,
  client_name: null,
  client_phone: null,
  client_email: null,
  consultation: false,
  timezone: TZ,
  vanished_at: null,
  created_by: null,
  created_at: "2026-09-18T13:00:00Z",
  updated_at: "2026-09-18T13:00:00Z",
  expires_at: null,
  conversation_id: null,
  ...over,
});
/** The record's word that a visit changed, as the trigger and the feed write it (00389, 00348, 00419). */
const changed = (id, data, at = "2026-09-18T13:00:00Z") =>
  rows.event({
    tenant_id: TENANT,
    kind: "appointment.changed",
    category: "appointment",
    subject_type: "appointment",
    subject_id: id,
    data,
    created_at: at,
  });
const FEED = { source: "calendar_feed", change: "added", named: true, series: false, twin: false, first: false };
const SAT = "2026-09-19T14:00:00Z";
const MON = "2026-09-21T18:30:00Z";

const ben = rows.contact({ tenant_id: TENANT, display_name: "Ben Ortiz", phone_e164: "+13055550111" });
const dana = rows.contact({ tenant_id: TENANT, display_name: "Dana Whitfield", phone_e164: "+13055550112" });
const membership = {
  user_id: "u1",
  tenant_id: TENANT,
  role: "owner",
  tenants: { slug: "harbor" },
  created_at: "2026-01-01T00:00:00Z",
};

/** The day's metrics over a record, read at NOW: the changes are read from 26 hours back by the clock. */
async function day(tables) {
  mock.timers.enable({ apis: ["Date"], now: NOW.getTime() });
  try {
    return await metricsSummaryFor(
      fakeDb(
        { memberships: [membership], mailboxes: [], ...tables },
        {},
        { metrics_summary: () => SUMMARY, first_replies: () => [] },
      ),
      TENANT,
      1,
    );
  } finally {
    mock.timers.reset();
  }
}

test("what was booked today: each booking that arrived since midnight, still booked, once, the soonest first", async () => {
  const { bookings } = await day({
    contacts: [ben, dana],
    appointments: [
      // Dana's booking by its tool's email, and the calendar's copy of it, read first: one visit.
      visit("a-mail", SAT, { source: "booking_email", client_name: "Dana Whitfield" }),
      visit("a-copy", SAT, { source: "calendar_feed", contact_id: dana.id }),
      // Ben's, by the owner's calendar.
      visit("a-ben", MON, { source: "calendar_feed", contact_id: ben.id }),
      // None of these: the calendar's first read, the owner's own entry, yesterday's, one since cancelled.
      visit("a-first", MON, { source: "calendar_feed", contact_id: ben.id }),
      visit("a-own", MON, { source: "person" }),
      visit("a-old", SAT, { client_name: "Ana Reyes" }),
      visit("a-gone", SAT, { client_name: "Sofia Diaz", status: "cancelled" }),
    ],
    events: [
      changed("a-mail", { source: "booking_email", change: "added", starts_at: SAT }),
      changed("a-copy", { ...FEED, starts_at: SAT }, "2026-09-18T12:00:00Z"),
      changed("a-ben", { ...FEED, starts_at: MON }),
      changed("a-first", { ...FEED, first: true, starts_at: MON }),
      changed("a-own", { source: "person", change: "added", starts_at: MON }),
      changed("a-old", { source: "booking_tool", change: "added", starts_at: SAT }, "2026-09-18T03:00:00Z"),
      changed("a-gone", { source: "booking_tool", change: "added", starts_at: SAT }),
    ],
  });
  assert.equal(bookings.booked, 2, "REGRESSION: Today's figures counted messages and calls, never what was booked");
  assert.deepEqual(
    bookings.visits.map((v) => [v.who, v.start]),
    [
      ["Dana Whitfield", SAT],
      ["Ben Ortiz", MON],
    ],
  );
  assert.equal(bookings.arrive, true);
});

test("a workspace no booking can reach says so, and one with a calendar says none today", async () => {
  assert.deepEqual((await day({})).bookings, { booked: 0, visits: [], arrive: false });
  const calendar = await day({ appointments: [visit("a-week", SAT, { source: "calendar_feed" })] });
  assert.deepEqual(calendar.bookings, { booked: 0, visits: [], arrive: true }, "a calendar's visit on the record");
});

/** A day's metrics as the page holds them, with what was booked where the read says it. */
const metrics = (bookings) => ({
  workspace: { name: "Harbor Studio", timezone: TZ, status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+1 305" }],
  window: SUMMARY.window,
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: "2026-09-18T14:00:00Z",
    last_outbound_at: "2026-09-18T14:01:00Z",
  },
  period: {
    messages_in: 3,
    messages_out_ai: 3,
    messages_out_you: 0,
    conversations_active: 2,
    answered_by_ai: 3,
    answered_by_you: 0,
    unanswered_in_window: 0,
    median_reply_seconds_ai: 40,
    send_failures: 0,
    escalations_new: 0,
    escalation_reasons: {},
    calls: 1,
    call_seconds: 120,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 2,
  },
  ...(bookings === undefined ? {} : { bookings }),
});
const booked = (who, start) => ({
  id: `a-${who}`,
  start,
  end: new Date(Date.parse(start) + 3_600_000).toISOString(),
  all_day: false,
  timezone: TZ,
  who,
  service: null,
});
const figuresOf = (bookings) => toTodayVM(metrics(bookings), [], [], [], NOW).figures;
/** A visit's day inside a sentence, its hour as the receipt says it, and its start as the clause does. */
const end = (start) => new Date(Date.parse(start) + 3_600_000).toISOString();
const dayOf = (start) => {
  const d = visitDay(start, TZ, NOW.getTime());
  return d === "Tomorrow" || d === "Today" ? d.toLowerCase() : d;
};
const when = (start) => `${dayOf(start)} · ${visitTime({ start, end: end(start) }, TZ)}`;
const starts = (start) => `${dayOf(start)} · ${visitStartTime({ start }, TZ)}`;

test("the figures lead with what was booked: how many, the soonest, and who for when, opening it on its day", () => {
  const visits = [booked("Dana Whitfield", SAT), booked("Ben Ortiz", MON)];
  const [first, ...rest] = figuresOf({ booked: 2, visits, arrive: true });
  assert.deepEqual(
    [first.id, first.label, first.value, first.meta],
    ["booked", "booked", 2, `the soonest ${starts(SAT)}`],
  );
  assert.equal(first.receipt.text, `Dana Whitfield for ${when(SAT)} and Ben Ortiz for ${when(MON)}.`);
  assert.equal(first.meta, "the soonest tomorrow · 10:00 AM", "a day inside a sentence is lower-case");
  assert.equal(first.receipt.door.label, "Open the Calendar");
  assert.match(first.receipt.door.to, /2026-09-19/, "the soonest, on its day");
  assert.deepEqual(
    rest.map((f) => f.id),
    ["answered", "calls", "new"],
    "four still, so a phone keeps its one row: answered holds what the messages figure said (Today in three zones)",
  );
  const one = figuresOf({ booked: 1, visits: [visits[0]], arrive: true })[0];
  assert.equal(one.meta, `for ${starts(SAT)}`);
  const five = figuresOf({ booked: 5, visits: [...visits, booked("Ana", MON), booked("Sofia", MON)], arrive: true })[0];
  assert.match(five.receipt.text, /Ana for .* and 2 more\.$/, "three named, the rest counted");
});

test("a zero is said as what it is: none yet where bookings arrive, a calendar to link where none ever has", () => {
  const none = figuresOf({ booked: 0, visits: [], arrive: true })[0];
  assert.deepEqual([none.id, none.value, none.meta, none.receipt], ["booked", 0, "none yet today", null]);
  const unlinked = figuresOf({ booked: 0, visits: [], arrive: false })[0];
  assert.equal(unlinked.meta, "no calendar linked");
  assert.equal(unlinked.receipt.text, BOOKED_NEEDS_A_LINK);
});

test("a read that says nothing of bookings still leads with booked, as a dash, never a zero it does not know", () => {
  for (const said of [undefined, null])
    assert.deepEqual(
      figuresOf(said).map((f) => f.id),
      ["booked", "answered", "calls", "new"],
      `bookings ${String(said)}`,
    );
  assert.equal(figuresOf(null)[0].value, null, "booked could not be read: a dash");
});

test("a booking and the calendar's copy of it are one visit; two visits of one person are two", () => {
  const v = (id, who, start) => ({
    id,
    start,
    end: start,
    allDay: false,
    timezone: TZ,
    who,
    service: null,
    via: "booking_tool",
  });
  const near = "2026-09-19T14:20:00Z";
  assert.deepEqual(
    bookedOnce([v("b", "Dana", near), v("a", "Dana", SAT)]).map((x) => x.id),
    ["a"],
    "twenty minutes apart: one visit, the soonest kept",
  );
  assert.equal(bookedOnce([v("a", "Dana", SAT), v("b", "Dana", MON)]).length, 2, "two days: two visits");
  assert.equal(bookedOnce([v("a", null, SAT), v("b", null, SAT)]).length, 2, "nobody named cannot be matched");
});
