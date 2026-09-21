/**
 * The starter set: five WhatsApp templates written for the moments
 * Chanlytics acts on — a win-back, a welcome, save our number, the month's
 * offer, a quick note — in English and Spanish, with the slots the wire
 * fills per person. Meta approves the words; a workspace adds the set with
 * one click, the playbooks pick from it, and a broadcast starts from it.
 *
 * Every entry passes the same check a template written by hand passes, with
 * no warnings (a test holds it to that), so what a new workspace gets is a
 * set WhatsApp is expected to approve, not a set that needs fixing first.
 * Titles are for people; names are what Meta and the wire use.
 */
import { purposeOfTemplate } from "./consent";
import { WHATSAPP_LANGUAGES, languageLabel, languageName, templateLanguage, type TemplateLanguage } from "./template-languages";
import type { ParamSpec } from "./templates";
import type { PlaybookTrigger } from "./playbooks";

export type StarterSlotKind = "first_name" | "business_name" | "booking_link" | "visit_when" | "visit_service" | "text";

export interface StarterSlot {
  kind: StarterSlotKind;
  /** The words a person sees for the slot. */
  label: string;
  /** What WhatsApp's reviewers read; also the preview's words. */
  example: string;
}

export interface StarterText {
  body: string;
  footer: string | null;
  slots: StarterSlot[];
}

export interface StarterTemplate {
  key: string;
  /** Meta's name: lowercase, digits, underscores. Same as the key. */
  name: string;
  title: string;
  /** One line on when it is for. */
  purpose: string;
  category: "marketing" | "utility";
  /** The playbook trigger it is written for, when there is one. */
  trigger: PlaybookTrigger | null;
  texts: Record<string, StarterText>;
}

export const STARTER_LANGUAGES = [
  { id: "en_US", label: "English" },
  { id: "es", label: "Spanish" },
] as const;

const FIRST = { kind: "first_name" as const, label: "First name", example: "Dani" };
const BUSINESS = { kind: "business_name" as const, label: "Business name", example: "Luna Studio" };
const LINK = { kind: "booking_link" as const, label: "Booking link", example: "https://booksy.com/luna-studio" };
const FIRST_ES = { ...FIRST, label: "Nombre" };
const BUSINESS_ES = { ...BUSINESS, label: "Nombre del negocio" };
const LINK_ES = { ...LINK, label: "Enlace de reservas" };
const WHEN = { kind: "visit_when" as const, label: "When", example: "tomorrow at 2:00 PM" };
const SERVICE = { kind: "visit_service" as const, label: "Service", example: "a consultation" };
const WHEN_ES = { ...WHEN, label: "Cuándo", example: "mañana a las 2:00 PM" };
const SERVICE_ES = { ...SERVICE, label: "Servicio", example: "una consulta" };
const STOP_EN = "Reply STOP to opt out";
const STOP_ES = "Responde STOP para darte de baja";

