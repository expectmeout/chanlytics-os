/**
 * The People lens's own parts, in words (contracts reports/people/people-report.ts and people-words.ts): the page-only fold
 * that says every sentence the lens draws from the PeopleDto -- the head, the four figures against the period before, the
 * mixes of the window (how they reached you, how the new ones first came, how the yeses were won and the stops came, the
 * steps done on time, the addresses that stopped), the book as it stands now (its wires, how fresh it is, what is stuck,
 * where it stands) -- and the metrics those figures name. EXECUTED: the real fold over the world every People test shares
 * (./_people-world.mjs). Run it under TEST_TZ=Pacific/Auckland too: nothing here reads a clock.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUILTIN_LISTS,
  PEOPLE_RHYTHM_UNIT,
  QUIET_AFTER_DAYS,
  REPORT_MIN_N,
  metricWordsOf,
  parseListToken,
  toPeopleReportVM,
} from "@chanlytics/contracts";
import { POOL, QUIET, SERIES, dtoWith } from "./_people-world.mjs";

const vm = (over = {}, pool = POOL) => toPeopleReportVM(dtoWith(over, pool));
const rows = (part) => part.rows.map((r) => [r.label, r.value]);
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const NO_BOOK = {
  people: 0,
  fresh: { under_7: 0, d7_30: 0, d31_60: 0, d61_90: 0, d91_up: 0, never: 0 },
  lists: { opted_in: 0, offers_ok: 0, opted_out: 0, quiet: 0 },
  steps: { overdue: 0, due_today: 0 },
  email_stopped: 0,
  wires: { whatsapp_only: 0, sms_only: 0, phone_only: 0, email_only: 0, several: 0, none: 0 },
};
const NO_ANSWERS = { overdue: 0, due_today: 0 };
/** SERIES' consent with the window's yes (or stop) answers replaced. */
const withYes = (yes) => ({
  ...SERIES.consent,
  now: { ...SERIES.consent.now, yes: { ...SERIES.consent.now.yes, ...yes } },
});
const withStop = (stop) => ({
  ...SERIES.consent,
  now: { ...SERIES.consent.now, stop: { ...SERIES.consent.now.stop, ...stop } },
});
const reachedNow = (people, fresh, before = SERIES.reached.before) => ({
  reached: { now: { people, new: fresh }, before },
});

test("the head: how many reached you, how many were new, and how many of the book have said yes", () => {
  assert.equal(
    vm().head,
    "40 people reached you, 12 new (8 the 30 days before); 340 of 520 have said yes to messages.",
  );
  // The period before had nobody (no one reached you, no yes, no stop): nothing to set it against, so no parenthesis.
  const nobodyBefore = {
    ...reachedNow(40, 12, { people: 0, new: 0 }),
    consent: { ...SERIES.consent, before: { yes: 0, stop: 0 } },
  };
  assert.equal(vm(nobodyBefore).head, "40 people reached you, 12 new; 340 of 520 have said yes to messages.");
  // One "had anyone before" for the head and the strip: a period before with only yeses (or only stops) was lived in, so the
  // head's parenthesis and the strip's comparison both stand; with nobody at all, neither does.
  for (const before of [
    { yes: 7, stop: 0 },
    { yes: 0, stop: 2 },
  ]) {
    const lived = vm({ ...nobodyBefore, consent: { ...SERIES.consent, before } });
    assert.equal(
      lived.head,
      "40 people reached you, 12 new (none the 30 days before); 340 of 520 have said yes to messages.",
      `a period before with ${JSON.stringify(before)}: the head compares`,
    );
    assert.deepEqual(
      [lived.strip[0].compare, lived.strip[1].compare],
      ["none the 30 days before", "none the 30 days before"],
      `a period before with ${JSON.stringify(before)}: the strip compares`,
    );
  }
  assert.deepEqual(
    [vm(nobodyBefore).strip[0].compare, vm(nobodyBefore).strip[1].compare],
    [null, null],
    "nobody before: the strip does not compare, as the head does not",
  );
  // The period before had people and none of them new: none, said.
  assert.equal(
    vm(reachedNow(40, 12, { people: 31, new: 0 })).head,
    "40 people reached you, 12 new (none the 30 days before); 340 of 520 have said yes to messages.",
  );
  // A share of fewer than five is not said.
  assert.equal(
    vm({}, { ...POOL, people: REPORT_MIN_N - 1 }).head,
    "40 people reached you, 12 new (8 the 30 days before).",
  );
  assert.equal(
    vm({}, { ...POOL, people: REPORT_MIN_N, lists: { ...POOL.lists, opted_in: 3 } }).head,
    "40 people reached you, 12 new (8 the 30 days before); 3 of 5 have said yes to messages.",
    "five is the fewest said",
  );
  // The book could not be counted: the head ends after the window's words.
  assert.equal(vm({}, null).head, "40 people reached you, 12 new (8 the 30 days before).");
  // The database has no people_series yet: the frame's sentence stands.
  assert.equal(toPeopleReportVM({ ...dtoWith(), series: null }).head, null);
  // Nobody reached you: said, and the book still stands.
  assert.equal(vm(reachedNow(0, 0)).head, "Nobody reached you in this period; 340 of 520 have said yes to messages.");
  assert.equal(vm(QUIET).head, "Nobody reached you in this period; 340 of 520 have said yes to messages.");
  // One person, and a one-day period before.
  assert.equal(
    vm(reachedNow(1, 1, { people: 3, new: 2 })).head,
    "1 person reached you, 1 new (2 the 30 days before); 340 of 520 have said yes to messages.",
  );
  assert.equal(
    toPeopleReportVM({ ...dtoWith(reachedNow(1, 1, { people: 3, new: 2 })), days: 1 }).head,
    "1 person reached you, 1 new (2 the day before); 340 of 520 have said yes to messages.",
    "one day is the day before, not the 1 day before",
  );
});

