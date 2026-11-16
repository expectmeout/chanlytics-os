/**
 * How a round's members are read once they are in: which of them the sizing counts as looked at, and which may yet
 * count. The start of a main phase and the end of a run size the next ask from these (main-ask.ts), and an answer's
 * re-judging reads the first (rejudge.ts).
 */

import { LEAD_NO_SITE_KEY, LEAD_UNREACHABLE_KEY, recordOrNull } from "@chanlytics/contracts";
import type { LeadMemberRow } from "../ports";
import { wasJudged } from "./rules";

/** The reason's token for a place with no address to write to, as contracts' classify spells it for one the judge read. */
export const NO_EMAIL_TOKEN = "email:none";

/** The reasons a member is held under, as its judgment keeps them. */
const reasonsOf = (member: LeadMemberRow): unknown[] => {
  const reasons = recordOrNull(member.judgment)?.reasons;
  return Array.isArray(reasons) ? reasons : [];
};

/** A member held with no address to write to: by the judge's read, or by code before it (places.ts noEmailRule). */
const hasNoEmail = (member: LeadMemberRow): boolean =>
  reasonsOf(member).some((reason) => reason === NO_EMAIL_TOKEN || reason === "email:unread");

/**
 * A member the sizing counts as looked at: one the judge answered for, or one code settled for what the search needs and
 * the place lacks (no site to read; no address for a search made for email, or no way to reach it at all). Each was read
 * and paid for, so the yield a later ask is sized from is over all of them: counted over the judged alone, a search
 * that judges only the places with an address would read as four times as rich as it is.
 */
export const wasWeighed = (member: LeadMemberRow): boolean =>
  wasJudged(member) ||
  member.excluded_by === LEAD_NO_SITE_KEY ||
  member.excluded_by === LEAD_UNREACHABLE_KEY ||
  hasNoEmail(member);

/**
 * A member that counts once its address checks out, and by nothing else: held in review only for the check still on its
 * way. What a main phase's later term is asked for is the count less these (main-ask.ts): asked for the whole count
 * again, a second term would pay for places the first term's addresses were about to deliver.
 */
export const mayYetCount = (member: LeadMemberRow): boolean => {
  const reasons = reasonsOf(member);
  return (
    !member.counted &&
    member.class === "review" &&
    reasons.length > 0 &&
    reasons.every((reason) => reason === "email:checking")
  );
};
