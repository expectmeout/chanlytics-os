/**
 * An opened visit's decisions, EXECUTED. Opening a block on the board used to give a title, a long
 * date, a sentence, and a bordered box that looked like a field but was the event's own notes — and when a
 * booking tool had written the person's name and number into those notes, the box repeated what the two
 * lines above it already said.
 *
 * The page's three judgements (how long it runs, which day it is in the words a person asks in, and whether the notes
 * say anything new), and the sheet's own view model (contracts visitSheetOf, the Calendar's lane E): how a visit stands,
 * said once; who it is for; the one question an ended visit asks; the rows that say something new; where it changes; and
 * the one act it leads with, by how it stands. The phone's sheet and the desk's peek draw it and decide nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { crDur, crNotesWorth, crWhen } = await import("../../../../apps/dashboard/src/surfaces/calendar/words.ts");
const W = { crDur, crNotesWorth, crWhen };

test("how long it runs, in the words the day's rows use", () => {
  assert.equal(W.crDur(45), "45m");
  assert.equal(W.crDur(60), "1h");
  assert.equal(W.crDur(90), "1h 30m");
  assert.equal(W.crDur(120), "2h");
  // An all-day block and a broken one say nothing rather than "0m".
  for (const bad of [0, -5, null, undefined, NaN]) assert.equal(W.crDur(bad), "", String(bad));
});

test("which day, as a person asks it", () => {
  const TODAY = "2026-09-20";
  assert.equal(
    W.crWhen({ today: true, key: TODAY }, TODAY),
    "Today",
    "the board says which day is today; no second clock is consulted",
  );
  assert.equal(W.crWhen({ today: false, key: "2026-09-21" }, TODAY), "Tomorrow");
  assert.equal(W.crWhen({ today: false, key: "2026-09-19" }, TODAY), "Yesterday");
  // Further out, the date itself is the clearer thing to read.
  assert.equal(W.crWhen({ today: false, key: "2026-09-22" }, TODAY), null);
  assert.equal(W.crWhen({ today: false, key: "2026-09-27" }, TODAY), null);
  // Across a month and a year, where adding one to the number is wrong.
  assert.equal(W.crWhen({ today: false, key: "2026-10-01" }, "2026-09-30"), "Tomorrow");
  assert.equal(W.crWhen({ today: false, key: "2027-01-01" }, "2026-12-31"), "Tomorrow");
  assert.equal(W.crWhen({ today: false, key: "2026-12-31" }, "2027-01-01"), "Yesterday");
  assert.equal(
    W.crWhen({ today: false, key: "2026-09-21" }, null),
    null,
    "without the board's today, nothing relative is claimed",
  );
});

test("the notes are shown only when they say something the panel has not", () => {
  const person = { name: "Priya Nair" };
  const contacts = { phones: ["+1 917 555 0103"], e164: ["+19175550103"], emails: [] };
  // What a booking tool wrote, and what the two lines above already say.
  assert.equal(
    W.crNotesWorth("Priya Nair · +1 917 555 0103", person, contacts),
    null,
    "the name and the number are both above",
  );
  assert.equal(W.crNotesWorth("Priya Nair", person, contacts), null);
  assert.equal(W.crNotesWorth("+1 917 555 0103", person, contacts), null);
  // The same number written another way is the same number.
  assert.equal(
    W.crNotesWorth("Priya Nair (917) 555-0103", person, contacts),
    null,
    "a number is its digits, however it is punctuated",
  );
  // Anything an owner has not read yet stays.
  assert.equal(
    W.crNotesWorth("Priya Nair · +1 917 555 0103 · allergic to ammonia", person, contacts),
    "Priya Nair · +1 917 555 0103 · allergic to ammonia",
  );
  assert.equal(W.crNotesWorth("Deposit paid", person, contacts), "Deposit paid");
  // Nothing to say, and nobody matched: the notes stand on their own.
  assert.equal(W.crNotesWorth(null, person, contacts), null);
  assert.equal(W.crNotesWorth("", person, contacts), null);
  assert.equal(W.crNotesWorth("Walk-in", null, { phones: [], emails: [] }), "Walk-in");
  // Punctuation alone is not something to read.
  assert.equal(W.crNotesWorth("Priya Nair ·  —  ", person, contacts), null);
});

test("the notes a booking tool wrote are nothing new when the board prints the number as the board prints it (REGRESSION: the +1 stayed)", async () => {
  const { formatPhoneDisplay } = await import("@chanlytics/contracts");
  const person = { name: "Tom Baker" };
  // The contacts exactly as toCalendarVM hands them to the sheet: the number for the eye, and its E.164.
  const e164 = "+19175550116";
  const contacts = { phones: [formatPhoneDisplay(e164) ?? e164], e164: [e164], emails: [] };
  for (const note of [
    "Tom Baker · +1 917 555 0116",
    "tom baker +1 (917) 555-0116",
    "TOM BAKER, 1-917-555-0116",
    "+1.917.555.0116",
  ])
    assert.equal(W.crNotesWorth(note, person, contacts), null, note);
  assert.equal(
    W.crNotesWorth("Tom Baker · +1 917 555 0116 · first visit", person, contacts),
    "Tom Baker · +1 917 555 0116 · first visit",
  );
  // Another number in the notes is something new.
  assert.equal(W.crNotesWorth("Tom Baker · +1 917 555 0199", person, contacts), "Tom Baker · +1 917 555 0199");
});

test("what may be said of a visit, and when, by mark_visit's own rules (00397): the panel offers no act the door would refuse", async () => {
  const { visitActsOf, visitStateOf } = await import("@chanlytics/contracts");
  const H = 3_600_000;
  const now = Date.parse("2026-10-11T15:00:00Z");
  const at = (fromH) => [now + fromH * H, now + (fromH + 1) * H];
  const acts = (status, fromH) => visitActsOf({ id: "a1", status }, ...at(fromH), now);
  assert.deepEqual(acts("booked", 5), ["cancelled"], "ahead: only cancelled");
  assert.deepEqual(acts("booked", -0.5), ["kept", "missed", "cancelled"], "under way: any of the three");
  assert.deepEqual(acts("booked", -3), ["kept", "missed"], "over: whether they came, never cancelled");
  assert.deepEqual(acts("kept", -3), ["missed"], "a kept visit corrected to missed");
  assert.deepEqual(acts("missed", -3), ["kept"], "and back");
  assert.deepEqual(acts("missed", 5), [], "never of a visit that has not begun: the door refuses it");
  assert.deepEqual(acts("cancelled", 5), [], "a cancelled one is said nothing more of");
  assert.deepEqual(acts("proposed", 5), ["cancelled"], "a request may be cancelled");
  assert.deepEqual(acts("proposed", -3), [], "and never kept or missed: it was not booked");
  assert.deepEqual(visitActsOf(null, ...at(-3), now), [], "an event the record has not kept: nothing to say it on");

  const state = (visit, fromH) => visitStateOf(visit, at(fromH)[1], now)?.text ?? null;
  assert.equal(
    state({ id: "a1", status: "booked" }, -3),
    "Past",
    "REGRESSION: an ended visit said 'Done', as if they came",
  );
  assert.equal(state(null, -3), "Past");
  assert.equal(state({ id: "a1", status: "booked" }, 5), null, "nothing ahead");
  assert.equal(state({ id: "a1", status: "missed" }, -3), "Missed");
  assert.equal(state({ id: "a1", status: "kept" }, -3), "Kept");
  assert.equal(state({ id: "a1", status: "cancelled" }, 5), "Cancelled");
  assert.equal(
    state({ id: "a1", status: "proposed" }, 5),
    "Requested",
    "REGRESSION: a request a booking tool sent was drawn as booked (0002)",
  );
});

/* ------------------------------ the sheet's view model (contracts visitSheetOf) ------------------------------ */

