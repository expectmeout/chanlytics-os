/**
 * What happens to the words: the veto window and the confidence dial (steps.ts holdPlan), the reply held as a
 * draft, the hold that could not be written, and the send, told apart by what the wire answered.
 */
import type { Json } from "@chanlytics/db";
import { holdPlan } from "./steps";
import { GO, type Answering } from "./context";
import type { Turn } from "./model-turn";

/** How long the reply waits and why, the draft when one was written, and the reply's quality signal. */
export async function planTheHold(at: Answering, turn: Turn) {
  const { replyMode, replyLimits, L, ports, db, tenantId, ing, from, wire, channel } = at;
  const { brainMeta, replyText, brainMs, escalate, photo } = turn;
  // THE VETO WINDOW.
  //
  // Under 'veto' the reply is written as `queued` and an outbound_send job is
  // scheduled instead of going straight to the wire. It travels the same last
  // door a human's reply does — consent re-checked at fire time, the sender
  // registry, the same status transitions — so the delay adds a window, not a
  // second send path.
  //
  // A text channel is not a phone call. Nobody expects a WhatsApp answer in
  // under a second, so the wait costs the customer nothing and buys the
  // business the only thing it could not previously have: a chance to redirect
  // the bot BEFORE the customer reads it, rather than apologising after.
  //
  // A VETO WINDOW that cannot be scheduled falls back to sending immediately:
  // the owner chose to auto-send with a chance to undo, a late reply is a
  // worse outcome than an un-vetoed one, and the fallback is recorded below.
  // A LOW-CONFIDENCE HOLD that cannot be scheduled sends nothing: the owner
  // said a reply the model is not sure of does not send itself, and a
  // database that is having a bad minute is not permission. That branch is
  // a few lines below the fallback event.
  // replyLimits is the same row read above for the daily cap and the pause.
  // THE CONFIDENCE DIAL rides on the same window: under 'auto' a reply the
  // model is not sure enough about waits where a vetoed one would
  // (steps.ts/holdPlan; limits.min_confidence, 0 or absent is off).
  const plan = holdPlan(replyMode, replyLimits, brainMeta);
  const { delayMs, heldForConfidence } = plan;
  if (heldForConfidence)
    L.info("wa_held_low_confidence", { confidence: brainMeta?.confidence, min: plan.minConfidence, delay_ms: delayMs });
  const queued =
    delayMs > 0
      ? await ports.persist.queueReply(
          db,
          tenantId,
          ing,
          from,
          wire(replyText),
          delayMs,
          L,
          plan.source,
          brainMeta,
          channel,
        )
      : false;
  // The quality signal on this reply's usage event: how sure, how fast,
  // whether it waited, whether it handed off. The diagnostics read the day
  // back from these; a Reports tile can, later.
  const replyQuality = {
    intent: brainMeta?.intent ?? null,
    confidence: brainMeta?.confidence ?? null,
    language: brainMeta?.language ?? null,
    latency_ms: brainMs,
    // What the reply actually did. This read `delayMs > 0` alone, so a reply
    // whose hold could not be scheduled — sent to the customer immediately, a
    // few lines below — was recorded as having waited, and the diagnostics that
    // "read the day back from these" reported holds that never happened.
    held: queued ? (heldForConfidence ? "low_confidence" : "veto_window") : null,
    escalate,
    photo: !!photo,
  };
  return { plan, delayMs, heldForConfidence, queued, replyQuality };
}

type Hold = Awaited<ReturnType<typeof planTheHold>>;

