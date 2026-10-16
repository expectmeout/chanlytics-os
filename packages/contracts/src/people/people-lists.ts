/**
 * What a People list offers to do next (a broadcast to the ones who said yes, the step that gets more), and the
 * page's aggregates. Moved whole from people.ts (Reach out Part 2.5); people/index.ts names it.
 */
import type { AskedPurpose } from "../consent/consent";
import type { PersonRowVM } from "./person-row";
import { MONTH_MS } from "./person-helpers";
import { WEEK_MS } from "../shared/time";

/* ---------------------------- lists and totals --------------------------- */

// The built-in lists and their groups are lists.ts's (decision 0009): each a rule in the owner's own language.

export interface PeopleListAction {
  /** The sentence under the list: what the step reaches, or why it cannot yet. */
  text: string;
  /** The button's words. */
  cta: string;
  /** A route. */
  to: string;
  enabled: boolean;
}

/**
 * Where a person's yes to offers is got: Broadcasts' "Get their yes" section,
 * brought into view -- the QR for the desk, the phrase, the link for a bio, the
 * paper form.
 *
 * Five places said the fix was there -- "The phrase and the QR are on
 * Broadcasts" -- and none of them went there: two steps opened the TOP of
 * Broadcasts, where the composer is and the QR is below the fold, and three
 * printed the sentence beside a disabled button. One route, one spelling.
 */
export const GET_YES_ROUTE = "broadcasts/get-yes";

/** A list's broadcast, where the list is an audience of its own: a list kept by hand, and New this week once answered. */
const USE_IN_A_BROADCAST = "Use in a broadcast";

// Broadcasts has no audience for this list: its people are exactly who a broadcast reaches, so the composer opens on
// Everyone, and the button says who that reaches. It said "New broadcast" here and "Use in a broadcast" on Lists,
// and opened an audience with another name. The door names this list, as every list's step names its own
// (`broadcasts/<list>` lands on `campaigns/new:to:<list>`, contracts doorOf): the composer reads a consent list as
// Everyone (CONSENT_LIST_IDS), and a door that names a list wins over a draft kept in the tab, which a bare
// `campaigns/new` does not. `broadcasts` alone is the Sent room, which is where this button landed: a list of what
// went out and nothing to write in.
const OFFERS_STEP = { cta: "Broadcast to everyone who said yes", to: "broadcasts/offers_ok", broadcast: true };

/**
 * `answered`: what a step that is a door to the yes to offers becomes once everyone on the list has given it. Asking
 * again would ask for an answer they gave (#663's rule), so the step is the list's broadcast instead.
 */
const LIST_STEPS: Record<
  string,
  { cta: string; to: string; broadcast?: boolean; text?: string; answered?: { cta: string; to: string } }
> = {
  needs_you: { cta: "Open the Inbox", to: "inbox", text: "Each of them is waiting for a person." },
  waiting_on_you: {
    cta: "Open the Inbox",
    to: "inbox",
    text: "You have these threads: the receptionist stays quiet on them until you hand them back.",
  },
  new_week: {
    cta: "Get their yes",
    to: GET_YES_ROUTE,
    text: "Their yes to offers is the phrase and the QR under Get their yes in Sent.",
    answered: { cta: USE_IN_A_BROADCAST, to: "broadcasts/new_week" },
  },
  booked_week: { cta: "See the week", to: "calendar", text: "Their bookings are on the Calendar." },
  asked_never_booked: { cta: "Text the booking link", to: "broadcasts/asked_never_booked", broadcast: true },
  // "Bring them back", never "Win them back": Win-back is the playbook for the quiet (quiet_30), and this list has its
  // own, named Lapsed.
  lapsed: { cta: "Bring them back", to: "broadcasts/lapsed", broadcast: true },
  // The journey past the booking (0004). Clients has no step: an engagement running is not something to push.
  consultation_booked: { cta: "See the week", to: "calendar", text: "Their consultations are on the Calendar." },
  proposal_out: {
    cta: "Open the Inbox",
    to: "inbox",
    text: "A word from you is the next step; nothing sends on its own.",
  },
  deal_ended: { cta: "Win them back", to: "broadcasts/deal_ended", broadcast: true },
  quiet: { cta: "Reach out", to: "broadcasts/quiet", broadcast: true },
  // The broadcast step belongs to the OFFERS list, not to this one: a person on
  // this list has said yes to hearing from the business, which is not a yes to a
  // promotion. Sending them here with "New broadcast" is what made the empty
  // audience feel like a bug in the composer rather than a missing answer.
  opted_in: {
    cta: "Get their yes to offers",
    to: GET_YES_ROUTE,
    text: "They get replies, reminders and confirmations. Offers need a second, separate yes.",
    answered: OFFERS_STEP,
  },
  offers_ok: OFFERS_STEP,
};

