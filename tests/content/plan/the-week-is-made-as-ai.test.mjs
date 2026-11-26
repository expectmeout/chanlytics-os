/**
 * The dashboard's door for a week a rung let AI approve (00714; apps/dashboard/src/server/content/week-made.ts over
 * tests/_fake-db.mjs): opened only by a token the edge signs for that door, that workspace and that exact body; it makes
 * only a week approved under the rung (never one the owner approved by hand, never one not approved), answers at once
 * and makes after, as AI, with the code the owner's press runs. Made, the week leaves the making queue and the next
 * begins (content_week_made); a slot whose time came before its turn is held with why, never posted late.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels/tokens";
import { WEEK_MADE_DOOR, WEEKS_MAKING_AT_ONCE, WEEK_MAKING_LEASE_S } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-the-week";
for (const k of ["DIAG_KEY", "VERCEL_ENV"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { takeWeekMade } = await import(at("apps/dashboard/src/server/content/week-made.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
after(() => setServiceClient(null));

const T = "aaaa1111-7712-4000-8000-000000000201";
const OTHER = "aaaa1111-7712-4000-8000-000000000209";
const PLAN = "bbbb2222-7712-4000-8000-000000000202";
const APPROVAL = "cccc3333-7712-4000-8000-000000000203";
const OWNER = "dddd4444-7712-4000-8000-000000000204";
const WEEK = "2026-12-07";

function world({
  approvedBy = null,
  status = "approved",
  rung = { class: "plan_approve", mode: "veto" },
  slots = [],
  policies = false,
  stopped = false,
} = {}) {
  const said = { made: [], slots: [] };
  const tables = {
    tenants: [{ id: T, timezone: "America/New_York", slug: "studio", name: "Studio" }],
    content_plans: [
      {
        id: PLAN,
        tenant_id: T,
        week_of: WEEK,
        status,
        asked_by: "clock",
        fewer: null,
        ready_at: null,
        approved_at: status === "approved" ? "2026-12-07T13:00:00Z" : null,
        approved_by: approvedBy,
        approval_id: status === "approved" ? APPROVAL : null,
        goes_at: "2026-12-07T13:00:00Z",
        stopped_at: stopped ? "2026-12-07T12:00:00Z" : null,
        stopped_by: null,
        edited: false,
      },
    ],
    approvals: [
      {
        id: APPROVAL,
        tenant_id: T,
        subject_type: "plan",
        subject_id: PLAN,
        snapshot: { slots: [], ...(rung ? { rung } : {}) },
        snapshot_hash: "h",
        approved_by: approvedBy,
        voided_at: null,
      },
    ],
    // By default every slot of the week is made already: the making finds nothing left to make.
    plan_slots: slots,
    // Approve the week's rung, held (for a week still ready).
    policies: policies
      ? [
          {
            id: "cdcd8888-7712-4000-8000-000000000230",
            tenant_id: T,
            class: "plan_approve",
            mode: "veto",
            subject_type: null,
            subject_id: null,
            limits: {},
          },
        ]
      : [],
  };
  setServiceClient(
    fakeDb(
      tables,
      {},
      {
        content_week_made: (args) => {
          said.made.push(args);
          return { fate: "made", started: 1 };
        },
        plan_slot_made: (args) => {
          said.slots.push(args);
          return { fate: "made", slot_id: args.p_slot_id };
        },
      },
    ),
  );
  return said;
}

/** A call as the edge makes it: signed for the door, the workspace and these bytes. */
function call(
  body,
  {
    path: aud = WEEK_MADE_DOOR.path,
    workspace = body.tenant_id,
    sent = JSON.stringify(body),
    secret = process.env.EDGE_CALL_SECRET,
  } = {},
) {
  const token = signEdgeToken(secret, aud, { workspace, body: JSON.stringify(body) });
  return new Request(`https://app.example.com${WEEK_MADE_DOOR.path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-edge-token": token },
    body: sent,
  });
}

/** What the door hands to run after its answer. */
function laterKept() {
  const tasks = [];
  const later = (task) => tasks.push(task);
  later.tasks = tasks;
  return later;
}

const BODY = { tenant_id: T, plan_id: PLAN };

test("a week the rung approved: answered at once, made after, as AI, then out of the queue and the next begun", async () => {
  const said = world();
  const later = laterKept();
  assert.deepEqual(await takeWeekMade(call(BODY), later), { status: 202, said: "making" });
  assert.equal(later.tasks.length, 1, "the making runs after the answer");
  assert.equal(said.made.length, 0, "not made before it is");
  await later.tasks[0]();
  assert.deepEqual(said.made, [
    {
      p_tenant_id: T,
      p_plan_id: PLAN,
      p_pass: "make",
      p_cap: WEEKS_MAKING_AT_ONCE,
      p_lease_seconds: WEEK_MAKING_LEASE_S,
    },
  ]);
});

test("a slot whose time came before the week's turn is held with why, never posted late", async () => {
  const soon = new Date(Date.now() + 60_000).toISOString();
  const said = world({
    slots: [
      {
        id: "eeee5555-7712-4000-8000-000000000210",
        tenant_id: T,
        plan_id: PLAN,
        creative: "ffff6666-7712-4000-8000-000000000211",
        place: "instagram",
        kind: "picture",
        at: soon,
        state: "approved",
        title: "The finish",
        reason: null,
        file_id: "abab7777-7712-4000-8000-000000000212",
        piece_id: null,
        post_id: null,
        intent: null,
        words: { line: "Warm", over: null, under: null, caption: "Warm colour.", language: "en" },
        blocked_why: null,
        blocked_reason: null,
        ask: null,
        score: null,
        approval_id: APPROVAL,
      },
    ],
  });
  const later = laterKept();
  assert.equal((await takeWeekMade(call(BODY), later)).status, 202);
  await later.tasks[0]();
  assert.equal(said.slots.length, 1, "nothing drawn, nothing placed");
  assert.equal(said.slots[0].p_made.held.why, "late");
  assert.match(said.slots[0].p_made.held.reason, /time came before it could be made/);
  assert.equal(said.made.length, 1, "the week still leaves the queue");
});

test("unsigned, signed for another door, another secret, or other bytes than were signed: refused, nothing made", async () => {
  world();
  const later = laterKept();
  const bare = new Request(`https://app.example.com${WEEK_MADE_DOOR.path}`, {
    method: "POST",
    body: JSON.stringify(BODY),
  });
  for (const request of [
    bare,
    call(BODY, { path: "/api/admin/lines" }),
    call(BODY, { secret: "not-the-secret" }),
    call(BODY, { sent: JSON.stringify({ ...BODY, plan_id: "bbbb2222-7712-4000-8000-000000000299" }) }),
  ])
    assert.deepEqual(await takeWeekMade(request, later), { status: 401, said: "unsigned" });
  assert.equal(later.tasks.length, 0);
});

