import { sameListed } from "../calendar/service-offer.js";
export const BUSINESS_READ_SOURCES = ["google_profile", "website"];
const cleanText = (v, max) => typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null;
const day = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
function lookReadOf(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v;
  const worn = o.worn && typeof o.worn === "object" ? o.worn : {};
  return {
    logo_url: cleanText(o.logo_url, 500),
    accent: typeof o.accent === "string" && /^#[0-9a-f]{6}$/.test(o.accent) ? o.accent : null,
    worn: { logo: worn.logo === true, accent: worn.accent === true }
  };
}
export function businessReadFactsOf(raw) {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const list = (v) => Array.isArray(v) ? v : [];
  const obj = (v) => v && typeof v === "object" ? v : {};
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
    look: lookReadOf(r.look)
  };
}
export const FOUND_WORDS = {
  title: "Found for you",
  lead: "Read from your Google profile and your website. Add what's right; a price comes with its service.",
  from: { google_profile: "Google profile", website: "your website" },
  add: "Add",
  addAll: (n) => `Add all ${n}`,
  added: (what) => `${what} added.`,
  service: (name, price, minutes) => [name, price, minutes ? `${minutes} min` : null].filter(Boolean).join(" \xB7 "),
  closed: (date, until) => until ? `Closed ${date} to ${until}` : `Closed ${date}`,
  rulesTitle: "Booking rule",
  /** The words of itself, kept as a thing it should know. */
  aboutTitle: "About the business",
  unread: (where, why) => `${where.charAt(0).toUpperCase()}${where.slice(1)} couldn't be read: ${why}`,
  reading: "Reading your website\u2026"
};
export function foundOf(reads, record) {
  const ordered = [...reads ?? []].sort(
    (a, b) => BUSINESS_READ_SOURCES.indexOf(a.source) - BUSINESS_READ_SOURCES.indexOf(b.source)
  );
  const listed = (record.services ?? []).map((s) => typeof s?.name === "string" ? s.name : "").filter(Boolean);
  const closedDays = new Set((record.closures ?? []).map((c) => c?.date).filter(Boolean));
  const noted = (record.notes ?? []).map((n) => `${n?.title ?? ""} ${n?.text ?? ""}`.toLowerCase());
  const out = { services: [], closed: [], notes: [], description: null, unread: null, any: false };
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
    if (!out.description && about && !(record.description ?? "").trim() && !noted.some((n) => n.includes(about.toLowerCase())))
      out.description = { text: about, from };
  }
  out.any = out.services.length + out.closed.length + out.notes.length > 0 || !!out.description;
  return out;
}
export const WEBSITE_READ_SYSTEM = [
  "You read a small business's own website pages for its owner, who checks each thing before their receptionist says it.",
  "Answer only from what the pages say. Leave out anything they do not state; never guess a price, a time or a rule.",
  'services: each service or treatment offered, its price exactly as written ("$65", "from $40", "$120+") or null, and its length in minutes where stated, else null.',
  "closed: days the business says it is closed (a holiday, a break), as YYYY-MM-DD with the last day of a run in until, else null. Never a weekly day off.",
  "rules: booking rules in a short sentence each (a deposit, cancelling or rescheduling, arriving late, age, what to bring).",
  "answers: questions the pages answer, each the question and its answer in a sentence or two.",
  "description: one short paragraph of what the business says of itself, in its own words, or null."
].join("\n");
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
          duration_min: { type: ["integer", "null"] }
        }
      }
    },
    closed: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "until"],
        properties: { date: { type: "string" }, until: { type: ["string", "null"] } }
      }
    },
    rules: { type: "array", items: { type: "string" } },
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["q", "a"],
        properties: { q: { type: "string" }, a: { type: "string" } }
      }
    },
    description: { type: ["string", "null"] }
  }
};
export const WEBSITE_UNREAD_WORDS = {
  address: "it isn't an address on the public web",
  silent: "it didn't answer, or answered with no page",
  nothing: "it says nothing about services, prices or rules that we could find",
  failed: "reading it failed just now; it is read again when you save it"
};
