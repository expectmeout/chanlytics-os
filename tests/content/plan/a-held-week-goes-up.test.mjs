/**
 * A week AI may approve (00712; the content loop PRD's 12.4, canvas v18 board B5): when a held week goes (the next 8:00 AM
 * in the business's zone, or now under Sends it), what AI suggests and on what record, the Week's head while it waits,
 * Settings › Content's line, and the job that puts it up at its time (apps/edge/lib/content/week-go.ts over
 * tests/_fake-db.mjs): everything read again first, each slot held to the checks the owner's press holds it to, the
 * week approved by the door under the rung and the making queue started; nothing when the owner stopped it, AI is
 * paused, the rung asks again, or the owner approved it by hand. Then the making job (makeTheWeek): only a week the queue
 * began and the rung approved, not made yet, is asked of the dashboard. The queue itself, at full volume, is
 * held-weeks-are-made-in-turn.db.test.mjs.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  cadenceOf,
  contentLinesOf,
  WEEK_MAKING_LEASE_S,
  WEEKS_MAKING_AT_ONCE,
  dayInZone,
  mondayOf,
  rungSuggestionOf,
  shiftKey,
  weekGoesAtOf,
  weekViewOf,
  WEEK_WORDS,
} from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

for (const k of ["RESEND_API_KEY", "SUPABASE_URL"]) delete process.env[k];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { makeTheWeek, putTheWeekUp } = await import(at("apps/edge/lib/content/week-go.ts"));
after(() => setPg(null));

const ZONE = "America/New_York";
const T = "aaaa1111-7712-4000-8000-000000000101";
const PLAN = "bbbb2222-7712-4000-8000-000000000102";
// Next week, so every slot of it is still to come whatever day the suite runs.
const WEEK = shiftKey(mondayOf(dayInZone(ZONE, Date.now()).key), 7);
const slotAt = (days) => new Date(Date.parse(`${WEEK}T23:00:00Z`) + days * 86_400_000).toISOString();
const local = (iso) =>
  new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit", hour12: true }).format(
    new Date(iso),
  );

/* ------------------------------------------------------------------------------------------------- the rules -- */

test("held, a week goes at the next 8:00 AM in its zone; sent, now; asking, never", () => {
  // 7:30 AM in New York on a winter Monday: today's 8:00 AM is ahead.
  const early = Date.parse("2026-12-07T12:30:00Z");
  assert.equal(weekGoesAtOf("veto", ZONE, early), "2026-12-07T13:00:00.000Z");
  // 9:00 PM on Sunday: tomorrow's.
  const sunday = Date.parse("2026-12-07T02:00:00Z");
  assert.equal(local(weekGoesAtOf("veto", ZONE, sunday)), "8:00 AM");
  assert.equal(weekGoesAtOf("veto", ZONE, sunday), "2026-12-07T13:00:00.000Z");
  // Exactly at 8:00, the next day's: a held week is never put up the moment it is held.
  assert.equal(weekGoesAtOf("veto", ZONE, Date.parse("2026-12-07T13:00:00Z")), "2026-12-08T13:00:00.000Z");
  // The clocks change: 8:00 AM is still 8:00 AM.
  assert.equal(local(weekGoesAtOf("veto", ZONE, Date.parse("2026-11-01T03:00:00Z"))), "8:00 AM");
  assert.equal(weekGoesAtOf("auto", ZONE, early), new Date(early).toISOString());
  assert.equal(weekGoesAtOf("ask", ZONE, early), null);
  assert.equal(weekGoesAtOf(null, ZONE, early), null);
});

