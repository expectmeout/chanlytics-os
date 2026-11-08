/**
 * Today on a calm day, and every press going somewhere (8 Nov 2026), over the real contracts and the zones on the stub
 * React. Each case was a gap the review of that day found on a Sunday with nothing waiting but one old number:
 *
 * - "That's everyone" over no one, where one row nobody counts had taken "The receptionist is on" away;
 * - the old row a button that opened nothing, taking the coral from Finish setting up and keeping Ask found under an empty day;
 * - Mark all done for one person, and a call back's note that said to mark it done with nothing there to do it;
 * - "0 messages, 15 calls", and a figure on a phone that could say nothing unless it happened to have a receipt;
 * - "Not one of them is on the calendar" over a calendar nobody is on;
 * - Not today with no Undo, and two rules for one word.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  figureDoorOf,
  restedWith,
  restedWithout,
  todaySince,
  toBookingReportVM,
  todayHeadLine,
  todayWentLine,
  toTodayVM,
  tollFreeNumber,
} from "@chanlytics/contracts";
import { again, all, atWidth, textOf, unmount } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import { NOW, W, answerWith, dayWith, draw, flashes, json, metrics, row, wire } from "./_world.mjs";

const { NeedYou } = await import("../../../apps/dashboard/src/surfaces/today/zones/need-you.tsx");
const { AttnRow } = await import("../../../apps/dashboard/src/surfaces/kit/attention/attn-row.tsx");
const { useCoralHeld, useZoneDrawn } = await import("../../../apps/dashboard/src/surfaces/today/queue-coral.ts");
const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");
const { todayPeriodLine } = await import("../../../apps/dashboard/src/surfaces/today/period.ts");
const { todayLeaks } = await import("../../../apps/dashboard/src/surfaces/today/leaks.ts");
const { todayBriefWords } = await import("../../../apps/dashboard/src/surfaces/today/brief-words.ts");
const { reviewsToAnswer } = await import("../../../apps/dashboard/src/surfaces/today/need-you/reviews.ts");

const DAY = 86_400_000;
const old = (id, who, over = {}) => row(id, who, { waitedMs: 9 * DAY, when: "waited 9d", ...over });
const rowsDrawn = (tree) => all(tree, (n) => n.type === AttnRow);
const testidOf = (n) => n.props.testid;

/* ------------------------------------------------- the head's sentence ------------------------------------------------ */

const CALM = { tone: "calm", headline: "", detail: null };
const LISTENING = { headline: "Nothing needs you.", sub: "The receptionist is on. Last message Friday 4:12 PM." };

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
  assert.match(busy.calm.sub, /^The receptionist is on\./, "REGRESSION: only a quiet day could say it");
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
    "Today: 0 booked, 3 of 4 answered by the receptionist.",
  );
});

/* ------------------------------------------------------ Older ------------------------------------------------------ */

test("one person past a week is their own row: who, Mark done, and a press on it opens them; never the coral", () => {
  setSurfaceValue("today", dayWith([old("o1", "Dana Ruiz", { kind: "callback", prepared: null })]));
  const tree = draw(NeedYou);
  const [r] = rowsDrawn(tree).filter((n) => testidOf(n) === "queue-older");
  assert.equal(r.props.name, "Dana Ruiz", 'REGRESSION: "1 waiting over a week" named no one in the row\'s own name');
  assert.equal(r.props.cta.label, "Mark done", "REGRESSION: Mark all done, for one person");
  assert.equal(r.props.cta.kind, "ghost", 'REGRESSION: an old number held the page\'s coral under "Nothing needs you"');
  assert.equal(typeof r.props.onOpen, "function", "REGRESSION: it looked pressable and opened nothing");
  assert.equal(
    again(() => useCoralHeld("queue")),
    false,
    "REGRESSION: it took the coral from Finish setting up",
  );
  assert.equal(
    again(() => useZoneDrawn("need-you")),
    false,
    "REGRESSION: it kept Ask found from leading the page",
  );
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
  setSurfaceValue("today", dayWith([old("o1", "+1 (866) 641-3860", { phone: "+18666413860", kind: "callback" })]));
  const [r] = rowsDrawn(draw(NeedYou)).filter((n) => testidOf(n) === "queue-older");
  assert.equal(r.props.trail, "toll-free");
  assert.equal(r.props.via, null, "a number's face is already the phone: REGRESSION: two phones on one row");
  setSurfaceValue("today", undefined);
  unmount();
});

