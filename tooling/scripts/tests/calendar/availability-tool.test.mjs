/**
 * The phone receptionist checks the calendar mid-call, and recurring events
 * count as taken.
 *
 * check_availability is a custom tool on the shell: the agent asks for a day
 * and a service, the edge reads the same feed the WhatsApp receptionist
 * reads, and speaks the windows that are open and long enough. Recurring
 * events (a standing Tuesday block, a weekly class) used to be counted and
 * dropped; they are expanded now, in the event's own zone, with EXDATE,
 * COUNT, UNTIL and INTERVAL honoured, and rules this parser does not read
 * keep their first occurrence and are counted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  parseIcs,
  filterOpenings,
  freeWindows,
  localToUtcMs,
  composeSystemPrompt,
  matchService,
} from "@chanlytics/contracts";
// The one rule for a service that needs a consultation first, for the phone, the assistant and the board (C5b).
const { offerFor, offerLead, needsConsultation } = await import("@chanlytics/contracts");
import { desiredVoiceShell, availabilityUrl, voiceLlmCreateBody } from "@chanlytics/channels";

/** Where the voice tools post in these fixtures: the address an edge off production gives them (dashboard-origin.ts). */
const FN_URL = "https://chanlytics-messaging.vercel.app/api/retell-fn";
import { readCode } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.RETELL_FN_SECRET = "availability-secret-for-this-file";
const { setPg } = await import(pathToFileURL(path.join(here, "../../../../apps/edge/lib/pg.ts")).href);
const door = await import(pathToFileURL(path.join(here, "../../../../apps/edge/api/retell-availability.ts")).href);
const { spoken, availabilityAnswer } = door;

const TZ = "America/New_York";
const ny = (y, m, d, hh, mm = 0) => localToUtcMs(TZ, y, m, d, hh, mm);
const HORIZON = { from: ny(2026, 9, 1, 0), to: ny(2026, 10, 31, 0) };
const ics = (lines) =>
  ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:x", ...lines, "END:VEVENT", "END:VCALENDAR"].join("\r\n");

test("a weekly series expands on its days, skips an EXDATE, and stops at COUNT", () => {
  const feed = parseIcs(
    ics([
      "DTSTART;TZID=America/New_York:20260908T140000",
      "DTEND;TZID=America/New_York:20260908T150000",
      "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=5",
      "EXDATE;TZID=America/New_York:20260915T140000",
    ]),
    TZ,
    { horizon: HORIZON },
  );
  assert.equal(feed.recurringExpanded, 1);
  assert.equal(feed.skippedRecurring, 0);
  // Tue 8, Thu 10, (Tue 15 excluded), Thu 17, Tue 22 — five produced, four kept.
  assert.deepEqual(
    feed.busy.map((b) => b.start),
    [ny(2026, 9, 8, 14), ny(2026, 9, 10, 14), ny(2026, 9, 17, 14), ny(2026, 9, 22, 14)],
  );
  assert.equal(feed.busy[0].end - feed.busy[0].start, 3_600_000, "each occurrence keeps the event's length");
});

test("daily with INTERVAL and UNTIL; monthly on a day; yearly; the horizon bounds them", () => {
  const daily = parseIcs(
    ics([
      "DTSTART;TZID=America/New_York:20260901T090000",
      "DURATION:PT30M",
      "RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20260907",
    ]),
    TZ,
    { horizon: HORIZON },
  );
  assert.deepEqual(
    daily.busy.map((b) => b.start),
    [ny(2026, 9, 1, 9), ny(2026, 9, 3, 9), ny(2026, 9, 5, 9), ny(2026, 9, 7, 9)],
    "UNTIL as a date includes that day",
  );
  const monthly = parseIcs(
    ics([
      "DTSTART;TZID=America/New_York:20260815T120000",
      "DTEND;TZID=America/New_York:20260815T130000",
      "RRULE:FREQ=MONTHLY;BYMONTHDAY=15",
    ]),
    TZ,
    { horizon: HORIZON },
  );
  assert.deepEqual(
    monthly.busy.map((b) => b.start),
    [ny(2026, 9, 15, 12), ny(2026, 10, 15, 12)],
    "before the horizon is not produced; the series itself started in August",
  );
  const yearly = parseIcs(ics(["DTSTART;VALUE=DATE:20200925", "DTEND;VALUE=DATE:20200926", "RRULE:FREQ=YEARLY"]), TZ, {
    horizon: HORIZON,
  });
  assert.deepEqual(
    yearly.busy,
    [{ start: ny(2026, 9, 25, 0), end: ny(2026, 9, 26, 0) }],
    "an all-day yearly block lands on the day, in the zone",
  );
});

