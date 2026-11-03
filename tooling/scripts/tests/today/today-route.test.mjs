/**
 * GET /api/v1/today (Today in three zones, 2 Nov 2026): the day's read whole, over the reader Ask uses, which the page makes
 * the day from (contracts toTodayVM); a workspace read any member may make, counted with the aggregates; the calls additive.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const route = await import(at("apps/dashboard/app/api/v1/today/route.ts"));
const { toTodayVM } = await import(at("packages/contracts/src/index.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const TZ = "America/New_York";
const METRICS = {
  workspace: { name: "Harbor", timezone: TZ, status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+15555550199" }],
  window: {
    days: 1,
    since: "2026-09-26T04:00:00+00:00",
    since_local: "2026-09-26T00:00:00",
    now_local: "2026-09-26T10:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: "2026-09-26T13:00:00Z",
    last_outbound_at: "2026-09-26T13:01:00Z",
  },
  period: {
    messages_in: 3,
    messages_out_ai: 3,
    messages_out_you: 0,
    conversations_active: 2,
    answered_by_ai: 3,
    answered_by_you: 0,
    unanswered_in_window: 0,
    median_reply_seconds_ai: 20,
    send_failures: 0,
    escalations_new: 0,
    escalation_reasons: {},
    calls: 0,
    call_seconds: 0,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 1,
  },
};
const tables = () => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "operator", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  conversations: [],
  escalations: [],
  calls: [],
  lead_searches: [],
});
const ctxFor = (rpcs) => ({ supabase: fakeDb(tables(), {}, rpcs), userId: USER, email: "ada@example.com", params: {} });
const get = () => new Request(`http://localhost/api/v1/today?workspace=${A}`);

test("the route declares a workspace read any member may make, counted with the aggregates", () => {
  assert.deepEqual(route.GET.policy, { kind: "read", scope: "workspace", role: null, rate: "aggregate", spend: false });
});

test("the day's read comes back whole, and the page makes the day from it in its own words", async () => {
  const out = await route.GET.run(get(), ctxFor({ metrics_summary: () => METRICS }));
  const read = out.read;
  assert.deepEqual(read.conversations, []);
  assert.deepEqual(read.calls, [], "the calls read, as the page holds it");
  const vm = toTodayVM(
    read.metrics,
    read.conversations,
    read.escalations,
    read.calls,
    new Date("2026-09-26T14:00:00Z"),
    read.searches,
    {
      runs: read.runs,
      heldThreads: read.held_threads,
      previewsTried: read.previews_tried,
      doneToday: read.done_today,
      since: read.since,
    },
  );
  // The wire is snake_case (docs/naming.md): what the route adds beside Ask's reader is named as the wire names it, each
  // read (today-reads.test.mjs runs the two the page alone reads: nothing done yet, and a member who never looked).
  assert.ok(
    ["held_threads", "previews_tried"].every((k) => k in read),
    "each named on the wire's way",
  );
  assert.equal(read.done_today, 0);
  assert.deepEqual(read.since, { seen_at: null, answered: null });
  assert.ok(vm.standing.headline, "a headline");
  assert.equal(vm.standing.lines.down, false);
  assert.deepEqual(
    vm.figures.map((f) => f.id),
    ["booked", "answered", "calls", "new"],
    "always the four: what was booked leads, answered out of the messages",
  );
  const answered = vm.figures.find((f) => f.id === "answered");
  assert.deepEqual([answered.value, answered.of], [3, 3], "3 of 3 answered");
  assert.equal(vm.callsRead, true);
  assert.deepEqual(vm.queue.rows, []);
});

test("the calls are additive: a read that fails leaves the day standing and says so", async () => {
  const ctx = ctxFor({ metrics_summary: () => METRICS });
  const db = ctx.supabase;
  const from = db.from.bind(db);
  db.from = (table) => {
    if (table === "calls") throw new Error("the phone line is unreachable");
    return from(table);
  };
  const out = await route.GET.run(get(), ctx);
  assert.equal(out.read.calls, null, "a read that failed is null, never none");
  assert.ok(out.read.metrics, "the rest of the day stands");
});
