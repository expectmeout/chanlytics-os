/**
 * A time asked for on a form (00688; the Forms plan, F3; Ruben's call 8), as a visitor meets it, run as the app serves
 * it over a database in memory: the form's "when" question follows the business's own booking setting, the one AI
 * follows in a chat. A business that confirms its own bookings shows its real open times and takes a picked one as the
 * same request a chat opens, held for it; one that offers its own booking page sends people there and counts the open;
 * any other asks the question as the form wrote it.
 *
 * The plan's "done when" lines lead: two people who ask for the same time are two requests; a time taken since the
 * page was drawn, or too short for the service picked, draws the form again with what is open now and nothing lost;
 * the form never offers "Book now" and never says a time is booked.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { A, consultForm, emailWire, formWorld } from "../_form-requests.mjs";
import { formTimeDoors } from "./_doors.mjs";
import { localToUtcMs } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const name of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[name];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setLinkPageClient } = await import(at("apps/dashboard/src/server/public/link-page.ts"));
const { drawFormPage, takeFormPost } = await import(at("apps/dashboard/src/server/public/form-page.ts"));
const { sendToBookingPage } = await import(at("apps/dashboard/src/server/public/form-book.ts"));
const { forgetFeeds } = await import(at("apps/dashboard/src/server/calendar/openings.ts"));
const { getEmailWire } = await import(at("apps/dashboard/src/server/connections/email-readiness.ts"));

const wire = emailWire(getEmailWire);
/** The business's calendar, as its link answers: nothing taken on it (every open hour is free), or away. */
let calendar = "open";
const OPEN_CALENDAR = ["BEGIN:VCALENDAR", "END:VCALENDAR"].join("\r\n");
const network = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith("https://cal.example/")) return network(url, init);
  if (calendar === "away") throw new Error("the calendar is away");
  return new Response(OPEN_CALENDAR, { status: 200, headers: { "content-type": "text/calendar" } });
};
after(() => {
  globalThis.fetch = network;
  wire.undo();
});
beforeEach(async () => {
  setRateStore(memoryStore());
  forgetFeeds();
  calendar = "open";
  await wire.says(true);
});

const ADDRESS = "https://app.chanlytics.com/b/luma-salon/colour-consultation";
const BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 350.0";
const HOUR_MS = 3_600_000;
const nobody = async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } });

/** Open every day nine to five; a balayage takes two hours. */
const DAILY = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, { open: "09:00", close: "17:00" }]),
);
const PROFILE = {
  hours: DAILY,
  closures: [],
  booking_rules: { lead_hours: 2, max_days_ahead: 14, slot_min: 60 },
  services: [
    { name: "Balayage", duration_min: 120 },
    { name: "Gloss", duration_min: 60 },
  ],
};

/** The salon's form, asking which service and when they would like to come. */
const TIMED = consultForm({
  fields: [
    ...consultForm().fields,
    {
      id: "f6serv",
      kind: "service",
      label: "Which service?",
      needed: false,
      choices: [
        { id: "s1", label: "Balayage" },
        { id: "s2", label: "Gloss" },
      ],
    },
    {
      id: "f7when",
      kind: "when",
      label: "When would you like to come?",
      needed: true,
      choices: [
        { id: "w1", label: "Mornings" },
        { id: "w2", label: "Saturdays" },
      ],
    },
  ],
});

/**
 * The salon's world with how it takes bookings: `requests` (its switch on, no booking page: it confirms its own),
 * `page` (a booking page it offers), or `neither`.
 */
function world(way = "requests", more = {}) {
  const brain = {
    business_name: "Luma Salon",
    system_prompt: "Answer as the front desk of Luma Salon, warmly and briefly.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
    profile: PROFILE,
    ...(way === "page" ? { booking_link: "https://book.example/luma" } : {}),
  };
  const config = {
    brain,
    calendar: { ical_url: "https://cal.example/luma.ics" },
    features: { booking_requests: way === "requests" },
  };
  const made = formWorld({
    description: TIMED,
    more: { tenant_config: [{ tenant_id: A, config }], policies: [], appointments: [], ...more },
    rpcs: (tables, doors, clock) => formTimeDoors(tables, doors, { clock }),
  });
  setLinkPageClient(made.db);
  return made;
}

const get = (query = "") =>
  drawFormPage("luma-salon", "colour-consultation", new Request(`${ADDRESS}${query}`), nobody);

