/**
 * The starter set: the messages Chanlytics writes for the moments it acts on, one for each moment of a customer's
 * life with the business (2 Oct 2026, the lifecycle set): the call's text, the visit reminder, how did it go, the
 * proposal follow-up, the win-back, the month's offer and a quick note. Each in English and Spanish, with the slots
 * the wire fills per person, and with its email and text versions where the channel means something for it (One
 * message, every channel; message-versions.ts). Meta approves the WhatsApp words; a workspace adds the set with one
 * click, the playbooks pick from it, and a broadcast starts from it.
 *
 * A message's kind is the yes it needs, and the set is cut so the cycle can start on the yes people give first: the
 * four about a person's own call, visit or proposal are utility and reach a yes to texts; the three offers are
 * marketing and wait for a yes to offers. An offer has no text version: texts carry no offers (deliver.ts).
 *
 * Every WhatsApp version passes the same check a template written by hand passes, with no warnings (a test holds it to
 * that), so what a new workspace gets is a set WhatsApp is expected to approve, not a set that needs fixing first; every
 * email and text version passes its channel's check the same way. Titles are for people; names are what Meta and the
 * wire use.
 *
 * The starters the set replaced stay in the library, marked `retired`: a workspace that added them still has them,
 * and still reads their titles, slots and footers from here. They are never offered again.
 *
 * This module is the set and the shape of an entry. A starter is found by its name, key or moment in
 * starter-lookup.ts, and the rest of the library sits beside it: template-preview.ts, template-parts.ts,
 * template-slots.ts, template-titles.ts, message-languages.ts, inbox-templates.ts and template-order.ts.
 */
import type { PlaybookTrigger } from "../playbooks/playbook-triggers";
import type { ParamSourceKind } from "./templates";

/** What a starter's slot takes: one of the sources a campaign fills a slot from (templates.ts). */
export type StarterSlotKind = ParamSourceKind;

export interface StarterSlot {
  kind: StarterSlotKind;
  /** The words a person sees for the slot. */
  label: string;
  /** What WhatsApp's reviewers read; also the preview's words. */
  example: string;
}

/** The WhatsApp version in one language. Its slots are the message's: every other version fills the same ones. */
export interface StarterText {
  body: string;
  footer: string | null;
  slots: StarterSlot[];
}

/** The email version in one language: the same numbered slots, in a subject and a body. */
export interface StarterEmailText {
  subject: string;
  body: string;
}

