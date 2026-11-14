/**
 * Today's first read of People says what People's book says (Today knows its shape at its first draw, 13 Nov 2026). Ask
 * found's checks and To do's steps due waited for People's whole book and landed after the rest of the page; Today's first
 * read now carries what they read of People (contracts today/people.ts: each list counted, how many there are, and the
 * people the checks and the steps can name), and the page makes those rows the way People's page makes its own
 * (helpers.ts peopleForToday). Here a workspace with something for every check: the checks and the steps over People's
 * book (People's own surface, made by surfaces/people/surface-map.ts peopleSurfaceOf) and over the first read, as the page
 * reads it, must be one answer, row for row.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { channelsReady, todayPeopleOf, todaySteps } from "@chanlytics/contracts";
import { personDto } from "../../consent/_person-row.mjs";
import { headline } from "../_headline.mjs";
import { W, ZONE, answerWith, json } from "./_world.mjs";

const { todayLeaks } = await import("../../../apps/dashboard/src/surfaces/today/leaks.ts");
const { peopleSurfaceOf } = await import("../../../apps/dashboard/src/surfaces/people/surface-map.ts");
const { peopleForToday } = await import("../../../apps/dashboard/src/surfaces/today/helpers.ts");
const { readTodayPeople } = await import("../../../apps/dashboard/src/surfaces/today/people-read.ts");
const { clearReadCaches } = await import("../../../apps/dashboard/src/bridge/read-cache.ts");

const DAY = 86_400_000;
const HOUR = 3_600_000;
const VIEWER = "u-owner";
/** The page reads People at its own moment: the book and the first read are both made at it here. */
const NOW_MS = Date.now();
const ago = (days) => new Date(NOW_MS - days * DAY).toISOString();
/** The business's day `days` from today, as a step's due day is written. */
const dueOn = (days) => new Date(NOW_MS + days * DAY).toLocaleDateString("en-CA", { timeZone: ZONE });

/** A person who wrote three days ago and first did two months ago, then `over`. */
const person = (over) =>
  personDto({
    last_message_at: ago(3),
    last_inbound_at: ago(3),
    first_contact_at: ago(60),
    earliest_row_at: ago(60),
    ...over,
  });

/** A person with a next step, due `days` from today (negative: overdue), for the member looking. */
const stepped = (id, name, days) =>
  person({
    id,
    display_name: name,
    step_id: `s-${id}`,
    step_body: `Call ${name}`,
    step_due_on: dueOn(days),
    step_for_user_id: VIEWER,
    step_for_name: "Owner",
    step_deal_id: null,
  });

/** A deal as the people read carries it (00156). */
const deal = (id, stage, proposedDaysAgo) => ({
  deal_id: `d-${id}`,
  deal_stage: stage,
  deal_service: "Kitchen remodel",
  deal_proposed_at: ago(proposedDaysAgo),
  deal_decided_at: stage === "proposed" ? null : ago(proposedDaysAgo - 2),
  deal_ended_at: null,
  deal_amount_cents: null,
  deal_per: null,
});

/** Someone whose last visit, a consultation, ended `days` ago, with nothing booked since. */
const consulted = (id, name, days) =>
  person({
    id,
    display_name: name,
    visits: {
      timezone: ZONE,
      source: "Google Calendar",
      state: "ok",
      next: null,
      last: {
        id: `v-${id}`,
        start: new Date(NOW_MS - days * DAY - HOUR).toISOString(),
        end: new Date(NOW_MS - days * DAY).toISOString(),
        title: "Consultation",
        all_day: false,
        via: "phone",
        consultation: true,
      },
    },
  });

/** A yes to offers on a paper form. */
const offersYes = {
  marketing_consent: "opted_in",
  marketing_consent_source: "form",
  marketing_consent_updated_at: ago(5),
};

/** A workspace with something for every check, and people none of them names. */
const everyone = () => [
  stepped("p-rosa", "Rosa Diaz", -1),
  stepped("p-mia", "Mia Chen", 0),
  stepped("p-ivy", "Ivy Park", 3),
  consulted("p-ana", "Ana Reyes", 2),
  // A proposal out twenty days, and nothing heard from her since it went.
  person({
    id: "p-cleo",
    display_name: "Cleo Park",
    last_message_at: ago(25),
    last_inbound_at: ago(25),
    ...deal("cleo", "proposed", 20),
  }),
  person({ id: "p-dee", display_name: "Dee Wolf", ...deal("dee", "won", 30) }),
  person({ id: "p-bo", display_name: "Bo Lee", phone_e164: "+13055550111", ...offersYes }),
  person({
    id: "p-eve",
    display_name: "Eve Kim",
    phone_e164: null,
    email: "eve@example.com",
    channels: ["email"],
    ...offersYes,
  }),
  ...Array.from({ length: 7 }, (_, i) =>
    person({
      id: `p-quiet-${i}`,
      display_name: `Quiet ${i}`,
      phone_e164: `+1305555012${i}`,
      last_message_at: ago(40),
      last_inbound_at: ago(40),
    }),
  ),
];

/** The workspace sends on a texting line alone: a text carries no offers, so the reach check has its reason. */
const textOnly = channelsReady({
  whatsapp: null,
  textLine: { sms_state: "active", reg_mock: false },
  email: { mailbox: false, domain: false },
});

/** People's first page as GET contacts answers it. */
const firstPage = (people) => ({
  people,
  calendar: { state: "ok", source: "Google Calendar" },
  consult_first: true,
  has_deals: true,
  deal_pace: null,
  follow_up: null,
  channels_ready: textOnly,
  booking_link: null,
  appointment_word: "appointment",
  page: { q: null, offset: 0, limit: 1000, total: people.length, has_more: false, next: null },
});

