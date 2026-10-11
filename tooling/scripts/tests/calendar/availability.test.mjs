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
import { importSrc, readCode, readRaw } from "../_source.mjs";

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
  assert.match(text, /Never confirm a slot yourself; the calendar decides\./);
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

test("the edge reads the feed once per five minutes and tells both receptionists, after the clock", () => {
  const lib = readRaw("apps/edge/lib/calendar/availability.ts"); // raw: a regex with // in it is not a comment
  assert.ok(lib.includes("const CACHE_MS = 5 * MIN_MS;"));
  assert.ok(lib.includes("AbortSignal.timeout(FETCH_TIMEOUT_MS)"));
  assert.ok(lib.includes('u.replace(/^webcal:\\/\\//i, "https://")'));
  assert.ok(
    lib.includes("feeds.set(key, { text, at, parsed: null, tz, daysAhead });"),
    "a failure is cached briefly too",
  );
  assert.ok(
    lib.includes("if (hit?.parsed && sameTerms(hit)) return hit.parsed;"),
    "parsed once per fetch, on the terms it was asked for",
  );
  // Keyed on the workspace ALONE, an owner correcting a wrong feed address was
  // not a cache miss: the receptionist answered from the old calendar, and a
  // cached failure kept a fixed address reading as broken, for five minutes.
  assert.ok(lib.includes("const cacheKey = (tenantId: string, url: string) =>"), "the address is part of the key");
  assert.ok(
    lib.includes("c.text === text && c.tz === tz && c.daysAhead === daysAhead"),
    "and the horizon is part of the parse's",
  );
  const rt = readCode("apps/edge/lib/tenant-runtime.ts");
  assert.ok(rt.includes("calendar: parsed?.calendar ?? null,"));
  const wa = readCode("packages/core/src/inbound/model-turn.ts");
  assert.ok(wa.includes("const openings = rt ? await ports.calendar.openings(rt) : null;"));
  assert.ok(wa.includes('${openings ? `\\n\\n${openings}` : ""}'), "after describeNow, in the uncached block");
  // The phone's openings ride inside business_facts, and the facts rule from
  // voice-parity: run, not read, in call-start.test.mjs.
});

test("Settings collects the rules and the feed; the feed address is whole only for an owner", () => {
  // The rules and the feed are folds of the Business page now (Task 3.7 deleted the form), and each patches only its
  // own keys. What each writes, the row that states the feed and the sentence that it is only ever read are EXECUTED
  // in business-tab-folds.test.mjs and business-tab-open.test.mjs, so four pins that were here are gone.
  const page = readRaw("apps/dashboard/src/surfaces/settings/business/folds.ts");
  assert.ok(page.includes('btPutProfile(next, "booking_rules", Object.keys(rules).length ? rules : undefined);'));
  // The feed address whole for an owner and masked for anyone else is RUN: through the route in settings-routes.test.mjs
  // ("the settings read") and through its reader in readers.test.mjs, so the two pins on the route's text are gone.
});
