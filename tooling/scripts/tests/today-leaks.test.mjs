/**
 * Two reads Today did not have: the few things worth a look that no row on
 * the page says on its own, and the bell as Today should show it rather than
 * as the bell lists it.
 *
 * Both are pure. The page hands in the surfaces it already holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { todayLeaks, todayAwayGrouped, TODAY_LEAK_MAX } from "@chanlytics/contracts";

const list = (id, label, count, action = null) => ({ id, label, group: "journey", count, action });
const act = (cta, to, enabled = true) => ({ text: "", cta, to, enabled });

/** The salon's own numbers on 17 Sep 2026, which is where every rule below came from. */
const reports = (over = {}) => ({
  vm: {
    days: 30, rangeLabel: "30 days", since: "Aug 19", until: "Sep 17", empty: false, tiles: [],
    answered: { totals: { in: 21, ai: 16, you: 1, none: 4 } },
    reasons: [{ id: "manual", label: "Flagged by you", value: 2 }, { id: "opt_out", label: "Asked to stop", value: 1 }],
    ...(over.vm || {}),
  },
  campaigns: { tiles: [], empty: false },
  booking: { present: true, headline: "0 of 18 booked", sub: "", pct: 0, asked: 18, booked: 0 },
  ...(({ vm: _vm, ...rest }) => rest)(over),
});

const people = (over = []) => ({
  lists: over.length ? over : [
    list("asked_never_booked", "Asked, never booked", 17, act("Text the booking link", "broadcasts/asked_never_booked")),
    list("opted_in", "Said yes to messages", 7, act("Get their yes to offers", "broadcasts")),
    list("offers_ok", "Can receive offers", 0, act("Broadcast to everyone who said yes", "broadcasts", false)),
    list("quiet", "Quiet 30+ days", 6, act("Reach out", "broadcasts/quiet")),
  ],
  aggregates: { total: 28 },
});

test("the leak that costs a customer comes first, and it carries the arithmetic that makes it believable", () => {
  const out = todayLeaks(reports(), people());
  assert.equal(out.length, TODAY_LEAK_MAX, "two, never a list");
  assert.deepEqual(out.map((l) => l.id), ["never-booked", "unanswered"]);
  const [first] = out;
  assert.equal(first.text, "18 people wrote or called in the last 30 days. Not one of them is on the calendar.");
  assert.equal(first.math, "0 of 18 booked · 17 on Asked, never booked", "both pages' numbers, said together");
  assert.deepEqual(first.cta, { label: "See who", to: "clients/seg:asked_never_booked" });
  assert.deepEqual(first.also, { label: "Text the booking link", to: "broadcasts/asked_never_booked" });
  assert.equal(out[1].text, "4 customer messages never got an answer at all.");
  assert.equal(out[1].math, "of 21 in the last 30 days · the receptionist answered 16, you answered 1");
  assert.equal(out[1].also, null, "a message nobody answered has no button; the messages are past");
});

test("a healthy workspace gets no band at all -- nothing here congratulates anyone", () => {
  const clean = reports({ vm: { answered: { totals: { in: 21, ai: 20, you: 1, none: 0 } } }, booking: { present: true, headline: "16 of 18 booked", sub: "", pct: 89, asked: 18, booked: 16 } });
  assert.deepEqual(todayLeaks(clean, people([list("quiet", "Quiet 30+ days", 1, null)])), []);
  assert.deepEqual(todayLeaks(null, null), []);
  assert.deepEqual(todayLeaks(clean, null), []);
});

test("small numbers never fire: two people who did not book is a quiet week", () => {
  const tiny = reports({ booking: { present: true, headline: "0 of 4 booked", sub: "", pct: 0, asked: 4, booked: 0 } });
  assert.ok(!todayLeaks(tiny, people(), 4).some((l) => l.id === "never-booked"), "four asked is under the floor");
  const noCal = reports({ booking: { present: false, headline: "—", sub: "Connect your calendar under Settings › Business to see who booked.", pct: null, asked: 0, booked: 0 } });
  assert.ok(!todayLeaks(noCal, people(), 4).some((l) => l.id === "never-booked"), "no calendar is not a leak, it is a setup step");
});

test("some booked, but few: the sentence changes and the number is theirs", () => {
  const some = reports({ vm: { answered: { totals: { in: 21, ai: 21, you: 0, none: 0 } } }, booking: { present: true, headline: "3 of 18 booked", sub: "", pct: 17, asked: 18, booked: 3 } });
  const [one] = todayLeaks(some, people());
  assert.equal(one.text, "Only 3 of the 18 people who wrote or called in the last 30 days got onto the calendar.");
});

