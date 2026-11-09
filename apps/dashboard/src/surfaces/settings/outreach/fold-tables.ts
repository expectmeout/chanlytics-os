// Chanlytics — Settings › Cold email's folds (decision 0113): what each opens with, writes and refuses, by the fold's id,
// written to the config's reach_out section. The business tab's folds (business/folds.ts) spread these
// into their tables, so the page's rows save through the tab's one saver as every row of the business does. Pure, and
// no JSX.

import { textOrEmpty, valueAt, writeReachOutKey, type ReachOutConfig } from "@chanlytics/contracts";
import type { DraftOf, EndingDraft, FoldName } from "../business/fold-shapes";
import { trimmed, type Config } from "../business/save";

// The section on the tab's config (business/save.tsx Config), declared beside the folds that write it.
declare module "../business/save" {
  interface Config {
    reach_out?: ReachOutConfig;
  }
}

/**
 * Cold email's folds of one key of the config's `reach_out` section, by the fold's id: the page's rows are folds of the
 * one record, saved through the tab's one saver as every row of the business is.
 */
const REACH_OUT_FOLD_KEYS = {
  offer: "offer",
  who_for: "who_for",
  fixes: "fixes",
  proof: "proof",
  sound: "tone",
  reply_offer: "reply_offer",
} as const satisfies Partial<Record<FoldName, keyof ReachOutConfig>>;
type ReachOutKeyFold = keyof typeof REACH_OUT_FOLD_KEYS;
type ReachOutFoldName = ReachOutKeyFold | "ending";

/** How an email ends is one row and one sheet (the Cold email canvas's Changes), so one fold writes these three. */
const ENDING_KEYS = ["signed_by", "signature", "phone"] as const satisfies readonly (keyof EndingDraft &
  keyof ReachOutConfig)[];

const isReachOutFold = (fold: string): fold is ReachOutFoldName =>
  fold === "ending" || Object.hasOwn(REACH_OUT_FOLD_KEYS, fold);

const listOf = (value: unknown): string[] => (Array.isArray(value) ? value.map(textOrEmpty) : []);
const reachOutKey = (config: Config, fold: ReachOutKeyFold): unknown => config.reach_out?.[REACH_OUT_FOLD_KEYS[fold]];
const textFold = (fold: ReachOutKeyFold) => (_profile: unknown, _brain: unknown, config: Config) =>
  textOrEmpty(reachOutKey(config, fold));

/**
 * What each holds: what the section holds, never a fallback. A row at rest says what a writer reads where nothing is
 * set (contracts reachOutOfferOf and its kin), and its box opens on those words (BtFold's `opensOn`, box.tsx), which a save
 * stores only once they are changed: the save is judged against this, so an unchanged box is no change.
 */
const DRAFT_OF: {
  [F in ReachOutFoldName]: (profile: unknown, brain: unknown, config: Config) => DraftOf[F];
} = {
  offer: textFold("offer"),
  who_for: textFold("who_for"),
  fixes: textFold("fixes"),
  proof: (_profile, _brain, config) => listOf(reachOutKey(config, "proof")),
  sound: textFold("sound"),
  ending: (_profile, _brain, config) => ({
    signed_by: textOrEmpty(config.reach_out?.signed_by),
    signature: textOrEmpty(config.reach_out?.signature),
    phone: textOrEmpty(config.reach_out?.phone),
  }),
  reply_offer: textFold("reply_offer"),
};

/** How each writes its draft into the section: through the one writer of a key of it, which Ask's cards write through too. */
const writeFold = (fold: ReachOutKeyFold) => (next: Config, draft: unknown) =>
  writeReachOutKey(next, REACH_OUT_FOLD_KEYS[fold], Array.isArray(draft) ? listOf(draft) : textOrEmpty(draft));
const WRITE: { [F in ReachOutFoldName]: (next: Config, draft: unknown) => void } = {
  offer: writeFold("offer"),
  who_for: writeFold("who_for"),
  fixes: writeFold("fixes"),
  proof: writeFold("proof"),
  sound: writeFold("sound"),
  ending: (next, draft) => {
    for (const key of ENDING_KEYS) writeReachOutKey(next, key, textOrEmpty(valueAt(draft, key)));
  },
  reply_offer: writeFold("reply_offer"),
};

/**
 * The field a refusal of the save's own rules (contracts reach-out-schema.ts, the only rules the section has) is said
 * under: a claim's by the row it was typed in, since a row left empty is not written; an ending's by its box; else the
 * fold's own.
 */
const fieldOf = (fold: ReachOutFoldName, path: (string | number)[], draft: unknown): string => {
  if (fold === "ending") return String(path[1]);
  if (fold !== "proof" || typeof path[2] !== "number") return fold;
  const written = listOf(draft).flatMap((claim, row) => (trimmed(claim) ? [row] : []));
  return `claim-${written.at(path[2]) ?? path[2]}`;
};

/** The section's folds, as business/folds.ts reads them: which they are, and each one's draft, write and field. */
export const REACH_OUT_FOLDS = {
  is: isReachOutFold,
  draftOf: DRAFT_OF,
  write: WRITE,
  fieldOf,
};
