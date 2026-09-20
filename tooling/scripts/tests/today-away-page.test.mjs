/**
 * "While you were away", EXECUTED: the head is the bell's badge, the foot
 * accounts for every unread row not on screen, and the empty line never
 * congratulates over unread work.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { todayAwayGrouped, todayDay, todayLeaks, todayPeriodLine, todayRunWords, todayRunsSub, todayRunApproved, unreadCount } from "@chanlytics/contracts";
import { installLegacyReact, fresh, find, byTestId, textOf } from "./_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false });
globalThis.appNavigate = () => {};
const L = "../../../apps/dashboard/src/legacy";
await import(`${L}/pages/dashboard-a-week.jsx`);

const queued = (cv, who) => ({ id: `needs:th-${cv}`, key: `needs:th-${cv}`, kind: "needs_you", title: `${who} needs you`, message: "", tone: "warn", icon: "alert", unread: true, about: null, time: "2m", actions: [{ label: "Open", to: "inbox", primary: true }] });
const news = (id, title) => ({ id, kind: "review", title, message: "", tone: "ok", icon: "star", unread: true, about: null, time: "1h", actions: [{ label: "Open", to: "reports", primary: true }] });

const draw = (rows, cvs) => {
  fresh();
  globalThis.__notifs = { feed: () => rows, onChange: () => () => {}, read() {}, dismiss() {}, seenAll() {} };
  globalThis.__today = { awayGrouped: todayAwayGrouped, day: todayDay, leaks: todayLeaks, periodLine: todayPeriodLine, runs: todayRunWords, runsSub: todayRunsSub, runApproved: todayRunApproved };
  globalThis.TODAY_DATA = { queue: { rows: cvs.map((id) => ({ conversationId: id, callId: null })) } };
  return globalThis.React.createElement(globalThis.TodayAway, {});
};
const byClass = (tree, cls) => find(tree, (n) => String(n.props?.className || "").includes(cls));

test("the head is the bell's badge and the foot accounts for the rest", () => {
  const rows = [queued("cv-1", "Zoe Martin"), queued("cv-2", "Daniela Reyes"), news("n:3", "1 new rating on Google")];
  const tree = draw(rows, ["cv-1", "cv-2"]);
  const head = byClass(tree, "tq-count");
  assert.equal(textOf(head).trim(), String(unreadCount(rows)), "the card's head and the bell's badge are one number");
  assert.equal(textOf(head).trim(), "3");
  assert.equal(textOf(byClass(tree, "tq-foot")).trim(), "2 more in the bell, already in the queue above");
});

test("REGRESSION: empty because the queue above has everything -- no green check, no \"All caught up.\"", () => {
  const rows = ["cv-1", "cv-2", "cv-3", "cv-4"].map((cv, i) => queued(cv, `Person ${i}`));
  const tree = draw(rows, ["cv-1", "cv-2", "cv-3", "cv-4"]);
  const line = byTestId(tree, "today-away-empty");
  assert.ok(line, "the card still says something rather than nothing");
  assert.ok(!textOf(line).includes("All caught up"), "REGRESSION: four unread rows and the card congratulated the owner");
  assert.ok(textOf(line).includes("Everything new is already in the queue above."));
  const icon = find(line, (n) => n.type === "Icon");
  assert.equal(icon.props.name, "arrow-up", "no check mark over unread work");
  assert.equal(textOf(byClass(tree, "tq-count")).trim(), "4", "the head does not read 0 while the bell reads 4");
  assert.equal(byClass(tree, "tq-foot"), null, "the head has said 4 once; the line says where they are");
});

test("nothing unread anywhere is the one state that may say \"All caught up.\"", () => {
  const tree = draw([{ ...news("n:1", "old"), unread: false }], []);
  const line = byTestId(tree, "today-away-empty");
  assert.ok(textOf(line).includes("All caught up."));
  assert.equal(find(line, (n) => n.type === "Icon").props.name, "check");
  assert.equal(textOf(byClass(tree, "tq-count")).trim(), "0");
});