test("a weekly series holds its wall-clock time across the DST change", () => {
  const feed = parseIcs(
    ics([
      "DTSTART;TZID=America/New_York:20261027T140000",
      "DTEND;TZID=America/New_York:20261027T150000",
      "RRULE:FREQ=WEEKLY",
    ]),
    TZ,
    { horizon: { from: ny(2026, 10, 20, 0), to: ny(2026, 11, 20, 0) } },
  );
  const local = feed.busy.map((b) =>
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(b.start)),
  );
  assert.ok(
    local.every((t) => t === "2:00 PM"),
    local.join(", "),
  );
  assert.equal(feed.busy.length, 4, "Oct 27, Nov 3 (after the clocks change), Nov 10, Nov 17");
});

test("a rule this parser does not read keeps its first occurrence and is counted", () => {
  const feed = parseIcs(
    ics([
      "DTSTART;TZID=America/New_York:20260909T100000",
      "DTEND;TZID=America/New_York:20260909T110000",
      "RRULE:FREQ=MONTHLY;BYDAY=2TU",
    ]),
    TZ,
    { horizon: HORIZON },
  );
  assert.equal(feed.skippedRecurring, 1);
  assert.equal(feed.recurringExpanded, 0);
  assert.deepEqual(feed.busy, [{ start: ny(2026, 9, 9, 10), end: ny(2026, 9, 9, 11) }]);
});

test("the openings a caller asked about: one day by date or weekday, and only windows long enough", () => {
  const hours = { wed: { open: "09:30", close: "18:00" }, fri: { open: "09:30", close: "19:00" } };
  const now = new Date(ny(2026, 9, 9, 8));
  const all = freeWindows({
    hours,
    tz: TZ,
    busy: [{ start: ny(2026, 9, 11, 12), end: ny(2026, 9, 11, 18, 30) }],
    rules: { lead_hours: 0, max_days_ahead: 3 },
    now,
  });
  assert.deepEqual(
    all.map((o) => o.weekday),
    ["wed", "fri"],
  );
  assert.deepEqual(
    filterOpenings(all, { day: "friday" }).map((o) => o.key),
    ["2026-09-11"],
  );
  assert.deepEqual(
    filterOpenings(all, { day: "2026-09-09" }).map((o) => o.key),
    ["2026-09-09"],
  );
  assert.deepEqual(filterOpenings(all, { day: "monday" }), [], "a day with nothing is nothing, not a guess");
  // Friday: 9:30–12:00 (150 min) and 18:30–19:00 (30 min). A 90-minute service fits only the morning.
  const fri = filterOpenings(all, { day: "fri", minMinutes: 90 })[0];
  assert.equal(fri.windows.length, 1);
  assert.equal(fri.windows[0].start, ny(2026, 9, 11, 9, 30));
  assert.deepEqual(filterOpenings(all, { day: "fri", minMinutes: 200 }), [], "nothing long enough is nothing");
});

