/**
 * What Ask noticed, as a person reads it (D7, D19, D38 of the answers canvas): one thing at a time, with its numbers, and the
 * press that brings the plan for it. The workspace is read by code and the sentence is written here, so it costs no model
 * and says the same to every member; what it brings when pressed is an ordinary question to Ask.
 *
 * Which play fits which situation is this table (D38): a signal's key, what it says, what a press asks, and its weight. Each
 * new signal is a row here and a spot in the server's read. Claims: it never says it books, fills a calendar or that anything
 * happened because of what it did; a result says "since", never "because".
 */
import { joinWords, joinWordsEs } from "../shared/words";

/** What it noticed, in the order it is worth acting on: the highest weight first, then the first found. */
export interface AskNotice {
  key: string;
  says: string;
  /** The numbers it rests on, each opening where it was read. */
  figures: Array<{ value: string; label: string; to: string | null }>;
  /** What a press asks Ask, in the person's language; null where it opens a page instead. */
  ask: string | null;
  /** The field filled and left for them, where a press needs a word from them first ("Offer …"). */
  fill: string | null;
  /** Where a press goes, where the thing to do is on a page (D36: a gap is one step). */
  to: string | null;
}

/** What a spot read, by the facts each sentence needs. */
export interface AskNoticeFacts {
  people?: number;
  lists?: number;
  names?: readonly string[];
  leads?: number;
  searches?: number;
  replies?: number;
  sends?: number;
  never?: number;
  deals?: number;
  times?: number;
  open?: number;
  yes?: number;
  words?: string | null;
  list?: string | null;
  sent?: number;
  replied?: number;
  booked?: number;
  name?: string;
  channel?: string;
}

type Lang = "en" | "es";
type Row = {
  says: (f: AskNoticeFacts) => string;
  ask: (f: AskNoticeFacts) => string | null;
  fill?: (f: AskNoticeFacts) => string | null;
  to?: string;
};

const n = (v: number | undefined): number => v ?? 0;
const s = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** The plays (D38), in English. Starting values, to tune once real numbers exist. */
const EN: Readonly<Record<string, Row>> = {
  room_and_yes: {
    says: (f) => `${s(n(f.open), "open slot", "open slots")}, and ${n(f.yes)} said yes to offers.`,
    ask: (f) => (f.words ? `Offer “${f.words}” to everyone who said yes, paced to the room.` : null),
    fill: () => "Offer ",
  },
  nothing_sends_on_its_own: {
    says: (f) => `${s(n(f.people), "person", "people")}, and nothing sends on its own.`,
    ask: () => "Set up what should go out on its own: a welcome and a monthly offer.",
  },
  leads_not_written_to: {
    says: (f) =>
      `Your ${n(f.searches) === 1 ? "search" : "searches"} found ${s(n(f.leads), "lead", "leads")}. Nobody has been written to.`,
    ask: () => "Write a first email to the best of the leads I found.",
  },
  search_asks: { says: () => "A search waits for your answer.", ask: () => "What is my search asking me?" },
  replies_waiting: {
    says: (f) => `${s(n(f.replies), "reply waits", "replies wait")} in your sequences.`,
    ask: () => "Draft answers to the replies waiting in my sequences.",
  },
  batches_waiting: {
    says: (f) => `${s(n(f.sends), "send waits", "sends wait")} for your OK.`,
    ask: () => "Show me what is waiting for my OK before it sends.",
  },
  freed_times_unoffered: {
    says: (f) =>
      n(f.times) === 1
        ? "A time opened, and nobody has been offered it."
        : `${n(f.times)} times opened, and nobody has been offered them.`,
    ask: () => "Offer the time that opened to the people who asked about times.",
  },
  deals_without_a_step: {
    says: (f) => `${s(n(f.deals), "proposal is", "proposals are")} out with no next step.`,
    ask: () => "Add a next step to my open proposals.",
  },
  lists_feed_nothing: {
    says: (f) =>
      `${s(n(f.lists), "list feeds", "lists feed")} nothing: ${joinWords([...(f.names ?? [])].slice(0, 3))}.`,
    ask: () => "Start a sequence on the best of my lists.",
  },
  offers_never_asked: {
    says: (f) => `${s(n(f.never), "person was", "people were")} never asked about offers.`,
    ask: () => "How do I get more people to say yes to offers?",
  },
  offer_result: {
    says: (f) =>
      `${f.name}: ${n(f.sent)} sent, ${n(f.replied)} replied${n(f.booked) ? `, ${n(f.booked)} booked since` : ""}.`,
    ask: (f) => `How did “${f.name}” go, and what should I do next?`,
  },
  reviews_written: {
    says: (f) => `${s(n(f.replies), "review reply is", "review replies are")} written and waiting for your word.`,
    ask: () => null,
    to: "reports/reviews",
  },
  channel_gap: {
    says: (f) => `${f.channel} is not set up, so offers cannot go that way yet.`,
    ask: () => null,
    to: "admin/connections",
  },
};

