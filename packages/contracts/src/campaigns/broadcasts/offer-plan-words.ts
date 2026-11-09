/**
 * An offer's plan, said to the person in the question's language (PlanWorld.says), as a setup's is (journey/plan.ts):
 * contracts planOf (ask/plan/plan.ts) makes the steps, and these are the sentences of its answer's detail, which answerForCards
 * cuts at 700 characters, so what no card carries comes first there. Each language says the same sentences: the channel
 * the offer goes without and why, the message reused or written, the receptionist's note, the month's offer paused, the
 * room and the pace, WhatsApp's review, the day to ask for a reminder, and the send's day and hour. A channel's reason is
 * channelChoices' own, said in Spanish where contracts wrote it (reach-for.ts, email-offers.ts, whatsapp-offers.ts); one
 * of Meta's own words, or of a number's standing, is said as it was written. The plan's refusals stay English (PLAN_WORDS):
 * the model reads them and says them in the question's language. And what the owner's own words may not carry into a
 * message read on a later day: a day said from today, or the ask itself (planOf's offerValue).
 */
import type { PlanWorld } from "../../ask/plan/intents";
import { mondayOf, shiftKey } from "../../shared/zone/day-keys";
import { campaignDayWords, localDate } from "../playbooks/schedule";
import { clockHour } from "../../shared/clock";
import { dateFormat } from "../../shared/time";
import { joinWords, joinWordsEs, plural } from "../../shared/words";
import { versionWord } from "../templates/message-versions/channels";
import { OFFERS_BY_EMAIL_WORDS } from "./email-offers";
import { CHANNEL_WORDS } from "./reach-for";
import { US_PAUSED } from "./whatsapp-offers";

type OfferChannel = keyof PlanWorld["channels"];
type Room = NonNullable<PlanWorld["room"]>;

/** What an offer's plan says to the person, in one language. */
interface OfferWords {
  /** A day on the business's calendar (YYYY-MM-DD), as a sentence says it: "Nov 1", "1 de noviembre". */
  day: (key: string, tz: string, now: Date) => string;
  /** An hour on the business's clock: "10:00 AM", "10:00". */
  hour: (hour: number) => string;
  /** A channel's reason as channelChoices gives it, or that it was not checked where it gives none. */
  reason: (why: string | null) => string;
  /** Texts asked for beside another channel: dropped, since texts carry no offers. */
  noText: string;
  /** A channel the offer goes without, and why, as a card says a channel that waits (playbooks/channels.ts). */
  without: (channel: OfferChannel, why: string | null) => string;
  /** Why it goes without WhatsApp where the one message that carries it waits on WhatsApp's review (a send it holds). */
  reviewing: (name: string) => string;
  reuseMessage: (name: string) => string;
  writeMessage: (name: string, on: readonly OfferChannel[]) => string;
  noteMade: (until: string) => string;
  noteKnown: string;
  /** A note is an owner's or a partner's to approve (the settings card's role), and the member asking is neither. */
  noteLeftOut: string;
  /** The pause is a silent step: it applies at the plan's Approve, not on the offer's first day. */
  monthsOfferPaused: (name: string, until: string) => string;
  firstSend: (list: string, day: string, at: string) => string;
  firstAtApprove: (list: string, at: string) => string;
  /** An offer that starts today, on a calendar with less room than half its audience: a campaign of `cap` a day. */
  paced: (room: Room, audience: number, cap: number) => string;
  /** The same room for an offer that starts later: its send reaches the whole list, or is dismissed to pace it then. */
  roomTight: (room: Room, audience: number, from: string) => string;
  /** Its WhatsApp version unapproved, a send waits (sendWaitsForReview) at its press, whatever its day; its card says. */
  reviewFirst: string;
  /** A paced campaign by email too: approved now, its WhatsApp people held until the version is approved. */
  whatsappReview: string;
  /** The reminder, its own question on its day (who has booked is known then); short, to fit the answer whole. */
  reminderAsk: (day: string, list: string) => string;
  /** What the plan's one card says of each step (AskPlanStamp.does), and of the whole (AskPlanHead.sub). */
  does: {
    keeps: string;
    tells: (until: string) => string;
    pauses: (until: string) => string;
    paced: (cap: number, at: string) => string;
    once: (day: string, at: string) => string;
    atPress: string;
  };
  sub: (on: readonly OfferChannel[], until: string) => string;
  /** The one sentence an offer's answer says when the model's round cannot (the reason it has this shape). */
  why: { paced: string; tight: string; plain: string };
  /** The chips beside that sentence: the numbers it rests on. */
  chips: { slots: (n: number) => string; said: string; pace: string; hear: string };
}

