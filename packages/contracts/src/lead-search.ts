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
import { z } from "zod";
import { normalizeEmail } from "./email-address";
import { normalizePhone } from "./phone";
import { dayInZone } from "./availability";
import type { JudgePlaceAnswer, PlaceFacts } from "./lead-judge";

/* ------------------------------------------------------ the stored sets -- */
// Each mirrors a CHECK in 00139 and is held to it in schema-sets.ts.

export const LEAD_SEARCH_VIAS = ["people", "ask"] as const;
export type LeadSearchVia = (typeof LEAD_SEARCH_VIAS)[number];
export const LEAD_ROUND_PURPOSES = ["probe", "main", "topup", "renew"] as const;
export type LeadRoundPurpose = (typeof LEAD_ROUND_PURPOSES)[number];
export const LEAD_ROUND_STATES = ["queued", "probing", "waiting_on_owner", "running", "checking", "ended"] as const;
export type LeadRoundState = (typeof LEAD_ROUND_STATES)[number];
/** The nine endings, one closed set (§0.5, S7). */
export const LEAD_ROUND_ENDINGS = [
  "target_reached", "searched_everything", "month_leads_used", "budget_used", "few_new_matches",
  "stopped", "source_failed", "question_unanswered", "paused",
] as const;
export type LeadRoundEnding = (typeof LEAD_ROUND_ENDINGS)[number];
export const LEAD_ROUND_ANSWERS = ["keep", "include", "stop"] as const;
export type LeadRoundAnswer = (typeof LEAD_ROUND_ANSWERS)[number];
export const LEAD_RUN_PURPOSES = ["discover", "check"] as const;
export const LEAD_RUN_STATES = ["claimed", "starting", "running", "succeeded", "failed", "aborted", "timed_out", "unknown"] as const;
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
export const LEAD_OPERATION_KINDS = ["undo_search", "keep", "exclude", "put_back", "include", "stop"] as const;
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
/** A round's estimate is reserved with this much room (§13.3: the cap is the estimate with room). */
export const LEAD_ESTIMATE_MARGIN = 1.3;
/** The main round asks for the remainder over the probe's yield, clamped here (S6). */
export const LEAD_ASK_MIN_FACTOR = 1.2;
export const LEAD_ASK_MAX_FACTOR = 4;
/** An unanswered question ends the round after this long (§0.5). */
export const LEAD_QUESTION_WAIT_MS = 24 * 3_600_000;

/* ------------------------------------------------------------ the plan -- */

export type LeadContactStandard = "phone" | "email";
/** likely: Claude's read is enough. seen: a fact the card can show, cited by key (§0.1, 26). */
export type LeadCriterionStandard = "likely" | "seen";
export interface LeadCriterion { key: string; text: string; standard: LeadCriterionStandard; required: boolean; }
/** A "Leaving out" chip. The judge answers it as a required criterion: `fail` means the place is what is left out. */
export interface LeadExclusion { key: string; text: string; origin: "claude" | "you_said"; category_key?: string; }
export interface LeadArea {
  kind: "zip" | "city" | "radius";
  /** As the sentence says it: "Austin, TX". */
  label: string;
  /** Two letters. */
  state: string;
  /** Null for a city ask until the probe's coordinates give one (§12.5, 31). */
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

const KEY = /^[a-z][a-z0-9_]{0,39}$/;
const words = (min: number, max: number) => z.string().trim().min(min).max(max);

/** The route's input and the door's: the same shape, checked twice on purpose. */
export const LeadSearchPlanSchema: z.ZodType<LeadSearchPlan> = z.object({
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
    zip: z.string().regex(/^\d{5}$/).optional(),
    query: words(2, 120),
  }),
  count: z.number().int().min(1).max(LEAD_MAX_PLACES),
  contact: z.enum(["phone", "email"]),
  criteria: z.array(z.object({ key: z.string().regex(KEY), text: words(2, 120), standard: z.enum(["likely", "seen"]), required: z.boolean() })).max(8),
  exclusions: z.array(z.object({ key: z.string().regex(KEY), text: words(2, 80), origin: z.enum(["claude", "you_said"]), category_key: z.string().regex(KEY).optional() })).max(8),
}).superRefine((p, ctx) => {
  const keys = [...p.criteria.map((c) => c.key), ...p.exclusions.map((e) => e.key)];
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "every criterion and exclusion has a key of its own", path: ["criteria"] });
});

