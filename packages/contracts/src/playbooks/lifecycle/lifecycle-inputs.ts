/**
 * What Campaigns' home is made from, read off the answers its surfaces read (GET playbooks', GET channels'): the one
 * reading the Playbooks and Broadcasts surfaces (cmp/playbooks/surface.ts, cmp/broadcasts/surface.ts) and Ask's
 * campaigns.journey all make, so the page and Ask hand the home (campaignsHomeOf) the same input and no rule of it is
 * said twice. The business's shape, each card's next run, why it runs nothing here, the day it ended and the day its trial
 * ends (00409, on the business's clock), its archived list and its trigger's words, the moments a new campaign may start
 * from, whether every moment was counted, and the workspace's WhatsApp line.
 *
 * Pure, and tolerant of a key a server from before it does not send (either deploy order): no zone is New York's, no
 * calendar is none, no lists are none, and no word is the one derived from how its customers buy.
 */
import { appointmentWordOf, type AppointmentWord } from "../../journey/appointment-word";
import { PEOPLE_LISTS } from "../../people/lists/lists";
import { FOLLOW_UP_NEEDS_DEALS } from "../playbook-follow-ups";
import { campaignDayWords, campaignEnded, localDate, nextRunLabel, trialDayWords } from "../playbook-schedule";
import { PLAYBOOK_TRIGGERS, momentOffered, triggerOf, triggerOffered, triggerWords } from "../playbook-triggers";
import type { PlaybookDto } from "../playbooks";
import type { LifecycleShape } from "./lifecycle-types";
import { LIFECYCLE_WORDS } from "./lifecycle-words";

/** A playbook as GET playbooks lists it, as far as the home's reading of it goes. */
type AnswerPlaybook = Pick<
  PlaybookDto,
  "trigger" | "state" | "run_hour" | "last_run_for" | "list_id" | "list_key" | "until" | "trial_until"
>;

/** GET playbooks' answer, as far as the home's input reads it; every key but the playbooks may be absent from an older server. */
export interface LifecycleAnswer<P extends AnswerPlaybook = AnswerPlaybook> {
  playbooks: readonly P[];
  timezone?: string | null;
  pools?: Readonly<Record<string, unknown>> | null;
  calendar?: "ok" | "unavailable" | "none" | null;
  /** The workspace's own lists; null where they could not be read, absent from a server from before them. */
  lists?: readonly { id: string; name: string; archived?: boolean }[] | null;
  people_lists?: readonly { key: string; label: string }[] | null;
  deals_on?: boolean | null;
  ready?: { paused?: boolean } | null;
  appointment_word?: string | null;
  bookings_by_email?: boolean | null;
}

/**
 * What the answer says of one card beside its row: its list archived, its trigger's words, its next run, why it runs
 * nothing here, the day it ended and the day its trial ends (LifecyclePlaybook's `ended` and `trial`).
 */
interface LifecycleCardRead {
  listArchived: boolean;
  triggerLabel: string;
  next: string;
  off: string | null;
  ended: string | null;
  trial: string | null;
}

/** A moment that may run here (triggerOffered), and whether a new campaign may start from it (momentOffered). */
interface LifecycleMomentRead {
  trigger: (typeof PLAYBOOK_TRIGGERS)[number];
  offered: boolean;
}

/** The answer, read for the home: the shape, the zone, each card beside its row, the moments, and whether all were counted. */
export interface LifecycleAnswerRead<P extends AnswerPlaybook> {
  shape: LifecycleShape;
  timezone: string;
  cards: { playbook: P; read: LifecycleCardRead }[];
  moments: LifecycleMomentRead[];
  /** False where the server could not count some moment: the page says so once. */
  countsRead: boolean;
}

/** The zone a server from before it sent none is read in. */
const ZONE_UNSAID = "America/New_York";

/**
 * How the business works, from GET playbooks' answer (its businessShape): what the workspace calls an appointment, and
 * whether its appointment moments are counted from a calendar's feed (one connected, readable now or not), from a booking
 * tool's emails, or from neither. A server from before the word answers none, and the one derivation reads how its
 * customers buy instead.
 */
function businessShapeOf(pb: LifecycleAnswer): LifecycleShape {
  const calendarOn = (pb.calendar ?? "none") !== "none";
  return {
    calendar: calendarOn ? "feed" : pb.bookings_by_email === true ? "email" : "none",
    dealsOn: !!pb.deals_on,
    word: appointmentWordOf({ stored: pb.appointment_word ?? null, sellsBy: pb.deals_on ? "proposal" : null }),
  };
}

