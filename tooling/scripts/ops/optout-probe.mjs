/**
 * A throwaway opted-out conversation, for verifying the live send gates end to
 * end: the reply route's refusal, the composer's locked state, and the
 * outbound_send job's last check. The unit and integration tests cover the
 * layers below; this one exercises the ones only a signed-in browser reaches.
 *
 *   node tooling/scripts/ops/optout-probe.mjs create           # dry run
 *   node tooling/scripts/ops/optout-probe.mjs create --apply
 *   node tooling/scripts/ops/optout-probe.mjs clean --apply
 *
 * This writes to whatever database SUPABASE_URL points at, which in practice
 * is production, so it follows the house rules for that: dry-run by default,
 * idempotent, a JSONL record of every mutation, and --apply to mean it.
 *
 * The probe is identified by BOTH a reserved phone number and an exact display
 * name, and `clean` deletes only rows matching both. A phone-prefix match
 * would be one typo away from deleting a real customer's history.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PHONE = "+19995550000";
const NAME = "Opt-out probe";
const LOG = "tooling/scripts/optout-probe.log.jsonl";

const mode = process.argv[2] ?? "create";
const APPLY = process.argv.includes("--apply");
if (!["create", "clean"].includes(mode)) throw new Error(`unknown mode "${mode}" (create|clean)`);

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REF_CONV } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const stamp = new Date().toISOString();
function record(action, detail) {
  console.log(`${APPLY ? "APPLY" : "DRY  "}  ${action}  ${JSON.stringify(detail)}`);
  if (APPLY) fs.appendFileSync(LOG, JSON.stringify({ at: stamp, mode, action, ...detail }) + "\n");
}

/** Probe rows only: the reserved number AND the exact name. */
async function probeContacts() {
  const { data, error } = await db
    .from("contacts")
    .select("id, tenant_id, phone_e164, display_name")
    .eq("phone_e164", PHONE)
    .eq("display_name", NAME);
  if (error) throw new Error(error.message);
  return data ?? [];
}

if (mode === "clean") {
  // Every tenant, not just one: an earlier run created a probe under a tenant
  // picked arbitrarily, and a tenant-scoped clean leaves that one behind.
  const contacts = await probeContacts();
  for (const c of contacts) {
    const { data: convs } = await db.from("conversations").select("id").eq("contact_id", c.id);
    for (const conv of convs ?? []) {
      record("delete messages", { conversation: conv.id });
      record("delete escalations", { conversation: conv.id });
      record("delete conversation", { conversation: conv.id });
      if (APPLY) {
        await db.from("messages").delete().eq("conversation_id", conv.id);
        await db.from("escalations").delete().eq("conversation_id", conv.id);
        await db.from("conversations").delete().eq("id", conv.id);
      }
    }
    record("delete contact", { contact: c.id, tenant: c.tenant_id });
    if (APPLY) {
      await db.from("events").delete().eq("subject_id", c.id);
      await db.from("contact_identities").delete().eq("contact_id", c.id);
      await db.from("contacts").delete().eq("id", c.id);
    }
  }
  console.log(`${contacts.length} probe contact(s)${APPLY ? " removed" : " would be removed — pass --apply"}`);
  process.exit(0);
}

// Anchored to a REFERENCE conversation the operator can already see, so the
// probe lands in THEIR tenant. An arbitrary row puts it somewhere RLS hides,
// and the verification then reads its own 404 as a pass.
if (!REF_CONV) throw new Error("set REF_CONV to a conversation id visible to the operator");
const { data: refRow, error: refErr } = await db.from("conversations").select("tenant_id").eq("id", REF_CONV).single();
if (refErr) throw new Error(`reference conversation: ${refErr.message}`);
const tenantId = refRow.tenant_id;

// Idempotent: reuse the probe if a previous run left one.
const existing = (await probeContacts()).find((c) => c.tenant_id === tenantId);
record("upsert contact", { tenant: tenantId, phone: PHONE, reusing: existing?.id ?? null });
if (!APPLY) {
  console.log("dry run — pass --apply to write");
  process.exit(0);
}

let contactId = existing?.id;
if (!contactId) {
  const { data, error } = await db
    .from("contacts")
    .insert({
      tenant_id: tenantId,
      phone_e164: PHONE,
      wa_profile_name: NAME,
      display_name: NAME,
      consent: "opted_out",
      dnc: true,
      consent_source: "customer_message",
      consent_updated_at: stamp,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  contactId = data.id;
}

const { data: conv, error: cErr } = await db
  .from("conversations")
  .upsert(
    {
      tenant_id: tenantId,
      contact_id: contactId,
      state: "open",
      last_message_at: stamp,
      last_inbound_at: stamp,
      last_wa_inbound_at: stamp, // window OPEN, so only consent can block a send
    },
    { onConflict: "tenant_id,contact_id" },
  )
  .select("id")
  .single();
if (cErr) throw new Error(cErr.message);

record("created", { tenantId, contactId, conversationId: conv.id });
console.log(JSON.stringify({ tenantId, contactId, conversationId: conv.id }));
