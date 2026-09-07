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
import { parseIcs, filterOpenings, freeWindows, localToUtcMs, composeSystemPrompt } from "@chanlytics/contracts";
import { desiredVoiceShell, availabilityUrl, voiceLlmCreateBody } from "@chanlytics/channels";
import { readCode } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { matchService, spoken } = await import(pathToFileURL(path.join(here, "../../../apps/edge/api/retell-availability.ts")).href);

const TZ = "America/New_York";
const ny = (y, m, d, hh, mm = 0) => localToUtcMs(TZ, y, m, d, hh, mm);
const HORIZON = { from: ny(2026, 9, 1, 0), to: ny(2026, 10, 31, 0) };
const ics = (lines) => ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:x", ...lines, "END:VEVENT", "END:VCALENDAR"].join("\r\n");

test("a weekly series expands on its days, skips an EXDATE, and stops at COUNT", () => {
  const feed = parseIcs(ics([
    "DTSTART;TZID=America/New_York:20260908T140000",
    "DTEND;TZID=America/New_York:20260908T150000",
    "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=5",
    "EXDATE;TZID=America/New_York:20260915T140000",
  ]), TZ, { horizon: HORIZON });
  assert.equal(feed.recurringExpanded, 1);
  assert.equal(feed.skippedRecurring, 0);
  // Tue 8, Thu 10, (Tue 15 excluded), Thu 17, Tue 22 — five produced, four kept.
  assert.deepEqual(feed.busy.map((b) => b.start), [ny(2026, 9, 8, 14), ny(2026, 9, 10, 14), ny(2026, 9, 17, 14), ny(2026, 9, 22, 14)]);
  assert.equal(feed.busy[0].end - feed.busy[0].start, 3_600_000, "each occurrence keeps the event's length");
});

test("daily with INTERVAL and UNTIL; monthly on a day; yearly; the horizon bounds them", () => {
  const daily = parseIcs(ics([
    "DTSTART;TZID=America/New_York:20260901T090000",
    "DURATION:PT30M",
    "RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20260907",
  ]), TZ, { horizon: HORIZON });
  assert.deepEqual(daily.busy.map((b) => b.start), [ny(2026, 9, 1, 9), ny(2026, 9, 3, 9), ny(2026, 9, 5, 9), ny(2026, 9, 7, 9)], "UNTIL as a date includes that day");
  const monthly = parseIcs(ics([
    "DTSTART;TZID=America/New_York:20260815T120000",
    "DTEND;TZID=America/New_York:20260815T130000",
    "RRULE:FREQ=MONTHLY;BYMONTHDAY=15",
  ]), TZ, { horizon: HORIZON });
  assert.deepEqual(monthly.busy.map((b) => b.start), [ny(2026, 9, 15, 12), ny(2026, 10, 15, 12)], "before the horizon is not produced; the series itself started in August");
  const yearly = parseIcs(ics([
    "DTSTART;VALUE=DATE:20200925",
    "DTEND;VALUE=DATE:20200926",
    "RRULE:FREQ=YEARLY",
  ]), TZ, { horizon: HORIZON });
  assert.deepEqual(yearly.busy, [{ start: ny(2026, 9, 25, 0), end: ny(2026, 9, 26, 0) }], "an all-day yearly block lands on the day, in the zone");
});

test("a weekly series holds its wall-clock time across the DST change", () => {
  const feed = parseIcs(ics([
    "DTSTART;TZID=America/New_York:20261027T140000",
    "DTEND;TZID=America/New_York:20261027T150000",
    "RRULE:FREQ=WEEKLY",
  ]), TZ, { horizon: { from: ny(2026, 10, 20, 0), to: ny(2026, 11, 20, 0) } });
  const local = feed.busy.map((b) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(b.start)));
  assert.ok(local.every((t) => t === "2:00 PM"), local.join(", "));
  assert.equal(feed.busy.length, 4, "Oct 27, Nov 3 (after the clocks change), Nov 10, Nov 17");
});

test("a rule this parser does not read keeps its first occurrence and is counted", () => {
  const feed = parseIcs(ics([
    "DTSTART;TZID=America/New_York:20260909T100000",
    "DTEND;TZID=America/New_York:20260909T110000",
    "RRULE:FREQ=MONTHLY;BYDAY=2TU",
  ]), TZ, { horizon: HORIZON });
  assert.equal(feed.skippedRecurring, 1);
  assert.equal(feed.recurringExpanded, 0);
  assert.deepEqual(feed.busy, [{ start: ny(2026, 9, 9, 10), end: ny(2026, 9, 9, 11) }]);
});

