/**
 * The words of a lead's reach-out doors, on its peek and its person's page: Stop writing to them, and for a reach-out its
 * owner sends (00428) Send it and They wrote back….
 */
import { clockDate } from "../../shared/clock";
import { REPLY_INTENT_WORDS, type OwnerSaidIntent } from "../reach-out-replies";

/**
 * They wrote back…, on a lead an email its owner sent went to (00428): what the business said, as the owner says it,
 * read through the one door a reply's reading takes (reach_out_reply_said, claim owner), with its undo.
 */
export const REACH_OUT_SAID_WORDS = {
  door: "They wrote back…",
  ask: (business: string) => `What did ${business} say?`,
  intents: {
    interested: "Interested",
    question: "A question",
    not_now: "Not now",
    no: "No",
    wrong_person: "Wrong person",
  } satisfies Record<OwnerSaidIntent, string>,
  /** A not now asks the day to write again, and a wrong person who to write to instead: each may be left blank. */
  day: "When to write again",
  referTo: "Who to write to instead",
  save: "Save",
  saving: "Saving…",
  back: "Back",
  /** Another tab, or another member, said it first: nothing was written twice. */
  already: (business: string) => `Already said: ${business} wrote back.`,
  /** What the owner's word did; for a not now, the day the lead comes back (the plan's resume_at, as the server made it). */
  done: (
    business: string,
    intent: OwnerSaidIntent,
    back: { at: string | null; tz: string; nowMs: number },
    referTo: string | null = null,
  ): string => {
    switch (intent) {
      case "interested":
      case "question":
        return `${business} is Talking now, and your reach-out stops for them.`;
      case "not_now": {
        const at = back.at ? Date.parse(back.at) : NaN;
        return Number.isFinite(at)
          ? `Your reach-out stops for ${business}. They're back in Leads on ${clockDate(at, back.tz, back.nowMs)}.`
          : `Your reach-out stops for ${business}. They come back in Leads later.`;
      }
      case "no":
        return `${business} said no: nothing more will be written to them.`;
      case "wrong_person":
        return referTo
          ? `Your reach-out stops for ${business}. A step to write to ${referTo} is on Today.`
          : `Your reach-out stops for ${business}. A step to find who to write to instead is on Today.`;
    }
  },
  /** The note the owner's word is on the person's thread, in their own words. */
  note: (intent: OwnerSaidIntent): string => `You said they wrote back: ${REPLY_INTENT_WORDS[intent]}.`,
  /** A drafted email's door: its run, where it is sent from. */
  sendIt: "Send it",
  failed: "Couldn't save that. Nothing changed; try again.",
} as const;

/** "Stop writing to them": the door, its question, what it did, and why it could not. */
export const REACH_OUT_STOP_WORDS = {
  door: "Stop writing to them",
  ask: (business: string) => `Stop writing to ${business}?`,
  detail:
    "No reach-out writes to them again: an email not yet with the mail provider is held back too. They stay in your leads, and you can still write to them yourself from the Inbox.",
  yes: "Stop writing",
  done: (business: string) => `Stopped: nothing more will be written to ${business}`,
  already: (business: string) => `${business} was already stopped`,
  failed: "Couldn't stop it. Nothing changed; try again.",
} as const;

/** A no's undo on the peek, as whoever read it: a reply read as no, or the owner's own word (00428). */
export const REACH_OUT_UNDO_WORDS = {
  read: { label: "Read as no · undo", done: "Undone: it no longer reads as a no." },
  owner: { label: "You said no · undo", done: "Undone: your no is taken back." },
} as const;

/** What "Stop writing to them" answered (00241 reach_out_lead_stop). */
export interface ReachOutStopDto {
  stopped: boolean;
  already: boolean;
  skipped: number;
  leaving: number;
}