test("the strip: people, new people, yeses and stops, each against the period before", () => {
  const { strip } = vm();
  assert.deepEqual(
    strip.map((f) => [f.metric, f.label, f.value, f.meta, f.compare]),
    [
      ["people_reached", "People who reached you", "40", "12 new · 28 you knew already", "up from 31"],
      ["new_people", "New people", "12", "of the 40 who reached you", "up from 8"],
      ["yeses_won", "Yeses won", "9", "6 to messages · 2 to offers · 1 to email offers", "up from 7"],
      [
        "stops_recorded",
        "Stops",
        "4",
        "2 stopped all messages · 1 stopped offers · 1 stopped email offers",
        "up from 2",
      ],
    ],
  );
  assert.equal(new Set(strip.map((f) => f.id)).size, 4, "each figure has an id of its own");
  // New people are a share of those who reached you: it carries what it is of, and the kit greys it under five.
  assert.deepEqual([strip[1].n, strip[1].minN], [40, 5]);
  assert.equal(REPORT_MIN_N, 5);
  for (const i of [0, 2, 3]) assert.equal("n" in strip[i] || "minN" in strip[i], false, `${strip[i].label} is a count`);
  for (const f of strip) assert.equal("tone" in f, false, `${f.label}: change words are plain ink`);
  assert.deepEqual(vm(reachedNow(3, 1)).strip[1].n, 3, "new people with 3 reached carries n: 3");
  assert.equal(vm(reachedNow(3, 1)).strip[1].meta, "of the 3 who reached you");

  // Every change is in counts, against a period before that was lived in.
  const same = vm({ ...reachedNow(31, 8), consent: { ...SERIES.consent, before: { yes: 9, stop: 4 } } }).strip;
  assert.deepEqual(
    same.map((f) => f.compare),
    [
      "same as the 30 days before",
      "same as the 30 days before",
      "same as the 30 days before",
      "same as the 30 days before",
    ],
  );
  assert.deepEqual(
    vm({
      ...reachedNow(40, 12, { people: 31, new: 0 }),
      consent: { ...SERIES.consent, before: { yes: 0, stop: 0 } },
    }).strip.map((f) => f.compare),
    ["up from 31", "none the 30 days before", "none the 30 days before", "none the 30 days before"],
  );
  // The period before had a yes and nobody reaching the business: it was lived in, so the comparison stands.
  assert.deepEqual(
    vm({
      ...reachedNow(0, 0, { people: 0, new: 0 }),
      consent: { ...QUIET.consent, before: { yes: 7, stop: 0 } },
    }).strip.map((f) => f.compare),
    [null, null, "down from 7", null],
  );
  // The meta of a stop or a yes names only the kinds there were.
  const lone = vm({
    consent: {
      ...withYes({ total: 1, by_purpose: { messages: 0, offers: 1, email_offers: 0 } }),
      before: { yes: 1, stop: 1 },
    },
  }).strip;
  assert.equal(lone[2].meta, "1 to offers");
});