test("a token for one workspace never opens another's week", async () => {
  world();
  const later = laterKept();
  assert.deepEqual(await takeWeekMade(call(BODY, { workspace: OTHER }), later), { status: 400, said: "malformed" });
  assert.equal(later.tasks.length, 0);
});

test("a held week overnight is prepared, never made: no reel begun, nothing approved or placed, its pass said done", async () => {
  const said = world({
    status: "ready",
    policies: true,
    slots: [
      {
        id: "eeee5555-7712-4000-8000-000000000220",
        tenant_id: T,
        plan_id: PLAN,
        creative: "ffff6666-7712-4000-8000-000000000221",
        place: "instagram",
        kind: "reel",
        at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        state: "proposed",
        title: "The finish",
        reason: null,
        file_id: "abab7777-7712-4000-8000-000000000222",
        piece_id: null,
        post_id: null,
        intent: null,
        words: { line: "Warm", over: null, under: null, caption: "Warm colour.", language: "en" },
        blocked_why: null,
        blocked_reason: null,
        ask: null,
        score: null,
        approval_id: null,
        prepared: null,
      },
    ],
  });
  const later = laterKept();
  assert.deepEqual(await takeWeekMade(call(BODY), later), { status: 202, said: "making" });
  await later.tasks[0]();
  assert.equal(said.slots.length, 0, "nothing made or held: a reel is begun only after the approval");
  assert.deepEqual(said.made, [
    {
      p_tenant_id: T,
      p_plan_id: PLAN,
      p_pass: "prepare",
      p_cap: WEEKS_MAKING_AT_ONCE,
      p_lease_seconds: WEEK_MAKING_LEASE_S,
    },
  ]);
});

test("a week the owner approved by hand, one asking, stopped, or whose approval carries no rung: never made here", async () => {
  for (const shape of [
    { approvedBy: OWNER },
    { status: "ready" },
    { status: "ready", policies: true, stopped: true },
    { rung: null },
  ]) {
    world(shape);
    const later = laterKept();
    assert.deepEqual(
      await takeWeekMade(call(BODY), later),
      { status: 409, said: "not_the_rung_s" },
      JSON.stringify(shape),
    );
    assert.equal(later.tasks.length, 0);
  }
});

test("with no secret to verify by, the door opens for nobody", async () => {
  world();
  const kept = process.env.EDGE_CALL_SECRET;
  delete process.env.EDGE_CALL_SECRET;
  try {
    assert.deepEqual(await takeWeekMade(call(BODY, { secret: kept }), laterKept()), {
      status: 503,
      said: "unconfigured",
    });
  } finally {
    process.env.EDGE_CALL_SECRET = kept;
  }
});

/* ------------------------------------------------------------------------------------ one post a slot (00714) -- */