export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  {
    key: "winback_offer",
    name: "winback_offer",
    title: "Win-back",
    purpose: "for anyone quiet 30 days",
    category: "marketing",
    trigger: "quiet_30",
    texts: {
      en_US: {
        body: "Hi {{1}}, it's been a while since we last saw you at {{2}}. We'd love to have you back — pick a time that suits you here: {{3}} and we'll take care of the rest.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, LINK],
      },
      es: {
        body: "Hola {{1}}, hace tiempo que no te vemos en {{2}}. Nos encantaría volver a atenderte — elige la hora que mejor te venga aquí: {{3}} y nosotros nos ocupamos del resto.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES],
      },
    },
  },
  {
    key: "welcome_new",
    name: "welcome_new",
    title: "Welcome",
    purpose: "for anyone new this week",
    category: "marketing",
    trigger: "new_week",
    texts: {
      en_US: {
        body: "Hi {{1}}, welcome to {{2}}! This is our WhatsApp — message us here any time to book, move or ask about an appointment. Book whenever you're ready: {{3}} and we'll take it from there.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, LINK],
      },
      es: {
        body: "Hola {{1}}, ¡bienvenido/a a {{2}}! Este es nuestro WhatsApp — escríbenos aquí cuando quieras para reservar, cambiar o preguntar por una cita. Reserva cuando quieras: {{3}} y nosotros nos encargamos del resto.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES],
      },
    },
  },
  {
    key: "save_our_number",
    name: "save_our_number",
    title: "Save our number",
    purpose: "for anyone who only ever phoned",
    category: "marketing",
    trigger: "phoned_only",
    texts: {
      en_US: {
        body: "Hi {{1}}, thanks for calling {{2}}. Save this number — on WhatsApp you can book, reschedule or ask us anything in a message, and we answer fast. Book any time: {{3}} or just write to us here.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, LINK],
      },
      es: {
        body: "Hola {{1}}, gracias por llamar a {{2}}. Guarda este número — por WhatsApp puedes reservar, cambiar tu cita o preguntarnos lo que quieras, y respondemos rápido. Reserva cuando quieras: {{3}} o escríbenos aquí.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES],
      },
    },
  },
  {
    key: "monthly_offer",
    name: "monthly_offer",
    title: "This month's offer",
    purpose: "for everyone who said yes, once a month",
    category: "marketing",
    trigger: "everyone_monthly",
    texts: {
      en_US: {
        body: "Hi {{1}}, this month at {{2}}: {{3}} Book here: {{4}} — spaces are limited.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, { kind: "text", label: "The offer", example: "20% off any service booked before Friday." }, LINK],
      },
      es: {
        body: "Hola {{1}}, este mes en {{2}}: {{3}} Reserva aquí: {{4}} — las plazas son limitadas.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, { kind: "text", label: "La oferta", example: "20% de descuento en cualquier servicio reservado antes del viernes." }, LINK_ES],
      },
    },
  },
  {
    key: "visit_reminder",
    name: "visit_reminder",
    title: "Visit reminder",
    purpose: "for the day before an appointment",
    category: "utility",
    trigger: "visit_tomorrow",
    texts: {
      en_US: {
        body: "Hi {{1}}, it's {{2}}. A reminder of your appointment {{3}} for {{4}}. If you need to change it, just reply here.",
        footer: null,
        slots: [FIRST, BUSINESS, WHEN, SERVICE],
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}. Te recordamos tu cita {{3}} para {{4}}. Si necesitas cambiarla, responde aquí.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, WHEN_ES, SERVICE_ES],
      },
    },
  },
  {
    key: "after_visit",
    name: "after_visit",
    title: "After the visit",
    purpose: "for the day after a visit",
    category: "marketing",
    trigger: "visited",
    texts: {
      en_US: {
        body: "Hi {{1}}, thank you for coming to {{2}} yesterday — we hope you love the result. When you're ready for your next visit, pick a time here: {{3}}.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, LINK],
      },
      es: {
        body: "Hola {{1}}, gracias por venir ayer a {{2}} — esperamos que te encante el resultado. Cuando quieras tu próxima cita, elige la hora aquí: {{3}}.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES],
      },
    },
  },
  {
    key: "quick_note",
    name: "quick_note",
    title: "A quick note",
    purpose: "for any broadcast: news, hours, a heads-up",
    category: "marketing",
    trigger: null,
    texts: {
      en_US: {
        body: "Hi {{1}}, a quick note from {{2}}: {{3}} Write back here if you have any questions.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, { kind: "text", label: "The note", example: "we're open late on Thursdays this month." }],
      },
      es: {
        body: "Hola {{1}}, una nota rápida de {{2}}: {{3}} Escríbenos aquí si tienes alguna pregunta.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, { kind: "text", label: "La nota", example: "este mes abrimos hasta tarde los jueves." }],
      },
    },
  },
  {
    // The one a caller asks for OUT LOUD, mid-call: the phone agent texts it
    // when somebody wants to book (edge retell-fn.ts).
    //
    // UTILITY, and that is the whole point of writing it down here. It answers
    // a request the person just made, so it needs no separate yes to offers --
    // and because the category is Meta's own word for that, purposeOfTemplate
    // reads it correctly and nothing has to override the purpose at a call
    // site. The row this replaces was hand-written straight into one
    // workspace's database, marked approved, with no meta_id: an approval Meta
    // had never given, so every send of it failed, and it failed for every
    // other workspace by not existing at all.
    key: "booking_link",
    name: "booking_link",
    title: "Booking link",
    purpose: "for a caller who asks to book",
    category: "utility",
    trigger: null,
    texts: {
      en_US: {
        // The first name every starter opens with, and here it is usually
        // "there": the phone agent texts somebody whose name nobody has yet,
        // and resolveParams says so rather than leaving a gap.
        body: "Hi {{1}}, it's {{2}}. Here's the link to book your appointment: {{3}} — pick any time that suits you.",
        footer: null,
        slots: [FIRST, BUSINESS, LINK],
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}. Aquí tienes el enlace para reservar tu cita: {{3}} — elige la hora que mejor te venga.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES],
      },
    },
  },
];