test("the mix says its rows and its line", () => {
  const v = vm();
  // How they reached you: a person who used two wires is in each, most first.
  assert.deepEqual(rows(v.channels), [
    ["WhatsApp", 25],
    ["Phone", 11],
    ["Email", 6],
    ["Text", 3],
  ]);
  assert.equal(v.channels.line, "A person who reached you more than one way is counted in each.");
  assert.equal(v.channels.empty, null);
  assert.equal(v.channels.rows[0].share, 1, "the largest bar is the whole of its group");
  assert.equal(v.channels.rows[3].share, 3 / 25);
  assert.deepEqual(
    v.channels.rows.map((r) => r.id),
    ["whatsapp", "voice", "email", "sms"],
    "a row keeps the key it is counted under",
  );

  // How the new ones first came: not recorded is always last, however many.
  assert.deepEqual(rows(v.firstCame), [
    ["WhatsApp", 5],
    ["Phone", 3],
    ["Your calendar", 1],
    ["An ad", 1],
    ["Not recorded", 2],
  ]);
  assert.equal(v.firstCame.line, "10 of 12 new people have a recorded way in.");
  assert.equal(v.firstCame.empty, null);
  const unknownFirst = vm({
    first_came: { by_via: { unknown: 7, whatsapp: 1, lead: 4 } },
    ...reachedNow(40, 12),
  }).firstCame;
  assert.deepEqual(rows(unknownFirst), [
    ["A lead you found", 4],
    ["WhatsApp", 1],
    ["Not recorded", 7],
  ]);
  assert.equal(unknownFirst.line, "5 of 12 new people have a recorded way in.");
  // A way the words do not know is said as it was kept, never dropped.
  assert.deepEqual(rows(vm({ first_came: { by_via: { whatsapp: 5, walk_in: 7 } } }).firstCame), [
    ["Walk in", 7],
    ["WhatsApp", 5],
  ]);
  // Nobody's way in is recorded: words, no bar.
  const none = vm({ first_came: { by_via: { unknown: 12 } } }).firstCame;
  assert.deepEqual(none, { rows: [], line: null, empty: "No way in is recorded for the 12 new people." });
  assert.equal(
    vm({ ...reachedNow(1, 1), first_came: { by_via: { unknown: 1 } } }).firstCame.empty,
    "No way in is recorded for the 1 new person.",
  );
  assert.deepEqual(vm({ ...reachedNow(40, 0), first_came: { by_via: {} } }).firstCame, {
    rows: [],
    line: null,
    empty: "Nobody new reached you in this period.",
  });

  // How the yeses were won.
  assert.deepEqual(rows(v.yeses), [
    ["Their own message", 6],
    ["A form", 2],
    ["In person", 1],
  ]);
  assert.equal(v.yeses.line, "Each person is counted once for each kind of message they said yes to.");
  assert.equal(v.yeses.empty, null);
  // A source the words do not know is summed into "Another way", so the rows add up to the total.
  const sms = vm({
    consent: withYes({ total: 10, by_source: { customer_message: 6, form: 2, in_person: 1, sms_reply: 1 } }),
  });
  assert.deepEqual(rows(sms.yeses), [
    ["Their own message", 6],
    ["A form", 2],
    ["In person", 1],
    ["Another way", 1],
  ]);
  assert.equal(sum(Object.fromEntries(rows(sms.yeses))), sms.strip[2].value * 1, "the rows add up to the figure");
  // A yes recorded with no source at all (00393 says `unknown`) is another way too, with any other.
  const noSource = vm({
    consent: withYes({ total: 10, by_source: { customer_message: 6, unknown: 3, sms_reply: 1 } }),
  });
  assert.deepEqual(rows(noSource.yeses), [
    ["Their own message", 6],
    ["Another way", 4],
  ]);

  // How the stops came.
  assert.deepEqual(rows(v.stops), [
    ["Their own STOP", 2],
    ["The carrier", 1],
    ["An unsubscribe", 1],
  ]);
  assert.equal(v.stops.line, "Each person is counted once for each kind of message they stopped.");
  const every = vm({
    consent: withStop({
      total: 11,
      by_source: {
        customer_message: 2,
        carrier: 1,
        unsubscribe: 1,
        complaint: 1,
        reply: 1,
        whatsapp: 1,
        form: 1,
        operator: 1,
        in_person: 1,
        phone: 1,
      },
    }),
  }).stops;
  assert.deepEqual(rows(every), [
    ["Recorded by a member", 4],
    ["Their own STOP", 2],
    ["The carrier", 1],
    ["An unsubscribe", 1],
    ["A complaint", 1],
    ["A reply", 1],
    ["WhatsApp's offers stop", 1],
  ]);
  assert.deepEqual(
    rows(
      vm({ consent: withStop({ total: 5, by_source: { operator: 2, in_person: 1, phone: 1, something_new: 1 } }) })
        .stops,
    ),
    [
      ["Recorded by a member", 4],
      ["Another way", 1],
    ],
    "the four a member records are one row; any other source is another way",
  );
  // A stop recorded with no source at all (00393 says `unknown`) is another way.
  assert.deepEqual(
    rows(vm({ consent: withStop({ total: 3, by_source: { customer_message: 2, unknown: 1 } }) }).stops),
    [
      ["Their own STOP", 2],
      ["Another way", 1],
    ],
  );
  // A source named like a property of every object is a source, never the object's own.
  const hostile = vm({
    consent: withYes({
      total: 7,
      by_source: JSON.parse('{"__proto__": 2, "constructor": 2, "toString": 1, "customer_message": 2}'),
    }),
  }).yeses;
  assert.deepEqual(rows(hostile), [
    ["Their own message", 2],
    ["Another way", 5],
  ]);

  // The steps done: a share only of five or more.
  assert.deepEqual(rows(v.stepsDone), [
    ["Done on or before their day", 8],
    ["Done after their day", 3],
  ]);
  assert.equal(v.stepsDone.line, "8 of 11 were done on or before their day.");
  assert.equal(v.stepsDone.empty, null);
  assert.equal(vm({ steps: { done: 3, on_time: 2 } }).stepsDone.line, "3 steps were done in this period.");
  assert.equal(vm({ steps: { done: 1, on_time: 1 } }).stepsDone.line, "1 step was done in this period.");
  assert.equal(vm({ steps: { done: 4, on_time: 4 } }).stepsDone.line, "4 steps were done in this period.");
  assert.equal(vm({ steps: { done: 5, on_time: 4 } }).stepsDone.line, "4 of 5 were done on or before their day.");
  assert.deepEqual(rows(vm({ steps: { done: 6, on_time: 0 } }).stepsDone), [["Done after their day", 6]]);
  assert.equal(vm({ steps: { done: 6, on_time: 0 } }).stepsDone.line, "0 of 6 were done on or before their day.");
  assert.deepEqual(vm({ steps: { done: 0, on_time: 0 } }).stepsDone, {
    rows: [],
    line: null,
    empty: "No step was done in this period.",
  });

  // The addresses that stopped working.
  assert.deepEqual(rows(v.emailStopped), [
    ["Bounced for good", 1],
    ["Marked as spam", 1],
  ]);
  assert.equal(v.emailStopped.line, "2 addresses stopped working in this period.");
  assert.equal(v.emailStopped.empty, null);
  const reasons = vm({
    email_stopped: { total: 9, by_reason: { provider: 3, unknown: 4, hard_bounce: 1, soft_bounce: 1 } },
  });
  assert.deepEqual(rows(reasons.emailStopped), [
    ["Stopped by the email provider", 3],
    ["Bounced for good", 1],
    ["Soft bounce", 1],
    ["Reason not recorded", 4],
  ]);
  assert.equal(
    vm({ email_stopped: { total: 1, by_reason: { unknown: 1 } } }).emailStopped.line,
    "1 address stopped working in this period.",
  );
  assert.deepEqual(rows(vm({ email_stopped: { total: 2, by_reason: { unknown: 2 } } }).emailStopped), [
    ["Reason not recorded", 2],
  ]);
  assert.deepEqual(vm({ email_stopped: { total: 0, by_reason: {} } }).emailStopped, {
    rows: [],
    line: null,
    empty: "No address stopped working in this period.",
  });

  // A part has a line or the words for why it has none, never both.
  for (const part of [v.channels, v.firstCame, v.yeses, v.stops, v.stepsDone, v.emailStopped, v.wires, v.fresh])
    assert.equal(part.line !== null && part.empty !== null, false);
});

