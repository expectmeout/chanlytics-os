/**
 * Ask's second skill, the video maker (decision 0126): how a video's blocks have been arranged well, as written advice.
 * Advice and not forms: what a video may hold is the checker's (contracts compilePiece), and a request that fits none of
 * these is still a plan. Nothing branches on it.
 *
 * Ask arranges a video itself (ask/tools/act/files/piece.ts), so this skill has no craft call behind it: its guide is all
 * of it. It rides in the turn whose question asks for a video (registry.ts skillsAsked) and is read with the guide tool
 * where the words did not ask; the video tool's own description says so, and carries none of it. Until 13 November 2026 it
 * was that description's tail, in every owner's tools block, which stood two characters under its ceiling
 * (tests/ask/tools/ask-tools-size.test.mjs).
 */
import type { AskSkill } from "@chanlytics/contracts";

/** Each way by its name, a paragraph each. */
const RECIPES = {
  hookFirst:
    "Hook first: the result on the first block under a line or two of their words, then two or three moments of how it got there. One client a video: take every moment from one clip unless two clips show the same client that day. Choose moments where the person or what is shown moves, and no stretch where nothing changes for more than two seconds. Three or four clips of 1.5 to 3 seconds serve best.",
  beforeAfter:
    "Before and after: a pair, first as the hook or last as the payoff, never both. Open with what changed, not the words before and after. Its two pictures show the same person from the same side: the before from the earliest footage or an older photo, the after from the finished look. Around it, a moment or two of the work or of the result moving.",
  steps:
    "Steps: one block a step, in the order the work is done, three or four, each with a label of a word or two that names it. No numbers on a label: the order says it. Open or close on the finished result.",
  review:
    "A review: one quote card with the client's best sentence, under opening words of the business's own, never the review reworded. Put it over a picture of the same kind of work, or between moments of it, and let it be read: about a second for every thirty characters.",
  fromPhotos:
    "From photos: each photo once, the strongest first under the opening words, two to three seconds each; a pair or a words card between them where photos alone would run flat.",
  wordsOnly:
    "Words only, for a business with nothing filmed yet: three or four words cards and no opening words, one thought on each, facts from this workspace alone (what they do, where, when), never a claim.",
} as const;

/**
 * The most the video maker's guide block may hold. A craft skill's guide is a short form of rules its craft call holds
 * whole (contracts SKILL_GUIDE_MAX); this one is every rule there is, so it runs longer, and only in a turn that makes a
 * video.
 */
export const VIDEO_GUIDE_MAX = 2_400;

export const VIDEO_SKILL = {
  id: "video",
  title: "Video maker",
  when: {
    jobs: [
      "A short upright video or reel, arranged in blocks from the business's own clips and photos, or from words alone (propose_piece).",
    ],
    asked:
      /\b(?:v[ií]deos?|reels?|clips?|tik\s?tok|shorts|footage|before[- ]and[- ]after|antes y despu[eé]s|grabaci[oó]n(?:es)?)\b/i,
  },
  guide: [
    "Ways that have worked, as advice, not forms: pick one, borrow from two, or arrange the blocks afresh for a request that fits none.",
    ...Object.values(RECIPES),
    "Always: the first block is what stops a thumb, every picture is the business's own, and nothing is said that the owner or a client did not say.",
  ],
} as const satisfies Pick<AskSkill<"video">, "id" | "title" | "when" | "guide">;
