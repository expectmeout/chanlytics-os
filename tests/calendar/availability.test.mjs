/**
 * Read-only availability: the receptionist sees the calendar, follows the
 * booking rules, and only ever sends the link.
 *
 * The feed is what any booking tool writes into Google, Apple or Outlook —
 * Booksy Biz syncs two-way with both — read back by its private address.
 * Pure engine, so the fixtures here are the proof: line folding, zones,
 * all-day and cancelled events, the opening hours minus what is taken, the
 * buffer, the lead time, closures, the words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseIcs,
  freeWindows,
  describeOpenings,
  localToUtcMs,
  dayInZone,
  composeSystemPrompt,
  parseTenantConfigResult,
  TenantConfigWriteSchema,
} from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";

const TZ = "America/New_York";
const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:1",
  "DTSTART;TZID=America/New_York:20260909T110000",
  "DTEND;TZID=America/New_York:20260909T130000",
  "SUMMARY:Balayage — Dani",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:2",
  "DTSTART:20260909T190000Z",
  "DTEND:20260909T200000Z",
  "SUMMARY:Colour cor",
  " rection (folded)",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:3",
  "DTSTART;VALUE=DATE:20260910",
  "DTEND;VALUE=DATE:20260911",
  "SUMMARY:Training day",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:4",
  "DTSTART;TZID=America/New_York:20260909T150000",
  "DTEND;TZID=America/New_York:20260909T160000",
  "STATUS:CANCELLED",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:5",
  "DTSTART;TZID=America/New_York:20260911T100000",
  "DTEND;TZID=America/New_York:20260911T110000",
  "RRULE:FREQ=WEEKLY",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:6",
  "DTSTART;TZID=America/New_York:20260909T093000",
  "DURATION:PT30M",
  "TRANSP:TRANSPARENT",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

test("the feed: zones, folding, all-day, cancelled and free events, recurring counted", () => {
  const feed = parseIcs(ICS, TZ);
  assert.equal(feed.events, 6);
  assert.equal(feed.recurringExpanded, 1, "the weekly event is expanded inside the horizon");
  assert.equal(feed.skippedRecurring, 0);
  assert.ok(
    feed.busy.length >= 4,
    "two appointments, the training day, and the weekly occurrences; not the cancelled one, not the free one",
  );
  const ny = (h, m = 0) => localToUtcMs(TZ, 2026, 9, 9, h, m);
  assert.deepEqual(feed.busy[0], { start: ny(11), end: ny(13) }, "a TZID time is that zone's wall clock");
  assert.deepEqual(feed.busy[1], { start: ny(15), end: ny(16) }, "19:00Z is 3 PM in New York in September");
  assert.deepEqual(
    feed.busy[2],
    { start: localToUtcMs(TZ, 2026, 9, 10, 0, 0), end: localToUtcMs(TZ, 2026, 9, 11, 0, 0) },
    "an all-day event takes the whole local day",
  );
});

test("REGRESSION: a feed whose times name Windows' zones is read -- one weekly event from Outlook threw, and the whole calendar could not be read", () => {
  // Outlook and Exchange write a zone as Windows names it ("Eastern Standard Time"), which the clock does not know.
  // A single event fell back to the business's zone, right only when the two were the same; a recurring one handed the
  // name to the clock as it stepped the series, which threw, and a calendar with one weekly meeting read as nothing.
  const outlook = (...events) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flat(), "END:VCALENDAR"].join("\r\n");
  const at = { horizon: { from: Date.parse("2026-09-01T00:00:00Z"), to: Date.parse("2026-12-01T00:00:00Z") } };
  const weekly = outlook([
    "BEGIN:VEVENT",
    "UID:w1",
    "SUMMARY:Weekly meeting",
    'DTSTART;TZID="Eastern Standard Time":20260909T100000',
    'DTEND;TZID="Eastern Standard Time":20260909T110000',
    "RRULE:FREQ=WEEKLY;COUNT=10",
    "END:VEVENT",
  ]);
  const feed = parseIcs(weekly, TZ, at);
  assert.equal(feed.recurringExpanded, 1);
  assert.equal(feed.busy.length, 10);
  // Ten in the morning in New York each week: 14:00Z in September, 15:00Z once the clocks go back on 1 November.
  assert.equal(new Date(feed.busy[0].start).toISOString(), "2026-09-09T14:00:00.000Z");
  assert.equal(new Date(feed.busy[7].start).toISOString(), "2026-10-28T14:00:00.000Z");
  assert.equal(new Date(feed.busy[8].start).toISOString(), "2026-11-04T15:00:00.000Z");

  // A zone that is not the business's own is its own: nine in the morning in Los Angeles is noon in New York.
  const elsewhere = outlook([
    "BEGIN:VEVENT",
    "UID:p1",
    "SUMMARY:Call",
    "DTSTART;TZID=Pacific Standard Time:20260909T090000",
    "DTEND;TZID=Pacific Standard Time:20260909T093000",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:p2",
    "SUMMARY:Weekly call",
    "DTSTART;TZID=Pacific Standard Time:20260910T090000",
    "DTEND;TZID=Pacific Standard Time:20260910T093000",
    "RRULE:FREQ=WEEKLY;COUNT=2",
    "END:VEVENT",
  ]);
  const far = parseIcs(elsewhere, TZ, at);
  assert.deepEqual(
    far.busy.map((b) => new Date(b.start).toISOString()),
    ["2026-09-09T16:00:00.000Z", "2026-09-10T16:00:00.000Z", "2026-09-17T16:00:00.000Z"],
  );

  // A name nobody knows (a zone the sender made up) is the business's own clock, for a single event and a series:
  // the time is kept, and the calendar is read.
  const unknown = outlook([
    "BEGIN:VEVENT",
    "UID:u1",
    "SUMMARY:Standing",
    "DTSTART;TZID=Customized Time Zone:20260909T100000",
    "DTEND;TZID=Customized Time Zone:20260909T110000",
    "RRULE:FREQ=DAILY;COUNT=2",
    "END:VEVENT",
  ]);
  assert.deepEqual(
    parseIcs(unknown, TZ, at).busy.map((b) => new Date(b.start).toISOString()),
    ["2026-09-09T14:00:00.000Z", "2026-09-10T14:00:00.000Z"],
  );
  // The zone database's own names are read as they always were.
  const iana = outlook([
    "BEGIN:VEVENT",
    "UID:i1",
    "SUMMARY:Standing",
    "DTSTART;TZID=America/Chicago:20260909T100000",
    "DTEND;TZID=America/Chicago:20260909T110000",
    "RRULE:FREQ=DAILY;COUNT=1",
    "END:VEVENT",
  ]);
  assert.equal(new Date(parseIcs(iana, TZ, at).busy[0].start).toISOString(), "2026-09-09T15:00:00.000Z");
});

test("every Windows zone is read as a zone the clock knows, by its name in any case, and as the right one", async () => {
  const { zoneOfTzid } = await importSrc("packages/contracts/src/calendar/ics-zones.ts");
  // Windows' zones, as Windows names them (CLDR windowsZones): the list is stated here, apart from the table, so a
  // zone the table lacks and a row whose zone the clock does not read both fail. Either would be read as the
  // business's own zone, silently. "Nowhere/Nowhere" is the business's zone for the asking: no row may answer it.
  const WINDOWS = `
    Dateline Standard Time | UTC-11 | Aleutian Standard Time | Hawaiian Standard Time | Marquesas Standard Time
    Alaskan Standard Time | UTC-09 | Pacific Standard Time (Mexico) | UTC-08 | Pacific Standard Time
    US Mountain Standard Time | Mountain Standard Time (Mexico) | Mountain Standard Time | Yukon Standard Time
    Central America Standard Time | Central Standard Time | Easter Island Standard Time
    Central Standard Time (Mexico) | Canada Central Standard Time | SA Pacific Standard Time
    Eastern Standard Time (Mexico) | Eastern Standard Time | Haiti Standard Time | Cuba Standard Time
    US Eastern Standard Time | Turks And Caicos Standard Time | Paraguay Standard Time | Atlantic Standard Time
    Venezuela Standard Time | Central Brazilian Standard Time | SA Western Standard Time | Pacific SA Standard Time
    Newfoundland Standard Time | Tocantins Standard Time | E. South America Standard Time | SA Eastern Standard Time
    Argentina Standard Time | Greenland Standard Time | Montevideo Standard Time | Magallanes Standard Time
    Saint Pierre Standard Time | Bahia Standard Time | UTC-02 | Mid-Atlantic Standard Time | Azores Standard Time
    Cape Verde Standard Time | UTC | GMT Standard Time | Greenwich Standard Time | Sao Tome Standard Time
    Morocco Standard Time | W. Europe Standard Time | Central Europe Standard Time | Romance Standard Time
    Central European Standard Time | W. Central Africa Standard Time | Jordan Standard Time | GTB Standard Time
    Middle East Standard Time | Egypt Standard Time | E. Europe Standard Time | Syria Standard Time
    West Bank Standard Time | South Africa Standard Time | FLE Standard Time | Israel Standard Time
    South Sudan Standard Time | Kaliningrad Standard Time | Sudan Standard Time | Libya Standard Time
    Namibia Standard Time | Arabic Standard Time | Turkey Standard Time | Arab Standard Time | Belarus Standard Time
    Russian Standard Time | E. Africa Standard Time | Volgograd Standard Time | Iran Standard Time
    Arabian Standard Time | Astrakhan Standard Time | Azerbaijan Standard Time | Russia Time Zone 3
    Mauritius Standard Time | Saratov Standard Time | Georgian Standard Time | Caucasus Standard Time
    Afghanistan Standard Time | West Asia Standard Time | Ekaterinburg Standard Time | Pakistan Standard Time
    Qyzylorda Standard Time | India Standard Time | Sri Lanka Standard Time | Nepal Standard Time
    Central Asia Standard Time | Bangladesh Standard Time | Omsk Standard Time | Myanmar Standard Time
    SE Asia Standard Time | Altai Standard Time | W. Mongolia Standard Time | North Asia Standard Time
    N. Central Asia Standard Time | Tomsk Standard Time | China Standard Time | North Asia East Standard Time
    Singapore Standard Time | W. Australia Standard Time | Taipei Standard Time | Ulaanbaatar Standard Time
    Aus Central W. Standard Time | Transbaikal Standard Time | Tokyo Standard Time | North Korea Standard Time
    Korea Standard Time | Yakutsk Standard Time | Cen. Australia Standard Time | AUS Central Standard Time
    E. Australia Standard Time | AUS Eastern Standard Time | West Pacific Standard Time | Tasmania Standard Time
    Vladivostok Standard Time | Lord Howe Standard Time | Bougainville Standard Time | Russia Time Zone 10
    Magadan Standard Time | Norfolk Standard Time | Sakhalin Standard Time | Central Pacific Standard Time
    Russia Time Zone 11 | New Zealand Standard Time | UTC+12 | Fiji Standard Time | Chatham Islands Standard Time
    UTC+13 | Tonga Standard Time | Samoa Standard Time | Line Islands Standard Time`
    .split(/\s*[|\n]\s*/)
    .filter(Boolean);
  assert.equal(WINDOWS.length, 140);
  assert.equal(new Set(WINDOWS).size, WINDOWS.length);
  for (const windows of WINDOWS) {
    const zone = zoneOfTzid(windows, "Nowhere/Nowhere");
    assert.notEqual(zone, "Nowhere/Nowhere", `${windows}: no row, or a row whose zone the clock does not read`);
    assert.doesNotThrow(() => new Intl.DateTimeFormat("en-US", { timeZone: zone }), `${windows}: ${zone}`);
    assert.equal(zoneOfTzid(windows.toUpperCase(), "Nowhere/Nowhere"), zone, "by its name in any case");
    assert.equal(zoneOfTzid(` ${windows} `, "Nowhere/Nowhere"), zone, "and with the spaces a feed leaves round it");
  }
  // The right zone, not only a real one: noon there, as an instant, on a winter and a summer day.
  const noon = (windows, y, m, d) =>
    new Date(localToUtcMs(zoneOfTzid(windows, "Etc/UTC"), y, m, d, 12, 0)).toISOString().slice(11, 16);
  assert.equal(noon("Eastern Standard Time", 2026, 1, 15), "17:00");
  assert.equal(noon("Eastern Standard Time", 2026, 7, 15), "16:00");
  assert.equal(noon("Pacific Standard Time", 2026, 7, 15), "19:00");
  assert.equal(noon("Mountain Standard Time", 2026, 7, 15), "18:00");
  assert.equal(noon("US Mountain Standard Time", 2026, 7, 15), "19:00", "Arizona keeps one clock all year");
  assert.equal(noon("Central Standard Time", 2026, 1, 15), "18:00");
  assert.equal(noon("GMT Standard Time", 2026, 7, 15), "11:00", "London is an hour ahead in summer");
  assert.equal(noon("W. Europe Standard Time", 2026, 1, 15), "11:00");
  assert.equal(noon("India Standard Time", 2026, 1, 15), "06:30");
  assert.equal(noon("AUS Eastern Standard Time", 2026, 1, 15), "01:00", "Sydney's summer is January");
  assert.equal(noon("UTC", 2026, 1, 15), "12:00");
  // Neither Windows' name nor the database's: the business's own zone, never a throw.
  assert.equal(zoneOfTzid("Customized Time Zone", "America/Chicago"), "America/Chicago");
  assert.equal(zoneOfTzid(undefined, "America/Chicago"), "America/Chicago");
  assert.equal(zoneOfTzid("", "America/Chicago"), "America/Chicago");
  assert.equal(zoneOfTzid("Europe/Madrid", "America/Chicago"), "Europe/Madrid");
});