test("a list nobody can be mailed, and a list gone quiet -- the two that cost a chance, in that order", () => {
  const quietBooks = reports({ vm: { answered: { totals: { in: 9, ai: 9, you: 0, none: 0 } } }, booking: { present: true, headline: "8 of 9 booked", sub: "", pct: 89, asked: 9, booked: 8 } });
  const out = todayLeaks(quietBooks, people(), 4);
  assert.deepEqual(out.map((l) => l.id), ["unreachable", "quiet"]);
  assert.equal(out[0].text, "7 people have said yes to messages, but nobody has said yes to offers.");
  assert.deepEqual(out[0].also, { label: "Get their yes to offers", to: "broadcasts" });
  assert.equal(out[1].math, "of 28 in People");
  assert.deepEqual(out[1].also, { label: "Reach out", to: "broadcasts/quiet" }, "the list's own step, when the list can run it");
  const held = todayLeaks(quietBooks, { lists: [list("quiet", "Quiet 30+ days", 6, act("Reach out", "broadcasts/quiet", false))] }, 4);
  assert.equal(held[0].also, null, "a step nobody can take is not offered");
});

/* --------------------------- while you were away ------------------------- */

const bell = (id, kind, title, tone = "", about = null) => ({ id, kind, title, message: "", tone, icon: "bell", unread: true, about });

test("a conversation already in the queue above is not said again here", () => {
  const rows = [
    bell("n:1", "handoff", "Zoe Martin needs you", "warn", { type: "conversation", id: "cv-1" }),
    bell("n:2", "handoff", "Daniela Reyes needs you", "warn", { type: "conversation", id: "cv-2" }),
    bell("n:3", "review", "1 new rating on Google", "ok"),
  ];
  const out = todayAwayGrouped(rows, ["cv-1", "cv-2"]);
  assert.deepEqual(out.groups.map((g) => g.row.id), ["n:3"]);
  assert.equal(out.total, 1, "the count is what is left, not what the bell holds");
  const noQueue = todayAwayGrouped(rows, []);
  assert.equal(noQueue.groups.length, 2, "two handoffs group; without the queue they still belong here");
  assert.equal(noQueue.groups[0].title, "2 conversations need you");
});

test("twelve calls from the same line are one row that says twelve, and the warning nobody could see comes first", () => {
  const rows = [
    ...Array.from({ length: 12 }, (_, i) => bell(`c${i}`, "call", `+1 (929) 370-9606 phoned · ${i} s`)),
    bell("r1", "review", "1 new rating on Google", "ok"),
    bell("r2", "review", "1 new rating on Google", "ok"),
    bell("j1", "job_failed", "A broadcast_send job did not finish", "warn"),
    bell("j2", "job_failed", "A outbound_send job did not finish", "warn"),
    bell("q", "number", "WhatsApp number: quality rating is now Yellow", "warn"),
  ];
  const { groups, more, total } = todayAwayGrouped(rows, [], 5);
  assert.equal(total, 17);
  assert.deepEqual(groups.map((g) => g.title ?? g.row.title), [
    "2 jobs did not finish",
    "WhatsApp number: quality rating is now Yellow",
    "12 calls",
    "2 new ratings on Google",
  ], "warnings first, then the bell's own order; five identical hangups no longer bury the downgrade");
  assert.equal(more, 0);
  const calls = groups.find((g) => g.title === "12 calls");
  assert.equal(calls.count, 12);
  assert.equal(calls.ids.length, 12, "read and dismiss must reach every row the group swallowed");
  assert.equal(calls.row.id, "c0", "the newest of the group is the one it shows");
});

test("a kind with no noun never groups: a new alert shows itself rather than joining a total", () => {
  const rows = [bell("a", "billing", "Your card was declined", "warn"), bell("b", "billing", "Your trial ends Friday", "warn")];
  const { groups } = todayAwayGrouped(rows);
  assert.deepEqual(groups.map((g) => g.row.id), ["a", "b"]);
  assert.ok(groups.every((g) => g.title === null && g.count === 1));
});

test("read rows are not away rows, the cap counts groups, and an empty bell says nothing", () => {
  const rows = [
    { id: "x", kind: "alert", title: "old", message: "", tone: "", icon: "bell", unread: false },
    ...Array.from({ length: 7 }, (_, i) => bell(`k${i}`, "alert", `row ${i}`)),
  ];
  const out = todayAwayGrouped(rows, [], 5);
  assert.equal(out.groups.length, 5);
  assert.equal(out.more, 2);
  assert.equal(out.total, 7);
  assert.deepEqual(todayAwayGrouped([]), { groups: [], more: 0, total: 0 });
});

test("a row the bell keyed rather than numbered still carries its id through a group", () => {
  const rows = [
    { key: "needs:th-1", kind: "call", title: "a", message: "", tone: "", icon: "phone", unread: true },
    { key: "needs:th-2", kind: "call", title: "b", message: "", tone: "", icon: "phone", unread: true },
  ];
  assert.deepEqual(todayAwayGrouped(rows).groups[0].ids, ["needs:th-1", "needs:th-2"]);
});
