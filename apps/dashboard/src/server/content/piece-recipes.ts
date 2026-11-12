/**
 * How a video's blocks are arranged, as written advice (decision 0126): the ways that have worked, said to Ask in the words of
 * the tool that proposes a video (ask/tools/act/files/piece.ts), where it reads them as it fills a plan. Advice and not forms:
 * what a video may hold is the checker's (contracts compilePiece), and a request that fits none of these is still a plan. One
 * text, joined into the tool's description; nothing loads it and nothing branches on it.
 */

/** Each way by its name, a paragraph each. */
const RECIPES = {
  hookFirst:
    "Hook first: the result on the first block under a line or two of their words, then two or three moments of how it got there. One client a video: take every moment from one clip unless two clips show the same client that day. Choose moments where the person or what is shown moves, and no stretch where nothing changes for more than two seconds. Three or four clip blocks of 1.5 to 3 seconds, 8 to 10 seconds in all, serve best.",
  beforeAfter:
    "Before and after: a pair, first as the hook or last as the payoff, never both. Its two pictures show the same person from the same side: the before from the earliest footage or an older photo, the after from the finished look. Around it, a moment or two of the work or of the result moving.",
  steps:
    "Steps: one block a step, in the order the work is done, three or four, each with a label of a word or two that names it. No numbers on a label: the order says it. Open or close on the finished result.",
  review:
    "A review: a quote card with the client's best sentence. Put it over a picture of the same kind of work, or between moments of it, and let it be read: about a second for every thirty characters.",
  fromPhotos:
    "From photos: each photo once, the strongest first under the opening words, two to three seconds each; a pair or a words card between them where photos alone would run flat.",
  wordsOnly:
    "Words only, for a business with nothing filmed yet: three or four words cards and no opening words, one thought on each, facts from this workspace alone (what they do, where, when), never a claim. Then tell the owner which two or three short clips to film, so the next one shows the work.",
} as const;

/** The recipes as the tool says them: what they are for, each one, and that none of them binds. */
export const PIECE_RECIPES = [
  "Ways that have worked, as advice, not forms: pick one, borrow from two, or arrange the blocks afresh for a request that fits none.",
  ...Object.values(RECIPES),
  "Always: the first block is what stops a thumb, every picture is the business's own, and nothing is said that the owner or a client did not say.",
].join(" ");