const hours = {
  wed: { open: "09:30", close: "18:00" },
  thu: { open: "09:30", close: "18:00" },
  fri: { open: "09:30", close: "19:00" },
  sun: {},
};

test("open windows: the hours minus what is taken, widened by the buffer, never before now plus the lead", () => {
  // Wednesday 9 September 2026, 8:00 AM New York.
  const now = new Date(localToUtcMs(TZ, 2026, 9, 9, 8, 0));
  const feed = parseIcs(ICS, TZ);
  const out = freeWindows({
    hours,
    closures: [],
    tz: TZ,
    busy: feed.busy,
    rules: { lead_hours: 2, buffer_min: 15, max_days_ahead: 3, slot_min: 30 },
    now,
  });
  assert.deepEqual(
    out.map((o) => o.key),
    ["2026-09-09", "2026-09-11"],
    "Thursday is the all-day training day; Friday is open",
  );
  const wed = out[0].windows.map((w) => describe(w));
  // 9:30 opens, but now + 2 h = 10:00; the balayage 11–13 is widened to 10:45–13:15; 15:00–16:00 becomes 14:45–16:15.
  assert.deepEqual(wed, ["10:00 AM – 10:45 AM", "1:15 PM – 2:45 PM", "4:15 PM – 6:00 PM"]);
  assert.equal(out[0].label, "Wednesday, September 9");
  function describe(w) {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
    return `${f.format(new Date(w.start))} – ${f.format(new Date(w.end))}`;
  }
});

