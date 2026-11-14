/**
 * A policy changes in one write (policy_change, 00624), on a real database.
 *
 * How it runs saves one class's row of `policies`: its mode, and the dials its `limits` holds. The save was a read, a
 * merge in the app and a write, with the change's row on the ledger a fourth step. Two saves at once each merged over
 * the limits they had read, so the second wrote the first's dial away; a dial saved alone wrote back the mode it had
 * read, so the replies a teammate had just turned off came back on; and a ledger row that failed left a change with no
 * record. The door makes the change one statement and writes its row in the same transaction.
 *
 * A lock and a transaction are exactly what a database in memory cannot prove, so this runs against the local database
 * the Database workflow builds from every migration, with a session of each role through PostgREST. The race is run
 * the way partners/a-refund-racing-the-first-share-is-applied.db.test.mjs runs its own: one change's transaction is
 * held open through the Supabase CLI (a `do` block that makes it, then sleeps), and the other is made on its own
 * connection while the first still holds, having asked first that it does. SUPABASE_CLI names the binary when
 * `supabase` is not on PATH, SUPABASE_DB_URL the database when the environment names one on this machine; never
 * production.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { savePolicyChange } from "@chanlytics/db/workspace";
import { showSecondFactor } from "../../_second-factor.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const DB_URL = process.env.SUPABASE_DB_URL;
const CLI_TARGET =
  DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)
    ? ["--db-url", `${DB_URL}${DB_URL.includes("?") ? "&" : "?"}sslmode=disable`]
    : ["--local"];
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
/** The reply row as every test finds it: a mode, and three dials no test's change names. */
const BASE = { max_replies_day: 20, pause_hours: 24, max_llm_tokens_day: 1000000 };
/** How long the first change's transaction stays open: past the CLI's start for the second, which then waits on it. */
const HOLD_S = 10;

let db;
let A; // the workspace
let B; // another, whose owner is the stranger
const users = [];
const as = {}; // a session of each role in A, and a stranger

/** One statement through the CLI, as the database's own user: its rows, or the failure it printed. */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", ...CLI_TARGET, "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0) throw new Error(`${CLI} db query failed: ${[r.stderr, r.stdout].join("\n").trim().slice(-800)}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const parsed = JSON.parse(out.slice(start, out.lastIndexOf(out[start] === "{" ? "}" : "]") + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

/** One statement through the CLI, left running: settles with how it ended. */
function running(sql) {
  return new Promise((resolve) => {
    const child = spawn(CLI, ["db", "query", ...CLI_TARGET, sql], { cwd: ROOT });
    let printed = "";
    child.stdout.on("data", (d) => (printed += d));
    child.stderr.on("data", (d) => (printed += d));
    child.on("close", (status) => resolve({ status, printed }));
  });
}

/** The words that find the held transaction in pg_stat_activity, spelt so no other query's text holds them whole. */
const heldBy = (tag) => `'%' || 'held-' || '${tag}-${RUN}' || '%'`;
const isHeld = (tag) =>
  `exists (select 1 from pg_stat_activity where query like ${heldBy(tag)} and pid <> pg_backend_pid() and state = 'active')`;

/**
 * Holds `first` open (it runs, then the transaction sleeps), and once it is sleeping runs `second` on its own
 * connection, which first asks that `first` is still open: the race, run. Settles when both have.
 */
async function race(tag, first, second) {
  const held = running(`do $$ begin ${first} perform pg_sleep(${HOLD_S}); end $$ /* held-${tag}-${RUN} */`);
  const deadline = Date.now() + HOLD_S * 1000;
  for (;;) {
    const [row] = query(
      `select count(*)::int as n from pg_stat_activity where query like ${heldBy(tag)} and wait_event = 'PgSleep'`,
    );
    if (row?.n >= 1) break;
    assert.ok(Date.now() < deadline, `${tag}: the first change's transaction never got to its sleep`);
  }
  query(`do $$ begin
    if not ${isHeld(tag)} then
      raise exception 'the first change''s transaction ended before the second came: no race was run';
    end if;
    ${second}
  end $$`);
  const first_ = await held;
  assert.equal(first_.status, 0, `${tag}: the held change failed: ${first_.printed.slice(-600)}`);
}

/**
 * The door called inside a `do` block as this member: the claims PostgREST would set for their session, then the
 * change. `mode` and `via` are SQL text or null; `dials` is the JSON the door merges.
 */
