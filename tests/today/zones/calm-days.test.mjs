/**
 * Today on a calm day, and every press going somewhere (8 Nov 2026), over the real contracts and the zones on the stub
 * React. Each case was a gap the review of that day found on a Sunday with nothing waiting but one old number:
 *
 * - "That's everyone" over no one, where one row nobody counts had taken "The receptionist is on" away;
 * - the old row a button that opened nothing, taking the coral from Finish setting up and keeping Ask found under an empty day
 *   (since Today, calm, 19 Nov 2026, whoever waited past a week is counted in the line of what else is left, and the Inbox's
 *   Needs you lists them with Mark done: tests/conversations/inbox/inbox-counts.test.mjs);
 * - "0 messages, 15 calls", and a figure on a phone that could say nothing unless it happened to have a receipt;
 * - "Not one of them is on the calendar" over a calendar nobody is on;
 * - Not today with no Undo, and two rules for one word.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NEED_YOU_WORDS,
  figureDoorOf,
  restedWith,
  restedWithout,
  toBookingReportVM,
  todayHeadLine,
  todayWentLine,
  toTodayVM,
  tollFreeNumber,
} from "@chanlytics/contracts";
import { again, all, atWidth, textOf, unmount } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import { NOW, corals, dayWith, draw, metrics, row, wire } from "./_world.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

// Need you as the page draws it, with the card its arrangement names (Today, calm).
const { NeedYouOnToday: NeedYou } = await import("./_on-today.mjs");
const { TODAY_LINE_WORDS } = await import("../../../apps/dashboard/src/surfaces/today/model/lines.ts");
const { olderWords } = await import("../../../apps/dashboard/src/surfaces/today/need-you/sheet/row-words.tsx");
const { useNeedYouModel } = await import("../../../apps/dashboard/src/surfaces/today/need-you-model.ts");
const { setSurfaceValue, surfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");
const { todayPeriodLine } = await import("../../../apps/dashboard/src/surfaces/today/period.ts");
const { todayLeaks } = await import("../../../apps/dashboard/src/surfaces/today/leaks.ts");
const { todayBriefWords } = await import("../../../apps/dashboard/src/surfaces/today/brief-words.ts");
const { reviewsToAnswer } = await import("../../../apps/dashboard/src/surfaces/today/need-you/reviews.ts");

const DAY = 86_400_000;
const old = (id, who, over = {}) => row(id, who, { waitedMs: 9 * DAY, when: "waited 9d", ...over });
const byTestId = (tree, id) => all(tree, (n) => n.props?.["data-testid"] === id)[0] ?? null;
/** The lines of who waits and what waits for an OK, in the page's order, by their row's test id and who. */
const linesOf = (tree) =>
  all(byTestId(tree, "today-queue"), (n) => String(n.props?.className ?? "").includes("calm-line")).map(
    (n) =>
      `${n.props["data-testid"]} ${textOf(all(n, (x) => String(x.props?.className ?? "").includes("calm-name"))[0] ?? null)}`,
  );

/* ------------------------------------------------- the head's sentence ------------------------------------------------ */

const CALM = { tone: "calm", headline: "", detail: null };
const LISTENING = { headline: "Nothing needs you.", sub: "AI is on. Last message Friday 4:12 PM." };

test("with nobody waiting the head says what is listening, on any day; that's everyone only once the member has cleared someone", () => {
  assert.deepEqual(todayHeadLine(CALM, 0, null, LISTENING), {
    lead: "Nothing needs you.",
    rest: LISTENING.sub,
  });
  assert.equal(todayHeadLine(CALM, 0, null, LISTENING, null, true).rest, "That's everyone.");
  assert.equal(
    todayHeadLine(CALM, 0, null, LISTENING, "Today: 2 booked.").rest,
    "Today: 2 booked.",
    "after closing, how today went",
  );
  assert.equal(todayHeadLine(CALM, 2, null, LISTENING).lead, "2 need you.", "someone waiting: how many, as ever");
});

test("what is listening is on every day's read, a day with something in it too, where the quiet day's card is not", () => {
  const busy = toTodayVM(metrics(), [], [], [], NOW);
  assert.equal(busy.quiet, null, "messages came in today: no quiet day");
  assert.match(busy.calm.sub, /^AI is on\./, "REGRESSION: only a quiet day could say it");
});

test("how today went says nothing of a day nothing happened", () => {
  assert.equal(
    todayWentLine([
      { id: "booked", value: 0 },
      { id: "answered", value: 0, of: 0 },
    ]),
    null,
    'REGRESSION: "Today: 0 booked." stood in the head of a closed Sunday',
  );
  assert.equal(
    todayWentLine([
      { id: "booked", value: 0 },
      { id: "answered", value: 3, of: 4 },
    ]),
    "Today: 0 booked, 3 of 4 answered by AI.",
  );
});

