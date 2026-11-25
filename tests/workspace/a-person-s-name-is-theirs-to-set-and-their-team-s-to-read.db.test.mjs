/**
 * A person's name is theirs to set and their team's to read (00068, the profiles table; the roster as 00261 wrote it).
 *
 * One row per account, written only through its owner's door (profile_set: trimmed, at most 80 characters, empty clears
 * it), read by the person and by the members of any workspace they share, and by nobody else; the roster a member reads
 * carries the name. Run on the replayed database as the people themselves, in place of the pins on 00068's text
 * (workspace/identity.test.mjs until 25 Nov 2026).
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
      ? "refusing a database that is not on this machine: this suite makes users and workspaces"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

let db;
const made = { users: [], tenants: [] };
const RUN = Date.now().toString(36);
let serial = 0;

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});
after(async () => {
  if (skip) return;
  for (const id of made.tenants) await db.from("tenants").delete().eq("id", id);
  for (const id of made.users) await db.auth.admin.deleteUser(id).catch(() => undefined);
});

/** A real account, made with the admin API. */
async function person(tag) {
  const email = `profile-${tag}-${++serial}-${RUN}@example.com`;
  const password = `pw-${RUN}-${serial}-Aa1!`;
  const u = ok(await db.auth.admin.createUser({ email, password, email_confirm: true }), "user").user;
  made.users.push(u.id);
  return { id: u.id, email, password };
}

/** A workspace with the people given, each in the role beside them. */
async function workspace(tag, seats) {
  const t = ok(
    await db
      .from("tenants")
      .insert({ name: `Profile ${tag}`, slug: `profile-${tag}-${++serial}-${RUN}` })
      .select("id")
      .single(),
    "tenant",
  ).id;
  made.tenants.push(t);
  for (const [who, role] of seats)
    ok(await db.from("memberships").insert({ tenant_id: t, user_id: who.id, role }), "membership");
  return t;
}

/** A signed-in session for someone, as the dashboard's own client is. */
async function session(who) {
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email: who.email, password: who.password });
  assert.equal(s.error, null, s.error?.message);
  return client;
}

/** The names a session may read of these people, by id. */
const namesSeen = async (client, ids) =>
  Object.fromEntries(
    ok(await client.from("profiles").select("user_id, display_name").in("user_id", ids), "profiles").map((p) => [
      p.user_id,
      p.display_name,
    ]),
  );

test(
  "a person names themself through the one door: trimmed, at most 80 characters, empty clears it; nothing else writes the row",
  { skip },
  async () => {
    const ada = await person("ada");
    await workspace("door", [[ada, "owner"]]);
    const as = await session(ada);

    assert.deepEqual(ok(await as.rpc("profile_set", { p_display_name: "  Ada Lovelace  " }), "set"), {
      display_name: "Ada Lovelace",
    });
    assert.deepEqual(await namesSeen(as, [ada.id]), { [ada.id]: "Ada Lovelace" }, "one row, hers, as she named it");
    ok(await as.rpc("profile_set", { p_display_name: "Ada" }), "set again");
    assert.deepEqual(await namesSeen(as, [ada.id]), { [ada.id]: "Ada" }, "set again, the same row");

    const long = await as.rpc("profile_set", { p_display_name: "x".repeat(81) });
    assert.equal(long.error?.code, "22023", "a name of 81 characters is refused in its words");
    assert.deepEqual(await namesSeen(as, [ada.id]), { [ada.id]: "Ada" }, "and changes nothing");

    // The door is the only write: the session holds no grant to insert or update the table itself.
    const direct = await as.from("profiles").update({ display_name: "Someone else" }).eq("user_id", ada.id).select();
    assert.ok(direct.error, "REGRESSION: a session wrote its profile past the door");
    assert.equal(direct.error.code, "42501");
    const added = await as.from("profiles").insert({ user_id: ada.id, display_name: "Twice" });
    assert.equal(added.error?.code, "42501", "nor adds a row");
    assert.deepEqual(await namesSeen(as, [ada.id]), { [ada.id]: "Ada" });

    // Nobody signed in may call it at all.
    const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const nobody = await anon.rpc("profile_set", { p_display_name: "Nobody" });
    assert.ok(nobody.error, "REGRESSION: the anon key named somebody");

    ok(await as.rpc("profile_set", { p_display_name: "" }), "cleared");
    assert.deepEqual(await namesSeen(as, [ada.id]), { [ada.id]: "" }, "empty clears it");
  },
);

test(
  "a teammate reads the name, and the roster carries it; someone who shares no workspace reads neither",
  { skip },
  async () => {
    const ada = await person("named");
    const ben = await person("teammate");
    const cy = await person("stranger");
    const t = await workspace("team", [
      [ada, "owner"],
      [ben, "operator"],
    ]);
    await workspace("elsewhere", [[cy, "owner"]]);
    ok(await (await session(ada)).rpc("profile_set", { p_display_name: "Ada Lovelace" }), "set");

    const teammate = await session(ben);
    assert.deepEqual(await namesSeen(teammate, [ada.id]), { [ada.id]: "Ada Lovelace" }, "the people she works with");
    const roster = ok(await teammate.rpc("team_roster", { p_tenant_id: t }), "roster");
    assert.deepEqual(
      roster.map((r) => [r.member_user_id, r.role, r.display_name]).sort(),
      [
        [ada.id, "owner", "Ada Lovelace"],
        [ben.id, "operator", ""],
      ].sort(),
      "the roster carries each name, and an empty one where none was given",
    );

    const stranger = await session(cy);
    assert.deepEqual(await namesSeen(stranger, [ada.id, ben.id]), {}, "REGRESSION: a name read across workspaces");
    const theirs = await stranger.rpc("team_roster", { p_tenant_id: t });
    assert.equal(theirs.error?.code, "42501", "and the roster is refused to anyone who is not a member");
  },
);

test(
  "the platform finds an account by its address whatever its case, a confirmed one only; no session may ask",
  { skip },
  async () => {
    // It answers "does this address have an account", an oracle: the service role's alone since 00121, asked by the
    // invite route after its own owner check. A case mismatch would read a known account as new, and the invite would
    // fail on send.
    const ada = await person("lookup");
    const t = await workspace("lookup", [[ada, "owner"]]);
    const found = ok(
      await db.rpc("lookup_user_for_invite", { p_tenant_id: t, p_email: `  ${ada.email.toUpperCase()} ` }),
      "lookup",
    );
    assert.equal(found, ada.id, "the same address, whatever its case and its spaces");
    const unopened = `profile-unopened-${RUN}@example.com`;
    const made_ = ok(await db.auth.admin.createUser({ email: unopened, email_confirm: false }), "unconfirmed").user;
    made.users.push(made_.id);
    assert.equal(
      ok(await db.rpc("lookup_user_for_invite", { p_tenant_id: t, p_email: unopened }), "lookup"),
      null,
      "an account nobody has opened is not one to seat without asking",
    );
    const asked = await (await session(ada)).rpc("lookup_user_for_invite", { p_tenant_id: t, p_email: ada.email });
    assert.ok(asked.error, "REGRESSION: a signed-in owner asked the platform's oracle");
  },
);
