/**
 * Starter templates: table. The set in the order a composer opens on, then what it replaced. The starters about a
 * person's own visit are visits.ts, and the retired ones retired.ts.
 */

import {
  BUSINESS,
  BUSINESS_ES,
  FIRST,
  FIRST_ES,
  FREED_WHEN,
  FREED_WHEN_ES,
  LINK,
  LINK_ES,
  OFFER,
  OFFER_ES,
  PROPOSAL,
  PROPOSAL_ES,
  STOP_EN,
  STOP_ES,
  type StarterTemplate,
} from "./shapes";
import { RETIRED_STARTERS } from "./retired";
import { VISIT_STARTERS } from "./visits";

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
  // About a person's own visit: visits.ts.
  ...VISIT_STARTERS,
  {
    // Someone sent the booking link who has not booked (decision 0119): one follow-up the day after, with the link
    // again. About their own ask, with no offer and no price, so it is utility, as the proposal follow-up is. A week's
    // rest keeps this message's own link from starting the next one (contracts ASK_REST_DAYS).
    key: "booking_follow_up",
    name: "booking_follow_up",
    title: "Booking follow-up",
    purpose: "for someone sent the booking link who has not booked",
    category: "utility",
    trigger: "asked_no_booking",
    texts: {
      en_US: {
        body: "Hi {{1}}, it's {{2}}. Still want to book? Here's the link again: {{3}}. Or reply here and we'll help.",
        footer: null,
        slots: [FIRST, BUSINESS, LINK],
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}. ¿Todavía quieres reservar? Aquí está el enlace otra vez: {{3}}. O responde aquí y te ayudamos.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES],
      },
    },
    email: {
      en_US: {
        subject: "Still want to book with {{2}}?",
        body: "Hi {{1}},\n\nStill want to book? Here's the link again: {{3}}\n\nOr reply to this email and we'll help.",
      },
      es: {
        subject: "¿Todavía quieres reservar con {{2}}?",
        body: "Hola {{1}}:\n\n¿Todavía quieres reservar? Aquí está el enlace otra vez: {{3}}\n\nO responde a este correo y te ayudamos.",
      },
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, it's {{2}}. Still want to book? Here's the link again: {{3}} Or reply here and we'll help.",
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}. ¿Quieres reservar? Este es el enlace: {{3}} O responde a este mensaje y te ayudamos.",
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
    // A time a cancellation freed, offered to the people who asked and never booked (0082). About their own ask and
    // nothing else: no offer, no price and no link, so it is utility and reaches a yes to texts. Their reply opens
    // WhatsApp's 24 hours, inside which the receptionist answers it as any thread, and holds the time where the workspace
    // takes booking requests (0061).
    key: "time_freed",
    name: "time_freed",
    title: "A time freed up",
    purpose: "for a time a cancellation freed, to the people who asked and never booked",
    category: "utility",
    trigger: "slot_opened",
    texts: {
      en_US: {
        body: "Hi {{1}}, it's {{2}}. A time just opened {{3}}. Want it? Reply here.",
        footer: null,
        slots: [FIRST, BUSINESS, FREED_WHEN],
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}. Se abrió un espacio {{3}}. ¿Lo quieres? Responde aquí.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, FREED_WHEN_ES],
      },
    },
    email: {
      en_US: {
        subject: "A time opened {{3}}",
        body: "Hi {{1}},\n\nA time just opened at {{2}} {{3}}. Want it? Reply to this email.",
      },
      es: {
        subject: "Se abrió un espacio {{3}}",
        body: "Hola {{1}}:\n\nSe abrió un espacio en {{2}} {{3}}. ¿Lo quieres? Responde a este correo.",
      },
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, it's {{2}}. A time just opened {{3}}. Want it? Reply here.",
      },
      es: {
        // Spanish texts keep to the letters the carriers send plainly (é, ñ, ¿ but not á, í, ó, ú), so each goes as one part.
        body: "Hola {{1}}, te escribimos de {{2}}. Hay un espacio libre {{3}}. ¿Lo quieres? Responde a este mensaje.",
      },
    },
  },
  {
    key: "quick_note",
    name: "quick_note",
    title: "A quick note",
    purpose: "for any one-off send: news, hours, a heads-up",
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

  /* ---- Retired (2 Oct 2026): retired.ts ---- */
  ...RETIRED_STARTERS,
];
