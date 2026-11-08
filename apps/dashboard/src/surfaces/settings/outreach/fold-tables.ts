// Chanlytics — Settings › How it reaches out's folds (decision 0113): what each opens with, writes and refuses, by the
// fold's id, each one key of the config's reach_out section. The business tab's folds (business/folds.ts) spread these
// into their tables, so the page's rows save through the tab's one saver as every row of the business does. Pure, and
// no JSX.

import {
  REACH_OUT_LIMITS,
  REACH_OUT_REFUSAL_WORDS,
  reachOutSignatureProblem,
  textOrEmpty,
} from "@chanlytics/contracts";
import { btPut, type DraftOf, type Problems } from "../business/fold-shapes";
import { trimmed, type Config } from "../business/save";

// The section on the tab's config (business/save.tsx Config), declared beside the folds that write it.
declare module "../business/save" {
  interface Config {
    reach_out?: { [key: string]: unknown; proof?: string[] };
  }
}

/**
 * How it reaches out's folds (decision 0113), each one key of the config's `reach_out` section, by the fold's id: the
 * page's rows are folds of the one record, saved through the tab's one saver as every row of the business is.
 */
const REACH_OUT_FOLD_KEYS = {
  offer: "offer",
  who_for: "who_for",
  fixes: "fixes",
  proof: "proof",
  cold_tone: "tone",
  signed_by: "signed_by",
  signature: "signature",
  sign_phone: "phone",
  reply_offer: "reply_offer",
} as const;
export type ReachOutFoldName = keyof typeof REACH_OUT_FOLD_KEYS;
const isReachOutFold = (fold: string): fold is ReachOutFoldName => Object.hasOwn(REACH_OUT_FOLD_KEYS, fold);

const listOf = (value: unknown): string[] => (Array.isArray(value) ? value.map(textOrEmpty) : []);
const reachOutKey = (config: Config, fold: ReachOutFoldName): unknown => config.reach_out?.[REACH_OUT_FOLD_KEYS[fold]];
const textFold = (fold: ReachOutFoldName) => (_profile: unknown, _brain: unknown, config: Config) =>
  textOrEmpty(reachOutKey(config, fold));

/**
 * What each opens with: what the section holds, never a fallback. A row at rest says what a writer reads where nothing
 * is set (contracts reachOutOfferOf and its kin); a fold that opened on the fallback would save it as the owner's own words.
 */
const DRAFT_OF: {
  [F in ReachOutFoldName]: (profile: unknown, brain: unknown, config: Config) => DraftOf[F];
} = {
  offer: textFold("offer"),
  who_for: textFold("who_for"),
  fixes: textFold("fixes"),
  proof: (_profile, _brain, config) => listOf(reachOutKey(config, "proof")),
  cold_tone: textFold("cold_tone"),
  signed_by: textFold("signed_by"),
  signature: textFold("signature"),
  sign_phone: textFold("sign_phone"),
  reply_offer: textFold("reply_offer"),
};

/** A key of the section, written with a value and removed without one; the section goes once nothing is in it. */
const btPutReachOut = (next: Config, fold: ReachOutFoldName, value: unknown) => {
  const section: Record<string, unknown> = { ...(next.reach_out || {}) };
  btPut(section, REACH_OUT_FOLD_KEYS[fold], value);
  if (Object.keys(section).length) next.reach_out = section;
  else delete next.reach_out;
};
const writeText = (fold: ReachOutFoldName) => (next: Config, draft: unknown) =>
  btPutReachOut(next, fold, trimmed(draft) || undefined);

/** How each writes its draft into the section: trimmed, and an emptied box removes its key. */
const WRITE: { [F in ReachOutFoldName]: (next: Config, draft: unknown) => void } = {
  offer: writeText("offer"),
  who_for: writeText("who_for"),
  fixes: writeText("fixes"),
  // A claim left empty is no claim: dropped, as a note nobody filled in is.
  proof: (next, draft) => {
    const claims = listOf(draft)
      .map((c) => trimmed(c))
      .filter(Boolean);
    btPutReachOut(next, "proof", claims.length ? claims : undefined);
  },
  cold_tone: writeText("cold_tone"),
  signed_by: writeText("signed_by"),
  signature: writeText("signature"),
  sign_phone: writeText("sign_phone"),
  // The booking link is what an answer offered before the page: it is stored as nothing.
  reply_offer: (next, draft) => {
    const offer = trimmed(draft);
    btPutReachOut(next, "reply_offer", offer && offer !== "booking_link" ? offer : undefined);
  },
};

const longer = (field: string, draft: unknown, max: number): Problems =>
  trimmed(draft).length > max ? { [field]: REACH_OUT_REFUSAL_WORDS.tooLong(max) } : {};

/** What stops each one's save, by the field it is under (a claim's row is `claim-<n>`). */
const PROBLEMS_OF: { [F in ReachOutFoldName]?: (draft: unknown) => Problems } = {
  offer: (draft) => longer("offer", draft, REACH_OUT_LIMITS.offer),
  who_for: (draft) => longer("who_for", draft, REACH_OUT_LIMITS.whoFor),
  fixes: (draft) => longer("fixes", draft, REACH_OUT_LIMITS.fixes),
  cold_tone: (draft) => longer("cold_tone", draft, REACH_OUT_LIMITS.tone),
  signed_by: (draft) => longer("signed_by", draft, REACH_OUT_LIMITS.signedBy),
  sign_phone: (draft) => longer("sign_phone", draft, REACH_OUT_LIMITS.phone),
  signature: (draft) => {
    const problem = reachOutSignatureProblem(trimmed(draft));
    if (problem === "too_long") return longer("signature", draft, REACH_OUT_LIMITS.signature);
    return problem ? { signature: REACH_OUT_REFUSAL_WORDS.signature } : {};
  },
  proof: (draft) => {
    const rows = listOf(draft);
    const found: Problems =
      rows.filter((c) => trimmed(c)).length > REACH_OUT_LIMITS.claims ? { proof: REACH_OUT_REFUSAL_WORDS.claims } : {};
    rows.forEach((c, i) => Object.assign(found, longer(`claim-${i}`, c, REACH_OUT_LIMITS.claim)));
    return found;
  },
};

/** The field a refusal of the section is said under: a claim's by its row, else the fold's own. */
const fieldOf = (fold: ReachOutFoldName, path: (string | number)[]): string =>
  fold === "proof" && typeof path[2] === "number" ? `claim-${path[2]}` : fold;

/** The section's folds, as business/folds.ts reads them: which they are, and each one's draft, write, refusals and field. */
export const REACH_OUT_FOLDS = {
  is: isReachOutFold,
  draftOf: DRAFT_OF,
  write: WRITE,
  problemsOf: PROBLEMS_OF,
  fieldOf,
};