const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * The plan as one sentence, whose words are the controls (§7 step 2, §8.3).
 * "Find 200 personal trainers in Austin, TX with a website, then find their
 * email and check it. Leaving out: chain gyms." A seen criterion says so.
 */
export function planSentence(plan: LeadSearchPlan): string {
  const have = plan.criteria.map((c) => (c.standard === "seen" ? `${lowerFirst(c.text)} (confirmed)` : lowerFirst(c.text)));
  const contact = plan.contact === "email" ? "then find their email and check it" : "a phone is enough";
  const head = `Find ${plan.count} ${plan.name} in ${plan.area.label}${have.length ? ` ${list(have)}` : ""}, ${contact}.`;
  const out = plan.exclusions.map((e) => lowerFirst(e.text));
  return out.length ? `${head} Leaving out: ${list(out)}.` : head;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The changed plan, with its version bumped when the area, count, contact standard, criteria or exclusions moved (S15). */
export function planVersionOf(plan: LeadSearchPlan, changed: Partial<LeadSearchPlan>): LeadSearchPlan {
  const next: LeadSearchPlan = { ...plan, ...changed, version: plan.version };
  const material = (["area", "count", "contact", "criteria", "exclusions"] as const).some((k) => !same(plan[k], next[k]));
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
 * other (S7). "Searched everything" only when every term returned fewer places
 * than it was asked for; otherwise the round ended at its limit with few new
 * matches, and the next step is another round in the same area.
 */
export function endingOfRound(x: {
  counted: number; target: number; termsShort: boolean[]; budgetLeftUsd: number; allowanceLeft: number;
  stopped: boolean; sourceFailed: boolean; unanswered: boolean; paused: boolean;
}): LeadRoundEnding {
  if (x.paused) return "paused";
  if (x.stopped) return "stopped";
  if (x.sourceFailed) return "source_failed";
  if (x.unanswered) return "question_unanswered";
  if (x.counted >= x.target) return "target_reached";
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
    settings: ["terms (up to five search phrases, widest first)", "area (a city, a ZIP, or a center and radius)", "count (1 to 1000)", "contact standard (phone, or email checked)"],
    costPerPlaceUsd: 0.003,
    contactsPerPlaceUsd: 0.002,
    judgePerPlaceUsd: 0.0023,
    checkPerEmailUsd: 0.00089,
    startUsd: 0.00005,
    maxPerTerm: 120,
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
  const perPlace = c.costPerPlaceUsd + c.contactsPerPlaceUsd + c.judgePerPlaceUsd + (plan.contact === "email" ? c.checkPerEmailUsd : 0);
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
 * return. `yieldSoFar` null means the probe.
 */
export function placesToAsk(plan: LeadSearchPlan, remaining: number, yieldSoFar: number | null): { total: number; perTerm: number[] } {
  const n = Math.max(1, plan.terms.length);
  const cap = cardOf(plan).maxPerTerm;
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
 * Code decides the class from the judge's per-criterion answers (§0.1). A
 * required criterion (or an exclusion: every exclusion is required) that fails
 * excludes, with that key as the reason. Any `unknown`, a seen criterion
 * answered with no fact cited (only inference), a place with no location or
 * one outside the area, or a contact standard not met sends the place to
 * review. Everything else qualifies. A fit band is derived for ordering.
 */
export function classify(plan: LeadSearchPlan, answer: JudgePlaceAnswer, facts: PlaceFacts, emailState: LeadEmailState, inArea: boolean): LeadClassification {
  const reasons: string[] = [];
  const rubric = [
    ...plan.criteria.map((c) => ({ key: c.key, standard: c.standard, required: c.required })),
    ...plan.exclusions.map((e) => ({ key: e.key, standard: "likely" as const, required: true })),
  ];
  let excludedBy: string | null = null;
  let softFail = false;
  let unknown = false;
  for (const r of rubric) {
    const a = answer.criteria.find((x) => x.key === r.key);
    const verdict = a?.answer ?? "unknown";
    if (verdict === "fail") {
      if (r.required) { excludedBy = excludedBy ?? r.key; reasons.push(`fail:${r.key}`); } else { softFail = true; }
    } else if (verdict === "unknown") {
      unknown = true; reasons.push(`unknown:${r.key}`);
    } else if (r.standard === "seen" && (a?.facts.length ?? 0) === 0) {
      unknown = true; reasons.push(`inferred:${r.key}`);
    }
  }
  if (excludedBy) return { class: "excluded", excluded_by: excludedBy, fit: null, reasons };
  if (!inArea) reasons.push("out_of_area");
  if (plan.contact === "email" && emailState !== "ok") reasons.push(`email:${emailState}`);
  if (plan.contact === "phone" && facts.phone_matches_site === null) reasons.push("phone:none");
  const fit: LeadFit = softFail ? "long" : unknown ? "look" : "strong";
  return { class: reasons.length ? "review" : "qualified", excluded_by: null, fit, reasons };
}

/* --------------------------------------------- the question after 25 (P4) -- */

export interface ProbeMember { class: LeadMemberClass; excluded_by: string | null; term?: string | null; }
export type LeadQuestion =
  | { ask: true; sentence: string; criterionKey: string; dropTerm: string | null }
  | { ask: false };

/**
 * An intent check, never an accuracy measure (P4). Over the probe's places,
 * when fewer than 60% qualified and something was left out, the round waits
 * and asks whether the search matches what the owner meant, from the most
 * common exclusion. A term that returned mostly the wrong kind is dropped
 * first, and the sentence says so. It never asks the owner to relax a fact.
 */
export function questionAfterProbe(plan: LeadSearchPlan, members: ProbeMember[]): LeadQuestion {
  const n = members.length;
  if (n < LEAD_QUESTION_MIN_EVIDENCE) return { ask: false };
  const qualified = members.filter((m) => m.class === "qualified").length;
  if (qualified / n >= LEAD_QUESTION_THRESHOLD) return { ask: false };
  const tally = new Map<string, number>();
  for (const m of members) if (m.class === "excluded" && m.excluded_by) tally.set(m.excluded_by, (tally.get(m.excluded_by) ?? 0) + 1);
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return { ask: false };
  const textOf = (key: string) => lowerFirst(plan.exclusions.find((e) => e.key === key)?.text ?? plan.criteria.find((c) => c.key === key)?.text ?? key);
  const excluded = members.filter((m) => m.class === "excluded").length;
  const share = excluded / n;
  const lead = share >= 2 / 3 ? "Most" : share >= 0.5 ? "Half" : "Some";
  const what = tally.size > 1 ? `${textOf(top[0])} and other kinds of places` : textOf(top[0]);
  let dropTerm: string | null = null;
  if (plan.terms.length > 1) {
    for (const term of plan.terms) {
      const of = members.filter((m) => m.term === term);
      if (of.length >= 5 && of.filter((m) => m.class === "excluded").length / of.length >= 2 / 3) { dropTerm = term; break; }
    }
  }
  const drop = dropTerm ? ` I'm dropping "${dropTerm}": it mostly returned those.` : "";
  return { ask: true, sentence: `${lead} of the first ${n} are ${what}, which I'm leaving out. Is that what you meant?${drop}`, criterionKey: top[0], dropTerm };
}

/* ---------------------------------------------------- the cleaner (§7.2) -- */

/** Hosts that are a booking platform or a social page: a business there has no site of its own. */
export const LEAD_PLATFORM_HOSTS = [
  "vagaro.com", "square.site", "squareup.com", "glossgenius.com", "godaddysites.com", "wixsite.com", "business.site",
  "facebook.com", "instagram.com", "linktr.ee", "yelp.com", "booksy.com", "fresha.com", "styleseat.com",
  "schedulicity.com", "mindbodyonline.com", "setmore.com", "acuityscheduling.com", "google.com",
] as const;
/** Address domains that are never the business: platforms, builders' placeholders, trackers. */
export const LEAD_JUNK_EMAIL_DOMAINS = [
  "vagaro.com", "square.site", "squareup.com", "glossgenius.com", "godaddy.com", "wix.com", "wixpress.com",
  "sentry.io", "example.com", "domain.com", "yourdomain.com", "email.com",
] as const;
/** Local parts that are a template's placeholder, not a mailbox. */
export const LEAD_PLACEHOLDER_LOCALS = [
  "filler", "yourdomain", "youremail", "your", "example", "email", "name", "user", "username", "test", "noreply", "no-reply", "donotreply",
] as const;
/** Corporate roles that are not how a business takes a customer (§7.2). */
export const LEAD_ROLE_LOCALS = ["careers", "career", "jobs", "recruiting", "recruitment", "hr", "media", "press", "pr", "privacy", "legal", "webmaster", "abuse", "postmaster"] as const;
export const LEAD_FREE_MAIL = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com", "live.com", "msn.com", "me.com", "protonmail.com", "proton.me"] as const;
/** A front desk's addresses, first among a business's own. */
const DESK_LOCALS = ["intake", "info", "hello", "contact", "office", "team", "book", "booking", "bookings", "appointments", "studio", "frontdesk", "admin"];

const has = (xs: readonly string[], v: string) => xs.includes(v);

export interface CleanedEmails {
  /** Best first: the business's own (five at most, a front desk first), free-mail (three), another company's (two). */
  kept: string[];
  dropped: { email: string; why: "malformed" | "duplicate" | "junk_domain" | "placeholder" | "role" | "image" | "foreign_list" | "over_limit" }[];
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
    const fixed = String(raw ?? "").trim().replace(/^mailto:/i, "").replace(/@www\./i, "@");
    const address = normalizeEmail(fixed);
    if (!address) { dropped.push({ email: String(raw ?? ""), why: "malformed" }); continue; }
    if (seen.has(address)) { dropped.push({ email: address, why: "duplicate" }); continue; }
    seen.add(address);
    const [local, domain] = address.split("@");
    if (has(LEAD_JUNK_EMAIL_DOMAINS, domain)) { dropped.push({ email: address, why: "junk_domain" }); continue; }
    if (has(LEAD_PLACEHOLDER_LOCALS, local)) { dropped.push({ email: address, why: "placeholder" }); continue; }
    if (has(LEAD_ROLE_LOCALS, local.split(/[.+_-]/)[0])) { dropped.push({ email: address, why: "role" }); continue; }
    if (/\.(png|jpe?g|gif|webp|svg)$/.test(domain)) { dropped.push({ email: address, why: "image" }); continue; }
    const isOwn = !!host && (domain === host || domain.endsWith(`.${host}`));
    (isOwn ? own : has(LEAD_FREE_MAIL, domain) ? free : foreign).push(address);
  }
  const deskRank = (a: string) => { const i = DESK_LOCALS.indexOf(a.split("@")[0]); return i < 0 ? DESK_LOCALS.length : i; };
  own.sort((a, b) => deskRank(a) - deskRank(b));
  const foreignDomains = new Set(foreign.map((a) => a.split("@")[1]));
  const keep = (xs: string[], limit: number) => { for (const x of xs.slice(limit)) dropped.push({ email: x, why: "over_limit" }); return xs.slice(0, limit); };
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
  if (LEAD_PLATFORM_HOSTS.some((p) => host === p || host.endsWith(`.${p}`))) return null;
  return host;
}

/** The fifty states and DC, as a listing spells them. */
const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT",
  delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE",
  nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};
const US_CODES = new Set(Object.values(US_STATES));

/** "Texas" or "TX" → "TX"; null for anything that is not a US state or DC. */
export function stateCode(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (up.length === 2 && US_CODES.has(up)) return up;
  return US_STATES[s.toLowerCase()] ?? null;
}

/* ---------------------------------------------------------- the month -- */

/** 'YYYY-MM' in the workspace's zone: the month a lead counts in (§0.2, 15). lead_month() in 00139 says the same. */
export function leadMonth(zone: string, at: Date): string {
  const d = dayInZone(zone, at.getTime());
  return `${d.y}-${String(d.m).padStart(2, "0")}`;
}
