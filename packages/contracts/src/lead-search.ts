/**
 * The lead finder: the plan, the sets, the caps, and every rule with a right
 * answer (PRD 2026-09-17 v3 §0, §7.2, §10, §12, §13.3; release A1).
 *
 * Pure. The dashboard's routes, the edge's jobs and, later, the page read this
 * file. The model proposes a plan in these shapes and judges places criterion
 * by criterion (lead-judge.ts); everything decidable is decided here, by code:
 * what a junk address is, which class a place gets from the judge's answers
 * (§0.1), how many places a round asks for (S6), when the search stops to ask
 * (P4), which of the nine endings a round gets (S7), what a round is likely
 * to cost. No word here names the vendor that runs the searches: the owner
 * sees Claude finding businesses, and where each fact came from.
 */
import { isFreeMail } from "./free-mail";
import { z } from "zod";
import { normalizeEmail } from "./email-address";
import { phoneDialable, normalizePhone } from "./phone";
import { dayInZone } from "./availability";
import type { JudgePlaceAnswer, PlaceFacts } from "./lead-judge";
import { BOOKING_PLATFORM_HOSTS, onDomain } from "./booking-page";

/* ------------------------------------------------------ the stored sets -- */
// Each mirrors a CHECK in 00140 and is held to it in schema-sets.ts.

export const LEAD_SEARCH_VIAS = ["people", "ask"] as const;
export type LeadSearchVia = (typeof LEAD_SEARCH_VIAS)[number];
export const LEAD_ROUND_PURPOSES = ["probe", "main", "topup", "renew"] as const;
export type LeadRoundPurpose = (typeof LEAD_ROUND_PURPOSES)[number];
export const LEAD_ROUND_STATES = ["queued", "probing", "waiting_on_owner", "running", "checking", "ended"] as const;
export type LeadRoundState = (typeof LEAD_ROUND_STATES)[number];
/** The nine endings, one closed set (§0.5, S7). */
export const LEAD_ROUND_ENDINGS = [
  "target_reached",
  "searched_everything",
  "month_leads_used",
  "budget_used",
  "few_new_matches",
  "stopped",
  "source_failed",
  "question_unanswered",
  "paused",
] as const;
export type LeadRoundEnding = (typeof LEAD_ROUND_ENDINGS)[number];
export const LEAD_ROUND_ANSWERS = ["keep", "include", "stop"] as const;
export type LeadRoundAnswer = (typeof LEAD_ROUND_ANSWERS)[number];
export const LEAD_RUN_PURPOSES = ["discover", "check"] as const;
export const LEAD_RUN_STATES = [
  "claimed",
  "starting",
  "running",
  "succeeded",
  "failed",
  "aborted",
  "timed_out",
  "unknown",
] as const;
export type LeadRunState = (typeof LEAD_RUN_STATES)[number];
/** The five words of §10.4, plus `checking` while a batch is out. */
export const LEAD_EMAIL_STATES = ["none", "checking", "ok", "catch_all", "unknown", "invalid"] as const;
export type LeadEmailState = (typeof LEAD_EMAIL_STATES)[number];
export const LEAD_STAGES = ["ready", "nurture", "converted", "archived"] as const;
export const LEAD_CLOSED_REASONS = ["said_no", "not_a_fit", "customer", "stale", "search_removed"] as const;
export const LEAD_MEMBER_CLASSES = ["qualified", "review", "excluded"] as const;
export type LeadMemberClass = (typeof LEAD_MEMBER_CLASSES)[number];
export const LEAD_FITS = ["strong", "look", "long"] as const;
export type LeadFit = (typeof LEAD_FITS)[number];
export const LEAD_COUNTER_KINDS = ["allowance", "budget", "day"] as const;
/** A's six, and release B's two: a lead's stage, and many at once. */
export const LEAD_OPERATION_KINDS = [
  "undo_search",
  "keep",
  "exclude",
  "put_back",
  "include",
  "stop",
  "stage",
  "bulk",
] as const;
export const LEAD_PREFERENCE_KINDS = ["chain", "wrong_kind", "too_far"] as const;
export const LEAD_SUPPRESSION_KINDS = ["email", "place", "phone"] as const;
export const LEAD_SUPPRESSION_WHATS = ["email_opt_out", "customer", "erased"] as const;

