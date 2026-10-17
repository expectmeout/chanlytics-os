import { SENDER_WORDS } from "./sender-words.js";
import { languageBase } from "./template-languages.js";
export const STARTER_LANGUAGES = [
  { id: "en_US", label: "English" },
  { id: "es", label: "Spanish" }
];
export function messageLanguageCode(language) {
  const base = languageBase(language);
  return STARTER_LANGUAGES.find((l) => languageBase(l.id) === base)?.id ?? language;
}
const FIRST = { kind: "first_name", label: "First name", example: "Dani" };
const BUSINESS = { kind: "business_name", label: "Business name", example: "Luna Studio" };
const LINK = { kind: "booking_link", label: "Booking link", example: "https://booksy.com/luna-studio" };
const FIRST_ES = { ...FIRST, label: "Nombre" };
const BUSINESS_ES = { ...BUSINESS, label: "Nombre del negocio" };
const LINK_ES = { ...LINK, label: "Enlace de reservas" };
const WHEN = { kind: "visit_when", label: "When", example: "tomorrow at 2:00 PM" };
const SERVICE = { kind: "visit_service", label: "Service", example: "a consultation" };
const WHEN_ES = { ...WHEN, label: "Cu\xE1ndo", example: "ma\xF1ana a las 2:00 PM" };
const SERVICE_ES = { ...SERVICE, label: "Servicio", example: "una consulta" };
const PROPOSAL = {
  kind: "proposal_link",
  label: "Proposal link",
  example: "https://docs.example.com/proposal"
};
const PROPOSAL_ES = { ...PROPOSAL, label: "Enlace de la propuesta" };
const REVIEW = { kind: "review_link", label: "Review link", example: "https://g.page/r/example/review" };
const REVIEW_ES = { ...REVIEW, label: "Enlace de rese\xF1as" };
const OFFER = { kind: "text", label: "The offer", example: "20% off any service booked before Friday." };
const OFFER_ES = {
  kind: "text",
  label: "La oferta",
  example: "20% de descuento en cualquier servicio reservado antes del viernes."
};
const STOP_EN = SENDER_WORDS.en.textStop;
const STOP_ES = SENDER_WORDS.es.textStop;
export const STARTER_TEMPLATES = [
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
        slots: [FIRST, BUSINESS]
      },
      es: {
        body: "Hola {{1}}, hace tiempo que no te vemos en {{2}}. Nos encantar\xEDa volver a verte: responde con el d\xEDa que mejor te venga y te buscamos una hora.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES]
      }
    },
    email: {
      en_US: {
        subject: "It's been a while",
        body: "Hi {{1}},\n\nIt's been a while since we last saw you at {{2}}, and we'd love to see you again.\n\nReply with a day that suits you and we'll find you a time."
      },
      es: {
        subject: "Hace tiempo que no te vemos",
        body: "Hola {{1}}:\n\nHace tiempo que no te vemos en {{2}}, y nos encantar\xEDa volver a verte.\n\nResponde con el d\xEDa que mejor te venga y te buscamos una hora."
      }
    }
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
        slots: [FIRST, BUSINESS, OFFER, LINK]
      },
      es: {
        body: "Hola {{1}}, este mes en {{2}}: {{3}} Reserva aqu\xED: {{4}} o responde con el d\xEDa que mejor te venga.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, OFFER_ES, LINK_ES]
      }
    },
    email: {
      en_US: {
        subject: "This month at {{2}}",
        body: "Hi {{1}},\n\nThis month at {{2}}: {{3}}\n\nBook here: {{4}}, or reply with a day that suits you."
      },
      es: {
        subject: "Este mes en {{2}}",
        body: "Hola {{1}}:\n\nEste mes en {{2}}: {{3}}\n\nReserva aqu\xED: {{4}}, o responde con el d\xEDa que mejor te venga."
      }
    }
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
        slots: [FIRST, BUSINESS, WHEN, SERVICE]
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}. Te recordamos tu cita {{3}} para {{4}}. Si necesitas cambiarla, responde aqu\xED.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, WHEN_ES, SERVICE_ES]
      }
    },
    email: {
      en_US: {
        subject: "Your appointment {{3}}",
        body: "Hi {{1}},\n\nA reminder of your appointment at {{2}} {{3}} for {{4}}.\n\nIf you need to change it, just reply to this email."
      },
      es: {
        subject: "Tu cita {{3}}",
        body: "Hola {{1}}:\n\nTe recordamos tu cita en {{2}} {{3}} para {{4}}.\n\nSi necesitas cambiarla, responde a este correo."
      }
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, it's {{2}}. A reminder of your appointment {{3}} for {{4}}. Reply here if you need to change it."
      },
      es: {
        // Spanish texts keep to the letters the carriers send plainly (é, ñ, ¿ but not á, í, ó, ú), so each goes as one part.
        body: "Hola {{1}}, te escribimos de {{2}}. Te recordamos tu cita {{3}} para {{4}}. Si necesitas cambiarla, responde a este mensaje."
      }
    }
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
        slots: [FIRST, BUSINESS]
      },
      es: {
        body: "Hola {{1}}, gracias por venir ayer a {{2}}. \xBFQu\xE9 tal fue todo? Si algo no est\xE1 bien, responde aqu\xED y lo solucionamos.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES]
      }
    },
    email: {
      en_US: {
        subject: "How did everything go?",
        body: "Hi {{1}},\n\nThanks for coming to {{2}} yesterday. How did everything go?\n\nIf anything isn't right, just reply to this email and we'll sort it out."
      },
      es: {
        subject: "\xBFQu\xE9 tal fue todo?",
        body: "Hola {{1}}:\n\nGracias por venir ayer a {{2}}. \xBFQu\xE9 tal fue todo?\n\nSi algo no est\xE1 bien, responde a este correo y lo solucionamos."
      }
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, thanks for coming to {{2}} yesterday. How did everything go? If anything isn't right, reply here and we'll sort it out."
      },
      es: {
        body: "Hola {{1}}, gracias por venir ayer a {{2}}. \xBFQu\xE9 tal fue todo? Si algo no te ha gustado, responde a este mensaje y lo solucionamos."
      }
    }
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
        slots: [FIRST, BUSINESS, REVIEW]
      },
      es: {
        body: "Hola {{1}}, gracias por venir ayer a {{2}}. Si tienes un minuto, tu rese\xF1a ayuda a otros a encontrarnos: {{3}}. Si algo no estuvo bien, responde aqu\xED y lo solucionamos.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, REVIEW_ES]
      }
    },
    email: {
      en_US: {
        subject: "Thanks for coming to {{2}}",
        body: "Hi {{1}},\n\nThanks for coming to {{2}} yesterday. If you have a minute, a review helps others find us: {{3}}\n\nIf anything wasn't right, just reply to this email and we'll sort it out."
      },
      es: {
        subject: "Gracias por venir a {{2}}",
        body: "Hola {{1}}:\n\nGracias por venir ayer a {{2}}. Si tienes un minuto, tu rese\xF1a ayuda a otros a encontrarnos: {{3}}\n\nSi algo no estuvo bien, responde a este correo y lo solucionamos."
      }
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, thanks for coming to {{2}} yesterday. A review helps others find us: {{3}} If anything wasn't right, reply here."
      },
      es: {
        body: "Hola {{1}}, gracias por venir ayer a {{2}}. Tu rese\xF1a ayuda a otros a encontrarnos: {{3}} Si algo no estuvo bien, responde a este mensaje."
      }
    }
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
        slots: [FIRST, BUSINESS, PROPOSAL]
      },
      es: {
        body: "Hola {{1}}, solo queremos confirmar que te lleg\xF3 la propuesta de {{2}}: {{3}}. Responde aqu\xED con cualquier pregunta.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, PROPOSAL_ES]
      }
    },
    email: {
      en_US: {
        subject: "Your proposal from {{2}}",
        body: "Hi {{1}},\n\nJust making sure the proposal from {{2}} reached you: {{3}}\n\nReply to this email with any questions."
      },
      es: {
        subject: "Tu propuesta de {{2}}",
        body: "Hola {{1}}:\n\nSolo queremos confirmar que te lleg\xF3 la propuesta de {{2}}: {{3}}\n\nResponde a este correo con cualquier pregunta."
      }
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, just making sure the proposal from {{2}} reached you: {{3}} Reply here with any questions."
      },
      es: {
        body: "Hola {{1}}, queremos confirmar que recibiste la propuesta de {{2}}: {{3}} Responde a este mensaje con cualquier pregunta."
      }
    }
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
          { kind: "text", label: "The note", example: "we're open late on Thursdays this month." }
        ]
      },
      es: {
        body: "Hola {{1}}, una nota r\xE1pida de {{2}}: {{3}} Escr\xEDbenos aqu\xED si tienes alguna pregunta.",
        footer: STOP_ES,
        slots: [
          FIRST_ES,
          BUSINESS_ES,
          { kind: "text", label: "La nota", example: "este mes abrimos hasta tarde los jueves." }
        ]
      }
    },
    email: {
      en_US: {
        subject: "A quick note from {{2}}",
        body: "Hi {{1}},\n\nA quick note from {{2}}: {{3}}\n\nReply to this email if you have any questions."
      },
      es: {
        subject: "Una nota r\xE1pida de {{2}}",
        body: "Hola {{1}}:\n\nUna nota r\xE1pida de {{2}}: {{3}}\n\nResponde a este correo si tienes alguna pregunta."
      }
    }
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
        slots: [FIRST, BUSINESS, LINK]
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}, gracias por llamar. Aqu\xED tienes el enlace para reservar: {{3}}. Este tambi\xE9n es nuestro WhatsApp: escr\xEDbenos aqu\xED cuando quieras para reservar, cambiar o preguntar por una cita.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES]
      }
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, it's {{2}}, thanks for calling. Here's the link to book: {{3}}. You can text us here any time too."
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}, gracias por llamar. Este es el enlace para reservar: {{3}}. Puedes responder a este mensaje cuando quieras."
      }
    }
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
        body: "Hi {{1}}, it's been a while since we last saw you at {{2}}. We'd love to have you back \u2014 pick a time that suits you here: {{3}} and we'll take care of the rest.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, LINK]
      },
      es: {
        body: "Hola {{1}}, hace tiempo que no te vemos en {{2}}. Nos encantar\xEDa volver a atenderte \u2014 elige la hora que mejor te venga aqu\xED: {{3}} y nosotros nos ocupamos del resto.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES]
      }
    }
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
      why: "The receptionist answers a first contact itself; as an offer, a welcome reached nobody new."
    },
    texts: {
      en_US: {
        body: "Hi {{1}}, welcome to {{2}}! This is our WhatsApp \u2014 message us here any time to book, move or ask about an appointment. Book whenever you're ready: {{3}} and we'll take it from there.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, LINK]
      },
      es: {
        body: "Hola {{1}}, \xA1bienvenido/a a {{2}}! Este es nuestro WhatsApp \u2014 escr\xEDbenos aqu\xED cuando quieras para reservar, cambiar o preguntar por una cita. Reserva cuando quieras: {{3}} y nosotros nos encargamos del resto.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES]
      }
    }
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
      why: "Its people only ever phoned, so none could have said yes to offers; the call's text does its work during the call."
    },
    texts: {
      en_US: {
        body: "Hi {{1}}, thanks for calling {{2}}. Save this number \u2014 on WhatsApp you can book, reschedule or ask us anything in a message, and we answer fast. Book any time: {{3}} or just write to us here.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, LINK]
      },
      es: {
        body: "Hola {{1}}, gracias por llamar a {{2}}. Guarda este n\xFAmero \u2014 por WhatsApp puedes reservar, cambiar tu cita o preguntarnos lo que quieras, y respondemos r\xE1pido. Reserva cuando quieras: {{3}} o escr\xEDbenos aqu\xED.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES]
      }
    }
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
        body: "Hi {{1}}, this month at {{2}}: {{3}} Book here: {{4}} \u2014 spaces are limited.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, OFFER, LINK]
      },
      es: {
        body: "Hola {{1}}, este mes en {{2}}: {{3}} Reserva aqu\xED: {{4}} \u2014 las plazas son limitadas.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, OFFER_ES, LINK_ES]
      }
    }
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
      why: "Asking them to book again made it an offer, which reached only a yes to offers; its place asks how it went."
    },
    texts: {
      en_US: {
        body: "Hi {{1}}, thank you for coming to {{2}} yesterday \u2014 we hope you love the result. When you're ready for your next appointment, pick a time here: {{3}}.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, LINK]
      },
      es: {
        body: "Hola {{1}}, gracias por venir ayer a {{2}} \u2014 esperamos que te encante el resultado. Cuando quieras tu pr\xF3xima cita, elige la hora aqu\xED: {{3}}.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES]
      }
    }
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
        body: "Hi {{1}}, it's {{2}}. Here's the link to book your appointment: {{3}} \u2014 pick any time that suits you.",
        footer: null,
        slots: [FIRST, BUSINESS, LINK]
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}. Aqu\xED tienes el enlace para reservar tu cita: {{3}} \u2014 elige la hora que mejor te venga.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES]
      }
    }
  }
];
