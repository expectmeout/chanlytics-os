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
 *
 * This module is the set and the shape of an entry. A starter is found by its name, key or moment in
 * starter-lookup.ts, and the rest of the library sits beside it: template-preview.ts, template-parts.ts,
 * template-slots.ts, template-titles.ts, message-languages.ts, inbox-templates.ts and template-order.ts.
 */
import type { PlaybookTrigger } from "../playbooks/playbook-triggers";

export type StarterSlotKind =
  "first_name" | "business_name" | "booking_link" | "visit_when" | "visit_service" | "proposal_link" | "text";

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
const PROPOSAL = {
  kind: "proposal_link" as const,
  label: "Proposal link",
  example: "https://docs.example.com/proposal",
};
const PROPOSAL_ES = { ...PROPOSAL, label: "Enlace de la propuesta" };
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
        slots: [
          FIRST,
          BUSINESS,
          { kind: "text", label: "The offer", example: "20% off any service booked before Friday." },
          LINK,
        ],
      },
      es: {
        body: "Hola {{1}}, este mes en {{2}}: {{3}} Reserva aquí: {{4}} — las plazas son limitadas.",
        footer: STOP_ES,
        slots: [
          FIRST_ES,
          BUSINESS_ES,
          {
            kind: "text",
            label: "La oferta",
            example: "20% de descuento en cualquier servicio reservado antes del viernes.",
          },
          LINK_ES,
        ],
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
        slots: [
          FIRST,
          BUSINESS,
          { kind: "text", label: "The note", example: "we're open late on Thursdays this month." },
        ],
      },
      es: {
        body: "Hola {{1}}, una nota rápida de {{2}}: {{3}} Escríbenos aquí si tienes alguna pregunta.",
        footer: STOP_ES,
        slots: [
          FIRST_ES,
          BUSINESS_ES,
          { kind: "text", label: "La nota", example: "este mes abrimos hasta tarde los jueves." },
        ],
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
    // 0006: one nudge per proposal, with its link. Utility, as a reminder of a person's own request is; it names no
    // price, date, amount or offer, and Meta's category decides the yes it needs at the wire (deliver.ts).
    key: "proposal_follow_up",
    name: "proposal_follow_up",
    title: "Proposal follow-up",
    purpose: "for a proposal waiting with nothing back",
    category: "utility",
    trigger: "proposal_waiting",
    texts: {
      en_US: {
        body: "Hi {{1}}, just making sure the proposal from {{2}} reached you: {{3}}. Reply here with any questions.",
        footer: null,
        slots: [FIRST, BUSINESS, PROPOSAL],
      },
      es: {
        body: "Hola {{1}}, solo queremos confirmar que te llegó la propuesta de {{2}}: {{3}}. Responde aquí con cualquier pregunta.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, PROPOSAL_ES],
      },
    },
  },
  {
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
