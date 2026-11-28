/**
 * A version changes only what it reaches (the content loop PRD's 5.3, 8.1 and 11): what moved between two plans of one
 * piece, said in the record's own set (`piece_revisions.changed`), and which of the piece's shapes must be drawn again
 * for it. Words under the post (the caption) are a version and draw nothing (00681 piece_words_keep, live since pass 1b);
 * anything on the picture (a trim, the order, the words drawn on it, the spoken words burned in) draws every shape the
 * piece's placements send, and nothing else.
 */
import type { RevisionChange } from "../placements/approvals";
import type { RenditionShape } from "../placements/sets";
import type { PieceBlock, PiecePlan } from "../pieces";

/** What a block is, apart from how much of it plays: its kind and the files it shows. */
function blockIdentityOf(block: PieceBlock): string {
  switch (block.is) {
    case "clip":
    case "photo":
      return `${block.is}:${block.file_id}`;
    case "pair":
      return `pair:${block.before.file_id}:${block.after.file_id}`;
    case "words":
      return "words";
    case "quote":
      return `quote:${block.over?.file_id ?? ""}`;
  }
}

/** How much of a block plays, and from where. */
function timingOf(block: PieceBlock): string {
  switch (block.is) {
    case "clip":
      return `${block.from}-${block.to}`;
    case "pair":
      return `${block.before.at ?? ""}/${block.after.at ?? ""}/${block.seconds}`;
    case "quote":
      return `${block.over?.at ?? ""}/${block.seconds}`;
    default:
      return String(block.seconds);
  }
}

/** The words a block draws on its picture. */
function blockWordsSaidOf(block: PieceBlock): string {
  switch (block.is) {
    case "clip":
    case "photo":
      return block.label ?? "";
    case "words":
      return block.lines.join("\n");
    case "quote":
      return `${block.text}\n${block.from ?? ""}`;
    default:
      return "";
  }
}

const sameStrings = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Whether anything drawn over the pictures moved: the opening words, where they sit and stay, the end card's line, a block's words. */
function layoutMoved(before: PiecePlan, after: PiecePlan): boolean {
  return (
    !sameStrings(before.lines, after.lines) ||
    before.words_at !== after.words_at ||
    before.words_hold !== after.words_hold ||
    before.end_line !== after.end_line ||
    before.language !== after.language ||
    before.captions !== after.captions ||
    !sameStrings(blockWordsOf(before), blockWordsOf(after))
  );
}

/** Each block's words with the block they ride on, in one order: a block moved keeps its words, which is no new layout. */
const blockWordsOf = (plan: PiecePlan): string[] =>
  plan.blocks.map((b) => `${blockIdentityOf(b)}\n${blockWordsSaidOf(b)}`).sort((a, b) => a.localeCompare(b));

/**
 * What moved from one version's plan to the next, in the record's order: the words under it, the order or the blocks
 * themselves, how much of each plays, and what is drawn over the pictures. Nothing for two plans that draw the sameStrings.
 */
export function revisionChangesOf(before: PiecePlan, after: PiecePlan): RevisionChange[] {
  const changed: RevisionChange[] = [];
  if (before.caption !== after.caption) changed.push("caption");
  const order = !sameStrings(before.blocks.map(blockIdentityOf), after.blocks.map(blockIdentityOf));
  if (order) changed.push("order");
  else if (!sameStrings(before.blocks.map(timingOf), after.blocks.map(timingOf))) changed.push("trim");
  if (layoutMoved(before, after)) changed.push("layout");
  return changed;
}

/** Every word a plan says, in one order: under it, its language, its end line, its opening lines, each block's own. */
const wordsSaidOf = (plan: PiecePlan): string[] => [
  plan.caption ?? "",
  plan.language,
  plan.end_line ?? "",
  ...plan.lines,
  ...plan.blocks
    .map(blockWordsSaidOf)
    .filter((words) => words !== "")
    .sort((first, second) => first.localeCompare(second)),
];

/**
 * Whether a new version says something other than the one before it: the words under the post, the words drawn on it
 * (its opening lines, its end line, a block's own words) or their language. Where the same words sit and how long
 * they stay, which clips play, in what order and for how long, and its sound are its look: they say nothing new. What
 * a send reads where a new version is late or could not be made (the outside review of 28 Nov 2026, R3.8): an owner
 * who asked for other words no longer wants the old ones up.
 */
export function versionSaysOther(before: PiecePlan, after: PiecePlan): boolean {
  return !sameStrings(wordsSaidOf(before), wordsSaidOf(after));
}

/** What a change draws: the words under it draw nothing; anything else draws each shape its placements send. */
const DRAWS: Readonly<Record<RevisionChange, boolean>> = {
  caption: false,
  trim: true,
  order: true,
  sound: true,
  layout: true,
  first: true,
};

/** The shapes a version must draw again: each of `sent` (the shapes its placements send) where any change reaches the picture. */
export function shapesReachedOf(changed: readonly RevisionChange[], sent: readonly RenditionShape[]): RenditionShape[] {
  return changed.some((c) => DRAWS[c]) ? [...new Set(sent)] : [];
}