/* ------------------------------------------------------ Older ------------------------------------------------------ */

test("one person past a week is counted in the line of what else is left: never the card nor the coral, and AI found still leads", () => {
  setSurfaceValue("today", dayWith([old("o1", "Dana Ruiz", { kind: "callback", prepared: null })]));
  const tree = draw(NeedYou);
  assert.equal(
    byTestId(tree, "today-card"),
    null,
    'REGRESSION: an old number held the page\'s card under "Nothing needs you"',
  );
  assert.equal(corals(tree).length, 0, "nor its coral");
  assert.match(textOf(byTestId(tree, "today-also")), /1 older/, 'REGRESSION: "1 waiting over a week" was said nowhere');
  const model = again(() => useNeedYouModel(surfaceValue("today") ?? null));
  assert.deepEqual(
    [model.coral, model.todo.coral],
    [null, null],
    "REGRESSION: it took the coral from Finish setting up",
  );
  assert.equal(model.draws, false, "REGRESSION: it kept AI found from leading the page");
  setSurfaceValue("today", undefined);
  unmount();
});

test("a toll-free number says so; anyone else keeps the business they work at", () => {
  assert.equal(tollFreeNumber("+18666413860"), true);
  assert.equal(tollFreeNumber("+1 (800) 555-0100"), true);
  assert.equal(tollFreeNumber("+12125550142"), false);
  assert.equal(tollFreeNumber("+448005550100"), false, "North America's prefix alone: 800 elsewhere is no such thing");
  assert.equal(tollFreeNumber("Dana Ruiz"), false);
  assert.equal(tollFreeNumber(null), false);
  // The row the Inbox's Needs you draws for them (inbox/pages/list-folds.tsx).
  const words = olderWords(old("o1", "+1 (866) 641-3860", { phone: "+18666413860", kind: "callback" }));
  assert.equal(words.trail, "toll-free");
  assert.equal(words.via, null, "a number's face is already the phone: REGRESSION: two phones on one row");
});

test("AI is asked for an old row's draft only as it is opened: most are let go unread, and a draft is a model's turn", async () => {
  atWidth(true);
  setSurfaceValue("reply_drafts", undefined);
  // One who waits now beside the old one: the ask this waits on names them alone.
  const now = row("w1", "Rosa Diaz", { prepared: null, waitedMs: 3_600_000 });
  setSurfaceValue("today", dayWith([now, old("o1", "Dana Ruiz", { prepared: null })]));
  wire.length = 0;
  draw(NeedYou);
  const drafts = () => wire.filter((w) => w.path === "/api/v1/conversations/drafts");
  await until(() => drafts().length > 0, "the drafts asked for");
  assert.deepEqual(
    drafts().flatMap((w) => new URLSearchParams(w.query).get("ids")?.split(",") ?? []),
    ["cv-w1"],
    "REGRESSION: a phone asked for a draft nobody could open",
  );
  atWidth(false);
  setSurfaceValue("today", undefined);
  bridgeHolds({ reads: { reach_out_replies: undefined } });
  unmount();
});

/* -------------------------------------------------- what a press says -------------------------------------------------- */

test("the period line drops a zero where it has something else to say, and keeps it where it is the comparison", () => {
  const headline = (over) => ({
    lead: "Last 90 days",
    empty: false,
    messages: { total: 0, compare: null },
    answered: { share: null },
    calls: 15,
    ...over,
  });
  assert.equal(todayPeriodLine(headline({})).text, "Last 90 days: 15 calls.", 'REGRESSION: "0 messages, 15 calls"');
  assert.equal(
    todayPeriodLine(headline({ messages: { total: 0, compare: "down from 3" } })).text,
    "Last 90 days: 0 messages (down from 3), 15 calls.",
  );
});

test("a figure with no door of its own opens the place that holds it, so all four on a phone go somewhere", () => {
  assert.deepEqual(
    ["booked", "answered", "calls", "new"].map((id) => figureDoorOf(id).to),
    ["calendar", "inbox", "conversations/phone", "clients/seg:new_week"],
  );
});

/** The headline's reads as Ask found's rule reads them, around a booking line. */
const reportsWith = (booking) => ({
  booking: toBookingReportVM(booking),
  rangeLabel: "90 days",
  messages: { total: 12 },
  answered: { none: 0, ai: 0, you: 0 },
});
const NO_PEOPLE = { lists: [], rows: [] };

