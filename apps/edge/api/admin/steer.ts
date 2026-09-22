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
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import { loadTenantRuntime } from "../../lib/tenant-runtime.js";
import { readThreadState, readLeadContext, describeLead } from "../../lib/packages/db.js";
import type { RoutedChannel } from "../../lib/packages/db.js";
import {
  resolveSystemPrompt,
  describeNow,
  frameSteer,
  violatesNoPrices,
  replyDelayMs,
  fallbackMessages,
} from "../../lib/packages/contracts.js";
import { cancelJobsFor } from "../../lib/packages/jobs.js";
import { generateReply } from "../../lib/receptionist/brain.js";
import { queueDraft } from "../../lib/receptionist/draft-queue.js";
import { env } from "../../lib/env.js";
import { logger, errField } from "../../lib/log.js";

const MAX_CHARS = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const L = logger();

/**
 * The model as a port. Production passes nothing and gets the real brain; a
 * test hands in an answer, because lib/brain.ts speaks to the Anthropic SDK
 * and has no seam of its own. Anything else that may arrive in this position
 * carries no generateReply and changes nothing. BOTH branches are run in
 * tooling/scripts/tests/steer-door.test.mjs: most cases hand a brain in, and
 * the last three call POST the way Vercel calls it and watch the real brain
 * reach the model.
 */
export interface BrainPort {
  generateReply?: typeof generateReply;
}

