/**
 * The doubt queue, on a real database (00344, decision 0034 step 4).
 *
 * resolve_person never merges: when an arrival's name or address names another living record the merge could join, it
 * writes the pair on person_doubts, once. What settles a doubt is proved here, since it is triggers, grants and a
 * definer door: "not the same" through person_doubt_dismiss, by any acting member and nobody else, once however often
 * it is pressed, and never raised again by the next arrival; the merge (0028's door, 00326) settles the pair's own row
 * and carries the merged record's other doubts to the kept one; an erasure takes every doubt naming the person; and a
 * pair the merge joined cannot be dismissed. Skipped without a local database and SUPABASE_ANON_KEY (the dismiss door
 * asks who is calling); never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and customers"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the door asks who is calling, and a session needs it"
        : false;

const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let db;
let A; // the workspace
let B; // another workspace
let owner;
let operator;
let stranger;
let anon;
const users = [];
let serial = 0;
/** A made-up number (555-01xx) and a made-up address, fresh in this run. */
const phone = () => `+1646555${String(1100 + ++serial).slice(-4)}`;
const address = () => `doubt-${++serial}-${RUN}@example.com`;

async function session(label, tenantId, role) {
  const email = `doubt-${label}-${RUN}@example.com`;
  const password = `pw-${RUN}-${label}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  if (tenantId) ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, id: made.data.user.id };
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const workspace = async (tag) =>
    ok(
      await db
        .from("tenants")
        .insert({ slug: `doubt-${tag}-${RUN}`, name: `Doubt ${tag}` })
        .select("id")
        .single(),
    ).id;
  A = await workspace("a");
  B = await workspace("b");
  owner = await session("owner", A, "owner");
  operator = await session("operator", A, "operator");
  stranger = await session("stranger", B, "owner");
  anon = createClient(URL_, ANON, { auth: { persistSession: false } });
});

after(async () => {
  if (skip || !A) return;
  for (const t of [A, B]) {
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/** The door, as the service role calls it: a member's word (asserted, an import) unless said otherwise. */
const resolved = async (args) =>
  ok(
    await db.rpc("resolve_person", { p_tenant_id: A, p_assurance: "asserted", p_source: "import", ...args }),
    `resolve_person ${JSON.stringify(args)}`,
  );
/** Every doubt naming a record, either way round, oldest first; the service role reads them all. */
const doubtsOf = async (id, tenant = A) =>
  ok(
    await db
      .from("person_doubts")
      .select("id, contact_id, other_id, seen, settled_as, settled_by")
      .eq("tenant_id", tenant)
      .or(`contact_id.eq.${id},other_id.eq.${id}`)
      .order("created_at"),
    "doubts",
  );
const pair = (a, b) => (a < b ? [a, b] : [b, a]);
const dismiss = (who, id) => who.rpc("person_doubt_dismiss", { p_doubt_id: id });

/**
 * The pair the door doubts: a record known by address alone, another known by number alone, then the number arriving
 * with that address. The number is matched first, the address stays the first record's (taken), and the two, with one
 * number and one address between them, are a pair the merge could join.
 */
async function doubtedPair() {
  const email = address();
  const number = phone();
  const a = await resolved({ p_email: email, p_name: `Known By Address ${serial}` });
  const made = await resolved({ p_phone: number });
  const b = await resolved({ p_phone: number, p_email: email });
  assert.deepEqual(
    [b.contact_id, b.matched_by, b.email, b.doubt, b.doubt_seen],
    [made.contact_id, "phone", "taken", a.contact_id, "email"],
  );
  assert.ok(b.doubt_id);
  return { a: a.contact_id, b: b.contact_id, email, number, doubtId: b.doubt_id };
}

test("the queue is a member's to read, and only the door's and the settlements' to write", { skip }, async () => {
  const { a, b, doubtId } = await doubtedPair();
  const seen = ok(await owner.client.from("person_doubts").select("id, contact_id, other_id, seen").eq("id", doubtId));
  assert.deepEqual(seen, [{ id: doubtId, contact_id: pair(a, b)[0], other_id: pair(a, b)[1], seen: "email" }]);
  assert.deepEqual(
    ok(await stranger.client.from("person_doubts").select("id").eq("id", doubtId)),
    [],
    "another workspace's owner sees nothing of it",
  );
  const written = await owner.client
    .from("person_doubts")
    .update({ settled_as: "not_the_same", settled_at: new Date().toISOString() })
    .eq("id", doubtId)
    .select("id");
  assert.ok(written.error || (written.data ?? []).length === 0, "a member cannot settle it by hand");
  assert.ok((await owner.client.from("person_doubts").delete().eq("id", doubtId).select("id")).data?.length !== 1);
  assert.equal((await doubtsOf(a))[0].settled_as, null, "still open");
});

test(
  "not the same: an operator settles the pair once, the owner may too, nobody else; the next arrival does not raise it again",
  { skip },
  async () => {
    const { a, b, email, number, doubtId } = await doubtedPair();
    assert.equal((await anon.rpc("person_doubt_dismiss", { p_doubt_id: doubtId })).error?.code, "42501", "signed out");
    assert.equal(
      (await dismiss(stranger.client, doubtId)).error?.code,
      "P0002",
      "another workspace's owner: not found",
    );
    assert.equal((await dismiss(owner.client, crypto.randomUUID())).error?.code, "P0002", "a doubt that is not there");
    const first = ok(await dismiss(operator.client, doubtId), "operator");
    assert.deepEqual(
      [first.doubt_id, first.contact_id, first.other_id, first.settled_as],
      [doubtId, ...pair(a, b), "not_the_same"],
    );
    const [row] = await doubtsOf(a);
    assert.deepEqual([row.settled_as, row.settled_by], ["not_the_same", operator.id], "settled, by whom");
    const again = ok(await dismiss(owner.client, doubtId), "twice");
    assert.deepEqual([again.settled_as, again.settled_at], ["not_the_same", first.settled_at], "twice is once");
    // The same arrival, again: the pair is still named in the answer, and the queue is not reopened.
    const next = await resolved({ p_phone: number, p_email: email, p_source: "calendar", p_assurance: "found" });
    assert.deepEqual(
      [next.contact_id, next.email, next.doubt, next.doubt_seen, next.doubt_id],
      [b, "taken", a, "email", null],
      "named in the answer, and no new row",
    );
    assert.deepEqual(
      (await doubtsOf(a)).map((d) => [d.contact_id, d.other_id, d.settled_as]),
      [[...pair(a, b), "not_the_same"]],
      "the one row, still settled",
    );
    const back = await resolved({ p_email: email });
    assert.equal(back.contact_id, a, "the address alone is still the person whose address it is");
  },
);

test(
  "the merge settles the pair's own doubt and carries the merged record's other doubts to the kept one; a merged pair cannot be dismissed",
  { skip },
  async () => {
    const { a, b, doubtId } = await doubtedPair();
    // A third record with the first's name: a doubt beside the first, by name.
    const [{ display_name }] = ok(await db.from("contacts").select("display_name").eq("id", a));
    const c = await resolved({ p_name: display_name, p_source: "lead", p_assurance: "found" });
    assert.deepEqual([c.outcome, c.doubt, c.doubt_seen], ["new", a, "name"]);
    // The owner keeps the number's record and merges the address's into it (0028: no two numbers, no two addresses).
    ok(await owner.client.rpc("merge_people", { p_keep: b, p_merge: a }), "merge");
    const ofB = await doubtsOf(b);
    assert.deepEqual(
      ofB.map((d) => [d.contact_id, d.other_id, d.seen, d.settled_as, d.settled_by]).sort(),
      [
        [...pair(a, b), "email", "merged", owner.id],
        [...pair(b, c.contact_id), "name", null, null],
      ].sort(),
      "the pair settled as merged by the owner; the third record's doubt is the kept record's now",
    );
    assert.deepEqual(
      (await doubtsOf(a)).map((d) => d.id),
      [doubtId],
      "nothing open names the merged record any more",
    );
    const refused = await dismiss(owner.client, doubtId);
    assert.deepEqual(
      [refused.error?.code, refused.error?.message],
      ["22023", "These two records were merged already."],
    );
    // The kept record already holding a pair with a third record: the merged record's copy of it is dropped, not doubled.
    const named = `Twice Doubted ${++serial}`;
    const d = await resolved({ p_email: address(), p_name: named });
    const e = await resolved({ p_name: named, p_source: "lead", p_assurance: "found" });
    assert.deepEqual([e.doubt, e.doubt_seen], [d.contact_id, "name"]);
    const number = phone();
    const made = await resolved({ p_phone: number });
    const dEmail = ok(await db.from("contacts").select("email").eq("id", d.contact_id).single(), "d").email;
    const f = await resolved({ p_phone: number, p_email: dEmail });
    assert.deepEqual([f.contact_id, f.doubt, f.doubt_seen], [made.contact_id, d.contact_id, "email"]);
    const [lo, hi] = pair(f.contact_id, e.contact_id);
    ok(
      await db.from("person_doubts").insert({ tenant_id: A, contact_id: lo, other_id: hi, seen: "name" }),
      "kept pair",
    );
    ok(await owner.client.rpc("merge_people", { p_keep: f.contact_id, p_merge: d.contact_id }), "merge d into f");
    assert.deepEqual(
      (await doubtsOf(e.contact_id)).map((x) => [x.contact_id, x.other_id, x.settled_as]),
      [[lo, hi, null]],
      "one row for the kept record and the third, not two",
    );
  },
);

test("an erasure takes every doubt that names the person", { skip }, async () => {
  const { a, b } = await doubtedPair();
  assert.equal((await doubtsOf(a)).length, 1);
  // The erasure's own door marks the row; its trigger legs run, this one among them.
  const erased = await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", a).select("id");
  assert.equal(erased.error, null, erased.error?.message);
  assert.deepEqual(await doubtsOf(a), [], "gone with the person");
  assert.deepEqual(await doubtsOf(b), [], "and from the other side");
});
