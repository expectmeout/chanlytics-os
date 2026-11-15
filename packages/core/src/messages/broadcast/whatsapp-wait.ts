/**
 * A send waits for WhatsApp (the clean list, step 5a, 15 Nov 2026).
 *
 * WhatsApp says yes to a message's words before anyone is sent them there: in minutes most often, in a day at most. A
 * batch that met a message WhatsApp was still checking skipped each WhatsApp person for good and failed a run with
 * nobody else on it, so a send by hand with new words lost them, a scheduled one whose words were changed lost them, and
 * a run with no day of its own was never made. Here the batch leaves them queued and asks again (retryAt), while everyone
 * on email or text goes at once (the batch reads them alone, ports.batch `not`), until WhatsApp says yes or the run's
 * wait for it ends (whatsappWaitEnds). Then it is as it was: each is skipped, with the reason said once, and a run with
 * nobody else on it stops and says so, in the words of a wait that ended (`whatsapp_wait_ended`).
 */
import {
  BROADCAST_CHUNK,
  BROADCAST_HOLD_WAIT_MS,
  addressOf,
  audienceLate,
  campaignMessageOf,
  freedTimeTaken,
  jittered,
  messageHolds,
  nextOpenMoment,
  sendingEndsAt,
  versionsOf,
  whatsappStoppedRunWords,
  whatsappWaits,
  type CampaignMessage,
} from "@chanlytics/contracts";
import { channelOf } from "../broadcast-channels";
import { thenWhat } from "../broadcast-words";
import type { BroadcastBatchPorts, BroadcastRow, RecipientRow } from "../ports";

/** A run as its wait reads it: whose it is, when it was set to go, and the one time or visit it is about. */
type WaitingRun = Pick<
  BroadcastRow,
  "id" | "name" | "playbook_id" | "scheduled_for" | "audience" | "offered_start" | "offered_end" | "offered_from"
>;

/** When the sending hours end on the day `at` falls in, by the business's clock; the next day's, where that day's are over. */
function hoursEnd(timezone: string, at: Date): Date {
  const open = nextOpenMoment(timezone, at).at;
  return sendingEndsAt(timezone, open) ?? open;
}

/**
 * Until when a run's WhatsApp people wait for WhatsApp's yes (Ruben, 15 Nov 2026). A sequence's run, until the day's
 * sending hours end: it is that day's run, and tomorrow's reaches whoever is due then. A send by hand, until the end of
 * the next day's sending hours after the time it was set for: a review can take a day. And never past what it is about: a
 * freed time's start, or the one visit a late booking's reminder or an occasion's step names, where that is still ahead.
 */
export function whatsappWaitEnds(run: WaitingRun, timezone: string, nowMs: number): Date {
  // A time that is absent parses to no time at all (NaN), and is left out below.
  const set = Date.parse(run.scheduled_for ?? "");
  const today = hoursEnd(timezone, new Date(run.playbook_id || Number.isNaN(set) ? nowMs : set));
  const last = run.playbook_id ? today : hoursEnd(timezone, today);
  const visit = audienceLate(run.audience);
  const about = [run.offered_start, visit && !visit.behind ? visit.start : null]
    .map((iso) => Date.parse(iso ?? ""))
    .filter((at) => !Number.isNaN(at));
  return new Date(Math.min(last.getTime(), ...about));
}

/**
 * Whether the time a freed time's run offers is taken since (decision 0082): nobody waits to be offered a time nobody can
 * have. The batch's own check before its first send cancels a run that has not started; this ends the wait of one that has.
 */
async function isOfferedTimeTaken(
  ports: Pick<BroadcastBatchPorts, "freedTimeFacts">,
  run: WaitingRun,
): Promise<boolean> {
  if (!run.offered_from || !run.offered_start || !run.offered_end) return false;
  const facts = await ports.freedTimeFacts(run.offered_from);
  const offered = { start: Date.parse(run.offered_start), end: Date.parse(run.offered_end) };
  return !!facts && freedTimeTaken(offered, facts.row, facts.calendar.standing);
}

/**
 * When a run's WhatsApp people are asked for again, while WhatsApp is still to say yes to its message (contracts
 * whatsappWaits: checking its words, or holding it): a wait on (BROADCAST_HOLD_WAIT_MS, drawn a little longer), moved to
 * the next sending hours where it falls outside them. Null where they do not wait: WhatsApp said yes, or no; the next try
 * would not fit before the wait ends (whatsappWaitEnds); or the freed time the run offers is taken.
 */
export async function findWhatsAppRetry(
  ports: Pick<BroadcastBatchPorts, "now" | "random" | "freedTimeFacts">,
  run: WaitingRun,
  message: Pick<CampaignMessage, "versions"> | null,
  timezone: string,
): Promise<Date | null> {
  if (!whatsappWaits(message)) return null;
  const nowMs = ports.now();
  const retryAt = nextOpenMoment(timezone, new Date(nowMs + jittered(BROADCAST_HOLD_WAIT_MS, ports.random))).at;
  if (retryAt.getTime() >= whatsappWaitEnds(run, timezone, nowMs).getTime()) return null;
  return (await isOfferedTimeTaken(ports, run)) ? null : retryAt;
}

