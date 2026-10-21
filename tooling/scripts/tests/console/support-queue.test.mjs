/**
 * Support's queue, run (decision 0067, contracts/src/console/support.ts and support-playbooks.ts): the promise's clock
 * of business days in New York across a weekend, a Friday evening and both clock changes; a question's topic from its
 * words; a row's state from the team's acts and the workspace's claim; the queue's order, late first then the oldest;
 * an ask finished by what the workspace shows; the views, kinds, topics and workspaces the tools count; how fast we
 * answered; the inbox's addresses; a playbook for every topic and ask; and the routes' schemas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORT_TOPICS,
  SUPPORT_ZONE,
  SupportMarkSchema,
  SupportQuerySchema,
  answeredMedianMs,
  askCode,
  askDoneOf,
  businessMsBetween,
  inboxHomeUrl,
  inboxSearchUrl,
  playbookOf,
  setupAskMail,
  supportDue,
  supportDueAt,
  supportMeanwhile,
  supportPageOf,
  supportPathOf,
  supportQueueOf,
  supportQuietWords,
  supportSentence,
  supportTopicOf,
  supportViewOf,
  supportWaitOf,
} from "@chanlytics/contracts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (s) => Date.parse(s);
const iso = (ms) => new Date(ms).toISOString();
/** Wednesday 21 October 2026, noon in New York. */
const NOW = at("2026-10-21T12:00:00-04:00");
const ME = "11111111-1111-4111-8111-111111111111";
const ALEX = "22222222-2222-4222-8222-222222222222";
const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/* ------------------------------------------------------------------------------------------- the promise's clock */

test("the promise is 24 hours of business days in New York: a Friday 3 PM question is due Monday 3 PM", () => {
  assert.equal(SUPPORT_ZONE, "America/New_York");
  assert.equal(supportDueAt(at("2026-10-21T09:00:00-04:00")), at("2026-10-22T09:00:00-04:00"), "a Wednesday: a day");
  assert.equal(supportDueAt(at("2026-10-23T15:00:00-04:00")), at("2026-10-26T15:00:00-04:00"), "a Friday afternoon");
  assert.equal(supportDueAt(at("2026-10-23T23:30:00-04:00")), at("2026-10-26T23:30:00-04:00"), "a Friday evening");
  assert.equal(
    supportDueAt(at("2026-10-24T10:00:00-04:00")),
    at("2026-10-27T00:00:00-04:00"),
    "a Saturday: Monday's end",
  );
  assert.equal(supportDueAt(at("2026-10-25T22:00:00-04:00")), at("2026-10-27T00:00:00-04:00"), "a Sunday night too");
  assert.equal(businessMsBetween(at("2026-10-23T15:00:00-04:00"), at("2026-10-26T15:00:00-04:00")), DAY);
  assert.equal(businessMsBetween(at("2026-10-24T00:00:00-04:00"), at("2026-10-26T00:00:00-04:00")), 0, "a weekend");
});

test("a clock change moves nothing: Friday 3 PM before either change is Monday 3 PM after it", () => {
  // 1 November 2026 New York falls back an hour; 8 March 2026 it springs forward. Both on a Sunday, between the two.
  assert.equal(supportDueAt(at("2026-10-30T15:00:00-04:00")), at("2026-11-02T15:00:00-05:00"));
  assert.equal(supportDueAt(at("2026-03-06T15:00:00-05:00")), at("2026-03-09T15:00:00-04:00"));
});

