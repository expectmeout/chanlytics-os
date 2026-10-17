import { starterByName, starterText } from "./starter-lookup.js";
import { PARAM_SOURCES } from "./templates.js";
export function guessSlotKind(label, example) {
  const l = String(label ?? "").toLowerCase();
  const e = String(example ?? "").toLowerCase();
  if (/proposal|propuesta|quote/.test(l)) return "proposal_link";
  if (/\breviews?\b|reseña/.test(l) || /writereview|g\.page\/r\//.test(e)) return "review_link";
  if (/link|url|book/.test(l) || /^https?:\/\//.test(e) || /booksy|calendly|square|fresha|\.com\//.test(e))
    return "booking_link";
  if (/business|salon|company|shop|studio|clinic|brand|negocio/.test(l)) return "business_name";
  if (/first name|^name$|nombre|customer|client/.test(l)) return "first_name";
  return "text";
}
export function defaultSlotKinds(t) {
  const vars = Array.isArray(t.variables) ? t.variables : [];
  const s = starterByName(t.name);
  if (s) {
    const kinds = starterText(s, "en_US").slots.map((x) => x.kind);
    return vars.length === kinds.length || vars.length === 0 ? kinds : vars.map((_, i) => kinds[i] ?? "text");
  }
  return vars.map(
    (v) => guessSlotKind(typeof v?.label === "string" ? v.label : null, typeof v?.example === "string" ? v.example : null)
  );
}
export function defaultParamSpecs(t) {
  return defaultSlotKinds(t).map((k) => k === "text" ? { kind: "text", value: "" } : { kind: k });
}
export function slotChoices(kind, o) {
  const may = (k) => k === "booking_link" ? o.bookingLink : k === "review_link" ? o.reviewLink : k === "visit_when" || k === "visit_service" ? o.visits : k === "proposal_link" ? o.proposal : true;
  if (!o.known) return [kind, ...PARAM_SOURCES.filter((k) => k !== kind)].filter(may);
  switch (kind) {
    case "first_name":
      return ["first_name"];
    case "business_name":
      return ["business_name", "text"];
    case "booking_link":
      return o.bookingLink ? ["booking_link", "text"] : ["text"];
    case "review_link":
      return o.reviewLink ? ["review_link", "text"] : ["text"];
    case "visit_when":
    case "visit_service":
      return o.visits ? [kind] : [];
    // A proposal's link is each proposal's, and there is one only on the follow-up (0006).
    case "proposal_link":
      return o.proposal ? [kind] : [];
    default:
      return ["text"];
  }
}
export function templateSlots(t, o) {
  const known = starterByName(t.name) !== null;
  const each = defaultSlotKinds(t).map(
    (k) => slotChoices(k, {
      known,
      visits: o.visits,
      bookingLink: o.bookingLink,
      reviewLink: o.reviewLink,
      proposal: o.proposal
    })
  );
  if (!each.every((c) => c.length > 0)) return null;
  return o.proposal && !each.some((c) => c.includes("proposal_link")) ? null : each;
}
export function slotLabels(t) {
  const vars = Array.isArray(t.variables) ? t.variables : [];
  const s = starterByName(t.name);
  if (s) {
    const labels = starterText(s, t.language ?? "en_US").slots.map((x) => x.label);
    if (vars.length === 0 || vars.length === labels.length) return labels;
  }
  return vars.map((v, i) => {
    const label = typeof v?.label === "string" ? v.label.trim() : "";
    const n = typeof v?.position === "number" ? v.position : i + 1;
    return label && !/^Value \d+$/.test(label) ? label : `Value ${n}`;
  });
}
