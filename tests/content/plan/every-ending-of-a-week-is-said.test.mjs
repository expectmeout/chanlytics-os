/**
 * A week once it is ready, however its approval ends (the Week review of 25 Nov 2026: C1, C2, C6 and the start of C7).
 *
 * One rule for a post whose time has passed, the same for the owner's press and for AI: no approval puts it up. The rule
 * itself (core weekApprovalOf), the owner's press over a week planned on Sunday and approved on Wednesday (the dashboard's
 * approveWeekFor over tests/_fake-db.mjs), and what its rows then say. Then every way AI's approval at a held week's time
 * can end (the edge's putTheWeekUp): approved, AI paused, the setting asks again, nothing left to approve, stopped by the
 * owner, changed on every try. For each: what the job answers, the one notice on the bell, and what the Week's head and
 * Today's point say of the week as it then stands.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  WEEK_MADE_AHEAD_MS,
  WEEK_WORDS,
  cadenceOf,
  clockTime,
  newReceptionistDefaults,
  slotTimePassed,
  slotWhenSaid,
  weekEndingOf,
  weekEndingSaid,
  weekViewOf,
} from "@chanlytics/contracts";
import { NO_BUSINESS, weekApprovalOf, weekBusinessOf, weekLeansOnBusiness } from "@chanlytics/core";
import { MAX_ATTEMPTS } from "@chanlytics/jobs";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
for (const k of ["RESEND_API_KEY", "SUPABASE_URL", "DIAG_KEY", "VERCEL_ENV"]) delete process.env[k];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { putTheWeekUp } = await import(at("apps/edge/lib/content/week-go.ts"));
const { approveWeekFor } = await import(at("apps/dashboard/src/server/content/plan.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
after(() => {
  setPg(null);
  setServiceClient(null);
});

const ZONE = "America/New_York";
const T = "aaaa1111-7725-4000-8000-000000000301";
const PLAN = "bbbb2222-7725-4000-8000-000000000302";
const OWNER = "cccc3333-7725-4000-8000-000000000303";
const APPROVAL = "dddd4444-7725-4000-8000-000000000304";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.now();
const WEEK = "2026-11-23";
const TIME_PASSED = "Its time passed. Pick another time.";

let seq = 0;
/** One slot of the week, a creative of its own unless one is named. */
function slot(title, inMs, more = {}) {
  seq += 1;
  const n = String(seq).padStart(3, "0");
  return {
    id: `eeee5555-7725-4000-8000-000000000${n}`,
    tenant_id: T,
    plan_id: PLAN,
    creative: `ffff6666-7725-4000-8000-000000000${n}`,
    place: "instagram",
    kind: "picture",
    at: new Date(NOW + inMs).toISOString(),
    state: "proposed",
    title,
    reason: null,
    file_id: null,
    piece_id: null,
    post_id: null,
    intent: null,
    words: null,
    blocked_why: null,
    blocked_reason: null,
    ask: null,
    score: null,
    approval_id: null,
    prepared: null,
    ...more,
  };
}

const intent = (more) => ({
  goal: "bookings",
  opportunity_id: null,
  call_to_action: "message",
  day: null,
  offer: null,
  service: null,
  ...more,
});

/** A slot as a page and the rule read it: the row without what only storage keeps. */
const dtoOf = ({ tenant_id: _t, plan_id: _p, approval_id: _a, prepared: _r, ...row }) => ({
  ...row,
  prepared_file_id: null,
});

/** A workspace's settings as stored, with the services the business offers. */
const configWith = (services) => ({
  brain: { ...newReceptionistDefaults("Harbor Studio"), business_name: "Harbor Studio", profile: { services } },
});

/* -------------------------------------------------------------------------------------------- the one rule -- */

test("a slot's time has passed once it is nearer than the margin AI's making keeps: one rule, by the clock alone", () => {
  assert.equal(WEEK_MADE_AHEAD_MS, 5 * 60_000);
  assert.equal(slotTimePassed(new Date(NOW - DAY).toISOString(), NOW), true, "yesterday");
  assert.equal(slotTimePassed(new Date(NOW + 4 * 60_000).toISOString(), NOW), true, "too near to make and place");
  assert.equal(slotTimePassed(new Date(NOW + 6 * 60_000).toISOString(), NOW), false);
});

