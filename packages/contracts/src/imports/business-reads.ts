/**
 * What the Business Profile and the website say (decision 0073, R10 and R17; business_reads, 00479): the services and
 * their prices, the days closed, the booking rules, the questions it answers and the words it says of itself, read for
 * the owner to check at the first run's Check. Nothing here reaches a customer: each is offered beside what the record
 * holds, and kept only on the owner's tap, a price with its service (the tap is the price confirmed, never assumed).
 * Pure: the edge writes the row, Setup reads it, and this says what Check offers of it.
 */
import { sameListed } from "../calendar/service-offer";

export const BUSINESS_READ_SOURCES = ["google_profile", "website"] as const;
export type BusinessReadSource = (typeof BUSINESS_READ_SOURCES)[number];

/** What a source said, as the row keeps it (business_reads.facts). */
export interface BusinessReadFacts {
  services: Array<{ name: string; price_note: string | null; duration_min: number | null }>;
  /** Days it says it is closed, YYYY-MM-DD, each run with its last. */
  closed: Array<{ date: string; until: string | null }>;
  /** Booking rules in its own words ("A $20 deposit holds the time", "Cancel 24 hours ahead"). */
  rules: string[];
  /** Questions it answers: the question, and its answer. */
  answers: Array<{ q: string; a: string }>;
  description: string | null;
}

/** One source's read, as Setup carries it. */
export interface BusinessReadDto {
  source: BusinessReadSource;
  facts: BusinessReadFacts;
  read_from: string | null;
  read_at: string;
  error: string | null;
}

const cleanText = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null;
const day = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** A row's facts, read for what each is: a field of the wrong kind is none, a list of things that are not is empty. */
export function businessReadFactsOf(raw: unknown): BusinessReadFacts {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return {
    services: list(r.services).flatMap((s) => {
      const o = obj(s);
      const name = cleanText(o.name, 80);
      if (!name) return [];
      const minutes = typeof o.duration_min === "number" && o.duration_min > 0 ? Math.round(o.duration_min) : null;
      return [{ name, price_note: cleanText(o.price_note, 60), duration_min: minutes }];
    }),
    closed: list(r.closed).flatMap((c) => {
      const o = obj(c);
      const date = day(o.date);
      return date ? [{ date, until: day(o.until) }] : [];
    }),
    rules: list(r.rules).flatMap((x) => {
      const t = cleanText(x, 200);
      return t ? [t] : [];
    }),
    answers: list(r.answers).flatMap((x) => {
      const o = obj(x);
      const q = cleanText(o.q, 200);
      const a = cleanText(o.a, 600);
      return q && a ? [{ q, a }] : [];
    }),
    description: cleanText(r.description, 750),
  };
}

/** What Check offers of the reads, beside what the record holds: each thing once, the profile's before the website's. */
export interface FoundVM {
  services: Array<{ name: string; price_note: string | null; duration_min: number | null; from: string }>;
  closed: Array<{ date: string; until: string | null; from: string }>;
  /** Rules and answers, each a note it should know, titled. */
  notes: Array<{ title: string; text: string; from: string }>;
  /** The words of itself, where the record keeps none of its own. */
  description: { text: string; from: string } | null;
  /** A read that could not be made, said once: "Your website couldn't be read: …". */
  unread: string | null;
  /** Anything to offer at all. */
  any: boolean;
}

export const FOUND_WORDS = {
  title: "Found for you",
  lead: "Read from your Google profile and your website. Add what's right; a price comes with its service.",
  from: { google_profile: "Google profile", website: "your website" } as Record<BusinessReadSource, string>,
  add: "Add",
  addAll: (n: number) => `Add all ${n}`,
  added: (what: string) => `${what} added.`,
  service: (name: string, price: string | null, minutes: number | null) =>
    [name, price, minutes ? `${minutes} min` : null].filter(Boolean).join(" · "),
  closed: (date: string, until: string | null) => (until ? `Closed ${date} to ${until}` : `Closed ${date}`),
  rulesTitle: "Booking rule",
  /** The words of itself, kept as a thing it should know. */
  aboutTitle: "About the business",
  unread: (where: string, why: string) => `${where.charAt(0).toUpperCase()}${where.slice(1)} couldn't be read: ${why}`,
  reading: "Reading your website…",
} as const;

/**
 * What Check offers: every service, day closed, rule and answer the reads found that the record does not hold yet (a
 * service the same by the one rule, sameListed, is held), the profile's first.
 */