export async function POST(request: Request, brain?: BrainPort | null): Promise<Response> {
  const ask = brain?.generateReply ?? generateReply;
  const auth = authorizeAdmin(request, "/api/admin/steer");
  if (!auth.ok) return auth.response;
  if (!env.ANTHROPIC_API_KEY) return json(503, { ok: false, error: "no_model_key" });

  let body: { message_id?: string; text?: string } = {};
  try {
    body = JSON.parse(await request.text());
  } catch {
    /* below */
  }
  const messageId = String(body.message_id || "");
  const text = String(body.text || "").trim();
  if (!UUID.test(messageId) || !text || text.length > MAX_CHARS) {
    return json(400, { ok: false, error: `message_id + text (1-${MAX_CHARS} chars) required` });
  }

  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });

  const { data: m, error: mErr } = await db
    .from("messages")
    .select("id, tenant_id, conversation_id, contact_id, sender, status, meta, channel")
    .eq("id", messageId)
    .maybeSingle();
  if (mErr) return json(500, { ok: false, error: "message_read_failed" });
  if (!m) return json(404, { ok: false, error: "not_found" });
  // A token minted for one workspace opens only that workspace's drafts.
  if (auth.workspace && m.tenant_id !== auth.workspace) return json(403, { ok: false, error: "workspace_mismatch" });
  if (m.sender !== "ai" || m.status !== "queued") return json(409, { ok: false, error: "not_a_held_draft" });

  const { data: conv } = await db
    .from("conversations")
    .select("id, contacts (phone_e164)")
    .eq("id", m.conversation_id)
    .maybeSingle();
  const phone = conv?.contacts?.phone_e164 ?? null;
  if (!phone) return json(409, { ok: false, error: "no_phone" });

  // The wire the draft is already on. A held reply to a text is an `sms` row,
  // and looking the tenant up on WhatsApp alone both refused every steer for a
  // texting-only workspace and, where a WhatsApp channel happened to exist,
  // rewrote the reply against the wrong channel.
  const channel: "whatsapp" | "sms" = m.channel === "sms" ? "sms" : "whatsapp";
  const { data: ch } = await db
    .from("tenant_channels")
    .select("id, tenant_id, kind, status, number_e164, credentials_ref, config, external_id")
    .eq("tenant_id", m.tenant_id)
    .eq("kind", channel)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!ch) return json(409, { ok: false, error: "no_channel" });
  const routed: RoutedChannel = {
    channelId: ch.id,
    tenantId: ch.tenant_id,
    kind: ch.kind,
    externalId: ch.external_id,
    numberE164: ch.number_e164,
    credentialsRef: ch.credentials_ref,
    config: ch.config,
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
    L.warn("steer_lead_context_unavailable", { error: errField(e) });
  }

  const t0 = Date.now();
  let r: Awaited<ReturnType<typeof generateReply>>;
  try {
    r = await ask(
      thread.history,
      lastUser.content,
      resolveSystemPrompt(rt.brain, "whatsapp", rt.timezone, new Date(), rt.policy, rt.known),
      fallbackMessages(rt.brain, rt.known).error,
      leadNote,
      describeNow(rt.timezone, new Date(), rt.brain.profile?.closures),
      undefined,
      frameSteer(text),
    );
  } catch (e) {
    L.error("steer_brain_failed", { error: errField(e) });
    return json(502, { ok: false, error: "brain_failed" });
  }
  // The same second door the handler keeps: a price never goes out, and a
  // rewrite that would say one leaves the original draft where it was.
  if (violatesNoPrices(r.text)) {
    L.warn("steer_policy_block_price", { message_id: messageId });
    return json(409, { ok: false, error: "policy_block_price" });
  }

  const delayMs =
    typeof m.meta === "object" && m.meta && typeof (m.meta as { delay_ms?: unknown }).delay_ms === "number"
      ? (m.meta as { delay_ms: number }).delay_ms
      : replyDelayMs("veto", rt.policy?.reply?.limits);

  // New first, then retire the old — see the header.
  const newId = await queueDraft(
    db,
    {
      tenantId: m.tenant_id,
      conversationId: m.conversation_id,
      contactId: m.contact_id,
      toPhone: phone,
      body: r.text,
      delayMs,
      source: "steered",
      brainMeta: r.meta,
      // The rewrite goes out on the wire the draft it replaces was written for.
      // Unsaid, the row defaulted to WhatsApp, so a steered text was sent over
      // WhatsApp to a number that had only ever texted — and the customer's own
      // thread never got its answer.
      channel,
      extra: { steer: text, steered_from: m.id, escalate: r.escalate },
    },
    L,
  );
  if (!newId) return json(502, { ok: false, error: "could_not_queue" });

  // Counted, not just attempted. The status filter is the whole guard: the
  // model takes seconds, and in those seconds the tick can claim the old
  // draft's job and send it. That update then matches NOTHING and reports no
  // error, and the rewrite queued a moment ago went out behind the reply it
  // was meant to replace — two answers to one message. Zero rows is the race,
  // and it is handled exactly like a failure to retire.
  const { data: retired, error: cancelErr } = await db
    .from("messages")
    .update({ status: "canceled", error: { reason: "steered", replaced_by: newId } })
    .eq("id", m.id)
    .eq("status", "queued")
    .select("id");
  if (cancelErr || !retired?.length) {
    const lost = !cancelErr;
    L.error(lost ? "steer_lost_race" : "steer_retire_failed", { message_id: m.id, error: cancelErr?.message });
    await db
      .from("messages")
      .update({ status: "canceled", error: { reason: lost ? "steer_lost_race" : "steer_rolled_back" } })
      .eq("id", newId)
      .eq("status", "queued");
    await cancelJobsFor(db, m.tenant_id, "outbound_send", "message_id", newId);
    return lost
      ? json(409, { ok: false, error: "already_sent" })
      : json(500, { ok: false, error: "could_not_retire_old_draft" });
  }
  await cancelJobsFor(db, m.tenant_id, "outbound_send", "message_id", m.id);

  // The words are the owner's and the model's and stay out of the log.
  L.info("admin_steer", {
    message_id: m.id,
    new_message_id: newId,
    chars: text.length,
    ms: Date.now() - t0,
    escalate: r.escalate,
    delay_ms: delayMs,
  });
  return json(200, {
    ok: true,
    message_id: newId,
    text: r.text,
    meta: r.meta ?? null,
    escalate: r.escalate,
    delay_ms: delayMs,
  });
}
