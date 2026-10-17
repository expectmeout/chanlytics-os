import { languageBase } from "./template-languages.js";
export const SENDER_WORDS = {
  en: {
    textStop: "Reply STOP to opt out",
    emailStop: "Reply STOP to stop these emails.",
    marketing: "This is a marketing email.",
    noThanks: `Not interested? Reply "no thanks" and I won't write again`,
    unsubscribe: "Unsubscribe",
    us: "us",
    offerAsked: (who) => `You asked for offers from ${who}.`,
    offerCustomer: (who) => `You're a customer of ${who}.`,
    visitProposal: (who) => `You're getting this about your proposal from ${who}.`,
    visitBooked: (who) => `You're getting this because of your appointment with ${who}.`,
    visitInTouch: (who) => `You're getting this because you've been in touch with ${who}.`
  },
  es: {
    textStop: "Responde STOP para darte de baja",
    emailStop: "Responde STOP para dejar de recibir estos correos.",
    marketing: "Este es un correo de marketing.",
    noThanks: `\xBFNo te interesa? Responde "no, gracias" y no volver\xE9 a escribirte`,
    unsubscribe: "Darme de baja",
    us: "nosotros",
    offerAsked: (who) => `Pediste recibir ofertas de ${who}.`,
    offerCustomer: (who) => `Eres cliente de ${who}.`,
    visitProposal: (who) => `Recibes esto sobre tu propuesta de ${who}.`,
    visitBooked: (who) => `Recibes esto por tu cita con ${who}.`,
    visitInTouch: (who) => `Recibes esto porque has estado en contacto con ${who}.`
  }
};
export function senderLanguage(language) {
  return languageBase(language) === "es" ? "es" : "en";
}
export function senderWords(language) {
  return SENDER_WORDS[senderLanguage(language)];
}