test("the Waiting cell: how long, by when in the reader's zone; amber at three quarters, red once past its day", () => {
  const came = at("2026-10-21T09:00:00-04:00");
  assert.deepEqual(supportWaitOf(came, at("2026-10-21T12:00:00-04:00"), "America/Los_Angeles"), {
    words: "3h · by 6:00 AM tomorrow",
    tone: null,
    part: 0.125,
  });
  const soon = supportWaitOf(came, at("2026-10-22T05:00:00-04:00"), SUPPORT_ZONE);
  assert.equal(soon.words, "20h · by 9:00 AM today");
  assert.equal(soon.tone, "warn");
  assert.deepEqual(supportWaitOf(came, at("2026-10-22T14:00:00-04:00"), SUPPORT_ZONE), {
    words: "past its day by 5h",
    tone: "danger",
    part: 1,
  });
  const friday = supportWaitOf(at("2026-10-23T15:00:00-04:00"), at("2026-10-23T16:00:00-04:00"), SUPPORT_ZONE);
  assert.equal(friday.words, "1h · by 3:00 PM Mon", "a day after tomorrow says its weekday");
});

/* --------------------------------------------------------------------------------------------------- topics */

test("a question's topic is read from its words, forwarding before a line, the plan's billing before prices", () => {
  const cases = [
    ["How do I connect WhatsApp? The button goes back to the same page.", "whatsapp"],
    ["Calls to my number should ring the receptionist, I use RingCentral", "forwarding"],
    ["Can I get a new phone number in 305?", "line"],
    ["The calendar shows the wrong times for booking", "calendar"],
    ["My invoice has the wrong business name", "billing"],
    ["Can it answer in Spanish too?", "language"],
    ["Can it answer in Spanish too? Half my clients text in Spanish.", "language"],
    ["My texts aren't reaching customers", "line"],
    ["How do I change our opening hours and prices", "facts"],
    ["How do I invite someone to the team?", "team"],
    ["Hello", "other"],
  ];
  for (const [words, topic] of cases) assert.equal(supportTopicOf(words, null), topic, words);
  assert.equal(
    supportTopicOf("It doesn't show anything", "calendar"),
    "calendar",
    "the page, where the words say none",
  );
  assert.equal(supportTopicOf("How do I add WhatsApp?", null, "billing"), "billing", "billing at the door is billing");
});

/* ---------------------------------------------------------------------------------------------------- the queue */

const tenant = (over = {}) => ({
  tenant_id: T1,
  slug: "harbor-moving",
  name: "Harbor Moving",
  status: "active",
  timezone: "America/Los_Angeles",
  created_at: iso(NOW - 20 * DAY),
  members: 2,
  billing_mode: "stripe",
  billing_status: "trialing",
  trial_end: iso(NOW + 11 * DAY),
  current_period_end: null,
  line_e164: null,
  line_kind: null,
  voice_state: null,
  sms_state: null,
  reg_step: null,
  reg_mock: null,
  reg_sole_prop: null,
  line_error: null,
  whatsapp_number: null,
  whatsapp_active: null,
  voice_number: null,
  voice_active: null,
  last_inbound_at: null,
  ...over,
});

const report = (over = {}) => ({
  id: "r0000000-0000-4000-8000-000000000001",
  number: 1044,
  kind: "how_to",
  tenant_id: T1,
  slug: "harbor-moving",
  name: "Harbor Moving",
  email: "dana@example.com",
  page: "admin",
  error_id: null,
  error_name: null,
  error_message: null,
  words: "How do I connect WhatsApp?",
  created_at: iso(NOW - 3 * HOUR),
  mailed_at: iso(NOW - 3 * HOUR),
  mail_error: null,
  who: { name: "Dana Kim", role: "owner", since: iso(NOW - 19 * DAY) },
  ...over,
});

const ask = (over = {}) => ({
  id: "3f9c2a77-0000-4000-8000-000000000000",
  tenant_id: T2,
  slug: "atlas-plumbing",
  name: "Atlas Plumbing",
  what: "line",
  at: iso(NOW - 2 * DAY),
  email: "tom@example.com",
  who: { name: "Tom Atlas", role: "owner", since: iso(NOW - 30 * DAY) },
  ...over,
});

const act = (act, id, kind, whenMs, email = "alex@chanlytics.test") => ({
  act,
  target_kind: kind,
  target_id: id,
  at: iso(whenMs),
  actor_email: email,
});

