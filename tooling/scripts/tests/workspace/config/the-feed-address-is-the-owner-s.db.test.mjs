/**
 * The calendar feed's address is the owner's to read (00365, 00366), on a real database through PostgREST.
 *
 * The address grants read access to the owner's calendar. The dashboard always showed it to the owner alone
 * (readers/settings.ts feedVisibleTo), and the table let every member's session read it whole from a browser. Proved
 * here with a session of each role: only the owner reads the row of the table; every other member reads it through
 * tenant_config_read with the address masked exactly as the dashboard masks it, and a stranger reads nothing; the write
 * a partner's save needs goes through tenant_config_write, under the settings permission, since the table's own update
 * finds no row it cannot read; and the two calls the dashboard makes (packages/db getTenantConfigAsMember and
 * putTenantConfig) do the same on a partner's session. Skipped without a local database; never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { getTenantConfigAsMember, putTenantConfig } from "@chanlytics/db";
import { showSecondFactor } from "../../_second-factor.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const { feedVisibleTo } = await import(
  pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/readers/settings.ts")).href
);

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

const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}${r.error?.message ?? ""}`);
  return r.data;
};

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** A made-up feed, long enough to be masked around its ends. */
const FEED = `https://calendar.example.com/ical/${RUN}/private-0123456789abcdef/basic.ics`;
const SHORT = "https://cal.example.com/a.ics";
const configWith = (url) => ({ brain: { business_name: "Harbor Studio" }, calendar: { ical_url: url } });

let db;
let A; // the workspace
let B; // another, whose owner is the stranger
const users = [];
const as = {}; // a session of each role in A, and a stranger

