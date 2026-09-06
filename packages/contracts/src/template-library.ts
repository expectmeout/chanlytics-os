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
import type { ParamSpec } from "./templates";
import type { PlaybookTrigger } from "./playbooks";

export type StarterSlotKind = "first_name" | "business_name" | "booking_link" | "text";

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
        slots: [FIRST, BUSINESS, { kind: "text", label: "The offer", example: "20% off balayage for regulars, book by Friday." }, LINK],
      },
      es: {
        body: "Hola {{1}}, este mes en {{2}}: {{3}} Reserva aquí: {{4}} — las plazas son limitadas.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, { kind: "text", label: "La oferta", example: "20% de descuento en balayage para clientas habituales, reserva antes del viernes." }, LINK_ES],
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

/** The message as a customer would read it, with the business's own name when known. */
export function starterPreview(s: StarterTemplate, language: string, businessName?: string | null): string {
  const t = starterText(s, language);
  return fill(t.body, t.slots.map((x) => (x.kind === "business_name" && businessName ? businessName : x.example)));
}

/** Words for people: the starter's title, or the name with its underscores made spaces. */
export function templateTitle(name: string | null | undefined): string {
  const s = starterByName(name);
  if (s) return s.title;
  const words = String(name ?? "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : String(name ?? "");
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
  if (/business|salon|company|shop|studio|clinic|brand|negocio/.test(l)) return "business_name";
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
