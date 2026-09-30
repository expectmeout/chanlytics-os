/**
 * The gates between a message the receptionist can read and the model, in the order answerInbound (./answer.ts, their
 * only caller) runs them. Each takes the Answering context and the customer's words, and returns GO to pass the message
 * on or nothing when it stops here.
 *
 * lateOrConfirmed: a message past the reply horizon is a person's, and a late one inside it is still answered
 * (steps.ts ageVerdict). A yes to a program is confirmed before anything can hold it, in the campaign's own filed
 * opt-in words (contracts optInConfirmation), as a system message: never a model call, sent whatever the reply mode,
 * and not held back by a thread a person holds. A marketing yes (YES OFFERS) that arrives by text is recorded, not
 * confirmed, because offers go by WhatsApp. A yes whose confirmation did not go out is escalated and told, never
 * only logged.
 *
 * heldForThePerson: the thread's pause and its day's reply cap, the workspace's day of model tokens (off when its limit
 * is 0 or absent), the billing pause, and the mode in force (./gates.ts modeInForce). Only 'auto' and 'veto', and a
 * workspace with a persona, go on to the model; a hold the owner chose for one person alerts once per open hold.
 *
 * A stop marks the message processed and, unless a person already holds the thread, escalates it under its own reason
 * and tells the owner, so a customer at a limit is never left to a log line. Each stop logs an event of its own (the
 * thread's pause and the workspace's billing pause are two), and those names do not change. The pure verdicts, limits
 * and copy are steps.ts's; the token count comes through the budget port.
 */
import { optInConfirmation, tokenBudgetSpent, tokenCapOf } from "@chanlytics/contracts";
import type { SendPurpose } from "@chanlytics/contracts";
import { ageVerdict, threadVerdict, holdCopy } from "./steps";
import { GO, type Answering } from "./context";

/** A message too old to answer automatically, and a yes to confirm in the campaign's own words. */
export async function lateOrConfirmed(at: Answering, bodyText: string): Promise<typeof GO | undefined> {
  const { raw, sink, tell, n, L, channel, brainCfg, rt, send } = at;
  // Late, but somebody is still waiting.
  //
  // This used to stamp anything over ten minutes old as processed and return —
  // no reply, no escalation, nobody told. Meta redelivers undelivered webhooks
  // with backoff for days, so a fifteen-minute outage turned its entire
  // redelivery backlog into customers who wrote and were never answered, and
  // the only trace was one log line per message. The guard was written against
  // webhook REPLAYS, and replays are already stopped by the dedupe gate
  // above, so this only ever catches late FIRST deliveries.
  //
  // Two ages, because the right answer changes with the delay. Inside the
  // reply horizon the customer is still in the conversation they started, and
  // answering late beats not answering. Beyond it an automated reply would
  // arrive out of nowhere, so a person picks it up — but a person is told.
  const { ageMs, verdict: age } = ageVerdict(raw.timestamp ?? undefined);
  if (age === "stale") {
    await Promise.all([
      sink.escalate(
        "stale",
        `Message arrived ${Math.round(ageMs / 60000)} minutes late — too old to answer automatically.`,
      ),
      tell(n.body ?? `[${raw.type}]`, "(no reply sent — arrived too late to answer automatically)", "late message"),
      sink.processed(),
    ]);
    L.info("wa_stale_escalated", { age_ms: ageMs });
    return;
  }
  if (age === "late") L.info("wa_late_but_answering", { age_ms: ageMs });

  // A YES IS CONFIRMED, and in these words. Every recurring program owes the
  // person who opted in an immediate confirmation naming the program, the
  // frequency, the rates disclosure, HELP and STOP, however the yes was given
  // (the reviewers' onboarding guide; CTIA). The words are the campaign's own
  // filed opt-in message, from contracts, so the filing and the wire cannot
  // disagree. Not the receptionist speaking: a system message, sent whatever
  // the reply mode and never a model call -- and a courtesy against the daily
  // cap, like the acknowledgement. Which question was answered decides which
  // confirmation goes; neither confirms the other, which is what the carriers
  // refused the live campaign for three times.
  // Offers go by WhatsApp, never by text: the texting line's carrier
  // registration is informational, so a YES OFFERS that arrives by text is
  // recorded (ingest keeps the answer; it is honoured on WhatsApp) and answered
  // like any other words, not confirmed as a subscription on this number.
  if (n.optIn || (n.optInMarketing && channel === "whatsapp")) {
    const purpose: SendPurpose = n.optInMarketing ? "marketing" : "conversational";
    const words = optInConfirmation(brainCfg?.business_name ?? rt?.known?.workspace?.name ?? "", purpose);
    // Sent FIRST, and what happened is reported from the outcome. The send's
    // outcome used to be dropped on the floor — so a confirmation the wire
    // refused or could not deliver left nobody aware that the one message the
    // carriers refused this campaign three times for missing had not reached
    // the person who just said yes.
    // A system message, so a thread a person holds does not hold it back: the
    // yes is owed its confirmation whoever holds the thread.
    const confirmed = await send(words, { ack: true, confirmation: purpose }, purpose, "system");
    if (confirmed.outcome !== "sent") {
      // A yes nobody confirmed is the carriers' complaint, whether the wire
      // failed or the door refused. A refusal is NOT quietly logged here the
      // way it is on the reply path below: the reasons that can arrive at this
      // send are all ones a person has to act on, and `no_marketing_consent` is
      // the one to expect — the OFFERS answer is recorded best-effort a moment
      // earlier and the door fails closed without it, so a consent write that
      // did not land would otherwise leave a customer subscribed to nothing,
      // told nothing, with a log line as the only trace.
      const why = confirmed.outcome === "failed" ? `${confirmed.reason}, HTTP ${confirmed.status}` : confirmed.reason;
      await Promise.all([
        sink.escalate(
          "send_failed",
          `The customer said yes and their confirmation did not go out (${why}), so they have no record of what they signed up for, how often, or how to stop. Send it from the Inbox.`,
        ),
        tell(bodyText, `(the confirmation of their yes was not delivered — ${why})`, "opt-in not confirmed"),
      ]);
    }
    await sink.processed();
    L.info("wa_opt_in_confirmed", {
      purpose,
      channel,
      sent: confirmed.outcome === "sent",
      why: confirmed.outcome === "sent" ? null : confirmed.reason,
    });
    return;
  }
  return GO;
}

