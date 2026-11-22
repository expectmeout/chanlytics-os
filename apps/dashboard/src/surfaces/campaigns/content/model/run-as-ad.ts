/**
 * "Run as an ad" on a made piece (the Ads plan's 6.8, join 3, with G13 and G15; the content PRD's 2.4): what the open
 * piece says under its acts, from the piece's own record (GET files/[id] `ad`), which Content's picture rule answers
 * (server content/ad-pictures.ts readPieceAd). Content's page holds the press; what it opens is Ads' own address
 * (contracts ads/address.ts), and nothing of Ads is read here.
 *
 *  - It may run: one quiet press, "Run as an ad", which opens New ad drafted around it.
 *  - It may not: why, in one line, with its one act, the way through and never the rule left with the owner. A press is
 *    never offered as if it could.
 *  - No ad account is connected (never, or Meta signed it out): that, with its act, Open Ads, as New ad's one thing
 *    missing says it.
 *
 * Nothing at all where the record says nothing (Ads is not on here, a video not ready, anything AI did not make), on a
 * piece set aside, whose next step is to put it back, and for whoever may not draft an ad.
 *
 * Pure: the record's answer in, the line out. The words are this page's alone.
 */
import { CONTENT_SHEET_WORDS, CONTENT_WORDS, type FileDto } from "@chanlytics/contracts";
import type { PieceAdStands } from "@/server/content/ad-pictures";

/** What the line's one act does: AI is told who said yes; a picture post is made from a video; AI is asked; Ads opens. */
export type RunAsAdDoes = "yes" | "post" | "ask" | "ads";

/** The line under a made piece's acts: the press, or why not with its one act. */
export type RunAsAdLine =
  | { is: "press"; words: string }
  | { is: "why"; why: Exclude<PieceAdStands, { is: "may" }>; said: string; act: { words: string; does: RunAsAdDoes } };

/** Why a piece may not run as an ad, by the picture rule's reason (contracts ads/draft.ts adPictureIssue). */
type AdIssue = Extract<PieceAdStands, { is: "wont" }>["why"];

const RUN_AS_AD_WORDS = {
  press: "Run as an ad",
  noAccount: "No ad account is connected",
  openAds: "Open Ads",
  tellYes: "Tell AI who said yes",
  why: {
    person: "Someone in it hasn't said yes to ads",
    music: "It has music, which an ad can't carry yet",
    unheard: "It isn't heard yet, and an ad needs a video with no music",
    before_after: "It sets a before beside an after, which Meta turns down in ads",
    small: "It's too small for an ad",
    shape: "Its shape doesn't fit an ad in the feed",
    length: "It runs too long or too short for an ad",
  } satisfies Record<AdIssue, string>,
} as const;

/**
 * The one act beside why: a yes is told to AI; what a video's sound (music, or not heard yet), shape or length stops, a
 * picture post from its best moment does not; anything else of a picture is AI's to make again, asked about the piece.
 */
function runAsAdActOf(issue: AdIssue, kind: FileDto["kind"]): { words: string; does: RunAsAdDoes } {
  if (issue === "person") return { words: RUN_AS_AD_WORDS.tellYes, does: "yes" };
  if (kind === "video" && ["music", "unheard", "shape", "length"].includes(issue))
    return { words: CONTENT_SHEET_WORDS.video.picture, does: "post" };
  return { words: CONTENT_WORDS.piece.ask, does: "ask" };
}

/**
 * The line a made piece says of running as an ad; null where it says nothing. `may` is whether this member may draft
 * an ad (New ad's route is an operator's and above).
 */
export function runAsAdOf(
  stands: PieceAdStands | null | undefined,
  file: Pick<FileDto, "kind" | "status">,
  may: boolean,
): RunAsAdLine | null {
  if (!stands || !may || file.status === "set_aside") return null;
  if (stands.is === "may") return { is: "press", words: RUN_AS_AD_WORDS.press };
  if (stands.is === "no_account")
    return {
      is: "why",
      why: stands,
      said: RUN_AS_AD_WORDS.noAccount,
      act: { words: RUN_AS_AD_WORDS.openAds, does: "ads" },
    };
  return {
    is: "why",
    why: stands,
    said: RUN_AS_AD_WORDS.why[stands.why],
    act: runAsAdActOf(stands.why, file.kind),
  };
}