const { appointmentWords, toCalendarVM, visitSheetOf, shiftKey } = await import("@chanlytics/contracts");
const TZ = "America/New_York";
// Tuesday noon in New York.
const NOW = Date.parse("2026-09-08T16:00:00.000Z");
const MON = "2026-09-07";
const HOUR = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();

/** A week as the route sends it, with `items` on their days (each `[dayIndex, item]`) and a booking link. */
function weekOf(items) {
  const days = Array.from({ length: 7 }, (_, i) => ({ key: shiftKey(MON, i), items: [], windows: [] }));
  for (const [d, it] of items) days[d].items.push(it);
  return {
    timezone: TZ,
    from: MON,
    to: shiftKey(MON, 6),
    feed: {
      present: true,
      state: "ok",
      read_at: "2026-09-08T15:58:00.000Z",
      events: items.length,
      recurring_expanded: 0,
      skipped_recurring: 0,
    },
    hours: null,
    closures: [],
    rules: { lead_hours: 2, buffer_min: 15, max_days_ahead: 14 },
    booking_link: "https://book.example.com/luna",
    days,
  };
}
/** What the board knows of Ana from People's row (calendar-person-facts.ts), unless `over` says otherwise. */
const anaFacts = (over = {}) => ({
  state: "active",
  business: "Ruiz Design",
  deal: null,
  step: null,
  last: { at: "2026-09-06T16:00:00.000Z", by: "They wrote" },
  phone: "+19175550100",
  email: null,
  ...over,
});
/** Ana, as People's row matched her: a thread, a WhatsApp reply window open since an hour ago, and her facts. */
const ana = (over = {}) => ({
  id: "p-ana",
  name: "Ana Ruiz",
  via: "phone",
  thread: "th-ana",
  wa_inbound_at: "2026-09-08T15:00:00.000Z",
  reply_wire: "whatsapp",
  facts: anaFacts(),
  ...over,
});
/** Where a visit sits: today, ended an hour ago; under way now; tomorrow; yesterday. `[dayIndex, start, end]`. */
const ENDED = [1, iso(NOW - 3 * HOUR), iso(NOW - HOUR)];
const UNDERWAY = [1, iso(NOW - HOUR / 2), iso(NOW + HOUR / 2)];
const AHEAD = [2, "2026-09-09T14:00:00.000Z", "2026-09-09T15:00:00.000Z"];
const YESTERDAY = [0, "2026-09-07T18:00:00.000Z", "2026-09-07T19:00:00.000Z"];

