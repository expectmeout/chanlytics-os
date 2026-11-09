/** Plan: plan. */

import { shiftKey } from "../../shared/zone/day-keys";
import { BROADCAST_NAME_MAX } from "../../campaigns/broadcasts/broadcasts";
import { OFFER_PLAN_WORDS } from "../../campaigns/broadcasts/offer-plan-words";
import { journeyPlan, type PlanLead } from "../../journey/plan";
import { campaignRunsOn } from "../../campaigns/playbooks/schedule";
import { PLAYBOOK_NAME_MAX } from "../../campaigns/playbooks/triggers/notices";
import { clip } from "../answer/shape";
import type { AskPlanHead } from "../thread-words";
import { sendWaitsForReview, stepToken } from "../plan-steps";
import {
  REMINDER_AFTER_DAYS,
  SAY,
  SEND_HOUR,
  audienceOf,
  capOf,
  offerChannels,
  offerDates,
  offerMessage,
  offerNote,
  offerValue,
  planSteps,
  type Audience,
  type ListEntry,
  type Offer,
  type OfferChannel,
  type OfferDates,
  type OfferMessage,
  type PlanIntent,
  type PlanStep,
  type PlanWorld,
  type Room,
  type Said,
} from "./intents";

/**
 * Every running month's offer, paused while the offer runs: on its own cadence it would send this offer, or its own,
 * beside the plan's send, and go on after the offer ends. The words say to resume it after. One past its last day on the
 * business's calendar sends nothing however its state reads (contracts campaignEnded, core run-playbook's judge), so it
 * is left alone, never paused to be resumed.
 */
function monthsOfferPauses(world: PlanWorld, until: string): { input: Record<string, unknown>; said: string }[] {
  // Running by the one rule (campaignRunsOn).
  const at = { tz: world.tz, now: world.now };
  return world.playbooks
    .filter((p) => p.trigger === "everyone_monthly" && campaignRunsOn(p, at))
    .map((p) => ({
      input: { playbook_id: p.id, state: "paused" },
      said: OFFER_PLAN_WORDS[world.says].monthsOfferPaused(p.name, until),
    }));
}

/**
 * The day the words say to ask for a reminder: nineteen days in, or the offer's last day where it ends sooner. None
 * where that is its first day, where the offer is paced (its campaign reaches everyone as the calendar can take them),
 * or where no calendar can say who booked.
 */
function reminderDay(world: PlanWorld, dates: OfferDates, paced: boolean): string | null {
  if (paced || !world.journey?.some((s) => s.id === "before" || s.id === "after")) return null;
  const nineteen = shiftKey(dates.from, REMINDER_AFTER_DAYS);
  const day = nineteen <= dates.until ? nineteen : dates.until;
  return day > dates.from ? day : null;
}

/** What a plan says of its one card, before its message is read (the head's `says` is the cards', act/plan.ts). */
export type PlanHeadOf = Omit<AskPlanHead, "says">;

/** Everything an offer's plan is made of, read and judged before a step is numbered. */
interface OfferRead {
  offer: Offer;
  dates: OfferDates;
  on: OfferChannel[];
  onSaid: string[];
  audience: ListEntry;
  to: Audience;
  message: OfferMessage;
  /** The calendar's room and the audience, where it has less room than half of it; null where it has more or is not known. */
  tight: { room: Room; audience: number } | null;
  /** The paced campaign's cap, where the room is tight and the offer starts today; null where the offer is a broadcast. */
  cap: number | null;
  /** What the send is: the paced campaign (a playbook) where there is a cap, else the broadcast. */
  kind: "broadcast" | "playbook";
  /** The day to ask for a reminder, or null. */
  reminder: string | null;
  note: ReturnType<typeof receptionistNote>;
  pauses: ReturnType<typeof monthsOfferPauses>;
}

/**
 * The receptionist's note as a step, where the receptionist lacks it and the member asking may approve one, and what
 * the plan says of it: made, already held, or left for an owner or a partner to add (PlanWorld.canNote).
 */
function receptionistNote(
  offer: Offer,
  line: string,
  dates: OfferDates,
  world: PlanWorld,
): { input: Record<string, unknown> | null; said: string } {
  const words = OFFER_PLAN_WORDS[world.says];
  const input = offerNote(offer, line, dates, world.notes);
  if (!input) return { input: null, said: words.noteKnown };
  return world.canNote ? { input, said: words.noteMade(dates.untilSaid) } : { input: null, said: words.noteLeftOut };
}

