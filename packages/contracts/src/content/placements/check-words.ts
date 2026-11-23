/**
 * What each of the seven checks says when it refuses (the content loop PRD's 6.1 and 6.3, through docs/words.md): what
 * happened, and the one thing to do. A reason that no longer stands offers the three ways on and never "post anyway":
 * leave it out, change the words, or the owner says the fact themselves (call 40).
 */
import { POST_PLACE_SAID, type PostPlace } from "../posts";

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

const inQuotes = (words: string): string => `“${words}”`;

export const CONTENT_CHECK_WORDS = {
  mayNot: "Only an owner or a manager can approve a post.",
  notConnected: (place: PostPlace) => `${POST_PLACE_SAID[place]} isn't connected. Connect it, then approve again.`,
  lineOff: "Instagram doesn't allow posting from here. Connect Meta again and allow it.",
  notTaken: (place: PostPlace, kind: string) => `${POST_PLACE_SAID[place]} doesn't take ${kind} from here.`,
  tooLong: (place: PostPlace, max: number) =>
    `${POST_PLACE_SAID[place]} takes up to ${max.toLocaleString("en-US")} characters. Shorten the words.`,
  video: "Instagram takes a video from 3 seconds to 15 minutes, up to 300 MB, as MP4 or MOV.",
  money: (limitDollars: number) => `This would pass your $${limitDollars} limit. Raise it, or leave one out.`,
  stopped: "AI is paused. Resume to post.",
  aiAlone: "AI asks first before it posts. Approve it to post.",
  /** Before it is approved: what the words lean on is not something the business says of itself (PRD 6.3, Claim). */
  notAnOffer: (offer: string) => `${inQuotes(offer)} isn't one of your offers. Add it, or change the words.`,
  notAService: (service: string) => `${inQuotes(service)} isn't one of your services. Add it, or change the words.`,
  /** A number or a promise AI wrote that the owner never said (PRD 6.3, Claim). */
  notYours: (phrase: string) => `${inQuotes(phrase)} isn't something you've said. Add it, or change the words.`,
  /** Before it is approved: the open time it was made for is gone already. */
  noOpenings: (day: string) => `${day} has no openings now. Leave it out, or change the words.`,
  /** At the send: the open time it was made for filled up since (PRD 6.3, The reason). */
  filledUp: (day: string) =>
    `${day} filled up since you approved this. Leave it out, change the words, or tell AI ${day} still has openings.`,
  late: (day: string) => `Too late to post. ${day} has passed.`,
  afterItsDay: "This would go after its day has passed. Pick an earlier time.",
  offerEnded: (offer: string) =>
    `${inQuotes(offer)} has ended since you approved this. Leave it out, change the words, or tell AI it still runs.`,
  serviceGone: (service: string) =>
    `${inQuotes(service)} is no longer one of your services. Leave it out, change the words, or tell AI you still offer it.`,
} as const;
