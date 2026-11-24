/**
 * The dashboard's door for a week a rung let AI approve (00712; apps/dashboard/src/server/content/week-made.ts over
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
