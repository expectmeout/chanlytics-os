import crypto from "node:crypto";
import { AppError, purposeOfTemplate, replyWindow } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import { z } from "zod";
import { write } from "@/server/route";

/** What a reply answers, fresh or replayed: the receipt this route stores is given back in its own shape. */
type ReplyReceipt = { message_id: string; status: string; cancelable_until: string; window_open: boolean; withdrawn_drafts: number };
import { assertCanSend, cancelPendingAiReply, conversationScope, recordDecision, replyChannelOf, resolveOpenEscalation, pauseMsFor, SEND_GRACE_MS } from "@/server/verbs";
import { schedule, cancelKindFor, mirrorBlobPause } from "@/server/service";

/**
 * Human reply (§4/§6): honest by API shape. Inside the 24h window -> freeform;
 * outside -> approved template only. The send is NEVER synchronous: the row
 * sits status='queued' through a cancel window (the honest undo), then the
 * outbound_send job fires it. A dashboard reply implicitly pauses the AI (D10).
 */
/**
 * How long a stored reply receipt is replayed instead of sending again.
 *
 * The key identifies the message, not the attempt, so this window is the ONLY
 * thing separating "a retry of the send that just timed out" from "the operator
 * meant to say that again". A retry arrives in seconds; deliberately repeating
 * the same words inside 30s is implausible, and the cost of getting it wrong is
 * asymmetric — a swallowed send reports success to the operator while the
 * customer receives nothing.
 */
const IDEMPOTENCY_WINDOW_MS = 30 * 1000;

/**
 * Validated at the door, not read hopefully.
 *
 * This route is the one that reaches a real person, and it took whatever the
 * body happened to contain. Two consequences it actually had: a reply over
 * 4,096 characters was stored twice, reported queued, and then failed
 * fifteen seconds later as an escalation plus an alert email, because that
 * is WhatsApp's limit and nothing checked it here; and `params` was accepted
 * from the client with no shape at all, so an operator session could put
 * arbitrary text into an approved template's variables — a foreign link in a
 * message the customer receives from the business.
 *
 * `.strict()` on the template so a stray field is a 400 here rather than
 * something silently ignored on the way to Meta. route() judges the body only
 * after the role, so a viewer learns nothing from the shape of a refusal.
 */
