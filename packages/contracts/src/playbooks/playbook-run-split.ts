/**
 * One run of a campaign, by channel, and what the month's allowance holds back of it: the one reading the playbook
 * composer and Ask's campaign card say it by.
 *
 * A run reaches at most its cap, the longest unheard first, each person once, on the first channel that can reach them
 * (playbookRunReach over reachFor). So one run's split by channel is not the split of everyone the moment reaches now: a
 * win-back that reaches 300 people, 120 of them by email, sends 25 a run, and how many of those 25 go by email depends on
 * who has waited longest. The month's emails and texts (CAMPAIGN_MONTH_ALLOWANCE) are held against that run, as its
 * enrolment holds them (core campaigns/allowance.ts pastTheMonth, over the run's own people), never against everyone.
 */
import { allowanceBeforeSend, type MonthSent } from "../broadcasts/reach-for";
import type { SendPurpose } from "../consent/consent";
import { CONSENT_CHANNELS, type ConsentChannel } from "../consent/consent-channels";
import type { RunReach } from "./playbook-reach";
import { triggerOf } from "./playbook-triggers";

/** One run's people on each channel, by the cap it runs at, in figures ("25"). */
export type RunSplit = Record<string, Record<ConsentChannel, number>>;

/** Who a run reaches, as GET playbooks' pools and Ask's campaign card count it. */
export interface RunReading {
  /** Who a run reaches now, before its cap. */
  candidates: number;
  /** Who of them goes by each channel, adding up to `candidates`. Absent from a count made before channels. */
  by_channel?: Record<ConsentChannel, number>;
  /**
   * One run's split at each cap below `candidates` (runReadingOf). Absent where the whole split is every run's already
   * (one channel carries everybody, or every cap reaches everyone), and from an answer made before it was counted.
   */
  run_split?: RunSplit;
}

/**
 * The most one run of a campaign sends, or 0 where nothing caps it: an appointment moment has no cap (playbookRunReach: a
 * reminder is owed to everyone with an appointment, and tomorrow's have no later run), and a card drawn without its cap
 * is said whole. The one reading of it: Coming up's line, Resume's question and one run's split all ask it.
 */
export function runCapOf(p: { trigger: string; cap_per_run?: number | null }): number {
  return triggerOf(p.trigger)?.kind === "visit" ? 0 : (p.cap_per_run ?? 0);
}

/** Nobody on any channel. */
const noOne = (): Record<ConsentChannel, number> => ({ whatsapp: 0, sms: 0, email: 0 });

/**
 * A count as a run draws it: who it reaches now and on which channel (playbookRunReach's `reach`), and one run's split at
 * each of `caps` below that (`run_split`), from its `eligible`, which are in the order a run takes them, each on the
 * channel `channelOf` names. One run's split is answered only where it can differ from the whole: more than one channel
 * carries people (so one of them is email or text) and the cap reaches fewer than everyone, on a moment a cap holds.
 * GET playbooks counts its pools by it at the caps the composer offers, in the same pass; Ask's card at its own cap.
 */
export function runReadingOf(
  drawn: {
    eligible: readonly { id: string }[];
    channelOf: Readonly<Record<string, ConsentChannel>>;
    reach: Pick<RunReach, "will" | "by_channel">;
  },
  trigger: string,
  caps: readonly number[],
): RunReading & { by_channel: Record<ConsentChannel, number> } {
  const whole = drawn.reach.by_channel ?? noOne();
  const reading = { candidates: drawn.reach.will, by_channel: whole };
  // A set, so each person taken asks it once whatever the number of caps: linear in the people and in the caps.
  const below = new Set(
    caps.map((cap) => runCapOf({ trigger, cap_per_run: cap })).filter((cap) => cap >= 1 && cap < reading.candidates),
  );
  if (below.size === 0 || CONSENT_CHANNELS.filter((c) => whole[c] > 0).length < 2) return reading;
  const last = Math.max(...below);
  const counts = noOne();
  const run_split: RunSplit = {};
  let taken = 0;
  for (const person of drawn.eligible) {
    if (taken === last) break;
    const channel = drawn.channelOf[person.id];
    if (channel) counts[channel] += 1;
    taken += 1;
    if (below.has(taken)) run_split[String(taken)] = { ...counts };
  }
  return { ...reading, run_split };
}

/**
 * Who ONE run at its cap reaches on each channel: the whole split where nothing caps it or the cap reaches everyone, the
 * count's own split at that cap, or, where one channel carries everybody, the cap on it. Null where the count cannot say:
 * no split by channel, or an answer from before one run's split was counted.
 */
function oneRunByChannel(
  reading: RunReading,
  run: { trigger: string; cap_per_run: number },
): Record<ConsentChannel, number> | null {
  const whole = reading.by_channel;
  if (!whole) return null;
  const cap = runCapOf(run);
  if (cap === 0 || cap >= reading.candidates) return whole;
  const atCap = reading.run_split?.[String(cap)];
  if (atCap) return atCap;
  const carrying = CONSENT_CHANNELS.filter((c) => whole[c] > 0);
  const [only] = carrying;
  return carrying.length === 1 && only ? { ...noOne(), [only]: cap } : null;
}

/**
 * What the month's allowance holds back of ONE run of a campaign, in the composers' sentence (allowanceBeforeSend): the
 * run's people on each channel at its cap (oneRunByChannel) against what the month has left. The playbook composer's To
 * row and Ask's campaign card both say it so, from the same count. Nothing where the month could not be counted (`sent`
 * null) or the message is about their visit (allowanceBeforeSend). An answer from before one run's split was counted (an
 * older server's, for one release: docs/debt.md) is said as the composer said it before, over everyone the moment
 * reaches now, never a guessed split.
 */
export function heldBackOfOneRun(
  reading: RunReading,
  run: { trigger: string; cap_per_run: number },
  sent: MonthSent | null,
  purpose: SendPurpose,
): string | null {
  const split = oneRunByChannel(reading, run) ?? reading.by_channel;
  return split ? allowanceBeforeSend(split, sent, run.trigger, purpose) : null;
}
