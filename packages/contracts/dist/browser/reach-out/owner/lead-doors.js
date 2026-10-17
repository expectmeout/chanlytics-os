import { clockDate } from "../../shared/clock.js";
import { REPLY_INTENT_WORDS } from "../reach-out-replies.js";
export const REACH_OUT_SAID_WORDS = {
  door: "They wrote back\u2026",
  ask: (business) => `What did ${business} say?`,
  intents: {
    interested: "Interested",
    question: "A question",
    not_now: "Not now",
    no: "No",
    wrong_person: "Wrong person"
  },
  /** A not now asks the day to write again, and a wrong person who to write to instead: each may be left blank. */
  day: "When to write again",
  referTo: "Who to write to instead",
  save: "Save",
  saving: "Saving\u2026",
  back: "Back",
  /** Another tab, or another member, said it first: nothing was written twice. */
  already: (business) => `Already said: ${business} wrote back.`,
  /** What the owner's word did; for a not now, the day the lead comes back (the plan's resume_at, as the server made it). */
  done: (business, intent, back, referTo = null) => {
    switch (intent) {
      case "interested":
      case "question":
        return `${business} is Talking now, and your sequence stops for them.`;
      case "not_now": {
        const at = back.at ? Date.parse(back.at) : NaN;
        return Number.isFinite(at) ? `Your sequence stops for ${business}. They're back in Leads on ${clockDate(at, back.tz, back.nowMs)}.` : `Your sequence stops for ${business}. They come back in Leads later.`;
      }
      case "no":
        return `${business} said no: nothing more will be written to them.`;
      case "wrong_person":
        return referTo ? `Your sequence stops for ${business}. A step to write to ${referTo} is on Today.` : `Your sequence stops for ${business}. A step to find who to write to instead is on Today.`;
    }
  },
  /** The note the owner's word is on the person's thread, in their own words. */
  note: (intent) => `You said they wrote back: ${REPLY_INTENT_WORDS[intent]}.`,
  /** A drafted email's door: its run, where it is sent from. */
  sendIt: "Send it",
  failed: "Couldn't save that. Nothing changed; try again."
};
export const REACH_OUT_STOP_WORDS = {
  door: "Stop writing to them",
  ask: (business) => `Stop writing to ${business}?`,
  detail: "No sequence writes to them again: an email not yet with the mail provider is held back too. They stay in your leads, and you can still write to them yourself from the Inbox.",
  yes: "Stop writing",
  done: (business) => `Stopped: nothing more will be written to ${business}`,
  already: (business) => `${business} was already stopped`,
  failed: "Couldn't stop it. Nothing changed; try again."
};
export const REACH_OUT_UNDO_WORDS = {
  read: { label: "Read as no \xB7 undo", done: "Undone: it no longer reads as a no." },
  owner: { label: "You said no \xB7 undo", done: "Undone: your no is taken back." }
};
