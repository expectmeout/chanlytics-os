/**
 * Who may be shown, and for what (00665; the content PRD's step L4, its consent half; the Ads plan's 6.8, joins 1 and 2).
 * The one rule every page, AI and New ad ask: a file that shows someone who could be recognized may be used for a post, an
 * ad, a reply or a cold email only once a yes for that use stands. A yes for posts never covers an ad. Ads keeps no copy of
 * this: New ad asks `fileAdRightsOf` and words its answer.
 *
 * A made piece shows who its photo or clips show: each of those answers for itself, and the piece stands as the first of
 * them that is not fine. A yes said on the piece itself answers for it whole, and so does one taken back there.
 */
import { listOrEmpty, recordOrEmpty, textOrEmpty } from "../shared/unknown";
import { FILE_WORDS } from "./files";
import { FILE_YES_USES, type FileYesUse } from "./limits";
import { whoStandsOf, type FileDto } from "./views";

/** What the rule reads of a file: a person's word, what the look counted, and the yeses that stand or were taken back. */
export type FileYesFacts = Pick<FileDto, "who_in_it" | "look_status" | "people" | "yes_for" | "yes_back">;

/**
 * Where a file stands for one use: nobody who could be recognized (`free`); someone, and a yes for this use (`yes`); still
 * being looked at; someone, or nobody has said who, and no yes for this use (`ask`, with how many the look saw); or a yes
 * for this use taken back.
 */
export type FileUseStands =
  { is: "free" } | { is: "yes" } | { is: "looking" } | { is: "ask"; seen: number | null } | { is: "taken_back" };

/** A file read before 00665 says nothing of its yeses: none. */
const yesOf = (file: FileYesFacts) => ({ for: file.yes_for ?? [], back: file.yes_back ?? [] });

/** One file on its own: its own yes first, then who is in it. */
function ownUseOf(use: FileYesUse, file: FileYesFacts): FileUseStands {
  const yes = yesOf(file);
  if (yes.for.includes(use)) return { is: "yes" };
  if (yes.back.includes(use)) return { is: "taken_back" };
  const stands = whoStandsOf(file);
  if (stands.is === "said" || stands.is === "clear") return { is: "free" };
  return stands.is === "looking" ? { is: "looking" } : { is: "ask", seen: stands.seen };
}

/** The order a piece's files answer in: what the owner must mend first. */
const FIRST_NOT_FINE: readonly FileUseStands["is"][] = ["taken_back", "ask", "looking"];

/**
 * Where a file stands for one use. `drawnFrom` is a made piece's photo or clips that are still here (none for anything
 * else, or for a piece whose files are all gone, which is then judged as it is).
 */
export function fileUseOf(use: FileYesUse, file: FileYesFacts, drawnFrom: readonly FileYesFacts[] = []): FileUseStands {
  const own = yesOf(file);
  if (drawnFrom.length === 0 || own.for.includes(use) || own.back.includes(use)) return ownUseOf(use, file);
  const each = drawnFrom.map((from) => ownUseOf(use, from));
  for (const is of FIRST_NOT_FINE) {
    const first = each.find((stands) => stands.is === is);
    if (first) return first;
  }
  return each.some((stands) => stands.is === "yes") ? { is: "yes" } : { is: "free" };
}

/** Whether it may be used: nobody to ask, or a yes that stands. */
export const fileUseMay = (stands: FileUseStands): boolean => stands.is === "free" || stands.is === "yes";

/**
 * Content's answer to "may this run as an ad?" (the Ads plan's 6.8, join 1), on the rights alone: `person` where someone
 * shown has not said yes to ads (or nobody has said who is in it, or the look has not finished), `music` where a video's
 * sound has music or was not heard yet (`music` null: music in an ad needs its licence written first, the PRD's step
 * L8), else null. Meta's own rules on a picture (its shape, its size, a before and after) are the Ads plan's to judge.
 */
export function fileAdRightsOf(
  file: FileYesFacts & Pick<FileDto, "kind">,
  drawnFrom: readonly FileYesFacts[],
  music: boolean | null,
): "person" | "music" | null {
  if (!fileUseMay(fileUseOf("ad", file, drawnFrom))) return "person";
  return file.kind === "video" && music !== false ? "music" : null;
}

/** What taking a yes back answered: the posts held in the same act, and those already up or on their way. */
export interface FileYesTakenBack {
  taken_back: number;
  uses: FileYesUse[];
  /** The file, and every piece drawn from it. */
  files: string[];
  held: FileYesPost[];
  live: FileYesPost[];
  /**
   * For a yes for ads taken back (00676; the Ads plan's G16): every ad made here that shows one of the files, paused, or
   * cancelled while it was set up, each with what came of it so far: `pending` until Meta says, `done` where Meta holds it
   * paused already, `needs_person` where it can only be paused in Meta now.
   */
  ads: FileYesAd[];
}

/** One ad a yes taken back reached: which, what was asked of it, and what came of it so far. */
export interface FileYesAd {
  ad_id: string;
  name: string;
  act: "pause" | "cancel";
  outcome: "done" | "pending" | "blocked" | "not_possible" | "needs_person";
}

/** One post a take-back held or found up: where, as what, its link once it is up, and when. */
export interface FileYesPost {
  post_id: string;
  file_id: string;
  place: string;
  kind: string;
  status: string;
  link: string | null;
  at: string | null;
}

const USE_WORDS: Record<FileYesUse, string> = { post: "posts", ad: "ads", reply: "replies", cold_email: "cold emails" };