/* -------------------------------------------------- the caps (§13.3, §16) -- */

/** §16.7, 18: Qualified leads a month, by the workspace's calendar month. */
export const LEAD_MONTHLY_ALLOWANCE = 500;
/** §16.32: what searching may cost a workspace a month: scraping, judging, checks, retries. */
export const LEAD_MONTHLY_BUDGET_USD = 25;
export const LEAD_DAY_CAP_USD = 10;
export const LEAD_PLATFORM_DAY_CAP_USD = 50;
/** §16.5: under this share of Qualified among the first places, the round stops and asks. */
export const LEAD_QUESTION_THRESHOLD = 0.6;
/** Below this many judged places the question is not asked: too little to go on. */
export const LEAD_QUESTION_MIN_EVIDENCE = 10;
export const LEAD_PROBE_PLACES = 25;
export const LEAD_JUDGE_BATCH = 25;
export const LEAD_MAX_PLACES = 1000;
/** Every fact a place gives the judge is cut to this many characters (§7.1). */
export const LEAD_FACT_MAX = 120;
/** The judge's one reason, in words (§0.1). */
export const LEAD_REASON_MAX_WORDS = 12;

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
/** The yield assumed before a probe has measured one: half the places asked for qualify. The card's minutes and the route's estimate both read it. */
export const LEAD_ASSUMED_YIELD = 0.5;
/** A round's estimate is reserved with this much room (§13.3: the cap is the estimate with room). */
export const LEAD_ESTIMATE_MARGIN = 1.3;
/** The main round asks for the remainder over the probe's yield, clamped here (S6). */
export const LEAD_ASK_MIN_FACTOR = 1.2;
export const LEAD_ASK_MAX_FACTOR = 4;
/** An unanswered question ends the round after this long (§0.5). */
export const LEAD_QUESTION_WAIT_MS = 24 * 3_600_000;

/* ------------------------------------------------------------ the plan -- */

export type LeadContactStandard = "phone" | "email";

/**
 * A lead's phone, as the count reads it (decision 0010): `ok` when it dials (contracts phoneDialable), `invalid` when a
 * number is there and does not, `none` when there is none.
 */
export type LeadPhoneState = "ok" | "invalid" | "none";
export function leadPhoneState(phone: string | null | undefined): LeadPhoneState {
  if (!phone) return "none";
  return phoneDialable(phone) ? "ok" : "invalid";
}
/** likely: Claude's read is enough. seen: a fact the card can show, cited by key (§0.1, 26). */
export type LeadCriterionStandard = "likely" | "seen";
export interface LeadCriterion {
  key: string;
  text: string;
  standard: LeadCriterionStandard;
  required: boolean;
}
/** A "Leaving out" chip. The judge answers it as a required criterion: `fail` means the place is what is left out. */
export interface LeadExclusion {
  key: string;
  text: string;
  origin: "claude" | "you_said";
  category_key?: string;
}
export interface LeadArea {
  kind: "zip" | "city" | "radius";
  /** As the sentence says it: "Austin, TX". */
  label: string;
  /** Two letters. */
  state: string;
  /** Null for a city ask until the probe's coordinates give one, or a ZIP ask until A2 derives it from the ZCTA table (§12.5, 31). */
  center: { lat: number; lng: number } | null;
  radius_m: number;
  zip?: string;
  /** The card's own location query, built from the validated plan. */
  query: string;
}
export interface LeadSearchPlan {
  version: number;
  card: "local_businesses";
  /** Who is sought, plural, as the sentence says it: "personal trainers". */
  name: string;
  /** The owner's words, at most 400 characters. */
  asked: string;
  terms: string[];
  area: LeadArea;
  count: number;
  contact: LeadContactStandard;
  criteria: LeadCriterion[];
  exclusions: LeadExclusion[];
}

