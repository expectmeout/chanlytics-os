/**
 * A template's slots: what each most likely takes, the specs a run or a broadcast sends with, what may fill each
 * on a moment, and what each is called. A starter's slots are known (starter-templates.ts); any other is a guess.
 */
import { starterByName, starterText } from "./starter-lookup";
import type { StarterSlotKind } from "./starter-templates";
import { PARAM_SOURCES, type ParamSourceKind, type ParamSpec } from "./templates";

/**
 * What a slot most likely takes, from the label Meta or a person gave it and
 * the example beside it. Only a guess for templates written elsewhere; a
 * starter's slots are known.
 */
export function guessSlotKind(label: string | null | undefined, example?: string | null): StarterSlotKind {
  const l = String(label ?? "").toLowerCase();
  const e = String(example ?? "").toLowerCase();
  if (/proposal|propuesta|quote/.test(l)) return "proposal_link";
  if (/link|url|book/.test(l) || /^https?:\/\//.test(e) || /booksy|calendly|square|fresha|\.com\//.test(e))
    return "booking_link";
  if (/business|salon|company|shop|studio|clinic|brand|negocio/.test(l)) return "business_name"; // trade-word: a label naming the business, in whatever word a trade uses
  if (/first name|^name$|nombre|customer|client/.test(l)) return "first_name";
  return "text";
}

export interface VariableLike {
  position?: unknown;
  label?: unknown;
  example?: unknown;
}

/** The source of each slot for a template row: the starter's own, or a guess per variable. */
export function defaultSlotKinds(t: { name: string; variables: unknown }): StarterSlotKind[] {
  const vars = Array.isArray(t.variables) ? (t.variables as VariableLike[]) : [];
  const s = starterByName(t.name);
  if (s) {
    const kinds = starterText(s, "en_US").slots.map((x) => x.kind);
    return vars.length === kinds.length || vars.length === 0 ? kinds : vars.map((_, i) => kinds[i] ?? "text");
  }
  return vars.map((v) =>
    guessSlotKind(typeof v?.label === "string" ? v.label : null, typeof v?.example === "string" ? v.example : null),
  );
}

/** The specs a run or a broadcast would send with, from the default kinds — typed text stays empty for the person to fill. */
export function defaultParamSpecs(t: { name: string; variables: unknown }): ParamSpec[] {
  return defaultSlotKinds(t).map((k) => (k === "text" ? { kind: "text", value: "" } : { kind: k }));
}

/**
 * What may fill a slot, what it is filled with by default first -- the
 * question the composers' free choice of all six sources never asked, so a
 * first-name slot could be set to the booking link and a run greeted everyone
 * "Hi your booking link".
 *
 * A slot whose kind is KNOWN (a starter's own) takes only what keeps its
 * message true. A first name is each person's own: typed, it would greet
 * everyone by one name. A visit's time or service is each visit's, and there
 * is a visit only on a visit moment -- anywhere else nothing fills it, and
 * the list is empty. The business name and the booking link are the ones on
 * file, or words typed once for everyone; a booking link with none on file
 * can only be typed. Typed words are typed.
 *
 * A slot whose kind is only GUESSED, on a template written elsewhere, may be
 * any of them, the guess first: the guess is ours, the template is theirs.
 */
export function slotChoices(
  kind: StarterSlotKind,
  o: { known: boolean; visits: boolean; bookingLink: boolean; proposal: boolean },
): ParamSourceKind[] {
  const may = (k: ParamSourceKind) =>
    k === "booking_link"
      ? o.bookingLink
      : k === "visit_when" || k === "visit_service"
        ? o.visits
        : k === "proposal_link"
          ? o.proposal
          : true;
  if (!o.known) return [kind, ...PARAM_SOURCES.filter((k) => k !== kind)].filter(may);
  switch (kind) {
    case "first_name":
      return ["first_name"];
    case "business_name":
      return ["business_name", "text"];
    case "booking_link":
      return o.bookingLink ? ["booking_link", "text"] : ["text"];
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

/**
 * What each slot of a template may take on a moment (slotChoices), or null
 * when one of them can take nothing there: the visit reminder, whose time and
 * service no list has, is not a message a win-back can send. Nor is a message
 * with no slot for the proposal's link one the follow-up can send (0006).
 */
export function templateSlots(
  t: { name: string; variables: unknown },
  o: { visits: boolean; bookingLink: boolean; proposal: boolean },
): ParamSourceKind[][] | null {
  const known = starterByName(t.name) !== null;
  const each = defaultSlotKinds(t).map((k) =>
    slotChoices(k, { known, visits: o.visits, bookingLink: o.bookingLink, proposal: o.proposal }),
  );
  if (!each.every((c) => c.length > 0)) return null;
  return o.proposal && !each.some((c) => c.includes("proposal_link")) ? null : each;
}

export function slotLabels(t: { name: string; language?: string | null; variables: unknown }): string[] {
  const vars = Array.isArray(t.variables) ? (t.variables as VariableLike[]) : [];
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
