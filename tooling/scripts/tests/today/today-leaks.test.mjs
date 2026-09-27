/**
 * Two reads Today did not have: the few things worth a look that no row on
 * the page says on its own, and the bell as Today should show it rather than
 * as the bell lists it.
 *
 * Both are pure. The page hands in the surfaces it already holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  todayLeaks as todayLeaksV2,
  todayAwayGrouped,
  todayPeriodLine,
  todayRunWords,
  todayRunsSub,
  todayRunApproved,
  toBroadcastVM,
  unreadCount,
  TODAY_LEAK_MAX,
  SERVER_NOTIFICATION_KINDS,
  serverNotificationRows,
  toPersonRowVM,
  PEOPLE_LISTS,
  peopleListAction,
  GET_YES_ROUTE,
  consultationsWithoutProposal,
  consultsHeldWords,
  pipelineOf,
} from "@chanlytics/contracts";
// The mockup's sample is a real ReportsSurface (reportDto through toReportVM): the round trip the period line is tested on.
import { reportsSample } from "../../../../apps/dashboard/src/legacy-bridge/reports-sample.ts";

// v2 returns { rows, more } and takes who is waiting before the cap; the rules pinned below are about the rows, so
// they read them through this and stay as written.
const todayLeaks = (r, p, max) => todayLeaksV2(r, p, [], max).rows;

const list = (id, label, count, action = null) => ({ id, label, group: "journey", count, action });
const act = (cta, to, enabled = true) => ({ text: "", cta, to, enabled });

/** The salon's own numbers on 17 Sep 2026, which is where every rule below came from. */
const reports = (over = {}) => ({
  vm: {
    days: 30,
    rangeLabel: "30 days",
    since: "Aug 19",
    until: "Sep 17",
    empty: false,
    tiles: [],
    answered: { totals: { in: 21, ai: 16, you: 1, none: 4 } },
    reasons: [
      { id: "manual", label: "Flagged by you", value: 2 },
      { id: "opt_out", label: "Asked to stop", value: 1 },
    ],
    ...(over.vm || {}),
  },
  campaigns: { tiles: [], empty: false },
  booking: { present: true, headline: "0 of 18 booked", sub: "", pct: 0, asked: 18, booked: 0 },
  ...(({ vm: _vm, ...rest }) => rest)(over),
});

const NOW = new Date("2026-09-21T16:00:00Z");
const at = (days) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
/** A person as the People surface holds them: the database's row through contracts' toPersonRowVM. A yes to messages. */
const personRow = (id, name, over = {}) =>
  toPersonRowVM(
    {
      id,
      display_name: name,
      wa_profile_name: null,
      phone_e164: null,
      email: null,
      consent: "opted_in",
      consent_source: "in_person",
      consent_updated_at: at(20),
      dnc: false,
      marketing_consent: null,
      marketing_consent_source: null,
      marketing_consent_updated_at: null,
      channels: ["whatsapp"],
      conversation_count: 1,
      escalation_count: 0,
      needs_human: false,
      open_escalation_reason: null,
      open_escalation_since: null,
      latest_conversation_id: null,
      latest_state: "open",
      latest_paused_until: null,
      latest_assignee_user_id: null,
      latest_snooze_until: null,
      latest_wa_inbound_at: null,
      last_message_at: at(3),
      last_message_direction: "inbound",
      last_message_sender: "customer",
      last_inbound_text: "Thanks!",
      last_inbound_at: at(3),
      last_call_at: null,
      call_count: 0,
      call_seconds: 0,
      first_contact_at: at(30),
      earliest_row_at: at(30),
      has_backfill: false,
      has_chat: true,
      queued_reply_at: null,
      ...over,
    },
    "America/New_York",
    NOW,
  );
/** The seven under the salon's reach numbers below: a number each, a yes to messages, nothing to offers. */
const saidYesToMessages = Array.from({ length: 7 }, (_, i) =>
  personRow(`k-${i}`, `Guest ${i}`, { phone_e164: `+1305555010${i}` }),
);

const people = (over = []) => ({
  lists: over.length
    ? over
    : [
        list(
          "asked_never_booked",
          "Asked, never booked",
          17,
          act("Text the booking link", "broadcasts/asked_never_booked"),
        ),
        list("opted_in", "Said yes to messages", 7, act("Get their yes to offers", "broadcasts/get-yes")),
        list("offers_ok", "Can receive offers", 0, act("Broadcast to everyone who said yes", "broadcasts", false)),
        list("quiet", "Quiet 30+ days", 6, act("Reach out", "broadcasts/quiet")),
      ],
  aggregates: { total: 28 },
  rows: saidYesToMessages,
});

test("the leak that costs a customer comes first, and it carries the arithmetic that makes it believable", () => {
  const out = todayLeaks(reports(), people());
  assert.equal(out.length, TODAY_LEAK_MAX, "two, never a list");
  assert.deepEqual(
    out.map((l) => l.id),
    ["never-booked", "unanswered"],
  );
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
  const clean = reports({
    vm: { answered: { totals: { in: 21, ai: 20, you: 1, none: 0 } } },
    booking: { present: true, headline: "16 of 18 booked", sub: "", pct: 89, asked: 18, booked: 16 },
  });
  assert.deepEqual(todayLeaks(clean, people([list("quiet", "Quiet 30+ days", 1, null)])), []);
  assert.deepEqual(todayLeaks(null, null), []);
  assert.deepEqual(todayLeaks(clean, null), []);
});

test("small numbers never fire: two people who did not book is a quiet week", () => {
  const tiny = reports({ booking: { present: true, headline: "0 of 4 booked", sub: "", pct: 0, asked: 4, booked: 0 } });
  assert.ok(!todayLeaks(tiny, people(), 4).some((l) => l.id === "never-booked"), "four asked is under the floor");
  const noCal = reports({
    booking: {
      present: false,
      headline: "—",
      sub: "Connect your calendar under Settings › Business to see who booked.",
      pct: null,
      asked: 0,
      booked: 0,
    },
  });
  assert.ok(
    !todayLeaks(noCal, people(), 4).some((l) => l.id === "never-booked"),
    "no calendar is not a leak, it is a setup step",
  );
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
  const healthy = reports({
    vm: { answered: { totals: { in: 9, ai: 9, you: 0, none: 0 } } },
    booking: { present: true, headline: "8 of 9 booked", sub: "", pct: 89, asked: 9, booked: 8 },
  });
  const few = [
    list("opted_in", "Said yes to messages", 2, act("Get their yes to offers", "broadcasts")),
    list("offers_ok", "Can receive offers", 0, null),
  ];
  assert.ok(!ids(healthy, { lists: few, rows: saidYesToMessages.slice(0, 2) }).includes("unreachable"));
  few[0].count = 3;
  assert.ok(ids(healthy, { lists: few, rows: saidYesToMessages.slice(0, 3) }).includes("unreachable"));

  // Four people gone quiet is a slow week; five is a list to reach.
  const quiet = (n) => ({ lists: [list("quiet", "Quiet 30+ days", n, act("Reach out", "broadcasts/quiet"))] });
  assert.ok(!ids(healthy, quiet(4)).includes("quiet"));
  assert.ok(ids(healthy, quiet(5)).includes("quiet"));
});

