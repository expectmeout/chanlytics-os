/**
 * The message status machine, against REAL Postgres (throwaway rows,
 * self-cleaning, skips without service credentials).
 *
 * The transition that matters is sent -> canceled. `messages_guard` ranks
 * statuses to enforce monotonicity, but 'canceled' fell into `else 9`, so
 * sent(2) -> canceled(9) passed the `new_rank < old_rank` test, and the
 * terminal-state check above it only guarded transitions OUT of canceled.
 *
 * That is not cosmetic: readThreadState excludes canceled rows from the bot's
 * history, so cancelling a message the customer already received makes the
 * receptionist forget it ever said it — and contradict itself in the next
 * reply. It also makes the operator's Inbox disagree with the customer's phone.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY ? "no service-role credentials in env" : false;

let db;
let tenantId;
let contactId;
let conversationId;
const made = [];

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data: ts } = await db.from("tenants").select("id, slug");
  tenantId = (ts.find((t) => t.slug === "chanlytics-smoke-test") ?? ts[0]).id;
  // Plain insert: contacts_tenant_phone_uq is PARTIAL and PostgREST cannot
  // target it with on_conflict (that is the bug this suite caught in shipped code).
  const { data: c, error: cErr } = await db
    .from("contacts")
    .insert({ tenant_id: tenantId, phone_e164: `+1999556${String(Date.now()).slice(-4)}`, display_name: "Lifecycle probe" })
    .select("id").single();
  if (cErr) throw new Error(`fixture contact: ${cErr.message}`);
  contactId = c.id;
  const { data: conv, error: vErr } = await db
    .from("conversations")
    .upsert({ tenant_id: tenantId, contact_id: contactId }, { onConflict: "tenant_id,contact_id" })
    .select("id").single();
  if (vErr) throw new Error(`fixture conversation: ${vErr.message}`);
  conversationId = conv.id;
});

after(async () => {
  if (skip || !contactId) return;
  await db.from("messages").delete().eq("conversation_id", conversationId);
  await db.from("events").delete().eq("subject_id", contactId);
  await db.from("conversations").delete().eq("id", conversationId);
  await db.from("contacts").delete().eq("id", contactId);
});

async function newMessage(status) {
  const { data, error } = await db
    .from("messages")
    .insert({
      tenant_id: tenantId, conversation_id: conversationId, contact_id: contactId,
      channel: "whatsapp", direction: "outbound", sender: "human",
      type: "text", body: "lifecycle probe", status,
    })
    .select("id").single();
  if (error) throw new Error(error.message);
  made.push(data.id);
  return data.id;
}

test("a queued message can still be canceled", { skip }, async () => {
  const id = await newMessage("queued");
  const { data, error } = await db.from("messages")
    .update({ status: "canceled" }).eq("id", id).select("id");
  assert.equal(error, null, error?.message);
  assert.equal(data.length, 1, "the honest undo must keep working");
});

test("a SENT message can never be canceled", { skip }, async () => {
  // THE REGRESSION. Before 00015 this succeeded.
  const id = await newMessage("sent");
  const { error } = await db.from("messages")
    .update({ status: "canceled" }).eq("id", id).select("id");
  assert.ok(error, "sent -> canceled was accepted");
  assert.match(error.message, /already sent cannot be canceled/);
});

test("a delivered message can never be canceled either", { skip }, async () => {
  const id = await newMessage("sent");
  await db.from("messages").update({ status: "delivered" }).eq("id", id);
  const { error } = await db.from("messages")
    .update({ status: "canceled" }).eq("id", id).select("id");
  assert.ok(error, "delivered -> canceled was accepted");
});

test("sent -> failed stays legal — Meta reports failures after accepting", { skip }, async () => {
  // The fix must not break the real delivery-receipt path.
  const id = await newMessage("sent");
  const { error } = await db.from("messages")
    .update({ status: "failed" }).eq("id", id).select("id");
  assert.equal(error, null, error?.message);
});

test("status is still monotone and canceled is still terminal", { skip }, async () => {
  const id = await newMessage("queued");
  await db.from("messages").update({ status: "sent" }).eq("id", id);
  const back = await db.from("messages").update({ status: "queued" }).eq("id", id).select("id");
  assert.ok(back.error, "sent -> queued was accepted");

  const c = await newMessage("queued");
  await db.from("messages").update({ status: "canceled" }).eq("id", c);
  const revive = await db.from("messages").update({ status: "sent" }).eq("id", c).select("id");
  assert.ok(revive.error, "canceled -> sent was accepted");
});

test("a conditional update is how a race is detected, not an error", { skip }, async () => {
  // Both the cancel route and the send job now qualify their UPDATE with
  // .eq("status","queued"). The loser gets zero rows and success — never an
  // exception — which is exactly why both call sites must count rows.
  const id = await newMessage("queued");
  await db.from("messages").update({ status: "sent" }).eq("id", id); // the job won
  const { data, error } = await db.from("messages")
    .update({ status: "canceled" }).eq("id", id).eq("status", "queued").select("id");
  assert.equal(error, null, "a lost race must not raise");
  assert.equal(data.length, 0, "the loser must see zero rows affected");
});
