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
import { fakeDb } from "../_fake-db.mjs";
import { asEventAndJson } from "../_log-lines.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
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
  // No digest travels (00263): the door makes its own, since only the database holds the pepper that keys it.
  assert.ok(
    calls.every((c) => !("p_phone_digest" in c) && !("p_email_digest" in c)),
    "the route computes no digest",
  );
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
  console.error = (...a) => said.push(asEventAndJson(a));
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
    tenant_id: A,
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

test("what a client file says beyond who the person is is kept as their before (decision 0073, R22): the dates and visits with the tool, the notes apart; a row with none asks nothing more", async () => {
  const before = [];
  const ctx = ctxFor({
    import_person: (args) => ({ contact_id: `k-${args.p_phone_e164}`, existed: false, email: null }),
    person_before_note: (args) => {
      before.push(args);
      return null;
    },
  });
  await route.POST.run(
    post({
      import_id: IMPORT,
      via: "vagaro",
      rows: [
        {
          name: "Ana Ruiz",
          phone: "+16465550101",
          facts: { last_visit: "2026-09-30", visits: 12, birthday: "--04-23", notes: "Likes the window seat" },
        },
        { name: "Dee", phone: "+16465550102", facts: { birthday: "1975-04-23" } },
        { name: "Eve", phone: "+16465550103" },
      ],
    }),
    ctx,
  );
  assert.deepEqual(
    before.map((b) => [b.p_tenant_id, b.p_contact_id, b.p_before, b.p_notes]),
    [
      [
        A,
        "k-+16465550101",
        { last_visit: "2026-09-30", visits: 12, birthday: "--04-23", via: "vagaro" },
        "Likes the window seat",
      ],
      [A, "k-+16465550102", { birthday: "1975-04-23", via: "vagaro" }, undefined],
    ],
    "kept on the person the door found or made; Eve's file said nothing more of her",
  );
});

test("a before the database will not keep keeps the person: counted as brought in, the refusal said in the log with no name", async () => {
  const said = [];
  const error = console.error;
  console.error = (...a) => said.push(asEventAndJson(a));
  let out;
  try {
    out = await route.POST.run(
      post({ import_id: IMPORT, rows: [{ phone: "+16465550101", facts: { visits: 3 } }] }),
      ctxFor({
        import_person: () => ({ contact_id: "k", existed: false, email: null }),
        person_before_note: () => {
          throw Object.assign(new Error("lock timeout"), { code: "55P03" });
        },
      }),
    );
  } finally {
    console.error = error;
  }
  assert.deepEqual([out.added, out.stopped, out.failed], [1, false, []]);
  assert.deepEqual(
    said.map(([event, json]) => [event, JSON.parse(json).step]),
    [["import_decision_failed", "before"]],
  );
});

test("the record of what was brought in counts the file once across its parts (R23): the first sets, each after adds, the last says done, a part that stopped says the file stopped; no part, no record", async () => {
  const notes = [];
  const rpcs = {
    import_person: (args) =>
      args.p_phone_e164 === "+16465550109"
        ? (() => {
            throw Object.assign(new Error("permission denied for function import_person"), { code: "42501" });
          })()
        : { contact_id: "k", existed: args.p_phone_e164 === "+16465550102", email: null },
    import_ledger_note: (a) => {
      notes.push(a);
      return null;
    },
  };
  const part = (n, of, rows) =>
    route.POST.run(post({ import_id: IMPORT, via: "booksy", part: { n, of }, rows }), ctxFor(rpcs));
  await part(1, 3, [{ phone: "+16465550101" }, { phone: "+16465550102" }, { name: "Nobody" }]);
  await part(2, 3, [{ phone: "+16465550103" }]);
  await part(3, 3, [{ phone: "+16465550104" }]);
  assert.deepEqual(
    notes.map((n) => [n.p_source, n.p_state, n.p_counts, n.p_add, n.p_parts_done, n.p_parts_total, n.p_via, n.p_error]),
    [
      ["clients_file", "running", { people: 2, unreadable: 1 }, false, 1, 3, "booksy", undefined],
      ["clients_file", "running", { people: 1, unreadable: 0 }, true, 2, 3, "booksy", undefined],
      ["clients_file", "done", { people: 1, unreadable: 0 }, true, 3, 3, "booksy", undefined],
    ],
  );
  notes.length = 0;
  await part(2, 4, [{ phone: "+16465550109" }]);
  assert.deepEqual(
    notes.map((n) => [n.p_state, n.p_parts_done, n.p_error]),
    [["failed", 2, "permission denied for function import_person"]],
    "the file stopped, in the door's own words",
  );
  notes.length = 0;
  await route.POST.run(post({ import_id: IMPORT, rows: [{ phone: "+16465550101" }] }), ctxFor(rpcs));
  assert.deepEqual(notes, [], "an older page that sends no part writes no record");
});

test("a file's facts are taken only as the door knows them: a key it does not, a date not a day, a visits count not a count, a tool's name not a word -- refused before the door", async () => {
  const ctx = ctxFor({ import_person: () => ({ contact_id: "k", existed: false, email: null }) });
  for (const [facts, via] of [
    [{ allergies: "nuts" }, undefined],
    [{ last_visit: "Sept 30" }, undefined],
    [{ visits: -1 }, undefined],
    [{ birthday: "04/23" }, undefined],
    [{ notes: "x".repeat(601) }, undefined],
    [{ visits: 2 }, "Vagaro Pro!"],
  ])
    await assert.rejects(
      route.POST.run(
        post({ import_id: IMPORT, ...(via ? { via } : {}), rows: [{ phone: "+16465550101", facts }] }),
        ctx,
      ),
      (e) => e.code === "validation",
      JSON.stringify([facts, via]),
    );
});