test("some booked, but few: the sentence changes and the number is theirs", () => {
  const some = reports({
    vm: { answered: { totals: { in: 21, ai: 21, you: 0, none: 0 } } },
    booking: { present: true, headline: "3 of 18 booked", sub: "", pct: 17, asked: 18, booked: 3 },
  });
  const [one] = todayLeaks(some, people());
  assert.equal(one.text, "Only 3 of the 18 people who wrote or called in the last 30 days got onto the calendar.");
});

test("a list nobody can be mailed, and a list gone quiet -- the two that cost a chance, in that order", () => {
  const quietBooks = reports({
    vm: { answered: { totals: { in: 9, ai: 9, you: 0, none: 0 } } },
    booking: { present: true, headline: "8 of 9 booked", sub: "", pct: 89, asked: 9, booked: 8 },
  });
  const out = todayLeaks(quietBooks, people(), 4);
  assert.deepEqual(
    out.map((l) => l.id),
    ["unreachable", "quiet"],
  );
  assert.equal(out[0].text, "7 people have said yes to messages, but nobody has said yes to offers.");
  assert.deepEqual(
    out[0].also,
    { label: "Get their yes to offers", to: "broadcasts/get-yes" },
    "the door lands on the QR, not on the composer above it",
  );
  assert.equal(out[1].math, "of 28 in People");
  assert.deepEqual(
    out[1].also,
    { label: "Reach out", to: "broadcasts/quiet" },
    "the list's own step, when the list can run it",
  );
  const held = todayLeaks(
    quietBooks,
    { lists: [list("quiet", "Quiet 30+ days", 6, act("Reach out", "broadcasts/quiet", false))] },
    4,
  );
  assert.equal(held[0].also, null, "a step nobody can take is not offered");
});

test("REGRESSION: a yes to offers with no number to send one to is not 'nobody has said yes to offers' -- the reach row says what is missing, and asks nobody for an answer they gave", () => {
  const row = personRow;
  /** The People surface over these rows, as the bridge publishes it (surface-data.ts publishPeople), with no calendar. */
  const surface = (rows) => ({
    rows,
    lists: PEOPLE_LISTS.filter((l) => !l.needsCalendar).map((l) => {
      const members = rows.filter(l.test);
      return {
        id: l.id,
        label: l.label,
        group: l.group,
        count: members.length,
        ids: members.map((r) => r.id),
        action: peopleListAction(l.id, members),
      };
    }),
    aggregates: { total: rows.length },
  });
  // Three with a number who said yes to messages and nothing to offers: the nightly's own workspace.
  const three = [
    row("p1", "Rosa Diaz", { phone_e164: "+13055550101" }),
    row("p2", "Mia Chen", { phone_e164: "+13055550102" }),
    row("p3", "Ivy Park", { phone_e164: "+13055550103" }),
  ];
  const bookedWell = reports({
    vm: { answered: { totals: { in: 9, ai: 9, you: 0, none: 0 } } },
    booking: { present: true, headline: "8 of 9 booked", sub: "", pct: 89, asked: 9, booked: 8 },
  });
  const reach = (rows) => todayLeaksV2(bookedWell, surface(rows)).rows.find((l) => l.id === "unreachable");

  // Nobody said yes to offers: the sentence the nightly pins, and the door to the QR, where that yes is got.
  const none = reach(three);
  assert.equal(none.text, "3 people have said yes to messages, but nobody has said yes to offers.");
  assert.equal(none.math, "a broadcast reaches only the second yes · 0 can receive one");
  assert.deepEqual(none.also, { label: "Get their yes to offers", to: GET_YES_ROUTE });

  // Ana wrote in by email and said yes to both there: nobody can be sent an offer still, and it is not for want of a
  // yes. Said as People's list step and the send screen say it (#663, #811) -- and no door to the QR, which would ask
  // her for the yes she gave.
  const ana = row("p4", "Ana Reyes", {
    email: "ana@example.com",
    channels: ["email"],
    consent_source: "customer_message",
    marketing_consent: "opted_in",
    marketing_consent_source: "customer_message",
    marketing_consent_updated_at: at(20),
  });
  const noNumber = reach([...three, ana]);
  assert.equal(
    noNumber.text,
    "4 people have said yes to messages, but nobody can be sent an offer yet.",
    "REGRESSION: '4 people have said yes to messages, but nobody has said yes to offers.'",
  );
  assert.equal(noNumber.math, "a broadcast reaches only a recorded yes with a number to send to · 0 can receive one");
  assert.equal(noNumber.also, null, "REGRESSION: a door asking Ana for the yes she gave");
  assert.deepEqual(
    noNumber.cta,
    { label: "Open People", to: "clients/seg:opted_in" },
    "the number is People's list, and the door opens it",
  );
  assert.equal(
    noNumber.ask,
    "4 people have said yes to messages, but nobody can be sent an offer yet. A broadcast reaches only a recorded yes with a number to send to · 0 can receive one. Why is that?",
  );

  // The yes is anyone's in the workspace, as the broadcast to everyone counts it: Cleo said yes to offers on a paper
  // form and to nothing else, so she is on no list of People's -- and the sentence may not say nobody did.
  const cleo = row("p5", "Cleo Park", {
    consent: null,
    consent_source: null,
    consent_updated_at: null,
    channels: [],
    has_chat: false,
    marketing_consent: "opted_in",
    marketing_consent_source: "form",
    marketing_consent_updated_at: at(5),
  });
  const outside = reach([...three, cleo]);
  assert.equal(outside.text, "3 people have said yes to messages, but nobody can be sent an offer yet.");
  assert.equal(outside.also, null);
  // A yes to offers that was taken back with a STOP is no yes at all.
  const stopped = row("p6", "Dee Wolf", {
    consent: "opted_out",
    consent_source: "customer_message",
    marketing_consent: "opted_in",
  });
  assert.equal(
    reach([...three, stopped]).text,
    "3 people have said yes to messages, but nobody has said yes to offers.",
  );
});

/* --------------------------- while you were away ------------------------- */

const bell = (id, kind, title, tone = "", about = null) => ({
  id,
  kind,
  title,
  message: "",
  tone,
  icon: "bell",
  unread: true,
  about,
});

test("a conversation already in the queue above is not said again here", () => {
  const rows = [
    bell("n:1", "handoff", "Zoe Martin needs you", "warn", { type: "conversation", id: "cv-1" }),
    bell("n:2", "handoff", "Daniela Reyes needs you", "warn", { type: "conversation", id: "cv-2" }),
    bell("n:3", "review", "1 new rating on Google", "ok"),
  ];
  const out = todayAwayGrouped(rows, ["cv-1", "cv-2"]);
  assert.deepEqual(
    out.groups.map((g) => g.row.id),
    ["n:3"],
  );
  assert.equal(out.total, 3, "the head IS what the bell holds; the foot says how many of them are not drawn here");
  assert.equal(out.more, 2);
  const noQueue = todayAwayGrouped(rows, []);
  assert.equal(noQueue.groups.length, 2, "two handoffs group; without the queue they still belong here");
  assert.equal(noQueue.groups[0].title, "2 conversations need you");
});

