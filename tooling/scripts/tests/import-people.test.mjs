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
const ctxFor = (rpcs, db = tables(), faults = {}) => ({
  supabase: fakeDb(db, faults, rpcs),
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
  // The door's two refusals of one row, each with its sentence: PE001 for a person who asked to be forgotten, 22023 for
  // a line it cannot take. Both are that row's own, so the row after them is still tried.
  const refusing = ctxFor({
    import_person: () => {
      n += 1;
      if (n === 1) throw Object.assign(new Error("That person asked to be forgotten."), { code: "PE001" });
      if (n === 2) throw Object.assign(new Error("A phone number in international form is needed."), { code: "22023" });
      return { contact_id: "k-3", existed: false, email: null };
    },
  });
  const out = await route.POST.run(
    post({
      import_id: IMPORT,
      rows: [{ phone: "+16465550101" }, { phone: "+16465550102" }, { phone: "+16465550103" }],
    }),
    refusing,
  );
  assert.deepEqual(out.skipped, [
    { line: 1, reason: "That person asked to be forgotten." },
    { line: 2, reason: "A phone number in international form is needed." },
  ]);
  assert.equal(out.added, 1);

  // A fault no row caused, and so every row would meet: the part stops at the first.
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

test("42501 is never a row's own: PostgREST says it when the grant is gone, a fault in every row, so the part stops", async () => {
  const denied = ctxFor({
    import_person: () => {
      throw Object.assign(new Error("permission denied for function import_person"), { code: "42501" });
    },
  });
  const out = await route.POST.run(
    post({ import_id: IMPORT, rows: [{ phone: "+16465550101" }, { phone: "+16465550102" }] }),
    denied,
  );
  assert.equal(out.stopped, true);
  assert.deepEqual(out.skipped, []);
  assert.equal(out.failed.length, 1);
});

test("a decision the ledger will not take never refuses people who are on file: the counts still answer, and the log says what was not recorded", async () => {
  const db = tables();
  const refused = 'new row for relation "decisions" violates check constraint "decisions_verb_check"';
  const ctx = ctxFor(
    { import_person: (args) => ({ contact_id: "k", existed: false, email: args.p_email ? "set" : null }) },
    db,
    { "decisions.insert": { message: refused, code: "23514" } },
  );
  const said = [];
  const error = console.error;
  console.error = (...a) => said.push(a);
  let out;
  try {
    out = await route.POST.run(
      post({
        import_id: IMPORT,
        rows: [{ phone: "+16465550101", email: "ana@example.com" }, { phone: "+16465550102" }, { name: "Nobody" }],
      }),
      ctx,
    );
  } finally {
    console.error = error;
  }
  // Every row went through the door before the ledger was asked: the rows are the act, and they answer as they are.
  assert.equal(out.added, 2);
  assert.equal(out.emails_set, 1);
  assert.equal(out.skipped.length, 1);
  assert.deepEqual(out.failed, []);
  assert.equal(out.stopped, false);
  assert.equal(db.decisions.length, 0, "the ledger took nothing");
  // The record that was not made is said once in the log, with the counts and the ledger's own sentence (recordDecision
  // throws `decision: <the database's words>`), and no name.
  assert.equal(said.length, 1);
  assert.equal(said[0][0], "import_decision_failed");
  assert.deepEqual(JSON.parse(said[0][1]), {
    tenant: A,
    import_id: IMPORT,
    added: 2,
    existed: 0,
    skipped: 1,
    failed: 0,
    error: `decision: ${refused}`,
  });
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
