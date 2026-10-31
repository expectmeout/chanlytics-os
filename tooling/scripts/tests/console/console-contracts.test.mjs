/**
 * The Console's pure half (decision 0066, contracts/src/console): who may take which act, the reason every act carries
 * and the words the log says it in, the screens' addresses, how Home groups the workspaces and counts, who has a
 * workspace, the thirty-day clock and its steps, Health's clusters and what came in, Find's kinds, and the short id an
 * error is reported by. Support's queue is support-queue.test.mjs's. Run, not read: each function is called with the
 * cases it exists for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACT_OUTCOMES,
  ACT_TARGETS,
  CONSOLE_ACTS,
  CONSOLE_ACT_KEYS,
  CONSOLE_PATH,
  CONSOLE_SCREENS,
  ConsoleWhySchema,
  PartnerStandingSchema,
  RequestFileSchema,
  RequestStepSchema,
  REQUEST_STEPS,
  SECOND_FACTOR_STAFF_PATH,
  SECOND_FACTOR_WORDS,
  STAFF_ROLES,
  actRowOf,
  actsCsv,
  cameInOf,
  claimWords,
  consoleAddressOf,
  consoleGroupOf,
  consoleGroups,
  consoleNumbersFrom,
  consoleNumbersOf,
  consolePathOf,
  errorIdOf,
  findDigits,
  findGroups,
  homeSentence,
  platformRows,
  platformSummary,
  reportCode,
  reportKindOf,
  reportProblemOf,
  REPORT_KINDS,
  REPORT_KIND_WORDS,
  ReportProblemInput,
  requestClock,
  requestCode,
  requestDueAt,
  privacyRequestOf,
  requestDayWords,
  requestStepChange,
  requestsInOrder,
  secondFactorAsked,
  staffCannotSeeWords,
  staffCannotWords,
  staffMay,
  staffName,
  staffSees,
  staffSeesScreen,
  supportClusters,
  whyWords,
} from "@chanlytics/contracts";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();

/* ------------------------------------------------------------------------------------------ the staff and the acts */

test("three roles: the owner takes every act, Support the workspaces' work, Billing the money and nothing else", () => {
  assert.deepEqual(STAFF_ROLES, ["owner", "support", "billing"]);
  for (const act of CONSOLE_ACT_KEYS) assert.ok(staffMay("owner", act), `the owner may ${act}`);
  const money = CONSOLE_ACT_KEYS.filter((a) => staffMay("billing", a));
  assert.deepEqual(money.sort(), ["partner_payout", "partner_standing"]);
  for (const act of money) assert.equal(staffMay("support", act), false, `Support does not ${act}`);
  for (const act of ["line_release", "line_refile", "job_requeue", "request_file", "partner_second_factor"])
    assert.ok(staffMay("support", act) && !staffMay("billing", act), act);
  assert.equal(staffMay(null, "line_retry"), false, "nobody's role takes nothing");
  assert.equal(staffCannotWords("billing", "line_release"), "Billing cannot do that: give the number back.");
});

test("what each role reads is the approved matrix: every screen to every role, the privacy requests to those who work them", () => {
  for (const role of STAFF_ROLES)
    for (const screen of CONSOLE_SCREENS)
      assert.equal(staffSeesScreen(role, screen), !(role === "billing" && screen === "requests"), `${role} ${screen}`);
  assert.ok(staffSees("owner", "requests") && staffSees("support", "requests"));
  assert.equal(staffSees("billing", "requests"), false);
  assert.equal(staffSees(null, "requests"), false, "nobody's role reads nothing");
  assert.equal(staffSeesScreen(undefined, "home"), false);
  assert.equal(staffCannotSeeWords("billing", "requests"), "Billing cannot see the privacy requests.");
});

test("an act's key is the log's column: lower case, under forty characters, as the table's CHECK holds it", () => {
  for (const act of CONSOLE_ACT_KEYS) assert.match(act, /^[a-z][a-z_]{1,39}$/, act);
  assert.ok(Object.values(CONSOLE_ACTS).every((a) => a.words && a.roles.length));
  assert.deepEqual(ACT_OUTCOMES, ["running", "done", "refused", "failed"]);
  assert.ok(ACT_TARGETS.includes("workspace") && ACT_TARGETS.includes("request"));
});

test("a person on the team is named by their address, and someone with none is someone", () => {
  assert.equal(staffName("alex.m@chanlytics.com"), "Alex");
  assert.equal(staffName("ruben@rjcapital.io"), "Ruben");
  assert.equal(staffName(null), "Someone");
});

