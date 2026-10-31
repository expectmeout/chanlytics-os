/**
 * The gates between a message and the model, in the order answerInbound (./answer.ts, their only caller) runs them.
 * Each takes the Answering context, and past the first the customer's words, and returns GO to pass the message on or
 * nothing when it stops here.
 *
 * tooLate: a message past the reply horizon is a person's, and a late one inside it is still answered (steps.ts
 * ageVerdict). It is asked of every message the first gates pass, before one the receptionist will not read is
 * acknowledged (./unreadable.ts), so nothing automated answers an old message of any kind.
 *
 * confirmedYes: a yes to a program is confirmed before anything can hold it, in the campaign's own filed
 * opt-in words (contracts optInConfirmation), as a system message: never a model call, sent whatever the reply mode,
 * and not held back by a thread a person holds. A marketing yes (YES OFFERS) that arrives by text is recorded, not
 * confirmed, because offers go by WhatsApp. A START on WhatsApp from a person whose yes to offers ended with their STOP
 * (00323) says so after the filed words, with the phrase that turns offers on again (contracts offersAfterStart); a
 * text's confirmation is the filed words alone. A yes whose confirmation did not go out is escalated and told, never
 * only logged.
 *
 * heldForThePerson: what every sender that speaks without a person asks, in its one order (./reply-posture.ts
 * unattendedHold: the thread's pause, its day's reply cap, the billing pause, the mode in force), then, for a message
 * that would reach the model, the live hold a call or a person has on the thread (the send door's own question,
 * ../deliver-hold.ts heldByThread, asked here first so no turn is spent on words the wire would refuse), the
 * workspace's day of model tokens (off when its limit is 0 or absent) and its persona. Only 'auto' and 'veto', and a
 * workspace with a persona, go on to the model; a hold the owner chose for one person alerts once per open hold.
 *
 * A stop marks the message processed and, unless a person already holds the thread, escalates it under its own reason
 * and tells the owner, so a customer at a limit is never left to a log line. Each stop logs an event of its own (the
 * thread's pause and the workspace's billing pause are two), and those names do not change. The pure verdicts, limits
 * and copy are steps.ts's; the token count comes through the budget port.
 */
import { errField } from "@chanlytics/channels";
import {
  confirmationNameOf,
  offersAfterStart,
  optInConfirmation,
  dmBackOnConfirmation,
  SECOND_MS,
  tokenBudgetSpent,
  tokenCapOf,
  YES_WHILE_PAUSED,
} from "@chanlytics/contracts";
import type { SendPurpose } from "@chanlytics/contracts";
import { ageVerdict, holdCopy } from "./steps";
import { GO, type Answering } from "./context";

/** When the message was sent, in the seconds the staleness check reads; nothing when its wire did not say. */
const sentAtSecondsOf = (iso: string | null): number | undefined =>
  iso === null ? undefined : Date.parse(iso) / SECOND_MS;
import { unattendedHold } from "./reply-posture";
import { escalationOf, handledOf, processedAfter, SET_ASIDE, type Asked } from "./handled";
import { toldFromItsEvent } from "../subscribers";
import { heldByThread } from "../deliver-hold";

/**
 * What a START's confirmation adds about offers, or nothing: one row, read by the id the ingest answered. Never fatal
 * and never a reason to hold the confirmation back: a row that cannot be read adds nothing.
 */
async function offersNoteFor(at: Answering): Promise<string | null> {
  const { db, tenantId, ing, ports, channel, L } = at;
  if (channel !== "whatsapp" || !db || !tenantId || !ing?.contact_id) return null;
  try {
    const answer = await ports.leads.offersAnswer?.(db, tenantId, ing.contact_id);
    return answer ? offersAfterStart(answer, channel) : null;
  } catch (e) {
    L.warn("lead_context_unavailable", { error: errField(e) });
    return null;
  }
}

/**
 * The name the campaign filed for this workspace, which a START by text is confirmed in (X4-5); null where no filing kept
 * one, the adapter reads none, or the read failed (the confirmation is then in the workspace's name).
 */
