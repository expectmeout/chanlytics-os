/**
 * No number about the calendar is computed over less than the whole
 * workspace -- executed.
 *
 * The playbook chips' pools, counted on the server over every person (page
 * after page) with their visits, by the runner's own predicate, and served
 * by GET playbooks; the runner's own read of People, paged the same way; the
 * hourly sweep's library putting the feed's people in People; the openings
 * the palette answers with, and its route; the booking report's asked and
 * booked. All over a database in memory and a scripted network.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { forgetFeeds, openingsFor } = await import(at("apps/dashboard/src/server/ask/openings.ts"));
const { bookingReport } = await import(at("apps/dashboard/src/server/calendar.ts"));
const { triggerPools } = await import(at("apps/dashboard/src/server/playbooks.ts"));
// everyone() lives beside listPeople now: every read that means the whole
// workspace goes through it, not just the pool a playbook run picks from.
const { everyone, PEOPLE_PAGE } = await import(at("apps/dashboard/src/server/people.ts"));
const playbooksRoute = await import(at("apps/dashboard/app/api/v1/playbooks/route.ts"));
const openingsRoute = await import(at("apps/dashboard/app/api/v1/ask/openings/route.ts"));
const { allPeople } = await import(at("apps/edge/lib/playbooks.ts"));
const { addPeopleFromCalendar } = await import(at("apps/edge/lib/calendar-people.ts"));
const { feedItemsFor, forgetFeeds: forgetEdgeFeeds } = await import(at("apps/edge/lib/availability.ts"));

const TZ = "America/New_York";
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = new Date("2026-09-08T16:00:00.000Z"); // Tuesday noon in New York
const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();

const realFetch = globalThis.fetch;
let answers = new Map();
let fetched = [];
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  const a = answers.get(String(url));
  if (!a) throw new Error(`no route to ${url}`);
  return new Response(a.body, { status: a.status ?? 200, headers: { "content-type": "text/calendar" } });
};
after(() => { globalThis.fetch = realFetch; });
beforeEach(() => { forgetFeeds(); forgetEdgeFeeds(); answers = new Map(); fetched = []; setRateStore(memoryStore()); });

const profile = { hours: { mon: { open: "09:00", close: "18:00" }, tue: { open: "09:00", close: "18:00" }, wed: { open: "09:00", close: "18:00" }, thu: { open: "09:00", close: "18:00" }, fri: { open: "09:00", close: "18:00" }, sat: {}, sun: {} }, closures: [], services: [{ name: "Balayage", duration_min: 90 }], booking_rules: { lead_hours: 2, max_days_ahead: 14, slot_min: 30 } };
const config = (url) => ({ ...(url ? { calendar: { ical_url: url } } : {}), brain: { business_name: "Harbor", booking_link: "https://book.example/harbor", system_prompt: "Answer as the front desk of Harbor: brief, warm, and never a price or a booking.", fallbacks: { greeting: "g", error: "e", non_text: "n" }, profile } });
const tables = (url, role = "owner", extra = {}) => ({
  memberships: [{ user_id: "u1", tenant_id: T, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" }],
  tenants: [{ id: T, slug: "harbor", name: "Harbor", status: "active", timezone: TZ }],
  tenant_config: [{ tenant_id: T, config: config(url) }],
  policies: [], playbooks: [], broadcasts: [], broadcast_recipients: [], templates: [],
  ...extra,
});
/** A person who said yes to offers and can be texted; `n` numbers their phone. */
const person = (n, over = {}) => ({
  id: `p${n}`, display_name: `Person ${n}`, wa_profile_name: null, phone_e164: `+1917555${String(n).padStart(4, "0")}`,
  consent: "opted_in", consent_source: "customer_message", marketing_consent: "opted_in", dnc: false, has_chat: true, has_call: false,
  first_seen_at: iso(NOW.getTime() - 60 * DAY), last_seen_at: iso(NOW.getTime() - 40 * DAY), last_inbound_at: iso(NOW.getTime() - 40 * DAY), latest_wa_inbound_at: iso(NOW.getTime() - 40 * DAY),
  latest_conversation_id: `c${n}`, conversation_count: 1, ...over,
});
/** people_list as the database answers it: a page of at most PEOPLE_PAGE, from an offset. */
const pagedList = (all) => (args) => {
  const offset = args.p_offset ?? 0;
  const limit = args.p_limit ?? PEOPLE_PAGE;
  return all.slice(offset, offset + limit);
};
const ctxFor = (t, rpcs = {}) => ({ supabase: fakeDb(t, {}, rpcs), userId: "u1", email: "ada@example.com", params: {} });

test("everyone: the people come page after page, never one page of them", async () => {
  const all = Array.from({ length: PEOPLE_PAGE + 3 }, (_, i) => person(i + 1));
  const calls = [];
  const ctx = ctxFor(tables(null), { people_list: (a) => { calls.push(a); return pagedList(all)(a); } });
  const rows = await everyone(ctx, T);
  assert.equal(rows.length, PEOPLE_PAGE + 3);
  assert.equal(calls.length, 2, "two pages: the full one, then the short one that ends it");
  assert.deepEqual(calls[0], { p_tenant_id: T }, "the first page asks as it always has: a database without 00112 still answers");
  assert.deepEqual(calls[1], { p_tenant_id: T, p_offset: PEOPLE_PAGE }, "the second names its offset");
});