test("the tool speaks one paragraph, names the service's length, and matches a service loosely", () => {
  const services = [
    { name: "Balayage", duration_min: 180 },
    { name: "Short haircut", duration_min: 60 },
    { name: "Extensions", price_note: "by consultation" },
  ];
  assert.equal(matchService(services, "balayage").name, "Balayage");
  assert.equal(matchService(services, "a haircut").name, "Short haircut", "either way round");
  assert.equal(matchService(services, "massage"), null);
  assert.equal(matchService(undefined, "Balayage"), null);
  // One match for the phone and the assistant, and it reads Spanish. The phone's
  // copy cut "uñas" at the ñ into "u" and "as", too short to count, so a caller
  // asking for nails matched nothing while the assistant found the service.
  const salon = [
    { name: "Uñas de gel", duration_min: 75 },
    { name: "Depilación de cejas", duration_min: 20 },
  ];
  assert.equal(matchService(salon, "uñas acrílicas")?.name, "Uñas de gel", "a shared word with an ñ in it");
  assert.equal(
    matchService(salon, "unas")?.name,
    "Uñas de gel",
    "and without the tilde, the way a caller's words can arrive",
  );
  assert.equal(matchService(salon, "depilacion de cejas")?.name, "Depilación de cejas", "accents are not the name");
  assert.equal(matchService(salon, "pedicure"), null);
  const text = spoken(
    "Open times (from the calendar):\n- Wednesday, September 9: 10:00 AM – 11:00 AM\n- Friday, September 11: 9:30 AM – 12:00 PM\nOffer up to three.",
    offerFor(services, null, "balayage"),
  );
  assert.equal(
    text,
    "For Balayage (about 180 minutes): Open times (from the calendar): Wednesday, September 9: 10:00 AM – 11:00 AM Friday, September 11: 9:30 AM – 12:00 PM Offer up to three.",
  );
  assert.ok(!spoken("x", null).startsWith("For "), "no length known, no preface");
});

test("REGRESSION (C5b): a service that needs a consultation first is offered as a consultation, one rule for the phone, the assistant and the board -- each sized a three-hour color correction by its own length while the prompt said a consultation comes first", () => {
  const rules = { consult_first: ["Color Correction "] };
  const services = [
    { name: "Color correction", duration_min: 180 },
    { name: "Balayage", duration_min: 90 },
    { name: "Consultation", duration_min: 30 },
  ];
  const cc = offerFor(services, rules, "a color correction");
  assert.equal(cc.service.name, "Color correction");
  assert.equal(cc.consultation, true);
  assert.equal(cc.consultationService?.name, "Consultation");
  assert.equal(cc.minMinutes, 30, "REGRESSION: sized by its own 180 minutes");
  assert.equal(
    offerLead(cc),
    "Color correction needs a consultation before it can be booked, so offer a consultation instead. For a consultation (about 30 minutes): ",
  );
  const bal = offerFor(services, rules, "balayage");
  assert.deepEqual([bal.consultation, bal.consultationService, bal.minMinutes], [false, null, 90]);
  assert.equal(offerLead(bal), "For Balayage (about 90 minutes): ", "a service booked as itself reads as it did");
  // A consultation of the service's own kind is the one offered, and named when it is more than "Consultation".
  const kind = offerFor([...services, { name: "Color consultation", duration_min: 15 }], rules, "color correction");
  assert.equal(kind.consultationService?.name, "Color consultation");
  assert.equal(
    offerLead(kind),
    "Color correction needs a consultation before it can be booked, so offer a consultation instead. For a consultation (Color consultation, about 15 minutes): ",
  );
  // None listed: any open time will do, and the words still offer a consultation.
  const bare = offerFor([{ name: "Extensions", duration_min: 240 }], { consult_first: ["extensions"] }, "extensions");
  assert.deepEqual([bare.consultation, bare.consultationService, bare.minMinutes], [true, null, null]);
  assert.equal(
    offerLead(bare),
    "Extensions needs a consultation before it can be booked, so offer a consultation instead. For a consultation: ",
  );
  // A consultation that itself needs one is never the one offered.
  assert.equal(
    offerFor(
      [
        { name: "Color correction", duration_min: 180 },
        { name: "Consulta", duration_min: 20 },
      ],
      { consult_first: ["Color correction", "Consulta"] },
      "color correction",
    ).consultationService,
    null,
  );
  // Accents, case and spaces are not the name, in Spanish as in English.
  assert.equal(needsConsultation("Coloración", { consult_first: [" coloracion"] }), true);
  assert.equal(
    offerFor(
      [
        { name: "Coloración", duration_min: 150 },
        { name: "Consulta", duration_min: 20 },
      ],
      { consult_first: ["coloracion"] },
      "coloración",
    ).consultationService?.name,
    "Consulta",
  );
  assert.equal(needsConsultation("Balayage", rules), false);
  assert.equal(needsConsultation("Balayage", null), false);
  assert.equal(offerFor(services, rules, "massage"), null);
  assert.equal(offerLead(null), "");
  // The phone speaks it in one paragraph, the consultation first.
  const block = [
    "Open times (from the calendar):",
    "- Wednesday, September 9: 10:00 AM – 11:00 AM",
    "Offer up to three.",
  ].join(String.fromCharCode(10));
  assert.equal(
    spoken(block, cc),
    "Color correction needs a consultation before it can be booked, so offer a consultation instead. For a consultation (about 30 minutes): Open times (from the calendar): Wednesday, September 9: 10:00 AM – 11:00 AM Offer up to three.",
  );
});

