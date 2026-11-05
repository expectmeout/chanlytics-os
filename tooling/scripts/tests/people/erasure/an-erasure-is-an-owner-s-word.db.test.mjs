/**
 * An erasure is an owner's word (decision 0036; 00501).
 *
 * erase_contact cannot be undone, so who may call it is the first thing it decides. 00501 let one more caller in: the
 * service role, for a person an owner's press blocked, so the erasure_finish job can finish what the press began
 * (erasure.integration.test.mjs holds its refusal, erasure-completeness.db.test.mjs its finish). Everyone else's
 * refusal was pinned only by reading the function's text (erasure.test.mjs), and no database suite called it as anyone
 * but an owner.
 *
 * So these do, with real sessions, and each caller is asked about two people: one nobody is erasing, and one whose
 * block is set, since the block is what opens the door to the system and must open it to nobody else. The owner comes
 * last and is let in, so a refusal here is the door's and not a broken person. Local stack only, and it leaves nothing
 * behind. The one call with no session goes through the CLI (SUPABASE_CLI names the binary), as the other rolled-back
 * blocks do: no session can carry a role that may run the function and no user.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and people"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

let db;
let A; // the person's workspace
let B; // another workspace
let owner; // A's owner
let stranger; // B's owner: an owner, of somewhere else
const seats = {}; // A's members who are not its owner, by role
let live; // nobody is erasing them
let blocked; // an owner's press blocked them, and the finish has not run
const users = [];

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

async function memberClient(role, tenant) {
  const email = `owner-word-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, userId: made.data.user.id };
}

const workspace = async (name) =>
  ok(
    await db
      .from("tenants")
      .insert({ slug: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name })
      .select("id")
      .single(),
  ).id;

const person = async (fields) =>
  ok(
    await db
      .from("contacts")
      .insert({ tenant_id: A, ...fields })
      .select("id")
      .single(),
  ).id;

const erase = (client, id) => client.rpc("erase_contact", { p_contact_id: id, p_legs: {} });

/** What the database says of a refused call: the two things a test holds it to. */
const said = (res) => {
  assert.equal(res.data, null, `answered, not refused: ${JSON.stringify(res.data)}`);
  return { code: res.error?.code, message: res.error?.message };
};

/** Both people as they stand, and every erasure on the ledger: what a refused caller must leave as it was. */
const everything = async () =>
  JSON.stringify({
    people: ok(
      await db
        .from("contacts")
        .select("id, display_name, erased_at, erasing_since")
        .in("id", [live, blocked])
        .order("id"),
    ),
    ledger: ok(await db.from("decisions").select("id").eq("tenant_id", A).eq("verb", "erase")),
  });

/**
 * What the function says to a role that may run it and has no user, in a transaction that never commits: the answer
 * goes out in the raise that rolls the block back, as hex (rolledBack in the database suites).
 */
