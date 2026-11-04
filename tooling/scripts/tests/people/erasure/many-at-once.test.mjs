/**
 * Many people deleted at one press (POST contacts/erase): the People bar's Delete…, for a selection the mailbox brought
 * in before it judged its senders (decision 0080's open question, 3 Nov 2026: 46 programs and pitches on one workspace,
 * and an owner's five erasures an hour made that nine hours of taps). Each person goes as Delete person takes one
 * (erase-contact.ts), and, with Not a person on, their address is said automated first, as the person page's switch
 * does. Run through route(): the real route module, its `run` called with a database in memory.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore, RATE } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const { eraseMany } = await import(at("apps/dashboard/src/server/people/people-many.ts"));
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
const contact = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  phone_e164: null,
  email: `${id.slice(0, 4)}@notice.example.com`,
  display_name: "Notices",
  erased_at: null,
  erasing_since: null,
  ...over,
});
const send = (body, q = inA) =>
  new Request(`http://localhost/api/v1/contacts/erase${q}`, { method: "POST", body: JSON.stringify(body) });
async function refused(p, code, status, why) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, why ?? e.message);
    if (status) assert.equal(e.status, status, why);
    return true;
  });
}

/** The scrubs an erasure asks before its rows go and after (people-routes.test.mjs holds their order and arguments). */
const SCRUBS = {
  model_turns_scrub: () => 0,
  scrub_ask_for_contact: () => 0,
  provider_events_scrub: () => 0,
  person_notes_scrub: () => 0,
};

/**
 * A workspace in memory with the erasure's doors answered, the service client's legs on the same database, and the
 * doors this test is about kept in the order asked.
 */
function world(tables) {
  const asked = [];
  const rpcs = {
    ...SCRUBS,
    mailbox_sender_sort: (a) => {
      asked.push(["sort", a.p_sender, a.p_verdict]);
      return null;
    },
    erase_contact: (a) => {
      asked.push(["erase", a.p_contact_id]);
      const row = tables.contacts.find((c) => c.id === a.p_contact_id);
      if (row) row.erased_at = "2026-11-03T22:00:00Z";
      return { counts: {}, storage_paths: [], jobs_canceled: 0 };
    },
  };
  const all = { memberships: both("owner", "operator"), calls: [], messages: [], jobs: [], decisions: [], ...tables };
  const ctx = { supabase: fakeDb(all, {}, rpcs), userId: USER, email: "ada@example.com", params: {} };
  return { ctx, asked, tables: all };
}

/** The route's answer, its service-client legs on the world's own database. */
async function press(w, body, q = inA) {
  setServiceClient(w.ctx.supabase);
  try {
    return await many.POST.run(send(body, q), w.ctx);
  } finally {
    setServiceClient(null);
  }
}

test("the door is the owner's, on a fresh session, with a bucket of its own: a press takes fifty, the single door five an hour", () => {
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

test("each person of this workspace goes as Delete person takes one; another workspace's, an erased one and a stranger come back skipped", async () => {
  const w = world({
    contacts: [contact(P1, A), contact(P2, A), contact(P3, B), contact(P4, A, { erased_at: "2026-10-01T00:00:00Z" })],
  });
  const stranger = "99999999-9999-4999-8999-999999999999";
  const out = await press(w, { ids: [P1, P2, P3, P4, stranger, P1] });
  assert.deepEqual(out, { erased: [P1, P2], failed: [], skipped: [P3, P4, stranger], left: [] });
  assert.deepEqual(
    w.asked,
    [
      ["erase", P1],
      ["erase", P2],
    ],
    "each erased once, in the order picked, and nobody's address said anything",
  );
  assert.equal(w.tables.contacts.find((c) => c.id === P3).erased_at, null, "another workspace's person is untouched");
});

test("Not a person: each address is said automated before its person goes; someone with no address is not deleted, and says why", async () => {
  const w = world({
    contacts: [
      contact(P1, A, { email: "Alerts@Notice.Example.com" }),
      contact(P2, A, { email: null, phone_e164: "+15550100123" }),
      contact(P3, A),
    ],
  });
  const out = await press(w, { ids: [P1, P2, P3], not_a_person: true });
  assert.deepEqual(out.erased, [P1, P3]);
  assert.deepEqual(out.failed, [{ id: P2, message: "This person has no email address to sort." }]);
  assert.deepEqual(
    w.asked,
    [
      ["sort", "alerts@notice.example.com", "automated"],
      ["erase", P1],
      ["sort", `${P3.slice(0, 4)}@notice.example.com`, "automated"],
      ["erase", P3],
    ],
    "the address alone, never the domain: a selection is many senders, and a domain is many people's",
  );
  assert.equal(w.tables.contacts.find((c) => c.id === P2).erased_at, null, "the person with no address is still there");
});

test("one person's erasure that fails is said, and the others still go", async () => {
  const w = world({ contacts: [contact(P1, A), contact(P2, A)] });
  w.ctx.supabase = fakeDb(
    w.tables,
    {},
    {
      ...SCRUBS,
      erase_contact: (a) => {
        if (a.p_contact_id === P1) throw new Error("statement timeout");
        w.asked.push(["erase", a.p_contact_id]);
        return { counts: {}, storage_paths: [], jobs_canceled: 0 };
      },
    },
  );
  const out = await press(w, { ids: [P1, P2] });
  assert.deepEqual(out.erased, [P2]);
  assert.equal(out.failed.length, 1);
  assert.equal(out.failed[0].id, P1);
  assert.ok(out.failed[0].message, "the failure says something");
});

test("a press that runs out of its time hands the rest back to press again: the first person always goes", async () => {
  const w = world({ contacts: [contact(P1, A), contact(P2, A), contact(P3, A)] });
  setServiceClient(w.ctx.supabase);
  try {
    const out = await eraseMany(w.ctx, A, [P1, P2, P3], false, 0);
    assert.deepEqual(out, { erased: [P1], failed: [], skipped: [], left: [P2, P3] });
  } finally {
    setServiceClient(null);
  }
});

test("refused: an operator, nobody, more than fifty, and anything but a yes or no for Not a person", async () => {
  const w = world({ contacts: [contact(P1, A)] });
  await refused(press(w, { ids: [P1] }, `?workspace=${B}`), "forbidden", 403, "an operator in bayside");
  await refused(press(w, { ids: [] }), "validation", 400);
  const fiftyOne = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  await refused(press(w, { ids: fiftyOne }), "validation", 400);
  await refused(press(w, { ids: [P1], not_a_person: "yes" }), "validation", 400);
  assert.deepEqual(w.asked, [], "nothing was erased or said");
  assert.equal(w.tables.contacts[0].erased_at, null);
});