/** The sheet for one item in `slot`, as the page asks for it (visit-sheet.tsx ctxOf): Ana's color, unless `over` says. */
function sheet(slot, over = {}, ask = {}) {
  const [d, start, end] = slot;
  const it = { id: "e1", start, end, title: "Ana Ruiz · Color", all_day: false, person: ana(), ...over };
  const vm = toCalendarVM(weekOf([[d, it]]), new Date(NOW));
  const day = vm.days[d];
  const block = day.blocks[0] ?? day.allDay[0];
  return visitSheetOf({
    block,
    day: { key: day.key, today: day.today, date: day.date, dow: day.dow, long: day.long },
    rel: W.crWhen(day, vm.today),
    dur: W.crDur(block.dur),
    nowMs: NOW,
    tz: TZ,
    word: "appointment",
    source: "Google Calendar",
    bookingLink: "bookingLink" in ask ? ask.bookingLink : vm.bookingLink,
    dealsOn: ask.dealsOn ?? false,
    notes: null,
    next: null,
    moments: ask.moments ?? null,
  });
}
const rowsOf = (vm) => Object.fromEntries(vm.rows.map((r) => [r.key, r.value]));
const booked = { visit: { id: "v1", status: "booked" } };

test("(lane E) how a visit stands is said once, and what it leads with follows it: ahead a Message, ended the ask, Kept the booking link, Missed a new time", () => {
  const ahead = sheet(AHEAD, booked);
  assert.equal(ahead.state, null, "a visit ahead says nothing of how it stands: it stands");
  assert.equal(ahead.ask, null);
  assert.deepEqual(ahead.primary, { act: "message", label: "Message Ana", quiet: false });
  assert.deepEqual(ahead.circles, { message: null, call: "Call Ana" }, "Message leads, so it is no circle too");
  assert.equal(ahead.footnote, "On Google Calendar · change the time there");
  assert.equal(ahead.title, "Color", "the title is what it is for; who it is with is the person line");
  assert.equal(ahead.when.rel, "Tomorrow");

  assert.deepEqual(sheet(UNDERWAY, booked).state, { word: "Now", tone: "accent", ring: null });

  const ended = sheet(ENDED, booked);
  assert.deepEqual(ended.state, { word: "Not marked yet", tone: "plain", ring: "plain" });
  assert.equal(ended.ask.question, "Did Ana come today?");
  assert.deepEqual(ended.ask.line.asks, ["kept", "missed"], "whether they came, never cancelled: it is over");
  assert.deepEqual(
    ended.primary,
    { act: "message", label: "Message Ana", quiet: true },
    "the ask leads; the thread waits",
  );
  assert.equal(sheet(YESTERDAY, booked).ask.question, "Did Ana come yesterday?");
  assert.equal(sheet(ENDED, { visit: null }).ask, null, "an event the record has not kept has nothing to say it on");

  const kept = sheet(ENDED, { visit: { id: "v1", status: "kept" } });
  assert.equal(kept.state.word, "Kept");
  assert.equal(kept.ask, null);
  assert.deepEqual(kept.primary, { act: "link", label: "Send the booking link", quiet: false });
  assert.ok(
    kept.more.some((m) => m.act === "missed" && m.label === "Change to Missed"),
    "corrected from More",
  );
  assert.equal(
    sheet(ENDED, { visit: { id: "v1", status: "kept" } }, { bookingLink: null }).primary.act,
    "message",
    "no link on file: their thread",
  );

  const missed = sheet(ENDED, { visit: { id: "v1", status: "missed" } });
  assert.equal(missed.state.word, "Missed");
  assert.deepEqual(missed.primary, { act: "new_time", label: "Ask for a new time", quiet: false });
  assert.ok(missed.more.some((m) => m.act === "kept" && m.label === "Change to Kept"));
  assert.equal(sheet(AHEAD, { visit: { id: "v1", status: "cancelled" } }).primary.act, "new_time");
  assert.ok(
    ahead.more.some((m) => m.act === "cancel" && m.danger),
    "a visit ahead may be cancelled, from More",
  );
  assert.ok(!ended.more.some((m) => m.act === "cancel"), "an ended one never: the door refuses it");
});