test("the openings a caller asked about: one day by date or weekday, and only windows long enough", () => {
  const hours = { wed: { open: "09:30", close: "18:00" }, fri: { open: "09:30", close: "19:00" } };
  const now = new Date(ny(2026, 9, 9, 8));
  const all = freeWindows({ hours, tz: TZ, busy: [{ start: ny(2026, 9, 11, 12), end: ny(2026, 9, 11, 18, 30) }], rules: { lead_hours: 0, max_days_ahead: 3 }, now });
  assert.deepEqual(all.map((o) => o.weekday), ["wed", "fri"]);
  assert.deepEqual(filterOpenings(all, { day: "friday" }).map((o) => o.key), ["2026-09-11"]);
  assert.deepEqual(filterOpenings(all, { day: "2026-09-09" }).map((o) => o.key), ["2026-09-09"]);
  assert.deepEqual(filterOpenings(all, { day: "monday" }), [], "a day with nothing is nothing, not a guess");
  // Friday: 9:30–12:00 (150 min) and 18:30–19:00 (30 min). A 90-minute service fits only the morning.
  const fri = filterOpenings(all, { day: "fri", minMinutes: 90 })[0];
  assert.equal(fri.windows.length, 1);
  assert.equal(fri.windows[0].start, ny(2026, 9, 11, 9, 30));
  assert.deepEqual(filterOpenings(all, { day: "fri", minMinutes: 200 }), [], "nothing long enough is nothing");
});

test("the tool speaks one paragraph, names the service's length, and matches a service loosely", () => {
  const services = [{ name: "Balayage", duration_min: 180 }, { name: "Short haircut", duration_min: 60 }, { name: "Extensions", price_note: "by consultation" }];
  assert.equal(matchService(services, "balayage").name, "Balayage");
  assert.equal(matchService(services, "a haircut").name, "Short haircut", "either way round");
  assert.equal(matchService(services, "massage"), null);
  assert.equal(matchService(undefined, "Balayage"), null);
  const text = spoken("Open times (from the calendar):\n- Wednesday, September 9: 10:00 AM – 11:00 AM\n- Friday, September 11: 9:30 AM – 12:00 PM\nOffer up to three.", services[0]);
  assert.equal(text, "For Balayage (about 180 minutes): Open times (from the calendar): Wednesday, September 9: 10:00 AM – 11:00 AM Friday, September 11: 9:30 AM – 12:00 PM Offer up to three.");
  assert.ok(!spoken("x", null).startsWith("For "), "no length known, no preface");
});

test("the shell carries the tool beside the booking link, the edge guards it, and the phone prompt names it", () => {
  const d = desiredVoiceShell(undefined, { "x-fn-secret": "sealed" });
  const tool = d.general_tools.find((t) => t.name === "check_availability");
  assert.ok(tool, "on the shell");
  assert.equal(tool.url, "https://chanlytics-messaging.vercel.app/api/retell-availability");
  assert.deepEqual(tool.headers, { "x-fn-secret": "sealed" }, "same secret as the booking tool");
  assert.deepEqual(Object.keys(tool.parameters.properties).sort(), ["day", "service"]);
  assert.equal(availabilityUrl("https://preview.example/api/retell-fn"), "https://preview.example/api/retell-availability");
  const edge = readCode("apps/edge/api/retell-availability.ts");
  assert.ok(edge.includes('request.headers.get("x-fn-secret") !== process.env.RETELL_FN_SECRET'));
  assert.ok(edge.includes("filterOpenings(data.openings, { day, minMinutes: service?.duration_min ?? null })"));
  assert.ok(edge.includes("return json(200, { result: CANNOT_SEE })"), "a refusal is a sentence the agent speaks, never an error status");
  const brain = { business_name: "S", phone_display: "(646) 932-5775", booking_link: "https://booksy.com/x", system_prompt: "x".repeat(50), fallbacks: { greeting: "g", error: "e", non_text: "n" } };
  const voice = composeSystemPrompt(brain, { hours: { mon: { open: "09:00", close: "17:00" } } }, "voice");
  assert.ok(voice.includes("use check_availability before offering a time"));
  assert.ok(!composeSystemPrompt(brain, { hours: { mon: { open: "09:00", close: "17:00" } } }, "whatsapp").includes("check_availability"), "a phone tool, not a WhatsApp one");
  const created = voiceLlmCreateBody({ fnSecret: "sealed" }).general_tools.find((t) => t.name === "check_availability");
  assert.ok(created && created.url === "https://chanlytics-messaging.vercel.app/api/retell-availability", "provisioning creates it too");
});