test("REGRESSION (C5b): the phone tool answers a consultation-first service with a consultation's open times -- it spoke the service's own length, or that nothing was open", () => {
  const now = new Date(ny(2026, 9, 9, 8));
  const openings = freeWindows({
    hours: { wed: { open: "09:00", close: "18:00" } },
    tz: TZ,
    busy: [{ start: ny(2026, 9, 9, 9), end: ny(2026, 9, 9, 12) }],
    rules: { lead_hours: 0, max_days_ahead: 1 },
    now,
  });
  const data = { openings, tz: TZ, daysAhead: 14 };
  const profile = {
    services: [
      { name: "Color correction", duration_min: 400 },
      { name: "Consultation", duration_min: 30 },
    ],
    booking_rules: { consult_first: ["Color correction"] },
  };
  const said = availabilityAnswer(
    data,
    profile,
    { day: "2026-09-09", service: "color correction" },
    { hasBookingLink: true },
  );
  assert.equal(said.offer?.consultation, true);
  assert.equal(said.days, 1, "REGRESSION: a 400-minute filter left nothing open");
  assert.match(
    said.result,
    /^Color correction needs a consultation before it can be booked, so offer a consultation instead\. For a consultation \(about 30 minutes\): Open times \(from the calendar/,
  );
  assert.match(said.result, /12:00 PM – 6:00 PM/);
  const asItself = availabilityAnswer(
    data,
    { ...profile, booking_rules: {} },
    { day: "2026-09-09", service: "color correction" },
    { hasBookingLink: true },
  );
  assert.equal(asItself.days, 0, "booked as itself, a 400-minute service fits nothing that afternoon");
  assert.match(
    asItself.result,
    /^For Color correction \(about 400 minutes\): Open times \(from the calendar\): nothing is open/,
  );
});

test("the shell carries the tool beside the booking link, the edge guards it, and the phone prompt names it", () => {
  const d = desiredVoiceShell(FN_URL, { "x-fn-secret": "sealed" });
  const tool = d.general_tools.find((t) => t.name === "check_availability");
  assert.ok(tool, "on the shell");
  assert.equal(tool.url, "https://chanlytics-messaging.vercel.app/api/retell-availability");
  assert.deepEqual(tool.headers, { "x-fn-secret": "sealed" }, "same secret as the booking tool");
  assert.deepEqual(Object.keys(tool.parameters.properties).sort(), ["day", "service"]);
  assert.equal(
    availabilityUrl("https://preview.example/api/retell-fn"),
    "https://preview.example/api/retell-availability",
  );
  const edge = readCode("apps/edge/api/retell-availability.ts");
  assert.ok(
    edge.includes('voiceDoorAuth("availability", request, raw).ok'),
    "the door is guarded as the other two Retell doors are (voice-door-auth.test.mjs runs it)",
  );
  assert.ok(edge.includes("filterOpenings(data.openings, { day, minMinutes: offer?.minMinutes ?? null })"));
  assert.ok(
    edge.includes("return json(200, { result: CANNOT_SEE })"),
    "a refusal is a sentence the agent speaks, never an error status",
  );
  const brain = {
    business_name: "S",
    phone_display: "(212) 555-0142",
    booking_link: "https://booksy.com/x",
    system_prompt: "x".repeat(50),
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
  };
  const voice = composeSystemPrompt(brain, { hours: { mon: { open: "09:00", close: "17:00" } } }, "voice");
  assert.ok(voice.includes("use check_availability before offering a time"));
  assert.ok(
    !composeSystemPrompt(brain, { hours: { mon: { open: "09:00", close: "17:00" } } }, "whatsapp").includes(
      "check_availability",
    ),
    "a phone tool, not a WhatsApp one",
  );
  const created = voiceLlmCreateBody({ fnSecret: "sealed" }, FN_URL).general_tools.find(
    (t) => t.name === "check_availability",
  );
  assert.ok(
    created && created.url === "https://chanlytics-messaging.vercel.app/api/retell-availability",
    "provisioning creates it too",
  );
});

test("RECURRENCE-ID: one instance of a weekly series moved to another time is drawn once, where it moved to; a cancelled override removes its instance", () => {
  const series = [
    "SUMMARY:Standing block",
    "DTSTART;TZID=America/New_York:20260908T140000",
    "DTEND;TZID=America/New_York:20260908T150000",
    "RRULE:FREQ=WEEKLY;COUNT=4",
  ];
  const moved = [
    "BEGIN:VEVENT",
    "UID:x",
    "SUMMARY:Standing block (moved)",
    "RECURRENCE-ID;TZID=America/New_York:20260915T140000",
    "DTSTART;TZID=America/New_York:20260916T100000",
    "DTEND;TZID=America/New_York:20260916T110000",
    "END:VEVENT",
  ];
  const cancelled = [
    "BEGIN:VEVENT",
    "UID:x",
    "SUMMARY:Standing block",
    "RECURRENCE-ID;TZID=America/New_York:20260922T140000",
    "STATUS:CANCELLED",
    "DTSTART;TZID=America/New_York:20260922T140000",
    "DTEND;TZID=America/New_York:20260922T150000",
    "END:VEVENT",
  ];
  const text = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:x",
    ...series,
    "END:VEVENT",
    ...moved,
    ...cancelled,
    "END:VCALENDAR",
  ].join("\r\n");
  const feed = parseIcs(text, TZ, { horizon: HORIZON });
  const starts = feed.busy.map((b) => b.start).sort((a, b) => a - b);
  assert.deepEqual(
    starts,
    [ny(2026, 9, 8, 14), ny(2026, 9, 16, 10), ny(2026, 9, 29, 14)],
    "the 8th as the rule says, the 15th where it moved to (the 16th at 10), the 22nd gone, the 29th as the rule says",
  );
  assert.equal(
    feed.items.find((i) => i.start === ny(2026, 9, 16, 10)).title,
    "Standing block (moved)",
    "the override's own words",
  );
  assert.equal(feed.busy.filter((b) => b.start === ny(2026, 9, 15, 14)).length, 0, "not drawn twice");
  assert.equal(feed.events, 3, "three VEVENTs read");
  assert.equal(feed.recurringExpanded, 1);
  assert.equal(feed.skippedRecurring, 0);
});