test("AI places a slot through the one door: placed, taken where it has its post, past where its time came; a refusal in the owner's words", async () => {
  const { placeSlotAsAI } = await import(at("apps/dashboard/src/server/posts/approve.ts"));
  const asked = [];
  const ctxFor = (fate) => ({
    supabase: fakeDb(
      {},
      {},
      {
        plan_slot_place: (args) => {
          asked.push(args);
          return { fate, posts: [] };
        },
      },
    ),
  });
  const member = { tenantId: T };
  const slot = { id: "eeee5555-7712-4000-8000-000000000240", fileId: "abab7777-7712-4000-8000-000000000241" };
  const approval = { via: "rung", placements: [] };
  assert.equal(await placeSlotAsAI(ctxFor("approved"), member, { ...slot, approval }), "placed");
  assert.deepEqual(asked[0], { p_tenant_id: T, p_slot_id: slot.id, p_file_id: slot.fileId, p_approval: approval });
  // A making asked twice, or two at once: the second finds the slot has its post, and goes on.
  assert.equal(await placeSlotAsAI(ctxFor("taken"), member, { ...slot, approval }), "taken");
  assert.equal(await placeSlotAsAI(ctxFor("past"), member, { ...slot, approval }), "past");
  await assert.rejects(placeSlotAsAI(ctxFor("busy"), member, { ...slot, approval }), { name: "AppError", status: 409 });
  await assert.rejects(placeSlotAsAI(ctxFor("changed"), member, { ...slot, approval }), { name: "AppError" });
  await assert.rejects(placeSlotAsAI(ctxFor("no such fate"), member, { ...slot, approval }), /no fate answered/);
});

test("a picture drawn ahead is reused only while its slot still shows the footage it was drawn from", async () => {
  const { readContentWeek } = await import("@chanlytics/db/files");
  const FOOTAGE = "abab7777-7712-4000-8000-000000000250";
  const DRAWN = "abab7777-7712-4000-8000-000000000251";
  const slot = (id, fileId) => ({
    id,
    tenant_id: T,
    plan_id: PLAN,
    creative: "ffff6666-7712-4000-8000-000000000252",
    place: "instagram",
    kind: "picture",
    at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    state: "proposed",
    title: "The finish",
    reason: null,
    file_id: fileId,
    piece_id: null,
    post_id: null,
    intent: null,
    words: null,
    blocked_why: null,
    blocked_reason: null,
    ask: null,
    score: null,
    approval_id: null,
    prepared: { file_id: DRAWN, from: FOOTAGE, at: "2026-12-08T15:00:00Z", approval: {} },
  });
  const AS_DRAWN = "eeee5555-7712-4000-8000-000000000253";
  const SWAPPED = "eeee5555-7712-4000-8000-000000000254";
  const db = fakeDb({
    content_plans: [
      {
        id: PLAN,
        tenant_id: T,
        week_of: WEEK,
        status: "ready",
        fewer: null,
        ready_at: null,
        approved_at: null,
        approved_by: null,
        approval_id: null,
        asked_by: "clock",
        goes_at: null,
        stopped_at: null,
        stopped_by: null,
        edited: false,
      },
    ],
    // One slot as it was drawn; one given another photo since.
    plan_slots: [slot(AS_DRAWN, FOOTAGE), slot(SWAPPED, "abab7777-7712-4000-8000-000000000255")],
  });
  const week = await readContentWeek(db, T, WEEK);
  const preparedOf = (id) => week.slots.find((s) => s.id === id).prepared_file_id;
  assert.equal(preparedOf(AS_DRAWN), DRAWN);
  assert.equal(preparedOf(SWAPPED), null, "drawn again, never placed as it was");
});

test("a week says it goes up by itself only while its rung holds it and its time is not long past", async () => {
  const { weekAsHeld } = await import(at("apps/dashboard/src/server/readers/content/week-today.ts"));
  const goesAt = "2026-12-07T13:00:00.000Z";
  const at8 = Date.parse(goesAt);
  const week = { plan: { id: PLAN, week_of: WEEK, status: "ready", goes_at: goesAt }, slots: [] };
  const saidAt = (rung, nowMs) => weekAsHeld(week, rung, nowMs).plan.goes_at;
  assert.equal(saidAt("veto", at8 - 3_600_000), goesAt);
  assert.equal(saidAt("auto", at8 - 60_000), goesAt);
  assert.equal(saidAt("veto", at8 + 45 * 60_000), goesAt, "through the hour its approval is spread over");
  assert.equal(saidAt("ask", at8 - 3_600_000), null, "a rung set back to asking says nothing goes by itself");
  assert.equal(saidAt(null, at8 - 3_600_000), null);
  // Its job stopped for good, or the runner stood still: no screen goes on saying 8:00 AM, and Approve is offered again.
  assert.equal(saidAt("veto", at8 + 3 * 3_600_000), null);
  const asking = { plan: { ...week.plan, goes_at: null }, slots: [] };
  assert.equal(weekAsHeld(asking, "veto", at8), asking, "a week that asks is left as read");
});