export function starterByName(name: string | null | undefined): StarterTemplate | null {
  return STARTER_TEMPLATES.find((s) => s.name === name) ?? null;
}

export function starterByKey(key: string): StarterTemplate | null {
  return STARTER_TEMPLATES.find((s) => s.key === key) ?? null;
}

export function starterForTrigger(trigger: string | null | undefined): StarterTemplate | null {
  if (!trigger) return null;
  return STARTER_TEMPLATES.find((s) => s.trigger === trigger) ?? null;
}

/** The text in a language, English when the language is not written. */
export function starterText(s: StarterTemplate, language: string): StarterText {
  return s.texts[language] ?? s.texts.en_US;
}

/** What the submit route takes: the same shape a template written by hand has. */
export function starterDraft(s: StarterTemplate, language: string): { name: string; language: string; category: string; body: string; footer: string | null; examples: string[] } {
  const t = starterText(s, language);
  return { name: s.name, language, category: s.category, body: t.body, footer: t.footer, examples: t.slots.map((x) => x.example) };
}

function fill(body: string, values: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (m, n) => values[Number(n) - 1] ?? m);
}

/** What a business says about itself, for the slots that name it. */
export interface OwnFacts {
  business_name?: string | null;
  booking_link?: string | null;
}

/** The slots that name the business, and what a blank one is called when there is no label of its own. */
const OWN_SLOT_LABEL: ReadonlyMap<string, string> = new Map([["business_name", "Business name"], ["booking_link", "Booking link"]]);

/**
 * A slot's words for a customer's eyes. A slot that names the business takes
 * its own name or booking link, and one the business has not given yet is a
 * blank to fill, "[Booking link]" -- never the sample filed with Meta: a
 * starter's "Luna Studio" and its booksy link read as a real business's real
 * link. Any other slot shows its example; "Dani" is plainly a sample customer.
 */
function slotWords(kind: string | undefined, label: string, example: string | null, own: OwnFacts): string | null {
  if (kind && OWN_SLOT_LABEL.has(kind)) {
    const given = own[kind as keyof OwnFacts];
    return typeof given === "string" && given.trim() ? given : `[${label}]`;
  }
  return example;
}

/**
 * One filled value per slot, in order -- the words alone, before they are put
 * back into the body. A preview that draws the message as a chat marks what
 * fills per person, and it cannot mark anything once the values have been
 * substituted into a string, so the values are decided here and the two
 * preview functions below are the same thing joined up.
 */
export function starterPreviewValues(s: StarterTemplate, language: string, businessName?: string | null, bookingLink?: string | null): string[] {
  const t = starterText(s, language);
  const own: OwnFacts = { business_name: businessName, booking_link: bookingLink };
  return t.slots.map((x) => slotWords(x.kind, x.label, x.example, own) ?? x.example);
}

/** The message as a customer would read it: the business's own name and booking link, and a blank for what it has not given. */
export function starterPreview(s: StarterTemplate, language: string, businessName?: string | null, bookingLink?: string | null): string {
  return fill(starterText(s, language).body, starterPreviewValues(s, language, businessName, bookingLink));
}

/**
 * A saved template as a customer would read it, from the row as the sync keeps
 * it: a position, a label, the example filed with Meta -- and no kind. The kind
 * is a starter's own, known by its name, else a guess from the label and the
 * example (defaultSlotKinds), and the words follow slotWords. A slot with
 * nothing to show stays a slot.
 */
export function templatePreviewValues(t: { name: string; language?: string | null; body_preview: string | null; variables: unknown }, own: OwnFacts = {}): string[] {
  const vars = Array.isArray(t.variables) ? (t.variables as VariableLike[]) : [];
  const kinds = defaultSlotKinds(t);
  const labels = slotLabels(t);
  const values: string[] = [];
  vars.forEach((v, i) => {
    const at = typeof v?.position === "number" && v.position >= 1 ? v.position - 1 : i;
    const kind = kinds[i];
    const label = labels[i] && !/^Value [0-9]+$/.test(labels[i]) ? labels[i] : OWN_SLOT_LABEL.get(kind) ?? `Value ${at + 1}`;
    const words = slotWords(kind, label, typeof v?.example === "string" && v.example ? v.example : null, own);
    if (words !== null) values[at] = words;
  });
  return values;
}

export function templatePreview(t: { name: string; language?: string | null; body_preview: string | null; variables: unknown }, own: OwnFacts = {}): string {
  return fill(String(t.body_preview ?? ""), templatePreviewValues(t, own));
}

