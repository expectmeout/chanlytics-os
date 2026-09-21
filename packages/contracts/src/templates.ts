/**
 * Templates a business writes here, and the values a broadcast fills them with.
 *
 * Meta approves the words; Chanlytics helps write them and sends them for
 * review. Everything Meta will refuse at the wire is refused here first, in
 * the person's words, and everything a broadcast puts into a numbered slot
 * is decided once: typed text, the person's first name, the business's name,
 * or its booking link — resolved per recipient by the job with the same
 * function the page previews with.
 */
import { clockDate } from "./clock";
import { agoWords } from "./time";

export const TEMPLATE_LANGUAGES: readonly { id: string; label: string }[] = [
  { id: "en_US", label: "English (US)" },
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
  { id: "es_MX", label: "Spanish (Mexico)" },
  { id: "es_ES", label: "Spanish (Spain)" },
  { id: "pt_BR", label: "Portuguese (Brazil)" },
];

export const TEMPLATE_CATEGORIES = ["marketing", "utility"] as const;
export type TemplateCategoryChoice = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_BODY_MAX = 1024;
export const TEMPLATE_FOOTER_MAX = 60;
export const TEMPLATE_EXAMPLE_MAX = 100;
export const TEMPLATE_NAME_MAX = 60;
/** Meta's ceiling for the words on a button. */
export const TEMPLATE_BUTTON_TEXT_MAX = 25;

const NAME = /^[a-z0-9_]{1,512}$/;

export function templateNameOk(name: string): boolean {
  return NAME.test(name);
}

/** A name Meta accepts, from anything a person typed: lowercase, digits and underscores. */
export function slugTemplateName(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, TEMPLATE_NAME_MAX)
    .replace(/_+$/g, "");
}

/** The numbered slots a body names, sorted and unique. */
export function placeholdersOf(body: string): number[] {
  const set = new Set<number>();
  for (const m of String(body ?? "").matchAll(/\{\{(\d+)\}\}/g)) set.add(Number(m[1]));
  return [...set].sort((a, b) => a - b);
}

/** Meta wants {{1}}, {{2}}, … with no gaps and nothing else. */
export function placeholdersSequential(positions: number[]): boolean {
  return positions.every((n, i) => n === i + 1);
}

export interface TemplateDraftInput {
  name: string;
  language: string;
  category: string;
  body: string;
  footer?: string | null;
  /** One example per slot, in order — Meta's reviewers read these. */
  examples?: string[];
  /**
   * One button under the words, opening a fixed address — the business's own
   * booking link. STATIC on purpose: a button whose URL takes a value needs a
   * parameter at send time, and `sendTemplate` puts the body on the wire and
   * nothing else, so such a template is refused by Meta for every recipient
   * (template-library.ts templateBlocked). A fixed link needs no parameter, so
   * this one sends exactly as it is written.
   */
  button?: { text: string; url: string } | null;
}

export interface TemplateDraft {
  name: string;
  language: string;
  category: TemplateCategoryChoice;
  body: string;
  footer: string | null;
  examples: string[];
  button: { text: string; url: string } | null;
}

export type TemplateDraftCheck = { ok: true; value: TemplateDraft; warnings: string[] } | { ok: false; error: string };

/**
 * What Meta refuses at the wire, refused here in the person's words. The
 * warnings are things reviewers frown on but do not always reject.
 */