test("REGRESSION (C5): the first open time is on the slot grid -- now plus the lead, to the minute, offered '1:29 PM'", () => {
  const at = (hh, mm, ss = 0) => new Date(localToUtcMs(TZ, 2026, 9, 9, hh, mm) + ss * 1000);
  const first = (now, rules) => {
    const out = freeWindows({
      hours: { wed: { open: "09:00", close: "18:00" } },
      tz: TZ,
      busy: [],
      rules: { lead_hours: 2, max_days_ahead: 1, ...rules },
      now,
    });
    return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(
      new Date(out[0].windows[0].start),
    );
  };
  assert.equal(first(at(11, 29, 37), { slot_min: 30 }), "1:30 PM", "REGRESSION: 1:29 PM, to the minute it was asked");
  assert.equal(first(at(11, 30), { slot_min: 30 }), "1:30 PM", "a time already on the grid stays");
  assert.equal(first(at(11, 30, 1), { slot_min: 30 }), "2:00 PM", "a second past the notice is past it");
  assert.equal(first(at(11, 29), { slot_min: 20 }), "1:40 PM", "twenty-minute slots: :00, :20, :40");
  assert.equal(
    first(at(11, 29), { slot_min: 45 }),
    "1:30 PM",
    "a slot that does not divide the hour rounds to the quarter",
  );
  assert.equal(first(at(8, 0), { slot_min: 30 }), "10:00 AM", "the day's own opening is untouched");
});