/* --------------------------------------------------------------------------------------------------- the reason */

test("every act asks why: a kind, the ticket when that is the reason, a note; a partner reads the note, so it is asked", () => {
  const ok = (why) => ConsoleWhySchema.safeParse(why);
  assert.equal(ok({ kind: "found", ticket: null, note: null }).success, true);
  assert.equal(ok({ kind: "ticket", ticket: "  ", note: "x" }).success, false, "a ticket as the reason names it");
  const parsed = ok({ kind: "ticket", ticket: " R-1042 ", note: "  " });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data, { kind: "ticket", ticket: "R-1042", note: null }, "trimmed, and a blank note is none");
  assert.equal(ok({ kind: "because", ticket: null, note: null }).success, false);
  assert.equal(ok({ kind: "found", ticket: null, note: null, extra: 1 }).success, false);
  const standing = (note) =>
    PartnerStandingSchema.safeParse({
      tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      standing: "qualified",
      why: { kind: "call", ticket: null, note },
    });
  assert.equal(standing(null).success, false, "the partner reads why");
  assert.equal(standing("Checked the card by hand.").success, true);
  assert.equal(
    whyWords({ kind: "ticket", ticket: "R-1042", note: "They asked twice" }),
    "Ticket · R-1042 · They asked twice",
  );
  assert.equal(whyWords({ kind: "cleanup", ticket: null, note: null }), "Cleanup");
});

/* ------------------------------------------------------------------------------------------------------ the log */

const act = (over = {}) => ({
  id: "a1",
  at: iso(NOW - 2 * 3_600_000),
  actor_id: "u1",
  actor_email: "alex@chanlytics.com",
  actor_role: "support",
  act: "line_retry",
  tenant_id: "t1",
  slug: "bloom-studio",
  name: "Bloom Studio",
  target_kind: "line",
  target_id: "l1",
  reason_kind: "ticket",
  ticket: "R-1031",
  note: "Stopped at the brand step",
  outcome: "done",
  outcome_note: null,
  finished_at: iso(NOW - 2 * 3_600_000 + 2000),
  ...over,
});

test("the log says who, what, where and why, then what came of it; a deleted workspace is said as one", () => {
  const row = actRowOf(act(), NOW);
  assert.deepEqual(
    [row.who, row.role, row.what, row.where, row.why, row.outcome.label, row.slug],
    [
      "Alex",
      "Support",
      "Retry setting up",
      "Bloom Studio",
      "Ticket · R-1031 · Stopped at the brand step",
      "Done",
      "bloom-studio",
    ],
  );
  assert.equal(actRowOf(act({ name: null, slug: null }), NOW).where, "A workspace since deleted");
  assert.equal(
    actRowOf(act({ tenant_id: null, name: null, slug: null, target_kind: "waitlist" }), NOW).where,
    "The waiting list",
  );
  assert.equal(actRowOf(act({ outcome: "refused", outcome_note: "already_registered" }), NOW).outcome.tone, "danger");
});

test("a running act still running a minute on says Running; one quiet past five minutes says it never finished", () => {
  const started = (ago) => act({ at: iso(NOW - ago), outcome: "running", finished_at: null });
  assert.equal(actRowOf(started(60_000), NOW).outcome.label, "Running");
  assert.equal(actRowOf(started(60_000), NOW).outcomeNote, null);
  const quiet = actRowOf(started(6 * 60_000), NOW);
  assert.deepEqual(quiet.outcome, { label: "Never finished", tone: "warn" });
  assert.match(quiet.outcomeNote, /nothing came back/);
  assert.equal(
    actRowOf(act({ at: iso(NOW - 6 * 60_000) }), NOW).outcome.label,
    "Done",
    "a finished act is what it was",
  );
});

test("the log as a CSV: a header, a line an act, a cell with a comma or a quote quoted", () => {
  const csv = actsCsv([act({ note: 'They said "now", twice' })]);
  const [head, line] = csv.split("\r\n");
  assert.equal(head, "at,who,role,act,workspace,reason,ticket,note,outcome,outcome_note");
  assert.match(line, /,support,line_retry,bloom-studio,ticket,R-1031,"They said ""now"", twice",done,$/);
  const planted = actsCsv([act({ note: "=HYPERLINK(1)", outcome_note: "@SUM(1)" })]).split("\r\n")[1];
  assert.match(planted, /,'=HYPERLINK\(1\),done,'@SUM\(1\)$/, "a cell a spreadsheet would run opens as text");
});