/**
 * The name of the list a playbook on a list runs on: one of People's by its key (named by contracts where the answer's
 * People read failed: it is never deleted), the workspace's own by its id; null where it is not found.
 */
function listNameOf(p: AnswerPlaybook, pb: LifecycleAnswer): string | null {
  if (p.list_key)
    return (
      (pb.people_lists ?? []).find((l) => l.key === p.list_key)?.label ??
      PEOPLE_LISTS.find((l) => l.id === p.list_key)?.label ??
      null
    );
  return (pb.lists ?? []).find((l) => l.id === p.list_id)?.name ?? null;
}

/** A card's trigger in words: its list's name for one on a list (unread is not deleted), else its trigger's, in the word. */
function triggerLabelOf(p: AnswerPlaybook, pb: LifecycleAnswer, word: AppointmentWord): string {
  if (p.trigger === "saved_list")
    return listNameOf(p, pb) ?? (pb.lists === null ? "A list that could not be read" : "A list that was deleted");
  const t = triggerOf(p.trigger);
  return t ? triggerWords(t, word).label : p.trigger;
}

/** What the answer says of one card (see LifecycleCardRead), by the business's clock and its shape. */
function cardReadOf(
  p: AnswerPlaybook,
  pb: LifecycleAnswer,
  at: { tz: string; now: Date; shape: LifecycleShape },
): LifecycleCardRead {
  const t = triggerOf(p.trigger);
  // A follow-up made while deals were on runs nothing once they are off (0006).
  const dealsOff = t && !triggerOffered(t, at.shape.dealsOn) ? FOLLOW_UP_NEEDS_DEALS : null;
  // Nor does a campaign past its last day, by the business's today (00409).
  const last = campaignEnded(p, localDate(at.tz, at.now));
  const ended = last ? campaignDayWords(last, at.tz, at.now) : null;
  return {
    // Its list was archived (00169): paused until the list is restored or the playbook moved to another.
    listArchived: p.trigger === "saved_list" && !!(pb.lists ?? []).find((l) => l.id === p.list_id)?.archived,
    triggerLabel: triggerLabelOf(p, pb, at.shape.word),
    // While the workspace is paused no time is promised: the card says so instead of "tomorrow 10:00 AM".
    next: nextRunLabel(p, at.tz, at.now, pb.ready?.paused === true),
    // Why it runs nothing here: the card says it, and every rule of the home that skips what runs nothing skips it.
    off: ended ? LIFECYCLE_WORDS.ended(ended) : dealsOff,
    ended,
    trial: trialDayWords(p, at.tz, at.now),
  };
}

/**
 * GET playbooks' answer read for the home at `now`: the business's shape and zone, each playbook beside what the answer
 * says of it, the moments that may run here (a proposal's only where deals are on, 0006; a retired one among them, so a
 * card can read its own) each with whether a new campaign may start from it, and whether every moment was counted.
 */
export function lifecyclePlaybooksOf<P extends AnswerPlaybook>(
  pb: LifecycleAnswer<P>,
  now: Date,
): LifecycleAnswerRead<P> {
  const shape = businessShapeOf(pb);
  const timezone = pb.timezone || ZONE_UNSAID;
  const moments = PLAYBOOK_TRIGGERS.filter((t) => triggerOffered(t, shape.dealsOn));
  const here = { dealsOn: shape.dealsOn, calendarOn: shape.calendar === "feed" };
  return {
    shape,
    timezone,
    cards: pb.playbooks.map((p) => ({ playbook: p, read: cardReadOf(p, pb, { tz: timezone, now, shape }) })),
    moments: moments.map((t) => ({ trigger: t, offered: momentOffered(t, here) })),
    countsRead: moments.every((t) => t.kind === "saved" || !!pb.pools?.[t.id]),
  };
}

/** The workspace's WhatsApp line: its connected WhatsApp number's row, or null with none, or with the channels unread. */
export function whatsappLineOf<C extends { kind: string; status: string }>(
  channels: readonly C[] | null | undefined,
): C | null {
  return channels?.find((c) => c.kind === "whatsapp" && c.status === "active") ?? null;
}
