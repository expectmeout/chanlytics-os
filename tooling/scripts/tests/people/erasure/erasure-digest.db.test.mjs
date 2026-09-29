/**
 * The erasure digest keyed with a secret the database alone holds (00249), on a real Postgres. Before the re-key every
 * digest is the legacy sha256 contracts computes, so nothing that exists changes meaning; the keyed digest is 'h1:'
 * and an hmac of the legacy one with Vault's pepper, which no table carries; the re-key keys a workspace's stored
 * digests -- contacts, the never-again list, a reply's undo lists -- once, and a second run changes nothing; and
 * import_person reads the database's own digest, whatever it was handed. Runs against the stack `supabase start`
 * builds, never production. The re-key here is kept to this suite's workspace: the mark that switches every digest to
 * keyed is the whole database's, and the suites running beside this one read legacy digests. What the mark changes is
 * read inside one transaction that never commits, through the CLI (SUPABASE_CLI names the binary when `supabase` is
 * not on PATH), as sweep-registry.db.test.mjs turns a clock.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { legacyErasedEmailHash, legacyErasedPhoneHash } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
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
/**
 * A transaction on this machine's database that never commits: `body` runs inside a DO block that ends by raising what
 * it put in `seen`, as hex, so the mark it sets is never seen by the suites beside this one.
 */
function rolledBack(body) {
  const sql = `do $ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $`;
  const r = spawnSync(CLI, ["db", "query", "--local", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [r.stdout, r.stderr]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}
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
    const legacy = await legacyErasedPhoneHash(t, PHONE);
    assert.equal(
      ok(await db.rpc("erasure_digest", { p_tenant_id: t, p_value: PHONE })),
      legacy,
      "legacy until the re-key",
    );
    assert.deepEqual(
      ok(await db.rpc("erasure_digests", { p_tenant_id: t, p_values: [PHONE, EMAIL, PHONE] })),
      [legacy, await legacyErasedEmailHash(t, EMAIL), legacy],
      "in order, one per value",
    );
    const keyed = ok(await db.rpc("erasure_key", { p_digest: legacy }));
    assert.match(keyed, /^h1:[0-9a-f]{64}$/);
    assert.equal(ok(await db.rpc("erasure_key", { p_digest: legacy })), keyed, "deterministic");
    assert.equal(ok(await db.rpc("erasure_key", { p_digest: keyed })), keyed, "a keyed digest is answered as it is");
    assert.notEqual(keyed.slice(3), legacy, "not the legacy digest dressed up");
    const other = await workspace("other");
    assert.notEqual(
      ok(await db.rpc("erasure_key", { p_digest: await legacyErasedPhoneHash(other, PHONE) })),
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
    const phone = await legacyErasedPhoneHash(t, PHONE);
    const email = await legacyErasedEmailHash(t, EMAIL);
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
    const list = [
      { kind: "email", hash: "legacydigest1" },
      { kind: "domain", hash: "h1:already" },
      { kind: "email" },
      { kind: "email", hash: null },
    ];
    const keyed = ok(await db.rpc("erasure_rekey_hashes", { p_list: list }));
    assert.equal(keyed.length, 4);
    assert.equal(keyed[0].hash, ok(await db.rpc("erasure_key", { p_digest: "legacydigest1" })));
    assert.deepEqual(keyed[1], list[1], "a keyed hash as it was");
    assert.deepEqual(keyed[2], list[2], "an element with no hash as it was");
    assert.deepEqual(keyed[3], list[3], "and one whose hash is null");
    assert.equal(ok(await db.rpc("erasure_rekey_hashes", { p_list: null })), null);
  },
);

test(
  "once the database is marked keyed, every digest it makes is keyed, a legacy one that still arrives is keyed where it lands, and a legacy row beside its keyed twin goes, the twin keeping the stronger reason",
  { skip },
  () => {
    const seen = rolledBack(`
      declare
        t uuid;
        legacy_phone text;
        legacy_email text;
        supp jsonb;
      begin
        insert into public.tenants (slug, name) values ('digest-mark-' || gen_random_uuid(), 'Mark') returning id into t;
        legacy_phone := public.erasure_digest_legacy(t, '${PHONE}');
        legacy_email := public.erasure_digest_legacy(t, '${EMAIL}');
        -- Written before the mark: a legacy row, as every row then is.
        insert into public.lead_suppressions (tenant_id, kind, hash, what) values (t, 'email', legacy_email, 'erased');
        update public.erasure_keying set keyed_at = now() where id;
        -- After it: a writer that still hands a legacy digest.
        insert into public.contacts (tenant_id, erased_at, erased_phone_hash, erased_email_hash)
          values (t, now(), legacy_phone, legacy_email);
        insert into public.lead_suppressions (tenant_id, kind, hash, what) values (t, 'phone', legacy_phone, 'customer');
        -- The same address suppressed again after the mark: its keyed twin, beside the legacy row.
        insert into public.lead_suppressions (tenant_id, kind, hash, what) values (t, 'email', legacy_email, 'email_opt_out');
        seen := jsonb_build_object(
          'digest', public.erasure_digest(t, '${PHONE}'),
          'keyed_phone', public.erasure_key(legacy_phone),
          'keyed_email', public.erasure_key(legacy_email),
          'contact', (select to_jsonb(c) from (select erased_phone_hash, erased_email_hash from public.contacts where tenant_id = t) c),
          'phone_row', (select hash from public.lead_suppressions where tenant_id = t and kind = 'phone'),
          'email_rows_before', (select count(*) from public.lead_suppressions where tenant_id = t and kind = 'email'));
        perform public.erasure_rekey(true, t);
        select jsonb_agg(jsonb_build_object('hash', hash, 'what', what)) into supp
          from public.lead_suppressions where tenant_id = t and kind = 'email';
        seen := seen || jsonb_build_object('email_rows_after', supp);
      end;
    `);
    assert.equal(seen.digest, seen.keyed_phone, "the digest the database makes is keyed once it is marked");
    assert.deepEqual(
      seen.contact,
      { erased_phone_hash: seen.keyed_phone, erased_email_hash: seen.keyed_email },
      "a legacy digest written to a contact is keyed where it lands",
    );
    assert.equal(seen.phone_row, seen.keyed_phone, "and one written to the never-again list");
    assert.equal(seen.email_rows_before, 2, "the legacy row and its keyed twin, side by side");
    assert.deepEqual(
      seen.email_rows_after,
      [{ hash: seen.keyed_email, what: "erased" }],
      "one row left, keyed, keeping the erasure",
    );
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
        erased_phone_hash: await legacyErasedPhoneHash(t, PHONE),
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
