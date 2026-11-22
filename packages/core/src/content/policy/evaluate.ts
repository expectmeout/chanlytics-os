/**
 * The seven checks composed (the content loop PRD's 6.1 and 6.2): a moment hands the facts it read, and every check it
 * has facts for is asked, in the PRD's order. The answer is ok, or every refusal at once, so a card or a press says all
 * that stands in the way in one go rather than one refusal per try.
 */
import type { ContentCheck } from "@chanlytics/contracts";
import {
  automationAllows,
  budgetAllows,
  evaluateClaimPolicy,
  mayAct,
  placeAllows,
  reasonStands,
  rightsFor,
  type PlaceAsked,
  type PolicyRefusal,
  type ReasonAsked,
} from "./checks";

/** The facts a moment read, one part a check; a part left out is a check that moment does not ask. */
export interface PolicyFacts {
  authorization?: Parameters<typeof mayAct>[0];
  rights?: Parameters<typeof rightsFor>[0];
  claims?: Parameters<typeof evaluateClaimPolicy>[0];
  publishing?: PlaceAsked;
  money?: Parameters<typeof budgetAllows>[0];
  automation?: Parameters<typeof automationAllows>[0];
  reason?: ReasonAsked;
}

export type PolicyVerdict = { ok: true } | { ok: false; refusals: PolicyRefusal[] };

const CHECKS: Readonly<{ [K in ContentCheck]: (facts: PolicyFacts) => PolicyRefusal | null }> = {
  authorization: (f) => (f.authorization ? mayAct(f.authorization) : null),
  rights: (f) => (f.rights ? rightsFor(f.rights) : null),
  claims: (f) => (f.claims ? evaluateClaimPolicy(f.claims) : null),
  publishing: (f) => (f.publishing ? placeAllows(f.publishing) : null),
  money: (f) => (f.money ? budgetAllows(f.money) : null),
  automation: (f) => (f.automation ? automationAllows(f.automation) : null),
  reason: (f) => (f.reason ? reasonStands(f.reason) : null),
};

const ORDER: readonly ContentCheck[] = [
  "authorization",
  "rights",
  "claims",
  "publishing",
  "money",
  "automation",
  "reason",
];

/** Every check the facts reach, in order: ok, or each refusal. */
export function evaluate(facts: PolicyFacts): PolicyVerdict {
  const refusals = ORDER.flatMap((check) => {
    const refused = CHECKS[check](facts);
    return refused ? [refused] : [];
  });
  return refusals.length === 0 ? { ok: true } : { ok: false, refusals };
}

/** A verdict's refusals as one sentence each, for a card, a press's refusal or a hold. */
export const verdictWords = (verdict: PolicyVerdict): string =>
  verdict.ok ? "" : verdict.refusals.map((r) => r.words).join(" ");