/** People's book as People's page makes it from that page (surface.ts apply, surface-map.ts peopleSurfaceOf). */
const bookOf = (page) =>
  peopleSurfaceOf(
    {
      tz: ZONE,
      people: page.people,
      page: page.page,
      saved: [],
      calendar: page.calendar,
      bookingLink: null,
      hasDeals: page.has_deals,
      consultFirst: page.consult_first,
      word: "appointment",
      dealPace: null,
      followUp: page.follow_up,
      channelsReady: page.channels_ready,
      views: {},
      viewsRead: true,
      readAt: NOW_MS,
    },
    VIEWER,
    new Date(NOW_MS),
  );

/** What Today's first read carries (the server's making, GET today/people), landed as a load lands it. */
async function firstReadLands(page, reach = { whole: !page.page.has_more, total: page.page.total }) {
  const dto = todayPeopleOf(page, reach, { tz: ZONE, now: new Date(NOW_MS), viewer: VIEWER });
  answerWith((u) =>
    u.pathname === "/api/v1/today/people"
      ? json(200, { ok: true, data: { people: dto } })
      : json(503, { ok: false, error: { code: "unavailable", message: "not read here" } }),
  );
  await readTodayPeople();
  return dto;
}

beforeEach(() => {
  clearReadCaches();
  delete W.__PEOPLE;
  W.__ME = { id: VIEWER };
});

/** Thirty days in which 2 of the 18 who asked booked, and four messages nobody answered: the booking and reply checks. */
const reports = headline({
  days: 30,
  in: 21,
  ai: 16,
  you: 1,
  none: 4,
  booking: { calendar: "ok", days: 30, asked: 18, booked: 2 },
});

const checks = (people) => todayLeaks(reports, people, [], { max: Number.POSITIVE_INFINITY, nowMs: NOW_MS });
const steps = (people) => todaySteps(people.rows, people.fetchedAt, ZONE);

test("Ask found's checks over Today's first read are the checks over People's book, every row of them", async () => {
  const page = firstPage(everyone());
  const dto = await firstReadLands(page);
  const fromRead = checks(peopleForToday());
  const fromBook = checks(bookOf(page));
  assert.deepEqual(
    fromBook.rows.map((r) => r.id),
    ["never-booked", "unanswered", "consults-waiting", "proposals-waiting", "unreachable", "quiet"],
    "the workspace has something for every check",
  );
  assert.deepEqual(fromRead, fromBook);
  assert.ok(dto.people.length < page.people.length, "the read names fewer people than People holds");
});

test("To do's steps due over Today's first read are the steps over People's book", async () => {
  const page = firstPage(everyone());
  await firstReadLands(page);
  const fromRead = steps(peopleForToday());
  const fromBook = steps(bookOf(page));
  assert.deepEqual(
    fromBook.items.map((s) => s.name),
    ["Rosa Diaz", "Mia Chen"],
    "two steps due, the overdue first",
  );
  assert.deepEqual(fromRead, fromBook);
});

test("People's lists as Today's first read counts them are the rail's counts", async () => {
  const page = firstPage(everyone());
  const dto = await firstReadLands(page);
  assert.deepEqual(
    dto.lists,
    bookOf(page).lists.map(({ id, label, group, count, action }) => ({ id, label, group, count, action })),
  );
  assert.equal(dto.total, page.page.total);
});

test("the reach check's reason holds over the first read whichever yes to offers comes first", async () => {
  // The person whose reason is the workspace's channel sits after one whose reason is another, and the other way round.
  for (const order of [
    ["p-eve", "p-bo"],
    ["p-bo", "p-eve"],
  ]) {
    clearReadCaches();
    const page = firstPage(everyone().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)));
    await firstReadLands(page);
    const reach = (p) => checks(p).rows.find((r) => r.id === "unreachable");
    assert.deepEqual(reach(peopleForToday()), reach(bookOf(page)));
  }
});

test("a proposal follow-up that runs: where it stands for each person is People's own, laid on the first read's rows", async () => {
  // A follow-up going by WhatsApp, which the workspace sends on (no channels read: WhatsApp alone), that went to Cleo two days ago.
  // Her proposal carries its link, which a follow-up sends (FOLLOW_UP_NEEDS_LINK).
  const people = everyone().map((p) =>
    p.id === "p-cleo" ? { ...p, deal_proposal_url: "https://example.com/proposals/cleo" } : p,
  );
  const page = {
    ...firstPage(people),
    channels_ready: null,
    follow_up: {
      run_hour: 9,
      last_run_for: null,
      asks: false,
      purpose: "utility",
      had: { "p-cleo": ago(2) },
      queued: {},
      held: {},
      heard: {},
    },
  };
  const dto = await firstReadLands(page);
  const book = bookOf(page);
  const read = peopleForToday();
  const cleo = (people) => people.rows.find((r) => r.id === "p-cleo").followUp;
  assert.ok(cleo(book), "the follow-up stands for Cleo in People's book");
  assert.deepEqual(dto.follow_ups, { "p-cleo": cleo(book) }, "the read carries where it stands, for her alone");
  assert.deepEqual(cleo(read), cleo(book));
  assert.deepEqual(checks(read), checks(book));
});

test("People past its first page: the first read says how many, the page waits for the book, and the book is what it reads", async () => {
  const page = firstPage(everyone());
  const dto = await firstReadLands(page, { whole: false, total: 4200 });
  assert.deepEqual(dto, { whole: false, total: 4200 });
  assert.equal(peopleForToday(), null);
  const book = bookOf(page);
  W.__PEOPLE = book;
  assert.equal(peopleForToday(), book);
});