test("RDATE: extra dates join a series, or make one of a single event, and are never counted as a rule that could not be read", () => {
  const withRule = parseIcs(
    ics([
      "SUMMARY:Class",
      "DTSTART;TZID=America/New_York:20260908T180000",
      "DTEND;TZID=America/New_York:20260908T190000",
      "RRULE:FREQ=WEEKLY;COUNT=2",
      "RDATE;TZID=America/New_York:20260911T180000,20260912T180000",
    ]),
    TZ,
    { horizon: HORIZON },
  );
  assert.deepEqual(
    withRule.busy.map((b) => b.start).sort((a, b) => a - b),
    [ny(2026, 9, 8, 18), ny(2026, 9, 11, 18), ny(2026, 9, 12, 18), ny(2026, 9, 15, 18)],
  );
  assert.deepEqual([withRule.recurringExpanded, withRule.skippedRecurring], [1, 0]);
  const alone = parseIcs(
    ics([
      "SUMMARY:Pop-up",
      "DTSTART;TZID=America/New_York:20260910T120000",
      "DTEND;TZID=America/New_York:20260910T130000",
      "RDATE;TZID=America/New_York:20260917T120000",
      "EXDATE;TZID=America/New_York:20260917T120000",
      "RDATE;TZID=America/New_York:20260924T120000",
    ]),
    TZ,
    { horizon: HORIZON },
  );
  assert.deepEqual(
    alone.busy.map((b) => b.start),
    [ny(2026, 9, 10, 12), ny(2026, 9, 24, 12)],
    "the event, its extra date, and the one an EXDATE took back",
  );
  assert.equal(
    alone.busy.every((b) => b.end - b.start === 3_600_000),
    true,
    "each occurrence takes the event's own length",
  );
  assert.deepEqual([alone.recurringExpanded, alone.skippedRecurring], [1, 0]);
  const unread = parseIcs(
    ics([
      "SUMMARY:Odd",
      "DTSTART;TZID=America/New_York:20260910T120000",
      "DTEND;TZID=America/New_York:20260910T130000",
      "RRULE:FREQ=WEEKLY;BYSETPOS=2",
      "RDATE;TZID=America/New_York:20260924T120000",
    ]),
    TZ,
    { horizon: HORIZON },
  );
  assert.deepEqual(
    [unread.busy.length, unread.skippedRecurring],
    [1, 1],
    "a rule that cannot be read keeps its first occurrence and is counted, RDATE or not",
  );
});