/** The text version in one language: the same numbered slots; the sender adds the STOP line. */
export interface StarterSmsText {
  body: string;
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
  /** The WhatsApp version, by language. */
  texts: Record<string, StarterText>;
  /** The email version, by language; absent where an email means nothing for it. */
  email?: Record<string, StarterEmailText>;
  /** The text version, by language; absent for an offer, which texts never carry. */
  sms?: Record<string, StarterSmsText>;
  /** No longer offered (2 Oct 2026): the starter that took its place, if one did, and why. */
  retired?: { by: string | null; why: string };
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
const OFFER = { kind: "text" as const, label: "The offer", example: "20% off any service booked before Friday." };
const OFFER_ES = {
  kind: "text" as const,
  label: "La oferta",
  example: "20% de descuento en cualquier servicio reservado antes del viernes.",
};
const STOP_EN = "Reply STOP to opt out";
const STOP_ES = "Responde STOP para darte de baja";

export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  /* ---- The set (2 Oct 2026), in the order a composer opens on ---- */
  {
    // An offer, and honest about it: it waits for a yes to offers. It asks for a reply rather than sending them to a
    // link, so it needs no booking link on file, and what comes back is a conversation the receptionist can carry.
    key: "winback_reply",
    name: "winback_reply",
    title: "Win-back",
    purpose: "for anyone who has gone quiet",
    category: "marketing",
    trigger: "quiet_30",
    texts: {
      en_US: {
        body: "Hi {{1}}, it's been a while since we last saw you at {{2}}. We'd love to see you again: reply with a day that suits you and we'll find you a time.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS],
      },
      es: {
        body: "Hola {{1}}, hace tiempo que no te vemos en {{2}}. Nos encantaría volver a verte: responde con el día que mejor te venga y te buscamos una hora.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES],
      },
    },
    email: {
      en_US: {
        subject: "It's been a while",
        body: "Hi {{1}},\n\nIt's been a while since we last saw you at {{2}}, and we'd love to see you again.\n\nReply with a day that suits you and we'll find you a time.",
      },
      es: {
        subject: "Hace tiempo que no te vemos",
        body: "Hola {{1}}:\n\nHace tiempo que no te vemos en {{2}}, y nos encantaría volver a verte.\n\nResponde con el día que mejor te venga y te buscamos una hora.",
      },
    },
  },
  {
    key: "this_months_offer",
    name: "this_months_offer",
    title: "This month's offer",
    purpose: "for everyone who said yes to offers, once a month",
    category: "marketing",
    trigger: "everyone_monthly",
    texts: {
      en_US: {
        body: "Hi {{1}}, this month at {{2}}: {{3}} Book here: {{4}} or reply with a day that suits you.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, OFFER, LINK],
      },
      es: {
        body: "Hola {{1}}, este mes en {{2}}: {{3}} Reserva aquí: {{4}} o responde con el día que mejor te venga.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, OFFER_ES, LINK_ES],
      },
    },
    email: {
      en_US: {
        subject: "This month at {{2}}",
        body: "Hi {{1}},\n\nThis month at {{2}}: {{3}}\n\nBook here: {{4}}, or reply with a day that suits you.",
      },
      es: {
        subject: "Este mes en {{2}}",
        body: "Hola {{1}}:\n\nEste mes en {{2}}: {{3}}\n\nReserva aquí: {{4}}, o responde con el día que mejor te venga.",
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
    email: {
      en_US: {
        subject: "Your appointment {{3}}",
        body: "Hi {{1}},\n\nA reminder of your appointment at {{2}} {{3}} for {{4}}.\n\nIf you need to change it, just reply to this email.",
      },
      es: {
        subject: "Tu cita {{3}}",
        body: "Hola {{1}}:\n\nTe recordamos tu cita en {{2}} {{3}} para {{4}}.\n\nSi necesitas cambiarla, responde a este correo.",
      },
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, it's {{2}}. A reminder of your appointment {{3}} for {{4}}. Reply here if you need to change it.",
      },
      es: {
        // Spanish texts keep to the letters the carriers send plainly (é, ñ, ¿ but not á, í, ó, ú), so each goes as one part.
        body: "Hola {{1}}, te escribimos de {{2}}. Te recordamos tu cita {{3}} para {{4}}. Si necesitas cambiarla, responde a este mensaje.",
      },
    },
  },
  {
    // About the visit they just had, and nothing else: no offer and no booking push, so it is utility and reaches a
    // yes to texts. Their reply opens WhatsApp's 24 hours, inside which the receptionist may say anything.
    key: "after_visit_check",
    name: "after_visit_check",
    title: "How did it go",
    purpose: "for the day after a visit",
    category: "utility",
    trigger: "visited",
    texts: {
      en_US: {
        body: "Hi {{1}}, thanks for coming to {{2}} yesterday. How did everything go? If anything isn't right, reply here and we'll sort it out.",
        footer: null,
        slots: [FIRST, BUSINESS],
      },
      es: {
        body: "Hola {{1}}, gracias por venir ayer a {{2}}. ¿Qué tal fue todo? Si algo no está bien, responde aquí y lo solucionamos.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES],
      },
    },
    email: {
      en_US: {
        subject: "How did everything go?",
        body: "Hi {{1}},\n\nThanks for coming to {{2}} yesterday. How did everything go?\n\nIf anything isn't right, just reply to this email and we'll sort it out.",
      },
      es: {
        subject: "¿Qué tal fue todo?",
        body: "Hola {{1}}:\n\nGracias por venir ayer a {{2}}. ¿Qué tal fue todo?\n\nSi algo no está bien, responde a este correo y lo solucionamos.",
      },
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, thanks for coming to {{2}} yesterday. How did everything go? If anything isn't right, reply here and we'll sort it out.",
      },
      es: {
        body: "Hola {{1}}, gracias por venir ayer a {{2}}. ¿Qué tal fue todo? Si algo no te ha gustado, responde a este mensaje y lo solucionamos.",
      },
    },
  },
  {
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
    email: {
      en_US: {
        subject: "Your proposal from {{2}}",
        body: "Hi {{1}},\n\nJust making sure the proposal from {{2}} reached you: {{3}}\n\nReply to this email with any questions.",
      },
      es: {
        subject: "Tu propuesta de {{2}}",
        body: "Hola {{1}}:\n\nSolo queremos confirmar que te llegó la propuesta de {{2}}: {{3}}\n\nResponde a este correo con cualquier pregunta.",
      },
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, just making sure the proposal from {{2}} reached you: {{3}} Reply here with any questions.",
      },
      es: {
        body: "Hola {{1}}, queremos confirmar que recibiste la propuesta de {{2}}: {{3}} Responde a este mensaje con cualquier pregunta.",
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
    email: {
      en_US: {
        subject: "A quick note from {{2}}",
        body: "Hi {{1}},\n\nA quick note from {{2}}: {{3}}\n\nReply to this email if you have any questions.",
      },
      es: {
        subject: "Una nota rápida de {{2}}",
        body: "Hola {{1}}:\n\nUna nota rápida de {{2}}: {{3}}\n\nResponde a este correo si tienes alguna pregunta.",
      },
    },
  },
  {
    // The one a caller asks for OUT LOUD, mid-call: the phone agent texts it when somebody wants to book (edge
    // retell-fn.ts), with the business's WhatsApp named, so a caller who only ever phoned learns where to write.
    //
    // UTILITY, and that is the whole point of writing it down here. It answers a request the person just made, so it
    // needs no separate yes to offers -- and because the category is Meta's own word for that, purposeOfTemplate reads
    // it correctly and nothing has to override the purpose at a call site. It is LAST on purpose: the order is what a
    // composer opens on, and this is the one a caller asks for rather than one anybody broadcasts.
    key: "call_text",
    name: "call_text",
    title: "The call's text",
    purpose: "for a caller who asks to book",
    category: "utility",
    trigger: null,
    texts: {
      en_US: {
        // The first name every starter opens with, and here it is usually "there": the phone agent texts somebody
        // whose name nobody has yet, and resolveParams says so rather than leaving a gap.
        body: "Hi {{1}}, it's {{2}}, thanks for calling. Here's the link to book: {{3}}. This is our WhatsApp too: write to us here any time to book, move or ask about an appointment.",
        footer: null,
        slots: [FIRST, BUSINESS, LINK],
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}, gracias por llamar. Aquí tienes el enlace para reservar: {{3}}. Este también es nuestro WhatsApp: escríbenos aquí cuando quieras para reservar, cambiar o preguntar por una cita.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES],
      },
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, it's {{2}}, thanks for calling. Here's the link to book: {{3}}. You can text us here any time too.",
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}, gracias por llamar. Este es el enlace para reservar: {{3}}. Puedes responder a este mensaje cuando quieras.",
      },
    },
  },

  /* ---- Retired (2 Oct 2026): never offered again, kept so a workspace that added one still reads it ---- */
  {
    key: "winback_offer",
    name: "winback_offer",
    // Called apart from the set's own Win-back, which a workspace that has this one sees listed beside it.
    title: "Win-back (earlier)",
    purpose: "for anyone quiet 30 days",
    category: "marketing",
    trigger: "quiet_30",
    retired: { by: "winback_reply", why: "It sent people to a link; its place asks for a reply." },
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
    retired: {
      by: null,
      why: "The receptionist answers a first contact itself; as an offer, a welcome reached nobody new.",
    },
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
    retired: {
      by: "call_text",
      why: "Its people only ever phoned, so none could have said yes to offers; the call's text does its work during the call.",
    },
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
    title: "This month's offer (earlier)",
    purpose: "for everyone who said yes, once a month",
    category: "marketing",
    trigger: "everyone_monthly",
    retired: { by: "this_months_offer", why: "It promised that spaces were limited, which a business may not mean." },
    texts: {
      en_US: {
        body: "Hi {{1}}, this month at {{2}}: {{3}} Book here: {{4}} — spaces are limited.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, OFFER, LINK],
      },
      es: {
        body: "Hola {{1}}, este mes en {{2}}: {{3}} Reserva aquí: {{4}} — las plazas son limitadas.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, OFFER_ES, LINK_ES],
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
    retired: {
      by: "after_visit_check",
      why: "Asking them to book again made it an offer, which reached only a yes to offers; its place asks how it went.",
    },
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
    // The row this replaced was hand-written straight into one workspace's database, marked approved, with no
    // meta_id: an approval Meta had never given, so every send of it failed, and it failed for every other workspace
    // by not existing at all.
    key: "booking_link",
    name: "booking_link",
    title: "Booking link",
    purpose: "for a caller who asks to book",
    category: "utility",
    trigger: null,
    retired: { by: "call_text", why: "The call's text sends the link and names the business's WhatsApp too." },
    texts: {
      en_US: {
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
