import { US_STATES } from "./plan.js";
const isLowerLetter = (ch) => ch !== void 0 && ch === ch.toLowerCase() && ch !== ch.toUpperCase();
export const lowerFirst = (s) => s && isLowerLetter(s[1]) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
const list = (xs) => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
const PLACE_CLAUSE = /\s+(?:in|near|around|within|across|throughout|at|inside|serving)\s+\S.*$/i;
const SAYS_WHERE = /^(?:in|near|around|within|across|throughout|at|inside)\s+/i;
const US_NAMES = Object.fromEntries(
  Object.entries(US_STATES).map(([name, code]) => [code, name])
);
const bits = (s) => s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
const QUALITY_CLAUSE = /\s+(?:with|that|who|which|having|rated)\s+\S.*$/i;
const NAMES_A_PLACE = /^\s+(?:in|near|around|within|across|throughout)\s+(?:[A-Z]|\d{5})/i;
export function planWho(plan) {
  const a = plan.area;
  const known = new Set(bits(`${a.label} ${a.query} ${a.zip ?? ""} ${a.state} ${US_NAMES[a.state] ?? ""}`));
  const whole = SAYS_WHERE.test(plan.name) && bits(plan.name).some((w) => known.has(w));
  let cut = whole ? "" : plan.name.trim();
  const m = PLACE_CLAUSE.exec(cut);
  if (m && (bits(m[0]).some((w) => known.has(w)) || NAMES_A_PLACE.test(m[0]))) cut = cut.slice(0, m.index).trim();
  const said = new Set(plan.criteria.flatMap((c) => bits(c.text)));
  const q = QUALITY_CLAUSE.exec(cut);
  if (q && bits(q[0]).filter((w) => said.has(w)).length >= 2) cut = cut.slice(0, q.index).trim();
  return lowerFirst(cut) || list(plan.terms.map(lowerFirst));
}
export function planWhere(area) {
  const label = area.label.trim();
  return SAYS_WHERE.test(label) ? label : `in ${label}`;
}
export function planArea(area) {
  const bare = area.label.trim().replace(/^within\s+[\d.]+\s*\w+\s+of\s+/i, "").replace(/^(?:in|at|inside|near|around|throughout|across)\s+/i, "").trim();
  return bare || area.label.trim();
}
export function planWords(plan) {
  const out = [
    { text: "Find ", pick: null },
    { text: String(plan.count), pick: "count" },
    { text: " ", pick: null },
    { text: planWho(plan), pick: "who" },
    { text: " ", pick: null },
    { text: planWhere(plan.area), pick: "where" }
  ];
  plan.criteria.forEach((c, i) => {
    out.push({ text: i === 0 ? ": " : "; ", pick: null });
    out.push({
      text: c.standard === "seen" ? `${lowerFirst(c.text)} (confirmed)` : lowerFirst(c.text),
      pick: "criterion",
      key: c.key
    });
  });
  out.push({ text: plan.criteria.length ? "; " : ", ", pick: null });
  out.push({
    text: plan.contact === "email" ? "reached by a checked email or a phone" : "reached by phone or a checked email",
    pick: "contact"
  });
  out.push({ text: ".", pick: null });
  return out;
}
export function planSaid(plan) {
  return planWords(plan).map((w) => w.text).join("");
}
export function planLeavingOut(plan) {
  const out = plan.exclusions.map((e) => lowerFirst(e.text));
  return out.length ? ` Leaving out: ${list(out)}.` : "";
}
export function planSentence(plan) {
  return `${planSaid(plan)}${planLeavingOut(plan)}`;
}