test("AI suggests holding the week only while it asks, and only after four weeks the owner approved as planned", () => {
  const clean = { by_owner: true, edited: false };
  assert.equal(rungSuggestionOf("ask", [clean, clean, clean]), null, "three is no record yet");
  const four = rungSuggestionOf("ask", [clean, clean, clean, clean]);
  assert.deepEqual(four, { mode: "veto", count: 4, words: "AI suggests Holds it: 4 weeks approved with no edits" });
  assert.equal(rungSuggestionOf("ask", [clean, clean, clean, clean, clean]).count, 5);
  assert.equal(rungSuggestionOf("veto", [clean, clean, clean, clean]), null, "taken, it goes");
  assert.equal(
    rungSuggestionOf("ask", [{ by_owner: true, edited: true }, clean, clean, clean, clean]),
    null,
    "the newest was edited",
  );
  assert.equal(
    rungSuggestionOf("ask", [clean, clean, { by_owner: false, edited: false }, clean]),
    null,
    "AI's own approval is no record of the owner's",
  );
  assert.equal(
    rungSuggestionOf("ask", [clean, clean, clean, { by_owner: true, edited: null }]),
    null,
    "a week from before it was kept claims nothing",
  );
});

/** The Week's page answer, as its reader gives it, for one ready week of one slot. */
const page = (goesAt) => ({
  week_of: WEEK,
  zone: ZONE,
  week: {
    plan: {
      id: PLAN,
      week_of: WEEK,
      status: "ready",
      fewer: null,
      ready_at: null,
      approved_at: null,
      approved_by: null,
      goes_at: goesAt,
    },
    slots: [
      {
        id: "s1",
        creative: "c1",
        place: "instagram",
        kind: "reel",
        at: slotAt(1),
        state: "proposed",
        title: "The finish",
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
      },
    ],
  },
  files: [],
  made: [],
  pieces: [],
  paused_at: null,
  places: { instagram: true, google: false },
  review_ask: null,
  planned: true,
  claims: [],
  goals: [],
  cadence: cadenceOf(undefined),
  quiet_days: [],
  languages: [],
  lines: {},
  look: { words: "", colours: [] },
});

test("the Week's head, held: when it goes, and Stop it in place of Approve the week", () => {
  const held = weekViewOf(page("2026-12-07T13:00:00.000Z"), Date.now());
  assert.equal(held.state, "ready");
  assert.equal(held.line, WEEK_WORDS.held("8:00 AM"));
  assert.equal(held.line, "Goes up at 8:00 AM unless you stop it");
  assert.equal(held.act, "stop");
  const asking = weekViewOf(page(null), Date.now());
  assert.equal(asking.act, "approve");
  assert.notEqual(asking.line, held.line);
  assert.equal(WEEK_WORDS.todayHeld("8:00 AM"), "Your week goes up at 8:00 AM unless you stop it");
});

test("Settings › Content says the rung as it is set", () => {
  const said = (rung) => contentLinesOf({ ...page(null), rung }, WEEK).find((l) => l.key === "rung").words;
  assert.equal(said("ask"), "AI asks you first.");
  assert.equal(said(null), "AI asks you first.");
  assert.equal(said("veto"), "AI holds the week and puts it up at 8:00 AM unless you stop it.");
  assert.equal(said("auto"), "AI approves the week as soon as it is ready.");
});

/* ----------------------------------------------------------------------------------------------------- the job -- */

const SLOT = "cccc3333-7712-4000-8000-000000000103";
const PASSED = "cccc3333-7712-4000-8000-000000000104";