/**
 * The line under a message's words, from the components Meta holds.
 *
 * `templates.components` has carried Meta's own component array since 00045 --
 * the sync writes `t.components` straight through (edge meta-templates.ts
 * templateRow) and a template written here is submitted with the array
 * `templateComponents` builds, FOOTER included. So the footer has been STORED
 * all along and simply never read back: the three composers resolved one only
 * through `starterByName`, i.e. only for the five starters whose footers are
 * hard-coded below. A template a workspace wrote showed "Reply STOP to opt out"
 * while it was being drafted and nowhere afterwards.
 *
 * This is the same shape the edge's `bodyOf` reads for the body.
 */
export function footerOf(components: unknown): string | null {
  if (!Array.isArray(components)) return null;
  for (const c of components) {
    if (!c || typeof c !== "object") continue;
    const part = c as { type?: unknown; text?: unknown };
    if (String(part.type ?? "").toUpperCase() !== "FOOTER") continue;
    const text = typeof part.text === "string" ? part.text.trim() : "";
    if (text) return text;
  }
  return null;
}

/**
 * A row's footer: the one Meta holds, else the starter's own.
 *
 * The fallback matters for a workspace that added the starter set before the
 * read existed -- its rows carry components, but a row written by hand or by an
 * older webhook may not, and the library still knows what that message says.
 */
export function templateFooter(t: { name: string; language?: string | null; components?: unknown; footer?: string | null }): string | null {
  if (typeof t.footer === "string" && t.footer.trim()) return t.footer.trim();
  const stored = footerOf(t.components);
  if (stored) return stored;
  const s = starterByName(t.name);
  return s ? starterText(s, t.language ?? "en_US").footer ?? null : null;
}

/* ---- What a message is made of, and whether this product can send it ---- */

export interface TemplateButton {
  /** What the button says. */
  text: string;
  /** url: opens a link · reply: sends the words back · call: dials a number. */
  kind: "url" | "reply" | "call";
}

export interface TemplateParts {
  /** A text heading above the words; null when there is none, or it is a picture. */
  header: string | null;
  /** The line under the words. */
  footer: string | null;
  /** The buttons under the message, in Meta's order. */
  buttons: TemplateButton[];
}

const partOf = (components: unknown, type: string): Record<string, unknown> | null => {
  if (!Array.isArray(components)) return null;
  for (const c of components) {
    if (c && typeof c === "object" && String((c as { type?: unknown }).type ?? "").toUpperCase() === type) return c as Record<string, unknown>;
  }
  return null;
};
const textOf = (part: Record<string, unknown> | null): string | null => {
  const t = part && typeof part.text === "string" ? part.text.trim() : "";
  return t || null;
};
const BUTTON_KIND: Record<string, TemplateButton["kind"]> = { URL: "url", QUICK_REPLY: "reply", PHONE_NUMBER: "call" };

/**
 * The message as the customer receives it, from the components Meta holds.
 *
 * `body_preview` is the BODY component alone (edge `bodyOf`), so a template with
 * a heading or buttons was drawn as its words and nothing else -- the operator
 * never saw the "Book now" button the customer taps, which for an appointment
 * business is the whole point of the message.
 */
export function templateParts(components: unknown): TemplateParts {
  const header = partOf(components, "HEADER");
  const buttons: TemplateButton[] = [];
  const holder = partOf(components, "BUTTONS");
  const list = holder && Array.isArray(holder.buttons) ? (holder.buttons as unknown[]) : [];
  for (const b of list) {
    if (!b || typeof b !== "object") continue;
    const kind = BUTTON_KIND[String((b as { type?: unknown }).type ?? "").toUpperCase()];
    const text = typeof (b as { text?: unknown }).text === "string" ? (b as { text: string }).text.trim() : "";
    if (kind && text) buttons.push({ text, kind });
  }
  return {
    // A picture heading is not words and is not drawn as any.
    header: header && String(header.format ?? "TEXT").toUpperCase() === "TEXT" ? textOf(header) : null,
    footer: footerOf(components),
    buttons,
  };
}

/**
 * Why this product cannot send a template, in the owner's words; null when it can.
 *
 * `sendTemplate` (packages/channels/src/whatsapp.ts) puts ONE component on the
 * wire -- `{ type: "body", parameters }` -- and `variablesOf` counts only the
 * BODY's `{{n}}`. So a template whose heading is a picture, or which takes a
 * value anywhere outside its body, is offered by the composers as an ordinary
 * choice, passes their "every slot filled" check, enrols its recipients, and is
 * then refused BY META FOR EVERY ONE of them on a parameter mismatch -- leaving
 * an owner looking at a broadcast that delivered to nobody, with no reason given.
 *
 * The composers ask this first and leave those templates out, the way
 * `inboxTemplates` leaves out the ones whose slots the Inbox cannot fill.
 */