function withNoUser(id) {
  const sql = `do $$ declare seen jsonb; begin
    begin
      perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
      set local role authenticated;
      perform public.erase_contact('${id}'::uuid, '{}'::jsonb);
      seen := '{"answered":true}';
    exception when others then
      seen := jsonb_build_object('code', sqlstate, 'message', sqlerrm);
    end;
    raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex');
  end $$`;
  const r = spawnSync(CLI, ["db", "query", "--local", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const out = [r.stdout, r.stderr]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(out);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${out.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await workspace("owner-word");
  B = await workspace("elsewhere");
  owner = await memberClient("owner", A);
  stranger = await memberClient("owner", B);
  for (const role of ["operator", "viewer", "partner"]) seats[role] = await memberClient(role, A);
  live = await person({ display_name: "Nobody Asked" });
  blocked = await person({ display_name: "Being Erased", erasing_since: new Date().toISOString() });
});

after(async () => {
  if (skip) return;
  for (const id of [A, B].filter(Boolean)) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("signed out, the grant refuses before the function runs", { skip }, async () => {
  const signedOut = createClient(URL_, ANON, { auth: { persistSession: false } });
  const before = await everything();
  for (const id of [live, blocked]) {
    const r = said(await erase(signedOut, id));
    assert.equal(r.code, "42501", JSON.stringify(r));
    assert.match(r.message, /permission denied for function erase_contact/);
  }
  assert.equal(await everything(), before);
});

test("past the grant, a caller with no user who is not the service role is refused by the function", { skip }, () => {
  // The guard behind the grant: what 00501 changed, and the one refusal no session can reach, so it needs this block.
  for (const id of [live, blocked]) {
    assert.deepEqual(withNoUser(id), { code: "28000", message: "Sign in required." });
  }
});

test("a member who is not the owner is refused, whatever their seat", { skip }, async () => {
  const before = await everything();
  for (const [role, seat] of Object.entries(seats)) {
    for (const id of [live, blocked]) {
      assert.deepEqual(
        said(await erase(seat.client, id)),
        { code: "42501", message: "Only an owner can erase a customer's data." },
        role,
      );
    }
  }
  assert.equal(await everything(), before);
});

test("an owner of another workspace is answered as if the person did not exist", { skip }, async () => {
  const before = await everything();
  const nobody = said(await erase(stranger.client, randomUUID()));
  assert.deepEqual(nobody, { code: "P0002", message: "Contact not found." });
  for (const id of [live, blocked]) assert.deepEqual(said(await erase(stranger.client, id)), nobody);
  assert.equal(await everything(), before);
});

test("the owner is let in, block or none, and the ledger says the owner erased them", { skip }, async () => {
  for (const id of [live, blocked]) {
    const done = ok(await erase(owner.client, id));
    assert.equal(done.already_erased, false);
    const row = ok(await db.from("contacts").select("display_name, erased_at").eq("id", id).single());
    assert.equal(row.display_name, null, "the tombstone holds no name");
    assert.ok(row.erased_at, "and says when");
    assert.deepEqual(
      ok(await db.from("decisions").select("actor_type, actor_user_id").eq("id", done.decision_id).single()),
      { actor_type: "user", actor_user_id: owner.userId },
    );
  }
});

/* ---- a press of many (people_erase_begin, 00547): one write, an owner's, however many it names ---- */

const begin = (client, ids, notAPerson = false) =>
  client.rpc("people_erase_begin", { p_tenant_id: A, p_contact_ids: ids, p_not_a_person: notAPerson });
const seeded = async (rows) =>
  ok(
    await db
      .from("contacts")
      .insert(rows.map((r) => ({ tenant_id: A, ...r })))
      .select("id"),
  ).map((r) => r.id);
const finishesOf = async (ids) =>
  ok(
    await db
      .from("jobs")
      .select("payload, due_at, state, lane, dedupe_key")
      .eq("tenant_id", A)
      .eq("kind", "erasure_finish")
      .in("payload->>contact_id", ids),
  );
const stamp = () => Math.random().toString(36).slice(2, 9);

test(
  "a press takes everyone named out of reach and onto the ledger, erases nobody, and comes due paced",
  { skip },
  async () => {
    const [one, two, three] = await seeded([
      { display_name: "Press one", email: `one-${stamp()}@notice.example.com`, phone_e164: "+15550100141" },
      { display_name: "Press two", email: `two-${stamp()}@notice.example.com` },
      { display_name: "Press three", phone_e164: "+15550100142" },
    ]);
    const elsewhere = ok(
      await db.from("contacts").insert({ tenant_id: B, display_name: "Another workspace's" }).select("id").single(),
    ).id;
    const answer = ok(await begin(owner.client, [three, one, randomUUID(), elsewhere, two, one]));
    assert.deepEqual(
      answer,
      { going: [three, one, two], no_address: [] },
      "each once, in the order named, and only ours",
    );

    const rows = ok(
      await db
        .from("contacts")
        .select("id, display_name, phone_e164, email, erased_at, erasing_since, erased_phone_hash, erased_email_hash")
        .in("id", [one, two, three]),
    );
    for (const r of rows) {
      assert.ok(r.erasing_since, "out of reach from now");
      assert.equal(r.erased_at, null, "and not erased: that is the job's");
      assert.ok(r.display_name, "nothing destroyed");
    }
    const row = (id) => rows.find((r) => r.id === id);
    const digests = ok(
      await db.rpc("erasure_digests", { p_tenant_id: A, p_values: [row(one).phone_e164, row(one).email] }),
    );
    assert.deepEqual(
      [row(one).erased_phone_hash, row(one).erased_email_hash],
      digests,
      "the digests beginErasure writes",
    );
    assert.equal(row(two).erased_phone_hash, null, "no number, no digest");
    assert.equal(
      ok(await db.from("contacts").select("erasing_since").eq("id", elsewhere).single()).erasing_since,
      null,
    );

    const finishes = await finishesOf([one, two, three]);
    assert.equal(finishes.length, 3, "one finish a person");
    for (const f of finishes) {
      assert.equal(f.state, "scheduled");
      assert.equal(f.payload.by, owner.userId, "on the word of who pressed");
      assert.equal(f.dedupe_key, `erasure_finish:${f.payload.contact_id}`, "the kind's key, as every writer gets it");
      assert.equal(f.lane, 1);
    }
    const due = (id) => Date.parse(finishes.find((f) => f.payload.contact_id === id).due_at);
    assert.equal(due(one) - due(three), 300, "paced, in the order named");
    assert.equal(due(two) - due(one), 300);
    ok(await db.from("contacts").delete().eq("id", elsewhere));
  },
);

test(
  "a press pressed again starts nothing, and moves no block; someone blocked with no finish gets one",
  { skip },
  async () => {
    const [p] = await seeded([{ display_name: "Pressed twice", email: `twice-${stamp()}@notice.example.com` }]);
    ok(await begin(owner.client, [p]));
    const blockedAt = ok(await db.from("contacts").select("erasing_since").eq("id", p).single()).erasing_since;
    assert.deepEqual(ok(await begin(owner.client, [p])), { going: [p], no_address: [] }, "said as going");
    assert.equal((await finishesOf([p])).length, 1, "their one finish stands");
    assert.equal(ok(await db.from("contacts").select("erasing_since").eq("id", p).single()).erasing_since, blockedAt);
    ok(await db.from("jobs").delete().eq("tenant_id", A).eq("kind", "erasure_finish").eq("payload->>contact_id", p));
    ok(await begin(owner.client, [p]));
    assert.equal((await finishesOf([p])).length, 1, "a stopped erasure pressed again goes back on the ledger");
  },
);

test(
  "the door is an owner's: every other seat, an owner elsewhere and nobody at all write nothing",
  { skip },
  async () => {
    const [p] = await seeded([{ display_name: "Not yours", email: `notyours-${stamp()}@notice.example.com` }]);
    for (const seat of Object.values(seats)) {
      const res = await begin(seat.client, [p]);
      assert.equal(res.error?.code, "42501", res.error?.message);
    }
    assert.equal((await begin(stranger.client, [p])).error?.code, "42501", "an owner, of somewhere else");
    const nobody = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    assert.ok((await begin(nobody, [p])).error, "no session may run it");
    assert.equal(ok(await db.from("contacts").select("erasing_since").eq("id", p).single()).erasing_since, null);
    assert.deepEqual(await finishesOf([p]), []);
  },
);

test(
  "Not a person: each address said automated in the same write, one line for the press; someone with no address stays",
  { skip },
  async () => {
    const alerts = `Alerts-${stamp()}@Notice.Example.com`;
    const shared = `shared-${stamp()}@notice.example.com`;
    const [a, phoneOnly, b] = await seeded([
      { display_name: "Alerts", email: alerts },
      { display_name: "A phone alone", phone_e164: "+15550100143" },
      { display_name: "Shared", email: shared },
    ]);
    const before = ok(
      await db.from("events").select("id").eq("tenant_id", A).eq("kind", "mailbox_connection.sender_sorted"),
    ).length;
    assert.deepEqual(ok(await begin(owner.client, [a, phoneOnly, b], true)), {
      going: [a, b],
      no_address: [phoneOnly],
    });
    const said = ok(
      await db
        .from("mailbox_senders")
        .select("sender, verdict, set_by")
        .eq("tenant_id", A)
        .in("sender", [alerts.toLowerCase(), shared]),
    );
    assert.equal(said.length, 2, "the address alone, lower-cased, as the single door says it");
    for (const s of said) assert.deepEqual([s.verdict, s.set_by], ["automated", owner.userId]);
    const events = ok(
      await db.from("events").select("data").eq("tenant_id", A).eq("kind", "mailbox_connection.sender_sorted"),
    );
    assert.equal(events.length, before + 1, "one line for the press");
    assert.ok(!JSON.stringify(events).includes("@"), "and no address in it");
    assert.equal(
      ok(await db.from("contacts").select("erasing_since").eq("id", phoneOnly).single()).erasing_since,
      null,
    );
    assert.deepEqual(await finishesOf([phoneOnly]), [], "who could not be said automated is not going");
  },
);

test(
  "REGRESSION: whoever is being erased has left People, so a reload does not bring them back; a stopped erasure shows again a day on (5 Nov 2026)",
  { skip },
  async () => {
    const [p] = await seeded([{ display_name: "Going", email: `going-${stamp()}@notice.example.com` }]);
    const listed = async () => ok(await owner.client.rpc("people_list", { p_tenant_id: A })).map((r) => r.id);
    assert.ok((await listed()).includes(p));
    ok(await begin(owner.client, [p]));
    assert.ok(!(await listed()).includes(p), "out of the list as the press answers");
    const byName = ok(await owner.client.rpc("people_list", { p_tenant_id: A, p_contact_id: p }));
    assert.equal(byName.length, 1, "their own page still reads their row");
    const dayAgo = new Date(Date.now() - 25 * 3_600_000).toISOString();
    ok(await db.from("contacts").update({ erasing_since: dayAgo }).eq("id", p));
    assert.ok((await listed()).includes(p), "still blocked a day on: shown again, to be pressed again");
  },
);

test(
  "REGRESSION: a press of two thousand is one statement, well inside a member's wait (5 Nov 2026: sixty a second would outrun it past 1,800)",
  { skip },
  async (t) => {
    const people = Array.from({ length: 2000 }, (_, i) => ({
      display_name: `Bulk ${i}`,
      email: `bulk-${i}-${stamp()}@notice.example.com`,
    }));
    const ids = [];
    for (let at = 0; at < people.length; at += 500) ids.push(...(await seeded(people.slice(at, at + 500))));
    const started = Date.now();
    const answer = ok(await begin(owner.client, ids));
    const ms = Date.now() - started;
    t.diagnostic(`people_erase_begin: ${ids.length} people in ${ms} ms`);
    assert.equal(answer.going.length, ids.length);
    assert.ok(ms < 8000, `a member's statement ends at 8 s by default; this took ${ms} ms`);
    const count = await db
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", A)
      .eq("kind", "erasure_finish")
      .eq("state", "scheduled");
    assert.ok(count.count >= ids.length, "one finish each");
  },
);