/** A veto window that did not happen is recorded; a hold that could not be written keeps the words; a draft waits. */
export async function heldOrKept(
  at: Answering,
  turn: Turn,
  hold: Hold,
  bodyText: string,
): Promise<typeof GO | undefined> {
  const { sink, pauseMs, tell, pauseHours, L } = at;
  const { usage, brainMeta, replyText, escalate, escalationReason, fallback } = turn;
  const { plan, delayMs, heldForConfidence, queued, replyQuality } = hold;
  // A veto window that was CONFIGURED and did not happen must not pass in
  // silence. The fallback below is deliberate — an un-vetoed reply beats no
  // reply — but the workspace asked to see its receptionist's words before
  // the customer did, and instead the customer got them first. A log line
  // nobody reads is how a setting quietly becomes a lie.
  //
  // Recorded per tenant on the event stream, so 'my veto window is not
  // working' has an answer that does not require reading lambda logs.
  if (delayMs > 0 && !queued) {
    // Named, because the confidence dial rides this same window: an owner with
    // no veto window configured was shown `policy.veto_window_skipped` events
    // for one and sent looking for a setting they had never turned on.
    await sink.vetoFallback(delayMs, plan.source);
  }
  // THE HOLD THAT IS A POLICY. Under 'auto' with a confidence floor the owner
  // said: a reply the model is not sure of waits for a person. The hold could
  // not be written, so the words stay unsent, the thread is a person's for
  // the pause window, the owner is told what the customer said and why
  // nothing answered, and the message is marked handled so the redelivery
  // gate holds. An infrastructure failure never widens what the receptionist
  // may say on its own.
  if (delayMs > 0 && !queued && heldForConfidence) {
    const post: Promise<unknown>[] = [];
    if (usage) post.push(sink.usage({ ...usage, ...replyQuality, escalate: true }));
    post.push(sink.pause(new Date(Date.now() + pauseMs).toISOString()));
    post.push(
      sink.escalate(
        "policy_block",
        `the receptionist was not sure enough to answer on its own (confidence ${brainMeta?.confidence ?? "unknown"}, floor ${plan.minConfidence}) and the hold for a person could not be written, so nothing was sent — "${bodyText}"`,
      ),
    );
    post.push(
      tell(
        bodyText,
        replyText,
        "held for low confidence; the hold could not be scheduled, so nothing was sent",
        pauseHours,
      ),
    );
    await Promise.all(post);
    await sink.processed();
    L.warn("wa_hold_unscheduled_kept", { confidence: brainMeta?.confidence, min: plan.minConfidence });
    return;
  }
  if (queued) {
    const post: Promise<unknown>[] = [];
    if (usage) post.push(sink.usage({ ...usage, ...replyQuality }));
    if (escalate) {
      // An escalating draft still pauses and alerts — a human should be looking
      // at this one before the timer runs out, not after. The pause withdraws
      // the thread's older drafts; this one, the holding message, is kept.
      post.push(
        sink.pause(new Date(Date.now() + pauseMs).toISOString(), typeof queued === "string" ? queued : undefined),
      );
      post.push(
        sink.escalate(
          escalationReason,
          fallback
            ? fallback.escalationDetails(bodyText)
            : brainMeta?.reason
              ? `${brainMeta.reason} — "${bodyText}"`
              : bodyText,
        ),
      );
      post.push(tell(bodyText, replyText, "assistant flagged handoff (reply held for review)", pauseHours));
    }
    await Promise.all(post);
    await sink.processed();
    L.info("wa_reply_queued", { delay_ms: delayMs, escalate });
    return;
  }
  return GO;
}

/** The reply goes out now, and what the wire answered decides what follows. */
export async function sendNow(at: Answering, turn: Turn, hold: Hold, bodyText: string): Promise<void> {
  const { send, sink, pauseMs, tell, pauseHours, L, ingestMs } = at;
  const { replyText, fallback, brainMeta, usage, escalate, escalationReason } = turn;
  const { replyQuality } = hold;
  const sent = await send(
    replyText,
    fallback ? (fallback.meta as Record<string, Json>) : (brainMeta as unknown as Record<string, Json> | undefined),
  );
  const tSent = Date.now();
  if (sent.outcome === "sent") {
    // The door recorded the row; what is left is the usage and the handoff.
    const post: Promise<unknown>[] = [];
    if (usage) post.push(sink.usage({ ...usage, ...replyQuality }));
    if (escalate) {
      post.push(sink.pause(new Date(Date.now() + pauseMs).toISOString()));
      post.push(
        sink.escalate(
          escalationReason,
          fallback
            ? fallback.escalationDetails(bodyText)
            : brainMeta?.reason
              ? `${brainMeta.reason} — "${bodyText}"`
              : bodyText,
        ),
      );
      post.push(tell(bodyText, replyText, fallback ? fallback.alertReason : "assistant flagged handoff", pauseHours));
    }
    await Promise.all(post);
    await sink.processed();
  } else if (sent.outcome === "refused") {
    // The wire found what the gates above could not see a moment ago: the
    // person asked to stop, a human took the thread, the workspace paused.
    // Each of those already has its person; the message is kept and done.
    L.info("wa_refused_at_wire", { reason: sent.reason });
    await sink.processed();
  } else {
    // The customer got NO reply and Meta already has its 200 — this must be
    // loud, and the message must stay visibly unprocessed for reconciliation.
    // The door wrote the failed row and its event; the people are told here.
    await Promise.all([
      tell(bodyText, "(send failed — the customer received no reply)", "wa_send_failed"),
      sink.escalate(
        "send_failed",
        sent.reason === "wire_unreadable"
          ? "Auto-reply could not be sent: the thread could not be read at the wire. Customer got no answer."
          : `Auto-reply could not be delivered (HTTP ${sent.status}). Customer got no answer.`,
      ),
    ]);
  }
  L.info("wa_replied", {
    escalate,
    sent: sent.outcome === "sent",
    ingest_ms: ingestMs,
    post_ms: Date.now() - tSent,
  });
}