test('REGRESSION: the DERIVED "needs you" row is dropped too -- it is the one a real workspace has', () => {
  // A kept row carries `about`; a derived one is computed from the Inbox this
  // browser holds and carries nothing but its key. dedupeFeed drops the KEPT
  // row while a derived one stands, so on the salon’s own workspace every row
  // about a queued conversation arrived in the form this test uses -- and the
  // first cut of this rule, which read `about` alone, matched none of them.
  // Today printed Zoe, Daniela and Emily at the top of the page and again here.
  const derived = (cv) => ({
    id: `needs:th-${cv}`,
    key: `needs:th-${cv}`,
    kind: "needs_you",
    title: "Zoe Martin needs you",
    message: "",
    tone: "warn",
    icon: "alert",
    unread: true,
    about: null,
  });
  const rows = [derived("cv-1"), derived("cv-2"), bell("n:9", "review", "1 new rating on Google", "ok")];
  const out = todayAwayGrouped(rows, ["cv-1", "cv-2"]);
  assert.deepEqual(
    out.groups.map((g) => g.row.id),
    ["n:9"],
    "REGRESSION: a conversation in the queue was said twice on one page",
  );
  assert.equal(out.total, 3, "dropped from the list, still counted on the head -- it is still in the bell");
  // Not in the queue: it belongs here, and it is still never grouped -- a
  // conversation waiting for a person is one person, not a count.
  const still = todayAwayGrouped(rows, ["cv-1"]);
  assert.deepEqual(
    still.groups.map((g) => g.row.id),
    ["needs:th-cv-2", "n:9"],
  );
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
  assert.deepEqual(
    groups.map((g) => g.title ?? g.row.title),
    ["2 jobs did not finish", "WhatsApp number: quality rating is now Yellow", "12 calls", "2 new ratings on Google"],
    "warnings first, then the bell's own order; five identical hangups no longer bury the downgrade",
  );
  assert.equal(more, 0);
  const calls = groups.find((g) => g.title === "12 calls");
  assert.equal(calls.count, 12);
  assert.equal(calls.ids.length, 12, "read and dismiss must reach every row the group swallowed");
  assert.equal(calls.row.id, "c0", "the newest of the group is the one it shows");
});

test("two broadcasts that went out are not counted into the jobs that did not finish", () => {
  // The whole defect, on the page: six rows under one amber heading, two of
  // them the best news the workspace had that day.
  const rows = [
    bell("j1", "job_failed", "A outbound_send job did not finish", "warn"),
    bell("b1", "broadcast_sent", "Broadcast “Spring offer” sent", "ok"),
    bell("b2", "broadcast_sent", "Broadcast “Winter hours” sent", "ok"),
  ];
  const { groups, total } = todayAwayGrouped(rows, [], 5);
  assert.equal(total, 3);
  assert.deepEqual(
    groups.map((g) => g.title ?? g.row.title),
    ["A outbound_send job did not finish", "2 broadcasts finished"],
    "the failure stands alone; the two sends are their own group, in their own words",
  );
  assert.equal(groups[0].count, 1, "one job did not finish, not three");
  assert.equal(groups[1].row.tone, "ok", "and good news does not outrank the warning");
});

test("a template that can be sent does not wear a warning's colour, and neither reads as the number's news", () => {
  // "Template “save_our_number” approved" arrived as kind "number": a shield,
  // warn amber, and a door to Connections -- good news about a template,
  // dressed as bad news about the phone line. Since the away card sorts
  // warnings first, it also outranked real news and could push a genuine
  // quality downgrade off the bottom.
  const dto = (id, kind, title) => ({
    id,
    kind,
    title,
    body: "",
    route: null,
    subject_type: null,
    subject_id: null,
    created_at: "2026-09-17T12:00:00Z",
    read: false,
    dismissed: false,
  });
  const rows = serverNotificationRows({
    seen_at: null,
    notifications: [
      dto("a", "template_ready", "Template “save_our_number” approved"),
      dto("b", "template_blocked", "Template “x” rejected"),
      dto("c", "number", "WhatsApp number: quality rating is now Yellow"),
    ],
  });
  assert.deepEqual(
    rows.map((r) => [r.kind, r.tone, r.icon, r.to, r.action]),
    [
      ["template_ready", "ok", "check", "messages", "Open Templates"],
      ["template_blocked", "warn", "alert", "messages", "Open Templates"],
      ["number", "warn", "shield", "admin/integrations", "Open Connections"],
    ],
  );
  // And the away card sorts on that: the downgrade and the rejection above the approval.
  const { groups } = todayAwayGrouped(
    rows.map((r) => ({ ...r, id: r.key })),
    [],
    5,
  );
  assert.deepEqual(
    groups.map((g) => g.row.kind),
    ["template_blocked", "number", "template_ready"],
  );
  assert.ok(
    SERVER_NOTIFICATION_KINDS.includes("template_ready") && SERVER_NOTIFICATION_KINDS.includes("template_blocked"),
    'the closed list carries them, so serverNotificationRows does not fall back to "alert"',
  );
});

test("several templates at once are one row each way -- a sync can approve a batch", () => {
  const t = (id, kind, title) => ({
    id,
    kind,
    title,
    message: "",
    tone: kind === "template_ready" ? "ok" : "warn",
    icon: "check",
    unread: true,
    about: null,
  });
  // A run the queue holds for a word is not said again here; a run it does not hold is news.
  const readyRun = (id, name) => t(id, "playbook", `Playbook “${name}” is ready: 1 person`);
  const withRun = todayAwayGrouped(
    [readyRun("r1", "Win-back · quiet 30 days"), readyRun("r2", "Birthday offer")],
    [{ runLabel: "Win-back · quiet 30 days" }],
    5,
  );
  assert.deepEqual(
    withRun.groups.map((g) => g.row.id),
    ["r2"],
    "the queued run's row is the queue's; the other stands",
  );
  assert.equal(withRun.queued, 1);
  assert.equal(
    todayAwayGrouped([readyRun("r1", "Win-back · quiet 30 days")], [], 5).groups.length,
    1,
    "nothing queued, nothing hidden",
  );
  const ready = todayAwayGrouped([
    t("1", "template_ready", "a"),
    t("2", "template_ready", "b"),
    t("3", "template_ready", "c"),
  ]);
  assert.equal(ready.groups[0].title, "3 templates are ready to send");
  const blocked = todayAwayGrouped([t("4", "template_blocked", "a"), t("5", "template_blocked", "b")]);
  assert.equal(blocked.groups[0].title, "2 templates cannot be sent");
  assert.equal(
    todayAwayGrouped([t("6", "template_ready", "only one")]).groups[0].title,
    null,
    "one is news, not a count",
  );
});

