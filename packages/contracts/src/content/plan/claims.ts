/**
 * What an owner claims (the content loop PRD's 5.3 `owner_claims` and 6.1): a price, an offer, a guarantee, or a fact
 * they state themselves ("Thursday still has openings"), where it was said, and until when it stands. The one claims
 * rule (core content/policy evaluateClaimPolicy) reads the claims that stand today as what the owner said, beside what
 * they said in the conversation at hand. A stated fact is quoted from the owner's own words, never written by AI.
 */
import { isObjectRecord, nonBlankOrNull } from "../../shared/unknown";
import { isDayKey } from "../../shared/zone/day-keys";
import { CLAIM_KINDS, CLAIM_SOURCES, type ClaimKind, type ClaimSource } from "./sets";

/** One claim as the database keeps it, and a page and AI read it. */
export interface OwnerClaim {
  id: string;
  kind: ClaimKind;
  text: string;
  source: ClaimSource;
  /** The last day it stands, in the business's zone; null for one that stands until withdrawn. */
  valid_until: string | null;
  withdrawn_at: string | null;
  created_at: string;
}

/** The longest a claim's words may be: a sentence an owner says, never a page. */
export const CLAIM_TEXT_MAX = 280;

/** Whether a claim stands on a day: not withdrawn, and its last day not passed. */
const claimStands = (claim: Pick<OwnerClaim, "valid_until" | "withdrawn_at">, today: string): boolean =>
  claim.withdrawn_at === null && (claim.valid_until === null || claim.valid_until >= today);

/** The claims that stand on a day. */
export const claimsStanding = <T extends Pick<OwnerClaim, "valid_until" | "withdrawn_at">>(
  claims: readonly T[],
  today: string,
): T[] => claims.filter((claim) => claimStands(claim, today));

const isClaimKind = (value: unknown): value is ClaimKind => CLAIM_KINDS.some((kind) => kind === value);
const isClaimSource = (value: unknown): value is ClaimSource => CLAIM_SOURCES.some((source) => source === value);

/** A claim row as the database answers it, read back; null for one that is not the shape. */
export function ownerClaimOf(value: unknown): OwnerClaim | null {
  if (!isObjectRecord(value)) return null;
  const id = nonBlankOrNull(value.id);
  const text = nonBlankOrNull(value.text);
  const until = nonBlankOrNull(value.valid_until);
  const created = nonBlankOrNull(value.created_at);
  if (!id || !text || !created || !isClaimKind(value.kind) || !isClaimSource(value.source)) return null;
  return {
    id,
    kind: value.kind,
    text,
    source: value.source,
    valid_until: until && isDayKey(until) ? until : null,
    withdrawn_at: nonBlankOrNull(value.withdrawn_at),
    created_at: created,
  };
}

/** The facts an owner stated that stand today, as the reason check reads them (PRD 6.1): what they say, until when. */
export const statedFactsOf = (claims: readonly OwnerClaim[], today: string): { says: string; until: string }[] =>
  claimsStanding(
    claims.filter((claim) => claim.kind === "fact"),
    today,
  ).map((claim) => ({ says: claim.text, until: claim.valid_until ?? "9999-12-31" }));

/** The offers that stand today, each its words and last day: what the plan and the reason check read as an offer. */
export const offersOf = (
  claims: readonly OwnerClaim[],
  today: string,
): { id: string; says: string; until: string | null }[] =>
  claimsStanding(
    claims.filter((claim) => claim.kind === "offer"),
    today,
  ).map((claim) => ({ id: claim.id, says: claim.text, until: claim.valid_until }));
