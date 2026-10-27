/**
 * A reply window reads its own wire's clock -- on a real database (decision 0001, step 5, 00485).
 *
 * The readers of conversations.last_wa_inbound_at move to the per-channel fact (00484) through one accessor,
 * last_inbound_on_whatsapp: a computed column PostgREST serves with a thread, which the dashboard's reads alias to the
 * field their pages already read, and which people_list reads for a person's latest thread. What is proved here is what
 * the code cannot prove alone: the accessor answers from the per-channel row and not from the column, a member reads
 * only their own workspace's, people_list says what it says, and, for the fourteen days the double write stands (0001's
 * fifth answer), nothing in the database reads the column but the two functions that write it, so step 7 can drop it.
 * Skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY || !ANON
    ? "no database, or no anon key to sign in with, in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers"
      : false;

/** One statement through `supabase db query --local`: the rows it returned. */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0) throw new Error(`supabase db query exited ${r.status}: ${(r.stderr || r.stdout).slice(-800)}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const end = out.lastIndexOf(out[start] === "{" ? "}" : "]");
  const parsed = JSON.parse(out.slice(start, end + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

let db;
const made = { tenants: [], users: [] };
const stamp = Date.now().toString(36);
const PASSWORD = "a-long-test-password-1";
let n = 0;

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

async function workspace(slug) {
  const t = ok(
    await db
      .from("tenants")
      .insert({ slug: `${slug}-${stamp}`, name: slug })
      .select("id")
      .single(),
  );
  made.tenants.push(t.id);
  return t.id;
}

/** An owner signed in, as the dashboard's session client is. */
async function member(tenantId) {
  const email = `reply-window-${stamp}-${made.users.length}@example.test`;
  const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(error.message);
  made.users.push(data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: data.user.id, role: "owner" }));
  const as = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await as.auth.signInWithPassword({ email, password: PASSWORD });
  if (sErr) throw new Error(sErr.message);
  return as;
}

/** A customer's message taken in as the edge takes one, at the wire's own time. */
async function inbound(tenantId, wire, phone, at) {
  n += 1;
  return ok(
    await db.rpc("ingest_inbound", {
      p_tenant_id: tenantId,
      p_channel: wire,
      p_identity_external_id: phone.replace(/^\+/, ""),
      p_phone_e164: phone,
      p_wa_profile_name: null,
      p_message_external_id: `${wire}.${stamp}.${n}`,
      p_type: "text",
      p_body: "hello",
      p_channel_ts: at,
      p_media: null,
      p_meta: {},
      p_opt_out: false,
      p_opt_in: false,
    }),
  );
}

const T = (minutes) => new Date(Date.UTC(2026, 9, 26, 14, minutes)).toISOString();
const iso = (v) => (v === null || v === undefined ? null : new Date(v).toISOString());

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const id of made.tenants) await db.from("tenants").delete().eq("id", id);
  for (const id of made.users) await db.auth.admin.deleteUser(id);
});

test(
  "a thread's WhatsApp clock is read from the per-channel fact: by a member through the accessor, and by people_list",
  { skip },
  async () => {
    const t = await workspace("reply-window-reads");
    const as = await member(t);
    const phone = "+12065550151";
    const wa = await inbound(t, "whatsapp", phone, T(1));
    await inbound(t, "sms", phone, T(2));

    // As the dashboard reads a thread: the accessor, aliased to the field its pages read.
    const read = async () =>
      iso(
        ok(
          await as
            .from("conversations")
            .select("id, last_wa_inbound_at:last_inbound_on_whatsapp")
            .eq("id", wa.conversation_id)
            .single(),
        ).last_wa_inbound_at,
      );
    assert.equal(await read(), T(1), "a text later on the thread does not move the WhatsApp clock");
    const listed = async () =>
      iso(ok(await as.rpc("people_list", { p_tenant_id: t, p_contact_id: wa.contact_id }))[0].latest_wa_inbound_at);
    assert.equal(await listed(), T(1), "people_list says the same");

    // The column is still written, and nothing reads it: with the row gone and the column left, both say none.
    ok(
      await db
        .from("conversation_channel_state")
        .delete()
        .eq("conversation_id", wa.conversation_id)
        .eq("channel", "whatsapp"),
    );
    const column = ok(
      await db.from("conversations").select("last_wa_inbound_at").eq("id", wa.conversation_id).single(),
    );
    assert.equal(iso(column.last_wa_inbound_at), T(1), "the column keeps its old writer until step 7");
    assert.equal(await read(), null, "the accessor reads the per-channel row, never the column");
    assert.equal(await listed(), null, "and so does people_list");
  },
);

test("a member reads no other workspace's clock through the accessor", { skip }, async () => {
  const mine = await workspace("reply-window-mine");
  const theirs = await workspace("reply-window-theirs");
  const as = await member(mine);
  const other = await inbound(theirs, "whatsapp", "+12065550152", T(10));
  const rows = ok(
    await as.from("conversations").select("id, last_inbound_on_whatsapp").eq("id", other.conversation_id),
  );
  assert.deepEqual(rows, [], "another workspace's thread is not theirs to read");
});

test(
  "for the fourteen days the double write stands, nothing in the database reads last_wa_inbound_at but its two writers",
  { skip },
  () => {
    const functions = query(`select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosrc ~ 'last_wa_inbound_at' order by 1`).map((r) => r.name);
    assert.deepEqual(
      functions,
      ["ingest_inbound", "merge_people"],
      "the message's door and the merge write it, and nothing else names it",
    );
    const views = query(
      `select viewname as name from pg_views where schemaname = 'public' and definition ~ 'last_wa_inbound_at'`,
    );
    assert.deepEqual(views, []);
    const policies = query(`select policyname as name from pg_policies where schemaname = 'public'
     and (coalesce(qual, '') ~ 'last_wa_inbound_at' or coalesce(with_check, '') ~ 'last_wa_inbound_at')`);
    assert.deepEqual(policies, []);
  },
);