function world({
  status = "ready",
  goesAt = new Date(Date.now() - 60_000).toISOString(),
  stoppedAt = null,
  approvedBy = null,
  rung = "veto",
  paused = null,
  approveFate = null,
  slots = null,
  makingSince = null,
  madeAt = null,
} = {}) {
  const approvals = [];
  const holds = [];
  const starts = [];
  const tables = {
    tenants: [{ id: T, timezone: ZONE, slug: "studio", name: "Studio", sending_stopped_at: paused }],
    content_plans: [
      {
        id: PLAN,
        tenant_id: T,
        week_of: WEEK,
        status,
        asked_by: "clock",
        fewer: null,
        ready_at: new Date().toISOString(),
        approved_at: approvedBy || status === "approved" ? new Date().toISOString() : null,
        approved_by: approvedBy,
        approval_id: null,
        goes_at: goesAt,
        stopped_at: stoppedAt,
        stopped_by: null,
        edited: false,
        making_since: makingSince,
        made_at: madeAt,
      },
    ],
    plan_slots: slots ?? [
      {
        id: SLOT,
        tenant_id: T,
        plan_id: PLAN,
        creative: "dddd4444-7712-4000-8000-000000000105",
        place: "instagram",
        kind: "picture",
        at: slotAt(1),
        state: "proposed",
        title: "The finish",
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
      },
    ],
    policies: [
      {
        id: "eeee5555-7712-4000-8000-000000000106",
        tenant_id: T,
        class: "plan_approve",
        mode: rung,
        subject_type: null,
        subject_id: null,
        limits: {},
      },
    ],
  };
  const db = fakeDb(
    tables,
    {},
    {
      content_week_approve: (args) => {
        approvals.push(args);
        if (approveFate) return { fate: approveFate };
        const plan = tables.content_plans[0];
        plan.status = "approved";
        return {
          fate: "approved",
          approval_id: "ffff6666-7712-4000-8000-000000000107",
          slots: args.p_snapshot.slots.length,
        };
      },
      content_weeks_start: (args) => {
        starts.push(args);
        return 1;
      },
      content_week_hold: (args) => {
        holds.push(args);
        if (!args.p_goes_at) tables.content_plans[0].goes_at = null;
        return { fate: args.p_goes_at ? "held" : "let_go" };
      },
    },
  );
  setPg(db);
  const made = [];
  const make = async (body) => {
    made.push(body);
  };
  return { db, tables, approvals, holds, starts, made, make };
}

const job = { id: "job-1", tenant_id: T, kind: "content_week_go", payload: { plan_id: PLAN }, attempts: 1 };

const QUEUE = { p_cap: WEEKS_MAKING_AT_ONCE, p_lease_seconds: WEEK_MAKING_LEASE_S };

test("at its time, a held week is approved by the door under the rung, as the owner's press would, and only queued", async () => {
  const w = world();
  assert.equal(await putTheWeekUp(w.db, job), undefined);
  assert.equal(w.approvals.length, 1);
  const [slot] = w.approvals[0].p_snapshot.slots;
  assert.deepEqual(Object.keys(slot).sort(), ["at", "file_id", "id", "intent", "kind", "place", "title"]);
  assert.equal(slot.id, SLOT);
  assert.deepEqual(w.starts, [QUEUE], "the making queue started, with the cap and lease contracts says");
  assert.equal(
    WEEKS_MAKING_AT_ONCE,
    6,
    "the cap from the database budget: 20 calls a second, 90 a week, 30 seconds a week",
  );
});

test("asked again after the rung approved it, the queue is started again; approved by the owner's hand, nothing", async () => {
  const again = world({ status: "approved" });
  assert.equal(await putTheWeekUp(again.db, job), undefined);
  assert.equal(again.approvals.length, 0);
  assert.deepEqual(again.starts, [QUEUE]);
  const theirs = world({ status: "approved", approvedBy: "abab7777-7712-4000-8000-000000000108" });
  assert.deepEqual(await putTheWeekUp(theirs.db, job), { skipped: "approved" });
  assert.equal(theirs.starts.length, 0);
});

test("stopped, or no longer held, nothing is approved or queued", async () => {
  for (const w of [world({ stoppedAt: new Date().toISOString() }), world({ goesAt: null })]) {
    assert.deepEqual(await putTheWeekUp(w.db, job), { skipped: "stopped" });
    assert.equal(w.approvals.length + w.starts.length, 0);
  }
  const drafting = world({ status: "drafting" });
  assert.deepEqual(await putTheWeekUp(drafting.db, job), { skipped: "drafting" });
});

