/**
 * The People lens's book as it stands now, EXECUTED: the pool's rows (people_list, through contracts' own builder) counted
 * by People's own predicates and never restated (contracts reports/people/people-now.ts) -- how long since a person was
 * heard (`heardDays`), the lists (`membersOf` over the built-ins), the day of their next step, the ways they reach you and
 * a stopped address -- and held to what People's rail says of the same rows. Rows are made as people-vm.test.mjs makes
 * them, at 4 Sep 2026 16:00Z in the workspace's zone; every assertion names the zone it reads days in, so the file reads
 * the same under TEST_TZ=Pacific/Auckland.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUILTIN_LISTS,
  PEOPLE_LISTS,
  QUIET_AFTER_DAYS,
  channelsReady,
  membersOf,
  peopleNowOf,
  poolListContext,
  poolRowsOf,
  resolveList,
  ruleNeeds,
} from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const { peopleSurfaceOf } = await importSrc("apps/dashboard/src/surfaces/people/surface-map.ts");

const ZONE = "America/New_York";
const H = 3_600_000;
const D = 24 * H;
/** Fri 4 Sep 2026, noon in New York. */
const NOW = Date.parse("2026-09-04T16:00:00Z");
const iso = (msAgo, now = NOW) => new Date(now - msAgo).toISOString();

/** What the workspace can send on, as reach-any.test.mjs builds it: WhatsApp by default, a texting line and a mailbox when asked. */
const ready = ({ whatsapp = true, text = false, email = false } = {}) =>
  channelsReady({
    whatsapp: whatsapp ? { canSend: true, refusal: null } : null,
    textLine: text ? { sms_state: "active", reg_mock: false } : null,
    email: { mailbox: email, domain: email },
  });
/** WhatsApp is set up and cannot send now: its number is not healthy. */
const WHATSAPP_DOWN = channelsReady({
  whatsapp: { canSend: false, refusal: "Your WhatsApp number needs attention." },
  textLine: null,
  email: { mailbox: false, domain: false },
});

const count = (rows, o = {}) => peopleNowOf(rows, { tz: ZONE, nowMs: NOW, ready: null, ...o });

let made = 0;
/** An ordinary person: wrote two hours ago on WhatsApp, known for two months (people-vm.test.mjs's row). */
function row(over = {}) {
  made += 1;
  return {
    id: `c${made}`,
    display_name: `Person ${made}`,
    wa_profile_name: null,
    phone_e164: `+1786555${String(made).padStart(4, "0")}`,
    consent: "unknown",
    consent_source: null,
    consent_updated_at: null,
    dnc: false,
    channels: ["whatsapp"],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: `cv${made}`,
    latest_state: "open",
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: iso(2 * H),
    last_message_at: iso(2 * H),
    last_message_direction: "inbound",
    last_message_sender: "customer",
    last_inbound_text: "Can I move Saturday to 11?",
    last_inbound_at: iso(2 * H),
    last_call_at: null,
    last_inbound_call_at: null,
    call_count: 0,
    call_seconds: 0,
    first_contact_at: iso(100 * D),
    earliest_row_at: iso(100 * D),
    has_backfill: false,
    has_chat: true,
    message_channels: ["whatsapp"],
    queued_reply_at: null,
    ...over,
  };
}

/** Someone who last wrote `msAgo` ago. */
const heard = (msAgo, over = {}) =>
  row({ last_inbound_at: iso(msAgo), last_message_at: iso(msAgo), latest_wa_inbound_at: iso(msAgo), ...over });
/** Someone who never wrote and never rang: nothing of theirs on record. */
const silent = (over = {}) =>
  row({
    last_inbound_at: null,
    last_message_at: null,
    last_message_direction: null,
    last_message_sender: null,
    last_inbound_text: null,
    latest_wa_inbound_at: null,
    latest_conversation_id: null,
    conversation_count: 0,
    first_contact_at: null,
    has_chat: false,
    message_channels: [],
    channels: [],
    ...over,
  });