export function templateBlocked(t: { blocked?: string | null; components?: unknown }): string | null {
  // The route works this out where the row still has its components and sends
  // the ANSWER, so the browser never gets Meta's array. A row that carries the
  // answer is believed; only a row that has components and no answer is judged
  // here. Deriving unconditionally read `undefined` on every client row and
  // passed every template -- which is the defect this function exists to stop.
  if (typeof t.blocked === "string") return t.blocked.trim() || null;
  if (t.blocked === null) return null;
  const components = t.components;
  if (!Array.isArray(components)) return null;
  const header = partOf(components, "HEADER");
  if (header) {
    const format = String(header.format ?? "TEXT").toUpperCase();
    if (format !== "TEXT") return format === "IMAGE" ? "a picture for a heading" : `a ${format.toLowerCase()} for a heading`;
    if (/\{\{\d+\}\}/.test(String(header.text ?? ""))) return "a heading that takes a value";
  }
  const holder = partOf(components, "BUTTONS");
  const list = holder && Array.isArray(holder.buttons) ? (holder.buttons as unknown[]) : [];
  for (const b of list) {
    if (!b || typeof b !== "object") continue;
    const button = b as { type?: unknown; url?: unknown };
    const type = String(button.type ?? "").toUpperCase();
    if (!(type in BUTTON_KIND)) return "a button Chanlytics cannot fill";
    if (type === "URL" && /\{\{\d+\}\}/.test(String(button.url ?? ""))) return "a button that takes a value";
  }
  return null;
}

/** "one has a picture for a heading, two have a button that takes a value" */
const COUNT_WORDS = ["", "one", "two", "three", "four", "five"];
function blockedWords(reasons: readonly string[]): string {
  const seen = new Map<string, number>();
  for (const r of reasons) seen.set(r, (seen.get(r) ?? 0) + 1);
  const parts = [...seen].map(([reason, n]) => `${COUNT_WORDS[n] ?? n} ${n === 1 ? "has" : "have"} ${reason}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
}

/** The templates a composer may offer, and one sentence for the ones it may not. */
export function sendableTemplates<T extends { components?: unknown }>(list: readonly T[]): { sendable: T[]; blocked: T[]; why: string | null } {
  const sendable: T[] = [];
  const blocked: T[] = [];
  for (const t of list) (templateBlocked(t) ? blocked : sendable).push(t);
  if (blocked.length === 0) return { sendable, blocked, why: null };
  const n = blocked.length;
  const reasons = blocked.map((t) => templateBlocked(t) as string);
  // One message says what IT has; several are counted by reason.
  const words = n === 1 ? `it has ${reasons[0]}` : blockedWords(reasons);
  const many = COUNT_WORDS[n] ?? String(n);
  const lead = n === 1 ? "One of your messages" : `${many[0].toUpperCase()}${many.slice(1)} of your messages`;
  return {
    sendable,
    blocked,
    why: `${lead} can't go out from here — ${words}. ${n === 1 ? "It still works" : "They still work"} in WhatsApp Manager.`,
  };
}

export const TEMPLATE_TITLE_MAX = 60;

/**
 * Words for people: the title the workspace gave it, else the starter's,
 * else the name made words — a trailing version (_v1) is not a word.
 */