test("(lane B) a request a booking tool sent reads Requested, dashed, and is confirmed in the tool; its row says what the title does not", () => {
  const vm = sheet(AHEAD, {
    person: null,
    title: "Gloss",
    source: "notice",
    tool: "Booksy",
    service: "Gloss",
    staff: "Ana",
    price: "$45",
    guess: "Tom Ellis",
    contacts: { phones: ["+19175550190"], emails: [] },
    visit: { id: "v2", status: "proposed" },
  });
  assert.deepEqual(vm.state, { word: "Requested", tone: "plain", ring: "dashed" });
  assert.equal(vm.title, "Gloss");
  assert.equal(vm.footnote, "Requested in Booksy · confirm it there");
  assert.deepEqual(
    vm.rows.map((r) => [r.label, r.value]),
    [["Booking", "with Ana · $45"]],
    "REGRESSION: a request's row said Booked, and the service the title already says",
  );
  assert.ok(vm.more.some((m) => m.act === "cancel" && m.label === "Cancel the request…"));
  assert.deepEqual([vm.person.known, vm.person.name], [false, "Tom Ellis"]);
  assert.deepEqual(vm.primary, { act: "add", label: "Add to People", quiet: false });
});

test("(lane B) an event that is nobody's asks nothing and offers nothing: its title, its time and where it is from", () => {
  const vm = sheet(ENDED, { person: null, title: "Lunch", visit: null });
  assert.equal(vm.nobody, true);
  assert.deepEqual(
    [vm.person, vm.ask, vm.state, vm.primary, vm.rows, vm.more],
    [null, null, null, null, [], []],
    "REGRESSION: a lunch was asked whether they came",
  );
  assert.equal(vm.footnote, "On Google Calendar");
});

test("(lane E) someone the event names whom People does not hold: the name the calendar gives, their number to copy, and Add to People; no Call, which is a person's page's", () => {
  const vm = sheet(AHEAD, {
    person: null,
    title: "Consultation · Sofía Marín",
    guess: "Sofía Marín",
    contacts: { phones: ["+19175550177"], emails: [] },
    visit: { id: "v3", status: "booked" },
  });
  assert.equal(vm.person.known, false);
  assert.deepEqual([vm.person.name, vm.person.initials, vm.person.email], ["Sofía Marín", "SM", null]);
  assert.match(vm.person.number, /917.*555.*0177/, "the number for the eye");
  assert.equal(vm.primary.act, "add");
  assert.deepEqual(vm.circles, { message: null, call: null });
  assert.ok(
    vm.more.some((m) => m.act === "copy"),
    "the number to copy",
  );
  assert.ok(!vm.more.some((m) => m.act === "page" || m.act === "step"), "no page of theirs to open");
});

