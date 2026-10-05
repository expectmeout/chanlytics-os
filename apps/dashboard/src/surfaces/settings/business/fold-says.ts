// Chanlytics — Settings › Business: what a save will tell the receptionist, and which lines of a block are new.
//
// Split from folds.ts, which adds willSay and changedLines to the tab's saver (saver.ts). Pure but for willSay's cache,
// and no JSX.

import { BUSINESS_TAB, type ConsequenceVM, type FoldSection } from "@/legacy-bridge/business-tab";
import { settingsNow } from "./shell";

/** The blocks of one brain, resolved: each block as the brain a save goes on writes it, by channel and block. */
interface SaidOn {
  brain: unknown;
  prompt: unknown;
  blocks: Record<string, ConsequenceVM | null>;
}

// Each block as the brain a save goes on writes it, by channel and block: resolved once for that brain rather than on
// every keystroke, since each asks the bridge to parse a whole brain and resolve a full prompt. The saver hands back the
// same base while nothing moves, so the brain's identity is the key, AND the settings read's preview's: consequenceOf
// resolves with the preview's inputs (the zone, the Autonomy rows), so a zone saved and read back under the same config
// object would have kept the old zone's block for the base, and the new heading read as a change of the next save. A
// new base or a new preview forgets them all. One cache for the page: each row once kept its own, and twelve folds
// would have kept twelve more.
let btSaidOn: SaidOn = { brain: null, prompt: null, blocks: {} };
const btPreview = () => {
  const read = settingsNow();
  return (read && read.prompt) || null;
};
const btBlockLines = (b: { text?: unknown } | null | undefined) =>
  b && typeof b.text === "string" ? b.text.split("\n").filter((l) => l.trim() !== "") : [];

/**
 * The sections whose block's lines are RUNS rather than facts (the bridge's FOLD_BLOCK names each section's block).
 * The composer collapses the week into runs of days that share their hours ("Monday–Thursday: 09:30–18:00"), so a
 * change to one day re-cuts the runs, and the lines that fall out of the old block are about days nobody changed:
 * changing Friday's close said "It will no longer be told: Monday–Thursday: 09:30–18:00". For such a section nothing
 * comes or goes line by line while the block stays: the whole new block is drawn, and the lines go only when the whole
 * block goes. A closure's line is one fact, so every other section says each line that comes and goes. A property of
 * the section, here, in one table, never an `if (fold === "hours")` in the page.
 */
export const BT_RUN_BLOCKS = ["hours"];

/** What the blocks of a save say, gathered block by block. */
interface Said {
  added: string[];
  removed: string[];
  whole: string[];
  caveats: string[];
  chars: number;
  total: number | null;
}

/** What one block is said on: the brain the save goes on, the brain it leaves, the channel, and the profile crossing if any. */
interface SayOn {
  was: unknown;
  next: unknown;
  channel: "whatsapp" | "voice";
  crossing: unknown;
}

// One block's part of what a save says: the lines it adds and takes away, whole, and its note, onto `said`.
const btSayBlock = (said: Said, block: FoldSection, on: SayOn) => {
  const { was, next, channel, crossing } = on;
  const key = `${channel}:${block}`;
  const stored = btSaidOn.blocks;
  if (!(key in stored)) stored[key] = BUSINESS_TAB.consequenceOf(block, was, channel);
  const before = btBlockLines(stored[key]);
  const after = BUSINESS_TAB.consequenceOf(block, next, channel);
  if (!after) {
    if (!crossing) said.removed.push(...before);
    return;
  }
  const now = btBlockLines(after);
  said.whole.push(after.text);
  if (typeof after.note === "string" && after.note && !said.caveats.includes(after.note)) said.caveats.push(after.note);
  said.chars += after.chars;
  said.total = after.total;
  // A run block that stays says nothing line by line; one that appears whole is every line new, as one that goes
  // whole is every line gone.
  if (BT_RUN_BLOCKS.includes(block) && before.length) return;
  said.added.push(...now.filter((l) => !before.includes(l)));
  said.removed.push(...before.filter((l) => !now.includes(l)));
};

/** What a save would tell the receptionist, and the words around it. */
interface WillSay {
  note: string | null;
  added: string | null;
  removed: string | null;
  whole: string | null;
  caveat: string | null;
  chars: number | null;
  total: number | null;
}

/** What willSay is asked: the brain the save goes on, the brain as it would leave it, the sections, the channel. */
interface WillSayAsk {
  was: unknown;
  next: unknown;
  sections: FoldSection | FoldSection[];
  channel: "whatsapp" | "voice" | null;
}