/** Someone the business wrote to, who has said nothing: the business's own message is not them. */
const outboundOnly = (over = {}) =>
  silent({
    last_message_at: iso(3 * D),
    last_message_direction: "outbound",
    last_message_sender: "ai",
    has_chat: true,
    conversation_count: 1,
    latest_conversation_id: "cv-out",
    message_channels: ["whatsapp"],
    channels: ["whatsapp"],
    ...over,
  });
/** Someone who rang, `msAgo` ago, and has never written. */
const rang = (msAgo, over = {}) =>
  silent({
    last_call_at: iso(msAgo),
    last_inbound_call_at: iso(msAgo),
    call_count: 1,
    channels: ["voice"],
    first_contact_at: iso(msAgo),
    ...over,
  });

const BUCKETS = ["under_7", "d7_30", "d31_60", "d61_90", "d91_up", "never"];
const only = (bucket) => Object.fromEntries(BUCKETS.map((b) => [b, b === bucket ? 1 : 0]));
const YES = { consent: "opted_in", consent_source: "customer_message", consent_updated_at: iso(20 * D) };
const OFFERS_YES = {
  marketing_consent: "opted_in",
  marketing_consent_source: "form",
  marketing_consent_updated_at: iso(10 * D),
  marketing_channels: ["whatsapp"],
};
const STOP = { consent: "opted_out", consent_source: "customer_message", consent_updated_at: iso(15 * D) };
const step = (due) => ({ step_id: `s-${due}`, step_body: "Send the quote", step_due_on: due });
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

test("the book as the pool counts it: freshness is how long since they wrote or rang, in the workspace's days", () => {
  const cases = [
    ["under_7", "two hours ago", heard(2 * H)],
    ["d7_30", "7 days ago", heard(7 * D)],
    ["d7_30", "30 days ago (the last day that is not quiet)", heard(QUIET_AFTER_DAYS * D)],
    ["d31_60", "31 days ago", heard((QUIET_AFTER_DAYS + 1) * D)],
    ["d61_90", "61 days ago", heard(61 * D)],
    ["d91_up", "91 days ago", heard(91 * D)],
    ["never", "never wrote or rang", silent()],
    ["never", "only the business ever wrote", outboundOnly()],
    [
      "never",
      "only the business ever rang them",
      silent({ last_call_at: iso(2 * D), call_count: 1, channels: ["voice"] }),
    ],
    ["d31_60", "a call they placed, 40 days ago", rang(40 * D)],
    ["under_7", "6 days ago", heard(6 * D)],
  ];
  for (const [bucket, words, person] of cases)
    assert.deepEqual(count([person]).fresh, only(bucket), `${words} is ${bucket}`);

  const book = cases.map((c) => c[2]);
  const now = count(book);
  assert.equal(now.people, book.length, "people is the row count");
  assert.deepEqual(now.fresh, { under_7: 2, d7_30: 2, d31_60: 2, d61_90: 1, d91_up: 1, never: 3 });
  assert.equal(sum(now.fresh), now.people, "each person is in one bucket");
  assert.deepEqual(count([]), {
    people: 0,
    fresh: { under_7: 0, d7_30: 0, d31_60: 0, d61_90: 0, d91_up: 0, never: 0 },
    lists: { opted_in: 0, offers_ok: 0, opted_out: 0, quiet: 0 },
    steps: { overdue: 0, due_today: 0 },
    email_stopped: 0,
    wires: { whatsapp_only: 0, sms_only: 0, phone_only: 0, email_only: 0, several: 0, none: 0 },
  });
});

test("the last three buckets are the Quiet list", () => {
  const book = [
    heard(2 * H),
    heard(30 * D),
    heard(31 * D),
    heard(45 * D),
    heard(61 * D),
    heard(90 * D),
    heard(91 * D),
    heard(400 * D),
    rang(60 * D),
    silent(),
    outboundOnly(),
  ];
  const { fresh, lists } = count(book);
  assert.equal(
    fresh.d31_60 + fresh.d61_90 + fresh.d91_up,
    lists.quiet,
    "the same people, whichever way they are counted",
  );
  assert.equal(lists.quiet, 7);
  assert.equal(count([heard(30 * D)]).lists.quiet, 0, "a person heard 30 days ago is not quiet");
  const thirty = count([heard(30 * D)]).fresh;
  assert.equal(thirty.d31_60 + thirty.d61_90 + thirty.d91_up, 0, "and in none of the three buckets");
  assert.equal(count([silent(), outboundOnly()]).lists.quiet, 0, "someone never heard from is not quiet");
});