async function filedCampaignName(at: Answering): Promise<string | null> {
  const { db, tenantId, ports, channel, L } = at;
  if (channel !== "sms" || !db || !tenantId || !ports.filing) return null;
  try {
    return (await ports.filing.names(db, tenantId)).campaign;
  } catch (e) {
    L.warn("filed_name_unavailable", { error: errField(e) });
    return null;
  }
}

/**
 * Whether the person took back their yes to offers since this message's own YES OFFERS was kept: asked only of a message
 * taken in again (a WhatsApp answer's job, a redelivery). Its yes was written when it was first kept (00361), so a
 * record that says no now is the person's later word, and it stands. A read that fails is not a no.
 */
async function offersTakenBack(at: Answering): Promise<boolean> {
  const { db, tenantId, ing, ports, L } = at;
  if (ing?.is_new !== false || !db || !tenantId || !ing.contact_id) return false;
  try {
    const answer = await ports.leads.offersAnswer?.(db, tenantId, ing.contact_id);
    return answer?.marketingConsent === "opted_out";
  } catch (e) {
    L.warn("lead_context_unavailable", { error: errField(e) });
    return false;
  }
}

/**
 * A message too old to answer automatically: a person's, whatever it is. Asked before anything may be said about it,
 * the acknowledgement of a message the receptionist will not read included (./unreadable.ts): that gate ran first, so an
 * hours-old voice note or sticker Meta sent again after an outage got the canned "a member of the team will take a
 * look" and paused the thread, an automated reply out of nowhere, which is what the horizon exists to prevent. Its
 * attachment is still kept, for the person it is handed to.
 */
export async function tooLate(at: Answering): Promise<typeof GO | undefined> {
  const { sink, tell, n, L } = at;
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
  const { ageMs, verdict: age } = ageVerdict(sentAtSecondsOf(n.channelTsIso));
  if (age === "stale") {
    const asked = sink.escalate(
      "stale",
      `Message arrived ${Math.round(ageMs / 60000)} minutes late — too old to answer automatically.`,
    );
    await Promise.all([
      asked,
      tell(asked, {
        said: n.body ?? `[${n.rawType}]`,
        answered: "(no reply sent — arrived too late to answer automatically)",
        why: "late message",
      }),
      processedAfter(sink, asked, "none"),
      ...(n.media ? [sink.media(n)] : []),
    ]);
    L.info("wa_stale_escalated", { age_ms: ageMs });
    return;
  }
  if (age === "late") L.info("wa_late_but_answering", { age_ms: ageMs });
  return GO;
}

