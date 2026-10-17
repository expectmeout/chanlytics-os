import { phoneDialable } from "../../shared/phone.js";
export const LEAD_KIND_KEY = "kind";
export const leadKindWord = (name) => `Not one of the ${name}`;
export const LEAD_UNREACHABLE_KEY = "unreachable";
export function leadPhoneState(phone) {
  if (!phone) return "none";
  return phoneDialable(phone) ? "ok" : "invalid";
}
export function classify(plan, answer, facts, emailState, inArea, phoneState) {
  if (facts.phone_matches_site === null && facts.emails.length === 0)
    return { class: "excluded", excluded_by: LEAD_UNREACHABLE_KEY, fit: null, reasons: [LEAD_UNREACHABLE_KEY] };
  const reasons = [];
  const rubric = [
    { key: LEAD_KIND_KEY, standard: "likely", required: true },
    ...plan.exclusions.map((e) => ({ key: e.key, standard: "likely", required: true })),
    ...plan.criteria.map((c) => ({ key: c.key, standard: c.standard, required: c.required }))
  ];
  let excludedBy = null;
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
  const fit = softFail ? "long" : unknown ? "look" : "strong";
  return { class: reasons.length ? "review" : "qualified", excluded_by: null, fit, reasons };
}