test("a closure removes the day; a window shorter than a slot is not offered; no zone guess", () => {
  const now = new Date(localToUtcMs(TZ, 2026, 9, 9, 8, 0));
  const closed = freeWindows({
    hours,
    closures: [{ date: "2026-09-09" }],
    tz: TZ,
    busy: [],
    rules: { max_days_ahead: 1 },
    now,
  });
  assert.deepEqual(closed, []);
  const tight = freeWindows({
    hours: { wed: { open: "09:30", close: "10:15" } },
    tz: TZ,
    busy: [],
    rules: { lead_hours: 0, slot_min: 60, max_days_ahead: 1 },
    now,
  });
  assert.deepEqual(tight, [], "45 minutes is not a 60-minute slot");
  assert.equal(dayInZone(TZ, now.getTime()).weekday, "wed", "9 September 2026 is a Wednesday");
});

test("the words: a few days, the windows on each, and the rule that the calendar decides", () => {
  const now = new Date(localToUtcMs(TZ, 2026, 9, 9, 8, 0));
  const out = freeWindows({
    hours,
    closures: [],
    tz: TZ,
    busy: parseIcs(ICS, TZ).busy,
    rules: { lead_hours: 2, max_days_ahead: 3 },
    now,
  });
  const text = describeOpenings(out, TZ, { hasBookingLink: true });
  assert.match(text, /^Open times \(from the calendar, checked just now/);
  assert.match(text, /- Wednesday, September 9: 10:00 AM – 11:00 AM, 1:00 PM – 3:00 PM, 4:00 PM – 6:00 PM/);
  assert.match(text, /Never confirm a slot yourself · the calendar decides\./);
  assert.match(
    describeOpenings([], TZ, { daysAhead: 14, hasBookingLink: true }),
    /nothing is open in the next 14 days/,
  );
});

test("under a booking hold the same times are offered, and only what follows them changes: a member of the team confirms, and the link is never sent or promised", () => {
  const now = new Date(localToUtcMs(TZ, 2026, 9, 9, 8, 0));
  const out = freeWindows({
    hours,
    closures: [],
    tz: TZ,
    busy: parseIcs(ICS, TZ).busy,
    rules: { lead_hours: 2, max_days_ahead: 3 },
    now,
  });
  const auto = describeOpenings(out, TZ, { hasBookingLink: true });
  const held = describeOpenings(out, TZ, { hasBookingLink: true, bookingHeld: true });
  const times = (text) => text.split("\n").slice(0, -1);
  assert.ok(times(auto).length > 1, "the world has windows to offer");
  assert.deepEqual(times(held), times(auto), "the heading and every window, word for word");
  assert.match(
    held,
    /\nOffer up to three of these that fit what they want, then say a member of the team will call or text them to confirm, and take their name\./,
  );
  const unsaid = (text) => text.replace(/never send or promise the booking link/gi, "");
  assert.doesNotMatch(unsaid(held), /booking link/i, "the one mention of the link forbids it");
  assert.equal(
    describeOpenings(out, TZ, { hasBookingLink: true, bookingHeld: false }),
    auto,
    "no hold is auto's words, byte for byte",
  );
  const none = describeOpenings([], TZ, { daysAhead: 14, hasBookingLink: true, bookingHeld: true });
  assert.match(none, /^Open times \(from the calendar\): nothing is open in the next 14 days\./);
  assert.doesNotMatch(unsaid(none), /booking link/i, "nothing open, and still no link");
  // A business with no link has nothing to hold back: it is told what it is told without one.
  assert.equal(
    describeOpenings(out, TZ, { hasBookingLink: false, bookingHeld: true }),
    describeOpenings(out, TZ, { hasBookingLink: false }),
  );
});

/* --------------------------------- config, composer, runtime, settings -- */

const brain = {
  business_name: "Marisa's Beauty Salon",
  phone_display: "(212) 555-0142",
  booking_link: "https://booksy.com/x",
  system_prompt: "x".repeat(50),
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
};

test("booking rules and the calendar feed are config the schemas accept, and the composer states the rules", () => {
  const cfg = {
    brain: {
      ...brain,
      profile: {
        hours,
        booking_rules: {
          lead_hours: 2,
          buffer_min: 15,
          consult_first: ["Color correction"],
          party_max: 4,
          notes: ["No chemical services after 4 PM"],
        },
      },
    },
    calendar: { ical_url: "webcal://calendar.google.com/calendar/ical/x/private-y/basic.ics" },
  };
  assert.equal(parseTenantConfigResult(cfg).ok, true);
  assert.equal(TenantConfigWriteSchema.safeParse(cfg).success, true);
  assert.equal(
    parseTenantConfigResult({ ...cfg, calendar: { ical_url: "not a url" } }).ok,
    false,
    "a feed address must be https or webcal",
  );
  const text = composeSystemPrompt(brain, cfg.brain.profile, "whatsapp");
  assert.ok(text.includes("Booking rules:\n- At least 2 hours' notice for any appointment."));
  assert.ok(text.includes("These need a consultation before they can be booked: Color correction."));
  assert.ok(text.includes("Up to 4 people per booking; larger groups go to a person."));
  assert.ok(text.includes("No chemical services after 4 PM"));
  // The email switch (Part 0 of the campaigns-on-every-channel spec): the strict schema takes it, and on it is one
  // line of the booking rules -- asked once when the link goes out, never insisted on.
  const askingRules = { ...cfg.brain.profile.booking_rules, ask_email: true };
  const asking = { ...cfg, brain: { ...cfg.brain, profile: { ...cfg.brain.profile, booking_rules: askingRules } } };
  assert.equal(TenantConfigWriteSchema.safeParse(asking).success, true, "the switch is a key the strict schema takes");
  const textAsking = composeSystemPrompt(brain, asking.brain.profile, "whatsapp");
  assert.ok(
    textAsking.includes(
      "- When you send the booking link and no email address is on file for them, ask once for their best email address, then move on. Never insist; thank them if they give one.",
    ),
  );
  assert.ok(
    !text.includes("ask once for their best email"),
    "off by default: the switch adds the line, nothing else does",
  );
  // The switch alone opens the block, and it is the block's one line; off, with no other rule set, there is no block.
  const alone = composeSystemPrompt(brain, { hours, booking_rules: { ask_email: true } }, "whatsapp");
  const at = alone.indexOf("Booking rules:\n");
  assert.ok(at >= 0, "the switch alone opens the block");
  const end = alone.indexOf("\n\n", at);
  assert.equal(
    alone.slice(at, end < 0 ? undefined : end),
    "Booking rules:\n- When you send the booking link and no email address is on file for them, ask once for their best email address, then move on. Never insist; thank them if they give one.",
  );
  assert.ok(
    !composeSystemPrompt(brain, { hours, booking_rules: { ask_email: false } }, "whatsapp").includes("Booking rules:"),
    "off, with no other rule, is no block at all",
  );
  assert.ok(
    text.includes("If open times are listed after these instructions, offer up to three that fit"),
    "both channels are told how to use the openings",
  );
  assert.ok(
    text.indexOf("If open times are listed") < text.indexOf("Rules you must follow"),
    "and the guardrails still come last",
  );
  // A call sends the link by WhatsApp alone, so a workspace with a WhatsApp line is told to send it (offersLinkOn), and one
  // without is told to take the details.
  assert.ok(
    composeSystemPrompt({ ...brain, whatsapp_line: "+12125550199" }, { hours }, "voice").includes(
      "If none are listed, do not guess at open times; send the link.",
    ),
  );
  assert.ok(
    composeSystemPrompt(brain, { hours }, "voice").includes(
      "then take their name, what they need, and where and when so the team can confirm one",
    ),
  );
});

/**
 * A feed with a weekly appointment from two days ahead: a parse expands it inside its horizon, so how many there are says
 * how far ahead it was parsed (13 within a season's 90 days, 17 for a workspace that books 120 days out).
 */
const WEEKLY_FEED = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:soon",
  "SUMMARY:Soon",
  "DTSTART:20260910T150000Z",
  "DTEND:20260910T160000Z",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:weekly",
  "SUMMARY:Weekly",
  "DTSTART:20260910T170000Z",
  "DTEND:20260910T180000Z",
  "RRULE:FREQ=WEEKLY",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

/** The feed read over a season: the one appointment, and the weekly one 13 times. */
const SEASON = { soon: 1, weekly: 13 };

/**
 * The edge's feed reads over a network the test scripts (`answers`, by address), with what each fetch was handed, and
 * its clock held at `NOW` until a test moves it. Every fetch the edge makes goes through channels' guarded fetcher,
 * which follows `globalThis.fetch` in a test process (calendar/_stand-in-network.mjs).
 */
async function edgeFeeds(t) {
  const { listFeedItems, forgetFeeds } = await importSrc("apps/edge/lib/calendar/availability.ts");
  forgetFeeds();
  const NOW = new Date("2026-09-08T16:00:00.000Z");
  t.mock.timers.enable({ apis: ["Date"], now: NOW.getTime() });
  const answers = new Map();
  const fetched = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    fetched.push({ url: String(url), signal: init?.signal ?? null });
    const a = answers.get(String(url));
    if (!a) throw new Error(`no route to ${url}`);
    return new Response(a.body ?? "", { status: a.status ?? 200, headers: { "content-type": "text/calendar" } });
  };
  t.after(() => {
    globalThis.fetch = realFetch;
    forgetFeeds();
  });
  /** How many of each appointment a read holds, by its uid. */
  const uids = (items) =>
    items
      ? Object.fromEntries(
          [...new Set(items.map((i) => i.uid))].map((u) => [u, items.filter((i) => i.uid === u).length]),
        )
      : null;
  return { listFeedItems, NOW, answers, fetched, uids };
}

