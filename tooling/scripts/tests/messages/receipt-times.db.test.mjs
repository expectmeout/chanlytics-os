/**
 * A receipt keeps its time -- on a real database.
 *
 * 00111 stamps meta.status_at.<status> on every status change, in the guard
 * that already runs there. A trigger is exactly what reading source cannot
 * prove, so this runs against Postgres in the database workflow; skipped
 * without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes messages"
      : false;

let db;
let tenantId;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `receipts-${Date.now()}`, name: "Receipts" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

test(
  "sent, delivered, read: each receipt leaves its own time on the row, and the last one is what status_updated_at knows",
  { skip },
  async () => {
    const { data: contact, error: cErr } = await db
      .from("contacts")
      .insert({ tenant_id: tenantId, phone_e164: "+15550009001" })
      .select("id")
      .single();
    assert.equal(cErr, null);
    const { data: conv, error: vErr } = await db
      .from("conversations")
      .insert({ tenant_id: tenantId, contact_id: contact.id })
      .select("id")
      .single();
    assert.equal(vErr, null);
    const { data: msg, error: mErr } = await db
      .from("messages")
      .insert({
        tenant_id: tenantId,
        conversation_id: conv.id,
        contact_id: contact.id,
        channel: "whatsapp",
        direction: "outbound",
        sender: "human",
        type: "template",
        body: "Hi",
        external_id: `wamid.test.${Date.now()}`,
        status: "sent",
        meta: { source: "broadcast", broadcast_id: "00000000-0000-4000-8000-000000000001" },
      })
      .select("id, meta")
      .single();
    assert.equal(mErr, null);
    assert.equal(msg.meta.status_at, undefined, "an insert is not a receipt");
    for (const status of ["delivered", "read"]) {
      const { error } = await db.from("messages").update({ status }).eq("id", msg.id);
      assert.equal(error, null);
    }
    const { data: after_, error } = await db
      .from("messages")
      .select("status, status_updated_at, meta")
      .eq("id", msg.id)
      .single();
    assert.equal(error, null);
    assert.equal(after_.status, "read");
    assert.deepEqual(Object.keys(after_.meta.status_at).sort(), ["delivered", "read"]);
    assert.ok(after_.meta.status_at.delivered <= after_.meta.status_at.read);
    assert.equal(after_.meta.source, "broadcast", "the rest of meta is kept");
    assert.equal(after_.meta.broadcast_id, "00000000-0000-4000-8000-000000000001");
    // Monotone still: a receipt that goes backwards is refused as before.
    const { error: back } = await db.from("messages").update({ status: "delivered" }).eq("id", msg.id);
    assert.match(back?.message ?? "", /monotone/);
  },
);

test(
  "an email whose send timed out may still be settled by its receipt; any other failed row stays terminal (00177)",
  { skip },
  async () => {
    const mk = async (channel, error) => {
      const { data: contact } = await db
        .from("contacts")
        .insert(
          channel === "email"
            ? { tenant_id: tenantId, email: `t-${crypto.randomUUID()}@fixture-guard.example` }
            : { tenant_id: tenantId, phone_e164: `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}` },
        )
        .select("id")
        .single();
      const { data: conv } = await db
        .from("conversations")
        .insert({ tenant_id: tenantId, contact_id: contact.id })
        .select("id")
        .single();
      const { data: msg, error: e } = await db
        .from("messages")
        .insert({
          tenant_id: tenantId,
          conversation_id: conv.id,
          contact_id: contact.id,
          channel,
          direction: "outbound",
          sender: "ai",
          type: "text",
          body: "Hi",
          status: "failed",
          error,
        })
        .select("id")
        .single();
      assert.equal(e, null, e?.message);
      return msg.id;
    };
    const unknown = await mk("email", { http_status: 0, body: "timeout", outcome: "unknown" });
    assert.equal((await db.from("messages").update({ status: "delivered" }).eq("id", unknown)).error, null);
    const settled = await db.from("messages").select("status").eq("id", unknown).single();
    assert.equal(settled.data.status, "delivered", "its receipt settled it");

    const plain = await mk("email", { http_status: 500, body: "boom" });
    assert.match(
      (await db.from("messages").update({ status: "delivered" }).eq("id", plain)).error?.message ?? "",
      /terminal/,
    );
    const sms = await mk("sms", { http_status: 0, body: "timeout", outcome: "unknown" });
    assert.match(
      (await db.from("messages").update({ status: "delivered" }).eq("id", sms)).error?.message ?? "",
      /terminal/,
    );
    const toCanceled = await mk("email", { http_status: 0, body: "timeout", outcome: "unknown" });
    assert.match(
      (await db.from("messages").update({ status: "canceled" }).eq("id", toCanceled)).error?.message ?? "",
      /terminal/,
      "an unknown outcome is never canceled",
    );
  },
);