/**
 * The obvious next step for a list, when it has one. A broadcast reaches
 * only a recorded yes, so the sentence says how many of the list said it,
 * and the button waits until someone has.
 *
 * WHICH yes it counts is the MARKETING one, because these steps all open the
 * composer on a promotional send (win them back, reach the quiet ones, run an
 * offer). Counting the conversational answer here promised an audience the
 * composer would then refuse -- the same mismatch, one screen earlier. Who said it, and who can be sent an offer, are
 * the rows' own facts (`saidYes`, `canReceive`: reach-any.ts, over the channels the workspace can send on now).
 */
export function peopleListAction(id: string, members: PersonRowVM[]): PeopleListAction | null {
  const step = LIST_STEPS[id];
  if (!step) return null;
  if (step.answered && members.length > 0 && members.every((m) => m.saidYes.offers))
    return broadcastStep(step.answered.cta, step.answered.to, members);
  if (!step.broadcast) return { text: step.text ?? "", cta: step.cta, to: step.to, enabled: members.length > 0 };
  return broadcastStep(step.cta, step.to, members);
}

/**
 * A list kept by hand has one onward step: a broadcast to the people on it who said yes to offers. The same
 * sentence and the same rule as a smart list's broadcast step, so the two kinds of list read alike on People,
 * which is where both live now (the Lists page folded into it).
 */
export function savedListAction(id: string, members: PersonRowVM[]): PeopleListAction {
  return broadcastStep(USE_IN_A_BROADCAST, `broadcasts/${id}`, members);
}

/**
 * Why nobody can be sent a thing when somebody said the yes it needs: what a broadcast reaches. The reason in
 * `noNumberWords`, and the arithmetic under Today's reach row (today-leaks.ts todayLeaks), in one spelling.
 */
export const NO_NUMBER_REACH = "a broadcast reaches only a recorded yes with a number to send to";

/**
 * Nobody on a list can be sent this, and somebody on it said yes: what is missing is a number to send it to. People's
 * list step says it of a list (#663) and the send screen of the audience it has open -- `who` is "this list" or the
 * audience's name -- so the two say it in one spelling.
 */
export function noNumberWords(who: string, purpose: AskedPurpose): string {
  return `Nobody on ${who} can be sent ${purpose === "marketing" ? "an offer" : "a message"} yet — ${NO_NUMBER_REACH}.`;
}

/**
 * Why nobody can be sent a thing when somebody said the yes it needs and the workspace has no channel to send it on
 * now (its WhatsApp number is not connected or not allowed to send, for an offer): reachFor's "no_channel". The reason
 * in `noChannelWords`, and the arithmetic under Today's reach row, in one spelling.
 */
export const NO_CHANNEL_REACH = "a broadcast needs a channel you can send on, and none can carry it right now";

/**
 * Nobody on a list can be sent this, somebody on it said yes, and the workspace has no channel to send it on now: what
 * is missing is the channel, not a number. Said as `noNumberWords` is, of a list or an audience.
 */
export function noChannelWords(who: string, purpose: AskedPurpose): string {
  return `Nobody on ${who} can be sent ${purpose === "marketing" ? "an offer" : "a message"} yet — ${NO_CHANNEL_REACH}.`;
}

/**
 * Why nobody on a list can be sent this kind of message while somebody on it said the yes it needs, in People's words:
 * no channel the workspace can send it on now, where any who said it is held for that (`noChannelWords`), else no number
 * to send it to (`noNumberWords`). `said` is who on it said that yes (the rows' `saidYes`); null where one of them can be
 * sent it, or nobody said yes. People's list step says it of a list, and Ask's lists read of each audience.
 */
export function cannotBeSentWords(
  who: string,
  purpose: AskedPurpose,
  said: readonly Pick<PersonRowVM, "canReceive" | "whyNot">[],
): string | null {
  const kind = purpose === "marketing" ? "offers" : "messages";
  if (said.length === 0 || said.some((m) => m.canReceive[kind])) return null;
  return said.some((m) => m.whyNot[kind] === "no_channel") ? noChannelWords(who, purpose) : noNumberWords(who, purpose);
}