/* -------------------------------- the workspace's own answer about booking */

test("a workspace that confirms its own bookings is not given times to read out", async () => {
  // Reading times aloud is the first half of offering a booking, and the text
  // receptionist already obeys this row for the whole of it: under "Ask me
  // first" layerTwo replaces the reply with a person will confirm -- times,
  // link and all. This tool read the openings out regardless, so one workspace
  // had two receptionists answering "when are you free?" differently.
  //
  // Asked BEFORE the calendar, which is what this world proves: there is no
  // feed here at all, and the caller still hears the booking answer rather
  // than "there is no calendar to check".
  const T = "cccccccc-0000-4000-8000-000000000001";
  const AGENT = "agent_availability_booking_held";
  setPg(
    fakeDb(
      {
        tenants: [{ id: T, name: "Harbor Moving", timezone: TZ, status: "active" }],
        tenant_channels: [
          {
            id: "voice-1",
            tenant_id: T,
            kind: "voice",
            external_id: AGENT,
            number_e164: "+13055550100",
            status: "active",
            credentials_ref: null,
            config: {},
          },
        ],
        tenant_config: [{ tenant_id: T, config: {} }],
        policies: [
          {
            id: "pol-b",
            tenant_id: T,
            class: "booking",
            mode: "ask",
            limits: {},
            subject_type: null,
            subject_id: null,
          },
        ],
        google_listings: [],
      },
      {},
      { runtime_stamp: () => "stamp-1" },
    ),
  );
  try {
    const res = await door.POST(
      new Request("https://chanlytics-messaging.vercel.app/api/retell-availability", {
        method: "POST",
        headers: { "content-type": "application/json", "x-fn-secret": process.env.RETELL_FN_SECRET },
        body: JSON.stringify({ call: { call_id: "call_1", agent_id: AGENT }, args: {} }),
      }),
    );
    assert.equal(
      res.status,
      200,
      "a refusal is still a 200: the agent SPEAKS the result, and an error leaves it silent",
    );
    const { result } = await res.json();
    assert.match(result, /confirms its own bookings/i);
    assert.match(result, /do not offer times/i);
    assert.doesNotMatch(
      result,
      /calendar/i,
      "asked before the feed, so a workspace with no feed still hears the true reason",
    );
  } finally {
    setPg(null);
  }
});

