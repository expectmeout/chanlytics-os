/**
 * The one claims rule for what a business says in public (the content loop PRD's 6.1, "Claim evidence"): every price, share
 * off, number, money offer or promise in words AI wrote is one the owner said, in the conversation at hand or as a claim
 * that stands today (owner_claims: an offer, a price, a guarantee, a fact they stated). A post's picture words, its
 * caption and a planned week's words are all held to it, at the card, the press and the send; the dashboard's model-facing
 * sentence (server/files/post-check.ts) and the plan's slots read the same answer. The owner's own typed words are theirs
 * and are never refused by it (pass 1b's rule: a check is a help, never a new way to be blocked).
 *
 * Moved here from the dashboard's post-check.ts so the edge's plan job and the send ask the very same rule.
 */
import { claimsStanding, namesMoney, priceBreach, priceFigures, type OwnerClaim } from "@chanlytics/contracts";

/** What a claim problem is, and the words it was found in. */
export interface ClaimProblem {
  is: "price" | "number" | "money" | "promise";
  phrase: string;
}

/**
 * The promises a business makes on purpose, in both languages AI writes posts in. They read fine and cost money, so each
 * needs the owner's own word: a picture stays up long after a conversation is over.
 */
const PROMISES: readonly RegExp[] = [
  /\b(?:free|gratis|gratuit[oa]s?)\b/i,
  /\bguarantee[sd]?\b|\bgarant[ií]\w*/i,
  /\bwarrant(?:y|ies)\b/i,
  /\b(?:lifetime|permanent(?:e|es|ly)?|painless|risk[- ]free|sin dolor)\b/i,
  /\b(?:best|#\s?1|number one|n[uú]mero uno|mejor(?:es)?)\b/i,
  /\b(?:award|winning|premiad[oa]s?)\b/i,
  /\b(?:certified|licensed|board[- ]certified|certificad[oa]s?|licenciad[oa]s?)\b/i,
  /\b(?:cure[sd]?|heals?|clinically|cura(?:r|mos)?)\b/i,
  /\b(?:today only|last chance|limited|hurry|s[oó]lo hoy|[uú]ltima oportunidad|limitad[oa]s?)\b/i,
];

const numbersIn = (text: string): string[] => text.match(/\d+(?:[.,]\d+)?/g) ?? [];

/**
 * What some words claim that `said` does not hold, or null: a price or a share off, a number, money offered, a promise.
 * `said` is everything the owner said that the words may lean on (their questions here, their Settings, the claims that
 * stand). Pure: whoever wrote the words, the answer is the same; whether it refuses is the caller's (evaluateClaimPolicy).
 */
export function claimProblemOf(words: string, ownerSaid: string): ClaimProblem | null {
  const text = words.trim();
  if (priceBreach(text, new Set(priceFigures(ownerSaid))))
    return {
      is: "price",
      phrase: priceFigures(text).find((figure) => !priceFigures(ownerSaid).includes(figure)) ?? text,
    };
  const saidNumbers = new Set(numbersIn(ownerSaid));
  const stray = numbersIn(text).find((n) => !saidNumbers.has(n));
  if (stray) return { is: "number", phrase: stray };
  if (namesMoney(text) && !namesMoney(ownerSaid)) return { is: "money", phrase: text.slice(0, 60) };
  const promise = PROMISES.find((p) => p.test(text) && !p.test(ownerSaid));
  if (promise) return { is: "promise", phrase: promise.exec(text)?.[0] ?? text };
  return null;
}

/** What the owner said, as the rule reads it: their own words here, and every claim that stands today. */
export const saidWithClaims = (
  ownWords: string,
  claims: readonly Pick<OwnerClaim, "text" | "valid_until" | "withdrawn_at">[],
  today: string,
): string => [ownWords, ...claimsStanding(claims, today).map((claim) => claim.text)].filter(Boolean).join("\n");