/* -------------------------------------------------------------------------------------------- the screens' addresses */

test("an address names its screen, a workspace and its tab; what it cannot read is Home", () => {
  assert.deepEqual(consoleAddressOf("/console"), { screen: "home", slug: null, tab: "overview" });
  assert.deepEqual(consoleAddressOf("/console/support"), { screen: "support", slug: null, tab: "overview" });
  assert.deepEqual(consoleAddressOf("/console/workspaces/bloom-studio/lines"), {
    screen: "workspaces",
    slug: "bloom-studio",
    tab: "lines",
  });
  assert.deepEqual(consoleAddressOf("/console/workspaces/bloom-studio/nope").tab, "overview");
  assert.deepEqual(consoleAddressOf("/console/everything").screen, "home");
  assert.deepEqual(consoleAddressOf("/w/acme/today").screen, "home");
  assert.deepEqual(consoleAddressOf("/console/workspaces/Not A Slug").slug, null);
  for (const s of CONSOLE_SCREENS) assert.equal(consoleAddressOf(consolePathOf(s)).screen, s, s);
  assert.equal(
    consolePathOf("workspaces", "bloom-studio", "activity"),
    `${CONSOLE_PATH}/workspaces/bloom-studio/activity`,
  );
  assert.equal(consolePathOf("workspaces", "bloom-studio", "overview"), `${CONSOLE_PATH}/workspaces/bloom-studio`);
});

/* ------------------------------------------------------------------------------------------ Home and its groups */

const tenant = (over = {}) => ({
  tenant_id: "t1",
  slug: "harbor",
  name: "Harbor",
  status: "active",
  timezone: "America/New_York",
  created_at: iso(NOW - 90 * DAY),
  members: 2,
  billing_mode: "stripe",
  billing_status: "active",
  trial_end: null,
  current_period_end: null,
  line_e164: "+15550100123",
  line_kind: "chanlytics",
  voice_state: "answering",
  sms_state: "active",
  reg_step: null,
  reg_mock: false,
  reg_sole_prop: false,
  line_error: null,
  whatsapp_number: null,
  whatsapp_active: false,
  voice_number: "+15550100123",
  voice_active: true,
  last_inbound_at: iso(NOW - 3_600_000),
  ...over,
});

test("Home groups the verdicts by who the next move is with, in the order a shift works them", () => {
  assert.equal(consoleGroupOf("broken"), "needs_us");
  assert.equal(consoleGroupOf("billing"), "waiting");
  assert.equal(consoleGroupOf("test"), "ours");
  const rows = platformRows(
    [
      tenant({ tenant_id: "a", slug: "fine", name: "Fine" }),
      tenant({ tenant_id: "b", slug: "broken", name: "Broken", voice_state: "failed", line_error: "refused" }),
      tenant({ tenant_id: "c", slug: "ours", name: "Ours", status: "test" }),
    ],
    NOW,
  );
  assert.deepEqual(
    consoleGroups(rows).map((g) => [g.group, g.rows.map((r) => r.slug)]),
    [
      ["needs_us", ["broken"]],
      ["live", ["fine"]],
      ["ours", ["ours"]],
    ],
    "an empty group is left out",
  );
});

test("Home's numbers count customers, at the plan's price; a spend that could not be read says so", () => {
  const tenants = [
    tenant({ tenant_id: "a" }),
    tenant({ tenant_id: "b", billing_mode: "direct" }),
    tenant({ tenant_id: "c", billing_status: "trialing", trial_end: iso(NOW + 2 * DAY), last_inbound_at: null }),
    tenant({ tenant_id: "d", billing_status: "trialing", trial_end: iso(NOW + 11 * DAY) }),
    tenant({ tenant_id: "e", status: "test" }),
  ];
  const n = consoleNumbersFrom(
    tenants,
    { usd: 66.4, workspaces: 10 },
    { unit_amount: 9900, currency: "usd", interval: "month" },
    NOW,
  );
  assert.equal(n.paying, 2, "the test workspace is not a customer");
  assert.equal(n.paying_cents, 9900, "a direct arrangement pays outside Stripe's price");
  assert.equal(n.trials, 2);
  assert.equal(n.trials_ending, 1);
  const said = consoleNumbersOf(n);
  assert.deepEqual(
    said.map((x) => [x.label, x.value]),
    [
      ["Paying", "$99"],
      ["On a trial", "2"],
      ["Heard from today", `${n.heard_today} of ${n.answering}`],
      ["Model calls, 30 days", "$66"],
    ],
  );
  assert.equal(said[1].tone, "warn", "a trial ending this week is worth a look");
  const blind = consoleNumbersOf(consoleNumbersFrom(tenants, null, null, NOW));
  assert.equal(blind[0].value, "2", "no price: the workspaces alone");
  assert.equal(blind[3].value, "—");
  assert.equal(blind[3].sub, "could not be read");
  assert.equal(
    homeSentence({ needsUs: 1, waiting: 3, cameIn: 2, due: null }),
    "1 needs us · 3 waiting on them · 2 came in this week",
  );
});

