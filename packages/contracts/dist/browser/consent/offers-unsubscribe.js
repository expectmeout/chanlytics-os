import { senderLanguage } from "../templates/sender-words.js";
export const STOP_ALL_REFUSALS = {
  not_an_offer: "This link is for a business's email, not an offer: it has no other messages to stop, and nothing was changed.",
  unread: "We couldn't check this link just now, so nothing was stopped. Try again in a minute."
};
const SAYS = {
  en: {
    business: "this business",
    foot: (b) => `${b} sends its email with Chanlytics.`,
    ask: {
      title: "Unsubscribe",
      lead: (b) => `Stop offers from ${b}?`,
      body: (b) => `Press the button and ${b} won't send you offers by email again. You'll still get messages about your appointments.`,
      button: "Unsubscribe from offers"
    },
    done: {
      title: "Unsubscribed",
      lead: (b) => `You're unsubscribed from offers from ${b}.`,
      body: "You'll still get messages about your appointments.",
      button: "Stop all messages"
    },
    stopAsk: {
      title: "Stop all messages",
      lead: (b) => `Stop every message from ${b}?`,
      body: "That includes reminders and confirmations about your appointments. Nothing more will go to you by email, text or WhatsApp.",
      button: "Yes, stop all messages"
    },
    stopped: {
      title: "Messages stopped",
      lead: (b) => `You won't get any more messages from ${b}.`,
      body: "Nothing more will go to you by email, text or WhatsApp."
    }
  },
  es: {
    business: "este negocio",
    foot: (b) => `${b} env\xEDa su correo con Chanlytics.`,
    ask: {
      title: "Darme de baja",
      lead: (b) => `\xBFDejar de recibir ofertas de ${b}?`,
      body: (b) => `Pulsa el bot\xF3n y ${b} no volver\xE1 a enviarte ofertas por correo. Seguir\xE1s recibiendo mensajes sobre tus citas.`,
      button: "Darme de baja de las ofertas"
    },
    done: {
      title: "Te diste de baja",
      lead: (b) => `Te diste de baja de las ofertas de ${b}.`,
      body: "Seguir\xE1s recibiendo mensajes sobre tus citas.",
      button: "Dejar de recibir todos los mensajes"
    },
    stopAsk: {
      title: "Dejar de recibir todos los mensajes",
      lead: (b) => `\xBFDejar de recibir todos los mensajes de ${b}?`,
      body: "Eso incluye los recordatorios y las confirmaciones de tus citas. No recibir\xE1s nada m\xE1s por correo, mensaje de texto ni WhatsApp.",
      button: "S\xED, dejar de recibir todos los mensajes"
    },
    stopped: {
      title: "Mensajes detenidos",
      lead: (b) => `No recibir\xE1s m\xE1s mensajes de ${b}.`,
      body: "No recibir\xE1s nada m\xE1s por correo, mensaje de texto ni WhatsApp."
    }
  }
};
export function offerUnsubscribeWords(v, language) {
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
        foot
      };
    case "done":
      return {
        title: says.done.title,
        lead: says.done.lead(b),
        body: says.done.body,
        buttons: [{ label: says.done.button, name: "stop_all", value: "ask", quiet: true }],
        foot
      };
    case "stop_ask":
      return {
        title: says.stopAsk.title,
        lead: says.stopAsk.lead(b),
        body: says.stopAsk.body,
        buttons: [{ label: says.stopAsk.button, name: "stop_all", value: "yes", quiet: false }],
        foot
      };
    case "stopped":
      return {
        title: says.stopped.title,
        lead: says.stopped.lead(b),
        body: says.stopped.body,
        buttons: [],
        foot
      };
  }
}