/** The fifty states and DC, as a listing spells them; also the plan schema's set of valid state codes. */
const US_STATES: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};
const US_CODES = new Set(Object.values(US_STATES));

const KEY = /^[a-z][a-z0-9_]{0,39}$/;
// Control/format characters (bidi overrides, tag characters) and newlines are stripped from every
// plan-authored text field before it can reach the judge's rubric (26; security review, item 9).
const stripUnsafe = (s: string) => s.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ");
const words = (min: number, max: number) =>
  z
    .string()
    .transform((s) => stripUnsafe(s).trim())
    .pipe(z.string().min(min).max(max));

/** The route's input and the door's: the same shape, checked twice on purpose. */
export const LeadSearchPlanSchema: z.ZodType<LeadSearchPlan> = z
  .object({
    version: z.number().int().min(1),
    card: z.literal("local_businesses"),
    name: words(2, 80),
    asked: words(1, 400),
    terms: z.array(words(2, 60)).min(1).max(5),
    area: z.object({
      kind: z.enum(["zip", "city", "radius"]),
      label: words(2, 80),
      state: z.string().regex(/^[A-Z]{2}$/),
      center: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable(),
      radius_m: z.number().int().min(500).max(200_000),
      zip: z
        .string()
        .regex(/^\d{5}$/)
        .optional(),
      query: words(2, 120),
    }),
    count: z.number().int().min(1).max(LEAD_MAX_PLACES),
    contact: z.enum(["phone", "email"]),
    criteria: z
      .array(
        z.object({
          key: z.string().regex(KEY),
          text: words(2, 120),
          standard: z.enum(["likely", "seen"]),
          required: z.boolean(),
        }),
      )
      .max(8),
    exclusions: z
      .array(
        z.object({
          key: z.string().regex(KEY),
          text: words(2, 80),
          origin: z.enum(["claude", "you_said"]),
          category_key: z.string().regex(KEY).optional(),
        }),
      )
      .max(8),
  })
  .superRefine((p, ctx) => {
    const keys = [...p.criteria.map((c) => c.key), ...p.exclusions.map((e) => e.key)];
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({
        code: "custom",
        message: "every criterion and exclusion has a key of its own",
        path: ["criteria"],
      });
    const lowerTerms = p.terms.map((t) => t.toLowerCase());
    if (new Set(lowerTerms).size !== lowerTerms.length)
      ctx.addIssue({ code: "custom", message: "the terms are not the same phrase twice", path: ["terms"] });
    if (p.area.kind === "radius" && p.area.center === null)
      ctx.addIssue({ code: "custom", message: "a radius needs a center", path: ["area", "center"] });
    if (p.area.kind === "zip" && !p.area.zip)
      ctx.addIssue({
        code: "custom",
        message: "a ZIP ask needs a zip code (A2 derives its center from the ZCTA table)",
        path: ["area", "zip"],
      });
    if (!US_CODES.has(p.area.state))
      ctx.addIssue({ code: "custom", message: "state is not a real US state or DC", path: ["area", "state"] });
  });

