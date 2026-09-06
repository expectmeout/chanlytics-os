/**
 * Rewrite a held draft to the owner's instruction — the text whisper.
 *
 * The phone receptionist can be whispered to mid-call; the WhatsApp one
 * could only be stopped. Now a draft that is waiting its turn can be sent
 * back with one line — "mention Saturday is full", "shorter, in Spanish" —
 * and rewritten by the same brain, with the same prompt, the same memory and
 * the same rules, then queued again to wait like the first one did.
 *
 * Order matters and is deliberate: the new draft is queued FIRST, then the
 * old one is retired with its job. If the new one cannot be queued the old
 * one still stands; if the old one cannot be retired the new one is taken
 * back, so two drafts never race to the customer. A rewrite that quotes a
 * price is refused and the old draft is left alone.
 *
 * Internal endpoint — x-diag-key, called by the dashboard's steer route after
 * RLS has proved the draft belongs to the operator's workspace and the role
 * door has been checked there. Body: { message_id, text }.
 */
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { loadTenantRuntime } from "../../lib/tenant-runtime.js";
import { readThreadState, readLeadContext, describeLead } from "../../lib/workspace/db.js";
import type { RoutedChannel } from "../../lib/workspace/db.js";
import { resolveSystemPrompt, describeNow, frameSteer, violatesNoPrices, replyDelayMs } from "../../lib/workspace/contracts.js";
import { cancelJobsFor } from "../../lib/workspace/jobs.js";
import { generateReply } from "../../lib/brain.js";
import { queueDraft } from "../../lib/draft-queue.js";

const MAX_CHARS = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const log = {
  warn: (event: string, fields: Record<string, unknown> = {}) => console.warn(event, JSON.stringify(fields)),
  error: (event: string, fields: Record<string, unknown> = {}) => console.error(event, JSON.stringify(fields)),
};

export async function POST(request: Request): Promise<Response> {
  if (!process.env.DIAG_KEY || request.headers.get("x-diag-key") !== process.env.DIAG_KEY) {
    return json(403, { ok: false });
  }
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { ok: false, error: "no_model_key" });

  let body: { message_id?: string; text?: string } = {};
  try { body = JSON.parse(await request.text()); } catch { /* below */ }
  const messageId = String(body.message_id || "");
  const text = String(body.text || "").trim();
  if (!UUID.test(messageId) || !text || text.length > MAX_CHARS) {
    return json(400, { ok: false, error: `message_id + text (1-${MAX_CHARS} chars) required` });
  }

  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });

  const { data: m, error: mErr } = await db
    .from("messages")
    .select("id, tenant_id, conversation_id, contact_id, sender, status, meta")
    .eq("id", messageId)
    .maybeSingle();
  if (mErr) return json(500, { ok: false, error: "message_read_failed" });
  if (!m) return json(404, { ok: false, error: "not_found" });
  if (m.sender !== "ai" || m.status !== "queued") return json(409, { ok: false, error: "not_a_held_draft" });

  const { data: conv } = await db
    .from("conversations")
    .select("id, contacts (phone_e164)")
    .eq("id", m.conversation_id)
    .maybeSingle();
  const phone = conv?.contacts?.phone_e164 ?? null;
  if (!phone) return json(409, { ok: false, error: "no_phone" });

  const { data: ch } = await db
    .from("tenant_channels")
    .select("id, tenant_id, kind, status, number_e164, credentials_ref, config")
    .eq("tenant_id", m.tenant_id)
    .eq("kind", "whatsapp")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!ch) return json(409, { ok: false, error: "no_whatsapp_channel" });
  const routed: RoutedChannel = {
    channelId: ch.id, tenantId: ch.tenant_id, kind: ch.kind, numberE164: ch.number_e164, credentialsRef: ch.credentials_ref, config: ch.config,
  };
  const rt = await loadTenantRuntime(db, routed);
  if (!rt.brain) return json(409, { ok: false, error: rt.configBroken ? "config_broken" : "no_persona" });

  // The same memory the reply was written from. The held draft itself is not
  // in it (only delivered replies are), and the customer's latest words are
  // its last turn — those are what the rewrite answers.
  const thread = await readThreadState(db, m.tenant_id, m.conversation_id, null);
  const lastUser = [...thread.history].reverse().find((t) => t.role === "user");
  if (!lastUser) return json(409, { ok: false, error: "nothing_to_answer" });

  let leadNote: string | undefined;
  try {
    leadNote = describeLead(await readLeadContext(db, m.tenant_id, phone, 1));
  } catch (e) {
    log.warn("steer_lead_context_unavailable", { error: e instanceof Error ? e.message : String(e) });
  }

  const t0 = Date.now();
  let r: Awaited<ReturnType<typeof generateReply>>;
  try {
    r = await generateReply(
      thread.history,
      lastUser.content,
      resolveSystemPrompt(rt.brain, "whatsapp", rt.timezone, new Date(), rt.policy),
      rt.brain.fallbacks.error,
      leadNote,
      describeNow(rt.timezone, new Date(), rt.brain.profile?.closures),
      undefined,
      frameSteer(text),
    );
  } catch (e) {
    log.error("steer_brain_failed", { error: e instanceof Error ? e.message : String(e) });
    return json(502, { ok: false, error: "brain_failed" });
  }
  // The same second door the handler keeps: a price never goes out, and a
  // rewrite that would say one leaves the original draft where it was.
  if (violatesNoPrices(r.text)) {
    log.warn("steer_policy_block_price", { message_id: messageId });
    return json(409, { ok: false, error: "policy_block_price" });
  }

  const delayMs = typeof m.meta === "object" && m.meta && typeof (m.meta as { delay_ms?: unknown }).delay_ms === "number"
    ? (m.meta as { delay_ms: number }).delay_ms
    : replyDelayMs("veto", rt.policy?.reply?.limits);

  // New first, then retire the old — see the header.
  const newId = await queueDraft(db, {
    tenantId: m.tenant_id,
    conversationId: m.conversation_id,
    contactId: m.contact_id,
    toPhone: phone,
    body: r.text,
    delayMs,
    source: "steered",
    brainMeta: r.meta,
    extra: { steer: text, steered_from: m.id, escalate: r.escalate },
  }, log);
  if (!newId) return json(502, { ok: false, error: "could_not_queue" });

  const { error: cancelErr } = await db
    .from("messages")
    .update({ status: "canceled", error: { reason: "steered", replaced_by: newId } })
    .eq("id", m.id)
    .eq("status", "queued");
  if (cancelErr) {
    log.error("steer_retire_failed", { message_id: m.id, error: cancelErr.message });
    await db.from("messages").update({ status: "canceled", error: { reason: "steer_rolled_back" } }).eq("id", newId).eq("status", "queued");
    await cancelJobsFor(db, m.tenant_id, "outbound_send", "message_id", newId, process.env.QSTASH_TOKEN);
    return json(500, { ok: false, error: "could_not_retire_old_draft" });
  }
  await cancelJobsFor(db, m.tenant_id, "outbound_send", "message_id", m.id, process.env.QSTASH_TOKEN);

  // The words are the owner's and the model's and stay out of the log.
  console.log("admin_steer", JSON.stringify({ message_id: m.id, new_message_id: newId, chars: text.length, ms: Date.now() - t0, escalate: r.escalate, delay_ms: delayMs }));
  return json(200, { ok: true, message_id: newId, text: r.text, meta: r.meta ?? null, escalate: r.escalate, delay_ms: delayMs });
}