test("steps: the earliest open step decides, and a person is counted once", () => {
  // people_list carries a person's EARLIEST open step (their step_* columns): the day of the first of several.
  const overdueAndLater = row({ ...step("2026-09-03") });
  const book = [
    overdueAndLater, // a step due yesterday (and another next week, which the row does not carry)
    row({ ...step("2026-08-01") }), // a month overdue
    row({ ...step("2026-09-04") }), // due today
    row({ ...step("2026-09-05") }), // due tomorrow: not yet
    row({ ...step("2026-09-11") }), // due next week, nothing sooner: not yet
    row({ step_id: null, step_body: null, step_due_on: null }), // a step marked done: the row carries none
    row({ ...step("not-a-day") }), // a step with no real day is no step
    row(), // no step at all
  ];
  const { steps } = count(book);
  assert.deepEqual(steps, { overdue: 2, due_today: 1 });
  assert.deepEqual(count([overdueAndLater]).steps, { overdue: 1, due_today: 0 }, "overdue once, not once per step");

  const rows = poolRowsOf(book, { tz: ZONE, now: new Date(NOW), viewer: null, dealsOn: false, ready: null });
  const stepsDue = PEOPLE_LISTS.find((l) => l.id === "steps_due");
  assert.equal(steps.overdue + steps.due_today, rows.filter(stepsDue.test).length, "the Steps due list's own count");
});

test("channels per person: one wire alone, several, or none", () => {
  /** A row that has reached the business on exactly these wires, as the builder reads them. */
  const wired = (channels, over = {}) => {
    const wrote = channels.filter((c) => c !== "voice");
    return row({
      channels,
      message_channels: wrote,
      has_chat: wrote.length > 0,
      call_count: channels.includes("voice") ? 2 : 0,
      ...over,
    });
  };
  const wires = (...people) => count(people).wires;
  const none = { whatsapp_only: 0, sms_only: 0, phone_only: 0, email_only: 0, several: 0, none: 0 };
  assert.deepEqual(wires(wired(["whatsapp"])), { ...none, whatsapp_only: 1 });
  assert.deepEqual(wires(wired(["sms"])), { ...none, sms_only: 1 });
  assert.deepEqual(wires(wired(["voice"])), { ...none, phone_only: 1 }, "a person who only phoned");
  assert.deepEqual(wires(wired(["email"])), { ...none, email_only: 1 });
  assert.deepEqual(wires(wired(["whatsapp", "voice"])), { ...none, several: 1 });
  assert.deepEqual(wires(wired(["sms", "email", "voice"])), { ...none, several: 1 });
  assert.deepEqual(wires(wired([])), { ...none, none: 1 }, "no way in on record");
  assert.deepEqual(wires(row({ channels: null, message_channels: null, has_chat: false })), { ...none, none: 1 });
  // What happened counts as much as what an identity records: their number is only a phone line on file, and their
  // WhatsApp transcript is right there in the messages.
  assert.deepEqual(
    wires(wired(["voice"], { message_channels: ["whatsapp"], has_chat: true })),
    { ...none, several: 1 },
    "the wires they wrote on are theirs, whatever the identity says",
  );
  const book = [
    wired(["whatsapp"]),
    wired(["whatsapp"]),
    wired(["sms"]),
    wired(["voice"]),
    wired(["email"]),
    wired([]),
  ];
  assert.deepEqual(wires(...book), {
    whatsapp_only: 2,
    sms_only: 1,
    phone_only: 1,
    email_only: 1,
    several: 0,
    none: 1,
  });
  assert.equal(sum(wires(...book)), book.length, "each person once");
});