test("an approval leaves out every slot whose time has passed, dated or not, and says so in the owner's words", () => {
  const monday = slot("Monday's", -2 * DAY);
  const near = slot("In three minutes", 3 * 60_000);
  const thursday = slot("Thursday's", DAY);
  const { going, leftOut, snapshot } = weekApprovalOf(
    [monday, near, thursday].map(dtoOf),
    { zone: ZONE, nowMs: NOW },
    NO_BUSINESS,
  );
  assert.deepEqual(
    going.map((s) => s.title),
    ["Thursday's"],
  );
  assert.deepEqual(leftOut, [
    { id: monday.id, why: TIME_PASSED, held: null },
    { id: near.id, why: TIME_PASSED, held: null },
  ]);
  assert.deepEqual(
    snapshot.slots.map((s) => s.id),
    [thursday.id],
    "the door is handed only what goes",
  );
  assert.equal(WEEK_WORDS.timePassed, TIME_PASSED);
});

test("a slot planned for a service or an offer goes while the business says it, and is held with why once it does not", () => {
  const colour = slot("Colour", DAY, { intent: intent({ service: "Balayage" }) });
  const offer = slot("First colour", DAY, {
    intent: intent({ offer: { says: "20% off a first colour", until: null } }),
  });
  const gone = slot("Perms", DAY, { intent: intent({ service: "Perms" }) });
  const slots = [colour, offer, gone].map(dtoOf);
  assert.equal(weekLeansOnBusiness(slots), true);
  assert.equal(
    weekLeansOnBusiness([dtoOf(slot("Plain", DAY))]),
    false,
    "nothing is read for a week that leans on none",
  );
  const claims = [
    {
      id: "c1",
      kind: "offer",
      text: "20% off a first colour",
      source: "settings",
      valid_until: null,
      withdrawn_at: null,
      created_at: new Date(NOW).toISOString(),
    },
  ];
  const business = weekBusinessOf(configWith([{ name: "Balayage", price_note: "from $120" }]), claims, {
    zone: ZONE,
    nowMs: NOW,
  });
  assert.deepEqual(business.services, ["Balayage"]);
  const { going, leftOut } = weekApprovalOf(slots, { zone: ZONE, nowMs: NOW }, business);
  assert.deepEqual(
    going.map((s) => s.title),
    ["Colour", "First colour"],
    "what the business offers is not left out of its own week",
  );
  assert.equal(leftOut.length, 1);
  assert.equal(leftOut[0].id, gone.id);
  assert.equal(leftOut[0].held, "reason_passed");
  assert.match(leftOut[0].why, /Perms.*isn't one of your services/);
});

/* ------------------------------------------------------------------------------------------ what a screen says -- */

/** The Week's page answer for these rows, as its reader gives it. */
function pageOf(plan, rows, { rung = "ask", pausedAt = null } = {}) {
  return {
    week_of: WEEK,
    zone: ZONE,
    week: {
      plan: {
        id: PLAN,
        week_of: WEEK,
        status: plan.status,
        fewer: null,
        ready_at: null,
        approved_at: plan.approved_at ?? null,
        approved_by: plan.approved_by ?? null,
        goes_at: plan.status === "ready" ? (plan.goes_at ?? null) : null,
        stopped_at: plan.status === "ready" ? (plan.stopped_at ?? null) : null,
      },
      slots: rows.map(dtoOf),
    },
    files: [],
    made: [],
    pieces: [],
    paused_at: pausedAt,
    places: { instagram: true, google: false },
    rung,
    review_ask: null,
    planned: true,
    claims: [],
    goals: [],
    cadence: cadenceOf(undefined),
    quiet_days: [],
    languages: [],
    lines: {},
    look: { words: "", colours: [] },
  };
}

const rowOf = (view, title) => view.groups.flatMap((g) => g.rows).find((r) => r.title === title);

/** Today's point for the week as it stands, as its reader composes it (weekEndingOf, then the ending's own words). */
function todayOf(page) {
  const ending = weekEndingOf(page.week, { rung: page.rung, paused: page.paused_at !== null, nowMs: NOW });
  return ending ? weekEndingSaid(ending, "").today : null;
}

/* ---------------------------------------------------------------------------------------- the owner's own press -- */

/** A week planned on Sunday and looked at on Wednesday: Monday's and Tuesday's posts have passed, Thursday's is ahead. */
function pressWorld() {
  const monday = slot("Monday's", -2 * DAY);
  const tuesday = slot("Tuesday's", -DAY);
  const thursday = slot("Thursday's", DAY);
  const approvals = [];
  const tables = {
    tenants: [{ id: T, timezone: ZONE, slug: "studio", name: "Studio", sending_stopped_at: null }],
    content_plans: [
      {
        id: PLAN,
        tenant_id: T,
        week_of: WEEK,
        status: "ready",
        asked_by: "clock",
        fewer: null,
        ready_at: new Date(NOW - 3 * DAY).toISOString(),
        approved_at: null,
        approved_by: null,
        approval_id: null,
        goes_at: null,
        stopped_at: null,
        stopped_by: null,
        edited: false,
      },
    ],
    plan_slots: [monday, tuesday, thursday],
  };
  const db = fakeDb(
    tables,
    {},
    {
      content_week_approve: (args) => {
        approvals.push(args);
        const plan = tables.content_plans[0];
        Object.assign(plan, { status: "approved", approved_at: new Date(NOW).toISOString(), approved_by: OWNER });
        for (const named of args.p_snapshot.slots)
          Object.assign(
            tables.plan_slots.find((s) => s.id === named.id),
            { state: "approved", approval_id: APPROVAL },
          );
        return { fate: "approved", approval_id: APPROVAL, slots: args.p_snapshot.slots.length };
      },
    },
  );
  setServiceClient(db);
  const member = { tenantId: T, role: "owner", facts: { timezone: ZONE } };
  return { db, tables, approvals, member, monday, tuesday, thursday };
}

test("approved on Wednesday, a week planned on Sunday puts up nothing of Monday or Tuesday: the press counts them and each row says why", async () => {
  const w = pressWorld();
  const made = [];
  // The making runs after the answer (next/server's after(), which a test stands in for): kept here, never run.
  const answer = await approveWeekFor({ supabase: w.db }, w.member, { week_of: WEEK, plan_id: PLAN }, (task) =>
    made.push(task),
  );
  assert.equal(w.approvals.length, 1);
  assert.deepEqual(
    w.approvals[0].p_snapshot.slots.map((s) => s.id),
    [w.thursday.id],
    "the door approves only the post still ahead",
  );
  assert.deepEqual(answer, {
    approved: 1,
    left_out: [
      { id: w.monday.id, why: TIME_PASSED },
      { id: w.tuesday.id, why: TIME_PASSED },
    ],
  });
  assert.equal(WEEK_WORDS.leftOut(answer.left_out.length), "2 were left out: each says why.", "the press's answer");
  assert.equal(made.length, 1, "what was approved is made, after the answer");
  // The week as its page then reads it: the two that passed are not approved, and say so with their one fix.
  assert.deepEqual(
    w.tables.plan_slots.map((s) => s.state),
    ["proposed", "proposed", "approved"],
  );
  const page = pageOf(w.tables.content_plans[0], w.tables.plan_slots);
  const view = weekViewOf(page, NOW);
  for (const title of ["Monday's", "Tuesday's"]) {
    const row = rowOf(view, title);
    assert.equal(row.line, TIME_PASSED, title);
    assert.equal(row.tone, "you");
    assert.deepEqual(row.fix, { act: "time", label: "Pick another time" });
  }
  assert.equal(rowOf(view, "Thursday's").fix, null);
  const approvedAt = slotWhenSaid(w.tables.content_plans[0].approved_at, ZONE);
  assert.equal(view.line, `Approved ${approvedAt}. 2 were left out: each says why.`);
});

test("before the press too, a ready week's row whose time passed says so: nothing waits to be found out by approving", () => {
  const w = pressWorld();
  const view = weekViewOf(pageOf(w.tables.content_plans[0], w.tables.plan_slots), NOW);
  assert.equal(view.act, "approve");
  assert.equal(rowOf(view, "Monday's").line, TIME_PASSED);
  assert.equal(rowOf(view, "Thursday's").line, slotWhenSaid(w.thursday.at, ZONE));
});

test("a press with nothing left to approve is refused in the row's own words, and a slot whose reason passed is held with why", async () => {
  const w = pressWorld();
  w.tables.plan_slots.splice(
    0,
    3,
    slot("Monday's", -2 * DAY),
    slot("Perms", DAY, { intent: intent({ service: "Perms" }) }),
  );
  w.tables.tenant_config = [{ tenant_id: T, config: configWith([]), version: 1 }];
  w.tables.owner_claims = [];
  await assert.rejects(
    approveWeekFor({ supabase: w.db }, w.member, { week_of: WEEK, plan_id: PLAN }, () => undefined),
    (e) => e.message === TIME_PASSED,
  );
  assert.equal(w.approvals.length, 0);
  const perms = w.tables.plan_slots.find((s) => s.title === "Perms");
  assert.equal(perms.state, "blocked");
  assert.equal(perms.blocked_why, "reason_passed");
  assert.match(perms.blocked_reason, /isn't one of your services/);
});

/* ------------------------------------------------------------------------------- AI's approval at its time -- */

const GOES_AT = new Date(NOW - 60_000).toISOString();
const WHEN = clockTime(Date.parse(GOES_AT), ZONE);

function jobWorld({ slots, rung = "veto", paused = null, stoppedAt = null, approveFate = null } = {}) {
  const approvals = [];
  const holds = [];
  const starts = [];
  const tables = {
    tenants: [{ id: T, timezone: ZONE, slug: "studio", name: "Studio", sending_stopped_at: paused }],
    tenant_config: [{ tenant_id: T, config: configWith([]), version: 1 }],
    owner_claims: [],
    notifications: [],
    content_plans: [
      {
        id: PLAN,
        tenant_id: T,
        week_of: WEEK,
        status: "ready",
        asked_by: "clock",
        fewer: null,
        ready_at: new Date(NOW - 12 * HOUR).toISOString(),
        approved_at: null,
        approved_by: null,
        approval_id: null,
        goes_at: GOES_AT,
        stopped_at: stoppedAt,
        stopped_by: stoppedAt ? OWNER : null,
        edited: false,
        making_since: null,
        made_at: null,
      },
    ],
    plan_slots: slots ?? [slot("Thursday's", DAY)],
    policies: [
      {
        id: "abab7777-7725-4000-8000-000000000305",
        tenant_id: T,
        class: "plan_approve",
        mode: rung,
        subject_type: null,
        subject_id: null,
        limits: {},
      },
    ],
  };
  const plan = tables.content_plans[0];
  const db = fakeDb(
    tables,
    {},
    {
      content_week_approve: (args) => {
        approvals.push(args);
        if (approveFate === "asks") plan.goes_at = null;
        if (approveFate) return { fate: approveFate };
        Object.assign(plan, { status: "approved", approved_at: new Date(NOW).toISOString(), approval_id: APPROVAL });
        for (const named of args.p_snapshot.slots)
          Object.assign(
            tables.plan_slots.find((s) => s.id === named.id),
            { state: "approved", approval_id: APPROVAL },
          );
        return { fate: "approved", approval_id: APPROVAL, slots: args.p_snapshot.slots.length };
      },
      content_weeks_start: (args) => {
        starts.push(args);
        return 1;
      },
      content_week_hold: (args) => {
        holds.push(args);
        if (!args.p_goes_at) plan.goes_at = null;
        return { fate: args.p_goes_at ? "held" : "let_go" };
      },
    },
  );
  setPg(db);
  const bell = () => tables.notifications.map((n) => ({ kind: n.kind, subject: n.title, body: n.body }));
  const page = () => pageOf(plan, tables.plan_slots, { rung, pausedAt: paused });
  return { db, tables, plan, approvals, holds, starts, bell, page };
}

const job = (attempts = 1) => ({
  id: "job-week-go",
  tenant_id: T,
  kind: "content_week_go",
  payload: { plan_id: PLAN },
  attempts,
});

const WAITING = "This week's posts are waiting for you";
const NOT_APPROVED = "AI didn't approve this week's posts";
const UNTIL = "Nothing goes up until you approve it.";

test("approved: one notice counts what goes up and what was left out, the head says AI approved it, the late row says why", async () => {
  const w = jobWorld({
    slots: [
      slot("Monday's", -2 * HOUR),
      slot("Thursday's", DAY),
      slot("Friday's", 2 * DAY),
      slot("The finish", 3 * DAY, { kind: "reel" }),
    ],
  });
  assert.equal(await putTheWeekUp(w.db, job()), undefined);
  assert.deepEqual(
    w.approvals[0].p_snapshot.slots.map((s) => s.title),
    ["Thursday's", "Friday's", "The finish"],
    "AI's approval puts up nothing whose time passed, as the owner's press does not",
  );
  assert.equal(w.starts.length, 1, "what it approved is queued to be made");
  assert.deepEqual(w.bell(), [
    {
      kind: "plan_ready",
      subject: "AI approved this week's posts",
      body: "2 go up, each at its time, and a reel is being made and waits for your approval, as you set it. 1 was left out: it says why.",
    },
  ]);
  const view = weekViewOf(w.page(), NOW);
  const approvedAt = slotWhenSaid(w.plan.approved_at, ZONE);
  assert.equal(view.state, "approved");
  assert.equal(view.line, `AI approved it ${approvedAt}, as you set it. 1 was left out: it says why.`);
  assert.equal(rowOf(view, "Monday's").line, TIME_PASSED, "left out, it does not sit ready with no word");
  assert.deepEqual(rowOf(view, "Monday's").fix, { act: "time", label: "Pick another time" });
  assert.deepEqual(todayOf(w.page()), { name: "AI approved this week's posts", said: "1 was left out: it says why." });
  // Asked again (the ledger's try after the approval): the queue starts again, and the bell does not ring twice.
  assert.equal(await putTheWeekUp(w.db, job(2)), undefined);
  assert.equal(w.bell().length, 1, "one ring");
  assert.equal(w.starts.length, 2);
});

test("approved with nothing left out: each goes up at its time, said by who approved it", async () => {
  const w = jobWorld();
  await putTheWeekUp(w.db, job());
  assert.deepEqual(w.bell(), [
    { kind: "plan_ready", subject: "AI approved this week's posts", body: "1 goes up at its time, as you set it." },
  ]);
  const view = weekViewOf(w.page(), NOW);
  assert.equal(
    view.line,
    `AI approved it ${slotWhenSaid(w.plan.approved_at, ZONE)}, as you set it. Each goes up at its time.`,
  );
  // The owner's own approval keeps its words: nobody else is named for their press.
  const theirs = weekViewOf(pageOf({ ...w.plan, approved_by: OWNER }, w.tables.plan_slots), NOW);
  assert.equal(theirs.line, `Approved ${slotWhenSaid(w.plan.approved_at, ZONE)}. Each goes up at its time.`);
});

test("approved, a slot whose reason no longer stands is held on its row with why, never left ready with no word", async () => {
  const w = jobWorld({
    slots: [slot("Thursday's", DAY), slot("Perms", 2 * DAY, { intent: intent({ service: "Perms" }) })],
  });
  await putTheWeekUp(w.db, job());
  const perms = w.tables.plan_slots.find((s) => s.title === "Perms");
  assert.equal(perms.state, "blocked");
  assert.equal(perms.blocked_why, "reason_passed");
  const view = weekViewOf(w.page(), NOW);
  assert.match(rowOf(view, "Perms").line, /isn't one of your services/);
  assert.equal(rowOf(view, "Perms").tone, "you");
  assert.match(w.bell()[0].body, /1 was left out: it says why\.$/);
});

test("not approved, AI paused: let go, one notice says why, the Week says AI is paused and Today that the week waits", async () => {
  const w = jobWorld({ paused: new Date(NOW - HOUR).toISOString() });
  assert.deepEqual(await putTheWeekUp(w.db, job()), { skipped: "paused" });
  assert.equal(w.approvals.length + w.starts.length, 0);
  assert.equal(w.plan.goes_at, null, "nothing says it goes up");
  assert.deepEqual(w.bell(), [
    {
      kind: "plan_ready",
      subject: NOT_APPROVED,
      body: `AI is paused, so nothing went up at ${WHEN}. Nothing goes up until you approve them.`,
    },
  ]);
  const view = weekViewOf(w.page(), NOW);
  assert.equal(view.state, "paused");
  assert.equal(view.title, "AI is paused. Nothing will post.");
  assert.equal(view.act, "resume");
  assert.deepEqual(todayOf(w.page()), { name: WAITING, said: "AI is paused, so nothing goes up." });
  await putTheWeekUp(w.db, job(2));
  assert.equal(w.bell().length, 1, "one ring, whatever the tries");
});

test("not approved, the setting asks again: one notice says the week waits, and the Week offers Approve the week", async () => {
  const w = jobWorld({ approveFate: "asks", rung: "ask" });
  assert.deepEqual(await putTheWeekUp(w.db, job()), { skipped: "asks" });
  assert.equal(w.starts.length, 0);
  assert.deepEqual(w.bell(), [
    {
      kind: "plan_ready",
      subject: WAITING,
      body: `You set AI to ask you first, so nothing went up at ${WHEN}. Nothing goes up until you approve them.`,
    },
  ]);
  const view = weekViewOf(w.page(), NOW);
  assert.equal(view.act, "approve");
  assert.equal(view.line, "Going up once on Instagram");
  assert.equal(todayOf(w.page()), null, "Today's own point says the week is ready");
});

test("not approved, nothing left to approve: let go, one notice, and the head says each row says why", async () => {
  const w = jobWorld({ slots: [slot("Monday's", -2 * HOUR), slot("Tuesday's", -HOUR)] });
  assert.deepEqual(await putTheWeekUp(w.db, job()), { skipped: "nothing" });
  assert.equal(w.approvals.length, 0);
  assert.equal(w.plan.goes_at, null);
  assert.deepEqual(w.bell(), [
    {
      kind: "plan_ready",
      subject: NOT_APPROVED,
      body: `No post was ready to go up at ${WHEN}. Each says why on the Week.`,
    },
  ]);
  const view = weekViewOf(w.page(), NOW);
  assert.equal(view.line, "No post is ready to go up. Each says why.");
  assert.equal(view.act, null, "no press that could only be refused");
  assert.equal(rowOf(view, "Monday's").line, TIME_PASSED);
  assert.deepEqual(todayOf(w.page()), { name: WAITING, said: "No post is ready to go up. Each says why." });
});

test("stopped by the owner: nothing is approved and nobody is rung, and the head says who stopped it", async () => {
  const w = jobWorld({ stoppedAt: new Date(NOW - HOUR).toISOString() });
  w.plan.goes_at = null;
  assert.deepEqual(await putTheWeekUp(w.db, job()), { skipped: "stopped" });
  assert.equal(w.approvals.length, 0);
  assert.deepEqual(w.bell(), [], "they pressed it themselves");
  const view = weekViewOf(w.page(), NOW);
  assert.equal(view.line, `You stopped it. ${UNTIL}`);
  assert.equal(view.act, "approve");
  // Stopped as the door reads it, in the instant of the approval: the same, with no notice.
  const meanwhile = jobWorld({ approveFate: "stopped" });
  assert.deepEqual(await putTheWeekUp(meanwhile.db, job()), { skipped: "stopped" });
  assert.deepEqual(meanwhile.bell(), []);
});

test("changed as it was approved: tried again in silence, and said once only if its last try ends the same way", async () => {
  const w = jobWorld({ approveFate: "changed" });
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
    await assert.rejects(putTheWeekUp(w.db, job(attempt)), /changed as it was approved/);
    assert.deepEqual(w.bell(), [], `try ${attempt} says nothing`);
    assert.ok(w.plan.goes_at, "still held: the next try reads it as it now stands");
  }
  assert.deepEqual(await putTheWeekUp(w.db, job(MAX_ATTEMPTS)), { skipped: "changed" });
  assert.equal(w.plan.goes_at, null, "never left saying it goes up");
  assert.deepEqual(w.bell(), [
    {
      kind: "plan_ready",
      subject: NOT_APPROVED,
      body: `The week changed while AI was approving it at ${WHEN}, so nothing went up. Look at it, then approve the week.`,
    },
  ]);
  const view = weekViewOf(w.page(), NOW);
  assert.equal(view.line, `AI didn't approve it. ${UNTIL}`);
  assert.equal(view.act, "approve");
  assert.deepEqual(todayOf(w.page()), { name: WAITING, said: "AI didn't approve them." });
  // A try that goes through after one that did not is an approval like any other: one notice, of the approval.
  const mended = jobWorld({ approveFate: "changed" });
  await assert.rejects(putTheWeekUp(mended.db, job(1)));
  const later = jobWorld();
  await putTheWeekUp(later.db, job(2));
  assert.equal(later.bell()[0].subject, "AI approved this week's posts");
});

test("a week still held to its time says when it goes and nothing of an ending; one that asks says nothing either", () => {
  const w = jobWorld();
  assert.equal(weekEndingOf(w.page().week, { rung: "veto", paused: false, nowMs: NOW }), null);
  assert.equal(weekViewOf(w.page(), NOW).line, `Goes up at ${WHEN} unless you stop it`);
  const asking = pageOf({ ...w.plan, goes_at: null }, w.tables.plan_slots, { rung: "ask" });
  assert.equal(weekEndingOf(asking.week, { rung: "ask", paused: true, nowMs: NOW }), null);
});