const book = (over = {}) => ({
  reports: [],
  asks: [],
  acts: [],
  claims: [],
  tenants: [tenant(), tenant({ tenant_id: T2, slug: "atlas-plumbing", name: "Atlas Plumbing" })],
  signals: {},
  ...over,
});

const queue = (b) => supportQueueOf(b, { me: ME, nowMs: NOW, zone: SUPPORT_ZONE });

test("a question is new, then taken (the workspace's claim), then done once answered; a bug is never Support's", () => {
  const r = report();
  const bug = report({ id: "r0000000-0000-4000-8000-000000000009", number: 1045, kind: "wrong", error_id: "e4c1" });
  let [row, ...rest] = queue(book({ reports: [r, bug] }));
  assert.equal(rest.length, 0, "the bug is Health's");
  assert.deepEqual([row.kind, row.code, row.state, row.stateWords], ["question", "R-1044", "new", "New"]);
  assert.equal(row.who, "Dana Kim, Owner");
  assert.equal(row.first, "Dana");
  assert.equal(row.topic, "whatsapp");
  assert.equal(row.sent, "3h ago · 9:00 AM yours · 6:00 AM in Los Angeles");
  const claim = { tenant_id: T1, user_id: ALEX, email: "alex@chanlytics.test", until: iso(NOW + HOUR) };
  [row] = queue(book({ reports: [r], claims: [claim] }));
  assert.deepEqual([row.state, row.stateWords], ["taken", "Alex is on it"]);
  [row] = queue(book({ reports: [r], acts: [act("report_answered", r.id, "report", NOW - HOUR)] }));
  assert.equal(row.state, "done");
  assert.equal(row.answered, "Answered by Alex in 2h");
  assert.equal(supportViewOf(row), "done");
  [row] = queue(
    book({
      reports: [r],
      acts: [act("report_answered", r.id, "report", NOW - HOUR), act("report_reopened", r.id, "report", NOW - 60_000)],
    }),
  );
  assert.equal(row.state, "new", "the latest mark wins: open again is open");
});

test("an ask answered waits on the workspace, and is done when the workspace shows it, or by hand where nothing can", () => {
  const a = ask();
  const answered = act("ask_answered", a.id, "ask", NOW - DAY);
  let [row] = queue(book({ asks: [a], acts: [answered] }));
  assert.deepEqual([row.code, row.state, row.title], ["A-3f9c2a", "waiting", "Atlas Plumbing asked for a phone line"]);
  assert.equal(row.doneWhen, "Done when the workspace has a line");
  const lined = book({
    asks: [a],
    acts: [answered],
    tenants: [tenant({ tenant_id: T2, slug: "atlas-plumbing", line_e164: "+13055550100", line_kind: "bought" })],
  });
  [row] = queue(lined);
  assert.equal(row.state, "done", "the line exists");
  const port = ask({ what: "port" });
  [row] = queue(book({ asks: [port], acts: [act("ask_answered", port.id, "ask", NOW - DAY)] }));
  assert.deepEqual([row.state, row.byHand], ["waiting", true]);
  [row] = queue(
    book({
      asks: [port],
      acts: [act("ask_answered", port.id, "ask", NOW - DAY), act("ask_done", port.id, "ask", NOW - HOUR)],
    }),
  );
  assert.equal(row.state, "done");
});

test("what tells an ask is done: a line of its own, a forwarding test after the ask, else a person's word", () => {
  const asked = NOW - DAY;
  assert.equal(
    askDoneOf("line", tenant({ line_e164: "+13055550100", line_kind: "forwarded" }), asked, null).done,
    false,
  );
  assert.equal(askDoneOf("line", tenant({ line_e164: "+13055550100", line_kind: "bought" }), asked, null).done, true);
  assert.equal(askDoneOf("forwarding", null, asked, { forwarding_verified_at: iso(asked - HOUR) }).done, false);
  assert.equal(askDoneOf("forwarding", null, asked, { forwarding_verified_at: iso(asked + HOUR) }).done, true);
  for (const what of ["port", "repair", "name"])
    assert.equal(askDoneOf(what, tenant(), asked, null).byHand, true, what);
  assert.equal(askCode("3f9c2a77-0000-4000-8000-000000000000"), "A-3f9c2a");
});