export function templateTitle(name: string | null | undefined, title?: string | null): string {
  const given = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
  if (given) return given.slice(0, TEMPLATE_TITLE_MAX);
  const s = starterByName(name);
  if (s) return s.title;
  const words = String(name ?? "").replace(/_v\d+$/i, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : String(name ?? "");
}

/**
 * A language code as people read it: "en_US" is "English", "es" is "Spanish";
 * the code itself where nothing can say. WhatsApp's own list first
 * (template-languages.ts), so the word a send names is the word the picker
 * offered.
 */
export function languageWords(code: string): string {
  return languageName(code);
}

/** An approved template as the Inbox composer is given it (GET templates). */
export interface InboxTemplateLike {
  id: string;
  name: string;
  language: string;
  category?: string | null;
  variables?: unknown;
  title?: string | null;
}

/**
 * The approved templates the Inbox can send to one person, in the owner's words, and why the rest are not offered.
 * The reply route fills a template's own slots and turns away one with words to write (slotToWrite, I6), and sends
 * a promotion only to someone who said yes to offers (core reply.ts), so the composer offered templates it would
 * refuse: a button whose only outcome was a refusal (I4). The same two judgements, asked before anything is pressed.
 */
export function inboxTemplates<T extends InboxTemplateLike>(
  templates: readonly T[],
  to: { who: string; offersOk: boolean },
): { sendable: Array<{ template: T; title: string; label: string }>; hidden: string | null } {
  const sendable: Array<{ template: T; title: string; label: string }> = [];
  let promotions = 0;
  let unfillable = 0;
  for (const t of templates) {
    // The reply route's own reading of the slots: words to write are what the Inbox does not ask for. It counted
    // slots, and turned away any template with other than two -- the workspace's starters among them (I6).
    if (slotToWrite(t)) { unfillable += 1; continue; }
    if (purposeOfTemplate(t.category) === "marketing" && !to.offersOk) { promotions += 1; continue; }
    const title = templateTitle(t.name, t.title);
    sendable.push({ template: t, title, label: `${title} · ${languageWords(t.language)}` });
  }
  const held = [
    promotions ? `${promotions} promotion${promotions === 1 ? "" : "s"} (${to.who} hasn't said yes to offers)` : "",
    unfillable ? `${unfillable} that ${unfillable === 1 ? "needs" : "need"} words the Inbox doesn't ask for` : "",
  ].filter(Boolean);
  return { sendable, hidden: held.length ? `Not offered: ${held.join(" and ")}.` : null };
}

/**
 * What a slot most likely takes, from the label Meta or a person gave it and
 * the example beside it. Only a guess for templates written elsewhere; a
 * starter's slots are known.
 */
export function guessSlotKind(label: string | null | undefined, example?: string | null): StarterSlotKind {
  const l = String(label ?? "").toLowerCase();
  const e = String(example ?? "").toLowerCase();
  if (/link|url|book/.test(l) || /^https?:\/\//.test(e) || /booksy|calendly|square|fresha|\.com\//.test(e)) return "booking_link";
  if (/business|salon|company|shop|studio|clinic|brand|negocio/.test(l)) return "business_name"; // trade-word: a label naming the business, in whatever word a trade uses
  if (/first name|^name$|nombre|customer|client/.test(l)) return "first_name";
  return "text";
}

interface VariableLike {
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
  return vars.map((v) => guessSlotKind(typeof v?.label === "string" ? v.label : null, typeof v?.example === "string" ? v.example : null));
}

/** The specs a run or a broadcast would send with, from the default kinds — typed text stays empty for the person to fill. */
export function defaultParamSpecs(t: { name: string; variables: unknown }): ParamSpec[] {
  return defaultSlotKinds(t).map((k) => (k === "text" ? { kind: "text", value: "" } : { kind: k }));
}

/* ---- Where a template sits, what a composer opens on, what a slot is called ---- */

/** A starter's place in the library's order; everything else after. */
export function starterIndex(name: string | null | undefined): number {
  const i = STARTER_TEMPLATES.findIndex((s) => s.name === name);
  return i === -1 ? STARTER_TEMPLATES.length : i;
}

/**
 * Starters in the library's order, then templates written here, then the
 * rest — marketing before utility, then by name. What a composer most
 * often needs is nearest.
 */
export function compareTemplates(
  a: { name: string; category?: string | null; source?: string | null; language?: string | null },
  b: { name: string; category?: string | null; source?: string | null; language?: string | null },
): number {
  const ai = starterIndex(a.name);
  const bi = starterIndex(b.name);
  if (ai !== bi) return ai - bi;
  const rank = (t: { category?: string | null; source?: string | null }) => (t.source === "chanlytics" ? 0 : 2) + (t.category === "utility" ? 1 : 0);
  // Language last, so the order is TOTAL. Templates are one row per (name,
  // language): without this the rows of one name came back in whatever order
  // the query gave them, which is also the order `defaultTemplate` picked from.
  return rank(a) - rank(b) || a.name.localeCompare(b.name) || String(a.language ?? "").localeCompare(String(b.language ?? ""));
}

/**
 * The template a composer opens on: the trigger's starter, the quick note for a
 * broadcast, else the first.
 *
 * It used to `find` on the list AS GIVEN, so a workspace holding a starter in
 * two languages opened on whichever row the query happened to return first --
 * a different language on a different load, from a picker that drew the two
 * rows identically. The sort decides it now, and it is a total order.
 */
export function defaultTemplate<T extends { name: string; category?: string | null; source?: string | null; language?: string | null }>(list: readonly T[], trigger: string | null): T | null {
  const s = trigger ? starterForTrigger(trigger) : starterByKey("quick_note");
  const sorted = list.slice().sort(compareTemplates);
  return (s ? sorted.find((t) => t.name === s.name) : undefined) ?? sorted[0] ?? null;
}

/**
 * The languages of a set of rows, each with the words a person reads.
 *
 * `languageWords` strips the region, so "en_US" and "en" both read "English" --
 * and a workspace holding both would see one chip offering the same word twice.
 * Where two codes would read alike, each says its place as WhatsApp's list
 * spells it ("English" beside "English (US)"), or its own code where the list
 * does not know it; where they do not, the word stands alone.
 */
export function languageLabels(codes: readonly string[]): Record<string, string> {
  const seen = new Map<string, number>();
  for (const c of codes) {
    const w = languageWords(c);
    seen.set(w, (seen.get(w) ?? 0) + 1);
  }
  const out: Record<string, string> = {};
  for (const c of codes) {
    const w = languageWords(c);
    out[c] = (seen.get(w) ?? 0) > 1 ? (templateLanguage(c) ? languageLabel(c) : `${w} (${c})`) : w;
  }
  return out;
}

/* ---- A message's languages, as its one picker offers them ---- */

export type LanguageGroup = "on" | "ready" | "add";

/** The picker's headings: what WhatsApp holds, what the library has written, what Chanlytics can write. */
export const LANGUAGE_GROUP_WORDS: Readonly<Record<LanguageGroup, string>> = {
  on: "On WhatsApp",
  ready: "Ready to add",
  add: "Translate into",
};

export interface LanguageChoice extends TemplateLanguage {
  group: LanguageGroup;
  /**
   * Its status at WhatsApp, drawn as the glyph: a status for a language on
   * file, null for one the library has written and WhatsApp has never seen.
   * Absent for a language nobody has written yet, which has nothing to draw.
   */
  status?: string | null;
}

/**
 * Every language a message can be read in or given, as its picker lists them.
 *
 * A row per language used to sit on the message's line -- "EN ES" -- a slot
 * for each language the workspace answered in, so a page of sixteen messages
 * was sixteen pairs of letters, and a seventh language would have been a
 * seventh column. One chip says the language in view; this is what it opens:
 *
 *   on     the languages WhatsApp holds, each with its status
 *   ready  the ones the starter library has written that the workspace never added
 *   add    every other language WhatsApp takes, when the owner may add one and
 *          Chanlytics can carry the message whole (templateUntranslatable)
 *
 * A code WhatsApp does not list -- a row synced from elsewhere -- is still the
 * message's, and is offered under its own code.
 */
export function messageLanguageChoices(input: {
  onFile: readonly { language: string; meta_status?: string | null }[];
  ready?: readonly string[];
  canAdd?: boolean;
}): LanguageChoice[] {
  const seen = new Set<string>();
  const out: LanguageChoice[] = [];
  const known = (code: string): TemplateLanguage => templateLanguage(code) ?? { id: code, label: languageLabel(code), name: languageName(code), region: null, native: languageLabel(code) };
  for (const r of input.onFile) {
    if (seen.has(r.language)) continue;
    seen.add(r.language);
    out.push({ ...known(r.language), id: r.language, group: "on", status: r.meta_status ?? "approved" });
  }
  for (const code of input.ready ?? []) {
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ ...known(code), id: code, group: "ready", status: null });
  }
  if (input.canAdd) {
    for (const l of WHATSAPP_LANGUAGES) {
      if (seen.has(l.id)) continue;
      out.push({ ...l, group: "add" });
    }
  }
  return out;
}