test("the pools: counted over everyone by the runner's predicate; the week's touches hold, never hide; the chip's number is the route's", async () => {
  const all = Array.from({ length: PEOPLE_PAGE + 3 }, (_, i) => person(i + 1));
  all[0].marketing_consent = "unknown"; // one who never said yes
  all[1].dnc = true; // one who asked to stop
  const touched = { p3: iso(NOW.getTime() - 2 * DAY), p4: iso(NOW.getTime() - 3 * DAY) };
  const ctx = ctxFor(tables(null), { people_list: pagedList(all) });
  const { pools, calendar } = await triggerPools(ctx, T, touched, NOW);
  assert.equal(calendar, "none");
  assert.equal(pools.everyone_monthly.candidates, PEOPLE_PAGE + 3 - 2 - 2, "everyone who said yes and may be texted, past the first page, less the two reached this week");
  assert.equal(pools.everyone_monthly.held, 2, "the two wait for the week's breath: held, not hidden");
  assert.deepEqual(Object.keys(pools).sort(), ["everyone_monthly", "new_week", "phoned_only", "quiet_30", "visit_tomorrow", "visited"]);
  assert.equal(pools.visit_tomorrow.candidates, 0, "no calendar, nobody has a visit tomorrow");

  // The route hands the same numbers to the page.
  const out = await playbooksRoute.GET.run(new Request(`http://localhost/api/v1/playbooks?workspace=${T}`), ctxFor(tables(null, "owner", { broadcasts: [{ id: "b1", tenant_id: T, state: "sent", playbook_id: null, scheduled_for: iso(NOW.getTime() - 2 * DAY), created_at: iso(NOW.getTime() - 2 * DAY) }], broadcast_recipients: [{ tenant_id: T, broadcast_id: "b1", contact_id: "p3", state: "sent", sent_at: iso(NOW.getTime() - 2 * DAY) }] }), { people_list: pagedList(all) }));
  assert.equal(out.calendar, "none");
  assert.equal(out.pools.everyone_monthly.candidates, PEOPLE_PAGE + 3 - 2 - 1, "one reached by a broadcast this week, the route's own reading of the recipient rows");
  assert.equal(out.pools.everyone_monthly.held, 1);
});

test("with a calendar, a visit tomorrow is counted from the feed, over everyone", async () => {
  const url = "https://cal.example/visits.ics";
  answers.set(url, { body: ["BEGIN:VCALENDAR",
    "BEGIN:VEVENT", "UID:v1", "SUMMARY:Person 2 · Balayage", "DESCRIPTION:+1 917 555 0002", "DTSTART;TZID=America/New_York:20260909T140000", "DTEND;TZID=America/New_York:20260909T153000", "END:VEVENT",
    "BEGIN:VEVENT", "UID:v2", "SUMMARY:Person 1 · Cut", "DESCRIPTION:+1 917 555 0001", "DTSTART;TZID=America/New_York:20260911T100000", "DTEND;TZID=America/New_York:20260911T110000", "END:VEVENT",
    "END:VCALENDAR"].join("\r\n") });
  const all = [person(1), person(2), person(3)];
  const ctx = ctxFor(tables(url), { people_list: pagedList(all) });
  const { pools, calendar } = await triggerPools(ctx, T, {}, NOW);
  assert.equal(calendar, "ok");
  assert.equal(pools.visit_tomorrow.candidates, 1, "Person 2 is on the calendar tomorrow; Person 1 on Friday is not");
});

test("the runner's own read of People pages the same way, and a refused page is an error, not a short pool", async () => {
  const all = Array.from({ length: 1000 + 2 }, (_, i) => person(i + 1));
  const calls = [];
  const db = fakeDb({}, {}, { people_list: (a) => { calls.push(a); const o = a.p_offset ?? 0; return all.slice(o, o + (a.p_limit ?? 1000)); } });
  const got = await allPeople(db, T);
  assert.equal(got.error, null);
  assert.equal(got.data.length, 1002);
  assert.deepEqual(calls.map((c) => c.p_offset ?? 0), [0, 1000]);
  const refusing = fakeDb({}, {}, { people_list: (a) => { if (a.p_offset) { const e = new Error("function people_list(uuid, integer, integer) does not exist"); e.code = "PGRST202"; throw e; } return all.slice(0, 1000); } });
  const short = await allPeople(refusing, T);
  assert.equal(short.data, null, "a second page the database cannot answer is an error the sweep sees, never a thousand people counted as everyone");
  assert.match(short.error.message, /does not exist/);
});