test("the edge reads a feed once per five minutes, and a failed read is remembered as briefly", async (t) => {
  const { listFeedItems, NOW, answers, fetched, uids } = await edgeFeeds(t);
  const url = "https://cal.example/salon.ics";
  answers.set(url, { status: 500 });
  assert.equal(await listFeedItems("t-five", url, TZ, NOW), null, "a feed that did not answer is no appointments");
  answers.set(url, { body: WEEKLY_FEED });
  assert.equal(await listFeedItems("t-five", url, TZ, NOW), null, "the failure is kept: one broken feed is one wait");
  assert.equal(fetched.length, 1, "and not asked again");
  t.mock.timers.tick(5 * 60_000 - 1);
  assert.equal(await listFeedItems("t-five", url, TZ, NOW), null, "still within the five minutes");
  t.mock.timers.tick(1);
  assert.deepEqual(uids(await listFeedItems("t-five", url, TZ, NOW)), SEASON, "five minutes on, read again");
  assert.equal(fetched.length, 2);
  await listFeedItems("t-five", url, TZ, NOW);
  assert.equal(fetched.length, 2, "and that read is kept for the next five");
});

test("the address is part of the cache's key: an owner who corrects the link is answered from the new calendar at once", async (t) => {
  // Keyed on the workspace ALONE, an owner correcting a wrong feed address was not a cache miss: the receptionist
  // answered from the old calendar, and a cached failure kept a fixed address reading as broken, for five minutes.
  const { listFeedItems, NOW, answers, fetched, uids } = await edgeFeeds(t);
  const wrong = "https://cal.example/wrong.ics";
  const right = "https://cal.example/right.ics";
  answers.set(wrong, { status: 404 });
  answers.set(right, { body: WEEKLY_FEED });
  assert.equal(await listFeedItems("t-key", wrong, TZ, NOW), null);
  assert.deepEqual(uids(await listFeedItems("t-key", right, TZ, NOW)), SEASON, "the corrected address is read now");
  assert.deepEqual(
    fetched.map((f) => f.url),
    [wrong, right],
  );
  assert.deepEqual(
    uids(await listFeedItems("t-other", right, TZ, NOW)),
    SEASON,
    "another workspace with the same link is its own read",
  );
  assert.equal(fetched.length, 3);
});

