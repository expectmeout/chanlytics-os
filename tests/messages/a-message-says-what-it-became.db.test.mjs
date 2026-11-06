/**
 * 00305 on a real Postgres: message_stamp_handled says what a customer's message became (the Reports lenses spec, K1)
 * beside processed_at and never over it. The deadman sweep (apps/edge/lib/receptionist/unfinished.ts) reads
 * meta.processed_at, so a stamp that cost a key would show an answered customer as unanswered: both writes land,
 * whichever comes first and when both come at once. The first answer stands, no intent is no key, and a row that is
 * not this workspace's inbound message is left alone. Runs against the database `supabase start` builds on this
 * machine, never production.
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
      ? "refusing a database that is not on this machine: this suite writes customers' messages"
      : false;

let db;
let tenantId;
let otherId;
let seq = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const at = Date.now();
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-handled-${at}`, name: "Harbor Handled" })
      .select("id")
      .single(),
  ).id;
  otherId = ok(
    await db
      .from("tenants")
      .insert({ slug: `acme-handled-${at}`, name: "Acme Handled" })
      .select("id")
      .single(),
  ).id;
});

after(async () => {
  if (skip) return;
  for (const id of [tenantId, otherId]) {
    if (!id) continue;
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
});

/** A customer's WhatsApp message, taken in the way the edge takes it in; answers its row's ids. */
async function inbound() {
  seq += 1;
  const phone = `+1555013${9000 + seq}`;
  return ok(
    await db.rpc("ingest_inbound", {
      p_tenant_id: tenantId,
      p_channel: "whatsapp",
      p_identity_external_id: phone.slice(1),
      p_phone_e164: phone,
      p_wa_profile_name: null,
      p_message_external_id: `wamid.handled.${Date.now()}.${seq}`,
      p_type: "text",
      p_body: "do you have time on Saturday?",
      p_channel_ts: null,
      p_media: null,
      p_meta: { raw_type: "text" },
      p_opt_out: false,
      p_opt_in: false,
    }),
  );
}
const metaOf = async (id) => ok(await db.from("messages").select("meta").eq("id", id).single()).meta;
const stampHandled = (tenant, id, handled, intent) =>
  db.rpc("message_stamp_handled", {
    p_tenant_id: tenant,
    p_message_id: id,
    p_handled: handled,
    ...(intent ? { p_intent: intent } : {}),
  });
const processed = (id) => db.rpc("mark_processed", { p_tenant_id: tenantId, p_message_id: id });

test(
  "a stamp lands beside processed_at and the row's own keys, whichever write comes first, and when both come at once",
  { skip },
  async () => {
    const first = await inbound();
    ok(await stampHandled(tenantId, first.message_id, "ai", "hours"));
    ok(await processed(first.message_id));
    const second = await inbound();
    ok(await processed(second.message_id));
    const processedAt = (await metaOf(second.message_id)).processed_at;
    ok(await stampHandled(tenantId, second.message_id, "handoff", "money"));
    assert.equal(
      (await metaOf(second.message_id)).processed_at,
      processedAt,
      "a stamp leaves processed_at as mark_processed wrote it: the same moment, not a later one",
    );
    const third = await inbound();
    const both = await Promise.all([
      processed(third.message_id),
      stampHandled(tenantId, third.message_id, "held", "pricing"),
    ]);
    for (const r of both) ok(r);
    for (const [row, handled, intent] of [
      [first, "ai", "hours"],
      [second, "handoff", "money"],
      [third, "held", "pricing"],
    ]) {
      const meta = await metaOf(row.message_id);
      assert.equal(meta.raw_type, "text", "the ingest's own key stays");
      assert.ok(Date.parse(meta.processed_at) > 0, "processed_at stays: the deadman sweep reads it");
      assert.deepEqual([meta.handled, meta.intent], [handled, intent]);
    }
  },
);

test(
  "the first answer stands, no intent is no key (absent, never null), and a stamp alone never marks a message processed",
  { skip },
  async () => {
    const m = await inbound();
    ok(await stampHandled(tenantId, m.message_id, "blocked"));
    ok(await stampHandled(tenantId, m.message_id, "ai", "hours"));
    const meta = await metaOf(m.message_id);
    assert.equal(meta.handled, "blocked");
    assert.equal("intent" in meta, false);
    assert.equal(
      "processed_at" in meta,
      false,
      "a stamp never marks a message processed: the deadman sweep reads processed_at to find an unfinished customer",
    );
  },
);

test(
  "another workspace's id, an outbound row and an unknown id change nothing, and say nothing",
  { skip },
  async () => {
    const m = await inbound();
    ok(await stampHandled(otherId, m.message_id, "ai"));
    assert.equal("handled" in (await metaOf(m.message_id)), false, "a stamp from another workspace reaches nothing");
    const out = ok(
      await db
        .from("messages")
        .insert({
          tenant_id: tenantId,
          conversation_id: m.conversation_id,
          contact_id: m.contact_id,
          channel: "whatsapp",
          direction: "outbound",
          sender: "ai",
          type: "text",
          body: "Yes, Saturday works.",
          status: "sent",
          meta: {},
        })
        .select("id")
        .single(),
    );
    ok(await stampHandled(tenantId, out.id, "ai"));
    assert.equal("handled" in (await metaOf(out.id)), false, "only an inbound message says what it became");
    ok(await stampHandled(tenantId, "00000000-0000-4000-8000-000000000000", "ai"));
  },
);
