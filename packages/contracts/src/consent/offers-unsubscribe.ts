/**
 * What the unsubscribe page says to a customer who pressed it on an OFFER (One message, every channel, step 4; the
 * campaigns-on-every-channel spec, 4.6 and decision 12). The page is one door with two roads: the link in the offer, and the
 * mail client's one click (RFC 8058). Either ends offers by email and nothing else: "Unsubscribe is not STOP". The page then
 * offers a second, confirmed act for someone who means everything: "Stop all messages", which sets do-not-contact.
 *
 * The page speaks the language of the offer it came from (the Campaigns review, finding 4): English or Spanish, by the
 * sender's one rule (templates/sender-words.ts), so a customer who read the offer in Spanish does not land on an English
 * page. The language is required, null where the email's could not be read, which reads English.
 *
 * The same page answers a reach-out's cold email (reach-out/reach-out.ts unsubscribePageWords), which speaks to a business
 * the finder found, not to a customer; which of the two a link belongs to is read from the email it came in. A link that
 * does not work, and a press that did not go through, are the same words for both. Pure: every sentence is here.
 */
import { senderLanguage, type SenderLanguage } from "../templates/sender-words";

/** One button the page draws: a form that posts `name=value`. A quiet one is the second act, not the page's main one. */
export interface OfferPageButton {
  label: string;
  name: "unsubscribe" | "stop_all";
  value: "yes" | "ask";
  quiet: boolean;
}

/** What the page is showing a customer: the question, the answer, the second act's question and its answer. */
export type OfferUnsubscribeView =
  | { kind: "ask"; business: string | null }
  | { kind: "done"; business: string | null }
  | { kind: "stop_ask"; business: string | null }
  | { kind: "stopped"; business: string | null };

export interface OfferPageWords {
  title: string;
  lead: string;
  body: string;
  buttons: OfferPageButton[];
  foot: string | null;
}

/**
 * Why "Stop all messages" was refused, said to whoever pressed it (a plain-text answer, not the page): the link is a
 * reach-out's, which speaks to a business and has no visit messages to stop; or the email it came in could not be read just
 * now, so nothing was changed and the press can be made again.
 */
export const STOP_ALL_REFUSALS = {
  not_an_offer:
    "This link is for a business's email, not an offer: it has no other messages to stop, and nothing was changed.",
  unread: "We couldn't check this link just now, so nothing was stopped. Try again in a minute.",
} as const;

/** Every sentence the page says to a customer on an offer, in one language. `b` is the business's name, its only value. */
interface OfferPageSays {
  /** The word for the business where it has no name: the plainest stand-in. */
  business: string;
  foot: (b: string) => string;
  ask: { title: string; lead: (b: string) => string; body: (b: string) => string; button: string };
  done: { title: string; lead: (b: string) => string; body: string; button: string };
  stopAsk: { title: string; lead: (b: string) => string; body: string; button: string };
  stopped: { title: string; lead: (b: string) => string; body: string };
}

const SAYS: Record<SenderLanguage, OfferPageSays> = {
  en: {
    business: "this business",
    foot: (b) => `${b} sends its email with Chanlytics.`,
    ask: {
      title: "Unsubscribe",
      lead: (b) => `Stop offers from ${b}?`,
      body: (b) =>
        `Press the button and ${b} won't send you offers by email again. You'll still get messages about your appointments.`,
      button: "Unsubscribe from offers",
    },
    done: {
      title: "Unsubscribed",
      lead: (b) => `You're unsubscribed from offers from ${b}.`,
      body: "You'll still get messages about your appointments.",
      button: "Stop all messages",
    },
    stopAsk: {
      title: "Stop all messages",
      lead: (b) => `Stop every message from ${b}?`,
      body: "That includes reminders and confirmations about your appointments. Nothing more will go to you by email, text or WhatsApp.",
      button: "Yes, stop all messages",
    },
    stopped: {
      title: "Messages stopped",
      lead: (b) => `You won't get any more messages from ${b}.`,
      body: "Nothing more will go to you by email, text or WhatsApp.",
    },
  },
  es: {
    business: "este negocio",
    foot: (b) => `${b} envía su correo con Chanlytics.`,
    ask: {
      title: "Darme de baja",
      lead: (b) => `¿Dejar de recibir ofertas de ${b}?`,
      body: (b) =>
        `Pulsa el botón y ${b} no volverá a enviarte ofertas por correo. Seguirás recibiendo mensajes sobre tus citas.`,
      button: "Darme de baja de las ofertas",
    },
    done: {
      title: "Te diste de baja",
      lead: (b) => `Te diste de baja de las ofertas de ${b}.`,
      body: "Seguirás recibiendo mensajes sobre tus citas.",
      button: "Dejar de recibir todos los mensajes",
    },
    stopAsk: {
      title: "Dejar de recibir todos los mensajes",
      lead: (b) => `¿Dejar de recibir todos los mensajes de ${b}?`,
      body: "Eso incluye los recordatorios y las confirmaciones de tus citas. No recibirás nada más por correo, mensaje de texto ni WhatsApp.",
      button: "Sí, dejar de recibir todos los mensajes",
    },
    stopped: {
      title: "Mensajes detenidos",
      lead: (b) => `No recibirás más mensajes de ${b}.`,
      body: "No recibirás nada más por correo, mensaje de texto ni WhatsApp.",
    },
  },
};

/** Every sentence the page says to a customer on an offer, in the language of the email it came in. */
export function offerUnsubscribeWords(v: OfferUnsubscribeView, language: string | null): OfferPageWords {
  const says = SAYS[senderLanguage(language)];
  const b = v.business?.trim() || says.business;
  const foot = says.foot(b);
  switch (v.kind) {
    case "ask":
      return {
        title: says.ask.title,
        lead: says.ask.lead(b),
        body: says.ask.body(b),
        buttons: [{ label: says.ask.button, name: "unsubscribe", value: "yes", quiet: false }],
        foot,
      };
    case "done":
      return {
        title: says.done.title,
        lead: says.done.lead(b),
        body: says.done.body,
        buttons: [{ label: says.done.button, name: "stop_all", value: "ask", quiet: true }],
        foot,
      };
    case "stop_ask":
      return {
        title: says.stopAsk.title,
        lead: says.stopAsk.lead(b),
        body: says.stopAsk.body,
        buttons: [{ label: says.stopAsk.button, name: "stop_all", value: "yes", quiet: false }],
        foot,
      };
    case "stopped":
      return {
        title: says.stopped.title,
        lead: says.stopped.lead(b),
        body: says.stopped.body,
        buttons: [],
        foot,
      };
  }
}
