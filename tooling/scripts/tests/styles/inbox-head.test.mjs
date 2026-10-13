/**
 * What the Inbox puts above itself (surfaces/inbox/pages/inbox-head.tsx, the plan's step 5.4):
 * the sentence that says where the Inbox stands, said from the same rules as the sidebar's badge; the date in the
 * business's zone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact } from "../_legacy-react.mjs";

installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
const { inboxStanding } = await import("../../../../apps/dashboard/src/surfaces/inbox/pages/inbox-head.tsx");
const { pageDateline, pageDatelineParts } =
  await import("../../../../apps/dashboard/src/surfaces/kit/head/dateline.ts");
const { PageHead } = await import("../../../../apps/dashboard/src/surfaces/kit/head/page-head.tsx");

// Friday 2 October 2026, 4:02 PM in New York (20:02 UTC).
const NOW = Date.UTC(2026, 9, 2, 20, 2, 0);
const ZONE = "America/New_York";
const MIN = 60_000;
/** A real thread nobody has taken, which has been waiting `waitingMin` minutes. */
const waiting = (id, waitingMin) => ({ id, real: true, state: "escalated", needsYou: true, waitingMin });
/** A real thread whose reply counts down to auto-send for another 42 seconds. */
const sending = (id) => ({
  id,
  real: true,
  state: "escalated",
  needsYou: false,
  veto: { messageId: `m-${id}`, endsAtMs: NOW + 42_000 },
});
const handled = (id) => ({ id, real: true, state: "done", needsYou: false });

test("the dateline is the day and the time in the business's zone, not the machine's", () => {
  assert.equal(pageDateline(NOW, ZONE), "Friday, October 2 · 4:02 PM");
  assert.equal(pageDateline(NOW, "Asia/Tokyo"), "Saturday, October 3 · 5:02 AM");
  // The day and the hour apart: a phone's head says the day alone (the canvases' phone boards; kit.css hides the hour's
  // span), and the line is the two joined, so neither can drift from the other.
  assert.deepEqual(pageDatelineParts(NOW, ZONE), { day: "Friday, October 2", time: "4:02 PM" });
});

test("the standing sentence counts what waits on you and names the oldest's hour", () => {
  const threads = [waiting("a", 96), waiting("b", 42), waiting("c", 18), waiting("d", 5), handled("e")];
  assert.equal(inboxStanding(threads, NOW, ZONE), "4 need you · the oldest since 2:26 PM");
  assert.equal(
    new Date(NOW - 96 * MIN).getUTCHours(),
    18,
    "96 minutes before 20:02 UTC is 18:26 UTC, 2:26 PM in New York",
  );
});

test("a draft counting down waits on you, and the sentence says it is on its way in place of the oldest", () => {
  const threads = [waiting("a", 96), waiting("b", 42), sending("c"), handled("e")];
  assert.equal(inboxStanding(threads, NOW, ZONE), "3 need you · 1 draft on its way");
  assert.equal(
    inboxStanding([sending("c"), sending("d")], NOW, ZONE),
    "2 need you · 2 drafts on their way",
    "Today's words for them (contracts todayDraftsSub), in the plural",
  );
});

test("the head says the badge's other parts: a hold whose thread was not read needs you, and a run waiting is said after (S7-2)", () => {
  assert.equal(
    inboxStanding([], NOW, ZONE, { runs: 1, unreadHolds: 0 }),
    "No customer needs you · 1 run waiting",
    "REGRESSION: the head said 'Nothing needs you' under a badge of one, a campaign run waiting for a yes",
  );
  assert.equal(inboxStanding([], NOW, ZONE, { runs: 0, unreadHolds: 2 }), "2 need you");
  assert.equal(
    inboxStanding([waiting("a", 96)], NOW, ZONE, { runs: 2, unreadHolds: 1 }),
    "2 need you · the oldest since 2:26 PM · 2 runs waiting",
  );
  assert.equal(
    inboxStanding([sending("c")], NOW, ZONE, { runs: 1, unreadHolds: 0 }),
    "1 need you · 1 draft on its way · 1 run waiting",
  );
  assert.equal(inboxStanding([], NOW, ZONE, { runs: 0, unreadHolds: 0 }), "Nothing needs you");
});

test("nothing waiting is said plainly, and a thread with no wait yet says no hour", () => {
  assert.equal(inboxStanding([handled("e")], NOW, ZONE), "Nothing needs you");
  assert.equal(inboxStanding([], NOW, ZONE), "Nothing needs you");
  assert.equal(inboxStanding([waiting("a", 0)], NOW, ZONE), "1 need you");
});

test("the page head is its date, its name as the page's heading and its sentence, and only what it has", () => {
  const full = PageHead({ dateline: "Friday, October 2 · 4:02 PM", title: "Inbox", sentence: "4 need you" });
  assert.equal(full.type, "header");
  assert.equal(full.props.className, "pg-head");
  const [dateline, line] = full.props.children;
  assert.equal(dateline.props.className, "pg-dateline");
  const [title, sentence] = line.props.children;
  assert.equal(title.type, "h1");
  assert.deepEqual([title.props.children].flat(), ["Inbox"]);
  assert.equal(sentence.props.className, "pg-sentence");
  const bare = PageHead({ title: "Inbox" });
  const [noDate, bareLine] = bare.props.children;
  assert.equal(noDate, null);
  assert.equal(bareLine.props.children[1], null);
});

test("the oldest's time says its day when it is not today, as Today's headline says the same wait (the 2 Oct 2026 audit, A5)", () => {
  // 1,800 minutes before 4:02 PM on Friday is 10:02 AM on Thursday: a bare "10:02 AM" read as this morning's.
  assert.equal(
    inboxStanding([waiting("a", 1_800), waiting("b", 5)], NOW, ZONE),
    "2 need you · the oldest since yesterday 10:02 AM",
  );
  // Four days: the weekday, and past a week the date, in the one spelling Today's headline uses (tzSince).
  assert.equal(inboxStanding([waiting("a", 4 * 1440)], NOW, ZONE), "1 need you · the oldest since Mon 4:02 PM");
  assert.equal(inboxStanding([waiting("a", 20 * 1440)], NOW, ZONE), "1 need you · the oldest since Sep 12, 4:02 PM");
});

test("the oldest's time is the escalation's own: it stays put as the minutes go by, where a count of minutes drifted later", () => {
  const since = NOW - 96 * MIN;
  const real = (id) => ({ ...waiting(id, 96), escalatedAtMs: since });
  assert.equal(inboxStanding([real("a")], NOW, ZONE), "1 need you · the oldest since 2:26 PM");
  // Eleven minutes on, the page has not read again: waitingMin is still the 96 it was built with.
  assert.equal(
    inboxStanding([real("a")], NOW + 11 * MIN, ZONE),
    "1 need you · the oldest since 2:26 PM",
    "REGRESSION: it said 2:37 PM, eleven minutes after the wait began",
  );
  // The oldest of several, by its own time; a thread with no wait yet gives none.
  const older = { ...waiting("b", 200), escalatedAtMs: NOW - 200 * MIN };
  assert.equal(inboxStanding([real("a"), older, waiting("c", 0)], NOW, ZONE), "3 need you · the oldest since 12:42 PM");
});
