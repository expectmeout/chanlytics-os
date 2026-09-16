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

/** The message as a customer would read it: the business's own name and booking link, and a blank for what it has not given. */
export function starterPreview(s: StarterTemplate, language: string, businessName?: string | null, bookingLink?: string | null): string {
  const t = starterText(s, language);
  const own: OwnFacts = { business_name: businessName, booking_link: bookingLink };
  return fill(t.body, t.slots.map((x) => slotWords(x.kind, x.label, x.example, own) ?? x.example));
}

/**
 * A saved template as a customer would read it, from the row as the sync keeps
 * it: a position, a label, the example filed with Meta -- and no kind. The kind
 * is a starter's own, known by its name, else a guess from the label and the
 * example (defaultSlotKinds), and the words follow slotWords. A slot with
 * nothing to show stays a slot.
 */
export function templatePreview(t: { name: string; language?: string | null; body_preview: string | null; variables: unknown }, own: OwnFacts = {}): string {
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
  return fill(String(t.body_preview ?? ""), values);
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

/** A language code as people read it: "en_US" is "English", "es" is "Spanish"; the code itself where the runtime cannot say. */
export function languageWords(code: string): string {
  const base = String(code ?? "").split(/[-_]/)[0];
  const Names = (Intl as unknown as { DisplayNames?: new (locales: string[], options: { type: "language" }) => { of(code: string): string | undefined } }).DisplayNames;
  try {
    const name = base && Names ? new Names(["en"], { type: "language" }).of(base) : undefined;
    return name && name !== base ? name : String(code ?? "");
  } catch {
    return String(code ?? "");
  }
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
  a: { name: string; category?: string | null; source?: string | null },
  b: { name: string; category?: string | null; source?: string | null },
): number {
  const ai = starterIndex(a.name);
  const bi = starterIndex(b.name);
  if (ai !== bi) return ai - bi;
  const rank = (t: { category?: string | null; source?: string | null }) => (t.source === "chanlytics" ? 0 : 2) + (t.category === "utility" ? 1 : 0);
  return rank(a) - rank(b) || a.name.localeCompare(b.name);
}

/** The template a composer opens on: the trigger's starter, the quick note for a broadcast, else the first. */
export function defaultTemplate<T extends { name: string; category?: string | null; source?: string | null }>(list: readonly T[], trigger: string | null): T | null {
  const s = trigger ? starterForTrigger(trigger) : starterByKey("quick_note");
  return (s ? list.find((t) => t.name === s.name) : undefined) ?? list.slice().sort(compareTemplates)[0] ?? null;
}

/** Each slot's words for a person: a starter's own labels, else the labels the row carries, else "Value n". */
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