export function validateTemplateDraft(d: TemplateDraftInput): TemplateDraftCheck {
  const name = slugTemplateName(d.name);
  if (!name || !templateNameOk(name)) return { ok: false, error: "The name needs letters, digits or underscores." };
  if (!TEMPLATE_LANGUAGES.some((l) => l.id === d.language)) return { ok: false, error: "Pick a language from the list." };
  if (!(TEMPLATE_CATEGORIES as readonly string[]).includes(d.category)) return { ok: false, error: "A template is marketing or utility." };
  const body = String(d.body ?? "").replace(/\r\n/g, "\n").trim();
  if (!body) return { ok: false, error: "Write the message." };
  if (body.length > TEMPLATE_BODY_MAX) return { ok: false, error: `The message must be under ${TEMPLATE_BODY_MAX} characters.` };
  const slots = placeholdersOf(body);
  if (!placeholdersSequential(slots)) return { ok: false, error: "Number the values {{1}}, {{2}}, {{3}} in order, with no gaps." };
  const examples = (d.examples ?? []).map((e) => String(e ?? "").trim());
  if (examples.length !== slots.length) return { ok: false, error: slots.length === 0 ? "This message takes no values, so it needs no examples." : `Give one example for each of the ${slots.length} value${slots.length === 1 ? "" : "s"} — WhatsApp's reviewers read them.` };
  if (examples.some((e) => !e || e.length > TEMPLATE_EXAMPLE_MAX)) return { ok: false, error: `Every example needs words, under ${TEMPLATE_EXAMPLE_MAX} characters.` };
  const footer = d.footer ? String(d.footer).trim() : "";
  if (footer.length > TEMPLATE_FOOTER_MAX) return { ok: false, error: `The footer must be under ${TEMPLATE_FOOTER_MAX} characters.` };
  if (/\{\{/.test(footer)) return { ok: false, error: "The footer cannot take a value." };
  let button: TemplateDraft["button"] = null;
  if (d.button) {
    const text = String(d.button.text ?? "").replace(/\s+/g, " ").trim();
    const url = String(d.button.url ?? "").trim();
    if (!text) return { ok: false, error: "Give the button its words, or leave it out." };
    if (text.length > TEMPLATE_BUTTON_TEXT_MAX) return { ok: false, error: `A button's words must be under ${TEMPLATE_BUTTON_TEXT_MAX} characters.` };
    if (/\{\{/.test(text) || /\{\{/.test(url)) return { ok: false, error: "A button cannot take a value: Chanlytics sends the message and nothing else, and WhatsApp would refuse every send." };
    let parsed: URL | null = null;
    try { parsed = new URL(url); } catch { parsed = null; }
    if (!parsed || !/^https?:$/.test(parsed.protocol)) return { ok: false, error: "The button needs a web address to open, starting with https://." };
    button = { text, url };
  }
  const warnings: string[] = [];
  if (/^\s*\{\{\d+\}\}/.test(body) || /\{\{\d+\}\}\s*$/.test(body)) warnings.push("WhatsApp often rejects a message that starts or ends with a value; put words around it.");
  if (d.category === "marketing" && !/stop/i.test(body + " " + footer)) warnings.push("A marketing message should say how to opt out, such as “Reply STOP to opt out”.");
  if (/\n{3,}/.test(body)) warnings.push("More than one blank line in a row is usually rejected.");
  return { ok: true, value: { name, language: d.language, category: d.category as TemplateCategoryChoice, body, footer: footer || null, examples, button }, warnings };
}

/** The components Meta's create call takes, from a checked draft. */
export function templateComponents(v: TemplateDraft): Array<Record<string, unknown>> {
  const body: Record<string, unknown> = { type: "BODY", text: v.body };
  if (v.examples.length) body.example = { body_text: [v.examples] };
  const out: Array<Record<string, unknown>> = [body];
  if (v.footer) out.push({ type: "FOOTER", text: v.footer });
  // Meta's order: BODY, FOOTER, BUTTONS. A static URL button carries no
  // parameter, so a template with one sends exactly as `sendTemplate` sends
  // every other: the body alone.
  if (v.button) out.push({ type: "BUTTONS", buttons: [{ type: "URL", text: v.button.text, url: v.button.url }] });
  return out;
}

/* ---- What fills a slot ---- */

export const PARAM_SOURCES = ["text", "first_name", "business_name", "booking_link", "visit_when", "visit_service"] as const;
export type ParamSourceKind = (typeof PARAM_SOURCES)[number];

export type ParamSpec =
  | { kind: "text"; value: string }
  | { kind: "first_name" }
  | { kind: "business_name" }
  | { kind: "booking_link" }
  /** A visit playbook's own words: "tomorrow at 2:00 PM", and the service. */
  | { kind: "visit_when" }
  | { kind: "visit_service" };

export const PARAM_SOURCE_LABELS: Record<ParamSourceKind, string> = {
  text: "Type it",
  first_name: "Their first name",
  business_name: "The business name",
  booking_link: "The booking link",
  visit_when: "Their visit's time",
  visit_service: "Their visit's service",
};

/**
 * A slot's spec from what a route or a card was given: a plain string is
 * typed text; "@first_name" and the like are the sources; an object with a
 * kind is itself. Null means "not a spec".
 */
export function parseParamSpec(raw: unknown): ParamSpec | null {
  if (typeof raw === "string") {
    const m = /^@(first_name|business_name|booking_link|visit_when|visit_service)$/.exec(raw.trim());
    if (m) return { kind: m[1] as Exclude<ParamSourceKind, "text"> };
    return { kind: "text", value: raw };
  }
  if (raw && typeof raw === "object") {
    const o = raw as { kind?: unknown; value?: unknown };
    if (o.kind === "text") return typeof o.value === "string" ? { kind: "text", value: o.value } : null;
    if (o.kind === "first_name" || o.kind === "business_name" || o.kind === "booking_link" || o.kind === "visit_when" || o.kind === "visit_service") return { kind: o.kind };
  }
  return null;
}

/**
 * Every slot's spec from a stored row, leniently: a value nothing recognises
 * stays as typed text, so a row written before the specs were typed still
 * renders. The one reader for the four places that used to spell this out.
 */
export function parseParamSpecs(raw: unknown): ParamSpec[] {
  return Array.isArray(raw) ? (raw as unknown[]).map((p) => parseParamSpec(p) ?? { kind: "text" as const, value: String(p) }) : [];
}

export function paramLabel(spec: ParamSpec): string {
  return spec.kind === "text" ? spec.value : PARAM_SOURCE_LABELS[spec.kind].toLowerCase();
}

/**
 * The running playbooks that still send a template, as a refusal says it: "“Win-back” still sends this message.
 * Pause it, or give it another message, first." Deleting it would leave every later run skipped.
 */
export function playbooksStillSending(names: readonly string[]): string {
  const quoted = names.map((n) => `“${n}”`);
  if (quoted.length <= 1) return `${quoted[0] ?? "A playbook"} still uses this template. Pause it, or give it another, first.`;
  return `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]} still use this template. Pause them, or give them another, first.`;
}

export interface ParamFacts {
  firstName: string | null;
  businessName: string;
  bookingLink: string | null;
  /** A visit playbook's words for this person, resolved when the run was made; absent elsewhere. */
  visitWhen?: string | null;
  visitService?: string | null;
}

/** The first name a message may use, or null when all that is on file is a number. */
export function firstNameOf(displayName: string | null | undefined, waProfileName: string | null | undefined): string | null {
  const raw = (displayName || waProfileName || "").trim();
  if (!raw || /^[+\d(]/.test(raw)) return null;
  const first = raw.split(/\s+/)[0].replace(/[^\p{L}\p{M}'’-]/gu, "");
  return first ? first.slice(0, 30) : null;
}

/**
 * The words that go into the slots for one person. A first name nobody has
 * on file becomes "there" ("Hi there"); a booking link the workspace has not
 * set becomes empty, which the route refuses before any broadcast is made.
 */
export function resolveParams(specs: readonly ParamSpec[], f: ParamFacts): string[] {
  return specs.map((s) => {
    switch (s.kind) {
      case "text": return s.value;
      case "first_name": return f.firstName || "there";
      case "business_name": return f.businessName;
      case "booking_link": return f.bookingLink ?? "";
      case "visit_when": return f.visitWhen ?? "";
      case "visit_service": return f.visitService ?? "";
    }
  });
}

/** Example words for a preview: what a real person would see. */
export function exampleParams(specs: readonly ParamSpec[], businessName: string): string[] {
  return resolveParams(specs, { firstName: "Dani", businessName, bookingLink: "your booking link", visitWhen: "tomorrow at 2:00 PM", visitService: "a consultation" });
}

/* ------------------------------ what sends it ----------------------------- */

/**
 * What actually sends a template.
 *
 * Every send names its template: a playbook keeps `template_name`, a broadcast
 * keeps `template_name`, and the Inbox picks the booking one by rule
 * (`bookingTemplate`). So the answer to "which of my messages does anything"
 * was one join away and nobody made it -- a workspace could carry a message
 * written in WhatsApp Manager a year ago that nothing has ever sent, and the
 * page that lists every template was the one place that could not say so.
 *
 * Keyed by NAME rather than by row, because a template is one message in
 * several languages and the thing that sends it names the message.
 */
export interface TemplateUse {
  /**
   * The playbooks that send it, by the name the owner gave them: whether each is
   * paused, whether one of its runs is waiting on the owner, and its clock in
   * words ("runs daily at 10:00") when the source gave one.
   */
  playbooks: { id: string; name: string; paused: boolean; waiting: boolean; runs: string | null }[];
  /** How many broadcasts a PERSON sent with it; a playbook's runs are its own. */
  broadcasts: number;
  /** The latest of those broadcasts, newest first, by the names they were given: at most two. */
  recent: string[];
  /** The Inbox sends this one when somebody asks to book. */
  booking: boolean;
}

const NOTHING: TemplateUse = { playbooks: [], broadcasts: 0, recent: [], booking: false };

export interface TemplateUseSource {
  /** `runs` is the playbook's clock in words (playbooks.ts `runsWords`), worded by the caller. */
  playbooks: readonly { id: string; name: string; template_name: string; state?: string | null; runs?: string | null }[];
  /**
   * Every broadcast. A playbook's runs carry its id: they are not counted as broadcasts, but a
   * run `pending_approval` is how a playbook comes to be waiting on the owner.
   */
  broadcasts: readonly { template_name: string; playbook_id?: string | null; name?: string | null; state?: string | null; created_at?: string | null }[];
  /** The name the Inbox books with, from `bookingTemplate`; null when the workspace has none. */
  bookingName: string | null;
}

/** One entry per template name that anything sends. A name absent from the map is sent by nothing. */
export function templateUsage(src: TemplateUseSource): Record<string, TemplateUse> {
  const out: Record<string, TemplateUse> = {};
  const at = (name: string): TemplateUse => (out[name] ??= { playbooks: [], broadcasts: 0, recent: [], booking: false });
  const asking = new Set(src.broadcasts.filter((b) => b.playbook_id && b.state === "pending_approval").map((b) => b.playbook_id));
  for (const p of src.playbooks) {
    if (!p.template_name) continue;
    at(p.template_name).playbooks.push({ id: p.id, name: p.name, paused: p.state === "paused", waiting: asking.has(p.id), runs: p.runs ?? null });
  }
  // Newest first, so the two it names are the two a person remembers sending.
  const byHand = src.broadcasts.filter((b) => b.template_name && !b.playbook_id).slice().sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  for (const b of byHand) {
    const u = at(b.template_name);
    u.broadcasts += 1;
    if (b.name && u.recent.length < 2) u.recent.push(b.name);
  }
  if (src.bookingName) at(src.bookingName).booking = true;
  return out;
}

const sayList = (parts: string[]): string => (parts.length < 2 ? parts[0] ?? "" : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);
const capital = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/**
 * What sends it, in one line. "Nothing sends it" is the answer worth showing:
 * it is the only one that asks the owner to do something about the message. A
 * message that ONE playbook sends says "Win-back playbook", because under a
 * heading called "What sends it" a bare name reads as a person.
 */
export function templateUseWords(use: TemplateUse | null | undefined): string {
  const u = use ?? NOTHING;
  const parts: string[] = [];
  for (const p of u.playbooks) parts.push(p.paused ? `${p.name} (paused)` : p.name);
  if (u.broadcasts > 0) parts.push(`${u.broadcasts} broadcast${u.broadcasts === 1 ? "" : "s"}`);
  if (u.booking) parts.push("the Inbox");
  if (parts.length === 0) return "Nothing sends it";
  // One playbook alone is "Win-back playbook" even when paused: the line under it says so.
  if (parts.length === 1 && u.playbooks.length === 1) return `${u.playbooks[0]!.name} playbook`;
  return capital(sayList(parts));
}

/**
 * The line under what sends it: what that thing is doing. A run waiting on the
 * owner outranks everything; one playbook says its clock or that it is paused;
 * a message people send by hand names the latest two; the Inbox's says what it
 * is for. Null when the first line already said all there is.
 */
export function templateUseNote(use: TemplateUse | null | undefined): string | null {
  const u = use ?? NOTHING;
  if (u.playbooks.some((p) => p.waiting)) return "a run is waiting on you";
  if (u.playbooks.length === 1) return u.playbooks[0]!.paused ? "paused — nothing goes out" : u.playbooks[0]!.runs;
  if (u.playbooks.length > 1) return u.playbooks.every((p) => p.paused) ? "all paused — nothing goes out" : null;
  if (u.recent.length > 0) return u.broadcasts > u.recent.length ? `${u.recent.join(", ")} and ${u.broadcasts - u.recent.length} more` : u.recent.join(", ");
  if (u.booking) return "what the receptionist sends to book";
  return null;
}

/** True when nothing sends it: the one state the page draws differently. */
export function templateUnused(use: TemplateUse | null | undefined): boolean {
  const u = use ?? NOTHING;
  return u.playbooks.length === 0 && u.broadcasts === 0 && !u.booking;
}

/* ------------------------------ what went out ----------------------------- */

/**
 * How many times a template actually went out, and when the latest did.
 *
 * Not a broadcast's `recipient_count`: that is the audience a run was scheduled
 * for, and the wire holds people back from it (no yes to offers, asked to stop,
 * no number, a person had the thread) while a run can stop part-way. Reports ›
 * Campaigns counts "Messages sent" apart from "Delivered" off the recipient rows
 * (campaign_series), and a Sent column summed from the audience would contradict
 * the page beside it. So this counts what that page counts -- a person a run
 * marked `sent` -- and the one door that page does not cover: a template the
 * Inbox sent into a thread whose window had closed, which left when WhatsApp
 * took it and the row got its wamid.
 *
 * Keyed by NAME, as `templateUsage` is: a run names its template, not a
 * language's row.
 */
export interface TemplateSends {
  /** Messages that left with it: sent, which is not delivered and not read. */
  count: number;
  /** When the latest of them left (ISO), or null when none kept its time. */
  lastAt: string | null;
}

export interface TemplateSendSource {
  /** Every broadcast -- one a person sent, or a playbook's run -- and the template it sent. */
  runs: readonly { id: string; template_name: string }[];
  /** The people on those runs (`broadcast_recipients`). Only the ones in state `sent` went out. */
  recipients: readonly { broadcast_id: string; state: string; sent_at: string | null }[];
  /** What the Inbox sent on a template (`messages.template_name`). Only the ones WhatsApp took -- a wamid -- went out. */
  inbox: readonly { template_name: string | null; external_id: string | null; created_at: string }[];
}

/** One entry per template name that has gone out. A name absent from the map never has. */
export function templateSends(src: TemplateSendSource): Record<string, TemplateSends> {
  const out: Record<string, TemplateSends> = {};
  const nameOf = new Map(src.runs.map((r) => [r.id, r.template_name]));
  const went = (name: string, at: string | null) => {
    const s = (out[name] ??= { count: 0, lastAt: null });
    s.count += 1;
    // As instants, not as text: two stamps in different offsets, or one with a
    // fraction of a second and one without, do not sort by their characters.
    const ms = at === null ? NaN : Date.parse(at);
    if (Number.isFinite(ms) && (s.lastAt === null || ms > Date.parse(s.lastAt))) s.lastAt = at;
  };
  for (const r of src.recipients) {
    const name = r.state === "sent" ? nameOf.get(r.broadcast_id) : undefined;
    if (name) went(name, r.sent_at);
  }
  for (const m of src.inbox) {
    if (m.template_name && m.external_id) went(m.template_name, m.created_at);
  }
  return out;
}

export interface TemplateSentWords {
  /** "1,204": how many went out; null when none has. */
  count: string | null;
  /** "2d ago", "Jul 31" or "Never sent"; null when none of them kept its time. */
  when: string | null;
}

/**
 * The Sent cell. How long ago is said the way every page says it (time.ts):
 * "just now" · "3h ago" · "2d ago", and past a week the business's date.
 * A message that never went out says so in words: a "0" in a column of counts
 * reads as a quantity to compare with the others, and never is not one.
 */
export function templateSentWords(s: TemplateSends | null | undefined, tz: string, nowMs: number): TemplateSentWords {
  if (!s || s.count === 0) return { count: null, when: "Never sent" };
  const at = s.lastAt === null ? NaN : Date.parse(s.lastAt);
  return {
    count: s.count.toLocaleString("en-US"),
    when: Number.isFinite(at) ? agoWords(at, nowMs, { date: (ms) => clockDate(ms, tz, nowMs) }) : null,
  };
}