/** Words joined as a person lists them: "posts and ads", "Instagram and Google". */
const wordsJoined = (words: readonly string[]): string =>
  words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words.at(-1) ?? ""}` : (words[0] ?? "");

/** Uses in words: "posts and ads". */
const usesSaid = (uses: readonly FileYesUse[]): string => wordsJoined(uses.map((use) => USE_WORDS[use]));

/** The two uses a picture is shown for, in the order the Library says them. */
const SHOWN_FOR: readonly FileYesUse[] = ["post", "ad"];

/**
 * The words a file that shows someone says of its yeses (the Library's line, and AI's view of a file): what stands, then
 * what it needs before it is posted or runs as an ad. Null where nobody is in it, or the look is still at it.
 */
export function fileYesSaidOf(file: FileYesFacts): { stands: string; needs: string | null } | null {
  const stands = SHOWN_FOR.map((use) => ({ use, at: ownUseOf(use, file) }));
  if (stands.every(({ at }) => at.is === "free" || at.is === "looking")) return null;
  const yes = stands.filter(({ at }) => at.is === "yes").map(({ use }) => use);
  const back = stands.filter(({ at }) => at.is === "taken_back").map(({ use }) => use);
  const missing = stands.filter(({ at }) => at.is !== "yes").map(({ use }) => use);
  const ask = stands.find(({ at }) => at.is === "ask")?.at;
  const seen = ask?.is === "ask" ? ask.seen : null;
  const lines = [
    yes.length ? `They said yes to ${usesSaid(yes)}.` : null,
    back.length ? `A yes to ${usesSaid(back)} was taken back.` : null,
  ].filter((line): line is string => line !== null);
  return { stands: lines.join(" ") || FILE_WORDS.whoAsk(seen), needs: missing.length ? neededFor(missing) : null };
}

/** What a picture needs before it is used for what it has no yes for. */
function neededFor(missing: readonly FileYesUse[]): string {
  const post = missing.includes("post");
  const ad = missing.includes("ad");
  const before = post && ad ? "is posted or runs as an ad" : post ? "is posted" : "runs as an ad";
  return `Before it ${before}, they need to say yes to ${usesSaid(missing)}.`;
}

/** The AI line's own words on a file that shows someone: what to tell AI. */
export const FILE_YES_ASK = {
  give: "Tell AI who said yes, and to what",
  takeBack: "Tell AI if someone takes their yes back",
} as const;

/* ----------------------------------------------------------------------------------------------- AI's card -- */

/** The uses something names, in the closed set's order: a card's, a door's answer, a row's column; none for anything else. */
export const fileYesUsesIn = (raw: unknown): FileYesUse[] => {
  const named = listOrEmpty(raw);
  return FILE_YES_USES.filter((use) => named.includes(use));
};

/** Where a post a take-back found stands, by its place, in words. */
const YES_PLACE_WORDS: Record<string, string> = {
  instagram: "Instagram",
  google: "Google",
  hand: "where you put it up",
};

/**
 * The ads a take-back reached (G16), in a sentence: how many Chanlytics paused, and any it could not, which are paused in
 * Meta by hand. Null where it reached none.
 */
function adsTakenBackSaid(ads: readonly unknown[]): string | null {
  const outcomes = ads.map((ad) => textOrEmpty(recordOrEmpty(ad).outcome));
  const paused = outcomes.filter((one) => one === "done" || one === "pending").length;
  const byHand = outcomes.length - paused;
  return (
    [
      paused ? `${paused === 1 ? "1 ad" : `${paused} ads`} that ${paused === 1 ? "shows" : "show"} it paused.` : null,
      byHand
        ? `${byHand === 1 ? "1 ad" : `${byHand} ads`} can only be paused in Meta now: pause ${byHand === 1 ? "it" : "them"} there.`
        : null,
    ]
      .filter((line): line is string => line !== null)
      .join(" ") || null
  );
}

/** What a take-back answered, in a sentence or two: what was held, the ads paused, and where one still stands. */
function takenBackSaid(data: unknown): string {
  const answer = recordOrEmpty(data);
  const held = listOrEmpty(answer.held).length;
  const places = [...new Set(listOrEmpty(answer.live).map((post) => textOrEmpty(recordOrEmpty(post).place)))];
  const live = places.map((place) => YES_PLACE_WORDS[place] ?? place).filter(Boolean);
  return [
    "Taken back.",
    held ? `${held} waiting ${held === 1 ? "post" : "posts"} held.` : null,
    adsTakenBackSaid(listOrEmpty(answer.ads)),
    live.length ? `Still up on ${wordsJoined(live)}: take it down there.` : null,
  ]
    .filter((line): line is string => line !== null)
    .join(" ");
}

/** AI's card's title: who said yes to what, or which uses a yes is taken back for. */
export function fileYesTitleOf(card: { who: string; uses: readonly FileYesUse[]; back: boolean }): string {
  if (card.back) return card.uses.length ? `Take back the yes to ${usesSaid(card.uses)}` : "Take back every yes";
  return `${card.who} said yes to ${usesSaid(card.uses)}`;
}

/**
 * What AI's card for a yes came to, in words, from its door's answer: kept, already kept, or taken back with what was
 * held and where one is still up (content/post-spec.ts fileYesSpec, and the turn that keeps one as it is saved).
 */
export function fileYesReceiptOf(card: { back: boolean; who: string }, data: unknown): string {
  if (card.back) return takenBackSaid(data);
  const answer = recordOrEmpty(data);
  const kept = fileYesUsesIn(answer.kept);
  const person = card.who || "They";
  return kept.length
    ? `Kept: ${person} said yes to ${usesSaid(kept)}.`
    : `Already kept: ${person} said yes to ${usesSaid(fileYesUsesIn(answer.again))}.`;
}