test("the book as of now", () => {
  const v = vm();
  assert.deepEqual(rows(v.wires), [
    ["WhatsApp only", 300],
    ["Text only", 20],
    ["Phone only", 60],
    ["Email only", 40],
    ["More than one way", 70],
    ["None yet", 30],
  ]);
  assert.equal(v.wires.line, "70 of 520 have reached you more than one way, as of today.");
  assert.equal(v.wires.empty, null);
  assert.equal(v.wires.rows[0].share, 1);
  // A wire nobody uses alone has no row; no one on several wires, no line.
  const alone = vm({}, { ...POOL, wires: { ...POOL.wires, sms_only: 0, several: 0, none: 0 }, people: 400 }).wires;
  assert.deepEqual(rows(alone), [
    ["WhatsApp only", 300],
    ["Phone only", 60],
    ["Email only", 40],
  ]);
  assert.equal(alone.line, null);
  assert.equal(alone.empty, null);

  assert.deepEqual(rows(v.fresh), [
    ["Under 7 days", 60],
    ["7 to 30 days", 140],
    ["31 to 60 days", 90],
    ["61 to 90 days", 70],
    ["91 days or more", 110],
    ["Never heard from", 50],
  ]);
  assert.equal(
    v.fresh.line,
    "Of 520 people as of today: the days since they last wrote or called. Your own messages do not count.",
  );
  assert.equal(v.fresh.empty, null);
  assert.deepEqual(v.fresh.quiet, {
    line: "270 people have been quiet for more than 30 days.",
    door: "clients/seg:quiet",
    label: "Quiet 30+ days",
  });
  assert.equal(
    vm({}, { ...POOL, lists: { ...POOL.lists, quiet: 1 } }).fresh.quiet.line,
    "1 person has been quiet for more than 30 days.",
  );
  // A bucket of none is a true count: all six stay, and nobody quiet has no door.
  const fresh = vm(
    {},
    {
      ...POOL,
      fresh: { under_7: 520, d7_30: 0, d31_60: 0, d61_90: 0, d91_up: 0, never: 0 },
      lists: { ...POOL.lists, quiet: 0 },
    },
  ).fresh;
  assert.deepEqual(
    fresh.rows.map((r) => r.value),
    [520, 0, 0, 0, 0, 0],
  );
  assert.equal(fresh.quiet, null);
  assert.deepEqual(
    fresh.rows.map((r) => r.share),
    [1, 0, 0, 0, 0, 0],
  );
  // The labels that carry the quiet window's days are the ones People's own rule counts by.
  assert.equal(QUIET_AFTER_DAYS, 30);
  assert.equal(v.fresh.rows[1].label, `7 to ${QUIET_AFTER_DAYS} days`);
  assert.equal(v.fresh.rows[2].label, `${QUIET_AFTER_DAYS + 1} to 60 days`);
  assert.match(v.fresh.quiet.line, new RegExp(`more than ${QUIET_AFTER_DAYS} days\\.$`));
  assert.match(metricWordsOf("quiet_now"), new RegExp(`more than ${QUIET_AFTER_DAYS} days ago`));
  // An empty book says so, once, in each part that would have drawn it.
  const empty = vm({}, NO_BOOK);
  assert.deepEqual(empty.wires, { rows: [], line: null, empty: "Nobody is in your book yet." });
  assert.deepEqual(empty.fresh, { rows: [], line: null, empty: "Nobody is in your book yet.", quiet: null });
  // A book of one person is "Of 1 person", never "Of 1 people".
  assert.equal(
    vm({}, { ...NO_BOOK, people: 1 }).fresh.line,
    "Of 1 person as of today: the days since they last wrote or called. Your own messages do not count.",
  );

  // Stuck now: a count and the list it opens; amber for what needs you, red for what failed.
  assert.deepEqual(
    v.stuck.map((f) => [f.metric, f.label, f.value, f.meta, f.door, f.tone, f.compare]),
    [
      [
        "steps_overdue",
        "Steps overdue",
        "6",
        "people whose next step is past its day",
        "clients/seg:steps_due",
        "warn",
        null,
      ],
      [
        "steps_due_today",
        "Steps due today",
        "3",
        "people whose next step is due today",
        "clients/seg:steps_due",
        undefined,
        null,
      ],
      [
        "email_stopped_now",
        "Email stopped working",
        "4",
        "people whose address no longer receives your email",
        undefined,
        "fail",
        null,
      ],
    ],
  );
  const clear = vm({}, { ...POOL, steps: NO_ANSWERS, email_stopped: 0 }).stuck;
  assert.deepEqual(
    clear.map((f) => [f.value, f.meta]),
    [
      ["0", "no next step is past its day"],
      ["0", "no next step is due today"],
      ["0", "every address works"],
    ],
  );
  for (const f of clear) assert.equal("tone" in f, false, `${f.label}: with none, no tone`);
  assert.equal("door" in v.stuck[2], false, "an address that stopped has no list to open");
  assert.equal(
    new Set([...v.stuck, ...v.stand, ...v.strip].map((f) => f.id)).size,
    11,
    "every figure has an id of its own",
  );

  // Where the book stands: People's own lists, as of now.
  assert.deepEqual(
    v.stand.map((f) => [f.metric, f.label, f.value, f.meta, f.door, f.n, f.minN, f.compare]),
    [
      ["said_yes_messages", "Said yes to messages", "340", "of 520 people", "clients/seg:opted_in", 520, 5, null],
      ["can_receive_offers", "Can receive offers", "40", "of 520 people", "clients/seg:offers_ok", 520, 5, null],
      ["opted_out_now", "Opted out", "22", "of 520 people", "clients/seg:opted_out", 520, 5, null],
      ["quiet_now", "Quiet 30+ days", "270", "of 520 people", "clients/seg:quiet", 520, 5, null],
    ],
  );
  for (const f of v.stand) {
    const id = f.door.split("/")[1];
    const ref = parseListToken(id);
    assert.equal(ref?.kind, "builtin", `${f.door} names a built-in list`);
    const list = BUILTIN_LISTS.find((l) => l.id === ref.id);
    assert.ok(list, `${f.door}: People has the list`);
    assert.equal(f.label, list.label, `${f.door}: the figure wears People's own name for the list`);
  }
  for (const f of v.stuck.filter((s) => s.door)) {
    const ref = parseListToken(f.door.split("/")[1]);
    assert.ok(
      BUILTIN_LISTS.some((l) => l.id === ref?.id),
      `${f.door} names a built-in list`,
    );
  }
  assert.equal(vm({}, { ...NO_BOOK }).stand[0].meta, "nobody is in your book yet");
  assert.equal(vm({}, { ...NO_BOOK, people: 1 }).stand[0].meta, "of 1 person");
});