const reasonEn = (reason: string | null): string => reason ?? CHANNEL_WORDS.unchecked;

/** "The calendar has 15 open slots in the next 14 days for 40 people". */
const roomEn = (room: Room, audience: number): string =>
  `The calendar has ${room.open > 0 ? plural(room.open, "open slot") : "no open slot"} in the next ${plural(room.days, "day")} for ${plural(audience, "person", "people")}`;

const EN: OfferWords = {
  day: campaignDayWords,
  hour: clockHour,
  reason: reasonEn,
  noText: CHANNEL_WORDS.noOffersByText,
  without: (channel, reason) => `It goes without ${versionWord(channel)}: ${reasonEn(reason)}`,
  reviewing: (name) => `WhatsApp is still reviewing the WhatsApp version of “${name}”.`,
  reuseMessage: (name) => `Sends “${name}”, already in your messages, with the offer in its words.`,
  writeMessage: (name, on) =>
    `Writes a message for offers, “${name}”, for ${joinWords(on.map(versionWord))}: this offer goes in its words, and the next offer can send it too.`,
  noteMade: (until) => `Tells the receptionist about the offer, until ${until}.`,
  noteKnown: "The receptionist already has a note about the offer.",
  noteLeftOut: "The receptionist is not told about the offer until an owner or a partner adds a note about it.",
  monthsOfferPaused: (name, until) =>
    `Pauses the month's offer, “${name}”, from when you approve it, so nobody gets two offers; resume it after ${until}.`,
  firstSend: (list, day, at) => `The offer goes to “${list}” on ${day} at ${at}.`,
  firstAtApprove: (list, at) => `The offer goes to “${list}” when you approve it, as ${at} today has passed.`,
  paced: (room, audience, cap) =>
    `${roomEn(room, audience)}, so the offer goes as a campaign: up to ${cap} a day, each person once, until it ends, starting when you approve it.`,
  roomTight: (room, audience, from) =>
    `${roomEn(room, audience)}, and the send goes to the whole list at once: to pace the offer to the room instead, dismiss the send and ask again on ${from}.`,
  reviewFirst: "The send can be approved once WhatsApp has reviewed its WhatsApp version.",
  whatsappReview:
    "Its WhatsApp version waits on WhatsApp's review, which may still be running at the first send: whoever it reaches on WhatsApp waits for it.",
  reminderAsk: (day, list) => `On ${day}, ask me to send a reminder to whoever on “${list}” has not booked by then.`,
  does: {
    keeps: "Keeps these words for your next offer.",
    tells: (until) => `Tells your receptionist, until ${until}.`,
    pauses: (until) => `Pauses your month's offer until ${until}, so nobody gets two.`,
    paced: (cap, at) => `Sends ${cap} a day at ${at}, each person once.`,
    once: (day, at) => `Goes to everyone on ${day} at ${at}, each person once.`,
    atPress: "Goes to everyone when you press, each person once.",
  },
  sub: (on, until) =>
    `${on.length === 1 && on[0] === "email" ? "By email" : on.length === 1 ? "On WhatsApp" : "On WhatsApp and by email"}, until ${until}`,
  why: {
    paced: "More people said yes than you have room for, so I paced it.",
    tight: "More people said yes than you have room for, so it would be worth pacing.",
    plain: "Everyone who said yes to offers can hear this.",
  },
  chips: {
    slots: (n) => (n === 1 ? "open slot" : "open slots"),
    said: "said yes",
    pace: "a day",
    hear: "can hear this",
  },
};

/** channelChoices' reasons for an offer's two channels, in Spanish: every one contracts writes for them. */
const REASONS_ES: ReadonlyMap<string, string> = new Map([
  [CHANNEL_WORDS.noWhatsApp, "Conecta primero un número de WhatsApp."],
  [CHANNEL_WORDS.noMailbox, "Configura primero el correo en Ajustes › Conexiones."],
  [CHANNEL_WORDS.noEmailDomain, "El correo aún no está activado en esta instalación."],
  [CHANNEL_WORDS.unchecked, "No se pudo comprobar ahora mismo."],
  [
    OFFERS_BY_EMAIL_WORDS.noCampaignsDomain,
    "Las ofertas por correo empiezan cuando esté listo el dominio de campañas.",
  ],
  [OFFERS_BY_EMAIL_WORDS.noAddress, "Añade la dirección de tu negocio para enviar ofertas por correo."],
  [OFFERS_BY_EMAIL_WORDS.paused, "Las ofertas por correo están en pausa mientras se calman las quejas y los rebotes."],
  [
    US_PAUSED,
    "Meta ha pausado las ofertas por WhatsApp a números de EE. UU. Los mensajes sobre citas y las respuestas siguen saliendo.",
  ],
]);