/**
 * Why Chanlytics cannot write this message in another language, in the
 * owner's words; null when it can.
 *
 * It writes what the create route files (templateComponents): the words, a
 * footer and one button that opens a link. A message with a heading, or any
 * other button, would lose it in the new language -- a different message
 * under the same name, which is the one thing a translation must not be.
 */
export function templateUntranslatable(t: { header?: string | null; buttons?: readonly { kind: string }[] | null; blocked?: string | null; category?: string | null }): string | null {
  if (t.blocked) return `it has ${t.blocked}`;
  if (t.category && !/^(marketing|utility)$/i.test(t.category)) return `WhatsApp files it as ${String(t.category).toLowerCase()}`;
  if (t.header) return "it has a heading";
  const buttons = t.buttons ?? [];
  if (buttons.length > 1) return "it has more than one button";
  const b = buttons[0];
  if (b && b.kind !== "url") return b.kind === "reply" ? "it has a reply button" : "it has a button that calls";
  return null;
}

/** The one button that opens a link, from the components Meta holds: its words and its address. Null when there is none. */
export function templateLinkButton(components: unknown): { text: string; url: string } | null {
  const holder = partOf(components, "BUTTONS");
  const list = holder && Array.isArray(holder.buttons) ? (holder.buttons as unknown[]) : [];
  for (const b of list) {
    if (!b || typeof b !== "object") continue;
    const x = b as { type?: unknown; text?: unknown; url?: unknown };
    if (String(x.type ?? "").toUpperCase() !== "URL") continue;
    const text = typeof x.text === "string" ? x.text.trim() : "";
    const url = typeof x.url === "string" ? x.url.trim() : "";
    if (text && url) return { text, url };
  }
  return null;
}

