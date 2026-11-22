/**
 * What each of the seven checks says when it refuses (the content loop PRD's 6.1 and 6.3, through docs/words.md): what
 * happened, and the one thing to do. A reason that no longer stands offers the three ways on and never "post anyway":
 * leave it out, change the words, or the owner says the fact themselves (call 40).
 */
import { POST_PLACE_SAID, type PostPlace } from "./posts";

/** The seven checks, in the order they are asked (PRD 6.1). */
export const CONTENT_CHECKS = [
  "authorization",
  "rights",
  "claims",
  "publishing",
  "money",
  "automation",
  "reason",
] as const;
export type ContentCheck = (typeof CONTENT_CHECKS)[number];

const quoteOf = (words: string): string => `“${words}”`;

export const CHECK_WORDS = {
  mayNot: "Only an owner or a manager can approve a post.",
  takenBack: "Someone in it took back their yes to posts. Use another photo or clip.",
  /** PRD 6.3's words: a person named in it with no yes for this use, or nobody sure who is in it. */
  notYetSaid: (name: string | null) =>
    name
      ? `${name} hasn't said yes to being in posts. Ask them, or use another clip.`
      : "Say who is in it before it's posted.",
  claim: (problem: string) => `${problem} Change the words, or add it to the business's details.`,
  notConnected: (place: PostPlace) => `${POST_PLACE_SAID[place]} isn't connected. Connect it, then approve again.`,
  lineOff: "Instagram doesn't allow posting from here. Connect Meta again and allow it.",
  notTaken: (place: PostPlace, kind: string) => `${POST_PLACE_SAID[place]} doesn't take ${kind} from here.`,
  tooLong: (place: PostPlace, max: number) =>
    `${POST_PLACE_SAID[place]} takes up to ${max.toLocaleString("en-US")} characters. Shorten the words.`,
  video: "Instagram takes a video from 3 seconds to 15 minutes, up to 300 MB, as MP4 or MOV.",
  money: (limitDollars: number) => `This would pass your $${limitDollars} limit. Raise it, or leave one out.`,
  stopped: "AI is paused. Resume to post.",
  aiAlone: "AI asks first before it posts. Approve it to post.",
  needsDay: (phrase: string) => `This says ${quoteOf(phrase)}. Tell AI which day it's about.`,
  needsOffer: (phrase: string) => `This names ${quoteOf(phrase)}. Tell AI which offer it is and when it ends.`,
  late: (day: string) => `Too late to post. ${day} has passed.`,
  afterItsDay: "This would go after its day has passed. Pick an earlier time.",
  offerEnded: (offer: string) =>
    `${quoteOf(offer)} has ended since you approved this. Leave it out, change the words, or tell AI it still runs.`,
  serviceGone: (service: string) =>
    `${quoteOf(service)} is no longer one of your services. Leave it out, change the words, or tell AI you still offer it.`,
} as const;