test("a feed is parsed on the terms it was asked for: one fetch, a second horizon parsed again, the same terms handed the same parse", async (t) => {
  const { listFeedItems, NOW, answers, fetched, uids } = await edgeFeeds(t);
  const url = "https://cal.example/terms.ics";
  answers.set(url, { body: WEEKLY_FEED });
  const near = await listFeedItems("t-terms", url, TZ, NOW, 14);
  assert.deepEqual(uids(near), SEASON, "a season: 90 days ahead");
  assert.deepEqual(
    uids(await listFeedItems("t-terms", url, TZ, NOW, 120)),
    { soon: 1, weekly: 17 },
    "a workspace that books 120 days out is parsed to its horizon, never handed the first caller's",
  );
  assert.equal(fetched.length, 1, "from the one fetch");
  const again = await listFeedItems("t-terms", url, TZ, NOW, 120);
  assert.equal(again, await listFeedItems("t-terms", url, TZ, NOW, 120), "the same terms: the parse kept");
  assert.notEqual(
    await listFeedItems("t-terms", url, "Europe/London", NOW, 120),
    again,
    "another zone is another parse",
  );
  assert.equal(fetched.length, 1);
});

test("a webcal:// address is fetched as https://, and a feed that does not answer is given up after six seconds", async (t) => {
  const { listFeedItems, NOW, answers, fetched, uids } = await edgeFeeds(t);
  answers.set("https://cal.example/apple.ics", { body: WEEKLY_FEED });
  const asked = [];
  const timeout = AbortSignal.timeout;
  t.after(() => {
    AbortSignal.timeout = timeout;
  });
  const stop = new AbortController();
  AbortSignal.timeout = (ms) => {
    asked.push(ms);
    return stop.signal;
  };
  assert.deepEqual(uids(await listFeedItems("t-webcal", "webcal://cal.example/apple.ics", TZ, NOW)), SEASON);
  assert.deepEqual(
    fetched.map((f) => f.url),
    ["https://cal.example/apple.ics"],
    "https in a hat",
  );
  assert.deepEqual(asked, [6000], "six seconds");
  assert.equal(fetched[0].signal, stop.signal, "and the fetch is the one that stops");
});