const reasonEs = (reason: string | null): string => {
  const sentence = reasonEn(reason);
  return REASONS_ES.get(sentence) ?? sentence;
};

/** A channel as a Spanish sentence names it. */
const channelEs = (channel: OfferChannel): string => (channel === "whatsapp" ? "WhatsApp" : "correo");

/** "1 de noviembre" on the business's calendar, with the year where it is not this year there ("5 de enero de 2027"). */
const dayEs = (key: string, tz: string, now: Date): string =>
  dateFormat("es", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    ...(key.slice(0, 4) === localDate(tz, now).slice(0, 4) ? {} : { year: "numeric" }),
  }).format(new Date(`${key}T12:00:00Z`));

/** "El calendario tiene 15 huecos libres en los próximos 14 días para 40 personas". */
const roomEs = (room: Room, audience: number): string =>
  `El calendario tiene ${room.open === 0 ? "ningún hueco libre" : room.open === 1 ? "1 hueco libre" : `${room.open} huecos libres`} en ${room.days === 1 ? "el próximo día" : `los próximos ${room.days} días`} para ${plural(audience, "persona")}`;

const ES: OfferWords = {
  day: dayEs,
  hour: (hour) => `${((Math.floor(hour) % 24) + 24) % 24}:00`,
  reason: reasonEs,
  noText: "Los mensajes de texto no llevan ofertas.",
  without: (channel, reason) => `Va sin ${channelEs(channel)}: ${reasonEs(reason)}`,
  reviewing: (name) => `WhatsApp aún revisa la versión de WhatsApp de «${name}».`,
  reuseMessage: (name) => `Envía «${name}», que ya está en la Biblioteca, con la oferta en su texto.`,
  writeMessage: (name, on) =>
    `Escribe un mensaje para ofertas, «${name}», para ${joinWordsEs(on.map(channelEs))}: esta oferta va en su texto, y la próxima también podrá enviarlo.`,
  noteMade: (until) => `Avisa a la recepcionista de la oferta, hasta el ${until}.`,
  noteKnown: "La recepcionista ya tiene una nota sobre la oferta.",
  noteLeftOut: "La recepcionista no sabe de la oferta hasta que un dueño o un socio añada una nota.",
  monthsOfferPaused: (name, until) =>
    `Pausa la oferta del mes, «${name}», desde que apruebes el plan, para que nadie reciba dos ofertas; reanúdala después del ${until}.`,
  firstSend: (list, day, at) => `La oferta va a «${list}» el ${day} a las ${at}.`,
  firstAtApprove: (list, at) => `La oferta va a «${list}» cuando la apruebes, porque hoy ya pasaron las ${at}.`,
  paced: (room, audience, cap) =>
    `${roomEs(room, audience)}, así que la oferta va como campaña: hasta ${cap} al día, cada persona una vez, hasta que termine, desde que la apruebes.`,
  roomTight: (room, audience, from) =>
    `${roomEs(room, audience)}, y el envío va a toda la lista a la vez: para ajustarla a los huecos, descarta el envío y pídemelo otra vez el ${from}.`,
  reviewFirst: "El envío se puede aprobar cuando WhatsApp haya revisado su versión de WhatsApp.",
  whatsappReview:
    "Su versión de WhatsApp espera la revisión de WhatsApp, que puede seguir en el primer envío: quien la reciba por WhatsApp espera a que termine.",
  reminderAsk: (day, list) =>
    `El ${day}, pídeme que envíe un recordatorio a quien de «${list}» no haya reservado para entonces.`,
  does: {
    keeps: "Guarda este texto para tu próxima oferta.",
    tells: (until) => `Avisa a tu recepcionista, hasta el ${until}.`,
    pauses: (until) => `Pausa tu oferta del mes hasta el ${until}, para que nadie reciba dos.`,
    paced: (cap, at) => `Envía ${cap} al día a las ${at}, a cada persona una vez.`,
    once: (day, at) => `Va a todos el ${day} a las ${at}, a cada persona una vez.`,
    atPress: "Va a todos cuando pulses, a cada persona una vez.",
  },
  sub: (on, until) =>
    `${on.length === 1 && on[0] === "email" ? "Por correo" : on.length === 1 ? "Por WhatsApp" : "Por WhatsApp y correo"}, hasta el ${until}`,
  why: {
    paced: "Más gente dijo que sí de la que cabe en tu calendario, así que lo repartí.",
    tight: "Más gente dijo que sí de la que cabe en tu calendario, así que convendría repartirlo.",
    plain: "Todos los que dijeron que sí a las ofertas pueden recibirla.",
  },
  chips: {
    slots: (n) => (n === 1 ? "hueco libre" : "huecos libres"),
    said: "dijeron que sí",
    pace: "al día",
    hear: "pueden recibirla",
  },
};

