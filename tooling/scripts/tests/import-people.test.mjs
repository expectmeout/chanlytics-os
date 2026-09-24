/**
 * The import route, run through route(): the real module's `run` over a database in memory, the door modelled. What is
 * proved is the policy it declares and what the handler answers: a part of fifty normalised on the one phone and email
 * rules before the door sees it, the unreadable skipped with the product's words, a row the door refuses skipped, a
 * fault that refuses every row stopping the part, and one decision per part.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import { erasedEmailHash, erasedPhoneHash } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const route = await import(at("apps/dashboard/app/api/v1/contacts/import/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const IMPORT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const tables = () => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  decisions: [],
});
/** fakeDb writes into the tables it is given, so a test that passes its own reads back what the route wrote. */
const ctxFor = (rpcs, db = tables()) => ({
  supabase: fakeDb(db, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params: {},
});
const post = (body) =>
  new Request(`http://localhost/api/v1/contacts/import?workspace=${A}`, { method: "POST", body: JSON.stringify(body) });

test("the route declares its policy: the owner's, counted in its own bucket, never spending", () => {
  assert.deepEqual(route.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "owner",
    rate: "person_import",
    spend: false,
  });
});

test("a part is normalised before the door sees it, the unreadable are skipped in the product's words, and one decision says the counts", async () => {
  const calls = [];
  const db = tables();
  const ctx = ctxFor(
    {
      import_person: (args) => {
        calls.push(args);
        return { contact_id: `k-${calls.length}`, existed: calls.length === 2, email: args.p_email ? "set" : null };
      },
    },
    db,
  );
  const out = await route.POST.run(
    post({
      import_id: IMPORT,
      rows: [
        { name: "Ana Ruiz", phone: "(646) 555-0101", email: "Ana@Example.com" },
        { name: "Dee", phone: "646-555-0102" },
        { name: "Nobody" },
        { name: "Short", phone: "12345" },
      ],
    }),
    ctx,
  );
  // What a row does not have travels as empty, which the door reads as none: database.types.ts types the name, the
  // number and the address as strings, as it does set_person_email's address.
  assert.deepEqual(
    calls.map((c) => [c.p_phone_e164, c.p_email, c.p_name]),
    [
      ["+16465550101", "ana@example.com", "Ana Ruiz"],
      ["+16465550102", "", "Dee"],
    ],
  );
  // The digests are of the number and the address as stored, keyed to the workspace, as the erasure wrote them.
  assert.equal(calls[0].p_phone_digest, await erasedPhoneHash(A, "+16465550101"));
  assert.equal(calls[0].p_email_digest, await erasedEmailHash(A, "ana@example.com"));
  assert.equal(calls[1].p_email_digest, undefined, "no address, no digest: the door's default is none");
  assert.equal(out.added, 1);
  assert.equal(out.existed, 1);
  assert.equal(out.emails_set, 1);
  assert.deepEqual(out.skipped, [
    { line: 3, reason: "No number and no address." },
    { line: 4, reason: "That is a short code, not a phone number — nobody can be reached on one." },
  ]);
  assert.deepEqual(out.failed, []);
  assert.equal(out.stopped, false);
  // One decision per part, subject the workspace, with the counts.
  assert.equal(db.decisions.length, 1);
  const [decision] = db.decisions;
  assert.equal(decision.verb, "import");
  assert.equal(decision.subject_type, "workspace");
  assert.equal(decision.subject_id, A);
  const payload = { ...decision.payload };
  delete payload.via;
  assert.deepEqual(payload, { import_id: IMPORT, rows: 4, added: 1, existed: 1, emails_set: 1, skipped: 2, failed: 0 });
});

test("a row the door refuses is skipped with its sentence; a fault that refuses every row stops the part and is said", async () => {
  let n = 0;
  const refusing = ctxFor({
    import_person: () => {
      n += 1;
      if (n === 1) throw Object.assign(new Error("That person asked to be forgotten."), { code: "42501" });
      return { contact_id: "k-2", existed: false, email: null };
    },
  });
  const out = await route.POST.run(
    post({ import_id: IMPORT, rows: [{ phone: "+16465550101" }, { phone: "+16465550102" }] }),
    refusing,
  );
  assert.deepEqual(out.skipped, [{ line: 1, reason: "That person asked to be forgotten." }]);
  assert.equal(out.added, 1);

  // A fault no row caused, with its own code: "permission denied" would be 42501, which this door spends on the erased.
  const broken = ctxFor({
    import_person: () => {
      throw Object.assign(new Error('relation "contacts" does not exist'), { code: "42P01" });
    },
  });
  const stopped = await route.POST.run(
    post({ import_id: IMPORT, rows: [{ phone: "+16465550101" }, { phone: "+16465550102" }] }),
    broken,
  );
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.failed.length, 1, "the first fault stops the part; nothing after it is tried");
});

test("a name reaches the door whole: the door keeps its first 80 characters, so an emoji at the edge is never split here", async () => {
  const calls = [];
  const ctx = ctxFor({
    import_person: (args) => {
      calls.push(args);
      return { contact_id: "k", existed: false, email: null };
    },
  });
  const name = `${"A".repeat(79)}🌸`;
  await route.POST.run(post({ import_id: IMPORT, rows: [{ name, phone: "+16465550101" }] }), ctx);
  assert.equal(calls[0].p_name, name);
});

test("more than fifty rows, or none, is refused before the door", async () => {
  const ctx = ctxFor({ import_person: () => ({ contact_id: "k", existed: false, email: null }) });
  await assert.rejects(route.POST.run(post({ import_id: IMPORT, rows: [] }), ctx), (e) => e.code === "validation");
  await assert.rejects(
    route.POST.run(
      post({
        import_id: IMPORT,
        rows: Array.from({ length: 51 }, (_, i) => ({ phone: `+1646555${String(i).padStart(4, "0")}` })),
      }),
      ctx,
    ),
    (e) => e.code === "validation",
  );
});
