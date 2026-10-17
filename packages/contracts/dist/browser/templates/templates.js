import { clockDate } from "../shared/clock.js";
import { isIdentifierName } from "../conversations/thread-contact.js";
import { RUN_WAITING_WORDS } from "../shell/campaign-rooms.js";
import { agoWords } from "../shared/time.js";
import { isCount, recordOrNull } from "../shared/unknown.js";
import { WHATSAPP_LANGUAGES } from "./template-languages.js";
export const TEMPLATE_STATUS_WORDS = {
  approved: "Approved",
  pending: "In review",
  rejected: "Refused",
  paused: "Paused",
  disabled: "Disabled"
};
export const TEMPLATE_LANGUAGES = WHATSAPP_LANGUAGES;
export const TEMPLATE_CATEGORIES = ["marketing", "utility"];
export const TEMPLATE_BODY_MAX = 1024;
export const TEMPLATE_FOOTER_MAX = 60;
export const TEMPLATE_EXAMPLE_MAX = 100;
export const TEMPLATE_LABEL_MAX = 40;
const TEMPLATE_NAME_MAX = 60;
export const TEMPLATE_NAME_WORDS = "The name needs letters, digits or underscores.";
export const TEMPLATE_BODY_WORDS = `The message must be under ${TEMPLATE_BODY_MAX} characters.`;
export const TEMPLATE_SAME_NAME_WORDS = "A template with that name and language already exists. Pick another name.";
export const TEMPLATE_BUTTON_TEXT_MAX = 25;
const NAME = /^[a-z0-9_]{1,512}$/;
export function templateNameOk(name) {
  return NAME.test(name);
}
export function slugTemplateName(raw) {
  return String(raw ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, TEMPLATE_NAME_MAX).replace(/_+$/g, "");
}
const bodyAsReviewed = (body) => String(body ?? "").replace(/\r\n/g, "\n").trim();
export function templateBodyTooLong(body) {
  return bodyAsReviewed(body).length > TEMPLATE_BODY_MAX;
}
export function placeholdersOf(body) {
  const set = /* @__PURE__ */ new Set();
  for (const m of String(body ?? "").matchAll(/\{\{(\d+)\}\}/g)) set.add(Number(m[1]));
  return [...set].sort((a, b) => a - b);
}
export function placeholdersSequential(positions) {
  return positions.every((n, i) => n === i + 1);
}
export function validateTemplateDraft(d) {
  const name = slugTemplateName(d.name);
  if (!name || !templateNameOk(name)) return { ok: false, error: TEMPLATE_NAME_WORDS };
  if (!TEMPLATE_LANGUAGES.some((l) => l.id === d.language))
    return { ok: false, error: "Pick a language from the list." };
  if (!TEMPLATE_CATEGORIES.includes(d.category))
    return { ok: false, error: "A template is marketing or utility." };
  const body = bodyAsReviewed(d.body);
  if (!body) return { ok: false, error: "Write the message." };
  if (templateBodyTooLong(body)) return { ok: false, error: TEMPLATE_BODY_WORDS };
  const slots = placeholdersOf(body);
  if (!placeholdersSequential(slots))
    return { ok: false, error: "Number the values {{1}}, {{2}}, {{3}} in order, with no gaps." };
  const examples = (d.examples ?? []).map((e) => String(e ?? "").trim());
  if (examples.length !== slots.length)
    return {
      ok: false,
      error: slots.length === 0 ? "This message takes no values, so it needs no examples." : `Give one example for each of the ${slots.length} value${slots.length === 1 ? "" : "s"} \u2014 WhatsApp's reviewers read them.`
    };
  if (examples.some((e) => !e || e.length > TEMPLATE_EXAMPLE_MAX))
    return { ok: false, error: `Every example needs words, under ${TEMPLATE_EXAMPLE_MAX} characters.` };
  const footer = d.footer ? String(d.footer).trim() : "";
  if (footer.length > TEMPLATE_FOOTER_MAX)
    return { ok: false, error: `The footer must be under ${TEMPLATE_FOOTER_MAX} characters.` };
  if (/\{\{/.test(footer)) return { ok: false, error: "The footer cannot take a value." };
  let button = null;
  if (d.button) {
    const text = String(d.button.text ?? "").replace(/\s+/g, " ").trim();
    const url = String(d.button.url ?? "").trim();
    if (!text) return { ok: false, error: "Give the button its words, or leave it out." };
    if (text.length > TEMPLATE_BUTTON_TEXT_MAX)
      return { ok: false, error: `A button's words must be under ${TEMPLATE_BUTTON_TEXT_MAX} characters.` };
    if (/\{\{/.test(text) || /\{\{/.test(url))
      return {
        ok: false,
        error: "A button cannot take a value: Chanlytics sends the message and nothing else, and WhatsApp would refuse every send."
      };
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    if (!parsed || !/^https?:$/.test(parsed.protocol))
      return { ok: false, error: "The button needs a web address to open, starting with https://." };
    button = { text, url };
  }
  const warnings = [];
  if (/^\s*\{\{\d+\}\}/.test(body) || /\{\{\d+\}\}\s*$/.test(body))
    warnings.push("WhatsApp often rejects a message that starts or ends with a value; put words around it.");
  if (d.category === "marketing" && !/stop/i.test(body + " " + footer))
    warnings.push("A marketing message should say how to opt out, such as \u201CReply STOP to opt out\u201D.");
  if (/\n{3,}/.test(body)) warnings.push("More than one blank line in a row is usually rejected.");
  return {
    ok: true,
    value: {
      name,
      language: d.language,
      category: d.category,
      body,
      footer: footer || null,
      examples,
      button
    },
    warnings
  };
}
export function templateComponents(v) {
  const body = { type: "BODY", text: v.body };
  if (v.examples.length) body.example = { body_text: [v.examples] };
  const out = [body];
  if (v.footer) out.push({ type: "FOOTER", text: v.footer });
  if (v.button) out.push({ type: "BUTTONS", buttons: [{ type: "URL", text: v.button.text, url: v.button.url }] });
  return out;
}
export const PARAM_SOURCES = [
  "text",
  "first_name",
  "business_name",
  "booking_link",
  "review_link",
  "visit_when",
  "visit_service",
  "proposal_link"
];
export const PARAM_SOURCE_LABELS = {
  text: "Type it",
  first_name: "Their first name",
  business_name: "The business name",
  booking_link: "The booking link",
  review_link: "The review link",
  visit_when: "Their booked time",
  visit_service: "Their booked service",
  proposal_link: "Their proposal's link"
};
export const PARAM_SOURCE_HINTS = {
  first_name: "Each person's own \u2014 \u201Cthere\u201D when none is on file",
  business_name: "From Settings \u203A Business",
  booking_link: "From Settings \u203A Business",
  review_link: "From your Google listing",
  visit_when: "Each one's own, from the calendar",
  visit_service: "Each one's own, from the calendar",
  proposal_link: "Each proposal's own, from its deal"
};
export function parseParamSpec(raw) {
  if (typeof raw === "string") {
    const m = /^@(first_name|business_name|booking_link|review_link|visit_when|visit_service|proposal_link)$/.exec(
      raw.trim()
    );
    if (m) return { kind: m[1] };
    return { kind: "text", value: raw };
  }
  if (raw && typeof raw === "object") {
    const o = raw;
    if (o.kind === "text") return typeof o.value === "string" ? { kind: "text", value: o.value } : null;
    if (o.kind === "first_name" || o.kind === "business_name" || o.kind === "booking_link" || o.kind === "review_link" || o.kind === "visit_when" || o.kind === "visit_service" || o.kind === "proposal_link")
      return { kind: o.kind };
  }
  return null;
}
export function parseParamSpecs(raw) {
  return Array.isArray(raw) ? raw.map((p) => parseParamSpec(p) ?? { kind: "text", value: String(p) }) : [];
}
export function paramLabel(spec) {
  return spec.kind === "text" ? spec.value : PARAM_SOURCE_LABELS[spec.kind].toLowerCase();
}
export function paramSaid(spec) {
  return spec.kind === "text" ? `\u201C${spec.value}\u201D` : paramLabel(spec);
}
export function playbooksStillSending(names) {
  const quoted = names.map((n) => `\u201C${n}\u201D`);
  if (quoted.length <= 1)
    return `${quoted[0] ?? "A campaign"} still uses this template. Pause it, or give it another, first.`;
  return `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]} still use this template. Pause them, or give them another, first.`;
}
export function firstNameOf(displayName, waProfileName, name) {
  if (displayName && name) {
    if (name.source === "lead") return null;
    if ((name.source === "signature" || name.source === "wire") && !name.settled) return null;
  }
  const raw = (displayName || waProfileName || "").trim();
  if (!raw || isIdentifierName(raw)) return null;
  const first = raw.split(/\s+/)[0].replace(/[^\p{L}\p{M}'’-]/gu, "");
  return first ? first.slice(0, 30) : null;
}
export function resolveParams(specs, f) {
  return specs.map((s) => {
    switch (s.kind) {
      case "text":
        return s.value;
      case "first_name":
        return f.firstName || "there";
      case "business_name":
        return f.businessName;
      case "booking_link":
        return f.bookingLink ?? "";
      case "review_link":
        return f.reviewLink ?? "";
      case "visit_when":
        return f.visitWhen ?? "";
      case "visit_service":
        return f.visitService ?? "";
      case "proposal_link":
        return f.proposalLink ?? "";
    }
  });
}
const exampleFacts = (businessName) => ({
  businessName,
  bookingLink: "your booking link",
  reviewLink: "your review link",
  visitWhen: "tomorrow at 2:00 PM",
  visitService: "a consultation",
  proposalLink: "their proposal's link"
});
export function exampleParams(specs, businessName) {
  return resolveParams(specs, { firstName: "Dani", ...exampleFacts(businessName) });
}
export function exampleParamsFor(specs, businessName, firstName) {
  return resolveParams(specs, { firstName, ...exampleFacts(businessName) });
}
const NOTHING = { playbooks: [], broadcasts: 0, recent: [], booking: false };
export function templateUsage(src) {
  const out = {};
  const at = (name) => out[name] ??= { playbooks: [], broadcasts: 0, recent: [], booking: false };
  const asking = new Set(
    src.broadcasts.filter((b) => b.playbook_id && b.state === "pending_approval").map((b) => b.playbook_id)
  );
  for (const p of src.playbooks) {
    if (!p.template_name) continue;
    at(p.template_name).playbooks.push({
      id: p.id,
      name: p.name,
      paused: p.state === "paused",
      ended: p.ended === true,
      waiting: asking.has(p.id),
      runs: p.runs ?? null
    });
  }
  const byHand = src.broadcasts.filter((b) => !!b.template_name && !b.playbook_id).slice().sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  for (const b of byHand) {
    const u = at(b.template_name);
    u.broadcasts += 1;
    if (b.name && u.recent.length < 2) u.recent.push(b.name);
  }
  if (src.bookingName) at(src.bookingName).booking = true;
  return out;
}
const sayList = (parts) => parts.length < 2 ? parts[0] ?? "" : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
const capital = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
export function templateUseWords(use) {
  const u = use ?? NOTHING;
  const parts = [];
  for (const p of u.playbooks) parts.push(p.paused ? `${p.name} (paused)` : p.ended ? `${p.name} (ended)` : p.name);
  if (u.broadcasts > 0) parts.push(`${u.broadcasts} broadcast${u.broadcasts === 1 ? "" : "s"}`);
  if (u.booking) parts.push("the Inbox");
  if (parts.length === 0) return "Nothing sends it";
  if (parts.length === 1 && u.playbooks.length === 1) return `${u.playbooks[0].name} campaign`;
  return capital(sayList(parts));
}
export function templateUseNote(use) {
  const u = use ?? NOTHING;
  if (u.playbooks.some((p) => p.waiting)) return `a run is ${RUN_WAITING_WORDS.toLowerCase()}`;
  const [only] = u.playbooks;
  if (only && u.playbooks.length === 1)
    return only.paused ? "paused \u2014 nothing goes out" : only.ended ? "ended \u2014 nothing more goes out" : only.runs;
  if (u.playbooks.length > 1)
    return u.playbooks.every((p) => p.paused) ? "all paused \u2014 nothing goes out" : u.playbooks.every((p) => p.paused || p.ended) ? "none runs \u2014 nothing goes out" : null;
  if (u.recent.length > 0)
    return u.broadcasts > u.recent.length ? `${u.recent.join(", ")} and ${u.broadcasts - u.recent.length} more` : u.recent.join(", ");
  if (u.booking) return "what the receptionist sends to book";
  return null;
}
export function templateUnused(use) {
  const u = use ?? NOTHING;
  return u.playbooks.length === 0 && u.broadcasts === 0 && !u.booking;
}
export function templateSends(src) {
  const out = {};
  const nameOf = new Map(src.runs.map((r) => [r.id, r.template_name]));
  const went = (name, at) => {
    const s = out[name] ??= { count: 0, lastAt: null };
    s.count += 1;
    const ms = at === null ? NaN : Date.parse(at);
    if (Number.isFinite(ms) && (s.lastAt === null || ms > Date.parse(s.lastAt))) s.lastAt = at;
  };
  for (const r of src.recipients) {
    const name = r.state === "sent" ? nameOf.get(r.broadcast_id) : void 0;
    if (name) went(name, r.sent_at);
  }
  for (const m of src.inbox) {
    if (m.template_name && m.external_id) went(m.template_name, m.created_at);
  }
  return out;
}
export function templateSendsOf(answer) {
  const byName = recordOrNull(answer);
  if (!byName) return null;
  const out = {};
  for (const [name, raw] of Object.entries(byName)) {
    const s = recordOrNull(raw);
    if (!s || !isCount(s.count) || !(s.last_at === null || typeof s.last_at === "string")) return null;
    out[name] = { count: s.count, lastAt: s.last_at };
  }
  return out;
}
export function templateSentWords(s, tz, nowMs) {
  if (!s || s.count === 0) return { count: null, when: "Never sent" };
  const at = s.lastAt === null ? NaN : Date.parse(s.lastAt);
  return {
    count: s.count.toLocaleString("en-US"),
    when: Number.isFinite(at) ? agoWords(at, nowMs, { date: (ms) => clockDate(ms, tz, nowMs) }) : null
  };
}