/** Letter-edged and in any case, as detectLanguage's hints are: "Monday" holds no "mon", "consultoría" no "a". */
const edged = (alternatives: readonly string[]): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`, "iu");

/**
 * A day said from today that never reads true on an offer's first day, in English or Spanish: one after it or before
 * it ("next month" read on Nov 1 is December, "tomorrow" read on Nov 1 is Nov 2). "Por la mañana" is a time of day,
 * never tomorrow.
 */
const AWAY = edged([
  "tomorrow",
  "yesterday",
  "(?:next|coming) (?:week|weekend|month|year)",
  "in (?:a|one|two|three|\\d+) (?:days?|weeks?|months?)",
  "pasado mañana",
  "(?<!(?:la|de|por|esta) )mañana",
  "ayer",
  "(?:el |la )?próxim[oa] (?:semana|fin de semana|mes|año)",
  "(?:la semana|el fin de semana|el mes|el año) que viene",
  "dentro de (?:un|una|dos|tres|\\d+) (?:días?|semanas?|meses?)",
]);

/** A span an offer may lie within, as a day key's calendar counts it (Monday the week's first day). */
type Span = "day" | "week" | "weekend" | "month" | "year";

/** Whether an offer from `from` to `until` lies within the span its first day reads a "this" as. */
const WITHIN: Record<Span, (from: string, until: string) => boolean> = {
  day: (from, until) => from === until,
  week: (from, until) => mondayOf(from) === mondayOf(until),
  // A weekend's days are its week's Friday to Sunday.
  weekend: (from, until) => mondayOf(from) === mondayOf(until) && from >= shiftKey(mondayOf(from), 4),
  month: (from, until) => from.slice(0, 7) === until.slice(0, 7),
  year: (from, until) => from.slice(0, 4) === until.slice(0, 4),
};

/** "This" spans, in English or Spanish: true on the offer's first day only where the offer lies within that span. */
const THIS: readonly [Span, RegExp][] = [
  ["day", edged(["today", "tonight", "this (?:morning|afternoon|evening)", "hoy", "esta (?:noche|tarde|mañana)"])],
  ["weekend", edged(["this weekend", "este fin de semana"])],
  ["week", edged(["this week", "esta semana"])],
  ["month", edged(["this month", "este mes"])],
  ["year", edged(["this year", "este año"])],
];

/** The ask itself, not the offer: what a customer must never read in its message. */
const THE_ASK =
  /^\s*(?:i want|i'd like|i would like|we want|we'd like|let's|can you|please|quiero|queremos|me gustaría|nos gustaría|puedes|por favor)\b/iu;

/**
 * The first day an offer's own words say from today that reads wrong on its first day, `from`, when its customers first
 * read it: one after or before it ("next month"), or a "this" span the offer does not lie within ("this weekend" for an
 * offer that runs all November); null where every one reads true then ("this weekend" for Saturday and Sunday).
 */
export function dayReadWrong(text: string, from: string, until: string): string | null {
  const away = AWAY.exec(text)?.[0];
  if (away) return away;
  for (const [span, words] of THIS) {
    const sentence = words.exec(text)?.[0];
    if (sentence && !WITHIN[span](from, until)) return sentence;
  }
  return null;
}

/** Whether the owner's phrasing is the ask itself ("I want to offer…", "Quiero ofrecer…"), not the offer. */
export const isTheAsk = (text: string): boolean => THE_ASK.test(text);

/** An offer's plan's words, by the language of the question (PlanWorld.says). */
export const OFFER_PLAN_WORDS: Readonly<Record<PlanWorld["says"], OfferWords>> = { en: EN, es: ES };