/**
 * How many on an audience said yes to what a message needs, as the send screen's line under the audience says it.
 * The number is who it reaches (`sending`: a yes and a number), in the shorthand People's list step uses ("N of M on
 * this list said yes to offers — an offer reaches them") -- except when that is 0 and somebody DID say yes
 * (`saidYes`, audiencePreview's): "0 people … said yes" stood over `noNumberWords` and was false, so it says how many
 * did, and what they are missing: a number to send to, or, where `noChannel` gives the reason no channel it goes by can
 * carry it (Meta's pause on offers to US numbers), that reason.
 */
export function saidYesWords(
  who: string,
  purpose: AskedPurpose,
  sending: number,
  saidYes: number,
  noChannel: string | null = null,
): string {
  const noNumber = sending === 0 && saidYes > 0;
  const n = noNumber ? saidYes : sending;
  const words = `${n} ${n === 1 ? "person" : "people"} on ${who} said yes to ${purpose === "marketing" ? "offers" : "messages"}`;
  if (!noNumber) return words;
  if (noChannel)
    return `${words}, ${n === 1 ? "who can't" : "none can"} be sent ${purpose === "marketing" ? "an offer" : "a message"} — ${noChannel}`;
  return `${words}, ${n === 1 ? "with no number" : "none with a number"} to send to`;
}

function broadcastStep(cta: string, to: string, members: PersonRowVM[]): PeopleListAction {
  const offersYes = members.filter((m) => m.canReceive.offers).length;
  if (offersYes === 0) {
    // People on the list, and not one of them has said yes to offers: the
    // list's own step cannot run, and the thing that CAN is getting that yes.
    // It printed "The phrase and the QR are on Broadcasts" beside a disabled
    // "Win them back" -- the answer in words, next to a button that went
    // nowhere. The button is the door to the answer now. Navigation only: who
    // may be sent an offer is exactly what it was.
    //
    // NOT when someone here already said yes and simply cannot be reached: sending
    // them to "get their yes" would ask for an answer they gave. That case keeps the
    // list's own step, waiting, as before, and says which it is: no number to send to
    // (offers go by WhatsApp), or no channel the workspace can send an offer on now.
    const said = members.filter((m) => m.saidYes.offers);
    if (members.length && said.length === 0) {
      return {
        text: "Nobody on this list has said yes to offers yet — an offer reaches only that answer.",
        cta: "Get their yes",
        to: GET_YES_ROUTE,
        enabled: true,
      };
    }
    const why = cannotBeSentWords("this list", "marketing", said) ?? noNumberWords("this list", "marketing");
    return { text: members.length ? why : "Nobody here right now.", cta, to, enabled: false };
  }
  return {
    text: `${offersYes} of ${members.length} on this list said yes to offers — an offer reaches them.`,
    cta,
    to,
    enabled: true,
  };
}

export interface PeopleAggregates {
  total: number;
  needsYou: number;
  needsYouOldestMs: number | null;
  /** First contact within 30 days, by evidence. */
  newThisMonth: number;
  /** Any message or call within 7 days. */
  reachedWeek: number;
  reachedWeekNew: number;
  /** An appointment ahead on the calendar. */
  booked: number;
  /** Wrote or called this month; the calendar has never had them. */
  askedNotBooked: number;
}

export function peopleAggregates(rows: PersonRowVM[], nowMs: number): PeopleAggregates {
  let needsYou = 0;
  let oldest: number | null = null;
  let newThisMonth = 0;
  let reachedWeek = 0;
  let reachedWeekNew = 0;
  let booked = 0;
  let askedNotBooked = 0;
  for (const v of rows) {
    if (v.booked) booked++;
    if (v.askedNotBooked) askedNotBooked++;
    if (v.state === "needs_you") {
      needsYou++;
      if (v.needsYouSinceMs !== null && (oldest === null || v.needsYouSinceMs < oldest)) oldest = v.needsYouSinceMs;
    }
    if (v.firstContact.evidence && v.firstContact.ts !== null && nowMs - v.firstContact.ts <= MONTH_MS) newThisMonth++;
    if (v.lastContact.ts !== null && nowMs - v.lastContact.ts <= WEEK_MS) {
      reachedWeek++;
      if (v.state === "new") reachedWeekNew++;
    }
  }
  return {
    total: rows.length,
    needsYou,
    needsYouOldestMs: oldest,
    newThisMonth,
    reachedWeek,
    reachedWeekNew,
    booked,
    askedNotBooked,
  };
}