/** A yes to confirm in the campaign's own words. */
export async function confirmedYes(at: Answering, bodyText: string): Promise<typeof GO | undefined> {
  const { sink, tell, n, L, channel, brainCfg, rt, send } = at;

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
  if (n.consent.optIn || (n.consent.optInMarketing && channel === "whatsapp")) {
    const purpose: SendPurpose = n.consent.optInMarketing ? "marketing" : "conversational";
    // A YES OFFERS taken in again after the person said no more offers is held by that no, as a START taken in again
    // after a STOP is (resolveConsent): the door would refuse the confirmation, and a person would be told the customer
    // said yes and was never confirmed, when the customer's last word was no.
    if (n.consent.optInMarketing && (await offersTakenBack(at))) {
      L.info("wa_opt_in_confirmed", { purpose, channel, sent: false, why: "offers_taken_back" });
      await processedAfter(sink, null, "none");
      return;
    }
    // In whose name (contracts confirmationNameOf): a START by text in the name its campaign was filed under.
    const name = confirmationNameOf({
      channel,
      filed: await filedCampaignName(at),
      workspace: rt?.known?.workspace?.name ?? null,
      receptionist: brainCfg?.business_name ?? null,
    });
    // A DM's START in a DM's words: no carrier's program, rates or HELP line to name (contracts dmBackOnConfirmation).
    const filed = channel === "instagram" ? dmBackOnConfirmation(name) : optInConfirmation(name, purpose);
    // The yes to offers a STOP ended does not come back with a START: said here, on WhatsApp alone.
    const offers = n.consent.optInMarketing ? null : await offersNoteFor(at);
    const words = offers ? `${filed} ${offers}` : filed;
    // Sent FIRST, and what happened is reported from the outcome. The send's
    // outcome used to be dropped on the floor — so a confirmation the wire
    // refused or could not deliver left nobody aware that the one message the
    // carriers refused this campaign three times for missing had not reached
    // the person who just said yes.
    // A system message, so a thread a person holds does not hold it back: the
    // yes is owed its confirmation whoever holds the thread.
    const confirmed = await send(words, { ack: true, confirmation: purpose }, purpose, "system");
    let asked: Asked | null = null;
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
      // A yes taken while the workspace is paused: the door refuses every message but a reply (deliver.ts `paused`), so the
      // hold is the pause's, in its words, not a reply that failed to deliver (the wiring's second audit, X4-1).
      const paused = confirmed.outcome === "refused" && confirmed.reason === "paused";
      asked = sink.escalate(
        paused ? "paused" : "send_failed",
        paused
          ? YES_WHILE_PAUSED.details
          : `The customer said yes and their confirmation did not go out (${why}), so they have no record of what they signed up for, how often, or how to stop. Send it from the Inbox.`,
      );
      await Promise.all([
        asked,
        tell(asked, {
          said: bodyText,
          answered: paused ? YES_WHILE_PAUSED.answered : `(the confirmation of their yes was not delivered — ${why})`,
          why: paused ? "paused" : "opt-in not confirmed",
        }),
      ]);
    }
    await processedAfter(sink, asked, confirmed.outcome === "sent" ? "sent" : "none");
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

/**
 * A person has the thread (a reply or a take-over claimed it), so the receptionist stays out. The message was set aside
 * with nobody told, and the pause's end handed the thread back with it unanswered (the closed-loop audit of 17 Oct 2026,
 * B). It is held for them now: one hold per stretch, refreshed by each message after the first, told once as it opens,
 * resolved by their reply, watched by the deadman, and the pause cannot lapse past it; a thread already held keeps its
 * own hold (00454).
 */
async function heldWhileTheirs(at: Answering, bodyText: string): Promise<void> {
  const { sink, tell } = at;
  const asked = sink.escalate(
    "wrote_while_held",
    "They wrote again while your team had this thread, so the receptionist stayed out. Answer them, or hand the thread back.",
  );
  await Promise.all([
    asked,
    tell(asked, {
      said: bodyText,
      answered: "(no reply sent — a person on your team has this thread)",
      why: "wrote while held",
    }),
    processedAfter(sink, asked, "none"),
  ]);
}

/**
 * The live hold (00132): a call in progress on this thread, or a person who took it over and whose pause the gate
 * before this one did not see. The send door refuses the receptionist's words under it as human_has_it
 * (../deliver-hold.ts heldByThread), so the model was asked for a reply that never went: a text sent mid-call cost a
 * turn and was set aside at the wire. The wire's own question, asked here first, with the wire's own answer: the
 * message is kept, nobody is asked (the call, or the person, has them), nothing is said, and the wire's check stays
 * the second line. The pause is not asked again (null): the gate before answered it, with a person told. An answer
 * and a draft meet a live hold alike, so the veto window's draft is not written either.
 */
async function heldByTheLiveHold(at: Answering): Promise<typeof GO | undefined> {
  const { thread, L, sink } = at;
  const hold = { control: thread.control, pausedUntil: null };
  const refused = heldByThread({ trigger: null, onCall: null }, hold, Date.now(), "answer");
  if (!refused) return GO;
  L.info("wa_refused_at_wire", { reason: refused, held_by: thread.control?.kind ?? null });
  await sink.processed(handledOf(SET_ASIDE));
  return undefined;
}

/** The one order every unattended sender asks (unattendedHold), then the live hold, the token budget and the persona. */
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
  // A reply that would book is taken back after the model (steps.ts layerTwo), not held before it: no booking hold here.
  const held = unattendedHold({
    pausedUntilMs: thread.pausedUntil,
    nowMs: Date.now(),
    sentToday: thread.replies.length,
    dailyCap: maxRepliesDay,
    workspacePaused: !!rt?.paused,
    bookingHeld: false,
    mode: replyMode,
  });
  if (held === "human_has_it") {
    L.info("wa_skip_paused", { paused_until: thread.pausedUntil });
    await heldWhileTheirs(at, bodyText);
    return;
  }
  if (held === "daily_cap") {
    L.info("wa_skip_ratecap", { cap: maxRepliesDay, used: thread.replies.length });
    // A customer who hits the cap was being abandoned to a console line: no
    // escalation, no alert, nothing on Today. `rate_cap` has been a declared,
    // CHECK-allowed, LABELLED escalation reason this whole time with no
    // emitter anywhere in the repo. At the shipped default of 20/day this
    // fires on a busy thread, not only when someone lowers the limit.
    const asked = sink.escalate(
      "rate_cap",
      `Thread hit ${maxRepliesDay} automatic replies today — the receptionist stopped and is waiting for a human.`,
    );
    await Promise.all([
      asked,
      tell(asked, {
        said: bodyText,
        answered: "(no reply sent — daily automatic-reply limit reached)",
        why: "rate cap",
      }),
      processedAfter(sink, asked, "none"),
    ]);
    return;
  }
  // THE PAUSE (tenants.status = 'paused', written by billing for a workspace
  // whose subscription stopped). The customer's message is already kept
  // above; it is held for a person with its own reason, and nothing is
  // answered until the workspace resumes. Said the way the budget says it:
  // the escalation is the Inbox's row, the alert the owner's mail.
  if (held === "paused") {
    // Its own name. This logged `wa_skip_paused`, the same event the THREAD
    // pause above logs, so nothing reading the stream could tell a human
    // taking one conversation over from a workspace-wide billing stop.
    L.info("wa_skip_workspace_paused");
    const asked = sink.escalate(
      "paused",
      "The workspace is paused because billing stopped, so the receptionist did not answer. Resume from Settings › Billing, or answer this one yourself.",
    );
    await Promise.all([
      asked,
      tell(asked, {
        said: bodyText,
        answered: "(no reply sent — the workspace is paused until billing resumes)",
        why: "paused",
      }),
      processedAfter(sink, asked, "none"),
    ]);
    return;
  }

  // THE LIVE HOLD (00132), only where the model would be asked: a stop found above keeps its own reason and notice.
  if (held === null && brainCfg && (await heldByTheLiveHold(at)) !== GO) return;

  // THE TOKEN BUDGET (limits.max_llm_tokens_day; 0 or absent is off), asked of a message that would reach the model:
  // a held one makes no call, so its hold, not the budget, is what the Inbox says.
  //
  // A rolling day of model usage for this workspace, from the usage events
  // every reply writes. Over it the receptionist stops and says so, exactly
  // as it does at the reply cap: a margin is a setting, not an accident, and
  // a customer at the cap is never abandoned to a log line.
  const tokenCap = tokenCapOf(replyLimits);
  if (held === null && tokenCap > 0 && db && tenantId) {
    const used = await ports.budget.tokensLast24h(db, tenantId, tokenCap);
    if (tokenBudgetSpent(replyLimits, used)) {
      L.info("wa_skip_budget", { cap: tokenCap, used });
      const asked = sink.escalate(
        "budget",
        `The workspace used ${used.toLocaleString("en-US")} of its ${tokenCap.toLocaleString("en-US")} model tokens in the last 24 hours — the receptionist stopped and is waiting for a human.`,
      );
      await Promise.all([
        asked,
        tell(asked, { said: bodyText, answered: "(no reply sent — the day's model budget is used up)", why: "budget" }),
        processedAfter(sink, asked, "none"),
      ]);
      return;
    }
  }

  // E3: the reply policy is consulted BEFORE generation. 'ask' is the timid
  // mode — everything escalates, a human answers; a tenant with no persona
  // behaves identically. The customer's message is already persisted above.
  // 'veto' composes a reply like 'auto' and then HOLDS it for a configured
  // window before sending, so the business can redirect the bot before the
  // customer sees it. It reaches the brain; what differs is the dispatch below.
  // Any hold left (the mode in force; one this path never asks, such as a booking's) holds for a person: fail closed.
  if (held !== null || !brainCfg) {
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
    // Told from its event when it was written (decision 0043), once per hold: a person's own hold saying itself again
    // is no news, which the alert here used to have to remember.
    const alertNeeded = !toldFromItsEvent(outcome);
    await Promise.all([
      tell(Promise.resolve(outcome), { said: bodyText, answered: hold.botText, why: hold.why }),
      sink.processed(handledOf({ escalation: escalationOf(outcome), reply: "none" })),
    ]);
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