test("a business with no booking link (one that quotes each job): no calendar is the caller's details taken, one it cannot read a call back, and the times it does read end in the details", async () => {
  const brain = {
    business_name: "Harbor Moving",
    system_prompt: "Answer as the front desk of Harbor Moving, which quotes each move before it is booked.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
  };
  /** The door's answer for a workspace of its own holding `config`: one world each, so no runtime is carried over. */
  const ask = async (n, config) => {
    const T = `cccccccc-0000-4000-8000-00000000b3b${n}`;
    const AGENT = `agent_availability_no_link_${n}`;
    setPg(
      fakeDb(
        {
          tenants: [{ id: T, name: "Harbor Moving", timezone: TZ, status: "active" }],
          tenant_channels: [
            {
              id: `voice-nl-${n}`,
              tenant_id: T,
              kind: "voice",
              external_id: AGENT,
              number_e164: "+13055550100",
              status: "active",
              credentials_ref: null,
              config: {},
            },
          ],
          tenant_config: [{ tenant_id: T, config }],
          policies: [],
          google_listings: [],
        },
        {},
        { runtime_stamp: () => `stamp-no-link-${n}` },
      ),
    );
    try {
      const res = await door.POST(
        new Request("https://chanlytics-messaging.vercel.app/api/retell-availability", {
          method: "POST",
          headers: { "content-type": "application/json", "x-fn-secret": process.env.RETELL_FN_SECRET },
          body: JSON.stringify({ call: { call_id: `call_no_link_${n}`, agent_id: AGENT }, args: {} }),
        }),
      );
      assert.equal(res.status, 200);
      return (await res.json()).result;
    } finally {
      setPg(null);
    }
  };
  assert.equal(
    await ask(2, { brain }),
    "There is no calendar to check. Take their name, what they need, and where and when, and say the team will follow up.",
  );
  // A feed it cannot read the openings from: here, no hours to read them against, so nothing is fetched.
  assert.equal(
    await ask(3, { brain, calendar: { ical_url: "https://calendar.example.com/harbor.ics" } }),
    "I can't see the calendar right now. Offer to have someone call back.",
  );
  const now = new Date(ny(2026, 9, 9, 8));
  const openings = freeWindows({
    hours: { wed: { open: "09:00", close: "18:00" } },
    tz: TZ,
    busy: [],
    rules: { lead_hours: 0, max_days_ahead: 1 },
    now,
  });
  const said = availabilityAnswer({ openings, tz: TZ, daysAhead: 14 }, undefined, {}, { hasBookingLink: false }).result;
  assert.ok(
    said.endsWith(
      "then take their name, what they need, and where and when so the team can confirm one. Never confirm a slot yourself; the calendar decides.",
    ),
    said,
  );
  assert.doesNotMatch(said, /booking link/);
});

test("a client is offered the service itself; a stranger the consultation; the answer takes the flag", () => {
  const services = [
    { name: "Ad management", duration_min: 60 },
    { name: "Discovery consult", duration_min: 30 },
  ];
  const rules = { consult_first: ["Ad management"] };
  assert.equal(offerFor(services, rules, "ad management").minMinutes, 30);
  assert.equal(offerFor(services, rules, "ad management").consultation, true);
  assert.equal(offerFor(services, rules, "ad management", { client: true }).minMinutes, 60);
  assert.equal(offerFor(services, rules, "ad management", { client: true }).consultation, false);
  // The openings exactly as this file's C5b fixture builds them: one Wednesday, the morning busy.
  const now = new Date(ny(2026, 9, 9, 8));
  const openings = freeWindows({
    hours: { wed: { open: "09:00", close: "18:00" } },
    tz: TZ,
    busy: [{ start: ny(2026, 9, 9, 9), end: ny(2026, 9, 9, 12) }],
    rules: { lead_hours: 0, max_days_ahead: 1 },
    now,
  });
  const data = { openings, tz: TZ, daysAhead: 14 };
  const profile = { services, booking_rules: rules };
  assert.match(
    availabilityAnswer(data, profile, { service: "ad management" }, { hasBookingLink: true }).result,
    /needs a consultation/,
  );
  assert.doesNotMatch(
    availabilityAnswer(data, profile, { service: "ad management" }, { client: true, hasBookingLink: true }).result,
    /needs a consultation/,
  );
});

