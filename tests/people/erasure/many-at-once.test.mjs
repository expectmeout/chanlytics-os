/**
 * Many people deleted at one press (POST contacts/erase): the People bar's Delete…, for a selection the mailbox brought
 * in before it judged its senders (decision 0080's open question, 3 Nov 2026), of any size. The press is one door
 * (people_erase_begin, 00547): everyone named goes out of reach and onto the ledger in one transaction, and the erasing
 * is the job's (erasure-finish.test.mjs). What only Postgres can answer is an-erasure-is-an-owner-s-word.db.test.mjs.
 * It erased inside the request until 5 Nov 2026, where fifty people at 0.8 s each outran the browser's 30 s wait; then
 * it wrote each person in turn, sixty a second, which a press of thousands would outrun too. Run through route(): the
 * real route module, its `run` called with a database in memory.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore, RATE } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const many = await import(at("apps/dashboard/app/api/v1/contacts/erase/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";
const P4 = "44444444-4444-4444-8444-444444444444";
const USER = "u1";
const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});
const both = (harbor, bayside) => [
  membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"),
  membership(B, bayside, "bayside", "2026-02-01T00:00:00Z"),
];
const inA = `?workspace=${A}`;
const send = (body, q = inA) =>
  new Request(`http://localhost/api/v1/contacts/erase${q}`, { method: "POST", body: JSON.stringify(body) });
async function refused(p, code, status, why) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, why ?? e.message);
    if (status) assert.equal(e.status, status, why);
    return true;
  });
}

/**
 * A workspace in memory, its one door played by `answer`, and every write this test is about kept: what the door was
 * asked, and anything else the press wrote, which should be nothing.
 */
function world(answer = ({ p_contact_ids }) => ({ going: p_contact_ids, no_address: [] })) {
  const asked = [];
  const tables = { memberships: both("owner", "operator"), contacts: [], jobs: [], decisions: [] };
  const doors = {
    people_erase_begin: (a) => {
      asked.push(a);
      return answer(a);
    },
  };
  const ctx = { supabase: fakeDb(tables, {}, doors), userId: USER, email: "ada@example.com", params: {} };
  return { ctx, asked, tables };
}

const press = (w, body, q = inA) => many.POST.run(send(body, q), w.ctx);
const manyIds = (n) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

test("the door is the owner's, on a fresh session, with a bucket of its own: the single door five an hour", () => {
  assert.deepEqual(many.POST.policy, {
    kind: "write",
    fresh: true,
    scope: "workspace",
    role: "owner",
    rate: "erase_many",
    spend: false,
  });
  assert.ok(RATE.erase_many.limit >= 5 && RATE.erase_many.limit <= 20, "a few presses an hour, never a script's");
  assert.equal(RATE.erase.limit, 5, "the single door's own bucket is left as it was");
});

test("a press asks the door once, each person once in the order picked, and whoever the door did not take comes back skipped", async () => {
  const stranger = "99999999-9999-4999-8999-999999999999";
  const w = world(() => ({ going: [P1, P2], no_address: [] }));
  const out = await press(w, { ids: [P1, P2, P3, P4, stranger, P1] });
  assert.deepEqual(w.asked, [{ p_tenant_id: A, p_contact_ids: [P1, P2, P3, P4, stranger], p_not_a_person: false }]);
  assert.deepEqual(out, { going: [P1, P2], failed: [], skipped: [P3, P4, stranger] });
});

test("REGRESSION: a press of five thousand is one write, with nobody erased or written one at a time (5 Nov 2026: fifty at a press made 242 leftovers five presses)", async () => {
  const ids = manyIds(5000);
  const w = world();
  const out = await press(w, { ids });
  assert.equal(w.asked.length, 1, "one door, one transaction, however many it names");
  assert.deepEqual(out.going, ids, "every one, in the order picked");
  assert.deepEqual([out.failed, out.skipped], [[], []]);
  assert.deepEqual([w.tables.jobs, w.tables.decisions], [[], []], "the door writes them, not this route");
});

test("a press takes everyone a page can hold: the only ceiling is what one request can carry", async () => {
  const held = manyIds(50 * 1000);
  assert.equal((await press(world(), { ids: held })).going.length, held.length, "fifty pages of a thousand");
  await refused(press(world(), { ids: manyIds(100_001) }), "validation", 400);
});

test("Not a person: the door is told, and someone it could not say automated stays, and says why", async () => {
  const w = world(({ p_contact_ids }) => ({
    going: p_contact_ids.filter((id) => id !== P2),
    no_address: [P2],
  }));
  const out = await press(w, { ids: [P1, P2, P3], not_a_person: true });
  assert.equal(w.asked[0].p_not_a_person, true);
  assert.deepEqual(out.going, [P1, P3]);
  assert.deepEqual(out.failed, [{ id: P2, message: "This person has no email address to sort." }]);
  assert.deepEqual(out.skipped, [], "they are ours: failed, never skipped");
});

test("a door that refuses is the whole press refused: one transaction, so nobody went", async () => {
  const w = world(() => {
    throw new Error("statement timeout");
  });
  await assert.rejects(press(w, { ids: [P1, P2] }), /statement timeout/);
  assert.deepEqual([w.tables.jobs, w.tables.decisions], [[], []]);
});

test("the count leaves out who is being erased, as the list does (00547), and shows a stopped erasure a day on", async () => {
  const { countPeople } = await import(at("apps/dashboard/src/server/people/people.ts"));
  const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
  const person = (id, erasing_since) => ({
    id,
    tenant_id: A,
    display_name: "Notices",
    erased_at: null,
    merged_into_contact_id: null,
    erasing_since,
  });
  const contacts = [person(P1, null), person(P2, hoursAgo(1)), person(P3, hoursAgo(25))];
  const supabase = fakeDb({ contacts }, {}, {});
  assert.equal(await countPeople({ supabase }, A, null), 2, "the one being erased is not counted");
});

test("refused: an operator, nobody, and anything but a yes or no for Not a person", async () => {
  const w = world();
  await refused(press(w, { ids: [P1] }, `?workspace=${B}`), "forbidden", 403, "an operator in bayside");
  await refused(press(w, { ids: [] }), "validation", 400);
  await refused(press(w, { ids: [P1], not_a_person: "yes" }), "validation", 400);
  assert.deepEqual(w.asked, [], "the door was never asked");
});
