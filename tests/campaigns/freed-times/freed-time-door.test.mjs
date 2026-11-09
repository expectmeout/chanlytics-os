/**
 * Offer it's door, run: POST /api/admin/calendar/freed-time over a database in memory (Today in three zones, 2 Nov 2026;
 * decision 0082). A member pressed Offer it on an hour a cancellation freed in Today's day; the dashboard knocks here with
 * the visit, and the edge makes the offer the cancellation's arrival makes (lib/campaigns/freed-time-offer.ts, whose run
 * offer-freed-time.test.mjs executes): over the time the receptionist would book now, read from the visit itself, once
 * per appointment.
 *
 * Executed here: the knock (a token for THIS door, a body that may not name another workspace than the token), ids that
 * are not ids, no database; a visit that is gone, and one whose time cannot be offered now, answered with why; the
 * workspace's step paused or missing; a second press answered by the batch the first made, with how many it offers and
 * whether it waits for the owner's OK, making nothing twice; and a read that failed, a 500 that names it.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels/tokens";
import { fakeDb } from "../../_fake-db.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const door = await import(at("apps/edge/api/admin/calendar/freed-time.ts"));
after(() => setPg(null));

const AUD = "/api/admin/calendar/freed-time";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
/** The member who pressed Offer it. */
const U = "11111111-1111-4111-8111-111111111111";
/** Rosa's visit, cancelled: Tuesday 8 September, 3 to 4 PM in New York. */
const APPT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const SEQ = "5e5e5e5e-5e5e-45e5-85e5-5e5e5e5e5e5e";
const STEP = "57575757-5757-4575-8575-575757575757";
const TZ = "America/New_York";
/** Sunday 6 September 2026, 10 AM in New York. */
const NOW = Date.parse("2026-09-06T14:00:00Z");

const token =
  (o = {}) =>
  (body) =>
    signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? AUD, { workspace: A, user: U, body });
const knock = (body, headers = { "x-edge-token": token() }) => {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const minted = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, typeof v === "function" ? v(raw) : v]));
  return door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: { ...minted, "content-type": "application/json" },
      body: raw,
    }),
  );
};
const answer = async (res) => [res.status, await res.json()];
const press = { appointment_id: APPT, user_id: U };

/** The business's week: open nine to six every day, two hours' notice, a fortnight ahead. */
const HOURS = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open: "09:00", close: "18:00" }]),
);

/**
 * A workspace on New York's clock with Rosa's visit, cancelled; its Fill a cancellation step in a sequence of `mode`
 * (none, or paused, where asked); and any batch a press already made.
 */
function world({ appointment = {}, steps = "running", mode = "ask", batches = [], faults = {} } = {}) {
  const tables = {
    tenants: [{ id: A, name: "Harbor", timezone: TZ, status: "active" }],
    tenant_config: [
      {
        tenant_id: A,
        config: {
          brain: {
            business_name: "Harbor",
            system_prompt: "Answer as the front desk of Harbor: brief, warm, and never a price or a booking.",
            fallbacks: { greeting: "g", error: "e", non_text: "n" },
            profile: { hours: HOURS, closures: [], services: [], booking_rules: { lead_hours: 2, max_days_ahead: 14 } },
          },
        },
      },
    ],
    appointments:
      appointment === null
        ? []
        : [
            {
              id: APPT,
              tenant_id: A,
              contact_id: "p-rosa",
              status: "cancelled",
              starts_at: "2026-09-08T19:00:00.000Z",
              ends_at: "2026-09-08T20:00:00.000Z",
              all_day: false,
              vanished_at: null,
              expires_at: null,
              ...appointment,
            },
          ],
    sequences: [{ id: SEQ, tenant_id: A, name: "Fill a cancellation", mode, created_at: "2026-09-01T10:00:00.000Z" }],
    sequence_steps:
      steps === "none"
        ? []
        : [
            {
              id: STEP,
              tenant_id: A,
              sequence_id: SEQ,
              kind: "moment",
              name: "Fill a cancellation",
              trigger: "slot_opened",
              template_name: "time_freed",
              template_language: "en_US",
              params: [{ kind: "first_name" }, { kind: "freed_when" }],
              policy_class: "follow_up",
              state: steps,
              run_hour: 10,
              cap_per_run: 4,
              gap_days: 7,
              cadence_days: 30,
              created_at: "2026-09-01T10:00:00.000Z",
              updated_at: "2026-09-01T10:00:00.000Z",
            },
          ],
    sequence_batches: batches,
    sequence_sends: [],
    jobs: [],
    decisions: [],
  };
  const db = fakeDb(tables, faults, { people_list: () => [] });
  setPg(db);
  return { db, tables };
}