test("the sweep's library: a person the feed names is made once, a name fills only an empty one, and each person made gets their event", async () => {
  const db = fakeDb({ contacts: [{ id: "k1", tenant_id: T, phone_e164: "+19175550001", display_name: null, erased_at: null, merged_into_contact_id: null }], events: [] });
  const r = await addPeopleFromCalendar(db, T, [
    { phone: "+19175550001", name: "Ana Ruiz", title: "Ana Ruiz · Balayage", uid: "v1", start: NOW.getTime() + DAY },
    { phone: "+19175550002", name: "Bo Chen", title: "Bo Chen · Cut", uid: "v2", start: NOW.getTime() + 2 * DAY },
  ]);
  assert.deepEqual(r, { seen: 2, added: 1, named: 1 });
  const first = (s) => (Array.isArray(s.values) ? s.values[0] : s.values);
  const contacts = db.seen.filter((s) => s.table === "contacts");
  assert.ok(contacts.some((s) => s.op === "update" && first(s).display_name === "Ana Ruiz"), "the known number is named, not made again");
  assert.ok(contacts.some((s) => s.op === "insert" && first(s).phone_e164 === "+19175550002" && first(s).display_name === "Bo Chen"), "the new number is made");
  const ev = db.seen.find((s) => s.table === "events" && s.op === "insert");
  assert.equal(first(ev).kind, "contact.added");
  assert.deepEqual(first(ev).data, { source: "calendar", title: "Bo Chen · Cut", uid: "v2", start: iso(NOW.getTime() + 2 * DAY) });
});

test("the edge reads the feed by the same address rule: a private address is never fetched, a good one is parsed once", async () => {
  assert.equal(await feedItemsFor(T, "http://10.0.0.9/cal.ics", TZ, NOW), null);
  assert.equal(fetched.length, 0, "never fetched");
  forgetEdgeFeeds(); // the refusal was remembered for the tenant, as a failure is
  const url = "https://cal.example/edge.ics";
  answers.set(url, { body: ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:e1", "SUMMARY:One", "DTSTART;TZID=America/New_York:20260909T140000", "DTEND;TZID=America/New_York:20260909T150000", "END:VEVENT", "END:VCALENDAR"].join("\r\n") });
  const items = await feedItemsFor(T, url, TZ, NOW);
  assert.equal(items.length, 1);
  await feedItemsFor(T, url, TZ, NOW);
  assert.equal(fetched.length, 1, "one fetch within the cache");
});

test("the openings the palette answers with, and its route: no calendar, a calendar that cannot be read, and the windows of a day", async () => {
  const none = await openingsFor(ctxFor(tables(null)), T, { day: null, service: null }, NOW);
  assert.equal(none.state, "no_calendar");
  const url = "https://cal.example/open.ics";
  answers.set(url, { body: "nope", status: 404 });
  const down = await openingsFor(ctxFor(tables(url)), T, { day: null, service: null }, NOW);
  assert.deepEqual([down.state, down.text], ["unavailable", "The calendar could not be read right now."]);
  forgetFeeds();
  answers.set(url, { body: ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:o1", "SUMMARY:Taken", "DTSTART;TZID=America/New_York:20260909T090000", "DTEND;TZID=America/New_York:20260909T120000", "END:VEVENT", "END:VCALENDAR"].join("\r\n") });
  const wed = await openingsFor(ctxFor(tables(url)), T, { day: "2026-09-09", service: "Balayage" }, NOW);
  assert.equal(wed.state, "ok");
  assert.equal(wed.days.length, 1);
  assert.deepEqual(wed.days[0].windows, ["12:00 PM–6:00 PM"], "the morning is taken; the afternoon is open");
  assert.match(wed.text, /^For Balayage \(about 90 minutes\): /);
  // The route reads with the real clock, so the day above is in its past; what it proves is the door and the shape.
  const viaRoute = await openingsRoute.GET.run(new Request(`http://localhost/api/v1/ask/openings?workspace=${T}&service=Balayage`), ctxFor(tables(url)));
  assert.equal(viaRoute.openings.state, "ok");
  assert.deepEqual([viaRoute.openings.tz, viaRoute.openings.service?.name], [TZ, "Balayage"]);
  assert.ok(Array.isArray(viaRoute.openings.days));
});

test("the booking report: asked, then booked, over the rows given and the feed's visits", async () => {
  const url = "https://cal.example/report.ics";
  answers.set(url, { body: ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:r1", "SUMMARY:Person 1 · Cut", "DESCRIPTION:+1 917 555 0001", "DTSTART;TZID=America/New_York:20260910T100000", "DTEND;TZID=America/New_York:20260910T110000", "END:VEVENT", "END:VCALENDAR"].join("\r\n") });
  const rows = [
    person(1, { last_inbound_at: iso(NOW.getTime() - 3 * DAY) }), // wrote three days ago, booked Thursday
    person(2, { last_inbound_at: iso(NOW.getTime() - 5 * DAY) }), // wrote, no booking
    person(3, { last_inbound_at: iso(NOW.getTime() - 60 * DAY) }), // wrote long before the period
  ];
  const report = await bookingReport(ctxFor(tables(url)), T, rows, 30, NOW);
  assert.deepEqual(report, { calendar: "ok", days: 30, asked: 2, booked: 1 });
});
