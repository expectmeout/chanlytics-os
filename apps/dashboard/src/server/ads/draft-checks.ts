/**
 * What stops a new ad before Turn on (the Ads plan's 5.1): each of Meta's likely refusals, and Chanlytics' own rule on
 * prices, as a rule in code with tests. They run when a draft is picked, after every change of the owner's or of AI's,
 * and again at the press. The model writes and rewrites words; it never decides whether one of these passed.
 *
 * Pure: a draft as it stands and what is true of the business now, in; the things that stop it, out, in the order a
 * draft says them. A draft says one at a time, the first, with its one act:
 *
 *   the ad account   the card's own checks (the account's standing, a payment method, the Page, its WhatsApp number)
 *   the picture      gone from Files, a person shown, music, a before and after, too small, the wrong shape or length
 *   the words        about the reader, about how someone looks, a sure result, hurry, and anything else of the writer's
 *   a price          any price while AI never quotes one, or one Services does not say
 *   the amount       under Meta's least for the run, over the most the owner said, or not a whole amount
 *   the end          a run of less than a whole day
 *   the area         outside the miles Meta takes
 *
 * Two of the plan's rows have no rule here, by what they are. An ad of one of Meta's special kinds is a question the
 * draft asks its owner (adKindsOf, the plan's G7), never a check a rewrite clears. And what Meta lets a new account
 * spend in a day can be read from no page: Meta's own dry run is that check, at the press.
 */
import {
  AD_MILES,
  AD_RUN_DAYS,
  adAmountIssue,
  adEndIssue,
  adPictureIssue,
  adSpecialKinds,
  daysBetween,
  type AdBrief,
  type AdCardCheckId,
  type AdPicture,
  type AdSpecialKind,
  type AdVersion,
} from "@chanlytics/contracts";
import { adWordIssues } from "../ask/skills/ad/brief";
import type { AdIssueCode } from "../ask/skills/ad/checks";
import type { AdCheckDto, AdDraftState, AdWordsFault } from "./draft-shape";

/** What a draft is judged against: the business as it stands now. */
interface AdCheckFacts {
  /** Today in the ad account's zone. */
  today: string;
  account: {
    currency: string;
    minDailyMinor: number;
    /** The card's five checks; one not known yet is null, and stops nothing. */
    checks: readonly { id: AdCardCheckId; ok: boolean | null }[];
  };
  /** The most the owner said an ad may cost; null until they do. */
  ownerMostMinor: number | null;
  /** The draft's picture as the picture rule reads it; null where it is no longer among what Files holds. */
  picture: AdPicture | null;
  /** The brief the draft's words answer to, built from the draft as it stands. */
  brief: AdBrief;
}

/** The words' faults a draft names by Meta's rule; every other is the writer's to mend, said as one. */
const WORDS_FAULT: Partial<Record<AdIssueCode, AdWordsFault>> = {
  about_reader: "about_reader",
  feel_bad: "feel_bad",
  sure_result: "sure_result",
  before_after: "before_after",
  pressure: "pressure",
};
/** The price faults: any price while AI never quotes one, and a price Services does not say. */
const PRICE_FAULT: Partial<Record<AdIssueCode, "never" | "differs">> = { price_off: "never", new_price: "differs" };

/**
 * What a price in the words also trips, being a figure or a money word the brief does not hold: said once, as the
 * price it is, so the one act offered is "Take the price out" and never a second line about the same words.
 */
const PRICE_COMPANIONS: readonly AdIssueCode[] = ["new_number", "new_money"];

/** What stops the words, and what stops a price in them: at most one line each. */
function wordChecks(versions: readonly AdVersion[], adBrief: AdBrief): AdCheckDto[] {
  if (versions.length === 0) return [];
  const codes = adWordIssues(versions, adBrief).map((issue) => issue.code);
  const priced = codes.flatMap((code) => PRICE_FAULT[code] ?? [])[0];
  const worded = codes
    .filter((code) => PRICE_FAULT[code] === undefined && !(priced && PRICE_COMPANIONS.includes(code)))
    .map((code) => WORDS_FAULT[code] ?? "other")[0];
  return [
    ...(worded ? [{ code: "words" as const, fault: worded }] : []),
    ...(priced ? [{ code: "price" as const, fault: priced }] : []),
  ];
}

/** Everything that stops a draft before Turn on, in the order a draft says it. Empty where nothing does. */
export function adDraftChecks(
  draft: Pick<AdDraftState, "miles" | "total_minor" | "end_day" | "versions">,
  facts: AdCheckFacts,
): AdCheckDto[] {
  const out: AdCheckDto[] = facts.account.checks
    .filter((check) => check.ok === false)
    .map((check) => ({ code: "account", check: check.id }));
  const pictureFault = facts.picture === null ? "gone" : adPictureIssue(facts.picture);
  if (pictureFault !== null) out.push({ code: "picture", fault: pictureFault });
  out.push(...wordChecks(draft.versions, facts.brief));
  const days = Math.max(AD_RUN_DAYS.least, daysBetween(facts.today, draft.end_day));
  const amount = adAmountIssue({
    totalMinor: draft.total_minor,
    days,
    account: facts.account,
    ownerMostMinor: facts.ownerMostMinor,
  });
  if (amount) out.push({ code: "amount", fault: amount.code, nearest_minor: amount.nearestMinor });
  const end = adEndIssue(facts.today, draft.end_day);
  if (end) out.push({ code: "end", nearest_day: end.nearestDay });
  if (!(draft.miles >= AD_MILES.least && draft.miles <= AD_MILES.most))
    out.push({ code: "area", nearest_miles: Math.min(AD_MILES.most, Math.max(AD_MILES.least, draft.miles)) });
  return out;
}

/**
 * The special kinds of ad a draft reads as (contracts adSpecialKinds: a floor, never Meta's own answer), from the
 * service it offers, what its owner stands behind and the words written for it; none for most. The draft asks the
 * owner about the first they have not answered, and a yes is not run here (the plan's G7).
 */
export function adKindsOf(adBrief: AdBrief, versions: readonly AdVersion[]): AdSpecialKind[] {
  const read = [
    adBrief.service.name,
    ...adBrief.facts,
    ...versions.flatMap((version) => [version.headline, version.text]),
  ].join("\n");
  return adSpecialKinds(read);
}

/** What the draft asks, and what the press would tell Meta, from the kinds it reads as and the owner's answers. */
export function adDeclared(
  kinds: readonly AdSpecialKind[],
  answers: AdDraftState["answers"],
): { question: AdSpecialKind | null; declared: "none" | "waiting" | AdSpecialKind } {
  const yes = kinds.find((kind) => answers[kind] === "yes");
  if (yes) return { question: null, declared: yes };
  const open = kinds.find((kind) => answers[kind] === undefined);
  return open ? { question: open, declared: "waiting" } : { question: null, declared: "none" };
}