test("a kind with no noun never groups: a new alert shows itself rather than joining a total", () => {
  const rows = [
    bell("a", "billing", "Your card was declined", "warn"),
    bell("b", "billing", "Your trial ends Friday", "warn"),
  ];
  const { groups } = todayAwayGrouped(rows);
  assert.deepEqual(
    groups.map((g) => g.row.id),
    ["a", "b"],
  );
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
  assert.deepEqual(todayAwayGrouped([]), {
    groups: [],
    total: 0,
    more: 0,
    queued: 0,
    foot: null,
    empty: { icon: "check", text: "All caught up." },
  });
});

test("the head is the bell's own number, and the head, the rows and the foot add up", () => {
  const rows = [
    bell("n:1", "handoff", "Zoe Martin needs you", "warn", { type: "conversation", id: "cv-1" }),
    bell("n:2", "handoff", "Daniela Reyes needs you", "warn", { type: "conversation", id: "cv-2" }),
    bell("n:3", "review", "1 new rating on Google", "ok"),
    {
      id: "n:4",
      kind: "alert",
      title: "read already",
      message: "",
      tone: "",
      icon: "bell",
      unread: false,
      about: null,
    },
  ];
  const out = todayAwayGrouped(rows, ["cv-1", "cv-2"], 5);
  assert.equal(out.total, unreadCount(rows), "the card's head and the bell's badge are one number");
  assert.equal(out.total, 3, "the read row is in neither");
  assert.equal(out.queued, 2);
  const onScreen = out.groups.reduce((n, g) => n + g.count, 0);
  assert.equal(out.total, onScreen + out.more, "head = what is drawn + what the foot says");
  assert.equal(
    out.foot,
    "2 more in the bell, already in the queue above",
    "true of the bell, because both rows are in it",
  );
  assert.equal(out.empty, null);
});

test('REGRESSION: a card empty only because the queue above has everything does not say "All caught up." beside a bell of 4', () => {
  const rows = ["cv-1", "cv-2", "cv-3", "cv-4"].map((cv, i) => ({
    id: `needs:th-${cv}`,
    key: `needs:th-${cv}`,
    kind: "needs_you",
    title: `person ${i} needs you`,
    message: "",
    tone: "warn",
    icon: "alert",
    unread: true,
    about: null,
  }));
  const out = todayAwayGrouped(rows, ["cv-1", "cv-2", "cv-3", "cv-4"], 5);
  assert.deepEqual(out.groups, [], "none of them is said twice on one page");
  assert.equal(out.total, 4, "REGRESSION: the head read 0 and the badge two inches away read 4");
  assert.equal(out.queued, 4);
  assert.deepEqual(out.empty, { icon: "arrow-up", text: "Everything new is already in the queue above." });
  assert.ok(!out.empty.text.includes("caught up"), "four things are unread: there is nothing to congratulate");
  assert.equal(out.foot, null, "the head has said 4 and the line above says where they are: a number is said once");
});

test("under the cap and already in the queue are two different absences, and the foot names both", () => {
  const rows = [
    ...Array.from({ length: 7 }, (_, i) => bell(`k${i}`, "billing", `row ${i}`)),
    bell("q1", "handoff", "Zoe Martin needs you", "warn", { type: "conversation", id: "cv-1" }),
    bell("q2", "handoff", "Emily Chen needs you", "warn", { type: "conversation", id: "cv-2" }),
  ];
  const out = todayAwayGrouped(rows, ["cv-1", "cv-2"], 5);
  assert.equal(out.total, 9);
  assert.equal(out.queued, 2);
  assert.equal(out.more, 4, "two left under the cap and two the queue above already holds");
  assert.equal(out.foot, "4 more in the bell, 2 of them already in the queue above");
  assert.equal(
    /(\d+) more/.exec(out.foot)[1],
    "4",
    "the foot's first number is the one that makes head = drawn + more",
  );
});

test("a row the bell keyed rather than numbered still carries its id through a group", () => {
  const rows = [
    { key: "bell:1", kind: "call", title: "a", message: "", tone: "", icon: "phone", unread: true },
    { key: "bell:2", kind: "call", title: "b", message: "", tone: "", icon: "phone", unread: true },
  ];
  assert.deepEqual(todayAwayGrouped(rows).groups[0].ids, ["bell:1", "bell:2"]);
});

/* ------------------------------ worth a look, v2 ------------------------------ */

test("each row wears a word and an icon for its tone, and offers Ask its own facts with their arithmetic", () => {
  const { rows } = todayLeaksV2(reports(), people());
  assert.deepEqual(
    rows.map((l) => [l.id, l.tag, l.icon]),
    [
      ["never-booked", "Booking gap", "calendar"],
      ["unanswered", "No reply", "alert"],
    ],
  );
  assert.equal(
    rows[0].ask,
    "18 people wrote or called in the last 30 days. Not one of them is on the calendar. 0 of 18 booked · 17 on Asked, never booked. Why is that?",
    "the sentence and the arithmetic under it, so Ask grounds the answer in the same numbers",
  );
  assert.equal(
    rows[1].ask,
    "4 customer messages never got an answer at all. Of 21 in the last 30 days · the receptionist answered 16, you answered 1. Why is that?",
    "the arithmetic takes a capital once it is a sentence of its own",
  );
  const { rows: reach } = todayLeaksV2(
    reports({
      vm: { answered: { totals: { in: 9, ai: 9, you: 0, none: 0 } } },
      booking: { present: true, headline: "8 of 9 booked", sub: "", pct: 89, asked: 9, booked: 8 },
    }),
    people(),
  );
  assert.deepEqual(
    reach.map((l) => [l.id, l.tag, l.icon]),
    [
      ["unreachable", "Reach", "users"],
      ["quiet", "Gone quiet", "clock"],
    ],
  );
  assert.equal(
    reach[0].text,
    "7 people have said yes to messages, but nobody has said yes to offers.",
    "the sentence the nightly pins stays",
  );
  assert.deepEqual(
    [reach[0].cta.label, reach[0].also.label],
    ["Open People", "Get their yes to offers"],
    "and so do its two doors",
  );
});

test("a third problem is counted, not dropped in silence", () => {
  const all = todayLeaksV2(reports(), people(), [], 4);
  assert.equal(all.rows.length, 4);
  assert.equal(all.more, 0);
  const two = todayLeaksV2(reports(), people());
  assert.equal(two.rows.length, TODAY_LEAK_MAX);
  assert.equal(two.more, 2, "the two it did not draw");
  assert.equal(two.moreLine, "and 2 more", "said by contracts, drawn by the page");
  assert.equal(todayLeaksV2(reports(), people(), [], 3).moreLine, "and 1 more");
  assert.equal(all.moreLine, null);
  assert.deepEqual(todayLeaksV2(null, null), { rows: [], more: 0, moreLine: null });
});