test("(lane D) what the board knows of them is said beside them, from the board's own read: their standing, business, last word and step; Call only where People holds a number", () => {
  const vm = sheet(AHEAD, {
    person: ana({
      facts: anaFacts({ step: { step_id: "s1", step_body: "Send aftercare tips", step_due_on: "2026-09-09" } }),
    }),
    ...booked,
  });
  assert.equal(vm.person.known, true);
  assert.deepEqual(
    [vm.person.stateWord, vm.person.business, vm.person.route],
    ["Active", "Ruiz Design", "clients/p-ana/visits"],
  );
  assert.deepEqual(rowsOf(vm), { step: "Send aftercare tips · Due tomorrow", last: "They wrote · 2d ago" });
  assert.equal(vm.circles.call, "Call Ana");
  assert.equal(vm.phone, "+19175550100");
  // An older read, or a person added between the read's two halves: no facts, and nothing invented for them.
  const bare = sheet(AHEAD, { person: ana({ facts: undefined }), ...booked });
  assert.deepEqual([bare.person.stateWord, bare.person.business, bare.rows], [null, null, []]);
  assert.equal(bare.circles.call, null, "no number People holds: no Call");
});

test("(lane E) the reminder it gets, by the rule: the day-before campaign's hour and name, a stop, or that it is off; nothing once it is over", () => {
  const reminder = appointmentWords("appointment").before.name;
  const moments = (state) => [
    {
      id: "m1",
      name: reminder,
      trigger: "visit_tomorrow",
      state,
      mode: "auto",
      run_hour: 10,
      last_run_for: null,
      until: null,
      trial_until: null,
      reach_out: false,
    },
  ];
  const reminderOf = (slot, over, m) => rowsOf(sheet(slot, { ...booked, ...over }, { moments: m })).reminder;
  assert.equal(reminderOf(AHEAD, {}, moments("running")), `Day before at 10 AM · ${reminder}`);
  assert.equal(reminderOf(AHEAD, {}, moments("paused")), `None · ${reminder} is off`);
  assert.equal(reminderOf(AHEAD, { person: ana({ opted_out: true }) }, moments("running")), "None · asked to stop");
  assert.equal(reminderOf(AHEAD, {}, []), undefined, "no such campaign: nothing said");
  assert.equal(reminderOf(AHEAD, {}, undefined), undefined, "the campaigns not read yet: nothing guessed");
  assert.equal(reminderOf(ENDED, {}, moments("running")), undefined, "over: no reminder to come");
});

test("(0008, D1-consult-held) a consultation over with no proposal since leads with the deal sheet's own act where deals are on: kept, or with no row to mark; never one they missed, and the ask first while it is unmarked", () => {
  const consult = (visit, person = ana()) => ({
    title: "Kitchen remodel consult · Ana Ruiz",
    consultation: true,
    consult_service: "Kitchen remodel",
    person,
    visit,
  });
  const on = { dealsOn: true };
  const kept = sheet(ENDED, consult({ id: "v1", status: "kept" }), on);
  assert.deepEqual(kept.primary, { act: "proposal", label: "Start a proposal", quiet: false });
  assert.deepEqual(kept.proposal, { personId: "p-ana", mode: "propose", service: "Kitchen remodel" });
  assert.equal(
    sheet(ENDED, consult(null), on).primary.act,
    "proposal",
    "an event the record has not kept: nobody can mark it, so the proposal leads, as before",
  );
  const unmarked = sheet(ENDED, consult({ id: "v1", status: "booked" }), on);
  assert.ok(unmarked.ask, "unmarked: the ask leads");
  assert.equal(unmarked.primary.act, "message", "and the proposal follows a Kept");
  for (const status of ["missed", "cancelled"])
    assert.equal(
      sheet(ENDED, consult({ id: "v1", status }), on).proposal,
      null,
      `REGRESSION: they did not come (${status}), and a proposal was offered`,
    );
  assert.equal(sheet(ENDED, consult({ id: "v1", status: "kept" })).proposal, null, "deals off: none");
  assert.equal(
    sheet(ENDED, consult({ id: "v1", status: "kept" }, ana({ facts: undefined })), on).proposal,
    null,
    "a deal the board has not read is not one it can say is missing",
  );
  const deal = {
    deal_id: "d1",
    deal_stage: "proposed",
    deal_service: "Kitchen remodel",
    deal_proposed_at: iso(NOW - 2 * HOUR),
  };
  const out = sheet(ENDED, consult({ id: "v1", status: "kept" }, ana({ facts: anaFacts({ deal }) })), on);
  assert.equal(out.proposal, null, "a proposal out already is the next step");
  assert.match(out.person.deal, /^Proposal out · Kitchen remodel/, "and the deal is said beside them");
  assert.ok(
    out.more.some((m) => m.act === "deal"),
    "with its door in More",
  );
  assert.equal(
    sheet(ENDED, consult({ id: "v1", status: "kept" }, ana({ facts: anaFacts({ deal }) }))).person.deal,
    null,
    "deals off: nothing said of one",
  );
});