test("the door reads the caller's deal: a client on the line is offered a consult-first service itself, a stranger and a withheld number the consultation; where deals are off, nobody is a client", async () => {
  // The same world as the booking-held case, with a calendar and a receptionist, one contact who is a client (0004)
  // and a stubbed feed with nothing on it: every day is open, so the answer turns on the caller alone. The workspace
  // says some customers get a proposal first (0008), so the deal is read; the contact read carries that answer.
  const T = "cccccccc-0000-4000-8000-000000000002";
  const AGENT = "agent_availability_client";
  const CLIENT = "+13055550123";
  const FEED = "https://cal.example/deals.ics";
  const hours = Object.fromEntries(
    ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open: "09:00", close: "18:00" }]),
  );
  const { forgetFeeds } = await import(
    pathToFileURL(path.join(here, "../../../../apps/edge/lib/calendar/availability.ts")).href
  );
  forgetFeeds();
  const world = (sellsBy) =>
    fakeDb(
      {
        tenants: [{ id: T, name: "Harbor Moving", timezone: TZ, status: "active", sells_by: sellsBy }],
        tenant_channels: [
          {
            id: "voice-2",
            tenant_id: T,
            kind: "voice",
            external_id: AGENT,
            number_e164: "+13055550100",
            status: "active",
            credentials_ref: null,
            config: {},
          },
        ],
        tenant_config: [
          {
            tenant_id: T,
            config: {
              calendar: { ical_url: FEED },
              brain: {
                business_name: "Harbor Moving",
                booking_link: "https://book.example/harbor",
                system_prompt: "Answer as the front desk: brief, warm, and never a price or a booking over text.",
                fallbacks: { greeting: "g", error: "e", non_text: "n" },
                profile: {
                  hours,
                  services: [
                    { name: "Ad management", duration_min: 60 },
                    { name: "Discovery consult", duration_min: 30 },
                  ],
                  booking_rules: { consult_first: ["Ad management"] },
                },
              },
            },
          },
        ],
        policies: [],
        google_listings: [],
        contacts: [{ id: "contact-client", tenant_id: T, phone_e164: CLIENT, tenants: { sells_by: sellsBy } }],
        deals: [
          {
            id: "deal-1",
            tenant_id: T,
            contact_id: "contact-client",
            stage: "won",
            service: "Ad management",
            proposed_at: "2026-09-01T12:00:00Z",
            decided_at: "2026-09-20T12:00:00Z",
            ended_at: null,
            created_at: "2026-09-20T12:00:00Z",
          },
        ],
      },
      {},
      { runtime_stamp: () => "stamp-2" },
    );
  setPg(world("proposal"));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", { status: 200, headers: { "content-type": "text/calendar" } });
  const ask = async (from_number) => {
    const res = await door.POST(
      new Request("https://chanlytics-messaging.vercel.app/api/retell-availability", {
        method: "POST",
        headers: { "content-type": "application/json", "x-fn-secret": process.env.RETELL_FN_SECRET },
        body: JSON.stringify({
          call: { call_id: "call_2", agent_id: AGENT, from_number },
          args: { service: "ad management" },
        }),
      }),
    );
    assert.equal(res.status, 200);
    return (await res.json()).result;
  };
  try {
    const stranger = await ask("+13055550199");
    assert.match(stranger, /^Ad management needs a consultation before it can be booked/, stranger);
    const client = await ask(CLIENT);
    assert.doesNotMatch(client, /needs a consultation/, client);
    assert.match(
      client,
      /^For Ad management \(about 60 minutes\): Open times/,
      "the service itself, at its own length",
    );
    const withheld = await ask(undefined);
    assert.match(withheld, /needs a consultation/, "no number is the stranger's answer");
    // Where deals are off (0008) the deal on file is not read: the client hears the consultation, as anyone does.
    for (const answer of ["booking", null]) {
      setPg(world(answer));
      forgetFeeds();
      assert.match(await ask(CLIENT), /^Ad management needs a consultation before it can be booked/, String(answer));
    }
  } finally {
    globalThis.fetch = realFetch;
    setPg(null);
    forgetFeeds();
  }
});