test("the unanswered row names who is waiting NOW, up to two, from the threads Today holds: not the count's own subjects", () => {
  const waiting = [
    { conversationId: "cv-d", who: "Dulce Amaro", sinceMs: 1, to: "inbox/th-cv-d" },
    { conversationId: "cv-r", who: "Renata Solís", sinceMs: 2, to: "inbox/th-cv-r" },
    { conversationId: "cv-x", who: "Ana", sinceMs: 3, to: "inbox/th-cv-x" },
  ];
  const row = todayLeaksV2(reports(), people(), waiting).rows.find((l) => l.id === "unanswered");
  assert.deepEqual(row.people, [
    { id: "cv-d", name: "Dulce Amaro", to: "inbox/th-cv-d", title: "Open Dulce Amaro's thread" },
    { id: "cv-r", name: "Renata Solís", to: "inbox/th-cv-r", title: "Open Renata Solís's thread" },
  ]);
  assert.equal(row.peopleLead, "Waiting now", "the lead says they are waiting now, and the page draws it as said");
  assert.equal(
    row.text,
    "4 customer messages never got an answer at all.",
    "the count stays Reports' over its period; the names are the threads waiting right now, and the page says so",
  );
  assert.deepEqual(todayLeaksV2(reports(), people()).rows.find((l) => l.id === "unanswered").people, []);
  const never = todayLeaksV2(reports(), people(), waiting).rows.find((l) => l.id === "never-booked");
  assert.deepEqual(never.people, [], "only the unanswered row names people here");
  assert.equal(never.peopleLead, null, "and a row that names nobody has no lead");
});

/* ------------------------------ while you were away, v2 ------------------------------ */

test("the dedupe covers all four queue kinds: a closing window's thread, a call worth a listen, a call-back's call", () => {
  const rows = [
    bell("n:1", "handoff", "Zoe Martin needs you", "warn", { type: "conversation", id: "cv-1" }),
    {
      ...bell("draft:m-9", "held_draft", "A reply to Renata is waiting for you"),
      actions: [{ label: "Review", to: "inbox/th-cv-w", primary: true }],
    },
    {
      ...bell("call:k-3", "missed_call", "Missed call · Kenia", "warn"),
      actions: [{ label: "See the call", to: "conversations/cv-k-3", primary: true }],
    },
    bell("n:7", "call", "+1 (929) 370-9606 phoned", "", { type: "call", id: "k-9" }),
    bell("n:8", "review", "1 new rating on Google", "ok"),
    // A row as serverNotificationRows shapes it: its door on `to`, nothing on `about`.
    { ...bell("n:9", "handoff", "Priya Nair needs you", "warn"), to: "inbox/th-cv-p" },
  ];
  const queue = [
    { conversationId: "cv-1", callId: null }, // a handoff
    { conversationId: "cv-w", callId: null }, // a reply window closing
    { conversationId: null, callId: "k-3" }, // a call worth a listen
    { conversationId: "cv-k", callId: "k-9" }, // a call-back and its call
    { conversationId: "cv-p", callId: null }, // a handoff whose bell row names its thread only by its door
  ];
  const out = todayAwayGrouped(rows, queue, 5);
  assert.deepEqual(
    out.groups.map((g) => g.row.id),
    ["n:8"],
    "every row about something the queue above holds is dropped",
  );
  assert.equal(out.total, 6, "and still counted on the head, because it is still in the bell");
  assert.equal(out.queued, 5);
  assert.equal(out.foot, "5 more in the bell, already in the queue above");
  const strings = todayAwayGrouped(rows, ["cv-1"], 5);
  assert.deepEqual(
    strings.groups.map((g) => g.row.id),
    ["call:k-3", "n:9", "draft:m-9", "n:7", "n:8"],
    "a bare string is still a conversation id; the warnings sort first, as ever",
  );
});

/* ------------------------------ the period, in one line ------------------------------ */

test("the last seven days in one sentence, in Reports' own numbers and words, each read from the view model Reports draws", () => {
  const r = reports({
    vm: {
      tiles: [
        {
          id: "messages",
          label: "Customer messages",
          value: "23",
          meta: "",
          delta: null,
          spark: [],
          compare: "up from 19",
        },
        { id: "calls", label: "Calls", value: "4", meta: "", delta: null, spark: [], compare: null },
      ],
      answered: { totals: { in: 23, ai: 21, you: 1, none: 1 }, share: 21 / 23 },
      replyTime: { count: 21, medianLabel: "34s" },
      calls: { total: 4 },
      period: { now: "Last 7 days" },
      rangeLabel: "7 days",
    },
  });
  assert.deepEqual(todayPeriodLine(r), {
    text: "Last 7 days: 23 messages (up from 19), 91% answered by the receptionist, 4 calls.",
    to: "reports",
  });
  const quiet = reports({
    vm: {
      tiles: [],
      answered: { totals: { in: 0, ai: 0, you: 0, none: 0 }, share: null },
      empty: true,
      period: { now: "Last 30 days" },
      rangeLabel: "30 days",
    },
  });
  assert.equal(todayPeriodLine(quiet).text, "Last 30 days: nobody wrote or called.");
  const noReplies = reports({
    vm: {
      tiles: [{ id: "messages", label: "Customer messages", value: "1", meta: "", delta: null, spark: [] }],
      answered: { totals: { in: 1, ai: 0, you: 1, none: 0 }, share: 0 },
      replyTime: { count: 0, medianLabel: "—" },
      calls: { total: 1 },
      rangeLabel: "7 days",
    },
  });
  assert.equal(
    todayPeriodLine(noReplies).text,
    "Last 7 days: 1 message, 0% answered by the receptionist, 1 call.",
    "no comparison without one; the singulars; the lead from the range when Reports gives no period words",
  );
  assert.equal(todayPeriodLine(null), null);
  assert.equal(
    todayPeriodLine(reports({ vm: { answered: undefined } })),
    null,
    "nothing to count from: no line rather than a zero",
  );
  assert.equal(
    todayPeriodLine(reports({ campaigns: null })).to,
    "reports",
    "the offers' read failing touches nothing here (#686's first defect)",
  );
});

test("the period line reads the view model Reports itself draws: a round trip through toReportVM", () => {
  // The mockup's sample is a real ReportsSurface: reportDto → toReportVM, nothing typed by hand.
  const surface = reportsSample(7, "2026-09-18");
  const { vm } = surface;
  const line = todayPeriodLine(surface);
  assert.equal(line.to, "reports");
  assert.ok(line.text.startsWith(`${vm.period.now}: ${vm.answered.totals.in} messages`), line.text);
  assert.ok(
    line.text.includes(`% answered by the receptionist`) &&
      line.text.includes(`${Math.round(vm.answered.share * 100)}%`),
    "Reports' own share, rounded as its tile is",
  );
  assert.ok(!line.text.includes("median"), "the median reply stays on Reports, the sentence's one door");
  assert.ok(line.text.endsWith(`${vm.calls.total} call${vm.calls.total === 1 ? "" : "s"}.`), line.text);
  assert.ok(!line.text.includes("—"), "no em dash in a new sentence");
});

/* ------------------------------ the runs' words ------------------------------ */