async function session(label, tenantId, role, { factor = role === "partner" } = {}) {
  const email = `feed-${label}-${RUN}@example.com`;
  const password = `pw-${RUN}-${label}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.data.user.id, role }), `${label}: `);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  // A partner's seat counts once the session showed its second factor (0013): this is mostly about what a seat that
  // counts may do, and once about one that does not.
  if (factor) await showSecondFactor(client);
  return { client, id: made.data.user.id };
}

/** Puts A's configuration as the platform would, and answers its version. */
async function stored(config) {
  const row = ok(
    await db.from("tenant_config").update({ config }).eq("tenant_id", A).select("version").single(),
    "set the config: ",
  );
  return row.version;
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const workspace = async (tag) =>
    ok(
      await db
        .from("tenants")
        .insert({ slug: `feed-${tag}-${RUN}`, name: `Feed ${tag}` })
        .select("id")
        .single(),
    ).id;
  A = await workspace("a");
  B = await workspace("b");
  as.owner = await session("owner", A, "owner");
  as.operator = await session("operator", A, "operator");
  as.viewer = await session("viewer", A, "viewer");
  as.partner = await session("partner", A, "partner");
  as.password = await session("password", A, "partner", { factor: false });
  as.stranger = await session("stranger", B, "owner");
});

after(async () => {
  if (skip || !A) return;
  for (const t of [A, B]) {
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

const tableRead = async (who) =>
  ok(await as[who].client.from("tenant_config").select("config").eq("tenant_id", A), `${who} reads the table: `);
const doorRead = async (who, tenantId = A) =>
  ok(await as[who].client.rpc("tenant_config_read", { p_tenant_id: tenantId }), `${who} reads the door: `);

test(
  "only the owner reads the row of the table; every other member reads it through tenant_config_read, the address masked as the dashboard masks it; a stranger reads nothing",
  { skip },
  async () => {
    const version = await stored(configWith(FEED));
    assert.deepEqual(
      (await tableRead("owner")).map((r) => r.config.calendar.ical_url),
      [FEED],
      "the owner reads the table whole",
    );
    const owners = await doorRead("owner");
    assert.deepEqual(
      owners.map((r) => [r.config.calendar.ical_url, r.feed_hidden, r.version]),
      [[FEED, false, version]],
      "and the door whole",
    );
    for (const who of ["operator", "viewer", "partner"]) {
      assert.deepEqual(await tableRead(who), [], `${who}: the table answers no row`);
      const [row, ...more] = await doorRead(who);
      assert.equal(more.length, 0, `${who}: one row`);
      assert.equal(row.feed_hidden, true, `${who}: told the address is hidden`);
      assert.equal(
        row.config.calendar.ical_url,
        feedVisibleTo(who, configWith(FEED)).calendar.ical_url,
        `${who}: masked as Settings masks it`,
      );
      assert.notEqual(row.config.calendar.ical_url, FEED);
      assert.equal(row.config.brain.business_name, "Harbor Studio", `${who}: the rest of the row is the row`);
      assert.equal(row.version, version, `${who}: the version a save echoes`);
    }
    assert.deepEqual(await doorRead("stranger"), [], "a member of another workspace: nothing through the door");
    assert.deepEqual(await doorRead("password"), [], "a partner's seat on a password alone: nothing (0013)");
    assert.deepEqual(
      ok(await as.stranger.client.from("tenant_config").select("config").eq("tenant_id", A)),
      [],
      "nor through the table",
    );

    // An address of thirty characters or fewer is the ellipsis alone, as Settings says it; one of no address hides nothing.
    await stored(configWith(SHORT));
    const [short] = await doorRead("viewer");
    assert.equal(short.config.calendar.ical_url, feedVisibleTo("viewer", configWith(SHORT)).calendar.ical_url);
    assert.equal(short.config.calendar.ical_url, "…");
    await stored({ brain: { business_name: "Harbor Studio" } });
    const [none] = await doorRead("viewer");
    assert.deepEqual([none.feed_hidden, none.config], [false, { brain: { business_name: "Harbor Studio" } }]);
  },
);

test(
  "tenant_config_write is the session's versioned write: the owner and a partner save, recorded as theirs; a stale version and a missing row are told apart; an operator and a viewer are refused",
  { skip },
  async () => {
    let version = await stored(configWith(FEED));
    // The table's own update finds no row a partner cannot read, and says nothing: that is why the door exists.
    const direct = await as.partner.client
      .from("tenant_config")
      .update({ version: version + 1 })
      .eq("tenant_id", A)
      .eq("version", version)
      .select("version");
    assert.deepEqual([direct.error, direct.data], [null, []], "the partner's update of the table touched nothing");

    const write = (who, config, v, tenantId = A) =>
      as[who].client.rpc("tenant_config_write", { p_tenant_id: tenantId, p_config: config, p_version: v });
    const [saved] = ok(await write("partner", configWith(`${FEED}?partner`), version));
    assert.deepEqual([saved.outcome, saved.version, saved.updated_by], ["saved", version + 1, as.partner.id]);
    const row = ok(await db.from("tenant_config").select("config, version, updated_by").eq("tenant_id", A).single());
    assert.deepEqual(
      [row.config.calendar.ical_url, row.version, row.updated_by],
      [`${FEED}?partner`, version + 1, as.partner.id],
    );
    version = row.version;

    const [stale] = ok(await write("owner", configWith(FEED), version - 1));
    assert.deepEqual([stale.outcome, stale.version], ["stale", null], "a version someone saved past");
    const [mine] = ok(await write("owner", configWith(FEED), version));
    assert.deepEqual([mine.outcome, mine.updated_by], ["saved", as.owner.id]);

    for (const who of ["operator", "viewer"]) {
      const refused = await write(who, {}, version + 1);
      assert.equal(refused.error?.code, "42501", `${who}: no settings permission`);
    }
    const strangers = await write("stranger", {}, version + 1);
    assert.equal(strangers.error?.code, "42501", "a member of another workspace");
    const after = ok(await db.from("tenant_config").select("config, version").eq("tenant_id", A).single());
    assert.deepEqual([after.config.calendar.ical_url, after.version], [FEED, version + 1], "nothing else landed");

    // A workspace with no row is missing, not stale: nothing to update, and no colleague to blame.
    ok(await db.from("tenant_config").delete().eq("tenant_id", B));
    const [missing] = ok(await write("stranger", {}, 1, B));
    assert.equal(missing.outcome, "missing");
  },
);

test(
  "the dashboard's two calls on a partner's session: the row read through the door with the address hidden, the save landing through the door",
  { skip },
  async () => {
    const version = await stored(configWith(FEED));
    const read = await getTenantConfigAsMember(as.partner.client, A);
    assert.equal(read.feed_hidden, true);
    assert.notEqual(read.config.calendar.ical_url, FEED);
    const owners = await getTenantConfigAsMember(as.owner.client, A);
    assert.deepEqual([owners.feed_hidden, owners.config.calendar.ical_url], [false, FEED]);
    assert.equal(await getTenantConfigAsMember(as.stranger.client, A), null, "a stranger: nothing");

    const put = await putTenantConfig(as.partner.client, A, configWith(FEED), version, as.partner.id);
    assert.equal(put.ok, true);
    assert.deepEqual([put.row.version, put.row.updated_by], [version + 1, as.partner.id]);
    const again = await putTenantConfig(as.partner.client, A, configWith(FEED), version, as.partner.id);
    assert.deepEqual(again, { ok: false, reason: "stale" });
  },
);