test("who has a workspace: nobody once it ran out, you, or someone by name", () => {
  const claim = { tenant_id: "t1", user_id: "u2", email: "alex@chanlytics.com", until: iso(NOW + 3_600_000) };
  assert.equal(claimWords(claim, "u1", NOW), "Alex is on it");
  assert.equal(claimWords(claim, "u2", NOW), "You have it");
  assert.equal(claimWords({ ...claim, until: iso(NOW - 1) }, "u1", NOW), null);
  assert.equal(claimWords(null, "u1", NOW), null);
});

/* ------------------------------------------------------------------------------------------------------ requests */

const request = (over = {}) => ({
  id: "q1",
  number: 101,
  kind: "delete_workspace",
  tenant_id: "t1",
  slug: "old-town-cuts",
  name: "Old Town Cuts",
  asked_by: "owner@example.com",
  asked_at: iso(NOW - 7 * DAY),
  ticket: null,
  note: null,
  due_at: requestDueAt(iso(NOW - 7 * DAY)),
  steps: {},
  closed_at: null,
  created_at: iso(NOW - 7 * DAY),
  ...over,
});

test("the promise's clock: thirty days from when they asked, amber in its last ten, red once late", () => {
  assert.equal(requestDueAt("2026-10-01T00:00:00.000Z"), "2026-10-31T00:00:00.000Z");
  assert.deepEqual(requestClock(iso(NOW + 23 * DAY), null, NOW), { days: 23, words: "23 days left", tone: "plain" });
  assert.equal(requestClock(iso(NOW + 9 * DAY), null, NOW).tone, "warn");
  assert.deepEqual(requestClock(iso(NOW - 2 * DAY), null, NOW), { days: -2, words: "2 days late", tone: "danger" });
  assert.equal(requestClock(iso(NOW - 2 * DAY), iso(NOW), NOW).words, "Closed");
  assert.equal(requestCode(101), "Q-101");
  const vm = privacyRequestOf(request({ steps: { confirmed: iso(NOW) } }), NOW, "UTC");
  assert.deepEqual(
    vm.steps.map((s) => s.step),
    REQUEST_STEPS.delete_workspace,
  );
  assert.equal(vm.next, "copy_sent");
});

test("a request's days are the reader's: a step done late in a Chicago evening is that evening's date", () => {
  const evening = "2026-10-21T03:07:00.000Z";
  const seen = (tz) => privacyRequestOf(request({ asked_at: evening, steps: { confirmed: evening } }), NOW, tz);
  assert.equal(seen("America/Chicago").steps[0].says, "Done Oct 20, 2026");
  assert.equal(seen("UTC").steps[0].says, "Done Oct 21, 2026");
  assert.match(seen("America/Chicago").asked, /, Oct 20, 2026$/);
  assert.equal(seen("UTC").steps[1].says, seen("UTC").steps[1].hint, "a step still waiting says what it takes");
  assert.equal(requestDayWords("not a date", "UTC"), "");
});

test("a step is marked or unmarked, a request closes once every step is done, and a closed one changes no more", () => {
  const r = request();
  const marked = requestStepChange(r, "confirmed", true, iso(NOW));
  assert.deepEqual(marked, { steps: { confirmed: iso(NOW) }, closedAt: null });
  assert.deepEqual(requestStepChange({ ...r, steps: { confirmed: "x" } }, "confirmed", false, iso(NOW)), {
    steps: {},
    closedAt: null,
  });
  assert.match(requestStepChange(r, "close", true, iso(NOW)).refused, /Mark each step first: “They confirmed”/);
  assert.match(requestStepChange(r, "answered", true, iso(NOW)).refused, /not one this request has/);
  const all = Object.fromEntries(REQUEST_STEPS.delete_workspace.map((s) => [s, iso(NOW)]));
  assert.deepEqual(requestStepChange({ ...r, steps: all }, "close", true, iso(NOW)), {
    steps: all,
    closedAt: iso(NOW),
  });
  assert.match(requestStepChange({ ...r, closed_at: iso(NOW) }, "confirmed", true, iso(NOW)).refused, /closed already/);
});

