/**
 * Starter templates: the ones about a person's own visit, in the order a composer opens on. The day before it and two
 * hours before it (decision 0119), the day after it (how did it go, and the review ask), and the one marked missed (0119).
 */

import {
  BUSINESS,
  BUSINESS_ES,
  FIRST,
  FIRST_ES,
  REVIEW,
  REVIEW_ES,
  SERVICE,
  SERVICE_ES,
  WHEN,
  WHEN_ES,
  type StarterTemplate,
} from "./shapes";

// A visit two hours away (0119), said from the day its reminder goes: "today at 2:00 PM".
const WHEN_SOON = { ...WHEN, example: "today at 2:00 PM" };

const WHEN_SOON_ES = { ...WHEN_ES, example: "hoy a las 2:00 PM" };

// A visit behind (0119: one marked missed), said by its day alone: "today", "yesterday".
const WHEN_DAY = { ...WHEN, example: "today" };

const WHEN_DAY_ES = { ...WHEN_ES, example: "hoy" };

export const VISIT_STARTERS: readonly StarterTemplate[] = [
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
    // The second reminder (decision 0119): two hours before, to the one person, about their own appointment and nothing
    // else, so it is utility like the day-before one. It says the time as the day it goes reads it ("today at 2:00 PM").
    key: "two_hour_reminder",
    name: "two_hour_reminder",
    title: "Two-hour reminder",
    purpose: "for two hours before an appointment",
    category: "utility",
    trigger: "visit_soon",
    texts: {
      en_US: {
        body: "Hi {{1}}, it's {{2}}. See you {{3}} for {{4}}. If something came up, just reply here.",
        footer: null,
        slots: [FIRST, BUSINESS, WHEN_SOON, SERVICE],
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}. Te esperamos {{3}} para {{4}}. Si surgió algo, responde aquí.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, WHEN_SOON_ES, SERVICE_ES],
      },
    },
    email: {
      en_US: {
        subject: "See you {{3}}",
        body: "Hi {{1}},\n\nSee you at {{2}} {{3}} for {{4}}.\n\nIf something came up, just reply to this email.",
      },
      es: {
        subject: "Te esperamos {{3}}",
        body: "Hola {{1}}:\n\nTe esperamos en {{2}} {{3}} para {{4}}.\n\nSi surgió algo, responde a este correo.",
      },
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, it's {{2}}. See you {{3}} for {{4}}. If something came up, just reply here.",
      },
      es: {
        // Spanish texts keep to the letters the carriers send plainly (é, ñ, ¿ but not á, í, ó, ú), so each goes as one part.
        body: "Hola {{1}}, te escribimos de {{2}}. Te esperamos {{3}} para {{4}}. Si hay un cambio, responde a este mensaje.",
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
    // The day after's other message (10 Oct 2026): the thank-you with a review ask, the link the Google listing keeps.
    // About the appointment they just had, with no offer and no booking push, so it is utility like How did it go. It is
    // offered only where the listing keeps a review link (startersOffered), as its slot is filled from nothing else, and
    // How did it go stays the moment's own: what a composer opens on, and what a campaign picks when nothing is picked.
    key: "after_visit_review",
    name: "after_visit_review",
    title: "After the appointment, with a review ask",
    purpose: "for the day after an appointment, asking for a review",
    category: "utility",
    trigger: "visited",
    texts: {
      en_US: {
        body: "Hi {{1}}, thanks for coming to {{2}} yesterday. If you have a minute, a review helps others find us: {{3}}. If anything wasn't right, reply here and we'll sort it out.",
        footer: null,
        slots: [FIRST, BUSINESS, REVIEW],
      },
      es: {
        body: "Hola {{1}}, gracias por venir ayer a {{2}}. Si tienes un minuto, tu reseña ayuda a otros a encontrarnos: {{3}}. Si algo no estuvo bien, responde aquí y lo solucionamos.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, REVIEW_ES],
      },
    },
    email: {
      en_US: {
        subject: "Thanks for coming to {{2}}",
        body: "Hi {{1}},\n\nThanks for coming to {{2}} yesterday. If you have a minute, a review helps others find us: {{3}}\n\nIf anything wasn't right, just reply to this email and we'll sort it out.",
      },
      es: {
        subject: "Gracias por venir a {{2}}",
        body: "Hola {{1}}:\n\nGracias por venir ayer a {{2}}. Si tienes un minuto, tu reseña ayuda a otros a encontrarnos: {{3}}\n\nSi algo no estuvo bien, responde a este correo y lo solucionamos.",
      },
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, thanks for coming to {{2}} yesterday. A review helps others find us: {{3}} If anything wasn't right, reply here.",
      },
      es: {
        body: "Hola {{1}}, gracias por venir ayer a {{2}}. Tu reseña ayuda a otros a encontrarnos: {{3}} Si algo no estuvo bien, responde a este mensaje.",
      },
    },
  },
  {
    // A visit marked missed (decision 0119): about their own appointment, with no offer and no link, asking for a reply
    // as the freed time's message does, so it is utility. It says the day alone ("today", "yesterday"): the visit is
    // behind them. Their reply opens WhatsApp's 24 hours, inside which the receptionist finds them another time.
    key: "missed_visit",
    name: "missed_visit",
    title: "Missed appointment",
    purpose: "for an appointment marked missed",
    category: "utility",
    trigger: "visit_missed",
    texts: {
      en_US: {
        body: "Hi {{1}}, it's {{2}}. We missed you {{3}}. Want another time? Reply here and we'll find one.",
        footer: null,
        slots: [FIRST, BUSINESS, WHEN_DAY],
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}. No te vimos {{3}}. ¿Quieres otra hora? Responde aquí y la buscamos.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, WHEN_DAY_ES],
      },
    },
    email: {
      en_US: {
        subject: "We missed you {{3}}",
        body: "Hi {{1}},\n\nWe missed you at {{2}} {{3}}. Want another time?\n\nReply to this email and we'll find one.",
      },
      es: {
        subject: "No te vimos {{3}}",
        body: "Hola {{1}}:\n\nNo te vimos en {{2}} {{3}}. ¿Quieres otra hora?\n\nResponde a este correo y la buscamos.",
      },
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, it's {{2}}. We missed you {{3}}. Want another time? Reply here and we'll find one.",
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}. No te vimos {{3}}. ¿Quieres otra hora? Responde a este mensaje y la buscamos.",
      },
    },
  },
];
