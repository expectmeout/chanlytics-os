/**
 * Many people deleted at one press (POST contacts/erase): the People bar's Delete…, for a selection the mailbox brought
 * in before it judged its senders (decision 0080's open question, 3 Nov 2026: 46 programs and pitches on one workspace,
 * and an owner's five erasures an hour made that nine hours of taps). The press takes each person out of reach (the
 * block), hands them to the ledger (erasure_finish, due now) and answers: the erasing is the job's
 * (erasure-finish.test.mjs). It erased inside the request until 5 Nov 2026, where fifty people at 0.8 s each outran the
 * browser's 30 s wait, one person with 44 calls took 40 s alone, and the press pressed again ran beside the first. With
 * Not a person on, each address is said automated first, as the person page's switch does. Run through route(): the real
 * route module, its `run` called with a database in memory.
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

/**
 * A workspace in memory, the service client's legs on the same database, and what this test is about kept in the order
 * asked: the addresses said, each with whether their person was blocked by then, and any erasing the press did itself.
 */
function world(tables, rpcs = {}) {
  const asked = [];
  const legOfTheJob = (name) => (a) => {
    asked.push([name, a.p_contact_id]);
    return name === "erase_contact" ? { counts: {}, storage_paths: [], jobs_canceled: 0 } : 0;
  };
  const all = { memberships: both("owner", "operator"), calls: [], messages: [], jobs: [], decisions: [], ...tables };
  const doors = {
    erase_contact: legOfTheJob("erase_contact"),
    scrub_ask_for_contact: legOfTheJob("scrub_ask_for_contact"),
    provider_events_scrub: legOfTheJob("provider_events_scrub"),
    person_notes_scrub: legOfTheJob("person_notes_scrub"),
    model_turns_scrub: legOfTheJob("model_turns_scrub"),
    mailbox_sender_sort: (a) => {
      const person = all.contacts.find((c) => c.email?.toLowerCase() === a.p_sender);
      asked.push(["sort", a.p_sender, a.p_verdict, person?.erasing_since ? "blocked already" : "not blocked yet"]);
      return null;
    },
    ...rpcs,
  };
  const ctx = { supabase: fakeDb(all, {}, doors), userId: USER, email: "ada@example.com", params: {} };
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

const finishes = (w) => w.tables.jobs.filter((j) => j.kind === "erasure_finish");
const row = (w, id) => w.tables.contacts.find((c) => c.id === id);

test("a press takes each person of this workspace out of reach and leaves the erasing to the ledger; another workspace's, an erased one and a stranger come back skipped", async () => {
  const w = world({
    contacts: [contact(P1, A), contact(P2, A), contact(P3, B), contact(P4, A, { erased_at: "2026-10-01T00:00:00Z" })],
  });
  const stranger = "99999999-9999-4999-8999-999999999999";
  const before = Date.now();
  const out = await press(w, { ids: [P1, P2, P3, P4, stranger, P1] });
  assert.deepEqual(out, { going: [P1, P2], failed: [], skipped: [P3, P4, stranger] });
  assert.deepEqual(w.asked, [], "the press erases nobody: not a scrub, not the rows");
  assert.ok(row(w, P1).erasing_since && row(w, P2).erasing_since, "out of reach from now: the wire refuses them");
  assert.equal(row(w, P1).erased_at, null, "and not erased yet: that is the job's");
  assert.equal(row(w, P3).erasing_since, null, "another workspace's person is untouched");
  assert.deepEqual(
    finishes(w).map((j) => [j.tenant_id, j.payload.contact_id, j.payload.by, j.dedupe_key]),
    [
      [A, P1, USER, `erasure_finish:${P1}`],
      [A, P2, USER, `erasure_finish:${P2}`],
    ],
    "one finish a person, naming who pressed, for the ledger's row",
  );
  for (const j of finishes(w))
    assert.ok(Date.parse(j.due_at) <= Date.now() && Date.parse(j.due_at) >= before, "due now");
});

test("REGRESSION: a press pressed again starts no second erasure: who is going already is said as going, with their one finish (5 Nov 2026: a second press ran beside the first, and asked the provider about 44 calls again)", async () => {
  const w = world({ contacts: [contact(P1, A), contact(P2, A)] });
  assert.deepEqual((await press(w, { ids: [P1] })).going, [P1]);
  const blockedAt = row(w, P1).erasing_since;
  const again = await press(w, { ids: [P1, P2] });
  assert.deepEqual(again, { going: [P1, P2], failed: [], skipped: [] });
  assert.equal(finishes(w).filter((j) => j.payload.contact_id === P1).length, 1, "their one finish stands");
  assert.equal(row(w, P1).erasing_since, blockedAt, "the block is not moved");
  assert.deepEqual(w.asked, []);
});

test("a person a press left blocked with no finish waiting is handed to the ledger again", async () => {
  const w = world({ contacts: [contact(P1, A, { erasing_since: "2026-11-01T00:00:00Z" })] });
  assert.deepEqual((await press(w, { ids: [P1] })).going, [P1]);
  assert.equal(finishes(w).length, 1);
});

test("Not a person: each address is said automated before its person is blocked; someone with no address is left alone, and says why", async () => {
  const w = world({
    contacts: [
      contact(P1, A, { email: "Alerts@Notice.Example.com" }),
      contact(P2, A, { email: null, phone_e164: "+15550100123" }),
      contact(P3, A),
    ],
  });
  const out = await press(w, { ids: [P1, P2, P3], not_a_person: true });
  assert.deepEqual(out.going, [P1, P3]);
  assert.deepEqual(out.failed, [{ id: P2, message: "This person has no email address to sort." }]);
  assert.deepEqual(
    w.asked.sort(),
    [
      ["sort", `${P3.slice(0, 4)}@notice.example.com`, "automated", "not blocked yet"],
      ["sort", "alerts@notice.example.com", "automated", "not blocked yet"],
    ],
    "the address alone, never the domain: a selection is many senders, and a domain is many people's",
  );
  assert.equal(row(w, P2).erasing_since, null, "the person with no address is not going");
});

test("one person who could not be handed over is said, and the others still go", async () => {
  const w = world(
    { contacts: [contact(P1, A), contact(P2, A)] },
    {
      erasure_digests: (a, plain) => {
        if (a.p_values.includes(row(w, P1).email)) throw new Error("statement timeout");
        return plain(a);
      },
    },
  );
  const out = await press(w, { ids: [P1, P2] });
  assert.deepEqual(out.going, [P2]);
  assert.deepEqual(out.failed, [
    { id: P1, message: "Could not mark this person as being erased, so nothing was deleted. Try again." },
  ]);
  assert.equal(row(w, P1).erasing_since, null, "not blocked, and no finish for them");
  assert.deepEqual(
    finishes(w).map((j) => j.payload.contact_id),
    [P2],
  );
});

test("a ledger that would not take the finish is said: this press has no other way to erase them", async () => {
  const w = world({ contacts: [contact(P1, A)] });
  w.ctx.supabase = fakeDb(w.tables, { "jobs.insert": { message: "the ledger refused" } }, {});
  const out = await press(w, { ids: [P1] });
  assert.deepEqual(out.going, []);
  assert.deepEqual(out.failed, [{ id: P1, message: "Could not start deleting this person. Try again." }]);
});

test("REGRESSION: a press of fifty is handed over side by side, a few at a time, and says them in the order picked (5 Nov 2026: one after another, it outran the browser's 30 s wait)", async () => {
  const ids = Array.from({ length: 50 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const w = world({ contacts: ids.map((id) => contact(id, A)) });
  let asking = 0;
  let most = 0;
  /** Nobody is answered until a second person is out beside the first: one after another, this never ends. */
  let open;
  const beside = new Promise((resolve) => (open = resolve));
  const db = w.ctx.supabase;
  const plain = db.rpc.bind(db);
  db.rpc = (name, args) =>
    name !== "erasure_digests"
      ? plain(name, args)
      : (async () => {
          asking += 1;
          most = Math.max(most, asking);
          if (asking >= 2) open();
          await beside;
          asking -= 1;
          return plain(name, args);
        })();
  const out = await press(w, { ids });
  assert.deepEqual(out.going, ids, "every one, in the order picked");
  assert.ok(most >= 2, "side by side");
  assert.ok(most <= 12, `a few at a time, asked ${most}`);
  assert.equal(finishes(w).length, 50);
});

test("refused: an operator, nobody, more than fifty, and anything but a yes or no for Not a person", async () => {
  const w = world({ contacts: [contact(P1, A)] });
  await refused(press(w, { ids: [P1] }, `?workspace=${B}`), "forbidden", 403, "an operator in bayside");
  await refused(press(w, { ids: [] }), "validation", 400);
  const fiftyOne = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  await refused(press(w, { ids: fiftyOne }), "validation", 400);
  await refused(press(w, { ids: [P1], not_a_person: "yes" }), "validation", 400);
  assert.deepEqual(w.asked, [], "nothing was erased or said");
  assert.equal(w.tables.contacts[0].erasing_since, null, "and nobody blocked");
  assert.equal(w.tables.jobs.length, 0, "and nothing on the ledger");
});