/** The values a drawn page carries unseen, read back as a browser would send them. */
const carriedOf = (html) =>
  Object.fromEntries(
    [...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map((m) => [m[1], m[2]]),
  );
/** The times a drawn page offers, as the slots their presses send. */
const slotsOf = (html) => [...html.matchAll(/name="a\.f7when" value="(\d{4}-\d\d-\d\d \d\d:\d\d)"/g)].map((m) => m[1]);

/** A slot's start, on the salon's clock. */
const startOf = (slot) => {
  const [y, m, d, hh, mm] = slot.split(/\D/).map(Number);
  return localToUtcMs("America/New_York", y, m, d, hh, mm);
};

/** A send as the page's own form makes it, carrying what the page carried. */
async function send(answers, carried) {
  // Ten seconds after the page was drawn: a person typing, never too fast.
  const body = new URLSearchParams({ ...carried, t: String(Date.now() - 10_000) });
  for (const [name, value] of Object.entries(answers)) body.append(name, value);
  return takeFormPost(
    "luma-salon",
    "colour-consultation",
    new Request(ADDRESS, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
    nobody,
  );
}

const ANA = { "a.f1name": "Ana Ruiz", "a.f2mail": "ana@example.com", "a.f4want": "A warm, soft blonde." };
const BEA = { "a.f1name": "Bea Lopez", "a.f2mail": "bea@example.com", "a.f4want": "A gloss before the holidays." };

/** What a form must never say of a time: that it is booked, or that it can be booked now. */
const CLAIMS = /book now|you're booked|is booked for|you are booked|reservado para/i;

test("a business that confirms its own bookings: the question shows its real open times, and never Book now", async () => {
  world("requests");
  const html = await (await get()).text();
  const slots = slotsOf(html);
  assert.ok(slots.length >= 4, `open times are offered: ${slots.length}`);
  assert.match(html, /<fieldset class="q" data-times>/);
  assert.equal(carriedOf(html).times, "1", "the page says it showed times, so a picked one is the answer");
  assert.match(html, /None of these work/);
  assert.doesNotMatch(html, / checked>/, "nothing is picked for them, None of these work least of all");
  assert.match(html, /data-ask="Ask for this time"/);
  assert.match(html, /Luma Salon confirms it with you\. Nothing is booked until they do\./);
  assert.doesNotMatch(html, CLAIMS);
  // Every time offered is past the business's least notice (two hours), and within the days it books ahead.
  const nowMs = Date.now();
  for (const slot of slots) assert.ok(startOf(slot) > nowMs + HOUR_MS, `${slot} is more than an hour away`);
});

test("a time picked is the same request a chat opens: held for the business, in no thread, and the thank-you never says booked", async () => {
  const made = world("requests");
  const html = await (await get()).text();
  const slot = slotsOf(html)[1];
  const res = await send({ ...ANA, "a.f6serv": "s1", "a.f7when": slot }, carriedOf(html));
  assert.equal(res.status, 200);
  const thanks = await res.text();
  assert.match(thanks, /You asked for <b>/);
  assert.match(thanks, /Luma Salon will confirm it with you by email, at <b>ana@example.com<\/b>\./);
  assert.match(thanks, /Nothing is booked until they confirm it\./);
  assert.doesNotMatch(thanks, CLAIMS);
  const [entry] = made.tables.form_entries;
  assert.equal(entry.answers.f7when, slot, "the request keeps the time it asked for");
  const [visit] = made.tables.appointments;
  assert.equal(visit.status, "proposed");
  assert.equal(visit.source, "receptionist");
  assert.equal(visit.conversation_id, null, "no thread, and so no hand-over");
  assert.equal(visit.service, "Balayage");
  assert.equal(Date.parse(visit.ends_at) - Date.parse(visit.starts_at), 2 * HOUR_MS, "a balayage takes two hours");
  const link = made.tables.form_entry_links.find((l) => l.kind === "visit");
  assert.equal(link.entry_id, entry.id, "the visit asked for is the entry's");
  assert.equal(link.appointment_id, visit.id);
});

test("two people who ask for the same time are two requests, each held for the business", async () => {
  const made = world("requests");
  const first = await (await get()).text();
  const second = await (await get()).text();
  const slot = slotsOf(first)[0];
  assert.equal((await send({ ...ANA, "a.f7when": slot }, carriedOf(first))).status, 200);
  // The second visitor's page was drawn before the first asked: another's request takes nothing from them.
  assert.equal((await send({ ...BEA, "a.f7when": slot }, carriedOf(second))).status, 200);
  assert.equal(made.tables.form_entries.length, 2);
  const held = made.tables.appointments.filter(
    (v) => v.status === "proposed" && v.starts_at === made.tables.appointments[0].starts_at,
  );
  assert.equal(held.length, 2, "two requests for one time");
  // And a page drawn now does not offer it: a request takes its time, as in a chat.
  assert.ok(!slotsOf(await (await get()).text()).includes(slot), "a time someone asked for is not offered again");
});

test("a time taken since the page was drawn: the form again, with what is open now, and nothing they typed lost", async () => {
  const made = world("requests");
  const html = await (await get()).text();
  const slot = slotsOf(html)[0];
  const startMs = startOf(slot);
  // A booking lands on that hour meanwhile (one the business made itself).
  made.tables.appointments.push({
    id: "booked-meanwhile",
    tenant_id: A,
    source: "person",
    status: "booked",
    starts_at: new Date(startMs - 2 * HOUR_MS).toISOString(),
    ends_at: new Date(startMs + 2 * HOUR_MS).toISOString(),
    timezone: "America/New_York",
    contact_id: null,
    conversation_id: null,
    created_at: new Date().toISOString(),
  });
  const res = await send({ ...ANA, "a.f7when": slot }, carriedOf(html));
  assert.equal(res.status, 409);
  const again = await res.text();
  assert.match(again, /was just taken/);
  assert.match(again, /These times are open now\./);
  assert.match(again, /A warm, soft blonde\./, "what they wrote is still there");
  assert.ok(!slotsOf(again).includes(slot), "the time taken is not offered again");
  assert.doesNotMatch(
    again,
    /name="a.f7when" value="[^"]*" checked/,
    "no time is picked for them, and not None of these work",
  );
  assert.equal(made.tables.form_entries.length, 0, "nothing was kept");
});

test("a time too short for the service picked: the form again, saying so, with the times that fit", async () => {
  world("requests");
  const html = await (await get()).text();
  // The last hour of a day fits a gloss, not a two-hour balayage.
  const late = slotsOf(html).find((slot) => slot.endsWith("16:00"));
  assert.ok(late, "the last hour of a day is offered");
  const res = await send({ ...ANA, "a.f6serv": "s1", "a.f7when": late }, carriedOf(html));
  assert.equal(res.status, 409);
  assert.match(await res.text(), /Balayage takes longer/);
});

test("None of these work: a request with no time, held for nobody", async () => {
  const made = world("requests");
  const html = await (await get()).text();
  const res = await send({ ...ANA, "a.f7when": "" }, carriedOf(html));
  assert.equal(res.status, 200, "the question is answered by no time");
  assert.doesNotMatch(await res.text(), /You asked for/);
  assert.equal(made.tables.appointments.length, 0);
});

test("a business with its own booking page: the question is a way there, its opens are counted, and nothing is claimed", async () => {
  const made = world("page");
  const html = await (await get()).text();
  assert.match(html, /href="\/b\/luma-salon\/colour-consultation\/book"/);
  assert.match(html, /Pick a time on Luma Salon&#39;s booking page|Pick a time on Luma Salon's booking page/);
  assert.doesNotMatch(html, /<fieldset class="q" data-times>/);
  assert.equal(slotsOf(html).length, 0);
  assert.doesNotMatch(html, CLAIMS);
  const book = (agent, method = "GET") =>
    sendToBookingPage(
      "luma-salon",
      "colour-consultation",
      new Request(`${ADDRESS}/book`, { method, headers: { "user-agent": agent } }),
    );
  const opened = await book(BROWSER);
  assert.equal(opened.status, 302);
  assert.equal(opened.headers.get("location"), "https://book.example/luma");
  await book("WhatsApp/2.24 A");
  await book(BROWSER, "HEAD");
  assert.equal(
    made.tables.form_days?.[0]?.booking_opens,
    1,
    "a person's open is counted; a preview and a HEAD are not",
  );
  // Sent with the request, it is a plain request: nothing is held.
  const res = await send({ ...ANA }, carriedOf(html));
  assert.equal(res.status, 200);
  assert.equal(made.tables.appointments.length, 0);
});

test("neither, or a calendar that cannot be read: the question asks as the form wrote it, and nothing says why", async () => {
  world("neither");
  const plain = await (await get()).text();
  assert.doesNotMatch(plain, /<fieldset class="q" data-times>/);
  assert.match(plain, /value="w1"/, "the form's own choices");
  world("requests");
  calendar = "away";
  const away = await (await get()).text();
  assert.doesNotMatch(away, /<fieldset class="q" data-times>/);
  assert.match(away, /value="w2"/);
  assert.doesNotMatch(away, /calendar|could not|couldn't/i);
});

test("a time sent while the calendar cannot be read is not held: the request goes, the time in its answers for the business", async () => {
  const made = world("requests");
  const html = await (await get()).text();
  const slot = slotsOf(html)[0];
  forgetFeeds();
  calendar = "away";
  const res = await send({ ...ANA, "a.f7when": slot }, carriedOf(html));
  assert.equal(res.status, 200);
  assert.equal(made.tables.appointments.length, 0, "nothing is held that could not be checked");
  assert.equal(made.tables.form_entries[0].answers.f7when, slot);
});
