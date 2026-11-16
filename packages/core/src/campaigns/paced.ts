import {
  campaignEnded,
  IN_CHAT_FACT,
  inChatPurposeOfMessage,
  inLastSendingHour,
  replyWindow,
  triggerOf,
  whatsappWaits,
  type AskedPurpose,
  type CampaignMessage,
  type ConsentChannel,
  type InChat,
  type NumberHealth,
  type PersonRowVM,
  type RunReach,
} from "@chanlytics/contracts";

/**
 * The pace a paced offer keeps today: an offer on a list with a last day, as Ask's plan makes one, at no more than its cap and no
 * more than the open slots a day ahead, as its plan worked it out (contracts capOf), so it slows as the book fills and the first
 * people it told get the slots. A full book sends nothing today. Null for any other playbook, and where no calendar can say.
 */
export function pacedTo(
  p: { until?: string | null; trigger: string; policy_class: string; cap_per_run: number },
  room: { open: number; days: number } | null | undefined,
): { cap: number; full: boolean } | null {
  if (!room || !p.until || p.trigger !== "saved_list" || p.policy_class !== "campaign") return null;
  if (room.open <= 0) return { cap: p.cap_per_run, full: true };
  return { cap: Math.min(p.cap_per_run, Math.ceil(room.open / Math.max(1, room.days))), full: false };
}

/** A run's playbook at its pace (D39 of the answers canvas): a person who asks for a run has decided, and takes none. */
export function pacedRun<P extends Parameters<typeof pacedTo>[0]>(
  playbook: P,
  byPerson: boolean,
  room: Parameters<typeof pacedTo>[1],
): { playbook: P; full: boolean } {
  const paced = byPerson ? null : pacedTo(playbook, room);
  return { playbook: paced ? { ...playbook, cap_per_run: paced.cap } : playbook, full: paced?.full === true };
}

/** Why a campaign runs nothing today, before anything is read: past its last day (00416 `until`), or no room on the book. */
export const notToday = (
  p: Parameters<typeof campaignEnded>[0],
  runFor: string,
  full: boolean,
): "ended" | "no_room" | null => (campaignEnded(p, runFor) ? "ended" : full ? "no_room" : null);

/**
 * Whether the day's run waits on WhatsApp, and for what: it ticks WhatsApp, and WhatsApp is still looking at the
 * message's words (a new message, or a change sent back: Ruben, 12 Nov 2026, "it can just be scheduled"), or is holding
 * the message for a few hours (its pause, after people marked it as unwanted, which lifts by itself). A review most often
 * takes minutes and a hold hours, so the run asks again with the next hourly sweep rather than closing the day as one
 * that did nothing, which lost that day's sends for a wait that ended five minutes later. Not in the day's last hour,
 * when it goes on as it would without (whoever is on email or text; else off, and said), nor for a run that has no day
 * to wait in (a freed time, a late booking, an occasion), which is made and waits at the send instead (waitsAtTheSend).
 * Null where it does not wait.
 */
export function waitsOnWhatsApp(
  run: {
    channels: readonly string[];
    freed: unknown;
    late: unknown;
    occasion: unknown;
    ctx: { tz: string; now: Date };
  },
  message: CampaignMessage | null,
): "template_in_review" | "template_on_hold" | null {
  const status = message?.versions.whatsapp?.status;
  const hasDay = !run.freed && !run.late && !run.occasion && !inLastSendingHour(run.ctx.tz, run.ctx.now);
  if (!hasDay || !run.channels.includes("whatsapp")) return null;
  return status === "pending" ? "template_in_review" : status === "paused" ? "template_on_hold" : null;
}

/**
 * Whether a run with no day to wait in (a freed time, a late booking, an occasion) is made though WhatsApp is still to
 * say yes to its message (contracts whatsappWaits): it ticks WhatsApp, and the people only WhatsApp reaches are placed
 * on it and wait at the send until what the run is about has passed (messages/broadcast/whatsapp-wait.ts), while
 * whoever is on email or text goes at once. It was stopped, and that freed time's offer or that booking's reminder
 * never went (the review of 15 Nov 2026). The day's own run waits as a whole instead (waitsOnWhatsApp).
 */
