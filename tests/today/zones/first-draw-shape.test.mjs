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
 * what holds the card (Today, calm, 19 Nov 2026), the lines, AI found's rows and To do's. And where People is not read
 * yet, the page never says nothing was found. Run on the stub React, which draws a part as it is created, in the page's
 * order.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { todayPeopleOf as todayReadOf } from "@chanlytics/contracts";
import { again, all, fresh, textOf, unmount } from "../../_stub-react.mjs";
import { personDto } from "../../consent/_person-row.mjs";
import { headline, weekSeen } from "../_headline.mjs";
import { W, ZONE, answerWith, dayWith, json, row } from "./_world.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

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
    rested: weekSeen(),
    lately: [],
  },
});
const anIdea = {
  id: "p-1",
  kind: "message",
  needs: "operator",
  title: "Write to Rosa",
  summary: "Write to Rosa, as AI would send it.",
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
  bridgeHolds({ values: { people: undefined } });
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

/**
 * Where everything stands (Today, calm, 19 Nov 2026): the desk's two columns, what holds the page's card and what it
 * says, the lines in the page's order, AI found's rows (its card's and its lines) and the line it holds while AI writes,
 * and To do's steps, in the card or as lines.
 */
function shapeOf(tree) {
  const card = byTestId(tree, "today-card") ?? classed(tree, "tz-setup-lead")[0];
  const lineOf = (n) => `${n.props["data-testid"]}: ${textOf(classed(n, "calm-name")[0] ?? null)}`;
  const lines = classed(tree, "calm-line").filter((n) => !n.props["data-folded"]);
  const found = byTestId(tree, "today-ask-found");
  const foundCard = card?.props["data-holder"] === "found" ? [textOf(classed(card, "calm-title")[0])] : [];
  const reading = byTestId(tree, "today-found-reading");
  const steps = card?.props["data-holder"] === "todo" ? [textOf(card)] : [];
  return {
    columns: classed(tree, "calm-col").length,
    phone: all(tree, (n) => n.props?.["data-testid"] === "today-phone").length === 1,
    card: card ? (card.props["data-holder"] ?? "setup") : null,
    lines: lines.map(lineOf),
    found:
      found || foundCard.length || reading
        ? {
            rows: [...foundCard, ...(found ? classed(found, "calm-line").map(lineOf) : [])],
            line: textOf(reading ?? null),
          }
        : null,
    todo: [...steps, ...lines.filter((n) => n.props["data-testid"] === "queue-step").map(textOf)],
  };
}

test("a quiet desk whose checks find something: the first draw holds AI found, its card and its two columns, and People's book moves nothing", async () => {
  const page = firstPage([personDto({ id: "p-a", display_name: "Ana Reyes" })]);
  setSurfaceValue("today", dayWith([]));
  setSurfaceValue("reports_headline", bookingGap());
  await firstReadLands(page);
  fresh();
  const first = shapeOf(draw());
  assert.equal(
    first.columns,
    2,
    "REGRESSION (13 Nov 2026): the day alone in one column, split in two as AI found came",
  );
  assert.ok(first.found?.rows.length, "AI found stands in the first draw");
  assert.equal(first.card, "found", "nobody waits: what AI found holds the card");
  bridgeHolds({ values: { people: bookOf(page) } });
  assert.deepEqual(shapeOf(draw()), first, "People's book landed: nothing drawn moved");
});

test("a quiet day whose one to-do is a step due: it holds the card, AI found stands under the day, and People's book moves nothing", async () => {
  const page = firstPage([stepped("p-rosa", "Rosa Diaz", -1), personDto({ id: "p-a", display_name: "Ana Reyes" })]);
  setSurfaceValue("today", dayWith([]));
  setSurfaceValue("reports_headline", bookingGap());
  await firstReadLands(page);
  fresh();
  const first = shapeOf(draw());
  assert.equal(first.todo?.length, 1, "REGRESSION (13 Nov 2026): To do drew without its step, which came after it");
  assert.match(first.todo[0], /Call Rosa Diaz/);
  assert.equal(first.card, "todo", "the step holds the card");
  assert.ok(
    first.found?.rows.every((r) => r.startsWith("today-found-")),
    "someone's step waits: AI found's are lines under the day, never the card then moved",
  );
  bridgeHolds({ values: { people: bookOf(page) } });
  assert.deepEqual(shapeOf(draw()), first, "People's book landed: nothing drawn moved");
});

test("before People is read at all, the desk keeps its two columns: not read is never nothing found", () => {
  setSurfaceValue("today", dayWith([]));
  setSurfaceValue("reports_headline", wellBooked());
  fresh();
  const first = shapeOf(draw());
  assert.equal(first.columns, 2, "REGRESSION (13 Nov 2026): People unread was drawn as nothing found");
  assert.equal(first.found, null, "nor is anything said of what AI found until it is read");
});

test("AI still writing its morning on a day nothing else was found: AI found holds its place, and the idea comes into it", async () => {
  const page = firstPage([personDto({ id: "p-a", display_name: "Ana Reyes" })]);
  setSurfaceValue("today", dayWith([]));
  setSurfaceValue("reports_headline", wellBooked());
  setSurfaceValue("ask_morning", morning("writing"));
  await firstReadLands(page);
  fresh();
  const first = shapeOf(draw());
  assert.equal(first.columns, 2, "the day keeps its two columns while AI writes");
  assert.ok(
    first.found,
    "REGRESSION (13 Nov 2026): AI found appeared only once its idea was written, and moved the day",
  );
  assert.deepEqual(first.found.rows, []);
  assert.match(first.found.line, /AI is reading your morning/);
  setSurfaceValue("ask_morning", morning("ready", [anIdea]));
  const after = shapeOf(draw());
  assert.equal(after.found?.rows.length, 1, "the idea came");
  assert.equal(
    after.card,
    "found",
    "nobody waits: it is the card, which comes in with its own motion (calm/motion.ts)",
  );
  assert.equal(after.found.line, "", "and the line it held gave way to it");
  assert.deepEqual(
    { columns: after.columns, lines: after.lines },
    { columns: first.columns, lines: first.lines },
    "the day's lines stand where they stood",
  );
});

test("AI's morning written with nothing to offer: the line it held says so, and stays", async () => {
  const page = firstPage([personDto({ id: "p-a", display_name: "Ana Reyes" })]);
  setSurfaceValue("today", dayWith([]));
  setSurfaceValue("reports_headline", wellBooked());
  setSurfaceValue("ask_morning", morning("writing"));
  await firstReadLands(page);
  fresh();
  const first = shapeOf(draw());
  setSurfaceValue("ask_morning", morning("quiet"));
  const after = shapeOf(draw());
  assert.ok(after.found, "AI found keeps the place it held");
  assert.match(after.found.line, /Nothing more from AI this morning/);
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

test("someone waiting: they hold the card and AI found stands under the day from the first draw, as before", async () => {
  const page = firstPage([personDto({ id: "p-a", display_name: "Ana Reyes" })]);
  setSurfaceValue("today", dayWith([row("rosa", "Rosa Díaz")]));
  setSurfaceValue("reports_headline", bookingGap());
  await firstReadLands(page);
  fresh();
  const first = shapeOf(draw());
  assert.equal(first.card, "queue", "who waits holds the card");
  assert.ok(
    first.found?.rows.length && first.found.rows.every((r) => r.startsWith("today-found-")),
    "AI found's are lines",
  );
  bridgeHolds({ values: { people: bookOf(page) } });
  assert.deepEqual(shapeOf(draw()), first);
});

test("on a phone: AI found and To do's step stand in the first draw, and People's book moves nothing", async () => {
  phoneWidth.matches = true;
  const page = firstPage([stepped("p-rosa", "Rosa Diaz", -1), personDto({ id: "p-a", display_name: "Ana Reyes" })]);
  setSurfaceValue("today", dayWith([]));
  setSurfaceValue("reports_headline", bookingGap());
  await firstReadLands(page);
  fresh();
  const first = shapeOf(draw());
  assert.equal(first.phone, true);
  assert.ok(first.found?.rows.length, "REGRESSION (13 Nov 2026): 393 px of AI found came 0.4 to 1.3 s after the page");
  assert.equal(first.todo?.length, 1);
  bridgeHolds({ values: { people: bookOf(page) } });
  assert.deepEqual(shapeOf(draw()), first);
});
