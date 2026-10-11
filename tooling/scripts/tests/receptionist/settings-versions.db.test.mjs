/**
 * A settings change keeps what the settings said (00360; decision 0039, step 3), on the database, with a real session:
 * the version is the database's (a config that changed takes the next number whatever its writer sent, and a number
 * never goes back), every version is kept in the save's own transaction with who brought it, the version before is
 * marked replaced, nobody signed in reads the record, and the clock, run with its DEFAULT, takes a version 400 days
 * after it was replaced and never the one in force. The save is the product's own (packages/db putTenantConfig), on
 * an owner's session, so the trigger is proved under the row policy and the column grants a real save meets.
 *
 * Runs against the local stack `supabase start` builds, never production: it makes a workspace, a user and rows.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { RETENTION_DAYS } from "@chanlytics/contracts";
import { putTenantConfig } from "@chanlytics/db";
import { ROOT } from "../_source.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes a workspace and rows, and runs a purge"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the owner this suite signs in as needs it"
        : false;

const stamp = Date.now().toString(36);
const ago = (days) => new Date(Date.now() - days * 86_400_000).toISOString();
const HOURS = {
  brain: { business_name: "Example Studio", profile: { hours: { tue: { open: "09:00", close: "18:00" } } } },
};
const LATER = {
  brain: { business_name: "Example Studio", profile: { hours: { tue: { open: "09:00", close: "19:00" } } } },
};

let db;
let A;
let owner;
let ownerId;

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const versions = async () =>
  ok(await db.from("tenant_config_versions").select("*").eq("tenant_id", A).order("version"), "versions");
const row = async () =>
  ok(await db.from("tenant_config").select("version, config, updated_by").eq("tenant_id", A).single(), "the row");

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `settings-versions-${stamp}`, name: "Settings" })
      .select("id")
      .single(),
    "workspace",
  ).id;
  const email = `settings-owner-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  ownerId = made.data.user.id;
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: ownerId, role: "owner" }), "seat");
  owner = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await owner.auth.signInWithPassword({ email, password }), "sign in");
});

after(async () => {
  if (skip) return;
  if (A) await db.from("tenants").delete().eq("id", A);
  if (ownerId) await db.auth.admin.deleteUser(ownerId).catch(() => {});
});

test("a workspace's settings are kept from the day it is made: its first version, in force", { skip }, async () => {
  const [first, ...rest] = await versions();
  assert.deepEqual(rest, []);
  assert.deepEqual([first.version, first.config, first.replaced_at, first.changed_by], [1, {}, null, null]);
  assert.equal((await row()).version, 1);
});

test(
  "an owner's save takes the next version, keeps the settings as they now stand and who brought them, and marks the one before replaced",
  { skip },
  async () => {
    const saved = await putTenantConfig(owner, A, HOURS, 1, ownerId);
    assert.equal(saved.ok, true, JSON.stringify(saved));
    assert.equal(saved.row.version, 2);
    const [first, second, ...rest] = await versions();
    assert.deepEqual(rest, []);
    assert.ok(first.replaced_at, "the version before is marked replaced");
    assert.deepEqual([second.version, second.config, second.changed_by, second.replaced_at], [2, HOURS, ownerId, null]);

    // A save from settings someone else has since changed is refused as it always was, and keeps nothing.
    const stale = await putTenantConfig(owner, A, LATER, 1, ownerId);
    assert.deepEqual(stale, { ok: false, reason: "stale" });
    assert.equal((await versions()).length, 2);
  },
);

test(
  "the version is the database's: a writer that changes the settings and does not move the number takes the next, and a number never goes back",
  { skip },
  async () => {
    // The nightly's seed (tooling/scripts/ops/e2e-workspace.mjs) writes the config alone, as the service role.
    ok(await db.from("tenant_config").update({ config: LATER }).eq("tenant_id", A), "config alone");
    assert.equal((await row()).version, 3, "the database moved the number");
    const third = (await versions()).at(-1);
    assert.deepEqual([third.version, third.config, third.replaced_at], [3, LATER, null]);
    assert.equal(third.changed_by, null, "no session and no name set by this write: nobody, never the last one's");

    // A changed config sent under a number already used takes the next all the same.
    ok(await db.from("tenant_config").update({ config: HOURS, version: 1 }).eq("tenant_id", A), "a number sent back");
    assert.equal((await row()).version, 4);
    // A number sent back with the settings as they are is held where it was, and is no new version.
    ok(await db.from("tenant_config").update({ version: 2 }).eq("tenant_id", A), "only the number, back");
    assert.equal((await row()).version, 4);
    // A writer that names who it writes for is that version's "who".
    ok(await db.from("tenant_config").update({ config: LATER, updated_by: ownerId }).eq("tenant_id", A), "named");
    assert.equal(
      (await versions()).at(-1).changed_by,
      null,
      "the same name as the row already had is not this write's",
    );
    ok(await db.from("tenant_config").update({ updated_by: null }).eq("tenant_id", A), "cleared");
    ok(await db.from("tenant_config").update({ config: HOURS, updated_by: ownerId }).eq("tenant_id", A), "named now");
    const kept = await versions();
    assert.equal(kept.at(-1).changed_by, ownerId);
    assert.deepEqual(
      kept.map((v) => v.version),
      [1, 2, 3, 4, 5, 6],
      "one row a version, none skipped, none twice",
    );
    assert.deepEqual(
      kept.map((v) => v.replaced_at === null),
      [false, false, false, false, false, true],
      "only the version in force stands unreplaced",
    );
    // Every version the row has held opens the settings it held.
    assert.deepEqual(
      kept.map((v) => v.config),
      [{}, HOURS, LATER, HOURS, LATER, HOURS],
    );
  },
);

test("a write that changes no setting moves no version: the calendar sweep's hourly stamp", { skip }, async () => {
  const before = await versions();
  ok(
    await db.from("tenant_config").update({ calendar_checked_at: new Date().toISOString() }).eq("tenant_id", A),
    "the stamp",
  );
  assert.equal((await row()).version, 6);
  assert.deepEqual(await versions(), before);
});

test(
  "nobody signed in reads or writes the record, or runs its clock: an owner no more than anon",
  { skip },
  async () => {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    for (const [who, client] of [
      ["an owner", owner],
      ["anon", anon],
    ]) {
      assert.equal(
        (await client.from("tenant_config_versions").select("*").eq("tenant_id", A)).error?.code,
        "42501",
        `${who} reads none`,
      );
      assert.equal(
        (await client.from("tenant_config_versions").insert({ tenant_id: A, version: 99, config: {} })).error?.code,
        "42501",
        `${who} writes none`,
      );
      assert.equal(
        (await client.from("tenant_config_versions").delete().eq("tenant_id", A)).error?.code,
        "42501",
        `${who} removes none`,
      );
      assert.equal((await client.rpc("purge_config_versions")).error?.code, "42501", `${who} may not run the clock`);
    }
    assert.equal((await versions()).length, 6, "and all of it stands");
  },
);

test(
  "the clock, run with its default, takes a version 400 days after it was replaced, and never the one in force",
  { skip },
  async () => {
    const keep = RETENTION_DAYS.tenant_config_versions;
    const at = (version, days) =>
      db
        .from("tenant_config_versions")
        .update({ replaced_at: ago(days) })
        .eq("tenant_id", A)
        .eq("version", version);
    ok(await at(1, keep + 1), "replaced past the keep");
    ok(await at(2, keep - 1), "replaced inside it");
    // The version in force has stood longer than the keep: it is the settings, and stays.
    ok(
      await db
        .from("tenant_config_versions")
        .update({ changed_at: ago(keep * 3) })
        .eq("tenant_id", A)
        .eq("version", 6),
      "an old version in force",
    );
    const purged = await db.rpc("purge_config_versions");
    assert.equal(purged.error, null, purged.error?.message);
    assert.ok(purged.data >= 1, `answers how many it removed (${purged.data})`);
    assert.deepEqual(
      (await versions()).map((v) => v.version),
      [2, 3, 4, 5, 6],
    );
  },
);

test(
  "the operator's reader says the settings a reply was written under, by the version its row names",
  { skip },
  async () => {
    const person = ok(
      await db.from("contacts").insert({ tenant_id: A, phone_e164: "+15550100181" }).select("id").single(),
      "contact",
    ).id;
    const thread = ok(
      await db.from("conversations").insert({ tenant_id: A, contact_id: person }).select("id").single(),
      "conversation",
    ).id;
    const turnId = globalThis.crypto.randomUUID();
    ok(
      await db.rpc("model_turn_keep", {
        p_tenant_id: A,
        p_turn_id: turnId,
        p_conversation_id: thread,
        p_prompt_hash: "0123456789abcdef",
        p_prompt_text: "You are the receptionist for Example Studio.",
        p_request: { now: null, who: null, steer: null, messages: [{ role: "user", content: "hi" }], photo: null },
      }),
      "a kept turn",
    );
    const reply = (version) =>
      db
        .from("messages")
        .insert({
          tenant_id: A,
          conversation_id: thread,
          contact_id: person,
          channel: "whatsapp",
          direction: "outbound",
          sender: "ai",
          status: "sent",
          type: "text",
          body: "Hello.",
          meta: { source: "brain", turn_id: turnId, config_version: version },
        })
        .select("id")
        .single();
    const read = (id, ...flags) =>
      spawnSync(process.execPath, ["tooling/scripts/ops/turn-read.mjs", "--message", id, "--no-prompt", ...flags], {
        cwd: ROOT,
        env: { ...process.env, SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY },
        encoding: "utf8",
      });
    const inForce = read(ok(await reply(6), "a reply under the version in force").id);
    assert.equal(inForce.status, 0, inForce.stderr);
    assert.match(
      inForce.stdout,
      /\nSettings: version 6, in force from \S+, still in force; --json has them whole\.\n$/,
    );
    const earlier = read(ok(await reply(3), "a reply under a version since replaced").id, "--json");
    assert.equal(earlier.status, 0, earlier.stderr);
    assert.deepEqual(JSON.parse(earlier.stdout).settings.config, LATER, "the settings as they stood at that version");
    const gone = read(ok(await reply(1), "a reply under a version past its keep").id);
    assert.match(gone.stdout, /\nSettings: version 1, no longer kept /);
  },
);