test("the knock: a token for another door, a body naming another workspace, and ids that are not ids are refused before anything is read; no database is a 503", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const w = world();
  assert.deepEqual(await answer(await knock(press, { "x-edge-token": token({ aud: "/api/admin/playbooks-run" }) })), [
    403,
    { ok: false, error: "token_audience" },
  ]);
  assert.deepEqual(await answer(await knock({ ...press, tenant_id: B })), [
    403,
    { ok: false, error: "workspace_mismatch" },
  ]);
  // The token's person is who pressed: a body's own `user_id` is not read, so only the visit's id can be wrong.
  for (const bad of [{}, { appointment_id: "rosa" }, { user_id: U }, "not json"])
    assert.deepEqual(await answer(await knock(bad)), [400, { ok: false, error: "bad_request" }], JSON.stringify(bad));
  assert.equal(w.db.seen.length, 0, "nothing was read for any of it");
  setPg(null);
  assert.deepEqual(await answer(await knock(press)), [503, { ok: false, error: "no_database" }]);
});

test("a visit that is gone, or whose time cannot be offered now, is answered with why, and nothing is made", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const gone = world({ appointment: null });
  assert.deepEqual(await answer(await knock(press)), [200, { ok: true, offered: false, why: "gone" }]);
  assert.deepEqual(gone.tables.sequence_batches, []);
  // An hour from now: inside the two hours' notice the receptionist gives, so nobody may be offered it.
  const soon = world({ appointment: { starts_at: "2026-09-06T15:00:00.000Z", ends_at: "2026-09-06T16:00:00.000Z" } });
  assert.deepEqual(await answer(await knock(press)), [200, { ok: true, offered: false, why: "too_soon" }]);
  assert.deepEqual(soon.tables.sequence_batches, []);
});

test("no step on the moment, or a paused one, offers nothing and says which", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  world({ steps: "none" });
  assert.deepEqual(await answer(await knock(press)), [200, { ok: true, offered: false, why: "no_step" }]);
  world({ steps: "paused" });
  assert.deepEqual(await answer(await knock(press)), [200, { ok: true, offered: false, why: "paused" }]);
});

test("a second press is answered by the batch the first made: how many it offers, and that it waits for the owner's OK; nothing is made twice", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const batch = (state) => ({
    id: "batch-1",
    tenant_id: A,
    step_id: STEP,
    offered_from: APPT,
    offered_start: "2026-09-08T19:00:00.000Z",
    offered_end: "2026-09-08T20:00:00.000Z",
    recipient_count: 3,
    state,
  });
  const asks = world({ batches: [batch("pending_approval")] });
  assert.deepEqual(await answer(await knock(press)), [200, { ok: true, offered: true, people: 3, waits: true }]);
  assert.deepEqual([asks.tables.sequence_batches.length, asks.tables.jobs.length], [1, 0]);
  world({ mode: "auto", batches: [batch("sending")] });
  assert.deepEqual(await answer(await knock(press)), [200, { ok: true, offered: true, people: 3, waits: false }]);
});

test("a read that fails is a 500 that names it: the visit could not be read, or the workspace could not be for its run", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  world({ faults: { "appointments.select": { message: "the read timed out" } } });
  const [status, body] = await answer(await knock(press));
  assert.deepEqual([status, body.ok, body.error], [500, false, "run_failed"]);
  assert.equal(body.detail, "Could not run that just now. Try again in a moment.", "the text is the log's");
});