test("the sentences the queue and the card say about a playbook's run come from here, without an em dash", () => {
  const run = {
    id: "b1",
    state: "pending_approval",
    playbook_id: "pb-1",
    name: "Win-back",
    audience: { label: "Win-back" },
    recipient_count: 3,
    scheduled_for: "2026-09-15T13:00:00Z",
    started_at: null,
    when: "today 9:00 AM",
    counts: { sent: 0, replied: 0 },
  };
  const w = todayRunWords(run);
  assert.equal(w.people, "3 people");
  assert.deepEqual(w.waiting, {
    sentence: "3 people. Nothing sends until you say so.",
    status: ["Waiting for your approval"],
  });
  assert.deepEqual(w.soon, {
    meta: "Playbook · sends today 9:00 AM",
    sentence: "3 people. Stop it if you'd rather not.",
    status: ["Scheduled", "sends today 9:00 AM"],
  });
  for (const s of [w.waiting.sentence, w.soon.sentence, w.soon.meta, ...w.waiting.status, ...w.soon.status])
    assert.ok(!s.includes("—"), `an em dash in a new sentence: ${s}`);
  assert.deepEqual(todayRunWords({ ...run, state: "sent", counts: { sent: 6, replied: 1 } }).done, {
    counts: "6 sent, 1 replied",
    still: false,
  });
  assert.deepEqual(
    todayRunWords({ ...run, state: "sending", recipient_count: 1, counts: { sent: 1, replied: 0 } }).done,
    { counts: "1 sent", still: true },
  );
  assert.equal(todayRunWords({ ...run, recipient_count: 1 }).people, "1 person");
  assert.equal(todayRunsSub(2), "2 runs waiting");
  assert.equal(todayRunsSub(1), "1 run waiting");
  assert.equal(todayRunsSub(0), null);
  assert.deepEqual(
    todayRunApproved("Win-back", 3, "sending now"),
    { lead: "Win-back", rest: "approved: 3 people, sending now" },
    "the name apart, for the page to set in bold",
  );
});

test("the runs' words read a real broadcast view model: a round trip through toBroadcastVM", () => {
  const dto = {
    id: "b1",
    name: "Win-back · 2026-09-18",
    template_id: "t-1",
    template_name: "quick_note",
    template_language: "en",
    params: [],
    audience: { kind: "playbook", id: "pb-1", label: "Win-back" },
    state: "scheduled",
    scheduled_for: "2026-09-18T17:00:00Z",
    started_at: null,
    finished_at: null,
    recipient_count: 3,
    failure: null,
    created_at: "2026-09-18T15:00:00Z",
    playbook_id: "pb-1",
    run_for: "2026-09-18",
    counts: { queued: 3, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 },
  };
  const vm = toBroadcastVM(dto, "America/New_York", new Date("2026-09-18T15:30:00Z"));
  assert.match(vm.when, /^today .*1:00 PM$/, "the business's clock, as toBroadcastVM says it");
  const w = todayRunWords(vm);
  assert.equal(w.soon.meta, `Playbook · sends ${vm.when}`);
  assert.deepEqual(w.soon.status, ["Scheduled", `sends ${vm.when}`]);
  assert.equal(w.people, "3 people");
});

test("proposals waiting: out past a week with nothing back, said once, with the door to the list, and only where deals are on", () => {
  // A proposal out past a week with nothing back since it went (0004; contracts' proposalsWaiting over People's
  // rows). One is enough: an agency sends a few a month. The count is the rows'; the list's count is the arithmetic.
  // People says whether deals are on (0008); the fixture says they are, and the last case says what happens where not.
  const rowsWith = (n, waiting) =>
    Array.from({ length: n }, () => ({
      consent: { state: "opted_in" },
      askedMs: null,
      deal: waiting
        ? { stage: "proposed", sinceMs: NOW.getTime() - 9 * 86_400_000, brief: "Proposal out · 9 d" }
        : null,
    }));
  const people = (rows) => ({
    lists: [list("proposal_out", "Proposal out", rows.filter((r) => r.deal).length, act("Open the Inbox", "inbox"))],
    aggregates: { total: rows.length },
    rows,
    dealsOn: true,
  });
  const rows = todayLeaksV2(
    reports({ booking: { present: false } }),
    people(rowsWith(3, true)),
    [],
    4,
    NOW.getTime(),
  ).rows;
  const leak = rows.find((r) => r.id === "proposals-waiting");
  assert.ok(leak);
  assert.equal(leak.tag, "Waiting");
  assert.equal(leak.tone, "warn");
  assert.equal(leak.text, "3 proposals went out more than a week ago with nothing back.");
  assert.equal(leak.math, "3 on Proposal out · nothing heard since it went");
  assert.equal(leak.cta.to, "clients/seg:proposal_out");
  assert.equal(leak.also, null, "the list's step is not the leak's act: nobody is pushed by a broadcast to answer");
  const one = todayLeaksV2(
    reports({ booking: { present: false } }),
    people(rowsWith(1, true)),
    [],
    4,
    NOW.getTime(),
  ).rows;
  assert.equal(
    one.find((r) => r.id === "proposals-waiting").text,
    "1 proposal went out more than a week ago with nothing back.",
  );
  assert.equal(
    todayLeaksV2(reports({ booking: { present: false } }), people(rowsWith(3, false)), [], 4, NOW.getTime()).rows.find(
      (r) => r.id === "proposals-waiting",
    ),
    undefined,
    "no proposal waiting: no row",
  );
  // Once the workspace has a pace, past it by a fifth: nine days is not yet waiting on a twelve-day pace, fifteen is,
  // and the words say longer than usual, with the pace.
  const paced = (rows, pace) => ({ ...people(rows), dealPace: pace });
  const twelve = { medianDays: 12, yeses: 6, waitDays: 14, longerThanUsual: true, words: "Usually 12 days to a yes" };
  const leakOf = (p) =>
    todayLeaksV2(reports({ booking: { present: false } }), p, [], 4, NOW.getTime()).rows.find(
      (r) => r.id === "proposals-waiting",
    );
  assert.equal(leakOf(paced(rowsWith(3, true), twelve)), undefined);
  const late = rowsWith(2, true).map((r) => ({ ...r, deal: { ...r.deal, sinceMs: NOW.getTime() - 15 * 86_400_000 } }));
  const lateLeak = leakOf(paced(late, twelve));
  assert.equal(lateLeak.text, "2 proposals have waited longer than usual with nothing back.");
  assert.equal(lateLeak.math, "2 on Proposal out · usually 12 days to a yes · nothing heard since it went");
  assert.equal(
    leakOf(paced(late.slice(0, 1), twelve)).text,
    "1 proposal has waited longer than usual with nothing back.",
  );
  // REGRESSION: past the thirty-day cap the wait is not past the pace, and Today said "longer than usual" of it.
  const forty = { medianDays: 40, yeses: 6, waitDays: 30, longerThanUsual: false, words: "Usually 40 days to a yes" };
  const month = rowsWith(1, true).map((r) => ({ ...r, deal: { ...r.deal, sinceMs: NOW.getTime() - 31 * 86_400_000 } }));
  assert.equal(leakOf(paced(month, forty)).text, "1 proposal went out more than 30 days ago with nothing back.");
  // A proposal out six days is not waiting yet; one answered since it went is not either.
  const fresh = rowsWith(1, true).map((r) => ({ ...r, deal: { ...r.deal, sinceMs: NOW.getTime() - 6 * 86_400_000 } }));
  const answered = rowsWith(1, true).map((r) => ({ ...r, askedMs: NOW.getTime() - 86_400_000 }));
  for (const rs of [fresh, answered])
    assert.equal(
      todayLeaksV2(reports({ booking: { present: false } }), people(rs), [], 4, NOW.getTime()).rows.find(
        (r) => r.id === "proposals-waiting",
      ),
      undefined,
    );
  // Between the answered row and the reach row: a customer one step from yes outranks a chance.
  const order = todayLeaksV2(
    reports({ vm: { answered: { totals: { in: 21, ai: 16, you: 1, none: 4 } } }, booking: { present: false } }),
    { ...people(rowsWith(2, true)), lists: [...people(rowsWith(2, true)).lists, list("quiet", "Quiet 30+ days", 9)] },
    [],
    4,
    NOW.getTime(),
  ).rows.map((r) => r.id);
  assert.deepEqual(order, ["unanswered", "proposals-waiting", "quiet"]);
  // A workspace whose customers book never hears about a proposal, whatever deals it holds (0008).
  for (const dealsOn of [false, undefined])
    assert.equal(
      todayLeaksV2(
        reports({ booking: { present: false } }),
        { ...people(rowsWith(3, true)), dealsOn },
        [],
        4,
        NOW.getTime(),
      ).rows.find((r) => r.id === "proposals-waiting"),
      undefined,
      `deals ${dealsOn === false ? "off" : "never said"}: no row`,
    );
});