test("(decision 0061) a time a customer picked by text leads with Booked it, keeps Can't in More in place of a cancel, and says where it came from", () => {
  const request = {
    source: "notice",
    tool: null,
    visit: { id: "v1", status: "proposed" },
    request: { thread_id: "cv-ana", open: true },
  };
  const vm = sheet(AHEAD, request);
  assert.deepEqual(vm.primary, { act: "booked", label: "Booked it", quiet: false });
  assert.equal(vm.footnote, "Requested by text · Booked it or Can't");
  assert.ok(
    vm.more.some((m) => m.act === "cant" && m.label === "Can't" && m.danger),
    "Can't, in More",
  );
  assert.ok(!vm.more.some((m) => m.act === "cancel"), "never the visit's own cancel: Can't leaves the thread a reply");
  assert.equal(vm.state?.word, "Requested");
  // A booking tool's request is the tool's to confirm: it keeps its own words and acts.
  const tools = sheet(AHEAD, { source: "notice", tool: "Booksy", visit: { id: "v1", status: "proposed" } });
  assert.notEqual(tools.primary?.act, "booked");
  assert.ok(tools.more.some((m) => m.act === "cancel"));
  // Answered, it is on no calendar: its foot says so, never "on your calendar", and it asks nothing more.
  const booked = sheet(AHEAD, {
    ...request,
    visit: { id: "v1", status: "booked" },
    request: { thread_id: "cv-ana", open: false },
  });
  assert.equal(booked.footnote, "Booked by text · change it with them in their thread");
  assert.notEqual(booked.primary?.act, "booked");
  assert.ok(!booked.more.some((m) => m.act === "cant"));
  const cant = sheet(AHEAD, {
    ...request,
    visit: { id: "v1", status: "cancelled" },
    request: { thread_id: "cv-ana", open: false },
  });
  assert.equal(cant.footnote, "Asked for by text · you couldn't take it");
});

test("(00426) a visit whose person was found as a lead says where they came from: its sequence, a door to its People; else the lead, a door to it on Leads", async () => {
  const { leadsRoute, sequenceRoute } = await import("@chanlytics/contracts");
  const lead = { id: "ld-1", name: "Ruiz Design" };
  const fromSequence = sheet(AHEAD, {
    ...booked,
    origin: { lead, sequence: { id: "sq-1", name: "Design studios · Queens" } },
  });
  assert.deepEqual(
    fromSequence.rows.find((r) => r.key === "origin"),
    {
      key: "origin",
      label: "Found as a lead",
      value: "Design studios · Queens",
      route: sequenceRoute("sq-1", "people"),
    },
    "the sequence alone: the lead's business is the person line's already",
  );
  const keys = fromSequence.rows.map((r) => r.key);
  assert.ok(keys.indexOf("origin") > keys.indexOf("last"), "after who they are and when they were last in touch");
  assert.ok(
    fromSequence.rows.filter((r) => r.key !== "origin").every((r) => !("route" in r)),
    "only a row with an address is a door",
  );
  const onLeads = sheet(AHEAD, { ...booked, origin: { lead, sequence: null } }).rows.find((r) => r.key === "origin");
  assert.deepEqual(
    [onLeads.value, onLeads.route],
    ["Ruiz Design", leadsRoute({ peek: "ld-1" })],
    "no sequence took it in",
  );
  assert.equal(
    sheet(AHEAD, booked).rows.some((r) => r.key === "origin"),
    false,
    "a person not found as a lead has no such row",
  );
});
