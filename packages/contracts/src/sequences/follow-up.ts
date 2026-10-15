/**
 * A customer's sequence takes more steps (decision 0060, D6): a step some days after the one before, which goes only if
 * what it was for still holds (no booking, no reply), and stops a person who booked or wrote back since. The step runs
 * through the moment's own run (core run-playbook.ts), over the people the database says are due it
 * (`sequence_follow_ups_due`, 00440); these are the rules it judges them by.
 */
import type { CampaignHow } from "../broadcasts/broadcast-audience";
import { reachFor, type HeldOn } from "../broadcasts/reach-for";
import type { MessageAbout } from "../consent/consent";
import type { ConsentChannel } from "../consent/consent-channels";
import type { PersonRowVM } from "../people/person-row";
import { enrolPurpose, type RunMessage } from "../playbooks/playbook-purpose";
import type { RunReach } from "../playbooks/playbook-reach";

/** What a step after the first may require still holds of a person: `sequence_steps.only_if` holds the same two. */
export const FOLLOW_UP_CONDITIONS = ["no_booking", "no_reply"] as const;
export type FollowUpCondition = (typeof FOLLOW_UP_CONDITIONS)[number];

/** Why someone due a step after the first leaves the sequence instead: they booked, or they wrote or called, since. */
export type FollowUpStop = "booked" | "replied";

/**
 * Whether a person due a step after the first leaves instead (its `only_if`): `booked` when it asks for no booking and
 * they have an appointment ahead; `replied` when it asks for no reply and they wrote or called after the step before
 * went (`sentAtMs`). Null when the step goes to them.
 */
export function followUpStop(
  person: Pick<PersonRowVM, "booked" | "askedMs">,
  onlyIf: readonly string[],
  sentAtMs: number | null,
): FollowUpStop | null {
  if (onlyIf.includes("no_booking") && person.booked) return "booked";
  if (onlyIf.includes("no_reply") && person.askedMs !== null && sentAtMs !== null && person.askedMs > sentAtMs)
    return "replied";
  return null;
}

/**
 * What a customer's step is about, by its class (a step after the first carries its first step's): a visit's or a
 * proposal's (Booking, the follow-ups) is theirs, anything else the business's news (consent.ts MessageAbout, D1).
 */
function messageAboutOfClass(policyClass: string): MessageAbout {
  return policyClass === "booking" || policyClass === "follow_up" ? "theirs" : "ours";
}

/** A step after the first as its run reads it: its class, its message, and how it may go. */
export interface FollowUpStep {
  policy_class: string;
  message: RunMessage;
  channels: readonly string[];
  ready: CampaignHow["ready"];
}

/**
 * Who of the people due a step after the first it reaches, each on one channel (reachFor, the one pick), and who it
 * cannot, with why. No gap and no week's breath: the step is the sequence they are in, its wait its own. The reach is
 * counted as a run's is, so its batch says "6 of 8, 2 never said yes" as any run does.
 */
export function followUpReach(
  due: readonly PersonRowVM[],
  step: FollowUpStep,
): {
  eligible: PersonRowVM[];
  reach: RunReach;
  channelOf: Record<string, ConsentChannel>;
  held: Array<{ id: string; why: HeldOn }>;
} {
  const purpose = enrolPurpose(step.policy_class, step.message);
  const how: CampaignHow = {
    channels: step.channels,
    ready: step.ready,
    about: messageAboutOfClass(step.policy_class),
  };
  const reach: RunReach = {
    pool: due.length,
    will: 0,
    noNumber: 0,
    stopped: 0,
    noYes: 0,
    heardThis: 0,
    heardAny: 0,
    overCap: 0,
    overLimit: 0,
    no_address: 0,
    address_stopped: 0,
    no_channel: 0,
  };
  const byChannel: Record<ConsentChannel, number> = { whatsapp: 0, sms: 0, email: 0 };
  const channelOf: Record<string, ConsentChannel> = {};
  const eligible: PersonRowVM[] = [];
  const held: Array<{ id: string; why: HeldOn }> = [];
  for (const r of due) {
    const pick = reachFor(r, purpose, how);
    if (pick.channel) {
      channelOf[r.id] = pick.channel;
      byChannel[pick.channel] += 1;
      eligible.push(r);
      continue;
    }
    held.push({ id: r.id, why: pick.held });
    if (pick.held === "no_number") reach.noNumber += 1;
    else if (pick.held === "stopped" || pick.held === "unsubscribed") reach.stopped += 1;
    else if (pick.held === "no_yes") reach.noYes += 1;
    else if (pick.held === "no_address") reach.no_address = (reach.no_address ?? 0) + 1;
    else if (pick.held === "address_stopped") reach.address_stopped = (reach.address_stopped ?? 0) + 1;
    else reach.no_channel = (reach.no_channel ?? 0) + 1;
  }
  reach.will = eligible.length;
  reach.by_channel = byChannel;
  return { eligible, reach, channelOf, held };
}