test("Booking gap asks about the calendar first where nobody in People is on it, and opens where it is chosen", () => {
  const empty = todayLeaks(
    reportsWith({ calendar: "ok", days: 90, asked: 12, booked: 0, people_on_calendar: 0 }),
    NO_PEOPLE,
    [],
  ).rows.find((r) => r.id === "never-booked");
  assert.match(empty.text, /nobody in People is on your calendar/);
  assert.equal(empty.tag, "Calendar");
  assert.equal(empty.cta.to, "admin/workspace/calendar");
  const some = todayLeaks(
    reportsWith({ calendar: "ok", days: 90, asked: 12, booked: 0, people_on_calendar: 4 }),
    NO_PEOPLE,
    [],
  ).rows.find((r) => r.id === "never-booked");
  assert.match(some.text, /Not one of them is on the calendar/);
  assert.equal(some.tag, "Booking gap");
  const uncounted = todayLeaks(
    reportsWith({ calendar: "ok", days: 90, asked: 12, booked: 0 }),
    NO_PEOPLE,
    [],
  ).rows.find((r) => r.id === "never-booked");
  assert.equal(uncounted.tag, "Booking gap", "a read that did not count them says what it always said");
});

test("Listen is offered only where the brief has news", () => {
  const quiet = dayWith([], { figures: [{ id: "booked", value: 0 }], recap: { line: "", sentences: [] } });
  assert.equal(todayBriefWords(quiet, null, []).news, false, "REGRESSION: six seconds of what the head already says");
  assert.equal(
    todayBriefWords({ ...quiet, figures: [{ id: "calls", value: 2 }] }, null, []).news,
    true,
    "calls came in",
  );
  const run = { label: "Spring offer", sentence: "It waits for your OK." };
  assert.equal(todayBriefWords(quiet, null, [run]).news, true, "a run waits");
});

test("Not today's Undo lets one rest go and keeps the others; those run out go with it", () => {
  const today = "2026-09-18";
  const two = restedWith(restedWith({}, "a", today), "b", today);
  assert.deepEqual(Object.keys(restedWithout(two, "a", today)), ["b"]);
  assert.deepEqual(restedWithout({ a: "2026-09-01", b: "2026-09-25" }, "c", today), { b: "2026-09-25" });
});

test("a review at rest is not offered, by the one rule AI found's rows rest by", () => {
  const google = {
    dto: {
      connection: { id: "g" },
      reviews: [
        { id: "r1", published_at: "2026-09-18", reply_text: null, draft_text: null },
        { id: "r2", published_at: "2026-09-17", reply_text: null, draft_text: null },
      ],
    },
  };
  const ids = (rests) => reviewsToAnswer(google, rests).map((r) => r.id);
  assert.deepEqual(
    ids(() => false),
    ["r1", "r2"],
  );
  assert.deepEqual(
    ids((key) => key === "review:r1"),
    ["r2"],
  );
});

test("one list in the owner's order (docs/words.md): who waits on a word, the first the card and the next lines, then what waits for an OK; who waited past a week counted under them", () => {
  setSurfaceValue(
    "today",
    dayWith([
      row("f1", "Ana Reyes"),
      row("f2", "Bea Lind"),
      old("o1", "Dana Ruiz"),
      old("o2", "Kai Moreno"),
      row("s1", "Pilates studios", { kind: "search", act: "answer" }),
    ]),
  );
  const tree = draw(NeedYou);
  assert.match(textOf(byTestId(tree, "today-card")), /Ana Reyes/, "who waited longest on a word holds the card");
  assert.deepEqual(
    linesOf(tree).filter((l) => !/Ana Reyes/.test(l)),
    ["queue-handoff Bea Lind", "queue-search Pilates studios"],
    "then who else waits, then what waits for an OK: no head over any of them",
  );
  const also = byTestId(tree, "today-also");
  assert.equal(also.props["aria-label"], TODAY_LINE_WORDS.also, "the line of what else is left, named for a reader");
  assert.match(textOf(also), /2 older/, "whoever waited past a week, counted there");
  setSurfaceValue("today", undefined);
  unmount();
});

test("a search that stopped to ask is whole in the card (D8): its question once, what to change in words, that nothing is spent, its two answers", () => {
  // Today, calm drew the two answers alone, and the nightly's own case of it was red from that day (22 Nov 2026).
  setSurfaceValue("today", dayWith([row("s1", "Pilates studios", { kind: "search", act: "answer" })]));
  const card = byTestId(draw(NeedYou), "today-card");
  const search = dayWith([row("s1", "Pilates studios", { kind: "search", act: "answer" })]).queue.rows[0];
  assert.ok(byTestId(card, "queue-search"), "the search holds the card");
  assert.ok(
    all(card, (n) => n.props?.placeholder === NEED_YOU_WORDS.search.change).length,
    "a line to say what to change",
  );
  assert.ok(textOf(card).includes(NEED_YOU_WORDS.search.nothingSpent), "and that nothing is spent while it waits");
  for (const answer of [NEED_YOU_WORDS.search.stop, NEED_YOU_WORDS.search.keep])
    assert.ok(textOf(card).includes(answer), `its answer: ${answer}`);
  assert.equal(textOf(card).split(search.sentence).length - 1, 1, `the question is said once: ${textOf(card)}`);
  setSurfaceValue("today", undefined);
  unmount();
});