function offerRead(offer: Offer, say: string | undefined, world: PlanWorld): OfferRead | { refused: string } {
  if (!offer.words.trim()) return { refused: SAY.noWords };
  const dates = offerDates(offer, world);
  if ("refused" in dates) return dates;
  if (offer.channels?.length === 0) return { refused: SAY.noChannelNamed };
  // Texts alone: no channel the workspace could set up would carry it, so not "nothing here can carry an offer".
  if (offer.channels?.every((c) => c === "sms")) return { refused: SAY.textOnly };
  const channels = offerChannels(offer.channels, world.channels, OFFER_PLAN_WORDS[world.says]);
  if (channels.on.length === 0) return { refused: channels.refused };
  const audience = world.lists.find((l) => l.token === (offer.who ?? world.offersList));
  const to = audience ? audienceOf(audience.token) : null;
  if (!audience || !to) return { refused: SAY.noOffersList };
  const value = offerValue(offer, say, dates);
  if ("refused" in value) return value;
  const { line } = value;
  const room = world.room;
  // Room not known is never full (calendar.room's none, or a calendar with no slot either way).
  const tight =
    room && audience.count !== null && room.open * 2 < audience.count ? { room, audience: audience.count } : null;
  // The room is counted over the days from now and a campaign sends from its Approve: an offer is paced to it only on
  // its first day. One that starts later is its broadcast to the whole list, and the words say how to pace it instead.
  const cap = tight && dates.from === dates.today ? capOf(tight.room) : null;
  // The message once the send's kind is known: whether WhatsApp's review holds it decides which versions it may reuse.
  const kind = cap === null ? "broadcast" : "playbook";
  const picked = offerMessage(world, channels.on, line, kind, channels.unasked);
  if ("refused" in picked) return picked;
  return {
    offer,
    dates,
    on: picked.on,
    onSaid: [...channels.said, ...picked.said],
    audience,
    to,
    message: picked.message,
    tight,
    cap,
    kind,
    reminder: reminderDay(world, dates, cap !== null),
    note: receptionistNote(offer, line, dates, world),
    pauses: monthsOfferPauses(world, dates.untilSaid),
  };
}

/** A WhatsApp version the send goes by still to be reviewed: the one the plan writes, or one in review it reuses. */
const awaitsReview = (r: OfferRead): boolean => r.on.includes("whatsapp") && (r.message.made || r.message.inReview);

/** What no card says of the send: the room, WhatsApp's review of a paced campaign by email too, the reminder's day. */
function sendUnseen(offerRead: OfferRead, world: PlanWorld): string[] {
  const words = OFFER_PLAN_WORDS[world.says];
  const room = offerRead.tight
    ? [
        offerRead.cap !== null
          ? words.paced(offerRead.tight.room, offerRead.tight.audience, offerRead.cap)
          : words.roomTight(offerRead.tight.room, offerRead.tight.audience, offerRead.dates.fromSaid),
      ]
    : [];
  return [
    ...room,
    ...(awaitsReview(offerRead) && !sendWaitsForReview(offerRead.kind, offerRead.on) ? [words.whatsappReview] : []),
    ...(offerRead.reminder
      ? [words.reminderAsk(words.day(offerRead.reminder, world.tz, world.now), offerRead.audience.name)]
      : []),
  ];
}

/** The broadcast's day and hour, which its card shows: none for the paced campaign, whose words say it starts at Approve. */
function sendDay(r: OfferRead, words: Said): string[] {
  if (r.cap !== null) return [];
  const hour = words.hour(SEND_HOUR);
  return [
    r.dates.firstAt === null
      ? words.firstAtApprove(r.audience.name, hour)
      : words.firstSend(r.audience.name, r.dates.fromSaid, hour),
  ];
}

/** A chip beside a plan's sentence: a number it rests on, and where that number opens. */
export interface PlanFigure {
  value: string;
  label: string;
  /** A page (its route) or a list (its token); none is a chip with no door ("3 a day"). */
  source: { kind: "page" | "list"; id: string; label: string } | null;
}

/** The numbers an offer's sentence rests on: the room, who said yes and the pace; or just who can hear it. */
function offerFigures(r: OfferRead, world: PlanWorld): PlanFigure[] {
  const chips = OFFER_PLAN_WORDS[world.says].chips;
  const onList = { kind: "list", id: r.audience.token, label: r.audience.name } as const;
  if (!r.tight)
    return r.audience.count === null ? [] : [{ value: String(r.audience.count), label: chips.hear, source: onList }];
  return [
    {
      value: String(r.tight.room.open),
      label: chips.slots(r.tight.room.open),
      source: { kind: "page", id: "calendar", label: "Calendar" },
    },
    { value: String(r.tight.audience), label: chips.said, source: onList },
    ...(r.cap === null ? [] : [{ value: String(r.cap), label: chips.pace, source: null }]),
  ];
}