/** One entry per template NAME, in the library's order, with its rows by language. */
export interface TemplateGroup<T> {
  name: string;
  /** The words for the name: the workspace's own title, else the starter's, else the name made words. */
  title: string;
  /** Every row of this name, language order, and the words for each language. */
  rows: T[];
  labels: Record<string, string>;
}

/**
 * The rows of a picker grouped by the template they are.
 *
 * A composer showed one chip per ROW and titled it with `templateTitle(name)`,
 * which takes no language -- so the starter set installed in English and Spanish,
 * which Messages advertises as the default, drew seven PAIRS of identical chips
 * sitting next to each other. The Inbox composer had already solved this
 * (`inboxTemplates` labels each "<title> · <language>"); the two Campaigns
 * composers had not.
 */
export function groupTemplates<T extends { name: string; language: string; title?: string | null; category?: string | null; source?: string | null }>(
  list: readonly T[],
): TemplateGroup<T>[] {
  const out: TemplateGroup<T>[] = [];
  const at = new Map<string, TemplateGroup<T>>();
  for (const t of list.slice().sort(compareTemplates)) {
    let g = at.get(t.name);
    if (!g) {
      g = { name: t.name, title: templateTitle(t.name, t.title), rows: [], labels: {} };
      at.set(t.name, g);
      out.push(g);
    }
    g.rows.push(t);
  }
  for (const g of out) g.labels = languageLabels(g.rows.map((r) => r.language));
  return out;
}

/** Each slot's words for a person: a starter's own labels, else the labels the row carries, else "Value n". */
/**
 * The template this workspace may text somebody who asked to book.
 *
 * Three things at once, and none of them a name: APPROVED, because a row
 * asserting an approval Meta never gave is the defect this replaces; fillable
 * from the workspace's own facts, because the server fills the slots and never
 * asks a caller for words; and carrying the booking link, which is what makes
 * it the booking template rather than any other. A workspace with none has
 * none, and is owed that answer rather than a send that fails at Meta.
 */
export function bookingTemplate<T extends { name: string; language: string; meta_status?: string | null; variables: unknown }>(
  templates: readonly T[],
): T | null {
  const usable = templates.filter(
    (t) => t.meta_status === "approved" && !slotToWrite(t) && defaultSlotKinds(t).includes("booking_link"),
  );
  // The starter first when the workspace has it, so a business that took the
  // one we wrote gets the words we wrote; otherwise their own, in the order
  // the rest of the product lists templates.
  return usable.find((t) => t.name === "booking_link") ?? usable.slice().sort(compareTemplates)[0] ?? null;
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

/**
 * The slots the Inbox fills for a template, the way broadcasts and the assistant fill them (defaultParamSpecs): a
 * starter's own, else a guess per recorded slot. A template whose slots the sync never recorded keeps the two the
 * Inbox always sent, the business name and the booking link (I6).
 */
export function inboxSlots(t: { name: string; variables?: unknown }): ParamSpec[] {
  return Array.isArray(t.variables)
    ? defaultParamSpecs({ name: t.name, variables: t.variables })
    : [{ kind: "business_name" }, { kind: "booking_link" }];
}

/**
 * The first slot of a template the Inbox cannot fill by itself -- words to write, a visit's time or its service --
 * by its label; null when every slot is a fact the Inbox has: the first name, the business name, the booking link.
 * The reply route refuses such a template in these words, and the composer does not offer it (I6).
 */
export function slotToWrite(t: { name: string; language?: string | null; variables?: unknown }): string | null {
  const at = inboxSlots(t).findIndex((s) => s.kind === "text" || s.kind === "visit_when" || s.kind === "visit_service");
  if (at < 0) return null;
  return slotLabels({ name: t.name, language: t.language ?? "en_US", variables: t.variables })[at] ?? `Value ${at + 1}`;
}
