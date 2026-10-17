import { mondayOf, shiftKey } from "../calendar/day-keys.js";
import { campaignDayWords, localDate } from "../playbooks/playbook-schedule.js";
import { clockHour } from "../shared/clock.js";
import { dateFormat } from "../shared/time.js";
import { joinWords, joinWordsEs, plural } from "../shared/words.js";
import { versionWord } from "../templates/message-versions.js";
import { OFFERS_BY_EMAIL_WORDS } from "./email-offers.js";
import { CHANNEL_WORDS } from "./reach-for.js";
import { US_PAUSED } from "./whatsapp-offers.js";
const reasonEn = (why) => why ?? CHANNEL_WORDS.unchecked;
const roomEn = (room, audience) => `The calendar has ${room.open > 0 ? plural(room.open, "open slot") : "no open slot"} in the next ${plural(room.days, "day")} for ${plural(audience, "person", "people")}`;
const EN = {
  day: campaignDayWords,
  hour: clockHour,
  reason: reasonEn,
  noText: CHANNEL_WORDS.noOffersByText,
  without: (channel, why) => `It goes without ${versionWord(channel)}: ${reasonEn(why)}`,
  reviewing: (name) => `WhatsApp is still reviewing the WhatsApp version of \u201C${name}\u201D.`,
  reuseMessage: (name) => `Sends \u201C${name}\u201D, already in your messages, with the offer in its words.`,
  writeMessage: (name, on) => `Writes a message for offers, \u201C${name}\u201D, for ${joinWords(on.map(versionWord))}: this offer goes in its words, and the next offer can send it too.`,
  noteMade: (until) => `Tells the receptionist about the offer, until ${until}.`,
  noteKnown: "The receptionist already has a note about the offer.",
  noteLeftOut: "The receptionist is not told about the offer until an owner or a partner adds a note about it.",
  monthsOfferPaused: (name, until) => `Pauses the month's offer, \u201C${name}\u201D, from when you approve it, so nobody gets two offers; resume it after ${until}.`,
  firstSend: (list, day, at) => `The offer goes to \u201C${list}\u201D on ${day} at ${at}.`,
  firstAtApprove: (list, at) => `The offer goes to \u201C${list}\u201D when you approve it, as ${at} today has passed.`,
  paced: (room, audience, cap) => `${roomEn(room, audience)}, so the offer goes as a campaign: up to ${cap} a day, each person once, until it ends, starting when you approve it.`,
  roomTight: (room, audience, from) => `${roomEn(room, audience)}, and the send goes to the whole list at once: to pace the offer to the room instead, dismiss the send and ask again on ${from}.`,
  reviewFirst: "The send can be approved once WhatsApp has reviewed its WhatsApp version.",
  whatsappReview: "Its WhatsApp version waits on WhatsApp's review, which may still be running at the first send: whoever it reaches on WhatsApp waits for it.",
  reminderAsk: (day, list) => `On ${day}, ask me to send a reminder to whoever on \u201C${list}\u201D has not booked by then.`
};
const REASONS_ES = /* @__PURE__ */ new Map([
  [CHANNEL_WORDS.noWhatsApp, "Conecta primero un n\xFAmero de WhatsApp."],
  [CHANNEL_WORDS.noMailbox, "Configura primero el correo en Ajustes \u203A Conexiones."],
  [CHANNEL_WORDS.noEmailDomain, "El correo a\xFAn no est\xE1 activado en esta instalaci\xF3n."],
  [CHANNEL_WORDS.unchecked, "No se pudo comprobar ahora mismo."],
  [
    OFFERS_BY_EMAIL_WORDS.noCampaignsDomain,
    "Las ofertas por correo empiezan cuando est\xE9 listo el dominio de campa\xF1as."
  ],
  [OFFERS_BY_EMAIL_WORDS.noAddress, "A\xF1ade la direcci\xF3n de tu negocio para enviar ofertas por correo."],
  [OFFERS_BY_EMAIL_WORDS.paused, "Las ofertas por correo est\xE1n en pausa mientras se calman las quejas y los rebotes."],
  [
    US_PAUSED,
    "Meta ha pausado las ofertas por WhatsApp a n\xFAmeros de EE. UU. Los mensajes sobre citas y las respuestas siguen saliendo."
  ]
]);
const reasonEs = (why) => {
  const said = reasonEn(why);
  return REASONS_ES.get(said) ?? said;
};
const channelEs = (channel) => channel === "whatsapp" ? "WhatsApp" : "correo";
const dayEs = (key, tz, now) => dateFormat("es", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  ...key.slice(0, 4) === localDate(tz, now).slice(0, 4) ? {} : { year: "numeric" }
}).format(/* @__PURE__ */ new Date(`${key}T12:00:00Z`));
const roomEs = (room, audience) => `El calendario tiene ${room.open === 0 ? "ning\xFAn hueco libre" : room.open === 1 ? "1 hueco libre" : `${room.open} huecos libres`} en ${room.days === 1 ? "el pr\xF3ximo d\xEDa" : `los pr\xF3ximos ${room.days} d\xEDas`} para ${plural(audience, "persona")}`;
const ES = {
  day: dayEs,
  hour: (hour) => `${(Math.floor(hour) % 24 + 24) % 24}:00`,
  reason: reasonEs,
  noText: "Los mensajes de texto no llevan ofertas.",
  without: (channel, why) => `Va sin ${channelEs(channel)}: ${reasonEs(why)}`,
  reviewing: (name) => `WhatsApp a\xFAn revisa la versi\xF3n de WhatsApp de \xAB${name}\xBB.`,
  reuseMessage: (name) => `Env\xEDa \xAB${name}\xBB, que ya est\xE1 en la Biblioteca, con la oferta en su texto.`,
  writeMessage: (name, on) => `Escribe un mensaje para ofertas, \xAB${name}\xBB, para ${joinWordsEs(on.map(channelEs))}: esta oferta va en su texto, y la pr\xF3xima tambi\xE9n podr\xE1 enviarlo.`,
  noteMade: (until) => `Avisa a la recepcionista de la oferta, hasta el ${until}.`,
  noteKnown: "La recepcionista ya tiene una nota sobre la oferta.",
  noteLeftOut: "La recepcionista no sabe de la oferta hasta que un due\xF1o o un socio a\xF1ada una nota.",
  monthsOfferPaused: (name, until) => `Pausa la oferta del mes, \xAB${name}\xBB, desde que apruebes el plan, para que nadie reciba dos ofertas; rean\xFAdala despu\xE9s del ${until}.`,
  firstSend: (list, day, at) => `La oferta va a \xAB${list}\xBB el ${day} a las ${at}.`,
  firstAtApprove: (list, at) => `La oferta va a \xAB${list}\xBB cuando la apruebes, porque hoy ya pasaron las ${at}.`,
  paced: (room, audience, cap) => `${roomEs(room, audience)}, as\xED que la oferta va como campa\xF1a: hasta ${cap} al d\xEDa, cada persona una vez, hasta que termine, desde que la apruebes.`,
  roomTight: (room, audience, from) => `${roomEs(room, audience)}, y el env\xEDo va a toda la lista a la vez: para ajustarla a los huecos, descarta el env\xEDo y p\xEDdemelo otra vez el ${from}.`,
  reviewFirst: "El env\xEDo se puede aprobar cuando WhatsApp haya revisado su versi\xF3n de WhatsApp.",
  whatsappReview: "Su versi\xF3n de WhatsApp espera la revisi\xF3n de WhatsApp, que puede seguir en el primer env\xEDo: quien la reciba por WhatsApp espera a que termine.",
  reminderAsk: (day, list) => `El ${day}, p\xEDdeme que env\xEDe un recordatorio a quien de \xAB${list}\xBB no haya reservado para entonces.`
};
const edged = (alternatives) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`, "iu");
const AWAY = edged([
  "tomorrow",
  "yesterday",
  "(?:next|coming) (?:week|weekend|month|year)",
  "in (?:a|one|two|three|\\d+) (?:days?|weeks?|months?)",
  "pasado ma\xF1ana",
  "(?<!(?:la|de|por|esta) )ma\xF1ana",
  "ayer",
  "(?:el |la )?pr\xF3xim[oa] (?:semana|fin de semana|mes|a\xF1o)",
  "(?:la semana|el fin de semana|el mes|el a\xF1o) que viene",
  "dentro de (?:un|una|dos|tres|\\d+) (?:d\xEDas?|semanas?|meses?)"
]);
const WITHIN = {
  day: (from, until) => from === until,
  week: (from, until) => mondayOf(from) === mondayOf(until),
  // A weekend's days are its week's Friday to Sunday.
  weekend: (from, until) => mondayOf(from) === mondayOf(until) && from >= shiftKey(mondayOf(from), 4),
  month: (from, until) => from.slice(0, 7) === until.slice(0, 7),
  year: (from, until) => from.slice(0, 4) === until.slice(0, 4)
};
const THIS = [
  ["day", edged(["today", "tonight", "this (?:morning|afternoon|evening)", "hoy", "esta (?:noche|tarde|ma\xF1ana)"])],
  ["weekend", edged(["this weekend", "este fin de semana"])],
  ["week", edged(["this week", "esta semana"])],
  ["month", edged(["this month", "este mes"])],
  ["year", edged(["this year", "este a\xF1o"])]
];
const THE_ASK = /^\s*(?:i want|i'd like|i would like|we want|we'd like|let's|can you|please|quiero|queremos|me gustaría|nos gustaría|puedes|por favor)\b/iu;
export function dayReadWrong(text, from, until) {
  const away = AWAY.exec(text)?.[0];
  if (away) return away;
  for (const [span, words] of THIS) {
    const said = words.exec(text)?.[0];
    if (said && !WITHIN[span](from, until)) return said;
  }
  return null;
}
export const isTheAsk = (text) => THE_ASK.test(text);
export const OFFER_PLAN_WORDS = { en: EN, es: ES };