/** The offer's one sentence: why it has this shape. */
function offerWhy(r: OfferRead, world: PlanWorld): string {
  const why = OFFER_PLAN_WORDS[world.says].why;
  if (!r.tight) return why.plain;
  return r.cap === null ? why.tight : why.paced;
}

/** The offer in its owner's words, as a card's title reads it: its first letter a capital, no stop at its end. */
const offerTitle = (words: string): string => {
  const said = words.trim().replace(/[.!…]+$/, "");
  return `${said.charAt(0).toUpperCase()}${said.slice(1)}`;
};

function offerPlan(
  offerRead: OfferRead,
  world: PlanWorld,
): { steps: PlanStep[]; words: string; head: PlanHeadOf; figures: PlanFigure[]; why: string } {
  const { steps, add } = planSteps();
  const does = OFFER_PLAN_WORDS[world.says].does;
  const hour = OFFER_PLAN_WORDS[world.says].hour(SEND_HOUR);
  const template_id = offerRead.message.made
    ? stepToken(add("message", offerRead.message.input, SAY.why.message, does.keeps))
    : offerRead.message.id;
  if (offerRead.note.input) add("note", offerRead.note.input, SAY.why.note, does.tells(offerRead.dates.untilSaid));
  for (const p of offerRead.pauses) add("change", p.input, SAY.why.pause, does.pauses(offerRead.dates.untilSaid));
  const sends = { template_id, params: offerRead.message.params };
  const title = SAY.offerTitle(offerRead.offer.words);
  if (offerRead.cap !== null)
    add(
      "playbook",
      {
        trigger: "saved_list",
        list: offerRead.audience.token,
        policy_class: "campaign",
        ...sends,
        cap_per_run: offerRead.cap,
        name: clip(title, PLAYBOOK_NAME_MAX),
        channels: offerRead.on,
        until: offerRead.dates.until,
      },
      SAY.why.paced,
      does.paced(offerRead.cap, hour),
    );
  else
    add(
      "broadcast",
      {
        ...sends,
        ...offerRead.to,
        ...(offerRead.dates.firstAt === null ? {} : { scheduled_for: new Date(offerRead.dates.firstAt).toISOString() }),
        name: clip(title, BROADCAST_NAME_MAX),
        channels: offerRead.on,
      },
      SAY.why.first,
      offerRead.dates.firstAt === null ? does.atPress : does.once(offerRead.dates.fromSaid, hour),
    );
  // What no card carries first, then what the cards show: the answer's detail, cut at 700 characters, keeps the first.
  const offerWords = OFFER_PLAN_WORDS[world.says];
  const words = [
    ...offerRead.onSaid,
    ...(offerRead.note.input ? [] : [offerRead.note.said]),
    ...offerRead.pauses.map((p) => p.said),
    ...sendUnseen(offerRead, world),
    // A send WhatsApp's review holds, approved once it is reviewed, as its card says too (plan-steps.ts reviewedStep).
    ...(awaitsReview(offerRead) && sendWaitsForReview(offerRead.kind, offerRead.on) ? [offerWords.reviewFirst] : []),
    offerRead.message.made
      ? offerWords.writeMessage(offerRead.message.name, offerRead.on)
      : offerWords.reuseMessage(offerRead.message.name),
    ...(offerRead.note.input ? [offerRead.note.said] : []),
    ...sendDay(offerRead, offerWords),
  ];
  return {
    steps,
    words: words.join(" "),
    head: {
      title: offerTitle(offerRead.offer.words),
      sub: offerWords.sub(offerRead.on, offerRead.dates.untilSaid),
      press: "offer",
    },
    figures: offerFigures(offerRead, world),
    why: offerWhy(offerRead, world),
  };
}

/* ------------------------------------------------------------------ the plan */

/**
 * The steps of an intent against the workspace as it stands, what the plan says, and, for a setup that waits on
 * something, what its answer leads with; or why there is no plan.
 */
export function planOf(
  intent: PlanIntent,
  world: PlanWorld,
):
  | {
      steps: PlanStep[];
      words: string;
      lead?: PlanLead | null;
      head?: PlanHeadOf;
      figures?: PlanFigure[];
      why?: string;
    }
  | { refused: string } {
  if (intent.intent === "cover_journey") return journeyPlan(intent, world);
  const read = offerRead(intent.offer, intent.say, world);
  return "refused" in read ? read : offerPlan(read, world);
}
