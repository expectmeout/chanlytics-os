/**
 * Today opens in the arrangement it keeps (Today knows its shape at its first draw, 13 Nov 2026). Measured on production
 * on 13 Nov: Ask found landed 0.3 to 1.3 s after the rest of the page on every first visit, 319 to 393 px, and To do's
 * steps due came 0.3 to 0.9 s after To do had drawn, in the places of the visits drawn before them; and on a desk where
 * nobody waits, the page drew one column and split into two as Ask found came (arrangement.ts `alone`). Both waited for
 * People's whole book, and "not read yet" was read as "nothing found".
 *
 * Today's first read now carries what they read of People (GET today/people, contracts today/people.ts), Reports' headline
 * and Ask's morning as it stands. Here the page is drawn as a load draws it, part by part: Today, its headline and its
 * first read of People; then People's book; then Ask's morning. What was drawn first stands where it stood: the columns,
 * who leads, Ask found's rows and To do's. And where People is not read yet, the page keeps two columns and never says
 * nothing was found. Run on the stub React, which draws a part as it is created, in the page's order.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { todayPeopleOf as todayReadOf } from "@chanlytics/contracts";
import { again, all, fresh, textOf, unmount } from "../../_stub-react.mjs";
import { personDto } from "../../consent/_person-row.mjs";
import { headline } from "../_headline.mjs";
import { W, ZONE, answerWith, dayWith, json, row } from "./_world.mjs";

// The phone's width, which the page asks once (phone.ts): one answer, turned per test.
const phoneWidth = { matches: false, addEventListener() {}, removeEventListener() {} };
W.matchMedia = () => phoneWidth;

const { TodayZones } = await import("../../../apps/dashboard/src/surfaces/today/zones/page.tsx");
const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");
const { peopleSurfaceOf } = await import("../../../apps/dashboard/src/surfaces/people/surface-map.ts");
const { readTodayPeople } = await import("../../../apps/dashboard/src/surfaces/today/people-read.ts");
const { clearReadCaches } = await import("../../../apps/dashboard/src/bridge/read-cache.ts");

const DAY = 86_400_000;
/** The business's day `d` days from now, as a step's due day is written. */
const dueOn = (d) => new Date(Date.now() + d * DAY).toLocaleDateString("en-CA", { timeZone: ZONE });

/** Someone with a step due `d` days from today, for nobody in particular. */
const stepped = (id, name, d) =>
  personDto({
    id,
    display_name: name,
    step_id: `s-${id}`,
    step_body: `Call ${name}`,
    step_due_on: dueOn(d),
    step_for_user_id: null,
    step_for_name: null,
    step_deal_id: null,
  });

/** People's first page as GET contacts answers it: everyone, on one page. */
const firstPage = (people) => ({
  people,
  calendar: { state: "ok", source: "Google Calendar" },
  consult_first: false,
  has_deals: false,
  deal_pace: null,
  follow_up: null,
  channels_ready: null,
  booking_link: null,
  appointment_word: "appointment",
  page: { q: null, offset: 0, limit: 1000, total: people.length, has_more: false, next: null },
});

/** People's book as People's page makes it from that page (surface-map.ts). */
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
      followUp: null,
      channelsReady: null,
      views: {},
      viewsRead: true,
      readAt: Date.now(),
    },
    null,
    new Date(),
  );

/** Thirty days in which 2 of the 18 who asked booked: Ask found's booking gap. */
const bookingGap = () =>
  headline({ days: 30, in: 21, ai: 21, you: 0, none: 0, booking: { calendar: "ok", days: 30, asked: 18, booked: 2 } });
/** Thirty days in which everyone was answered and most who asked booked: nothing for Ask found's checks. */
const wellBooked = () =>
  headline({ days: 30, in: 21, ai: 21, you: 0, none: 0, booking: { calendar: "ok", days: 30, asked: 18, booked: 15 } });

/** Ask's morning: `state` with these cards. */
const morning = (state, cards = []) => ({
  fetchedAt: Date.now(),
  dto: {
    day: dueOn(0),
    state,
    offered: true,
    thread_id: null,
    message_id: "m-1",
    headline: "",
    detail: "",
    cards,
    findings: [],
    rested: {},
    lately: [],
  },
});
const anIdea = {
  id: "p-1",
  kind: "message",
  needs: "operator",
  title: "Write to Rosa",
  summary: "Write to Rosa, as Ask would send it.",
  payload: {},
  undo: null,
};