test("open requests first, the nearest due first; a request is filed by its workspace's address", () => {
  const order = requestsInOrder(
    [
      request({ id: "late", due_at: iso(NOW + 20 * DAY) }),
      request({ id: "closed", closed_at: iso(NOW - DAY) }),
      request({ id: "soon", due_at: iso(NOW + 2 * DAY) }),
    ],
    NOW,
    "UTC",
  ).map((q) => q.id);
  assert.deepEqual(order, ["soon", "late", "closed"]);
  const file = (over) =>
    RequestFileSchema.safeParse({
      kind: "delete_workspace",
      workspace: "Old-Town-Cuts",
      asked_by: "owner@example.com",
      asked_at: "2026-10-13T12:00:00Z",
      why: { kind: "ticket", ticket: "R-1044", note: null },
      ...over,
    });
  assert.equal(file({}).data.workspace, "old-town-cuts", "as /w/ says it");
  assert.equal(file({ workspace: "not a slug" }).success, false);
  assert.equal(file({ asked_at: "yesterday" }).success, false);
  assert.equal(
    RequestStepSchema.safeParse({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      step: "close",
      done: true,
      why: { kind: "cleanup", ticket: null, note: null },
    }).success,
    true,
  );
});

/* ------------------------------------------------------------------------------------------------ Support, Find */

const report = (over = {}) => ({
  id: "r1",
  number: 1042,
  kind: "wrong",
  tenant_id: "t1",
  slug: "rivera-nails",
  name: "Rivera Nails",
  email: "ana@example.com",
  page: "calendar",
  error_id: "e4c1",
  error_name: "TypeError",
  error_message: "Cannot read properties of undefined",
  words: "The calendar won't load",
  created_at: iso(NOW - 12 * 60_000),
  mailed_at: iso(NOW - 12 * 60_000),
  mail_error: null,
  who: null,
  ...over,
});

test("one error two workspaces reported is the product; one workspace pressing twice is a person", () => {
  const clusters = supportClusters(
    [
      report(),
      report({ id: "r2", tenant_id: "t2", name: "Casa Verde Spa" }),
      report({ id: "r3", tenant_id: "t3", name: "Lumen Dental", error_id: "9a10" }),
      report({ id: "r4", tenant_id: "t3", name: "Lumen Dental", error_id: "9a10" }),
    ],
    NOW,
  );
  assert.deepEqual(
    clusters.map((c) => [c.errorId, c.workspaces, c.reports]),
    [["e4c1", ["Rivera Nails", "Casa Verde Spa"], 2]],
  );
  assert.equal(reportCode(1042), "R-1042");
});

test("what came in is one list, newest first: a question by its number, a setup ask in the third person; a bug is Health's", () => {
  const ask = {
    id: "3f9c2a77-0000-4000-8000-000000000000",
    tenant_id: "t9",
    slug: "atlas",
    name: "Atlas Plumbing",
    what: "line",
    at: iso(NOW - 60_000),
    email: null,
    who: null,
  };
  const rows = cameInOf(
    [report({ kind: "how_to", created_at: iso(NOW - 3_600_000) }), report({ id: "r2", number: 1043 })],
    [ask],
    NOW,
  );
  assert.deepEqual(
    rows.map((r) => [r.kind, r.title, r.code]),
    [
      ["setup", "Atlas Plumbing asked for a phone line", "A-3f9c2a"],
      ["report", "“The calendar won't load”", "R-1042"],
    ],
  );
  assert.equal(rows[1].detail, "Question · Calendar", "a question says what it is about, never its error");
  const billing = cameInOf([report({ kind: "billing", words: "The invoice is wrong" })], [], NOW);
  assert.equal(billing[0].detail, "Billing", "said once where the kind and the topic are one word");
});

test("Find reads a number as a number only when it is one, and groups what it found by kind", () => {
  assert.equal(findDigits("(555) 010-0123"), "5550100123");
  assert.equal(findDigits("555"), null, "too short to be a number");
  assert.equal(findDigits("R-1042"), null, "a report's number is words");
  const groups = findGroups([
    { kind: "report", tenant_id: null, slug: null, name: null, label: "R-1042", detail: null },
    { kind: "workspace", tenant_id: "t1", slug: "harbor", name: "Harbor", label: "Harbor", detail: "harbor" },
  ]);
  assert.deepEqual(
    groups.map((g) => g.kind),
    ["workspace", "report"],
  );
});