test("the queue's order: what is late first, then the oldest; the answered after, the latest answered first", () => {
  const late = report({ id: "r0000000-0000-4000-8000-000000000002", number: 1040, created_at: iso(NOW - 3 * DAY) });
  const older = report({ id: "r0000000-0000-4000-8000-000000000003", number: 1041, created_at: iso(NOW - 10 * HOUR) });
  const fresh = report({ id: "r0000000-0000-4000-8000-000000000004", number: 1042, created_at: iso(NOW - HOUR) });
  const done1 = report({ id: "r0000000-0000-4000-8000-000000000005", number: 1030, created_at: iso(NOW - 5 * DAY) });
  const done2 = report({ id: "r0000000-0000-4000-8000-000000000006", number: 1031, created_at: iso(NOW - 4 * DAY) });
  const rows = queue(
    book({
      reports: [fresh, done1, older, late, done2],
      acts: [
        act("report_answered", done1.id, "report", NOW - 4 * DAY),
        act("report_answered", done2.id, "report", NOW - 2 * DAY),
      ],
    }),
  );
  assert.deepEqual(
    rows.map((r) => r.code),
    ["R-1040", "R-1041", "R-1042", "R-1031", "R-1030"],
  );
  assert.deepEqual(
    supportDue(rows, NOW).map((r) => r.code),
    ["R-1040"],
    "Home's Due: only what needs a person and is past its day",
  );
});

test("the tools count each view, the current view's kinds, its topics and workspaces; Done keeps thirty days", () => {
  const q1 = report();
  const q2 = report({
    id: "r0000000-0000-4000-8000-000000000007",
    number: 1046,
    words: "Can it answer in Spanish?",
    created_at: iso(NOW - 30 * HOUR),
  });
  const oldDone = report({ id: "r0000000-0000-4000-8000-000000000008", number: 1001, created_at: iso(NOW - 60 * DAY) });
  const a = ask();
  const rows = queue(
    book({
      reports: [q1, q2, oldDone],
      asks: [a],
      acts: [act("report_answered", oldDone.id, "report", NOW - 45 * DAY)],
    }),
  );
  const all = { view: "needs", kind: "all", topic: null, workspace: null, q: "" };
  const page = supportPageOf(rows, all, NOW);
  assert.deepEqual(page.counts.views, { needs: 3, waiting: 0, done: 0 }, "an answer older than thirty days is gone");
  assert.deepEqual(page.counts.kinds, { all: 3, question: 2, ask: 1 });
  assert.equal(page.counts.late, 2, "the ask two days old and the question of thirty hours");
  assert.deepEqual(
    page.counts.topics.map((t) => [t.topic, t.n]),
    [
      ["whatsapp", 1],
      ["line", 1],
      ["language", 1],
    ],
  );
  assert.deepEqual(
    supportPageOf(rows, { ...all, kind: "question", topic: "language" }, NOW).rows.map((r) => r.code),
    ["R-1046"],
  );
  assert.deepEqual(
    supportPageOf(rows, { ...all, q: "atlas" }, NOW).rows.map((r) => r.code),
    ["A-3f9c2a"],
    "words find a workspace",
  );
  assert.equal(
    supportSentence(page.counts, 5 * HOUR),
    "3 need a person · 2 past their day · answered in 5h this month",
  );
});