/** The thread's pause and the day's cap, the token budget, the billing pause and the mode in force, in that order. */
export async function heldForThePerson(at: Answering, bodyText: string): Promise<typeof GO | undefined> {
  const {
    thread,
    maxRepliesDay,
    L,
    sink,
    tell,
    replyLimits,
    db,
    tenantId,
    ports,
    rt,
    brainCfg,
    replyMode,
    personMode,
  } = at;
  const gate = threadVerdict(thread, maxRepliesDay);
  if (gate === "paused") {
    L.info("wa_skip_paused", { paused_until: thread.pausedUntil });
    await sink.processed();
    return;
  }
  if (gate === "ratecap") {
    L.info("wa_skip_ratecap", { cap: maxRepliesDay, used: thread.replies.length });
    // A customer who hits the cap was being abandoned to a console line: no
    // escalation, no alert, nothing on Today. `rate_cap` has been a declared,
    // CHECK-allowed, LABELLED escalation reason this whole time with no
    // emitter anywhere in the repo. At the shipped default of 20/day this
    // fires on a busy thread, not only when someone lowers the limit.
    await Promise.all([
      sink.escalate(
        "rate_cap",
        `Thread hit ${maxRepliesDay} automatic replies today — the receptionist stopped and is waiting for a human.`,
      ),
      tell(bodyText, "(no reply sent — daily automatic-reply limit reached)", "rate cap"),
      sink.processed(),
    ]);
    return;
  }
  // THE TOKEN BUDGET (limits.max_llm_tokens_day; 0 or absent is off).
  //
  // A rolling day of model usage for this workspace, from the usage events
  // every reply writes. Over it the receptionist stops and says so, exactly
  // as it does at the reply cap: a margin is a setting, not an accident, and
  // a customer at the cap is never abandoned to a log line.
  const tokenCap = tokenCapOf(replyLimits);
  if (tokenCap > 0 && db && tenantId) {
    const used = await ports.budget.tokensLast24h(db, tenantId, tokenCap);
    if (tokenBudgetSpent(replyLimits, used)) {
      L.info("wa_skip_budget", { cap: tokenCap, used });
      await Promise.all([
        sink.escalate(
          "budget",
          `The workspace used ${used.toLocaleString("en-US")} of its ${tokenCap.toLocaleString("en-US")} model tokens in the last 24 hours — the receptionist stopped and is waiting for a human.`,
        ),
        tell(bodyText, "(no reply sent — the day's model budget is used up)", "budget"),
        sink.processed(),
      ]);
      return;
    }
  }

  // THE PAUSE (tenants.status = 'paused', written by billing for a workspace
  // whose subscription stopped). The customer's message is already kept
  // above; it is held for a person with its own reason, and nothing is
  // answered until the workspace resumes. Said the way the budget says it:
  // the escalation is the Inbox's row, the alert the owner's mail.
  if (rt?.paused) {
    // Its own name. This logged `wa_skip_paused`, the same event the THREAD
    // pause above logs, so nothing reading the stream could tell a human
    // taking one conversation over from a workspace-wide billing stop.
    L.info("wa_skip_workspace_paused");
    await Promise.all([
      sink.escalate(
        "paused",
        "The workspace is paused because billing stopped, so the receptionist did not answer. Resume from Settings › Billing, or answer this one yourself.",
      ),
      tell(bodyText, "(no reply sent — the workspace is paused until billing resumes)", "paused"),
      sink.processed(),
    ]);
    return;
  }

  // E3: the reply policy is consulted BEFORE generation. 'ask' is the timid
  // mode — everything escalates, a human answers; a tenant with no persona
  // behaves identically. The customer's message is already persisted above.
  // 'veto' composes a reply like 'auto' and then HOLDS it for a configured
  // window before sending, so the business can redirect the bot before the
  // customer sees it. It reaches the brain; what differs is the dispatch below.
  if (!brainCfg || (replyMode !== "auto" && replyMode !== "veto")) {
    // A hold the owner chose for THIS person is its own reason: it is not a
    // workspace setting, and the Inbox should say "you handle this person",
    // not "held by policy". It also alerts ONCE per open hold rather than
    // once per message — the owner asked to handle this person themselves,
    // and a thread already in their Inbox does not need a second email.
    const hold = holdCopy({
      brainCfg,
      personMode,
      replyMode,
      configBroken: !!rt?.configBroken,
      loadFailed: !!rt?.loadFailed,
    });
    const outcome = await sink.escalate(hold.reason, hold.details);
    const alertNeeded = !hold.personHold || outcome !== "refreshed";
    await Promise.all([...(alertNeeded ? [tell(bodyText, hold.botText, hold.why)] : []), sink.processed()]);
    L.info("wa_held_by_policy", {
      mode: replyMode,
      person_mode: personMode,
      persona: !!brainCfg,
      config_broken: !!rt?.configBroken,
      load_failed: !!rt?.loadFailed,
      escalation: outcome ?? "n/a",
      alerted: alertNeeded,
    });
    return;
  }
  return GO;
}