test("AI paused at its time: the hold is let go, so nothing says it goes up, and the week waits for the owner", async () => {
  const w = world({ paused: new Date().toISOString() });
  assert.deepEqual(await putTheWeekUp(w.db, job), { skipped: "paused" });
  assert.equal(w.holds.length, 1);
  assert.equal(w.holds[0].p_goes_at, undefined, "let go");
  assert.equal(w.tables.content_plans[0].goes_at, null);
  assert.equal(w.approvals.length + w.starts.length, 0);
});

test("a slot whose time has passed is left out; with nothing left, the hold is let go", async () => {
  const passed = {
    id: PASSED,
    tenant_id: T,
    plan_id: PLAN,
    creative: "dddd4444-7712-4000-8000-000000000109",
    place: "instagram",
    kind: "picture",
    at: new Date(Date.now() - 3_600_000).toISOString(),
    state: "proposed",
    title: "Gone by",
    reason: null,
    file_id: null,
    piece_id: null,
    post_id: null,
    intent: { day: dayInZone(ZONE, Date.now() - 86_400_000).key, offer: null, service: null },
    words: null,
    blocked_why: null,
    blocked_reason: null,
    ask: null,
    score: null,
    approval_id: null,
  };
  const w = world({ slots: [passed] });
  assert.deepEqual(await putTheWeekUp(w.db, job), { skipped: "nothing" });
  assert.equal(w.approvals.length, 0);
  assert.equal(w.holds[0].p_goes_at, undefined);
});

test("the door's own reading wins: a rung that asks again, a week stopped meanwhile, nothing queued", async () => {
  for (const fate of ["asks", "stopped", "held", "changed"]) {
    const w = world({ approveFate: fate });
    assert.deepEqual(await putTheWeekUp(w.db, job), { skipped: fate });
    assert.equal(w.starts.length, 0, fate);
  }
});

/* --------------------------------------------------------------------------------------------- the making job -- */

const making = { id: "job-2", tenant_id: T, kind: "content_week_make", payload: { plan_id: PLAN }, attempts: 1 };
const begun = { status: "approved", makingSince: new Date().toISOString() };

test("a week the queue began and the rung approved is asked of the dashboard, once", async () => {
  const w = world(begun);
  assert.equal(await makeTheWeek(w.db, making, w.make), undefined);
  assert.deepEqual(w.made, [{ tenant_id: T, plan_id: PLAN }]);
});

test("a held week the queue began overnight is asked of the dashboard too, to be prepared; a stopped one is not", async () => {
  const held = world({ makingSince: new Date().toISOString() });
  assert.equal(await makeTheWeek(held.db, making, held.make), undefined);
  assert.deepEqual(held.made, [{ tenant_id: T, plan_id: PLAN }]);
  const stopped = world({ makingSince: new Date().toISOString(), stoppedAt: new Date().toISOString() });
  assert.deepEqual(await makeTheWeek(stopped.db, making, stopped.make), { skipped: "not_the_rung_s" });
  assert.equal(stopped.made.length, 0);
});

test("made already, not begun yet, or the owner's own approval: the dashboard is not asked", async () => {
  const made = world({ ...begun, madeAt: new Date().toISOString() });
  assert.deepEqual(await makeTheWeek(made.db, making, made.make), { skipped: "made" });
  const waiting = world({ status: "approved" });
  assert.deepEqual(await makeTheWeek(waiting.db, making, waiting.make), { skipped: "waiting" });
  const theirs = world({ ...begun, approvedBy: "abab7777-7712-4000-8000-000000000108" });
  assert.deepEqual(await makeTheWeek(theirs.db, making, theirs.make), { skipped: "not_the_rung_s" });
  assert.equal(made.made.length + waiting.made.length + theirs.made.length, 0);
});

test("a making the dashboard did not take throws, so the ledger asks again while the week holds its place", async () => {
  const w = world(begun);
  const refused = async () => {
    throw new Error("the dashboard did not take the week (503)");
  };
  await assert.rejects(makeTheWeek(w.db, making, refused), /did not take/);
});