/**
 * What a save would tell the receptionist, for a row or a fold alike: willSay({ was, next, sections, channel }).
 *
 * `was` is the brain the save goes on and `next` that brain as the save would leave it. Both are the saver's: `was` is
 * its base() (the settings read until a save is out, or taken and not read back yet) and `next` is that base with the
 * row's patch applied as the saver applies it (patched) or the fold's draft written as its save writes it (saveFold),
 * each on a copy. Read off the settings read instead, as the rows' first were, they described a save that was not the
 * one sent whenever another went first. `sections` names the block or blocks the save can change, by the names
 * consequenceOf knows (the bridge's FOLD_BLOCK), and `channel` the one its words are read on; a null channel is no
 * channel that reads them on this workspace, and nothing is resolved.
 *
 * It answers { note, added, removed, whole, caveat, chars, total }, each a string or null but the two numbers, all in
 * the composer's own words or prompt-blocks.ts', resolved as the edge resolves them (the bridge's consequenceOf);
 * nothing here writes a word of them:
 *   added    the lines the save adds or rewrites, which a row draws under "It will say";
 *   removed  the lines it takes away, under "It will no longer say": a line rewritten is one of each, and a save that
 *            drops one thing and adds another says both, where showing only what it adds hid what goes. A block the
 *            save takes away whole (the last open day closed, the last closure removed) goes line by line. A block
 *            whose lines are runs (RUN_BLOCKS) says nothing comes or goes while it stays: its lines are not facts;
 *   whole    every line of its blocks as the save would leave them, which a fold draws under "Your receptionist will
 *            be told" for as long as it is open, changed or not;
 *   caveat   those blocks' own notes (PromptBlockVM.note), where whose lines they are needs saying beside them: the
 *            rules' block carries the Autonomy tab's rules and the lines Chanlytics writes, and the hand-off's is sent
 *            whether or not there are reasons. A fold draws them with `whole`; null with none;
 *   chars    those blocks' share of the prompt in characters (PromptBlockVM.chars), or null with no block: what a list
 *            too long to quote whole says in place of its lines (the services sheet's foot);
 *   total    the length of the whole prompt `next` would give the receptionist on `channel`, which `chars` is a share
 *            of: the prompt after the save, as the block is, never the one before it; null with no block;
 *   note     the sentence for a save that crosses the resolver's own line between composing a prompt and answering
 *            with the stored one (hasProfile, decided in the bridge's profileCrossing): emptying the last field it
 *            composes from drops the hand-off and every rule line, far beyond the save's own lines, and the first such
 *            field does the reverse. Not a refusal; the save still goes. Where the record stops composing, no block is
 *            left to show a line of, and the sentence says all of it: listing one block's lines would say too little.
 *
 * Null when nothing true can be said: a `next` the save's own schema refuses (the field's own error speaks; and a
 * block that is null for THAT reason must not read as one the save takes away). Call it only for a draft the page's
 * own checks pass, and only while the row or fold is open.
 */
export const btWillSay = ({ was, next, sections, channel }: WillSayAsk): WillSay | null => {
  if (!was || !next) return null;
  if (BUSINESS_TAB.saveIssues({ brain: next }).length) return null;
  const crossing = BUSINESS_TAB.profileCrossing(was, next);
  const said: Said = { added: [], removed: [], whole: [], caveats: [], chars: 0, total: null };
  if (channel) {
    if (btSaidOn.brain !== was || btSaidOn.prompt !== btPreview())
      btSaidOn = { brain: was, prompt: btPreview(), blocks: {} };
    for (const block of ([] as FoldSection[]).concat(sections))
      btSayBlock(said, block, { was, next, channel, crossing });
  }
  return {
    note: crossing ? crossing.sentence : null,
    added: said.added.length ? said.added.join("\n") : null,
    removed: said.removed.length ? said.removed.join("\n") : null,
    whole: said.whole.length ? said.whole.join("\n\n") : null,
    caveat: said.caveats.length ? said.caveats.join(" ") : null,
    chars: said.whole.length ? said.chars : null,
    total: said.whole.length && typeof said.total === "number" ? said.total : null,
  };
};

/**
 * Which lines of `now` are new since `was`: the indexes, in `now.split("\n")`, of the lines `was` did not have, each
 * line of `was` answering for one line of `now` with the same words (so a line said twice where it was said once is one
 * new line). Blank lines are never new. Nothing is new where there was nothing before, or where nothing moved: a block
 * that appears is arriving, not changing. What a row or a fold marks as the line its draft just changed (spec §9, item
 * 3: only the changed clause washes), from the block it drew last and the one it draws now; pure.
 */
export const btChangedLines = (was: unknown, now: unknown) => {
  if (typeof was !== "string" || typeof now !== "string" || was === now) return [];
  const left = new Map<string, number>();
  for (const l of was.split("\n")) left.set(l, (left.get(l) || 0) + 1);
  const out: number[] = [];
  now.split("\n").forEach((l, i) => {
    const n = left.get(l) || 0;
    if (n > 0) left.set(l, n - 1);
    else if (l.trim() !== "") out.push(i);
  });
  return out;
};