const ReplyBody = z
  .object({
    text: z.string().max(4096, "WhatsApp refuses a message over 4096 characters.").optional(),
    template: z
      .object({
        name: z.string().min(1).max(512),
        language: z.string().min(2).max(15),
        // Kept only so an older client's request still parses; the server
        // resolves params from the control plane and ignores these.
        params: z.array(z.string().max(1024)).max(10).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * POST /api/v1/conversations/:id/reply — the conversation is the row
 * (conversationScope): visible under RLS first, then the role judged where
 * the thread lives. Role before rate, by construction: a viewer must not
 * learn a customer's consent state from the shape of the refusal, and this
 * is the route that actually reaches a person.
 */
export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "reply",
  input: ReplyBody,
  handle: async ({ ctx, req, row: conv, input: body }) => {
    if (!conv.phone_e164) throw new AppError("conflict", "Conversation has no phone identity.");
    // An opt-out binds the humans too — refuse BEFORE anything is queued, so the
    // operator is told rather than watching a message sit in "queued" and then
    // silently cancel itself when the job re-checks.
    assertCanSend(conv);

    // Reply where the person last wrote: a text has no 24-hour window and no
    // templates, so the operator's words go out as they are.
    const replyChannel = await replyChannelOf(ctx, conv);
    const window = replyWindow(replyChannel, conv.last_wa_inbound_at);

    // Idempotency: a replayed POST returns the original envelope, never a double
    // text. The key identifies the INTENT (conversation + message body), so a
    // retry after a timeout carries the same one.
    //
    // A stored response is only honoured briefly. Retries happen in seconds; an
    // operator deliberately sending the same words an hour later means it, and
    // must not be answered with an hour-old receipt.
    //
    // The key is scoped to the CALLER and checked against the INTENT. The client
    // derives it from the thread and the words, which any member can predict,
    // so a stored receipt used to answer a colleague's identical send — and a
    // planted row could swallow a real one. A different body under the same
    // key is a different intent and goes through.
    const idemHeader = req.headers.get("idempotency-key");
    const idemKey = idemHeader ? `${ctx.userId}:${idemHeader}` : null;
    const intentHash = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 32);
    if (idemKey) {
      const { data: prior, error: priorErr } = await ctx.supabase
        .from("idempotency_keys")
        .select("response, created_at, request_hash")
        .eq("tenant_id", conv.tenant_id)
        .eq("key", idemKey)
        .maybeSingle();
      if (priorErr) throw new Error(`idempotency lookup: ${priorErr.message}`);
      const sameIntent = !prior?.request_hash || prior.request_hash === intentHash;
      if (prior?.response && sameIntent && Date.now() - new Date(prior.created_at).getTime() < IDEMPOTENCY_WINDOW_MS) {
        return prior.response as unknown as ReplyReceipt;
      }
    }

    let messageBody: string | null;
    let templateVars: Json | null = null;
    let templateName: string | null = null;
    let jobTemplate: { name: string; language: string; params: string[] } | undefined;

    if (window.open) {
      if (!body.text?.trim()) throw new AppError("validation", "Reply text is required.");
      messageBody = body.text.trim();
      if (replyChannel === "sms" && messageBody.length > 1600) throw new AppError("validation", "A text can be at most 1600 characters.");
    } else {
      if (!body.template?.name) {
        throw new AppError(
          "window_closed",
          "The 24-hour WhatsApp window is closed — replies must use an approved template.",
        );
      }
      const { data: tpl } = await ctx.supabase
        .from("templates")
        .select("name, language, body_preview, meta_status, category")
        .eq("tenant_id", conv.tenant_id)
        .eq("channel", "whatsapp")
        .eq("name", body.template.name)
        .eq("language", body.template.language)
        .maybeSingle();
      if (!tpl || tpl.meta_status !== "approved") {
        throw new AppError("validation", "Template not found or not approved.");
      }
      // Which yes this template needs is Meta's category, and the door asks
      // again at the wire. Asked here too, so the operator hears a sentence now
      // instead of finding a canceled row later.
      if (purposeOfTemplate(tpl.category) === "marketing" && conv.marketing_consent !== "opted_in") {
        throw new AppError("forbidden", "This template is a promotion, and this person has not said yes to offers. Use an appointment template, or ask them first.");
      }
      // Params are TENANT FACTS (E4): resolved here from the control plane, so
      // the browser neither knows nor ships any workspace's booking link.
      //
      // Config FIRST, then the client's — the inverse of what this did. The
      // sentence above has always been the stated rule, and the code preferred
      // whatever the browser sent, so an operator session could choose the link
      // that lands on the customer's phone.
      // Client params remain a fallback for a workspace with no config, and even
      // then they are length-bounded by the schema above.
      let params: string[] = [];
      {
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
      if (!params.length) params = body.template.params ?? [];
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
    const pauseUntil = Date.now() + await pauseMsFor(ctx, conv.tenant_id);
    await mirrorBlobPause(conv.tenant_id, conv.phone_e164, pauseUntil);
    // The result of this write is not optional. Under PG_READS this row IS the
    // receptionist's answer to "may I speak?", and this is the only one of the
    // five conversation verbs that ignored it: a transient failure meant the
    // operator's text went out, the API reported success, and the bot carried on
    // replying underneath them — the incident this pause exists to prevent.
    // Zero rows counts as failure for the same reason it does everywhere else in
    // this codebase: a forbidden or mis-targeted UPDATE reports success.
    const { data: paused, error: pauseErr } = await ctx.supabase
      .from("conversations")
      .update({
        state: "needs_human",
        paused_until: new Date(pauseUntil).toISOString(),
        snooze_until: null,
        assignee_user_id: ctx.userId,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conv.id)
      .select("id");
    if (pauseErr || !paused || paused.length === 0) {
      // Nothing has been queued yet, so refusing here is the honest outcome: the
      // operator retries instead of watching a reply they were told was sent.
      throw new AppError(
        "conflict",
        "Could not take this thread over just now, so nothing was sent. Try again.",
        409,
      );
    }
    // paused_until is the pause's only clock: expire_stale_pauses() ends it (00098).

    // The operator is REPLACING the receptionist's held reply, not queueing
    // behind it. Withdraw the draft before writing their own, or the customer
    // receives both — the override and the words it was meant to replace.
    const withdrawnDrafts = await cancelPendingAiReply(ctx, conv, (tid, k, v) =>
      cancelKindFor(tid, "outbound_send", k, v));

    const contentHash = crypto.createHash("sha256").update(messageBody ?? "").digest("hex").slice(0, 32);
    const { data: msg, error } = await ctx.supabase
      .from("messages")
      .insert({
        tenant_id: conv.tenant_id,
        conversation_id: conv.id,
        contact_id: conv.contact_id,
        channel: replyChannel,
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
      // So the UI can say "your reply replaced the receptionist's" rather than
      // leaving the operator to wonder whether the draft they saw still went out.
      withdrawn_drafts: withdrawnDrafts,
    };
    if (idemKey) {
      // Upsert, not insert: an expired key for the same intent already exists and
      // a plain insert would fail the unique constraint. created_at is refreshed
      // so the window runs from THIS send.
      const { error: idemErr } = await ctx.supabase.from("idempotency_keys").upsert(
        {
          tenant_id: conv.tenant_id,
          key: idemKey,
          route: "reply",
          request_hash: intentHash,
          response: response as unknown as Json,
          created_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,key" },
      );
      // Discarding this error is how a replay protection silently stops
      // protecting: the send already happened, so we log rather than fail it.
      if (idemErr) console.error("idempotency_record_failed", conv.id, idemErr.message);
    }
    return response;
  },
});