/** Today's first read of People, landed as a load lands it: the read the page's first draw waits for. */
async function firstReadLands(page) {
  const dto = todayReadOf(page, { whole: true, total: page.page.total }, { tz: ZONE, now: new Date(), viewer: null });
  answerWith((u) =>
    u.pathname === "/api/v1/today/people"
      ? json(200, { ok: true, data: { people: dto } })
      : json(503, { ok: false, error: { code: "unavailable", message: "not read here" } }),
  );
  await readTodayPeople();
}

beforeEach(() => {
  unmount();
  clearReadCaches();
  for (const key of ["today", "setup", "ask_morning", "reports_headline"]) setSurfaceValue(key, undefined);
  delete W.__PEOPLE;
  phoneWidth.matches = false;
});

const draw = () => again(() => W.React.createElement(TodayZones, {}));
const byTestId = (tree, id) => all(tree, (n) => n.props?.["data-testid"] === id)[0];
const classed = (tree, name) =>
  all(tree, (n) =>
    String(n.props?.className ?? "")
      .split(" ")
      .includes(name),
  );

/** Where everything stands: the columns and what each holds, who leads, Ask found's rows and line, To do's rows. */
function shapeOf(tree) {
  const found = byTestId(tree, "today-ask-found");
  const todo = byTestId(tree, "today-group-todo");
  return {
    oneColumn: classed(tree, "tz-bento-one").length === 1,
    columns: classed(tree, "tz-col").map((col) =>
      [col.props.children]
        .flat(Infinity)
        .filter(Boolean)
        .map((c) => c.type?.name ?? c.props?.["data-testid"] ?? c.key),
    ),
    phone: all(tree, (n) => n.props?.["data-testid"] === "today-phone").length === 1,
    found: found
      ? {
          wide: String(found.props.className).includes("tz-found-wide"),
          rows: all(found, (n) => typeof n.props?.["data-key"] === "string").map((n) => n.props["data-key"]),
          line: textOf(byTestId(found, "today-found-reading") ?? null),
        }
      : null,
    todo: todo ? all(todo, (n) => /^queue-/.test(String(n.props?.["data-testid"] ?? ""))).map(textOf) : null,
  };
}

test("a quiet desk whose checks find something: the first draw holds Ask found and its two columns, and People's book moves nothing", async () => {
  const page = firstPage([personDto({ id: "p-a", display_name: "Ana Reyes" })]);
  setSurfaceValue("today", dayWith([]));
  setSurfaceValue("reports_headline", bookingGap());
  await firstReadLands(page);
  fresh();
  const first = shapeOf(draw());
  assert.equal(
    first.oneColumn,
    false,
    "REGRESSION (13 Nov 2026): the day alone in one column, split in two as Ask found came",
  );
  assert.ok(first.found?.rows.length, "Ask found stands in the first draw");
  assert.equal(first.found.wide, true, "nobody waits: Ask found leads, wide");
  W.__PEOPLE = bookOf(page);
  assert.deepEqual(shapeOf(draw()), first, "People's book landed: nothing drawn moved");
});

test("a quiet day whose one to-do is a step due: To do draws it first, Ask found stands under the day, and People's book moves nothing", async () => {
  const page = firstPage([stepped("p-rosa", "Rosa Diaz", -1), personDto({ id: "p-a", display_name: "Ana Reyes" })]);
  setSurfaceValue("today", dayWith([]));
  setSurfaceValue("reports_headline", bookingGap());
  await firstReadLands(page);
  fresh();
  const first = shapeOf(draw());
  assert.equal(first.todo?.length, 1, "REGRESSION (13 Nov 2026): To do drew without its step, which came after it");
  assert.match(first.todo[0], /Call Rosa Diaz/);
  assert.equal(first.found?.wide, false, "someone's step waits: Ask found under the day, never leading then moving");
  W.__PEOPLE = bookOf(page);
  assert.deepEqual(shapeOf(draw()), first, "People's book landed: nothing drawn moved");
});

test("before People is read at all, the desk keeps its two columns: not read is never nothing found", () => {
  setSurfaceValue("today", dayWith([]));
  setSurfaceValue("reports_headline", wellBooked());
  fresh();
  const first = shapeOf(draw());
  assert.equal(first.oneColumn, false, "REGRESSION (13 Nov 2026): People unread was drawn as nothing found");
});