test("a stopped address counts once", () => {
  const stopped = (over = {}) =>
    row({ email: "ana@example.com", email_suppressed_at: iso(5 * D), email_suppressed_reason: "hard_bounce", ...over });
  const book = [
    stopped(),
    stopped({
      channels: ["whatsapp", "email"],
      message_channels: ["whatsapp", "email"],
      email_suppressed_reason: "complaint",
    }),
    row({ email: "bo@example.com", email_suppressed_at: null }), // an address that works
    row({ email: "cy@example.com" }), // a row read before the column existed
    row(), // no address at all
  ];
  assert.equal(count(book).email_stopped, 2, "each person with a stopped address, once");
  assert.equal(count([stopped()]).email_stopped, 1);
  assert.equal(count(book.slice(2)).email_stopped, 0);
});

test("it is what People's rail says: the same people, counted by the same lists", () => {
  const book = [
    heard(2 * H, { ...YES, ...OFFERS_YES, ...step("2026-09-04") }), // yes to both, a step due today
    heard(10 * D, { ...YES }),
    heard(45 * D, { ...YES, ...step("2026-09-01") }), // quiet, a step overdue
    heard(70 * D, { ...YES, ...OFFERS_YES, email: "ana@example.com", email_suppressed_at: iso(3 * D) }),
    heard(100 * D, { ...STOP }), // asked to stop, quiet
    heard(3 * D, { ...STOP, ...OFFERS_YES }), // asked to stop after a yes to offers
    rang(20 * D, { ...YES }),
    silent({ ...step("2026-09-05") }),
    outboundOnly(),
    row({ ...OFFERS_YES, consent: "unknown" }), // an answer about offers alone
  ];
  const rail = (people, channelsReadyOf) =>
    Object.fromEntries(
      peopleSurfaceOf(
        {
          tz: ZONE,
          people,
          page: null,
          saved: [],
          calendar: { state: "none", source: "your calendar" },
          bookingLink: null,
          dealsOn: false,
          consultFirst: false,
          dealPace: null,
          followUp: null,
          channelsReady: channelsReadyOf,
          views: {},
          viewsRead: true,
        },
        null,
        new Date(NOW),
      ).lists.map((l) => [l.id, l.count]),
    );
  const FIVE = ["opted_in", "offers_ok", "opted_out", "quiet", "steps_due"];
  const says = (readyOf) => {
    const now = count(book, { ready: readyOf });
    const onRail = rail(book, readyOf);
    return {
      now: { ...now.lists, steps_due: now.steps.overdue + now.steps.due_today },
      rail: Object.fromEntries(FIVE.map((id) => [id, onRail[id]])),
    };
  };

  const withWhatsApp = says(ready());
  assert.deepEqual(withWhatsApp.now, withWhatsApp.rail, "with WhatsApp");
  // By hand: yes to messages are rows 1, 2, 3, 4 and 7; offers 1, 4 and 10; stopped 5 and 6; quiet 3, 4 and 5; steps 1, 3.
  assert.deepEqual(withWhatsApp.now, { opted_in: 5, offers_ok: 3, opted_out: 2, quiet: 3, steps_due: 2 });

  const down = says(WHATSAPP_DOWN);
  assert.deepEqual(down.now, down.rail, "with WhatsApp unable to send");
  assert.equal(down.now.offers_ok, 0, "offers wait on WhatsApp");
  assert.equal(down.rail.offers_ok, 0);
  assert.equal(down.now.opted_in, withWhatsApp.now.opted_in, "the yes is theirs, whether or not you can send");

  const unread = says(null);
  assert.deepEqual(unread.now, unread.rail, "with the channels not read");
  assert.deepEqual(unread.now, withWhatsApp.now, "WhatsApp alone, as every page counted before the channels were");
  const mail = says(ready({ text: true, email: true }));
  assert.deepEqual(mail.now, mail.rail, "with every channel");
});

test("none of the five lists is about whoever is looking", () => {
  for (const id of ["opted_in", "offers_ok", "opted_out", "steps_due", "quiet"]) {
    const list = BUILTIN_LISTS.find((l) => l.id === id);
    assert.ok(list, `${id} is a built-in list`);
    assert.deepEqual(ruleNeeds(list.rule), [], `${id} needs no calendar, deals, consult-first service or viewer`);
  }
});

