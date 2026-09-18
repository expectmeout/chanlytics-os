/**
 * Two reads Today did not have: the few things worth a look that no row on
 * the page says on its own, and the bell as Today should show it rather than
 * as the bell lists it.
 *
 * Both are pure. The page hands in the surfaces it already holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { todayLeaks, todayAwayGrouped, TODAY_LEAK_MAX, SERVER_NOTIFICATION_KINDS, serverNotificationRows } from "@chanlytics/contracts";

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
    list("opted_in", "Said yes to messages", 7, act("Get their yes to offers", "broadcasts/get-yes")),
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

test("every rule has a floor, and each floor is a number somebody chose", () => {
  const ids = (r, pl = people()) => todayLeaks(r, pl, 4).map((l) => l.id);
  // One message nobody answered can be a wrong number or a STOP, and this rule
  // has no act to offer -- only a door to Reports, where the tile prints the
  // figure already. Two is a pattern.
  const one = reports({ vm: { answered: { totals: { in: 21, ai: 19, you: 1, none: 1 } } } });
  assert.ok(!ids(one).includes("unanswered"));
  const two = reports({ vm: { answered: { totals: { in: 21, ai: 18, you: 1, none: 2 } } } });
  assert.ok(ids(two).includes("unanswered"));

  // One person who said yes is not yet a list nobody can mail.
  const healthy = reports({ vm: { answered: { totals: { in: 9, ai: 9, you: 0, none: 0 } } }, booking: { present: true, headline: "8 of 9 booked", sub: "", pct: 89, asked: 9, booked: 8 } });
  const few = [list("opted_in", "Said yes to messages", 2, act("Get their yes to offers", "broadcasts")), list("offers_ok", "Can receive offers", 0, null)];
  assert.ok(!ids(healthy, { lists: few }).includes("unreachable"));
  few[0].count = 3;
  assert.ok(ids(healthy, { lists: few }).includes("unreachable"));

  // Four people gone quiet is a slow week; five is a list to reach.
  const quiet = (n) => ({ lists: [list("quiet", "Quiet 30+ days", n, act("Reach out", "broadcasts/quiet"))] });
  assert.ok(!ids(healthy, quiet(4)).includes("quiet"));
  assert.ok(ids(healthy, quiet(5)).includes("quiet"));
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
  assert.deepEqual(out[0].also, { label: "Get their yes to offers", to: "broadcasts/get-yes" }, "the door lands on the QR, not on the composer above it");
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

test("REGRESSION: the DERIVED \"needs you\" row is dropped too -- it is the one a real workspace has", () => {
  // A kept row carries `about`; a derived one is computed from the Inbox this
  // browser holds and carries nothing but its key. dedupeFeed drops the KEPT
  // row while a derived one stands, so on the salon’s own workspace every row
  // about a queued conversation arrived in the form this test uses -- and the
  // first cut of this rule, which read `about` alone, matched none of them.
  // Today printed Zoe, Daniela and Emily at the top of the page and again here.
  const derived = (cv) => ({ id: `needs:th-${cv}`, key: `needs:th-${cv}`, kind: "needs_you", title: "Zoe Martin needs you", message: "", tone: "warn", icon: "alert", unread: true, about: null });
  const rows = [derived("cv-1"), derived("cv-2"), bell("n:9", "review", "1 new rating on Google", "ok")];
  const out = todayAwayGrouped(rows, ["cv-1", "cv-2"]);
  assert.deepEqual(out.groups.map((g) => g.row.id), ["n:9"], "REGRESSION: a conversation in the queue was said twice on one page");
  assert.equal(out.total, 1);
  // Not in the queue: it belongs here, and it is still never grouped -- a
  // conversation waiting for a person is one person, not a count.
  const still = todayAwayGrouped(rows, ["cv-1"]);
  assert.deepEqual(still.groups.map((g) => g.row.id), ["needs:th-cv-2", "n:9"]);
  assert.ok(still.groups.every((g) => g.title === null));
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

test("a template that can be sent does not wear a warning's colour, and neither reads as the number's news", () => {
  // "Template “save_our_number” approved" arrived as kind "number": a shield,
  // warn amber, and a door to Connections -- good news about a template,
  // dressed as bad news about the phone line. Since the away card sorts
  // warnings first, it also outranked real news and could push a genuine
  // quality downgrade off the bottom.
  const dto = (id, kind, title) => ({ id, kind, title, body: "", route: null, subject_type: null, subject_id: null, created_at: "2026-09-17T12:00:00Z", read: false, dismissed: false });
  const rows = serverNotificationRows({ seen_at: null, notifications: [
    dto("a", "template_ready", "Template “save_our_number” approved"),
    dto("b", "template_blocked", "Template “x” rejected"),
    dto("c", "number", "WhatsApp number: quality rating is now Yellow"),
  ] });
  assert.deepEqual(rows.map((r) => [r.kind, r.tone, r.icon, r.to, r.action]), [
    ["template_ready", "ok", "check", "messages", "Open Templates"],
    ["template_blocked", "warn", "alert", "messages", "Open Templates"],
    ["number", "warn", "shield", "admin/integrations", "Open Connections"],
  ]);
  // And the away card sorts on that: the downgrade and the rejection above the approval.
  const { groups } = todayAwayGrouped(rows.map((r) => ({ ...r, id: r.key })), [], 5);
  assert.deepEqual(groups.map((g) => g.row.kind), ["template_blocked", "number", "template_ready"]);
  assert.ok(SERVER_NOTIFICATION_KINDS.includes("template_ready") && SERVER_NOTIFICATION_KINDS.includes("template_blocked"), "the closed list carries them, so serverNotificationRows does not fall back to \"alert\"");
});

test("several templates at once are one row each way -- a sync can approve a batch", () => {
  const t = (id, kind, title) => ({ id, kind, title, message: "", tone: kind === "template_ready" ? "ok" : "warn", icon: "check", unread: true, about: null });
  const ready = todayAwayGrouped([t("1", "template_ready", "a"), t("2", "template_ready", "b"), t("3", "template_ready", "c")]);
  assert.equal(ready.groups[0].title, "3 templates are ready to send");
  const blocked = todayAwayGrouped([t("4", "template_blocked", "a"), t("5", "template_blocked", "b")]);
  assert.equal(blocked.groups[0].title, "2 templates cannot be sent");
  assert.equal(todayAwayGrouped([t("6", "template_ready", "only one")]).groups[0].title, null, "one is news, not a count");
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
    { key: "bell:1", kind: "call", title: "a", message: "", tone: "", icon: "phone", unread: true },
    { key: "bell:2", kind: "call", title: "b", message: "", tone: "", icon: "phone", unread: true },
  ];
  assert.deepEqual(todayAwayGrouped(rows).groups[0].ids, ["bell:1", "bell:2"]);
});
