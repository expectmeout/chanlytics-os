/**
 * A thread keeps when each wire last heard from its person -- on a real database (decision 0001, step 4, 00484).
 *
 * The reply window is a per-channel rule, and the fact it reads is when this person last wrote on that wire. 00484 keeps
 * it as one row a thread and wire (conversation_channel_state), written by ingest_inbound for every message it takes
 * in, beside conversations.last_wa_inbound_at, which goes on being written exactly as before until step 7. What is
 * proved here is what reading the migration cannot prove: each wire gets its row, a late or replayed message never
 * rewinds it, the WhatsApp column moves as it always did, a merged person's thread folds its rows into the kept one's
 * with the later clock winning on each wire, and the backfill writes the fact as it stands and, run again, nothing new.
 * Skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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

/** A migration's text, by its number, with LF line endings. */
const migration = (n) => {
  const dir = path.join(ROOT, "supabase", "migrations");
  const file = fs.readdirSync(dir).find((f) => f.startsWith(`${n}_`));
  return fs.readFileSync(path.join(dir, file), "utf8").replaceAll("\r\n", "\n");
};
/** A function's body as a migration writes it: from `as $$` after its header to the next `$$`, as pg_proc keeps it. */
const bodyIn = (src, header) => {
  const at = src.indexOf(header);
  assert.ok(at >= 0, `no ${header}`);
  const open = src.indexOf("as $$", at) + "as $$".length;
  return src.slice(open, src.indexOf("$$", open));
};

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

/** An owner signed in, as the dashboard's session client is: merge_people reads its caller from the session. */
async function owner(tenantId) {
  const email = `channel-state-owner-${stamp}-${made.users.length}@example.test`;
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
async function inbound(tenantId, wire, who, at, over = {}) {
  n += 1;
  return ok(
    await db.rpc("ingest_inbound", {
      p_tenant_id: tenantId,
      p_channel: wire,
      p_identity_external_id: who.replace(/^\+/, ""),
      p_phone_e164: wire === "email" ? null : who,
      p_wa_profile_name: null,
      p_message_external_id: `${wire}.${stamp}.${n}`,
      p_type: "text",
      p_body: "hello",
      p_channel_ts: at,
      p_media: null,
      p_meta: {},
      p_opt_out: false,
      p_opt_in: false,
      ...over,
    }),
  );
}

/** A thread's rows, wire to ISO time, as the database keeps them. */
async function wiresOf(conversationId) {
  const rows = ok(
    await db
      .from("conversation_channel_state")
      .select("channel, last_inbound_at")
      .eq("conversation_id", conversationId),
  );
  return Object.fromEntries(rows.map((r) => [r.channel, new Date(r.last_inbound_at).toISOString()]));
}

async function waColumnOf(conversationId) {
  const c = ok(await db.from("conversations").select("last_wa_inbound_at").eq("id", conversationId).single());
  return c.last_wa_inbound_at === null ? null : new Date(c.last_wa_inbound_at).toISOString();
}

const T = (minutes) => new Date(Date.UTC(2026, 9, 26, 12, minutes)).toISOString();

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
  "every wire a person writes on keeps when they last wrote, and WhatsApp's column moves as it always did",
  { skip },
  async () => {
    const t = await workspace("channel-state-wires");
    const phone = "+12065550141";
    const wa = await inbound(t, "whatsapp", phone, T(1));
    assert.deepEqual(await wiresOf(wa.conversation_id), { whatsapp: T(1) });
    assert.equal(await waColumnOf(wa.conversation_id), T(1), "the column is written beside the row");

    // The same person by text: one thread, a second wire, and the WhatsApp column untouched by a text.
    const sms = await inbound(t, "sms", phone, T(2));
    assert.equal(sms.conversation_id, wa.conversation_id, "one person is one thread across both wires");
    assert.deepEqual(await wiresOf(wa.conversation_id), { whatsapp: T(1), sms: T(2) });
    assert.equal(await waColumnOf(wa.conversation_id), T(1), "a text never moves the WhatsApp window");

    // An email from someone else: their own thread, their own wire.
    const mail = await inbound(t, "email", "someone@example.test", T(3));
    assert.deepEqual(await wiresOf(mail.conversation_id), { email: T(3) });
    assert.equal(await waColumnOf(mail.conversation_id), null);
  },
);

test("a late or replayed message never rewinds the clock, on the row as on the column", { skip }, async () => {
  const t = await workspace("channel-state-late");
  const phone = "+12065550142";
  const first = await inbound(t, "whatsapp", phone, T(10));
  // A message Meta sent late, written before the one above: the clock stays where it was.
  await inbound(t, "whatsapp", phone, T(5));
  assert.deepEqual(await wiresOf(first.conversation_id), { whatsapp: T(10) });
  assert.equal(await waColumnOf(first.conversation_id), T(10));
  // The same message taken in again (its id) is a redelivery: nothing is written twice, and nothing rewinds.
  const again = await inbound(t, "whatsapp", phone, T(1), { p_message_external_id: `whatsapp.${stamp}.${n - 1}` });
  assert.equal(again.is_new, false);
  assert.deepEqual(await wiresOf(first.conversation_id), { whatsapp: T(10) });
  // A later one moves both.
  await inbound(t, "whatsapp", phone, T(20));
  assert.deepEqual(await wiresOf(first.conversation_id), { whatsapp: T(20) });
  assert.equal(await waColumnOf(first.conversation_id), T(20));
});