export function waitsAtTheSend(
  run: { channels: readonly string[]; freed: unknown; late: unknown; occasion: unknown },
  message: CampaignMessage | null,
): boolean {
  const noDay = !!run.freed || !!run.late || !!run.occasion;
  return noDay && run.channels.includes("whatsapp") && whatsappWaits(message);
}

/**
 * The reply in the open WhatsApp chat a run's step asks for (decision 0135), and whether a person's chat is open at the
 * moment its batch goes, which their 24 hours are counted to (replyWindow): only in a workspace whose switch is on
 * (RunContext `repliesInChat`), for a step about the person's own request whose message WhatsApp approved as an offer
 * (contracts inChatPurposeOf). Null else.
 */
export function inChatOf(
  run: { ctx: { repliesInChat?: boolean }; p: { trigger: string } },
  message: CampaignMessage | null,
  goesAt: Date,
): InChat | null {
  if (run.ctx.repliesInChat !== true) return null;
  const purpose = inChatPurposeAt(run.p.trigger, message);
  if (!purpose) return null;
  return { purpose, open: (reach) => replyWindow("whatsapp", reach.waInboundAt, goesAt).open };
}

/**
 * The yes a moment's message goes under as a reply in a person's open WhatsApp chat (contracts inChatPurposeOfMessage),
 * from the message as it stands: asked by the run that marks the people for it (inChatOf) and again at their send
 * (messages broadcast/batch.ts), so a message WhatsApp no longer approves as an offer goes as every send does. Null for no
 * message, and for a broadcast, which has no moment.
 */
export function inChatPurposeAt(trigger: string | null, message: CampaignMessage | null): AskedPurpose | null {
  return trigger === null ? null : inChatPurposeOfMessage(triggerOf(trigger)?.cls ?? null, message);
}

/** Who a run draws, each on their channel, and who of them it reaches in their open chat (contracts playbookRunReach). */
export interface Drawn {
  eligible: PersonRowVM[];
  reach: RunReach;
  channelOf: Record<string, ConsentChannel>;
  inChat?: readonly string[];
}

/**
 * The number's daily limit as a ceiling on WhatsApp's people (Meta's: an email or a text is never held for it), the
 * people past it named in the run's record, never dropped in silence. A moment's run and a step after the first both.
 */
export function withinTheNumbersDay(health: NumberHealth, drawn: Drawn): Drawn & { dropped: number } {
  const reach: RunReach = { ...drawn.reach };
  const room = health.limitPerDay === null ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(health.limitPerDay));
  let onWhatsApp = 0;
  const eligible = drawn.eligible.filter((person) => {
    if (drawn.channelOf[person.id] !== "whatsapp") return true;
    onWhatsApp += 1;
    return onWhatsApp <= room;
  });
  const dropped = drawn.eligible.length - eligible.length;
  if (dropped > 0) {
    reach.overLimit = dropped;
    reach.will = eligible.length;
    if (reach.by_channel) reach.by_channel = { ...reach.by_channel, whatsapp: reach.by_channel.whatsapp - dropped };
  }
  return { ...drawn, eligible, reach, dropped };
}

/** A person's facts on their row, marked where the run reaches them in their open chat: the send goes by the mark. */
export const inChatFacts = (
  facts: Record<string, string> | null,
  inChat: readonly string[] | undefined,
  id: string,
): Record<string, string> | null => (inChat?.includes(id) ? { ...(facts ?? {}), [IN_CHAT_FACT]: "yes" } : facts);

/**
 * Where WhatsApp has the message's version, as the run's own stop reads it (contracts playbookStopBy): its status, null
 * with none, and for a run that waits at the send (waitsAtTheSend) the one that stops nothing: the run is made, and its
 * WhatsApp people wait for the yes.
 */
export function statusAtTheSend(
  run: Parameters<typeof waitsAtTheSend>[0],
  message: CampaignMessage | null,
): string | null {
  return waitsAtTheSend(run, message) ? "approved" : (message?.versions.whatsapp?.status ?? null);
}