test("a list that cannot be counted is an error, never a made-up count", () => {
  const quiet = BUILTIN_LISTS.find((l) => l.id === "quiet");
  const kept = quiet.rule;
  // A rule that gained a need: waiting on YOU is about whoever is looking, and a book counted for no one has none.
  quiet.rule = { v: 2, all: [{ field: "standing", op: "is", value: "waiting_on_you" }] };
  try {
    assert.throws(() => count([heard(2 * H)]), {
      name: "Error",
      message: "People's list quiet cannot be counted without a viewer",
    });
    const rows = poolRowsOf([heard(2 * H)], {
      tz: ZONE,
      now: new Date(NOW),
      viewer: null,
      dealsOn: false,
      ready: null,
    });
    const ctx = poolListContext({ calendar: "none", dealsOn: false, consultFirst: false, viewer: null });
    assert.equal(membersOf(resolveList({ kind: "builtin", id: "quiet" }, []), rows, ctx).state, "unknown");
  } finally {
    quiet.rule = kept;
  }
  assert.equal(count([heard(40 * D)]).lists.quiet, 1, "and the list is itself again");
});

test("nothing of a person leaves the book: counts only", () => {
  const book = [
    heard(2 * H, { ...YES, display_name: "Daniela Rivera", email: "daniela@example.com" }),
    heard(50 * D, { ...step("2026-09-01") }),
  ];
  const now = count(book);
  const leaves = [];
  const walk = (v) => (v !== null && typeof v === "object" ? Object.values(v).forEach(walk) : leaves.push(v));
  walk(now);
  assert.ok(leaves.length > 0 && leaves.every((v) => typeof v === "number"), "every value is a count");
  const said = JSON.stringify(now);
  for (const p of book)
    for (const secret of [p.id, p.display_name, p.phone_e164, p.email, p.last_inbound_text])
      if (secret) assert.equal(said.includes(secret), false, `${secret} is not in the answer`);
});

test("days are the workspace's: 31 calendar days is 31 although 30 days and 20 minutes have passed", () => {
  const AKL = "Pacific/Auckland";
  // Sat 5 Sep 2026, 00:10 in Auckland (UTC+12 until 27 Sep): Fri 4 Sep 12:10Z.
  const now = Date.parse("2026-09-04T12:10:00Z");
  const book = (...people) => count(people, { tz: AKL, nowMs: now });
  // Wed 5 Aug 23:50 Auckland, 30 days and 20 minutes before: the 31st calendar day back.
  const late = heard(0, { last_inbound_at: "2026-08-05T11:50:00Z", last_message_at: "2026-08-05T11:50:00Z" });
  // Thu 6 Aug 00:30 Auckland, 29 days and 23 hours 40 minutes before: the 30th calendar day back.
  const early = heard(0, { last_inbound_at: "2026-08-05T12:30:00Z", last_message_at: "2026-08-05T12:30:00Z" });

  assert.deepEqual(book(late).fresh, only("d31_60"), "the 31st calendar day back is d31_60");
  assert.equal(book(late).lists.quiet, 1, "and Quiet 30+ days");
  assert.deepEqual(book(early).fresh, only("d7_30"), "the 30th calendar day back is not");
  assert.equal(book(early).lists.quiet, 0);
  const both = book(late, early);
  assert.equal(both.fresh.d31_60 + both.fresh.d61_90 + both.fresh.d91_up, both.lists.quiet);

  // A step's day is the workspace's too: 5 Sep is today in Auckland, where UTC is still on the 4th.
  assert.deepEqual(book(row({ ...step("2026-09-05") })).steps, { overdue: 0, due_today: 1 });
  assert.deepEqual(book(row({ ...step("2026-09-04") })).steps, { overdue: 1, due_today: 0 });
  assert.deepEqual(book(row({ ...step("2026-09-06") })).steps, { overdue: 0, due_today: 0 });
});