export function foundOf(
  reads: readonly BusinessReadDto[] | null | undefined,
  record: {
    services: readonly { name?: string | null }[] | null | undefined;
    closures: readonly { date?: string | null }[] | null | undefined;
    notes: readonly { title?: string | null; text?: string | null }[] | null | undefined;
    description: string | null | undefined;
  },
): FoundVM {
  const ordered = [...(reads ?? [])].sort(
    (a, b) => BUSINESS_READ_SOURCES.indexOf(a.source) - BUSINESS_READ_SOURCES.indexOf(b.source),
  );
  const listed = (record.services ?? []).map((s) => (typeof s?.name === "string" ? s.name : "")).filter(Boolean);
  const closedDays = new Set((record.closures ?? []).map((c) => c?.date).filter(Boolean));
  const noted = (record.notes ?? []).map((n) => `${n?.title ?? ""} ${n?.text ?? ""}`.toLowerCase());
  const out: FoundVM = { services: [], closed: [], notes: [], description: null, unread: null, any: false };
  for (const r of ordered) {
    const from = FOUND_WORDS.from[r.source];
    if (r.error && !out.unread) out.unread = FOUND_WORDS.unread(from, r.error);
    for (const s of r.facts.services) {
      if (listed.some((n) => sameListed(n, s.name)) || out.services.some((x) => sameListed(x.name, s.name))) continue;
      out.services.push({ ...s, from });
    }
    for (const c of r.facts.closed) {
      if (closedDays.has(c.date) || out.closed.some((x) => x.date === c.date)) continue;
      out.closed.push({ ...c, from });
    }
    for (const rule of r.facts.rules) {
      if (noted.some((n) => n.includes(rule.toLowerCase()))) continue;
      out.notes.push({ title: FOUND_WORDS.rulesTitle, text: rule, from });
    }
    for (const qa of r.facts.answers) {
      if (noted.some((n) => n.includes(qa.a.toLowerCase()))) continue;
      out.notes.push({ title: qa.q.slice(0, 80), text: qa.a, from });
    }
    const about = r.facts.description;
    if (
      !out.description &&
      about &&
      !(record.description ?? "").trim() &&
      !noted.some((n) => n.includes(about.toLowerCase()))
    )
      out.description = { text: about, from };
  }
  out.any = out.services.length + out.closed.length + out.notes.length > 0 || !!out.description;
  return out;
}

/* ---- the website's reading (R10) ---- */

/** What the model is asked of a website's pages: only what they say, in their words, never a guess. */
export const WEBSITE_READ_SYSTEM = [
  "You read a small business's own website pages for its owner, who checks each thing before their receptionist says it.",
  "Answer only from what the pages say. Leave out anything they do not state; never guess a price, a time or a rule.",
  'services: each service or treatment offered, its price exactly as written ("$65", "from $40", "$120+") or null, and its length in minutes where stated, else null.',
  "closed: days the business says it is closed (a holiday, a break), as YYYY-MM-DD with the last day of a run in until, else null. Never a weekly day off.",
  "rules: booking rules in a short sentence each (a deposit, cancelling or rescheduling, arriving late, age, what to bring).",
  "answers: questions the pages answer, each the question and its answer in a sentence or two.",
  "description: one short paragraph of what the business says of itself, in its own words, or null.",
].join("\n");

/** The JSON schema the reading answers in (Anthropic's structured output), the shape businessReadFactsOf reads. */
export const WEBSITE_READ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["services", "closed", "rules", "answers", "description"],
  properties: {
    services: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "price_note", "duration_min"],
        properties: {
          name: { type: "string" },
          price_note: { type: ["string", "null"] },
          duration_min: { type: ["integer", "null"] },
        },
      },
    },
    closed: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "until"],
        properties: { date: { type: "string" }, until: { type: ["string", "null"] } },
      },
    },
    rules: { type: "array", items: { type: "string" } },
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["q", "a"],
        properties: { q: { type: "string" }, a: { type: "string" } },
      },
    },
    description: { type: ["string", "null"] },
  },
} as const;

/** Why a website could not be read, said at Check. */
export const WEBSITE_UNREAD_WORDS = {
  address: "it isn't an address on the public web",
  silent: "it didn't answer, or answered with no page",
  nothing: "it says nothing about services, prices or rules that we could find",
  failed: "reading it failed just now; it is read again when you save it",
} as const;
