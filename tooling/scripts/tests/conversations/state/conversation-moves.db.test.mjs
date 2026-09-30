/**
 * A thread's state moves by one table (contracts conversation-moves.ts); three of its moves are SQL's own, and the
 * table is the only thing that says they agree. Run on a real database: `expire_stale_pauses` (pause_expired),
 * `wake_stale_snoozes` (snooze_expired) and `ingest_inbound`'s reopening (reopen) each write, to a thread in each state
 * they touch, the columns the table says and leave alone the states it does not start from. And the columns every
 * move writes are the session role's grant on `conversations`, read from the database (00037, fenced by 00132), so a
 * move that named a column the role cannot update, or a grant that dropped one, fails here.
 *
 * The grant is read through the CLI, as partners/partner-terms.db.test.mjs runs its transaction (SUPABASE_CLI names the
 * binary when `supabase` is not on PATH). Skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { CONVERSATION_MOVES, conversationPatch } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers and runs the platform's sweeps"
      : false;

const stamp = Date.now().toString(36);
const PAST = "2026-01-01T00:00:00.000Z";
const COLUMNS = ["state", "paused_until", "snooze_until", "assignee_user_id"];

let db;
let tenantId;
let userId;
let n = 0;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `conversation-moves-${stamp}`, name: "conversation-moves" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
  const { data: user, error: uErr } = await db.auth.admin.createUser({
    email: `moves-${stamp}@example.test`,
    password: "a-long-test-password-1",
    email_confirm: true,
  });
  if (uErr) throw new Error(uErr.message);
  userId = user.user.id;
});

after(async () => {
  if (skip) return;
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
  if (userId) await db.auth.admin.deleteUser(userId).catch(() => {});
});

/** A thread with a person of its own, set to `row`. */
async function thread(row) {
  n += 1;
  const { data: contact, error } = await db
    .from("contacts")
    .insert({ tenant_id: tenantId, phone_e164: `+15555550${String(100 + n)}` })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const { data: conv, error: cErr } = await db
    .from("conversations")
    .insert({ tenant_id: tenantId, contact_id: contact.id, ...row })
    .select("id")
    .single();
  if (cErr) throw new Error(cErr.message);
  return { id: conv.id, contactId: contact.id };
}

/** The row as a move writes it: an instant read back as PostgREST spells it (+00:00) is the same instant as written (Z). */
const read = async (id) => {
  const { data, error } = await db.from("conversations").select(COLUMNS.join(", ")).eq("id", id).single();
  if (error) throw new Error(error.message);
  const at = (v) => (v === null ? null : new Date(v).toISOString());
  return { ...data, paused_until: at(data.paused_until), snooze_until: at(data.snooze_until) };
};

/** What a move leaves, over what the thread held: the table's patch on top of the row. */
const after_ = (before_, move, input = {}) => ({ ...before_, ...conversationPatch(move, input) });

test(
  "expire_stale_pauses writes pause_expired's patch to a thread whose pause ran out, and leaves a live pause alone",
  { skip },
  async () => {
    const stale = { state: "needs_human", paused_until: PAST, snooze_until: null, assignee_user_id: userId };
    const live = { ...stale, paused_until: new Date(Date.now() + 3_600_000).toISOString() };
    const a = await thread(stale);
    const b = await thread(live);
    const { error } = await db.rpc("expire_stale_pauses");
    assert.equal(error, null, error?.message);
    assert.deepEqual(await read(a.id), after_(stale, "pause_expired"));
    assert.deepEqual(await read(b.id), live, "a pause still running is nobody's to end");
  },
);

test(
  "wake_stale_snoozes writes snooze_expired's patch to a snooze that ran out, and leaves a live snooze alone",
  { skip },
  async () => {
    const stale = { state: "snoozed", paused_until: null, snooze_until: PAST, assignee_user_id: null };
    const live = { ...stale, snooze_until: new Date(Date.now() + 3_600_000).toISOString() };
    const a = await thread(stale);
    const b = await thread(live);
    const { error } = await db.rpc("wake_stale_snoozes");
    assert.equal(error, null, error?.message);
    assert.deepEqual(await read(a.id), after_(stale, "snooze_expired"));
    assert.deepEqual(await read(b.id), live);
  },
);

test(
  "a customer's message reopens an archived or snoozed thread as reopen says, and never overrides a person",
  { skip },
  async () => {
    const inbound = async (phone) => {
      n += 1;
      const { data, error } = await db.rpc("ingest_inbound", {
        p_tenant_id: tenantId,
        p_channel: "whatsapp",
        p_identity_external_id: phone.replace(/\D/g, ""),
        p_phone_e164: phone,
        p_wa_profile_name: null,
        p_message_external_id: `wamid.moves.${stamp}.${n}`,
        p_type: "text",
        p_body: "hello",
        p_channel_ts: new Date().toISOString(),
        p_media: null,
        p_meta: {},
        p_opt_out: false,
        p_opt_in: false,
      });
      if (error) throw new Error(error.message);
      return data.conversation_id;
    };
    const phones = { archived: "+15555550141", snoozed: "+15555550142", needs_human: "+15555550143" };
    const held = {
      archived: { state: "archived", paused_until: null, snooze_until: null, assignee_user_id: null },
      snoozed: {
        state: "snoozed",
        paused_until: null,
        snooze_until: new Date(Date.now() + 86_400_000).toISOString(),
        assignee_user_id: null,
      },
      needs_human: {
        state: "needs_human",
        paused_until: new Date(Date.now() + 3_600_000).toISOString(),
        snooze_until: null,
        assignee_user_id: userId,
      },
    };
    for (const [state, phone] of Object.entries(phones)) {
      const id = await inbound(phone); // the first message makes the person and the thread
      await db.from("conversations").update(held[state]).eq("id", id);
      assert.equal(await inbound(phone), id, "the same thread");
      const now = await read(id);
      if (CONVERSATION_MOVES.reopen.from.includes(state)) assert.deepEqual(now, after_(held[state], "reopen"), state);
      else assert.deepEqual(now, held[state], `${state}: a customer never overrides a person`);
    }
  },
);

test("the columns every move writes are the columns the session role may update on a thread", { skip }, () => {
  const r = spawnSync(
    CLI,
    [
      "db",
      "query",
      "--local",
      "--output-format",
      "json",
      "select column_name from information_schema.column_privileges where table_schema = 'public' and table_name = 'conversations' and grantee = 'authenticated' and privilege_type = 'UPDATE' order by 1",
    ],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const out = r.stdout ?? "";
  const answer = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
  const granted = answer.rows.map((row) => row.column_name);
  const written = new Set();
  for (const move of Object.keys(CONVERSATION_MOVES)) {
    for (const col of Object.keys(conversationPatch(move, { until: PAST, user: "u", now: PAST }))) written.add(col);
  }
  assert.deepEqual([...written].sort(), granted.sort(), "the moves write exactly the granted columns");
});