/**
 * The batch while WhatsApp's people wait: of the people queued, those who go another way (ports.batch `not`), read again
 * only where the first read named anyone on WhatsApp. They go at once, and nobody queues behind a wait that is not theirs.
 */
async function othersOf(
  ports: Pick<BroadcastBatchPorts, "batch">,
  run: Pick<BroadcastRow, "id">,
  queued: RecipientRow[],
): Promise<RecipientRow[]> {
  if (!queued.some((recipient) => channelOf(recipient) === "whatsapp")) return queued;
  return ports.batch(run.id, BROADCAST_CHUNK, { not: "whatsapp" });
}

/**
 * Why a WhatsApp person is not sent a message WhatsApp does not approve now, as their row and a stopped run keep it: the
 * wait for its yes ended first (it was still checking, or holding), or the version is one WhatsApp no longer approves.
 */
type WhatsAppHeld = "whatsapp_wait_ended" | "template_not_approved";

/** How a run's message stands with WhatsApp as one batch reads it, once, and who that batch sends to. */
export interface WhatsAppStand {
  /** The message's rows on every channel, as the port answered them: an email's and a text's words are read out of them. */
  rows: Awaited<ReturnType<BroadcastBatchPorts["message"]>>;
  /** The message they make (contracts campaignMessageOf); null where the workspace holds no row of it now. */
  message: CampaignMessage | null;
  /** The words of its WhatsApp row as WhatsApp has it; none where it has no such row. */
  tpl: { body_preview: string | null };
  /** Why its WhatsApp version is not one to send now and waits for nothing more; null where it is, or where its people wait. */
  held: WhatsAppHeld | null;
  /** When its WhatsApp people are asked for again, while they wait (findWhatsAppRetry); null where they do not. */
  retryAt: Date | null;
  /** Who this batch sends to: the people queued, or, while WhatsApp's people wait, those who go another way. */
  batch: RecipientRow[];
}

/** The run's message read once for the batch, how its WhatsApp version stands, and the batch that follows from it. */
export async function readWhatsAppStand(
  ports: Pick<BroadcastBatchPorts, "message" | "batch" | "now" | "random" | "freedTimeFacts">,
  run: WaitingRun & Pick<BroadcastRow, "template_name" | "template_language">,
  queued: RecipientRow[],
  timezone: string,
): Promise<WhatsAppStand> {
  const rows = await ports.message(run.template_name, run.template_language);
  const message = campaignMessageOf(rows, run.template_name, run.template_language);
  const [row] = versionsOf(rows, run.template_name).whatsapp;
  const tpl = row ?? { body_preview: null };
  if (message !== null && messageHolds(message).whatsapp)
    return { rows, message, tpl, held: null, retryAt: null, batch: queued };
  const retryAt = await findWhatsAppRetry(ports, run, message, timezone);
  if (retryAt) return { rows, message, tpl, held: null, retryAt, batch: await othersOf(ports, run, queued) };
  const held = whatsappWaits(message) ? "whatsapp_wait_ended" : "template_not_approved";
  return { rows, message, tpl, held, retryAt: null, batch: queued };
}

/**
 * A batch with nobody to send to while WhatsApp's people wait: the next is placed at `retryAt`, the run as it stood
 * (one nobody has heard from yet stays scheduled, so its Stop and a freed time's own check still hold). False where
 * nobody waits, the batch has people to send to, or nobody is left queued at all (the batch then ends the run as it
 * always did).
 */
export async function waitForWhatsApp(
  ports: Pick<BroadcastBatchPorts, "remaining" | "scheduleNext">,
  run: Pick<BroadcastRow, "id">,
  stand: Pick<WhatsAppStand, "retryAt" | "batch">,
): Promise<boolean> {
  if (!stand.retryAt || stand.batch.length > 0) return false;
  if ((await ports.remaining(run.id)) <= 0) return false;
  await ports.scheduleNext(run.id, stand.retryAt);
  return true;
}

/**
 * A run with nobody on it who goes another way, whose WhatsApp version is not one to send and waits for nothing more,
 * stops before a single send, and the owner is told which it was (contracts whatsappStoppedRunWords): true then. One whose wait
 * ended says what becomes of it too, by whose run it was (thenWhat): a send by hand is sent again once WhatsApp has
 * approved the message; a sequence's run is not, and its next run that can go reaches them.
 */
export async function stopForWhatsApp(
  ports: Pick<BroadcastBatchPorts, "fail" | "alert" | "byOtherChannels">,
  run: Pick<BroadcastRow, "id" | "name" | "playbook_id" | "audience">,
  { held, message }: Pick<WhatsAppStand, "held" | "message">,
): Promise<boolean> {
  if (!held || (await ports.byOtherChannels(run.id, "whatsapp"))) return false;
  const words = whatsappStoppedRunWords(message);
  await ports.fail(run.id, held);
  await ports.alert({
    kind: "broadcast_stopped",
    route: addressOf({ kind: "send", id: run.id }),
    about: { type: "broadcast", id: run.id },
    subject: `Campaign “${run.name}” stopped`,
    body:
      held === "whatsapp_wait_ended"
        ? `${words} ${thenWhat(run, null, "Send it again once WhatsApp has approved the message.", "when_it_can")}`
        : words,
  });
  return true;
}