/* ------------------------------ the consultations with no proposal yet (0008) ------------------------------ */

const HOUR = 3_600_000;
/**
 * Someone whose last visit, a consultation, ended at `endMs` (the people read marks it: 0004), with the deal the people
 * read carries (00156) in `over`, through contracts' toPersonRowVM: the People surface's own rows, never a stand-in.
 */
const consulted = (id, name, endMs, over = {}) =>
  personRow(id, name, {
    visits: {
      timezone: "America/New_York",
      source: "Google Calendar",
      state: "ok",
      next: null,
      last: {
        id: `v-${id}`,
        start: new Date(endMs - HOUR).toISOString(),
        end: new Date(endMs).toISOString(),
        title: "Consultation",
        all_day: false,
        via: "phone",
        consultation: true,
      },
    },
    ...over,
  });
const daysBack = (days) => NOW.getTime() - days * 86_400_000;
/** A deal as the people read carries it (00156): a proposal sent at `proposedMs`, answered at `decidedMs`. */
const dealCols = (stage, proposedMs, decidedMs = null) => ({
  deal_id: `d-${stage}-${proposedMs}`,
  deal_stage: stage,
  deal_service: "Kitchen remodel",
  deal_proposed_at: new Date(proposedMs).toISOString(),
  deal_decided_at: decidedMs === null ? null : new Date(decidedMs).toISOString(),
  deal_ended_at: null,
  deal_amount_cents: null,
  deal_per: null,
});
/** A week that answered everyone and says nothing of booking: only the deal rows can speak. */
const answeredWeek = () =>
  reports({ vm: { answered: { totals: { in: 9, ai: 9, you: 0, none: 0 } } }, booking: { present: false } });
const dealSurface = (rows, over = {}) => ({
  lists: [],
  aggregates: { total: rows.length },
  rows,
  dealsOn: true,
  ...over,
});
const consultsLeak = (rows, over = {}, nowMs = NOW.getTime()) =>
  todayLeaksV2(answeredWeek(), dealSurface(rows, over), [], 4, nowMs).rows.find((l) => l.id === "consults-waiting");

test("consultations with no proposal yet: the next step, said with a digit, in the Pipeline's own sentence, naming its first two, only where deals are on", () => {
  const rows = [
    consulted("p-b", "Bea Ortiz", daysBack(3)),
    consulted("p-a", "Abel Cruz", daysBack(5)),
    // Passed on an old proposal before this consultation: something new began, and no proposal followed it.
    consulted("p-c", "Cora Diaz", daysBack(6), dealCols("lost", daysBack(20), daysBack(10))),
    // A proposal went after the consultation: the step was taken.
    consulted("p-d", "Dana Ruiz", daysBack(2), dealCols("proposed", daysBack(1))),
    // Passed after this consultation's proposal: taken, and answered.
    consulted("p-f", "Fede Luna", daysBack(4), dealCols("lost", daysBack(3), daysBack(1))),
    // Nine days ago is past the week.
    consulted("p-e", "Eli Vega", daysBack(9)),
  ];
  const leak = consultsLeak(rows);
  assert.ok(leak, "three consultations this week with nothing after them");
  assert.equal(leak.text, "3 consultations in the last week ended with no proposal yet.");
  assert.match(leak.text, /\d/, "the sentence has its number in it");
  // The number is the Pipeline's own: the same rule over the same rows, in the Pipeline's one sentence.
  const held = consultationsWithoutProposal(rows, NOW.getTime());
  assert.equal(held.length, 3);
  assert.equal(leak.math, `${consultsHeldWords(3)} · on Pipeline`);
  assert.equal(leak.math, "3 held in the last week, no proposal yet · on Pipeline");
  // Amber: a person should look (the one badge system).
  assert.deepEqual([leak.tag, leak.tone, leak.icon], ["Next step", "warn", "calendar"]);
  assert.equal(
    leak.ask,
    "3 consultations in the last week ended with no proposal yet. 3 held in the last week, no proposal yet · on Pipeline. Why is that?",
  );
  // The count's own people: the first two the rule gives (the oldest first), each to their page.
  assert.equal(leak.peopleLead, "Held with");
  assert.deepEqual(
    leak.people.map((p) => p.id),
    held.slice(0, 2).map((r) => r.id),
  );
  assert.deepEqual(leak.people, [
    { id: "p-c", name: "Cora Diaz", to: "clients/p-c", title: "Open Cora Diaz in People" },
    { id: "p-a", name: "Abel Cruz", to: "clients/p-a", title: "Open Abel Cruz in People" },
  ]);
  assert.deepEqual(leak.cta, { label: "See who", to: "clients/pipeline" }, "the door is the Pipeline");
  assert.equal(leak.also, null, "no act of its own: the proposal is started from the person");

  // One is enough, and one is said as one.
  const one = consultsLeak([consulted("p-b", "Bea Ortiz", daysBack(3))]);
  assert.equal(one.text, "1 consultation in the last week ended with no proposal yet.");
  assert.equal(one.math, "1 held in the last week, no proposal yet · on Pipeline");
  assert.deepEqual(
    one.people.map((p) => p.id),
    ["p-b"],
  );
  // None held: no row.
  assert.equal(
    consultsLeak([consulted("p-d", "Dana Ruiz", daysBack(2), dealCols("proposed", daysBack(1)))]),
    undefined,
  );
  assert.equal(consultsLeak([consulted("p-e", "Eli Vega", daysBack(9))]), undefined);
  // A workspace whose customers book never hears of one, whatever its calendar says (0008).
  for (const dealsOn of [false, undefined])
    assert.equal(
      consultsLeak(rows, { dealsOn }),
      undefined,
      `deals ${dealsOn === false ? "off" : "never said"}: no row`,
    );
  // Rows that do not carry who they are or their consultation (the mockup's sample) are no row, never a throw.
  assert.equal(consultsLeak([{ consent: { state: "opted_in" } }]), undefined);
});

