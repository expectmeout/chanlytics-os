/**
 * The erasure digest keyed with a secret the database alone holds (00249), on a real Postgres. Before the re-key every
 * digest is the legacy sha256 contracts computes, so nothing that exists changes meaning; the keyed digest is 'h1:'
 * and an hmac of the legacy one with Vault's pepper, which no table carries; the re-key keys a workspace's stored
 * digests -- contacts, the never-again list, a reply's undo lists -- once, and a second run changes nothing; and
 * import_person reads the database's own digest, whatever it was handed. Runs against the stack `supabase start`
 * builds, never production. The re-key here is kept to this suite's workspace: the mark that switches every digest to
 * keyed is the whole database's, and the suites running beside this one read legacy digests.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { erasedEmailHash, erasedPhoneHash } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine"
      : false;

let db;
const made = { tenants: [], users: [] };
const RUN = Date.now().toString(36);
const ok = (r, what = "call") => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const PHONE = "+16465550177";
const EMAIL = "gone@example.com";

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});
after(async () => {
  if (skip) return;
  for (const id of made.tenants) await db.from("tenants").delete().eq("id", id);
  for (const id of made.users) await db.auth.admin.deleteUser(id).catch(() => undefined);
});

async function workspace(tag) {
  const t = ok(
    await db
      .from("tenants")
      .insert({ name: `Digest ${tag}`, slug: `digest-${tag}-${RUN}` })
      .select("id")
      .single(),
    "tenant",
  ).id;
  made.tenants.push(t);
  return t;
}

test(
  "before the re-key a digest is exactly what it was; the keyed one is the pepper's, deterministic, and never the legacy one",
  { skip },
  async () => {
    const t = await workspace("made");
    const legacy = await erasedPhoneHash(t, PHONE);
    assert.equal(
      ok(await db.rpc("erasure_digest", { p_tenant_id: t, p_value: PHONE })),
      legacy,
      "legacy until the re-key",
    );
    assert.deepEqual(
      ok(await db.rpc("erasure_digests", { p_tenant_id: t, p_values: [PHONE, EMAIL, PHONE] })),
      [legacy, await erasedEmailHash(t, EMAIL), legacy],
      "in order, one per value",
    );
    const keyed = ok(await db.rpc("erasure_key", { p_digest: legacy }));
    assert.match(keyed, /^h1:[0-9a-f]{64}$/);
    assert.equal(ok(await db.rpc("erasure_key", { p_digest: legacy })), keyed, "deterministic");
    assert.equal(ok(await db.rpc("erasure_key", { p_digest: keyed })), keyed, "a keyed digest is answered as it is");
    assert.notEqual(keyed.slice(3), legacy, "not the legacy digest dressed up");
    const other = await workspace("other");
    assert.notEqual(
      ok(await db.rpc("erasure_key", { p_digest: await erasedPhoneHash(other, PHONE) })),
      keyed,
      "still tenant-keyed underneath",
    );
    // The pepper is Vault's: no table a dump carries holds it, and no session may ask for a digest.
    if (ANON) {
      const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
      const refused = await anon.rpc("erasure_digest", { p_tenant_id: t, p_value: PHONE });
      assert.ok(refused.error, "anon may not ask");
    }
  },
);

test(
  "the re-key keys a workspace's stored digests once -- contacts, the never-again list, a reply's undo lists -- and a second run changes nothing",
  { skip },
  async () => {
    const t = await workspace("rekey");
    const phone = await erasedPhoneHash(t, PHONE);
    const email = await erasedEmailHash(t, EMAIL);
    ok(
      await db.from("contacts").insert({
        tenant_id: t,
        erased_at: new Date().toISOString(),
        erased_phone_hash: phone,
        erased_email_hash: email,
      }),
      "an erased contact",
    );
    ok(
      await db.from("lead_suppressions").insert({ tenant_id: t, kind: "phone", hash: phone, what: "erased" }),
      "a hold",
    );

    const counted = ok(await db.rpc("erasure_rekey", { p_apply: false, p_tenant_id: t }));
    assert.deepEqual(
      [counted.applied, counted.contacts_phone, counted.contacts_email, counted.lead_suppressions],
      [false, 1, 1, 1],
      "the dry run counts and writes nothing",
    );
    const [still] = ok(await db.from("contacts").select("erased_phone_hash").eq("tenant_id", t));
    assert.equal(still.erased_phone_hash, phone);

    ok(await db.rpc("erasure_rekey", { p_apply: true, p_tenant_id: t }));
    const keyed = ok(await db.rpc("erasure_key", { p_digest: phone }));
    const [c] = ok(await db.from("contacts").select("erased_phone_hash, erased_email_hash").eq("tenant_id", t));
    assert.equal(c.erased_phone_hash, keyed);
    assert.equal(c.erased_email_hash, ok(await db.rpc("erasure_key", { p_digest: email })));
    const [s] = ok(await db.from("lead_suppressions").select("hash").eq("tenant_id", t));
    assert.equal(s.hash, keyed, "the hold and the contact still agree, both keyed");

    const again = ok(await db.rpc("erasure_rekey", { p_apply: true, p_tenant_id: t }));
    assert.deepEqual(
      [again.contacts_phone, again.contacts_email, again.lead_suppressions, again.reach_out_replies],
      [0, 0, 0, 0],
      "nothing left to key: a second run changes nothing",
    );
    const [same] = ok(await db.from("contacts").select("erased_phone_hash").eq("tenant_id", t));
    assert.equal(same.erased_phone_hash, keyed);
    const mark = ok(await db.from("erasure_keying").select("keyed_at"));
    assert.ok(
      mark.every((m) => m.keyed_at === null),
      "a run kept to one workspace never marks the database keyed",
    );
  },
);

test(
  "a reply's undo lists are keyed where they stand, and the rest of its plan is left as it was",
  { skip },
  async () => {
    const list = [{ kind: "email", hash: "legacydigest1" }, { kind: "domain", hash: "h1:already" }, { kind: "email" }];
    const keyed = ok(await db.rpc("erasure_rekey_hashes", { p_list: list }));
    assert.equal(keyed.length, 3);
    assert.equal(keyed[0].hash, ok(await db.rpc("erasure_key", { p_digest: "legacydigest1" })));
    assert.deepEqual(keyed[1], list[1], "a keyed hash as it was");
    assert.deepEqual(keyed[2], list[2], "an element with no hash as it was");
    assert.equal(ok(await db.rpc("erasure_rekey_hashes", { p_list: null })), null);
  },
);

test(
  "import_person refuses an erased person by the database's own digest, whatever digest it was handed",
  { skip },
  async () => {
    if (!ANON) return;
    const t = await workspace("import");
    ok(
      await db.from("contacts").insert({
        tenant_id: t,
        erased_at: new Date().toISOString(),
        erased_phone_hash: await erasedPhoneHash(t, PHONE),
      }),
      "an erased contact",
    );
    const email = `digest-owner-${RUN}@example.com`;
    const u = ok(
      await db.auth.admin.createUser({ email, password: "digest-test-password-1", email_confirm: true }),
    ).user;
    made.users.push(u.id);
    ok(await db.from("memberships").insert({ user_id: u.id, tenant_id: t, role: "owner" }), "owner");
    const session = createClient(URL_, ANON, { auth: { persistSession: false } });
    ok(await session.auth.signInWithPassword({ email, password: "digest-test-password-1" }), "sign in");
    for (const handed of [undefined, "not-the-digest"]) {
      const r = await session.rpc("import_person", {
        p_tenant_id: t,
        p_name: "Gone",
        p_phone_e164: PHONE,
        p_email: "",
        ...(handed ? { p_phone_digest: handed } : {}),
      });
      assert.equal(r.error?.code, "PE001", `refused as forgotten, the digest handed being ${handed ?? "none"}`);
    }
  },
);