test("nothing in the period: every window part is absent with words, never a zero percentage or NaN, and the book still stands", () => {
  const full = vm();
  const v = vm(QUIET);
  assert.deepEqual(
    v.strip.map((f) => [f.value, f.meta, f.compare]),
    [
      ["0", "nobody wrote or called in this period", null],
      ["0", "nobody new", null],
      ["0", "nobody said yes in this period", null],
      ["0", "nobody asked to stop in this period", null],
    ],
  );
  assert.equal("n" in v.strip[1], false, "no people, nothing for a share to be of");
  assert.deepEqual(v.channels, { rows: [], line: null, empty: "Nobody reached you in this period." });
  assert.deepEqual(v.firstCame, { rows: [], line: null, empty: "Nobody new reached you in this period." });
  assert.deepEqual(v.yeses, { rows: [], line: null, empty: "Nobody said yes in this period." });
  assert.deepEqual(v.stops, { rows: [], line: null, empty: "Nobody asked to stop in this period." });
  assert.deepEqual(v.stepsDone, { rows: [], line: null, empty: "No step was done in this period." });
  assert.deepEqual(v.emailStopped, { rows: [], line: null, empty: "No address stopped working in this period." });
  // The book is the pool's, whatever the window held.
  for (const part of ["wires", "fresh", "stuck", "stand"]) assert.deepEqual(v[part], full[part], part);
  assert.equal(v.windowAvailable && v.nowAvailable, true);

  const text = JSON.stringify(v);
  assert.equal(text.includes("NaN"), false);
  assert.equal(text.includes("Infinity"), false);
  assert.equal(text.includes("undefined"), false);
  // JSON says a numeric NaN as null, so the numbers are read as numbers too.
  const numbers = (x) =>
    typeof x === "number" ? [x] : x !== null && typeof x === "object" ? Object.values(x).flatMap(numbers) : [];
  for (const dto of [dtoWith(QUIET), dtoWith(), dtoWith({}, NO_BOOK), dtoWith(QUIET, NO_BOOK)])
    for (const n of numbers(toPeopleReportVM(dto))) assert.ok(Number.isFinite(n), `${n} is a count or a share`);
  for (const f of [...v.strip, ...v.stuck, ...v.stand])
    assert.equal(f.value.includes("%"), false, `${f.label}: a count`);
  assert.equal(JSON.stringify(full).includes("%"), false, "no percentage anywhere in the lens");

  // The period before had people: a fall is said in counts.
  assert.deepEqual(
    vm({ ...QUIET, reached: { now: { people: 0, new: 0 }, before: { people: 31, new: 8 } } }).strip.map(
      (f) => f.compare,
    ),
    ["down from 31", "down from 8", null, null],
  );
});

