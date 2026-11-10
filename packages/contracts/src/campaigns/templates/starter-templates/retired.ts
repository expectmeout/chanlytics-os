/**
 * Starter templates: retired (2 Oct 2026). Never offered again, kept so a workspace that added one still reads it.
 */

import {
  BUSINESS,
  BUSINESS_ES,
  FIRST,
  FIRST_ES,
  LINK,
  LINK_ES,
  OFFER,
  OFFER_ES,
  STOP_EN,
  STOP_ES,
  type StarterTemplate,
} from "./shapes";

export const RETIRED_STARTERS: readonly StarterTemplate[] = [
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
        body: "Hi {{1}}, thank you for coming to {{2}} yesterday — we hope you love the result. When you're ready for your next appointment, pick a time here: {{3}}.",
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