const isLowerLetter = (ch: string) => ch !== undefined && ch === ch.toLowerCase() && ch !== ch.toUpperCase();
/** Lowercases the first letter only when the second is itself lowercase, so an acronym ("CVS") keeps its own case. */
const lowerFirst = (s: string) => (s && isLowerLetter(s[1]) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
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

/**
 * The plural the sentence calls them, with the area taken out of it (§8.3).
 * `name` is the model's own words, and a model asked for a plural writes the
 * place into it ("Hair salons in Brooklyn"), which the sentence then says
 * twice. A trailing place clause whose words are the area's is dropped; a
 * clause about something else ("pharmacies inside supermarkets") is kept. With
 * nothing left, the terms say who is sought, since those are the words the
 * source is actually searched with.
 */
export function planWho(plan: LeadSearchPlan): string {
  const m = PLACE_CLAUSE.exec(plan.name);
  const a = plan.area;
  const known = new Set(bits(`${a.label} ${a.query} ${a.zip ?? ""} ${a.state} ${US_NAMES[a.state] ?? ""}`));
  const whole = SAYS_WHERE.test(plan.name) && bits(plan.name).some((w) => known.has(w));
  const cut = whole
    ? ""
    : m && bits(m[0]).some((w) => known.has(w))
      ? plan.name.slice(0, m.index).trim()
      : plan.name.trim();
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
  for (const c of plan.criteria) {
    out.push({ text: " ", pick: null });
    out.push({
      text: c.standard === "seen" ? `${lowerFirst(c.text)} (confirmed)` : lowerFirst(c.text),
      pick: "criterion",
      key: c.key,
    });
  }
  out.push({ text: ", ", pick: null });
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

/** The counts the card's picker offers, unless the owner asked for a number of their own (§8.3). */
export const LEAD_COUNT_CHOICES = [50, 100, 200, 500] as const;

/**
 * About how long a round takes, in minutes, for the card's "About 8 minutes --
 * leave the page if you like" and for the minutes beside each count in the
 * picker. From the places the round would ask for at the yield assumed before
 * a probe has measured one, the probe's own 25, and the card's rate. Never
 * under two minutes: a search that answers faster still reads as a moment.
 */
/** The most one area's terms can yield at the assumed rate: terms × the card's per-term cap × the yield. Above it the picker says so. */
export function planCeiling(plan: LeadSearchPlan): number {
  return Math.floor(plan.terms.length * cardOf(plan).maxPerTerm * LEAD_ASSUMED_YIELD);
}

export function planMinutes(plan: LeadSearchPlan): number {
  const places = LEAD_PROBE_PLACES + placesToAsk(plan, plan.count, LEAD_ASSUMED_YIELD).total;
  return Math.max(2, Math.round(places / cardOf(plan).placesPerMinute));
}

/** JSON.stringify with every object's keys sorted first, so the same value written in another key order compares equal. Array element order still matters. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    const keys = Object.keys(v).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}
const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

/** The changed plan, with its version bumped when the area, count, contact standard, criteria or exclusions moved (S15). */
export function planVersionOf(plan: LeadSearchPlan, changed: Partial<LeadSearchPlan>): LeadSearchPlan {
  const next: LeadSearchPlan = { ...plan, ...changed, version: plan.version };
  const material = (["area", "count", "contact", "criteria", "exclusions"] as const).some(
    (k) => !same(plan[k], next[k]),
  );
  return { ...next, version: material ? plan.version + 1 : plan.version };
}

/* -------------------------------------------------------- the endings -- */

export const LEAD_ENDING_WORDS: Record<LeadRoundEnding, string> = {
  target_reached: "Found what you asked for",
  searched_everything: "Searched everything this plan covers",
  month_leads_used: "This month's leads are used",
  budget_used: "This month's searching budget is used",
  few_new_matches: "Few new matches",
  stopped: "Stopped by you",
  source_failed: "The source failed",
  question_unanswered: "Question unanswered",
  paused: "Paused for everyone",
};

/**
 * Which of the nine endings a round gets, in the order the facts outrank each
 * other (S7). The target overrides everything else: once it is reached, that
 * is the ending, whatever else happened on the page that reached it.
 * "Searched everything" only when every term returned fewer places than it
 * was asked for; otherwise the round ended at its limit with few new matches,
 * and the next step is another round in the same area.
 */
export function endingOfRound(x: {
  counted: number;
  target: number;
  termsShort: boolean[];
  budgetLeftUsd: number;
  allowanceLeft: number;
  stopped: boolean;
  sourceFailed: boolean;
  unanswered: boolean;
  paused: boolean;
}): LeadRoundEnding {
  if (x.counted >= x.target) return "target_reached";
  if (x.paused) return "paused";
  if (x.stopped) return "stopped";
  if (x.sourceFailed) return "source_failed";
  if (x.unanswered) return "question_unanswered";
  if (x.allowanceLeft <= 0) return "month_leads_used";
  if (x.budgetLeftUsd <= 0) return "budget_used";
  if (x.termsShort.length > 0 && x.termsShort.every(Boolean)) return "searched_everything";
  return "few_new_matches";
}

/* ---------------------------------------------------------- the cards -- */

/** The half of a card Claude reads (§0.3, 23). The half code holds is A2's `CARDS`. */
export interface LeadCardBrief {
  id: "local_businesses";
  goodFor: string[];
  notFor: string[];
  settings: string[];
  /** Bronze prices, 18 Sep 2026 (§10.1). */
  costPerPlaceUsd: number;
  contactsPerPlaceUsd: number;
  judgePerPlaceUsd: number;
  checkPerEmailUsd: number;
  startUsd: number;
  /** One search on the source tops out near this many places (§7 step 3). */
  maxPerTerm: number;
  /** How many places this card gets through in a minute, discovery, contacts, judging and checks together: the card's "About 8 minutes". */
  placesPerMinute: number;
  examples: string[];
  approved: true;
}

export const LEAD_CARDS: readonly LeadCardBrief[] = [
  {
    id: "local_businesses",
    goodFor: [
      "local businesses of a kind, in a city, a ZIP or around a point: the businesses that buy from you, or that your clients need next",
      "their listing facts: name, category, address, phone, website, rating and review count, open or closed",
      "emails and social profiles from the business's own website",
      "a mailbox check on the email found",
    ],
    notFor: [
      "people at home, or anyone who is not a business",
      "online sellers and shops with no local listing",
      "what a business stocks or sells inside (a listing does not show inventory: a seen standard on it cannot be met)",
      "businesses outside the US",
    ],
    settings: [
      "terms (up to five search phrases, widest first)",
      "area (a city, a ZIP, or a center and radius)",
      "count (1 to 1000)",
      "contact standard (phone, or email checked)",
    ],
    costPerPlaceUsd: 0.003,
    contactsPerPlaceUsd: 0.002,
    judgePerPlaceUsd: 0.0023,
    checkPerEmailUsd: 0.00089,
    startUsd: 0.00005,
    maxPerTerm: 120,
    // Measured over five real searches on 20 September 2026: 10 to 25 minutes for 50 with checks, five in flight.
    placesPerMinute: 8,
    examples: [
      "200 personal trainers in Austin, TX with a website, email checked, leaving out chain gyms",
      "50 independent pharmacies in ZIP 78704 that could stock an OTC product, a phone is enough",
      "100 family law firms within 15 km of downtown Denver, email checked, leaving out referral networks",
    ],
    approved: true,
  },
];

const cardOf = (plan: LeadSearchPlan): LeadCardBrief => {
  const c = LEAD_CARDS.find((x) => x.id === plan.card);
  if (!c) throw new Error(`no card ${plan.card}`);
  return c;
};

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * What a round is likely to cost, from the card's prices, with room (§13.3):
 * discovery and contacts per place asked, the judge per place, the mailbox
 * check per place under an email standard, and one start per term. The route
 * computes it, the door stores it, the counters reserve it.
 */
export function estimateRoundUsd(plan: LeadSearchPlan, purpose: LeadRoundPurpose, placesToAsk: number): number {
  const c = cardOf(plan);
  const places = Math.max(0, Math.floor(placesToAsk));
  const perPlace =
    c.costPerPlaceUsd +
    c.contactsPerPlaceUsd +
    c.judgePerPlaceUsd +
    (plan.contact === "email" ? c.checkPerEmailUsd : 0);
  const starts = plan.terms.length * (purpose === "probe" ? 1 : 1);
  return round4((places * perPlace + starts * c.startUsd) * LEAD_ESTIMATE_MARGIN);
}

/** `total` spread over `n` terms, the remainder on the first ones. */
function spread(total: number, n: number, cap: number): number[] {
  const each = Math.min(cap, Math.floor(total / n));
  const rest = Math.min(total - each * n, n);
  return Array.from({ length: n }, (_, i) => Math.min(cap, each + (i < rest ? 1 : 0)));
}

/**
 * How many places to ask the source for (S6). The probe asks for 25 spread
 * across every term (E10). A later round asks for the remainder over the
 * yield so far (new Qualified places per place asked), clamped between 1.2x
 * and 4x the remainder, never past LEAD_MAX_PLACES or what one term can
 * return. `yieldSoFar` null means the probe. `remaining` at or under zero asks
 * for nothing at all; when the total is smaller than the number of terms, a
 * term asked for 0 got nothing to ask for, and a caller skips it.
 */
export function placesToAsk(
  plan: LeadSearchPlan,
  remaining: number,
  yieldSoFar: number | null,
): { total: number; perTerm: number[] } {
  const n = Math.max(1, plan.terms.length);
  const cap = cardOf(plan).maxPerTerm;
  if (remaining <= 0) return { total: 0, perTerm: Array(n).fill(0) };
  if (yieldSoFar === null) {
    const perTerm = spread(LEAD_PROBE_PLACES, n, cap);
    return { total: perTerm.reduce((a, b) => a + b, 0), perTerm };
  }
  const left = Math.max(1, Math.ceil(remaining));
  const wanted = yieldSoFar > 0 ? left / yieldSoFar : Number.POSITIVE_INFINITY;
  const clamped = Math.min(Math.max(wanted, left * LEAD_ASK_MIN_FACTOR), left * LEAD_ASK_MAX_FACTOR);
  const total = Math.min(LEAD_MAX_PLACES, cap * n, Math.ceil(clamped));
  const perTerm = spread(total, n, cap);
  return { total: perTerm.reduce((a, b) => a + b, 0), perTerm };
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

/* --------------------------------------------- the question after 25 (P4) -- */

export interface ProbeMember {
  class: LeadMemberClass;
  excluded_by: string | null;
  term?: string | null;
}
export type LeadQuestion =
  { ask: true; sentence: string; criterionKey: string; dropTerm: string | null } | { ask: false };

/**
 * An intent check, never an accuracy measure (P4). Measured by exclusion, not
 * by qualification: under an email standard almost nothing is Qualified yet
 * while the mailbox checks are still out, so Review must never read as a no.
 * Over the probe's places, when more than 1 − LEAD_QUESTION_THRESHOLD were
 * excluded, the round waits and asks whether the search matches what the
 * owner meant, from the most common exclusion. Only an exclusion's own tally
 * can be the topic: Include lifts an exclusion, and must never be offered
 * against a real requirement, so a place excluded by a required criterion is
 * not counted here. The sentence's own lead word ("Most"/"Half"/"Some") comes
 * from that chip's own share of the first n, never from everything excluded
 * for any reason (P2, S12: a line claims only what it names); when more
 * places were excluded than the chip accounts for, the sentence says so with
 * "and other kinds of places". A term is dropped first when it is demonstrably the
 * problem and at least one other term with enough places is demonstrably
 * working; never when every term is bad, and never on the strength of a term
 * nobody else has tried. It never asks the owner to relax a fact.
 */
export function questionAfterProbe(plan: LeadSearchPlan, members: ProbeMember[]): LeadQuestion {
  const n = members.length;
  if (n < LEAD_QUESTION_MIN_EVIDENCE) return { ask: false };
  const excluded = members.filter((m) => m.class === "excluded").length;
  if (excluded / n <= 1 - LEAD_QUESTION_THRESHOLD) return { ask: false };
  const exclusionKeys = new Set(plan.exclusions.map((e) => e.key));
  const tally = new Map<string, number>();
  for (const m of members)
    if (m.class === "excluded" && m.excluded_by && exclusionKeys.has(m.excluded_by))
      tally.set(m.excluded_by, (tally.get(m.excluded_by) ?? 0) + 1);
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return { ask: false };
  const textOf = (key: string) =>
    lowerFirst(
      plan.exclusions.find((e) => e.key === key)?.text ?? plan.criteria.find((c) => c.key === key)?.text ?? key,
    );
  const namedShare = top[1] / n;
  const lead = namedShare >= 2 / 3 ? "Most" : namedShare >= 0.5 ? "Half" : "Some";
  const what = excluded > top[1] ? `${textOf(top[0])} and other kinds of places` : textOf(top[0]);
  let dropTerm: string | null = null;
  if (plan.terms.length > 1) {
    const statOf = (term: string) => {
      const of = members.filter((m) => m.term === term);
      return {
        count: of.length,
        excludedShare: of.length ? of.filter((m) => m.class === "excluded").length / of.length : 0,
      };
    };
    for (const term of plan.terms) {
      const s = statOf(term);
      if (s.count < 5 || s.excludedShare < 2 / 3) continue;
      const anotherWorks = plan.terms.some(
        (other) =>
          other !== term &&
          (() => {
            const o = statOf(other);
            return o.count >= 5 && o.excludedShare < 2 / 3;
          })(),
      );
      if (anotherWorks) {
        dropTerm = term;
        break;
      }
    }
  }
  const drop = dropTerm ? ` I'm dropping "${dropTerm}": it mostly returned those.` : "";
  return {
    ask: true,
    sentence: `${lead} of the first ${n} are ${what}, which I'm leaving out. Is that what you meant?${drop}`,
    criterionKey: top[0],
    dropTerm,
  };
}

/* ---------------------------------------------------- the cleaner (§7.2) -- */

/**
 * Hosts that are a booking platform (booking-page.ts, which names them once), a site builder's shared domain or a
 * social page: a business there has no site of its own.
 */
export const LEAD_PLATFORM_HOSTS: readonly string[] = /* @__PURE__ */ (() => [
  ...BOOKING_PLATFORM_HOSTS,
  "square.site",
  "godaddysites.com",
  "wixsite.com",
  "business.site",
  "facebook.com",
  "instagram.com",
  "linktr.ee",
  "yelp.com",
  "google.com",
])();
/** Address domains that are never the business: platforms, builders' placeholders, trackers. */
export const LEAD_JUNK_EMAIL_DOMAINS: readonly string[] = /* @__PURE__ */ (() => [
  ...BOOKING_PLATFORM_HOSTS,
  "square.site",
  "godaddy.com",
  "wix.com",
  "wixpress.com",
  "sentry.io",
  "example.com",
  "domain.com",
  "yourdomain.com",
  "email.com",
])();
/** Local parts that are a template's placeholder, not a mailbox. */
export const LEAD_PLACEHOLDER_LOCALS = [
  "filler",
  "yourdomain",
  "youremail",
  "your",
  "example",
  "email",
  "name",
  "user",
  "username",
  "test",
  "noreply",
  "no-reply",
  "donotreply",
] as const;
/** Corporate roles that are not how a business takes a customer (§7.2). */
export const LEAD_ROLE_LOCALS = [
  "careers",
  "career",
  "jobs",
  "recruiting",
  "recruitment",
  "hr",
  "media",
  "press",
  "pr",
  "privacy",
  "legal",
  "webmaster",
  "abuse",
  "postmaster",
] as const;
/** A front desk's addresses, first among a business's own. */
const DESK_LOCALS = [
  "intake",
  "info",
  "hello",
  "contact",
  "office",
  "team",
  "book",
  "booking",
  "bookings",
  "appointments",
  "studio",
  "frontdesk",
  "admin",
];

const has = (xs: readonly string[], v: string) => xs.includes(v);

export interface CleanedEmails {
  /** Best first: the business's own (five at most, a front desk first), free-mail (three), another company's (two). */
  kept: string[];
  dropped: {
    email: string;
    why: "malformed" | "duplicate" | "junk_domain" | "placeholder" | "role" | "image" | "foreign_list" | "over_limit";
  }[];
}

/**
 * The addresses worth showing the judge, and why each of the others was
 * dropped (§7.2). When the page names more than three other companies'
 * domains, that is a list of partners or brands, not the business, and none
 * of theirs is kept.
 */
export function cleanEmailCandidates(emails: string[], host: string | null): CleanedEmails {
  const seen = new Set<string>();
  const own: string[] = [];
  const free: string[] = [];
  const foreign: string[] = [];
  const dropped: CleanedEmails["dropped"] = [];
  for (const raw of emails) {
    const fixed = String(raw ?? "")
      .trim()
      .replace(/^mailto:/i, "")
      .replace(/@www\./i, "@");
    const address = normalizeEmail(fixed);
    if (!address) {
      dropped.push({ email: String(raw ?? ""), why: "malformed" });
      continue;
    }
    if (seen.has(address)) {
      dropped.push({ email: address, why: "duplicate" });
      continue;
    }
    seen.add(address);
    const [local, domain] = address.split("@");
    if (LEAD_JUNK_EMAIL_DOMAINS.some((d) => onDomain(domain, d))) {
      dropped.push({ email: address, why: "junk_domain" });
      continue;
    }
    if (has(LEAD_PLACEHOLDER_LOCALS, local)) {
      dropped.push({ email: address, why: "placeholder" });
      continue;
    }
    if (has(LEAD_ROLE_LOCALS, local.split(/[.+_-]/)[0])) {
      dropped.push({ email: address, why: "role" });
      continue;
    }
    if (/\.(png|jpe?g|gif|webp|svg)$/.test(domain)) {
      dropped.push({ email: address, why: "image" });
      continue;
    }
    const isOwn = !!host && (domain === host || domain.endsWith(`.${host}`));
    (isOwn ? own : isFreeMail(domain) ? free : foreign).push(address);
  }
  const deskRank = (a: string) => {
    const i = DESK_LOCALS.indexOf(a.split("@")[0]);
    return i < 0 ? DESK_LOCALS.length : i;
  };
  own.sort((a, b) => deskRank(a) - deskRank(b));
  const foreignDomains = new Set(foreign.map((a) => a.split("@")[1]));
  const keep = (xs: string[], limit: number) => {
    for (const x of xs.slice(limit)) dropped.push({ email: x, why: "over_limit" });
    return xs.slice(0, limit);
  };
  const kept = [...keep(own, 5), ...keep(free, 3)];
  if (foreignDomains.size <= 3) kept.push(...keep(foreign, 2));
  else for (const x of foreign) dropped.push({ email: x, why: "foreign_list" });
  return { kept, dropped };
}

const NANP = /^\+1[2-9]\d{2}[2-9]\d{6}$/;

/** A US number anyone can dial, in E.164; null for a placeholder, a mis-prefixed number or a foreign one. */
export function usPhone(raw: string | null | undefined): string | null {
  const e164 = normalizePhone(raw);
  if (!e164 || !NANP.test(e164)) return null;
  const ten = e164.slice(2);
  if (/^(\d)\1{9}$/.test(ten) || ten === "1234567890") return null;
  return e164;
}

/** The website's host, www. removed; null when there is none of their own (a platform, a social page). */
export function siteHost(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  if (!host.includes(".") || host.length > LEAD_FACT_MAX) return null;
  if (LEAD_PLATFORM_HOSTS.some((p) => onDomain(host, p))) return null;
  return host;
}

/** "Texas" or "TX" → "TX"; null for anything that is not a US state or DC. */
export function stateCode(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (up.length === 2 && US_CODES.has(up)) return up;
  return US_STATES[s.toLowerCase()] ?? null;
}

/* ---------------------------------------------------------- the month -- */

/** 'YYYY-MM' in the workspace's zone: the month a lead counts in (§0.2, 15). lead_month() in 00140 says the same. */
export function leadMonth(zone: string, at: Date): string {
  const d = dayInZone(zone, at.getTime());
  return `${d.y}-${String(d.m).padStart(2, "0")}`;
}
