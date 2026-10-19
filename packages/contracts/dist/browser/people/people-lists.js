import { MONTH_MS } from "./person-helpers.js";
import { WEEK_MS } from "../shared/time.js";
import { sendOnceRoute } from "../sequences/sequence-address.js";
import { GET_YES_ROUTE } from "./lists/people-route.js";
const USE_IN_A_BROADCAST = "Send them a message";
const OFFERS_STEP = { cta: "Message everyone who said yes", to: sendOnceRoute("offers_ok"), broadcast: true };
const LIST_STEPS = {
  needs_you: { cta: "Open the Inbox", to: "inbox", text: "Each of them is waiting for a person." },
  waiting_on_you: {
    cta: "Open the Inbox",
    to: "inbox",
    text: "You have these threads: the receptionist stays quiet on them until you hand them back."
  },
  new_week: {
    cta: "Get their yes",
    to: GET_YES_ROUTE,
    text: "Their yes to offers is the phrase and the QR under Get their yes.",
    answered: { cta: USE_IN_A_BROADCAST, to: sendOnceRoute("new_week") }
  },
  booked_week: { cta: "See the week", to: "calendar", text: "Their bookings are on the Calendar." },
  asked_never_booked: { cta: "Text the booking link", to: sendOnceRoute("asked_never_booked"), broadcast: true },
  // "Bring them back", never "Win them back": Win-back is the playbook for the quiet (quiet_30), and this list has its
  // own, named Lapsed.
  lapsed: { cta: "Bring them back", to: sendOnceRoute("lapsed"), broadcast: true },
  // The journey past the booking (0004). Clients has no step: an engagement running is not something to push.
  consultation_booked: { cta: "See the week", to: "calendar", text: "Their consultations are on the Calendar." },
  proposal_out: {
    cta: "Open the Inbox",
    to: "inbox",
    text: "A word from you is the next step; nothing sends on its own."
  },
  deal_ended: { cta: "Win them back", to: sendOnceRoute("deal_ended"), broadcast: true },
  quiet: { cta: "Reach out", to: sendOnceRoute("quiet"), broadcast: true },
  // The broadcast step belongs to the OFFERS list, not to this one: a person on
  // this list has said yes to hearing from the business, which is not a yes to a
  // promotion. Sending them here with "New broadcast" is what made the empty
  // audience feel like a bug in the composer rather than a missing answer.
  opted_in: {
    cta: "Get their yes to offers",
    to: GET_YES_ROUTE,
    text: "They get replies, reminders and confirmations. Offers need a second, separate yes.",
    answered: OFFERS_STEP
  },
  offers_ok: OFFERS_STEP
};
export function peopleListAction(id, members) {
  const step = LIST_STEPS[id];
  if (!step) return null;
  if (step.answered && members.length > 0 && members.every((m) => m.saidYes.offers))
    return broadcastStep(step.answered.cta, step.answered.to, members);
  if (!step.broadcast) return { text: step.text ?? "", cta: step.cta, to: step.to, enabled: members.length > 0 };
  return broadcastStep(step.cta, step.to, members);
}
export function savedListAction(id, members) {
  return broadcastStep(USE_IN_A_BROADCAST, sendOnceRoute(id), members);
}
export const NO_NUMBER_REACH = "a send reaches only a recorded yes with a number to send to";
export function noNumberWords(who, purpose) {
  return `Nobody on ${who} can be sent ${purpose === "marketing" ? "an offer" : "a message"} yet \u2014 ${NO_NUMBER_REACH}.`;
}
export const NO_CHANNEL_REACH = "a send needs a channel you can send on, and none can carry it right now";
export function noChannelWords(who, purpose) {
  return `Nobody on ${who} can be sent ${purpose === "marketing" ? "an offer" : "a message"} yet \u2014 ${NO_CHANNEL_REACH}.`;
}
export function cannotBeSentWords(who, purpose, said) {
  const kind = purpose === "marketing" ? "offers" : "messages";
  if (said.length === 0 || said.some((m) => m.canReceive[kind])) return null;
  return said.some((m) => m.whyNot[kind] === "no_channel") ? noChannelWords(who, purpose) : noNumberWords(who, purpose);
}
export function saidYesWords(who, purpose, sending, saidYes, noChannel = null) {
  const noNumber = sending === 0 && saidYes > 0;
  const n = noNumber ? saidYes : sending;
  const words = `${n} ${n === 1 ? "person" : "people"} on ${who} said yes to ${purpose === "marketing" ? "offers" : "messages"}`;
  if (!noNumber) return words;
  if (noChannel)
    return `${words}, ${n === 1 ? "who can't" : "none can"} be sent ${purpose === "marketing" ? "an offer" : "a message"} \u2014 ${noChannel}`;
  return `${words}, ${n === 1 ? "with no number" : "none with a number"} to send to`;
}
function broadcastStep(cta, to, members) {
  const offersYes = members.filter((m) => m.canReceive.offers).length;
  if (offersYes === 0) {
    const said = members.filter((m) => m.saidYes.offers);
    if (members.length && said.length === 0) {
      return {
        text: "Nobody on this list has said yes to offers yet \u2014 an offer reaches only that answer.",
        cta: "Get their yes",
        to: GET_YES_ROUTE,
        enabled: true
      };
    }
    const why = cannotBeSentWords("this list", "marketing", said) ?? noNumberWords("this list", "marketing");
    return { text: members.length ? why : "Nobody here right now.", cta, to, enabled: false };
  }
  return {
    text: `${offersYes} of ${members.length} on this list said yes to offers \u2014 an offer reaches them.`,
    cta,
    to,
    enabled: true
  };
}
export function peopleAggregates(rows, nowMs) {
  let needsYou = 0;
  let oldest = null;
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
    askedNotBooked
  };
}