/* ------------------------------------------------------------------------------------------- Report a problem */

test("an error's short id is the same for the same error on the same page, and four characters", () => {
  const a = errorIdOf("calendar", "TypeError", "Cannot read properties of undefined\n  at x");
  assert.match(a, /^[0-9a-f]{4}$/);
  assert.equal(a, errorIdOf("calendar", "TypeError", "Cannot read properties of undefined\n  at y"), "the first line");
  assert.notEqual(a, errorIdOf("inbox", "TypeError", "Cannot read properties of undefined"));
});

test("a report leaves the browser cut to its limits, its page a route's first part, a workspace only by its shape", () => {
  const caught = { id: "e4c1", name: "TypeError", message: "x".repeat(400) };
  const sent = reportProblemOf("wrong", "  It broke  ", "calendar/2026-10-21?x=1", caught, "rivera-nails");
  assert.equal(sent.kind, "wrong");
  assert.equal(sent.words, "It broke");
  assert.equal(sent.page, "calendar");
  assert.equal(sent.error.message.length, 300);
  assert.equal(sent.workspace, "rivera-nails");
  assert.equal(reportProblemOf("how_to", "x", "Not A Page", null, "../etc").page, null);
  assert.equal(reportProblemOf("how_to", "x", null, null, "../etc").workspace, null);
  assert.equal(
    reportProblemOf("how_to", "How do I connect WhatsApp?", "inbox", caught, null).error,
    null,
    "the last error goes only with something that isn't working: a question is not a bug's",
  );
});

test("a report the sheet named no kind for is judged by its error: one caught is a bug, else a question", () => {
  assert.equal(reportKindOf(undefined, { id: "e4c1" }), "wrong");
  assert.equal(reportKindOf(undefined, null), "how_to");
  assert.equal(reportKindOf("billing", { id: "e4c1" }), "billing", "what they picked wins");
  assert.deepEqual(REPORT_KINDS, ["how_to", "setup", "wrong", "billing"]);
  for (const k of REPORT_KINDS) {
    const w = REPORT_KIND_WORDS[k];
    assert.ok(
      w.pick && w.hint && w.label && w.placeholder,
      `${k} says its choice, its line, its question, its example`,
    );
  }
  assert.equal(ReportProblemInput.safeParse({ words: "x", page: null, error: null, workspace: null }).success, true);
  assert.equal(
    ReportProblemInput.safeParse({ kind: "nonsense", words: "x", page: null, error: null, workspace: null }).success,
    false,
  );
});

test("the second step says the Console's words to its staff and a partner's to a partner", () => {
  assert.equal(SECOND_FACTOR_STAFF_PATH, "/verify?for=console");
  assert.equal(secondFactorAsked("console").enrolBody, SECOND_FACTOR_WORDS.staffEnrolBody);
  assert.equal(secondFactorAsked("partner").enrolBody, SECOND_FACTOR_WORDS.enrolBody);
  assert.equal(secondFactorAsked(null).required, SECOND_FACTOR_WORDS.required);
});

test("a lead's preview (decision 0079) is its own verdict: counted apart, never a customer, grouped as Previews", () => {
  assert.equal(consoleGroupOf("preview"), "previews");
  const rows = platformRows(
    [
      tenant({ tenant_id: "a", slug: "fine", name: "Fine" }),
      tenant({ tenant_id: "p", slug: "fixture-barbers", name: "Fixture Barbers", status: "preview" }),
      tenant({ tenant_id: "q", slug: "fixture-florist", name: "Fixture Florist", status: "preview" }),
    ],
    NOW,
  );
  const preview = rows.find((r) => r.slug === "fixture-barbers");
  assert.equal(preview.verdict, "preview");
  assert.match(preview.sentence, /before they sign up/);
  const summary = platformSummary(rows);
  assert.deepEqual([summary.total, summary.previews], [1, 2], "two previews, one customer");
  assert.match(summary.sentence, /Previews: 2/);
  assert.deepEqual(
    consoleGroups(rows).map((g) => [g.group, g.rows.length]),
    [
      ["live", 1],
      ["previews", 2],
    ],
  );
  const n = consoleNumbersFrom(
    [tenant({ tenant_id: "a" }), tenant({ tenant_id: "p", status: "preview" })],
    null,
    { unit_amount: 9900, currency: "usd", interval: "month" },
    NOW,
  );
  assert.equal(n.paying, 1, "a preview pays nothing and is no customer");
});
