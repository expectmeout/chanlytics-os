import crypto from "node:crypto";
import { AppError, waWindow } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import { withRoute } from "@/server/with-route";
import { loadConversation, recordDecision, resolveOpenEscalation, PAUSE_MS, SEND_GRACE_MS } from "@/server/verbs";
import { schedule, mirrorBlobPause } from "@/server/service";

/**
 * Human reply (§4/§6): honest by API shape. Inside the 24h window -> freeform;
 * outside -> approved template only. The send is NEVER synchronous: the row
 * sits status='queued' through a cancel window (the honest undo), then the
 * outbound_send job fires it. A dashboard reply implicitly pauses the AI (D10).
 */
export const POST = withRoute(async (req, ctx) => {
  const conv = await loadConversation(ctx, String(ctx.params.id ?? ""));
  if (!conv.phone_e164) throw new AppError("conflict", "Conversation has no phone identity.");

  const body = (await req.json().catch(() => ({}))) as {
    text?: string;
    template?: { name: string; language: string; params?: string[] };
  };
  const window = waWindow(conv.last_wa_inbound_at);

  // idempotency: a replayed POST returns the original envelope, never a double text
  const idemKey = req.headers.get("idempotency-key");
  if (idemKey) {
    const { data: prior } = await ctx.supabase
      .from("idempotency_keys")
      .select("response")
      .eq("tenant_id", conv.tenant_id)
      .eq("key", idemKey)
      .maybeSingle();
    if (prior?.response) return prior.response as Json;
  }

  let messageBody: string | null;
  let templateVars: Json | null = null;
  let templateName: string | null = null;
  let jobTemplate: { name: string; language: string; params: string[] } | undefined;

  if (window.open) {
    if (!body.text?.trim()) throw new AppError("validation", "Reply text is required.");
    messageBody = body.text.trim();
  } else {
    if (!body.template?.name) {
      throw new AppError(
        "window_closed",
        "The 24-hour WhatsApp window is closed — replies must use an approved template.",
      );
    }
    const { data: tpl } = await ctx.supabase
      .from("templates")
      .select("name, language, body_preview, meta_status")
      .eq("tenant_id", conv.tenant_id)
      .eq("channel", "whatsapp")
      .eq("name", body.template.name)
      .eq("language", body.template.language)
      .maybeSingle();
    if (!tpl || tpl.meta_status !== "approved") {
      throw new AppError("validation", "Template not found or not approved.");
    }
    // Params are TENANT FACTS (E4): resolved here from the control plane, so
    // the browser neither knows nor ships any workspace's booking link. A
    // client-supplied params array is accepted only if config has nothing —
    // and once every tenant has a brain profile, that path dies too.
    let params = body.template.params ?? [];
    if (!params.length) {
      const { data: cfgRow } = await ctx.supabase
        .from("tenant_config")
        .select("config")
        .eq("tenant_id", conv.tenant_id)
        .maybeSingle();
      const brain = (cfgRow?.config as { brain?: { business_name?: string; booking_link?: string } } | null)?.brain;
      if (brain?.business_name && brain.booking_link) {
        params = [brain.business_name, brain.booking_link.replace(/^https?:[/][/]/, "")];
      }
    }
    if (!params.length) throw new AppError("validation", "This workspace has no template facts configured yet.");
    templateName = tpl.name;
    templateVars = { language: tpl.language, params } as Json;
    messageBody = params.reduce(
      (acc, p, i) => acc.replaceAll(`{{${i + 1}}}`, p),
      tpl.body_preview ?? `[template ${tpl.name}]`,
    );
    jobTemplate = { name: tpl.name, language: tpl.language, params };
  }

  // ORDER MATTERS: pause the receptionist and claim the thread BEFORE any row
  // exists that a job could send. A mirror failure here means nothing was
  // queued, so the operator's "it failed" is the truth (previously the text
  // still went out 15s later while the API reported failure).
  const pauseUntil = Date.now() + PAUSE_MS;
  await mirrorBlobPause(conv.phone_e164, pauseUntil);
  await ctx.supabase
    .from("conversations")
    .update({
      state: "needs_human",
      paused_until: new Date(pauseUntil).toISOString(),
      snooze_until: null,
      assignee_user_id: ctx.userId,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conv.id);
  await schedule(conv.tenant_id, "pause_expire", new Date(pauseUntil), { conversation_id: conv.id });

  const contentHash = crypto.createHash("sha256").update(messageBody ?? "").digest("hex").slice(0, 32);
  const { data: msg, error } = await ctx.supabase
    .from("messages")
    .insert({
      tenant_id: conv.tenant_id,
      conversation_id: conv.id,
      contact_id: conv.contact_id,
      channel: "whatsapp",
      direction: "outbound",
      sender: "human",
      sent_by: ctx.userId,
      type: jobTemplate ? "template" : "text",
      body: messageBody,
      template_name: templateName,
      template_vars: templateVars,
      content_hash: contentHash,
      status: "queued",
    })
    .select("id")
    .single();
  if (error) throw new Error(`reply insert: ${error.message}`);

  const dueAt = new Date(Date.now() + SEND_GRACE_MS);
  try {
    await schedule(conv.tenant_id, "outbound_send", dueAt, {
      message_id: msg.id,
      conversation_id: conv.id,
      to_phone: conv.phone_e164,
      ...(jobTemplate ? { template: jobTemplate } : { body: messageBody }),
    } as unknown as Json);
  } catch (e) {
    // never leave an orphan queued row that silently never sends
    await ctx.supabase.from("messages").update({ status: "canceled" }).eq("id", msg.id);
    throw e;
  }

  const decisionId = await recordDecision(ctx, conv.tenant_id, "conversation", conv.id, "reply", {
    message_id: msg.id,
    window_open: window.open,
    template: templateName,
  });
  await resolveOpenEscalation(ctx, conv.id, decisionId);

  const response = {
    message_id: msg.id,
    status: "queued",
    cancelable_until: dueAt.toISOString(),
    window_open: window.open,
  };
  if (idemKey) {
    await ctx.supabase.from("idempotency_keys").insert({
      tenant_id: conv.tenant_id,
      key: idemKey,
      route: "reply",
      request_hash: contentHash,
      response: response as unknown as Json,
    });
  }
  return response;
});