test("how fast we answered: the median first answer of the month; a quiet queue says its last row, never nothing", () => {
  const a = report({ created_at: iso(NOW - 10 * HOUR) });
  const b = report({ id: "r0000000-0000-4000-8000-000000000002", number: 1045, created_at: iso(NOW - 10 * HOUR) });
  const acts = [
    act("report_answered", a.id, "report", NOW - 8 * HOUR),
    act("report_answered", a.id, "report", NOW - HOUR),
    act("report_answered", b.id, "report", NOW - 6 * HOUR),
  ];
  const rows = queue(book({ reports: [a, b], acts }));
  assert.equal(answeredMedianMs(rows, acts, NOW), 3 * HOUR, "each row's first answer: 2h and 4h");
  assert.equal(answeredMedianMs([], [], NOW), null);
  assert.equal(
    supportQuietWords(rows, NOW),
    "Nothing needs a person. The last question was R-1044, 10h ago, answered by Alex in 2h.",
  );
  assert.equal(supportQuietWords([], NOW), "Nothing needs a person. No question or ask has come in yet.");
});

test("the inbox is opened from one template: a search on the code, its inbox at #inbox; unset, there is none", () => {
  const t = "https://mail.google.com/mail/?authuser=hi@chanlytics.agency#search/{q}";
  assert.equal(
    inboxSearchUrl(t, "R-1044"),
    "https://mail.google.com/mail/?authuser=hi@chanlytics.agency#search/R-1044",
  );
  assert.equal(inboxHomeUrl(t), "https://mail.google.com/mail/?authuser=hi@chanlytics.agency#inbox");
  assert.equal(inboxSearchUrl(null, "R-1044"), null);
  assert.equal(inboxSearchUrl("https://mail.example.com/", "R-1044"), null, "a template with nowhere for the words");
  assert.equal(supportPathOf("R-1044"), "/console/support?open=R-1044");
});

/* ------------------------------------------------------------------------------------------------- playbooks */

test("every topic and every ask has a playbook: what to check, the steps, a signed reply with their first name", () => {
  const fill = { first: "Dana", workspace: "Harbor Moving", me: "Ruben", tenantId: T1 };
  for (const topic of SUPPORT_TOPICS) {
    const p = playbookOf({ kind: "question", topic, what: null });
    assert.ok(p.title && p.check && p.steps(fill).length > 0, topic);
    const reply = p.reply(fill);
    assert.match(reply, /^Hi Dana, /, `${topic} greets them by name`);
    assert.match(reply, /\n— Ruben, Chanlytics$/, `${topic} is signed`);
  }
  for (const what of ["line", "port", "forwarding", "repair", "name"]) {
    const p = playbookOf({ kind: "ask", topic: "other", what });
    assert.ok(p.title && p.check && p.steps(fill).length > 0, what);
    assert.ok(setupAskMail(what)?.subject, `${what} is mailed with the same steps`);
  }
  assert.match(playbookOf({ kind: "ask", topic: "line", what: "line" }).steps(fill).join("\n"), new RegExp(T1));
  assert.match(
    playbookOf({ kind: "question", topic: "other", what: null }).reply({ ...fill, first: null }),
    /^Hi there,/,
  );
  assert.equal(setupAskMail("nonsense"), null);
  assert.equal(supportMeanwhile("whatsapp"), "WhatsApp connects from Settings › Connections › WhatsApp.");
  assert.equal(supportMeanwhile("other"), null);
});

/* ---------------------------------------------------------------------------------------------------- schemas */

test("the routes' schemas: a view narrowed by kind, topic, workspace and words; a question is never marked done", () => {
  assert.deepEqual(SupportQuerySchema.parse({}), { view: "needs", kind: "all", q: "", page: 1 });
  assert.equal(SupportQuerySchema.safeParse({ view: "week" }).success, false, "the old views are gone");
  assert.equal(SupportQuerySchema.safeParse({ workspace: "../etc" }).success, false);
  assert.equal(SupportQuerySchema.parse({ page: "2" }).page, 2);
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  assert.equal(SupportMarkSchema.safeParse({ target: "report", id, mark: "answered" }).success, true);
  assert.equal(SupportMarkSchema.safeParse({ target: "ask", id, mark: "done" }).success, true);
  assert.equal(SupportMarkSchema.safeParse({ target: "report", id, mark: "done" }).success, false);
});