/** The same, in Spanish. */
const ES: Readonly<Record<string, Row>> = {
  room_and_yes: {
    says: (f) => `${s(n(f.open), "hueco libre", "huecos libres")}, y ${n(f.yes)} dijeron que sí a las ofertas.`,
    ask: (f) => (f.words ? `Ofrece «${f.words}» a todos los que dijeron que sí, repartido según los huecos.` : null),
    fill: () => "Ofrece ",
  },
  nothing_sends_on_its_own: {
    says: (f) => `${s(n(f.people), "persona", "personas")}, y nada sale por su cuenta.`,
    ask: () => "Configura lo que debe salir por su cuenta: una bienvenida y una oferta mensual.",
  },
  leads_not_written_to: {
    says: (f) => `Tus búsquedas encontraron ${s(n(f.leads), "lead", "leads")}. Nadie les ha escrito.`,
    ask: () => "Escribe un primer correo a los mejores leads que encontré.",
  },
  search_asks: { says: () => "Una búsqueda espera tu respuesta.", ask: () => "¿Qué me pregunta mi búsqueda?" },
  replies_waiting: {
    says: (f) => `${s(n(f.replies), "respuesta espera", "respuestas esperan")} en tus secuencias.`,
    ask: () => "Redacta contestaciones a las respuestas que esperan en mis secuencias.",
  },
  batches_waiting: {
    says: (f) => `${s(n(f.sends), "envío espera", "envíos esperan")} tu visto bueno.`,
    ask: () => "Muéstrame lo que espera mi visto bueno antes de salir.",
  },
  freed_times_unoffered: {
    says: (f) =>
      n(f.times) === 1
        ? "Se liberó un hueco y nadie lo ha ofrecido."
        : `Se liberaron ${n(f.times)} huecos y nadie los ha ofrecido.`,
    ask: () => "Ofrece el hueco liberado a quienes preguntaron por horas.",
  },
  deals_without_a_step: {
    says: (f) => `${s(n(f.deals), "propuesta está", "propuestas están")} fuera sin siguiente paso.`,
    ask: () => "Añade un siguiente paso a mis propuestas abiertas.",
  },
  lists_feed_nothing: {
    says: (f) =>
      `${s(n(f.lists), "lista no alimenta", "listas no alimentan")} nada: ${joinWordsEs([...(f.names ?? [])].slice(0, 3))}.`,
    ask: () => "Empieza una secuencia con la mejor de mis listas.",
  },
  offers_never_asked: {
    says: (f) => `A ${s(n(f.never), "persona", "personas")} nunca se les preguntó por ofertas.`,
    ask: () => "¿Cómo consigo que más gente diga que sí a las ofertas?",
  },
  offer_result: {
    says: (f) =>
      `${f.name}: ${n(f.sent)} enviados, ${n(f.replied)} respondieron${n(f.booked) ? `, ${n(f.booked)} reservaron desde entonces` : ""}.`,
    ask: (f) => `¿Cómo fue «${f.name}» y qué hago ahora?`,
  },
  reviews_written: {
    says: (f) =>
      `${s(n(f.replies), "respuesta a una reseña está escrita", "respuestas a reseñas están escritas")} y esperan tu palabra.`,
    ask: () => null,
    to: "reports/reviews",
  },
  channel_gap: {
    says: (f) => `${f.channel} no está configurado, así que las ofertas aún no pueden ir por ahí.`,
    ask: () => null,
    to: "admin/connections",
  },
};

/** The order a notice is worth acting on, first first: money and time before the slow ones. */
export const ASK_NOTICE_ORDER: readonly string[] = [
  "search_asks",
  "freed_times_unoffered",
  "replies_waiting",
  "batches_waiting",
  "reviews_written",
  "room_and_yes",
  "offer_result",
  "leads_not_written_to",
  "nothing_sends_on_its_own",
  "deals_without_a_step",
  "channel_gap",
  "lists_feed_nothing",
  "offers_never_asked",
];

/** What a signal becomes as a person reads it; null for a key with no play yet. */
export function noticeOf(
  key: string,
  facts: AskNoticeFacts,
  language: string,
  figures: AskNotice["figures"] = [],
): AskNotice | null {
  const row = (language === "es" ? ES : EN)[key];
  if (!row) return null;
  return {
    key,
    says: row.says(facts),
    figures,
    ask: row.ask(facts),
    fill: row.fill?.(facts) ?? null,
    to: row.to ?? null,
  };
}

/** The notices in the order they are worth acting on, less what this member rested. */
export function noticesInOrder(notices: readonly AskNotice[], rested: (key: string) => boolean): AskNotice[] {
  const rank = (k: string) => {
    const at = ASK_NOTICE_ORDER.indexOf(k);
    return at < 0 ? ASK_NOTICE_ORDER.length : at;
  };
  return notices.filter((x) => !rested(x.key)).sort((a, b) => rank(a.key) - rank(b.key));
}

/** The card id a notice is rested under, in the same store as what Ask noticed before (AskRested). */
export const noticeRestId = (key: string): string => `notice:${key}`;

export const ASK_LANGS: readonly Lang[] = ["en", "es"];

/**
 * Who can hear a send (D23 of the answers canvas), one sentence for the card and the page alike: how many of how many, why the
 * rest wait, and what a channel's pause means. Nothing where everyone can.
 */
export function whoCanHearWords(
  at: { can: number; of: number; leftOut: number; paused: string | null },
  language: string,
): string | null {
  if (at.of <= 0 || (at.can >= at.of && !at.paused)) return null;
  const es = language === "es";
  const heard =
    at.leftOut > 0 &&
    (es
      ? `${at.leftOut} ya supieron de ti esta semana, así que van la próxima.`
      : `${at.leftOut} heard from you this week, so ${at.leftOut === 1 ? "they go" : "they go"} next week.`);
  const parts = [
    es ? `${at.can} de ${at.of} pueden recibirlo.` : `${at.can} of ${at.of} can hear this.`,
    ...(heard ? [heard] : []),
    ...(at.paused ? [at.paused] : []),
  ];
  return parts.join(" ");
}