test("Ask still writing its morning on a day nothing else was found: Ask found holds its place, and the idea comes into it", async () => {
  const page = firstPage([personDto({ id: "p-a", display_name: "Ana Reyes" })]);
  setSurfaceValue("today", dayWith([]));
  setSurfaceValue("reports_headline", wellBooked());
  setSurfaceValue("ask_morning", morning("writing"));
  await firstReadLands(page);
  fresh();
  const first = shapeOf(draw());
  assert.equal(first.oneColumn, false, "the day keeps its two columns while Ask writes");
  assert.ok(
    first.found,
    "REGRESSION (13 Nov 2026): Ask found appeared only once its idea was written, and moved the day",
  );
  assert.equal(first.found.wide, true, "nobody waits: it leads, wide");
  assert.deepEqual(first.found.rows, []);
  assert.match(first.found.line, /Ask is reading your morning/);
  setSurfaceValue("ask_morning", morning("ready", [anIdea]));
  const after = shapeOf(draw());
  assert.equal(after.found?.rows.length, 1, "the idea came into Ask found's place");
  assert.equal(after.found.line, "", "and the line it held gave way to it");
  assert.deepEqual(
    { oneColumn: after.oneColumn, columns: after.columns, wide: after.found.wide },
    { oneColumn: first.oneColumn, columns: first.columns, wide: first.found.wide },
  );
});

test("Ask's morning written with nothing to offer: the line it held says so, and stays", async () => {
  const page = firstPage([personDto({ id: "p-a", display_name: "Ana Reyes" })]);
  setSurfaceValue("today", dayWith([]));
  setSurfaceValue("reports_headline", wellBooked());
  setSurfaceValue("ask_morning", morning("writing"));
  await firstReadLands(page);
  fresh();
  const first = shapeOf(draw());
  setSurfaceValue("ask_morning", morning("quiet"));
  const after = shapeOf(draw());
  assert.ok(after.found, "Ask found keeps the place it held");
  assert.match(after.found.line, /Nothing more from Ask this morning/);
  assert.deepEqual(after.columns, first.columns);
});

test("Ask writing on a day three rows were found: no line, its ideas would only add to the ones not shown", async () => {
  // Six people not heard from in forty days: the third check, beside the booking gap and the messages nobody answered.
  const gone = new Date(Date.now() - 40 * DAY).toISOString();
  const page = firstPage(
    Array.from({ length: 6 }, (_, i) =>
      personDto({ id: `p-q${i}`, display_name: `Quiet ${i}`, last_message_at: gone, last_inbound_at: gone }),
    ),
  );
  setSurfaceValue("today", dayWith([]));
  setSurfaceValue(
    "reports_headline",
    headline({
      days: 30,
      in: 21,
      ai: 16,
      you: 1,
      none: 4,
      booking: { calendar: "ok", days: 30, asked: 18, booked: 2 },
    }),
  );
  setSurfaceValue("ask_morning", morning("writing"));
  await firstReadLands(page);
  fresh();
  const first = shapeOf(draw());
  assert.equal(first.found?.line, "", `no line beside rows: ${JSON.stringify(first.found)}`);
});

test("someone waiting: Need you leads and Ask found stands under the day from the first draw, as before", async () => {
  const page = firstPage([personDto({ id: "p-a", display_name: "Ana Reyes" })]);
  setSurfaceValue("today", dayWith([row("rosa", "Rosa Díaz")]));
  setSurfaceValue("reports_headline", bookingGap());
  await firstReadLands(page);
  fresh();
  const first = shapeOf(draw());
  assert.equal(first.found?.wide, false);
  W.__PEOPLE = bookOf(page);
  assert.deepEqual(shapeOf(draw()), first);
});

test("on a phone: Ask found and To do's step stand in the first draw, and People's book moves nothing", async () => {
  phoneWidth.matches = true;
  const page = firstPage([stepped("p-rosa", "Rosa Diaz", -1), personDto({ id: "p-a", display_name: "Ana Reyes" })]);
  setSurfaceValue("today", dayWith([]));
  setSurfaceValue("reports_headline", bookingGap());
  await firstReadLands(page);
  fresh();
  const first = shapeOf(draw());
  assert.equal(first.phone, true);
  assert.ok(first.found?.rows.length, "REGRESSION (13 Nov 2026): 393 px of Ask found came 0.4 to 1.3 s after the page");
  assert.equal(first.todo?.length, 1);
  W.__PEOPLE = bookOf(page);
  assert.deepEqual(shapeOf(draw()), first);
});
