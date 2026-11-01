/**
 * What Glass puts above Today (surfaces/today/pages/today-head.tsx, the plan's step 5.4, canvas E3): the greeting by the
 * hour in the business's zone to the member's first name (said by Today's address from the frame's first draw,
 * surfaces/today/chrome.ts), stacked over its one sentence (what that sentence says is contracts' todayHeadLine, held by
 * today-phone-words.test.mjs, and how the page tells it, by today-page.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact } from "../_legacy-react.mjs";

installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
const { todayGreeting } = await import("../../../../apps/dashboard/src/surfaces/today/chrome.ts");
const { PageHead } = await import("../../../../apps/dashboard/src/surfaces/kit/head/page-head.tsx");

// Friday 2 October 2026, 4:02 PM in New York (20:02 UTC).
const AFTERNOON = Date.UTC(2026, 9, 2, 20, 2, 0);
const ZONE = "America/New_York";

test("the greeting follows the hour in the business's zone, and says the member's first name", () => {
  assert.equal(todayGreeting(AFTERNOON, ZONE, "Marisa Reyes"), "Good afternoon, Marisa");
  assert.equal(todayGreeting(Date.UTC(2026, 9, 2, 13, 5, 0), ZONE, "Marisa"), "Good morning, Marisa");
  assert.equal(todayGreeting(Date.UTC(2026, 9, 3, 1, 30, 0), ZONE, "Marisa"), "Good evening, Marisa");
  assert.equal(
    todayGreeting(AFTERNOON, "Asia/Tokyo", "Marisa"),
    "Good morning, Marisa",
    "5:02 AM the next day is the morning there",
  );
});

test("a member with no name is greeted without one", () => {
  assert.equal(todayGreeting(AFTERNOON, ZONE, null), "Good afternoon");
  assert.equal(todayGreeting(AFTERNOON, ZONE, "   "), "Good afternoon");
  assert.equal(todayGreeting(AFTERNOON, ZONE, undefined), "Good afternoon");
});

test("Today's head stands its sentence under its name", () => {
  const head = PageHead({ dateline: "Friday", title: "Good afternoon, Marisa", sentence: "s", stacked: true });
  assert.equal(head.props.className, "pg-head pg-head-stacked");
  assert.equal(PageHead({ title: "Inbox" }).props.className, "pg-head", "and a head not stacked says nothing of it");
});