test("each half alone", () => {
  const full = vm();
  const noWindow = toPeopleReportVM({ ...dtoWith(), series: null });
  assert.equal(noWindow.windowAvailable, false);
  assert.equal(noWindow.nowAvailable, true);
  assert.equal(noWindow.head, null);
  assert.deepEqual(noWindow.strip, []);
  for (const part of ["channels", "firstCame", "yeses", "stops", "stepsDone", "emailStopped"])
    assert.deepEqual(
      noWindow[part],
      { rows: [], line: null, empty: null },
      `${part}: nothing to say of a window never read`,
    );
  for (const part of ["wires", "fresh", "stuck", "stand"])
    assert.deepEqual(noWindow[part], full[part], `${part}: the book is whole`);

  const noBook = toPeopleReportVM({ ...dtoWith(), now: null });
  assert.equal(noBook.nowAvailable, false);
  assert.equal(noBook.windowAvailable, true);
  assert.deepEqual(noBook.stuck, []);
  assert.deepEqual(noBook.stand, []);
  assert.deepEqual(noBook.wires, { rows: [], line: null, empty: null });
  assert.deepEqual(noBook.fresh, { rows: [], line: null, empty: null, quiet: null });
  for (const part of ["strip", "channels", "firstCame", "yeses", "stops", "stepsDone", "emailStopped"])
    assert.deepEqual(noBook[part], full[part], `${part}: the window is whole`);
  assert.equal(noBook.head, "40 people reached you, 12 new (8 the 30 days before).");

  const neither = toPeopleReportVM({ ...dtoWith(), series: null, now: null });
  assert.deepEqual([neither.windowAvailable, neither.nowAvailable, neither.head], [false, false, null]);
  assert.deepEqual([neither.strip, neither.stuck, neither.stand], [[], [], []]);
});

