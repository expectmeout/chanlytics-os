/**
 * Today's read of the morning (GET ask/morning, decision 0087) over the database in memory: a card stands only while what
 * it is about still stands, a press that found its subject gone is not offered again, what any member set aside lately
 * stays aside, and what Ask noticed is read whatever state the morning is in.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.ASK_MORNINGS = "on";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { setUnsubscribeServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { getMorning } = await import(at("apps/dashboard/src/server/ask/companion/morning.ts"));

afterEach(() => {
  setUnsubscribeServiceClient(null);
  readerCache.clear();
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ME = "11111111-1111-4111-8111-111111111111";
const TEAMMATE = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333331";
const THEIRS = "33333333-3333-4333-8333-333333333332";
const ANSWER = "44444444-4444-4444-8444-444444444441";
const OPEN_BATCH = "55555555-5555-4555-8555-555555555551";
const DONE_BATCH = "55555555-5555-4555-8555-555555555552";
const NOW = Date.parse("2026-11-02T15:00:00.000Z");
const TODAY = "2026-11-02";
const MADE = "2026-11-02T14:00:00.000Z";

const card = (id, kind, title, payload = {}, outcome = null) => ({
  id,
  kind,
  needs: "operator",
  title,
  summary: title,
  payload,
  undo: null,
  made_at: MADE,
  ...(outcome ? { outcome } : {}),
});

/** A workspace whose member has a morning of today, holding `cards`; a teammate's holds `theirs`. */
function world(cards, theirs = []) {
  return {
    memberships: [{ user_id: ME, tenant_id: A, role: "operator", views: {}, tenants: { slug: "harbor" } }],
    tenants: [{ id: A, name: "Harbor", timezone: "UTC" }],
    ask_mornings: [
      { tenant_id: A, user_id: ME, day: TODAY, thread_id: THREAD, cards: 1, made_at: MADE },
      { tenant_id: A, user_id: TEAMMATE, day: "2026-11-01", thread_id: THEIRS, cards: 1, made_at: MADE },
    ],
    ask_messages: [
      {
        id: ANSWER,
        thread_id: THREAD,
        role: "assistant",
        created_at: MADE,
        content: { proposals: cards, answer: { say: { headline: "A calm day.", detail: "" } } },
      },
      {
        id: "44444444-4444-4444-8444-444444444442",
        thread_id: THEIRS,
        role: "assistant",
        created_at: MADE,
        content: { proposals: theirs },
      },
    ],
    sequences: [],
    sequence_steps: [],
    sequence_batches: [
      { id: OPEN_BATCH, tenant_id: A, state: "scheduled" },
      { id: DONE_BATCH, tenant_id: A, state: "sent" },
    ],
    sequence_sends: [],
  };
}

/** The morning read as the route reads it, over one database for the member and the service client. */
function read(data) {
  const supabase = fakeDb(data, {}, { sequence_overview: () => [], run_counts: () => [] });
  setUnsubscribeServiceClient(supabase);
  return getMorning(
    { supabase, userId: ME, email: "ada@example.com", params: {} },
    { tenantId: A, role: "operator" },
    NOW,
  );
}

const titles = (morning) => morning.cards.map((c) => c.title);

test("a card about a batch stands only while that batch can still be pressed", async () => {
  const morning = await read(
    world([
      card("p-1", "run", "Cancel it", { broadcast_id: OPEN_BATCH, verb: "skip" }),
      card("p-2", "run", "Skip that", { broadcast_id: DONE_BATCH, verb: "skip" }),
      card("p-3", "lead_search", "Find gyms"),
    ]),
  );
  assert.deepEqual(titles(morning), ["Cancel it", "Find gyms"]);
  assert.equal(morning.state, "ready");
});

test("a failed press is offered again, unless what it was about moved on", async () => {
  const failed = { state: "failed", receipt: "No", atMs: NOW };
  const morning = await read(
    world([
      card("p-1", "lead_search", "Try again", {}, failed),
      card("p-2", "lead_search", "Moved on", {}, { ...failed, moved: true }),
    ]),
  );
  assert.deepEqual(titles(morning), ["Try again"]);
});

test("what a teammate set aside lately stays aside, and what came of an approved idea is said", async () => {
  const done = { state: "done", receipt: "Found 40 gyms", atMs: NOW };
  const dismissed = { state: "dismissed", receipt: "Let go", atMs: NOW };
  const morning = await read(
    world(
      [card("p-1", "lead_search", "Find florists"), card("p-2", "lead_search", "Find dentists")],
      [card("p-9", "lead_search", "Find florists", {}, dismissed), card("p-8", "lead_search", "Find gyms", {}, done)],
    ),
  );
  assert.deepEqual(titles(morning), ["Find dentists"]);
  assert.deepEqual(morning.lately, [{ title: "Find gyms", said: "Found 40 gyms" }]);
});

test("a read that fails costs what it read, never the morning", async () => {
  const data = world([card("p-1", "lead_search", "Find gyms")]);
  const supabase = fakeDb(data, {}, { sequence_overview: () => [], run_counts: () => [] });
  setUnsubscribeServiceClient({
    from: () => {
      throw new Error("service read down");
    },
  });
  const morning = await getMorning(
    { supabase, userId: ME, email: "ada@example.com", params: {} },
    { tenantId: A, role: "operator" },
    NOW,
  );
  assert.deepEqual(titles(morning), ["Find gyms"]);
  assert.deepEqual(morning.lately, []);
});