const changeAs = (who, { mode = null, dials = {}, via = null }) => {
  const text = (v) => (v === null ? "null" : `'${v}'`);
  return `perform set_config('request.jwt.claims', '{"sub":"${as[who].id}","role":"authenticated"}', true);
    perform public.policy_change('${A}', 'reply', ${text(mode)}, '${JSON.stringify(dials)}'::jsonb, ${text(via)});`;
};

async function session(label, tenantId, role, { factor = role === "partner" } = {}) {
  const email = `policy-${label}-${RUN}@example.com`;
  const password = `pw-${RUN}-${label}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.data.user.id, role }), `${label}: `);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  // A partner's seat counts once the session showed its second factor (0013).
  if (factor) await showSecondFactor(client);
  return { client, id: made.data.user.id };
}

const rowOf = async (cls = "reply") =>
  ok(
    await db
      .from("policies")
      .select("mode, limits")
      .eq("tenant_id", A)
      .eq("class", cls)
      .is("subject_type", null)
      .single(),
    `read the ${cls} row: `,
  );
/** The workspace's policy changes on the ledger, oldest first. */
const changes = async () =>
  ok(
    await db
      .from("events")
      .select("category, subject_type, subject_id, data")
      .eq("tenant_id", A)
      .eq("kind", "policy.changed")
      .order("created_at"),
    "read the ledger: ",
  );
const change = (who, args) => as[who].client.rpc("policy_change", { p_tenant_id: A, p_class: "reply", ...args });

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  // provision_tenant gives each workspace its matrix: the reply row and the money row among them.
  const workspace = async (tag) =>
    ok(
      await db
        .from("tenants")
        .insert({ slug: `policy-${tag}-${RUN}`, name: `Policy ${tag}` })
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

// Each test finds the reply row as it was made and a ledger with no change on it.
beforeEach(async () => {
  if (skip) return;
  ok(
    await db
      .from("policies")
      .update({ mode: "auto", limits: BASE })
      .eq("tenant_id", A)
      .eq("class", "reply")
      .is("subject_type", null),
    "put the reply row back: ",
  );
  ok(await db.from("events").delete().eq("tenant_id", A).eq("kind", "policy.changed"), "clear the ledger: ");
});

after(async () => {
  if (skip || !A) return;
  for (const t of [A, B]) {
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "a change is one write: the dials merged into the limits on file, the mode only when one is given, and the change on the ledger as its member's",
  { skip },
  async () => {
    const [set] = ok(
      await change("owner", { p_mode: "ask", p_limits: { reply_delay_ms: 30000, min_confidence: 0.6 }, p_via: "ask" }),
      "the owner's change: ",
    );
    assert.deepEqual(
      [set.mode, set.limits, set.class, set.subject_type],
      ["ask", { ...BASE, reply_delay_ms: 30000, min_confidence: 0.6 }, "reply", null],
      "the answer is the row as it stands: the mode given, the dials beside the ones on file",
    );

    const [dial] = ok(await change("operator", { p_limits: { max_replies_day: 40 } }), "the operator's dial: ");
    assert.deepEqual(
      [dial.mode, dial.limits],
      ["ask", { ...BASE, reply_delay_ms: 30000, min_confidence: 0.6, max_replies_day: 40 }],
      "a dial alone: the mode is the row's own, and every other dial stays",
    );
    assert.deepEqual(await rowOf(), { mode: dial.mode, limits: dial.limits });

    assert.deepEqual(await changes(), [
      {
        category: "system",
        subject_type: "workspace",
        subject_id: A,
        data: {
          class: "reply",
          mode: "ask",
          fields: ["min_confidence", "reply_delay_ms"],
          by: as.owner.id,
          via: "ask",
        },
      },
      {
        category: "system",
        subject_type: "workspace",
        subject_id: A,
        data: { class: "reply", mode: "ask", fields: ["max_replies_day"], by: as.operator.id },
      },
    ]);

    // A class the workspace has no row for: nothing to change, and nothing on the ledger.
    const none = ok(await as.owner.client.rpc("policy_change", { p_tenant_id: A, p_class: "nope", p_mode: "ask" }));
    assert.deepEqual(none, []);
    assert.equal((await changes()).length, 2);
  },
);

test(
  "who may is the table's own rule for a workspace's row: an owner, an operator, and a partner past the second factor; nobody else, and nothing of theirs lands",
  { skip },
  async () => {
    let hours = 1;
    for (const who of ["owner", "operator", "partner"]) {
      hours += 1;
      const [row] = ok(await change(who, { p_limits: { pause_hours: hours } }), `${who}: `);
      assert.equal(row.limits.pause_hours, hours, `${who} may`);
    }
    const before_ = await rowOf();
    for (const who of ["viewer", "password", "stranger"]) {
      const refused = await change(who, { p_mode: "never", p_limits: { pause_hours: 99 } });
      assert.equal(refused.error?.code, "42501", `${who}: not theirs to change`);
    }
    const signedOut = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const nobody = await signedOut.rpc("policy_change", { p_tenant_id: A, p_class: "reply", p_mode: "never" });
    assert.notEqual(nobody.error, null, "a visitor with no session is refused");
    const notDials = await change("owner", { p_limits: [1, 2] });
    assert.equal(notDials.error?.code, "22023", "the dials are names and their values, never a list");
    assert.deepEqual(await rowOf(), before_, "nothing a refused caller sent is on the row");
    assert.equal((await changes()).length, 3, "and the ledger holds the three changes that landed, no more");
  },
);

test(
  "two changes of one row at once both stand: the second merges over what the first wrote, and a dial saved while the mode is being changed leaves the new mode",
  { skip },
  async () => {
    // The owner turns the replies off and sets the day's cap; while that transaction is open, the operator saves a
    // dial alone. Read, merge and write would have merged over the limits from before the owner's change and written
    // the mode back to auto.
    await race(
      "dials",
      changeAs("owner", { mode: "never", dials: { max_replies_day: 41 } }),
      changeAs("operator", { dials: { min_confidence: 0.9 } }),
    );
    const row = await rowOf();
    assert.equal(row.mode, "never", "the mode a teammate set stays set: a dial alone writes no mode");
    assert.deepEqual(
      row.limits,
      { ...BASE, max_replies_day: 41, min_confidence: 0.9 },
      "both dials are on the row, beside the ones neither change named",
    );
    assert.deepEqual(
      (await changes()).map((e) => [e.data.by, e.data.mode, e.data.fields]),
      [
        [as.owner.id, "never", ["max_replies_day"]],
        [as.operator.id, "never", ["min_confidence"]],
      ],
      "each change is on the ledger, the second with the mode the row held when it landed",
    );
  },
);

test("a change and its row on the ledger are one transaction: undone together, neither stands", { skip }, async () => {
  assert.throws(
    () =>
      query(`do $$ begin
          ${changeAs("owner", { mode: "ask", dials: { pause_hours: 99 }, via: "ask" })}
          raise exception 'undone on purpose';
        end $$`),
    /undone on purpose/,
  );
  assert.deepEqual(await rowOf(), { mode: "auto", limits: BASE }, "the row is as it was");
  assert.deepEqual(await changes(), [], "and no change is on the ledger");
});

test("the money row stays locked through the door: its mode is never, whoever asks", { skip }, async () => {
  const unlock = await as.owner.client.rpc("policy_change", { p_tenant_id: A, p_class: "money", p_mode: "auto" });
  assert.match(unlock.error?.message ?? "", /money decisions are owner-only/, "the trigger's refusal, in its words");
  assert.equal((await rowOf("money")).mode, "never");
  assert.deepEqual(await changes(), [], "a refused change leaves no row on the ledger");
});

test(
  "the dashboard's call on a member's session: the row as the page reads it, and null where there is no row",
  { skip },
  async () => {
    const saved = await savePolicyChange(as.operator.client, A, "reply", {
      mode: null,
      limits: { pause_hours: 6 },
      via: null,
    });
    assert.deepEqual(
      [Object.keys(saved).sort(), saved.mode, saved.limits],
      [
        ["class", "id", "limits", "mode", "subject_id", "subject_type", "updated_at"],
        "auto",
        { ...BASE, pause_hours: 6 },
      ],
      "the policy's own fields, and never the workspace's id",
    );
    assert.equal(await savePolicyChange(as.owner.client, A, "nope", { mode: "ask", limits: {}, via: null }), null);
    await assert.rejects(
      savePolicyChange(as.viewer.client, A, "reply", { mode: "never", limits: {}, via: null }),
      (e) => e.code === "42501",
      "a refusal keeps the database's code, which the route answers 403 by",
    );
  },
);