test("the fold changes nothing it is given, and says the same twice", () => {
  const dto = dtoWith();
  const before = structuredClone(dto);
  const a = toPeopleReportVM(dto);
  assert.deepEqual(dto, before, "the DTO is read, never written");
  assert.deepEqual(toPeopleReportVM(dto), a);
  assert.notEqual(a.strip, toPeopleReportVM(dto).strip, "a new view model each time");
});

test("the lens's unit words and its ten figures' definitions", () => {
  assert.equal(PEOPLE_RHYTHM_UNIT, "messages and calls");
  const ids = [
    "people_reached",
    "yeses_won",
    "stops_recorded",
    "steps_overdue",
    "steps_due_today",
    "email_stopped_now",
    "said_yes_messages",
    "can_receive_offers",
    "opted_out_now",
    "quiet_now",
  ];
  const v = vm();
  const named = [...v.strip, ...v.stuck, ...v.stand].map((f) => f.metric);
  for (const id of ids) assert.ok(named.includes(id), `${id}: a figure of the lens names it`);
  assert.deepEqual(
    named.filter((m) => !ids.includes(m)),
    ["new_people"],
    "new_people is the one id the lens shares with the Overview",
  );
  for (const f of [...v.strip, ...v.stuck, ...v.stand]) assert.ok(metricWordsOf(f.metric).length > 80, f.metric);
});