test("REGRESSION: one number, one clock and one sentence with the Pipeline -- the deal rows are counted when People worked its rows out, as the Pipeline counts them", () => {
  // People's rows were worked out at `fetchedAt`; Today draws two hours later. A consultation that ended six days and
  // twenty-three hours before `fetchedAt` is inside the Pipeline's week, and outside Today's by Today's own clock:
  // counted at its own moment, Today said one where the Pipeline beside it said two.
  const fetchedAt = NOW.getTime();
  const later = fetchedAt + 2 * HOUR;
  const edge = fetchedAt - 7 * 86_400_000 + HOUR;
  const rows = [consulted("p-a", "Abel Cruz", edge), consulted("p-b", "Bea Ortiz", daysBack(2))];
  const leak = consultsLeak(rows, { fetchedAt }, later);
  const pipe = pipelineOf(rows, fetchedAt, "America/New_York", null).groups.find((g) => g.key === "consultations");
  assert.equal(pipe.meta, "2 held in the last week, no proposal yet");
  assert.equal(leak.math, `${pipe.meta} · on Pipeline`, "the Pipeline's sentence, word for word");
  assert.equal(leak.text, "2 consultations in the last week ended with no proposal yet.");
  assert.deepEqual(
    leak.people.map((p) => p.id),
    pipe.rows.slice(0, 2).map((r) => r.id),
    "the Pipeline's first two, in its order",
  );
  // Where the surface says no moment, Today's own clock stands: the edge has left the week.
  assert.equal(consultsLeak(rows, {}, later).text, "1 consultation in the last week ended with no proposal yet.");
  // The proposals waiting are counted at the same moment: out six days and twenty-three hours when People was read.
  const waiting = personRow("p-w", "Wes Pardo", { last_inbound_at: at(12), ...dealCols("proposed", edge) });
  const waitingRow = (over) =>
    todayLeaksV2(answeredWeek(), dealSurface([waiting], over), [], 4, later).rows.find(
      (l) => l.id === "proposals-waiting",
    );
  assert.equal(waitingRow({ fetchedAt }), undefined, "not a week yet when People was read");
  assert.ok(waitingRow({}), "a week by Today's own clock alone");
});

test("the consultations row sits after the unanswered and before the proposals waiting, and the cap still counts what it leaves", () => {
  // A proposal out nine days, and nothing heard since: they last wrote twelve days ago.
  const waiting = personRow("p-w", "Wes Pardo", { last_inbound_at: at(12), ...dealCols("proposed", daysBack(9)) });
  const surface = {
    lists: [list("proposal_out", "Proposal out", 1, null), list("quiet", "Quiet 30+ days", 9)],
    aggregates: { total: 3 },
    rows: [consulted("p-b", "Bea Ortiz", daysBack(3)), waiting],
    dealsOn: true,
  };
  // Reports says four messages went unanswered; nothing about booking.
  const r = reports({ booking: { present: false } });
  const all = todayLeaksV2(r, surface, [], 4, NOW.getTime());
  assert.deepEqual(
    all.rows.map((l) => l.id),
    ["unanswered", "consults-waiting", "proposals-waiting", "quiet"],
    "the business's own step before the customer's answer, both before a chance",
  );
  const two = todayLeaksV2(r, surface, [], undefined, NOW.getTime());
  assert.deepEqual(
    two.rows.map((l) => l.id),
    ["unanswered", "consults-waiting"],
  );
  assert.equal(two.rows.length, TODAY_LEAK_MAX);
  assert.equal(
    two.moreLine,
    "and 2 more",
    "the proposals waiting and the quiet list are counted, never dropped in silence",
  );
  // A booking gap still comes first.
  assert.deepEqual(
    todayLeaksV2(reports(), surface, [], 5, NOW.getTime()).rows.map((l) => l.id),
    ["never-booked", "unanswered", "consults-waiting", "proposals-waiting", "quiet"],
  );
});

test("proposals waiting with the follow-up on (0006): the ones it has in hand are no leak; the row counts who it will not reach, names two, and opens the Pipeline's waiting view", () => {
  const out = (id, name, followUp) => ({
    id,
    name,
    consent: { state: "opted_in" },
    askedMs: null,
    deal: { stage: "proposed", sinceMs: NOW.getTime() - 9 * 86_400_000, brief: "Proposal out · 9 d" },
    followUp,
  });
  const will = { kind: "will", atMs: NOW.getTime() + 86_400_000, asks: true };
  const had = { kind: "had", atMs: NOW.getTime() - 86_400_000 };
  const people = (rows) => ({
    lists: [list("proposal_out", "Proposal out", rows.length, act("Open the Inbox", "inbox"))],
    aggregates: { total: rows.length },
    rows,
    dealsOn: true,
  });
  const leakOf = (rows) =>
    todayLeaksV2(reports({ booking: { present: false } }), people(rows), [], 4, NOW.getTime()).rows.find(
      (r) => r.id === "proposals-waiting",
    );
  const mixed = leakOf([
    out("p1", "Ana Ruiz", will),
    out("p2", "Bo Chen", will),
    out("p3", "Cy Park", had),
    out("p4", "Di Lee", null),
  ]);
  assert.equal(mixed.text, "2 proposals went out more than a week ago with nothing back.");
  assert.equal(mixed.math, "4 on Proposal out · nothing heard since it went · the follow-up has 2 more");
  assert.deepEqual(
    mixed.people.map((p) => [p.name, p.to]),
    [
      ["Cy Park", "clients/p3"],
      ["Di Lee", "clients/p4"],
    ],
    "the two it will not reach: their one nudge already gone, or none it can send",
  );
  assert.equal(mixed.peopleLead, "Yours to follow up");
  assert.equal(mixed.cta.to, "clients/pipeline:v-waiting", "where each row says which is which");
  assert.equal(leakOf([out("p1", "Ana Ruiz", will)]), undefined, "all in the follow-up's hands: no row");
  // Never named: someone who asked to stop, or is on do-not-contact -- a follow-up is not theirs to be sent at all.
  const stops = leakOf([
    out("p1", "Ana Ruiz", will),
    { ...out("p5", "Ed Voss", null), consent: { state: "opted_out" } },
    { ...out("p6", "Flo Hart", null), consent: { state: "opted_in", dnc: true } },
    out("p4", "Di Lee", null),
  ]);
  assert.deepEqual(
    stops.people.map((p) => p.name),
    ["Di Lee"],
  );
  const plain = leakOf([out("p1", "Ana Ruiz", null)]);
  assert.deepEqual(
    [plain.people, plain.peopleLead, plain.cta.to, plain.math],
    [[], null, "clients/seg:proposal_out", "1 on Proposal out · nothing heard since it went"],
    "no follow-up running: the row as it was",
  );
});
