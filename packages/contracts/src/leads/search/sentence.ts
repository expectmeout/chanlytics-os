/**
 * The plan in words (§8.3): who is sought and where, the sentence the plan card draws as pickers, and the one a
 * receipt, an Ask card and a log say. Derived here once, from the plan (plan.ts) alone; `lowerFirst` is the
 * question's too (question.ts).
 */
import { type LeadArea, type LeadSearchPlan, US_STATES } from "./plan";

const isLowerLetter = (ch: string) => ch !== undefined && ch === ch.toLowerCase() && ch !== ch.toUpperCase();
/** Lowercases the first letter only when the second is itself lowercase, so an acronym ("CVS") keeps its own case. */
export const lowerFirst = (s: string) => (s && isLowerLetter(s[1]) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const list = (xs: string[]) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** A place clause the model may have written into the plural it was asked for ("hair salons in Brooklyn"). */
const PLACE_CLAUSE = /\s+(?:in|near|around|within|across|throughout|at|inside|serving)\s+\S.*$/i;
/** A label that already says where it is ("in Brooklyn, NY", "within 25 miles of Austin"). */
const SAYS_WHERE = /^(?:in|near|around|within|across|throughout|at|inside)\s+/i;
const US_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATES).map(([name, code]) => [code, name]),
);
const bits = (s: string): string[] => s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];

/** A clause after the plural that a criterion of the plan already says ("with a rating of 4.2 or lower"). */
const QUALITY_CLAUSE = /\s+(?:with|that|who|which|having|rated)\s+\S.*$/i;
/**
 * A place clause that names a place: a place word, then a capitalised word or a ZIP ("in Queens", "near 10005"). Not
 * "serving", "at" or "inside", whose names are often what is sought ("restaurants serving Mexican food").
 */
const NAMES_A_PLACE = /^\s+(?:in|near|around|within|across|throughout)\s+(?:[A-Z]|\d{5})/i;

/**
 * The plural the sentence calls them, with the area taken out of it (§8.3).
 * `name` is the model's own words, and a model asked for a plural writes the
 * place into it ("Hair salons in Brooklyn"), which the sentence then says
 * twice. A trailing place clause is dropped where its words are the area's, or
 * where it names a place at all: a round further out keeps the first ask's name
 * ("in Queens, NY") while its area is another ("near 10005"), and the sentence
 * said both (Ruben, 10 Oct 2026). A clause about something else ("pharmacies
 * inside supermarkets") is kept. A clause a criterion of the plan says again
 * ("with a rating of 4.2 or lower") comes off too, since the criterion is its
 * own word in the sentence. With nothing left, the terms say who is sought,
 * since those are the words the source is actually searched with.
 */
export function planWho(plan: LeadSearchPlan): string {
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

/**
 * Where the sentence says to look, with exactly one preposition -- code's, not
 * the model's. A label that already says where it is ("in Brooklyn, NY",
 * "within 25 miles of Austin") is said as it stands; anything else gets "in".
 */
export function planWhere(area: LeadArea): string {
  const label = area.label.trim();
  return SAYS_WHERE.test(label) ? label : `in ${label}`;
}

/**
 * The area as a bare noun, for a sentence that supplies its own preposition
 * ("There are 3 personal trainers in Austin, TX"): the label with a leading
 * place word and a radius phrase taken off, so nothing says "in" twice.
 */
export function planArea(area: LeadArea): string {
  const bare = area.label
    .trim()
    .replace(/^within\s+[\d.]+\s*\w+\s+of\s+/i, "")
    .replace(/^(?:in|at|inside|near|around|throughout|across)\s+/i, "")
    .trim();
  return bare || area.label.trim();
}

/** One part of the plan's sentence: plain words, or a word the plan card makes a picker of. */
export interface LeadPlanWord {
  text: string;
  /** Which picker this word opens on the card; null for the words between the pickers. */
  pick: "count" | "who" | "where" | "criterion" | "contact" | null;
  /** The criterion this word is, for a criterion picker. */
  key?: string;
}

/**
 * The plan as the words of one sentence, each marked with the picker it opens
 * (§7 step 2, §8.3): "Find 200 personal trainers in Austin, TX with a website,
 * then find their email and check it." The count, the plural, the area, each
 * criterion and the contact standard are the plan's own; nothing here reads
 * anything else. The sentence is derived once, here: the plan card draws these
 * words as buttons and `planSentence` joins them, so a card and a receipt can
 * never say the plan differently.
 */
export function planWords(plan: LeadSearchPlan): LeadPlanWord[] {
  const out: LeadPlanWord[] = [
    { text: "Find ", pick: null },
    { text: String(plan.count), pick: "count" },
    { text: " ", pick: null },
    { text: planWho(plan), pick: "who" },
    { text: " ", pick: null },
    { text: planWhere(plan.area), pick: "where" },
  ];
  // The criteria are a list after the place, each its own clause, so a sentence of three reads as three (Ruben, 10 Oct
  // 2026: joined by spaces they ran together, "in Austin, TX independent, not a chain has a website").
  plan.criteria.forEach((c, i) => {
    out.push({ text: i === 0 ? ": " : "; ", pick: null });
    out.push({
      text: c.standard === "seen" ? `${lowerFirst(c.text)} (confirmed)` : lowerFirst(c.text),
      pick: "criterion",
      key: c.key,
    });
  });
  out.push({ text: plan.criteria.length ? "; " : ", ", pick: null });
  out.push({
    text: plan.contact === "email" ? "reached by a checked email or a phone" : "reached by phone or a checked email",
    pick: "contact",
  });
  out.push({ text: ".", pick: null });
  return out;
}

/** What the sentence's words say, with nothing marked: the sentence itself. */
export function planSaid(plan: LeadSearchPlan): string {
  return planWords(plan)
    .map((w) => w.text)
    .join("");
}

/** What the plan leaves out, as one clause: " Leaving out: chain gyms." Empty when it leaves out nothing. */
export function planLeavingOut(plan: LeadSearchPlan): string {
  const out = plan.exclusions.map((e) => lowerFirst(e.text));
  return out.length ? ` Leaving out: ${list(out)}.` : "";
}

/**
 * The plan as one sentence, for a receipt, an Ask card's summary and a log:
 * the sentence the card draws, and what it leaves out. Every caller reads the
 * same words (§8.3).
 */
export function planSentence(plan: LeadSearchPlan): string {
  return `${planSaid(plan)}${planLeavingOut(plan)}`;
}
