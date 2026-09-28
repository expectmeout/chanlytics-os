/**
 * The class a place gets (§0.1, 26; decision 0010): the engine's own two keys (the kind criterion every plan
 * carries, and the one a place with no way to reach it is left out under), a lead's phone as the count reads it,
 * and the rule that turns the judge's answers (lead-judge.ts) into Qualified, Needs review or Excluded.
 */
import { phoneDialable } from "../../shared/phone";
import type { JudgePlaceAnswer, PlaceFacts } from "../lead-judge";
import type { LeadEmailState, LeadFit, LeadMemberClass } from "./sets";
import type { LeadSearchPlan } from "./plan";

/**
 * The engine's own first criterion, on every plan: the place is the kind of
 * business the search names (PRD §7 step 4, "the right kind of business or
 * not"). It is not one the owner writes and not one the plan stores -- the
 * rubric asks it, the class rule reads it, the validator expects it, all by
 * this key -- because the first real searches showed what happens without
 * it: a photographer prospecting wedding planners was handed two other
 * photographers, a band and a caterer as Qualified, since the only criterion
 * on the plan was "could recommend a photographer", and all of them could.
 * A likely standard, because its evidence IS the name and category, which a
 * seen standard is not allowed to rest on.
 */
export const LEAD_KIND_KEY = "kind";
/** What the Excluded chip says for a place that was the wrong kind: "Not a wedding planner". */
export const leadKindWord = (name: string): string => `Not one of the ${name}`;

/**
 * A place with no phone and no email is not a lead. It used to reach Needs
 * review as "phone:none" or "email:none" -- work dressed as a lead, and the
 * largest share of the review pile on the first five real searches. It is
 * left out under this key, and the chip says why (leads.ts leadExclusionWord).
 */
export const LEAD_UNREACHABLE_KEY = "unreachable";

/**
 * A lead's phone, as the count reads it (decision 0010): `ok` when it dials (contracts phoneDialable), `invalid` when a
 * number is there and does not, `none` when there is none.
 */
export type LeadPhoneState = "ok" | "invalid" | "none";
export function leadPhoneState(phone: string | null | undefined): LeadPhoneState {
  if (!phone) return "none";
  return phoneDialable(phone) ? "ok" : "invalid";
}

/* ------------------------------------------------- the class (§0.1, 26) -- */

export interface LeadClassification {
  class: LeadMemberClass;
  /** The criterion or exclusion whose required fail excluded the place; null otherwise. */
  excluded_by: string | null;
  /** For ordering only, never for counting. Null when excluded. */
  fit: LeadFit | null;
  /** Why it is not simply Qualified: `fail:<key>`, `unknown:<key>`, `inferred:<key>`, `out_of_area`, `email:<state>`, `phone:none`. */
  reasons: string[];
}

/** The reason tokens of a contact standard not met, so SQL and the check can find "the email was the only reason". */
export const LEAD_EMAIL_REASON = /^email:/;

/**
 * Code decides the class from the judge's per-criterion answers (§0.1, 26).
 * Exclusions are checked before criteria, so a place that is both a chain and
 * without a website is tallied as the chain. Only a REQUIRED criterion (or an
 * exclusion: every exclusion is required) gates the class: a required fail
 * excludes, with that key as the reason; a required criterion answered
 * `unknown`, or a required seen criterion only read (no fact cited beyond the
 * name or category, which are descriptions, not evidence), sends the place to
 * review. An optional criterion never excludes and never sends a place to
 * review by itself — it only softens the fit band. A place with no location
 * or one outside the area, or one with no verified way to reach it, also sends it to review. Everything else
 * qualifies. A fit band is derived for ordering.
 *
 * ONE VERIFIED WAY TO REACH THEM IS ENOUGH (decision 0010; Ruben, 25 September 2026: "as long as a number or email
 * is verified then it may count"). A phone that dials (`phoneState` ok) or a mailbox that checked out (`emailState`
 * ok). The plan's `contact` is the owner's preference -- which is shown first -- and never a gate: a B2B search that
 * finds a good number, or a local one that finds a checked email, has found a lead. Without either, the email is the
 * one way left when there is one, and its token (`email:<state>`) is what lead_check_commit promotes on a check.
 */
export function classify(
  plan: LeadSearchPlan,
  answer: JudgePlaceAnswer,
  facts: PlaceFacts,
  emailState: LeadEmailState,
  inArea: boolean,
  phoneState: LeadPhoneState,
): LeadClassification {
  // Nothing to call and nothing to write to: not a lead, whatever the judge said. A null phone match is the
  // place having no phone at all (the phone:none reason below reads it the same way).
  if (facts.phone_matches_site === null && facts.emails.length === 0)
    return { class: "excluded", excluded_by: LEAD_UNREACHABLE_KEY, fit: null, reasons: [LEAD_UNREACHABLE_KEY] };
  const reasons: string[] = [];
  const rubric = [
    { key: LEAD_KIND_KEY, standard: "likely" as const, required: true },
    ...plan.exclusions.map((e) => ({ key: e.key, standard: "likely" as const, required: true })),
    ...plan.criteria.map((c) => ({ key: c.key, standard: c.standard, required: c.required })),
  ];
  let excludedBy: string | null = null;
  let softFail = false;
  let unknown = false;
  for (const r of rubric) {
    const a = answer.criteria.find((x) => x.key === r.key);
    const verdict = a?.answer ?? "unknown";
    const readOnly = a?.facts.filter((f) => f !== "name" && f !== "category").length === 0;
    if (verdict === "fail") {
      if (r.required) {
        excludedBy = excludedBy ?? r.key;
        reasons.push(`fail:${r.key}`);
      } else {
        softFail = true;
      }
    } else if (verdict === "unknown") {
      if (r.required) {
        unknown = true;
        reasons.push(`unknown:${r.key}`);
      } else {
        softFail = true;
      }
    } else if (r.standard === "seen" && readOnly) {
      if (r.required) {
        unknown = true;
        reasons.push(`inferred:${r.key}`);
      } else {
        softFail = true;
      }
    }
  }
  if (excludedBy) return { class: "excluded", excluded_by: excludedBy, fit: null, reasons };
  if (!inArea) reasons.push("out_of_area");
  if (phoneState !== "ok" && emailState !== "ok") {
    if (emailState !== "none") reasons.push(`email:${emailState}`);
    else reasons.push(`phone:${phoneState}`);
  }
  const fit: LeadFit = softFail ? "long" : unknown ? "look" : "strong";
  return { class: reasons.length ? "review" : "qualified", excluded_by: null, fit, reasons };
}