test(
  "a merged person's thread folds its rows into the kept one's, the later clock winning on each wire",
  { skip },
  async () => {
    const t = await workspace("channel-state-merge");
    const as = await owner(t);
    const kept = await inbound(t, "whatsapp", "+12065550143", T(30));
    const merged = await inbound(t, "email", "the-same-person@example.test", T(40));
    // The merged thread also heard on WhatsApp, later than the kept one did (a row written as a door would): the fold
    // takes the later clock, not the kept thread's.
    ok(
      await db.from("conversation_channel_state").insert({
        tenant_id: t,
        conversation_id: merged.conversation_id,
        channel: "whatsapp",
        last_inbound_at: T(45),
      }),
    );
    const out = ok(await as.rpc("merge_people", { p_keep: kept.contact_id, p_merge: merged.contact_id }));
    assert.equal(out.contact_id, kept.contact_id, JSON.stringify(out));
    assert.deepEqual(await wiresOf(kept.conversation_id), { whatsapp: T(45), email: T(40) });
    assert.deepEqual(await wiresOf(merged.conversation_id), {}, "the merged thread's rows went with it");
  },
);

test("the backfill writes the fact as it stands, and run again writes nothing new", { skip }, async () => {
  const t = await workspace("channel-state-backfill");
  const phone = "+12065550144";
  const wa = await inbound(t, "whatsapp", phone, T(50));
  await inbound(t, "sms", phone, T(51));
  await inbound(t, "sms", phone, T(52));
  // As a thread stood before 00484: the column written, no rows.
  ok(await db.from("conversation_channel_state").delete().eq("conversation_id", wa.conversation_id));
  assert.deepEqual(await wiresOf(wa.conversation_id), {});
  // The migration's own two statements, as written.
  const sql = migration("00484");
  const backfills = sql.match(/^insert into public\.conversation_channel_state[\s\S]*?;\n/gm);
  assert.equal(backfills?.length, 2, "two backfills: WhatsApp's from the column, the rest from the messages");
  for (const statement of backfills) query(statement);
  assert.deepEqual(await wiresOf(wa.conversation_id), { whatsapp: T(50), sms: T(52) });
  for (const statement of backfills) query(statement);
  assert.deepEqual(await wiresOf(wa.conversation_id), { whatsapp: T(50), sms: T(52) }, "re-runnable");
});

test("members read their workspace's rows and nobody writes them but the doors", { skip }, async () => {
  const t = await workspace("channel-state-read");
  const other = await workspace("channel-state-other");
  const as = await owner(t);
  const mine = await inbound(t, "whatsapp", "+12065550145", T(55));
  const theirs = await inbound(other, "whatsapp", "+12065550146", T(56));
  const read = ok(await as.from("conversation_channel_state").select("conversation_id"));
  assert.deepEqual(
    read.map((r) => r.conversation_id),
    [mine.conversation_id],
    "a member reads their own workspace's rows, never another's",
  );
  assert.ok(!read.some((r) => r.conversation_id === theirs.conversation_id));
  const { error } = await as
    .from("conversation_channel_state")
    .insert({ tenant_id: t, conversation_id: mine.conversation_id, channel: "sms", last_inbound_at: T(57) });
  assert.ok(error, "a member writes none: only ingest_inbound and merge_people do");
});

test(
  "00484 re-creates ingest_inbound and merge_people whole, each its last body but for its one block, and the database runs them",
  { skip },
  () => {
    const now = migration("00484");
    // [the migration it was re-created from, the lines the one block goes before]
    const recreated = {
      ingest_inbound: [
        "00361",
        "  insert into events (tenant_id, kind, category, subject_type, subject_id, data)\n  values (p_tenant_id, 'message.received'",
      ],
      merge_people: ["00451", "    delete from conversations where id = m_conv.id;"],
    };
    for (const [name, [from, before]] of Object.entries(recreated)) {
      const header = `create or replace function public.${name}(`;
      const source = bodyIn(migration(from), header);
      const body = bodyIn(now, header);
      assert.equal(source.split(before).length, 2, `${name}: its last body says this once`);
      // The block 00484 added: everything between where the source and the new body part.
      const at = source.indexOf(before);
      assert.equal(body.slice(0, at), source.slice(0, at), `${name}: the same up to the block`);
      assert.ok(body.endsWith(source.slice(at)), `${name}: the same after the block`);
      const block = body.slice(at, body.length - (source.length - at));
      assert.match(block, /conversation_channel_state/, `${name}: the block writes the per-channel row`);
      assert.doesNotMatch(block, /last_wa_inbound_at\s*=/, `${name}: and moves nothing of the column`);
      const [live] = query(
        `select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '${name}'`,
      );
      assert.equal(live.prosrc.replaceAll("\r\n", "\n"), body, `${name}: the database runs 00484's`);
    }
  },
);