test("several are one row, how many and who, with Mark all done, and a press opens each of them in place", () => {
  setSurfaceValue("today", dayWith([old("o1", "Dana Ruiz"), old("o2", "Kai Moreno")]));
  const first = rowsDrawn(draw(NeedYou)).filter((n) => testidOf(n) === "queue-older");
  assert.equal(first.length, 1);
  assert.equal(first[0].props.cta.label, "Mark all done");
  assert.equal(first[0].props.cta.kind, "ghost");
  first[0].props.onOpen();
  const opened = rowsDrawn(again(() => W.React.createElement(NeedYou, {}))).filter(
    (n) => testidOf(n) === "queue-older",
  );
  assert.deepEqual(
    opened.map((n) => n.props.name),
    ["2 waiting over a week", "Dana Ruiz", "Kai Moreno"],
  );
  opened[0].props.onOpen();
  setSurfaceValue("today", undefined);
  unmount();
});

test("Mark done refused says why and the row stays to be pressed again", async () => {
  setSurfaceValue("today", dayWith([old("o1", "Dana Ruiz")]));
  answerWith(() => json(403, { ok: false, error: { code: "forbidden", message: "Not yours to give back." } }));
  flashes.length = 0;
  const olderOf = (tree) => rowsDrawn(tree).find((n) => testidOf(n) === "queue-older");
  olderOf(draw(NeedYou)).props.cta.onClick();
  await until(() => flashes.length > 0, "the refusal said");
  assert.equal(flashes.at(-1)?.tone, "danger");
  const still = olderOf(again(() => W.React.createElement(NeedYou, {})));
  assert.ok(still.props.cta, "the press stays");
  assert.equal(still.props.work, null, "and nothing says they were marked done");
  setSurfaceValue("today", undefined);
  unmount();
});

test("Ask is asked for an old row's draft only as it is opened: most are let go unread, and a draft is a model's turn", async () => {
  atWidth(true);
  setSurfaceValue("reply_drafts", undefined);
  setSurfaceValue("today", dayWith([old("o1", "Dana Ruiz", { prepared: null })]));
  wire.length = 0;
  draw(NeedYou);
  await new Promise((r) => setImmediate(r));
  assert.equal(
    wire.filter((w) => w.path === "/api/v1/conversations/drafts").length,
    0,
    "REGRESSION: a phone asked for a draft nobody could open",
  );
  atWidth(false);
  setSurfaceValue("today", undefined);
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

test("Since you looked's answered row opens the thread it names; a read with no thread opens nothing", () => {
  const since = (conversation_id) =>
    todaySince({
      seenAt: "2026-09-18T12:00:00Z",
      answered: { count: 1, last: { who: "Robin", text: "Yes!", at: "2026-09-18T13:00:00Z", conversation_id } },
      notes: [],
      covered: [],
      tz: "America/New_York",
      nowMs: NOW.getTime(),
    }).rows[0];
  assert.equal(since("c1").to, "inbox/th-c1", "REGRESSION: it named someone and opened nothing");
  assert.equal(since(undefined).to, null, "an older server's read");
});

test("Not today's Undo lets one rest go and keeps the others; those run out go with it", () => {
  const today = "2026-09-18";
  const two = restedWith(restedWith({}, "a", today), "b", today);
  assert.deepEqual(Object.keys(restedWithout(two, "a", today)), ["b"]);
  assert.deepEqual(restedWithout({ a: "2026-09-01", b: "2026-09-25" }, "c", today), { b: "2026-09-25" });
});

test("a review at rest is not offered, by the one rule Ask found's rows rest by", () => {
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

test("the drawn row's words reach a reader", () => {
  setSurfaceValue("today", dayWith([old("o1", "Dana Ruiz")]));
  const group = all(draw(NeedYou), (n) => n.props?.["data-testid"] === "today-group-old")[0];
  assert.equal(group.props["aria-label"], "Older", "no head drawn over it, its name for a reader alone");
  assert.match(textOf(group), /Dana Ruiz/);
  setSurfaceValue("today", undefined);
  unmount();
});
