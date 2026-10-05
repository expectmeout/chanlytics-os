/**
 * What a message became, decided once (the Reports lenses spec, K1).
 *
 * Every way out of the receptionist's path marks its message processed (but one, below), and says what the message
 * became: one of contracts' four `Handled` words. This is the one rule that picks the word, from the two facts a way out has, whether
 * a person was asked and what became of the receptionist's own reply. The twenty-two ways out call it, and none of them
 * words the rule itself: a second implementation, even one that agrees, is how a stamp comes to say `handoff` for a
 * message nobody was asked about. The executed test (tooling/scripts/tests/whatsapp/inbound-executed.test.mjs) holds
 * the rule over every way out, in both directions.
 *
 * A handoff is an escalation that LANDED: the sink wrote one (opened, changed or refreshed it). A write the database
 * refused asked nobody, so it is not a handoff, and the message is what else became of it. The stamp that follows is
 * written beside processed_at and fails alone (apps/edge persist.ts), so nothing here can cost a message its reply,
 * its processed_at or its escalation.
 *
 * One way out is not finished: a reply the wire could not deliver opens a `send_failed` escalation and leaves its
 * message unprocessed ON PURPOSE, so the deadman sweep finishes it (dispatch.ts sendNow). It is still a handoff when
 * that escalation landed, because a person was asked, so `noteHandledAfter` stamps the word and writes nothing else:
 * the message stays unprocessed, and when the escalation was refused nobody was asked and nothing is stamped.
 */
import type { BrainIntent, Handled } from "@chanlytics/contracts";
import type { InboundSink } from "./ports";

/** What the sink answered to an escalation: how it landed (packages/jobs EscalationOutcome), or nothing when it failed. */
type EscalateAnswer = Awaited<ReturnType<InboundSink["escalate"]>>;

/** An escalation that was started and has not answered yet: what `sink.escalate` returns. */
export type Asked = ReturnType<InboundSink["escalate"]>;

/** Whether a person was asked: an escalation landed, was refused by the database, or was never attempted. */
export type Escalation = "landed" | "failed" | "none";

/**
 * What became of the receptionist's own reply: it left, it was written and waits (the veto window, the confidence
 * floor), a newer message's reply covers it (00284), or nothing was said. Whatever the receptionist said to the
 * customer left: the acknowledgement of a voice note and the holding message are `sent`.
 */
export type Reply = "sent" | "queued" | "covered" | "none";

/** The facts of one way out. */
export interface WayOut {
  escalation: Escalation;
  reply: Reply;
}

/** A rule set the message aside: nothing was said and nobody was asked (a short code, a person's thread, a thumbs-up). */
export const SET_ASIDE: WayOut = { escalation: "none", reply: "none" };

/**
 * What the message became. A handoff exactly when an escalation landed, whatever else went out beside it; otherwise
 * held when its reply waits, ai when its reply left or another reply covers it, and blocked when nothing was said.
 */
export function handledOf({ escalation, reply }: WayOut): Handled {
  if (escalation === "landed") return "handoff";
  if (reply === "queued") return "held";
  return reply === "sent" || reply === "covered" ? "ai" : "blocked";
}

/** An escalation write's answer as the fact it is: any write landed, and `failed` or no answer wrote nothing. */
export function escalationOf(answer: EscalateAnswer): Escalation {
  return answer === undefined || answer === "failed" ? "failed" : "landed";
}

/**
 * Mark the message processed and say what it became, once its escalation has answered. The word needs the answer, so
 * this waits for it, and only for it: the alert to the owner and the pause go on beside it, as they did before. An
 * escalation that threw is a refused one, and the message is marked all the same. `asked` is null where nobody was
 * asked.
 */
export async function processedAfter(
  sink: Pick<InboundSink, "processed">,
  asked: Asked | null,
  reply: Reply,
  intent: BrainIntent | null = null,
): Promise<unknown> {
  const escalation: Escalation = asked ? escalationOf(await asked.catch(() => undefined)) : "none";
  return sink.processed(handledOf({ escalation, reply }), intent);
}

/**
 * Say what the message became once its escalation has answered, and leave it unprocessed: the way out whose message the
 * deadman sweep finishes (a reply that could not be delivered). Stamped only when the escalation landed, which is the
 * one case a person was asked; an escalation the database refused, or that threw, stamps nothing, and the message reads
 * as it did before, unfinished.
 */
export async function noteHandledAfter(
  sink: Pick<InboundSink, "noteHandled">,
  asked: Asked,
  reply: Reply,
  intent: BrainIntent | null = null,
): Promise<unknown> {
  const escalation = escalationOf(await asked.catch(() => undefined));
  return escalation === "landed" ? sink.noteHandled(handledOf({ escalation, reply }), intent) : undefined;
}