test("both receptionists are told what the calendar says: the runtime carries the workspace's feed, and a text's turn its openings after the clock and its visits with who they are", async () => {
  const { loadTenantRuntime } = await importSrc("apps/edge/lib/shared/tenant-runtime.ts");
  const { runtime, text, world } = await import("../inbound/_world.mjs");
  const { fakeDb } = await import("../_fake-db.mjs");
  const tenant = "aaaaaaaa-aaaa-4aaa-8aaa-00000000ca1e";
  const calendar = { ical_url: "https://cal.example/salon.ics" };
  const db = fakeDb(
    {
      tenant_channels: [
        {
          id: "ch-cal",
          tenant_id: tenant,
          kind: "whatsapp",
          external_id: "wa-cal",
          number_e164: "+13055550188",
          credentials_ref: null,
          config: {},
          status: "active",
        },
      ],
      tenant_config: [
        {
          tenant_id: tenant,
          config: {
            brain: {
              business_name: "Harbor",
              system_prompt: "Answer as the front desk of Harbor: brief and warm, and never guess a price.",
              fallbacks: { greeting: "g", error: "e", non_text: "n" },
            },
            calendar,
          },
        },
      ],
      policies: [],
      tenants: [{ id: tenant, name: "Harbor", timezone: TZ, status: "active" }],
      google_listings: [],
      contacts: [],
      conversations: [],
      messages: [],
    },
    {},
    { runtime_stamp: () => "stamp-cal" },
  );
  const routed = { tenantId: tenant, channelId: "ch-cal", kind: "whatsapp", credentialsRef: null };
  assert.deepEqual((await loadTenantRuntime(db, routed)).calendar, calendar, "the runtime carries the feed it names");

  const OPENINGS = "Open times (from the calendar): Wed Sep 9: 9:00 AM – 11:00 AM.";
  const VISITS = "Their next appointment: Thu Sep 10, 11:00 AM.";
  let asked = null;
  const visitsAsked = [];
  const ports = {
    leads: {
      read: async () => ({ name: "Dana Ruiz" }),
      personReplyMode: async () => null,
    },
    calendar: {
      openings: async () => OPENINGS,
      visits: async (_rt, who) => {
        visitsAsked.push(who);
        return VISITS;
      },
    },
    brain: async () => ({
      generateReply: async (a) => {
        asked = a;
        return {
          text: "We have Wednesday at 9.",
          escalate: false,
          meta: { confidence: 0.95 },
          usage: { input_tokens: 9 },
        };
      },
    }),
  };
  await world({ env: { modelKey: "sk-test" }, rt: runtime({ calendar, timezone: TZ }) }).run(
    text("anything open this week?"),
    ports,
  );
  assert.ok(asked, "the model was asked");
  const [clock, openings] = asked.nowNote.split("\n\n");
  assert.equal(openings, OPENINGS, "the openings ride after the clock");
  assert.ok(clock.length > 0 && !clock.includes("Open times"), "the business's clock first");
  assert.ok(!asked.systemPrompt.includes(OPENINGS), "never in the cached system prompt, where five minutes is stale");
  assert.deepEqual(visitsAsked, [{ phone: "+13055550100", name: "Dana Ruiz" }], "their visits, asked by who they are");
  const [who, visits] = asked.leadNote.split("\n");
  assert.deepEqual([who.length > 0, visits], [true, VISITS], "and told after who they are");
  // The phone's openings ride inside business_facts, and the facts rule from voice-parity: run in call-start.test.mjs.
});

// Settings collects the rules and the feed, and the feed address is whole only for an owner. The rules and the feed are
// folds of the Business page (Task 3.7 deleted the form), and each patches only its own keys, run in
// receptionist/business-tab/folds/what-each-fold-owns-and-saves.test.mjs: the rules fold writes each rule in its range
// and keeps the rest, and emptying the fold's own keys takes booking_rules with it (pinned here as folds.ts's text until
// 26 Nov 2026). The row that states the feed and the sentence that it is only ever read are run in
// receptionist/business-tab/open/. The feed address whole for an owner and masked for anyone else is run through the
// route in settings-routes.test.mjs ("the settings read") and through its reader in ask/readers/.
