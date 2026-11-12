/**
 * What a video made from a business's clips says to a person (decision 0122), in the video's own language: its card before the
 * press and as the video is made, checked and ready; why a plan can't be made; why one asked for was not; and the bell's lines.
 * Every sentence a page or the bell says of one comes from here. A line is one fact, and a button a verb she would say.
 */
import { fileSaidOf } from "../files/views";
import type { PieceFail, PieceStage } from "./piece-making";
import type { PieceCount, PieceLanguage, PieceQuoteSource, PieceWont } from "./pieces";

/** What a video says to a person, in the video's own language. */
export interface PieceWords {
  cardTitle: (line: string) => string;
  /** What the card says of the video under its stills: how long, which way up, what from. True before the press and after it. */
  summary: (count: PieceCount, seconds: number) => string;
  /** The receipt of a press, true whenever it is read: that they may leave, where the video lands and what says so. */
  making: string;
  /** A press refused because the workspace's most are being made (PIECES_MAKING_MAX). */
  busy: string;
  /** A press in a workspace that keeps no videos (features.video_preview). */
  off: string;
  /** Where the stills stand when they could not be drawn, and what they are called for a reader that reads pictures out. */
  notDrawn: string;
  boardSaid: string;
  /**
   * The card once pressed, as the video's own row stands (piece-card.ts pieceStandsOf): being made, with where it is at; ready,
   * the moment it can be played; not made; or no longer in Content.
   */
  follows: {
    making: string;
    stage: Record<PieceStage, (parts: number) => string>;
    ready: string;
    /** Where a video that is ready is: its length is the card's own line. */
    readyWhere: string;
    open: string;
    failedMark: string;
    gone: string;
  };
  wont: Record<PieceWont, string>;
  /** What a before-and-after pair's two pictures are called. */
  pair: [string, string];
  /** Where a quote was said, under it. */
  quoteFrom: Record<PieceQuoteSource, string>;
  /** Why a video asked for was not made: the fact alone, which its card says over its Try again. */
  failed: Record<PieceFail, string>;
  /**
   * The bell's lines: one that can be played, and one that could not be made, which says the same fact and then what to do,
   * since a bell's row has no Try again of its own.
   */
  bell: {
    ready: string;
    readyBody: (name: string) => string;
    failed: string;
    failedBody: (reason: PieceFail) => string;
  };
}

/** A card's title: its opening line, without what leads into the next one (a comma, a dash), so it never ends mid-breath. */
const titled = (line: string): string => `Video: ${line.trim().replace(/[\s,;:\u2013\u2014-]+$/u, "")}`;

/** The words a summary is made of, in one language. */
interface SummaryWords {
  seconds: (n: number) => string;
  cards: (n: number) => string;
  moments: (n: number, from: string) => string;
  parts: (n: number, from: string) => string;
  clips: (n: number) => string;
  photos: (n: number) => string;
  both: string;
}

/** What a video is made from, as its card says it: its clips, its photos or both. */
function fromSaid(words: SummaryWords, count: PieceCount): string {
  if (count.photos === 0) return words.clips(count.clips);
  return count.clips === 0 ? words.photos(count.photos) : words.both;
}

/**
 * A card's summary: how long, which way up, and what from. Moments where every block is a clip's, parts where photos or
 * cards are among them, and cards of words where it shows no file at all.
 */
const summarized =
  (words: SummaryWords) =>
  (count: PieceCount, seconds: number): string => {
    const head = words.seconds(Math.round(seconds));
    if (count.clips + count.photos === 0) return `${head} ${words.cards(count.blocks)}`;
    const from = fromSaid(words, count);
    return `${head} ${count.moments === count.blocks ? words.moments(count.blocks, from) : words.parts(count.blocks, from)}`;
  };

/** Why a video was not made, and what a person does about each. */
const FAILED: Record<PieceFail, string> = {
  clips: "One of its clips or photos isn't in your Library any more, or can't be used yet.",
  draw: "It could not be drawn this time.",
  store: "It was drawn but could not be kept. Check there is room for it.",
  unknown: "It could not be made this time.",
};
const FAILED_NEXT: Record<PieceFail, string> = {
  clips: "Ask for it again once it is there.",
  draw: "Ask for it again.",
  store: "Then ask for it again.",
  unknown: "Ask for it again.",
};

/** In English, which is also what a video says where nothing names a language. */
export const PIECE_WORDS: PieceWords = {
  cardTitle: titled,
  summary: summarized({
    seconds: (n) => `${n} seconds, vertical.`,
    cards: (n) => `${n} cards of words.`,
    moments: (n, from) => `${n} moments from ${from}.`,
    parts: (n, from) => `${n} parts from ${from}.`,
    clips: (n) => (n === 1 ? "your clip" : `${n} of your clips`),
    photos: (n) => (n === 1 ? "your photo" : `${n} of your photos`),
    both: "your clips and photos",
  }),
  making: "You can close this. It lands in Content, under Made, and your bell says so.",
  busy: "Three videos are being made right now. Make this one once one of them is done.",
  off: "Videos aren't on for this workspace yet.",
  notDrawn: "The stills could not be drawn. Making it still works.",
  boardSaid: "Each part of the video in order, with its words where the video shows them",
  follows: {
    making: "Making it",
    stage: {
      queued: () => "Starting",
      waiting_clip: () => "Your clip is still being made ready, so this one takes longer: up to 20 minutes.",
      drawing: () => "Putting it together",
      saving: () => "Putting it in Content",
    },
    ready: "It's ready",
    readyWhere: "In Content, under Made.",
    open: "Open",
    failedMark: "Couldn't make it",
    gone: "This video isn't in Content any more.",
  },
  wont: {
    blocks: "A video takes two to six parts.",
    file: "One of its clips or photos isn't in your Library any more.",
    not_video: "That moment needs a video clip. That file is a picture.",
    not_photo: "That moment needs a photo. That file is a video.",
    made: "That was made here already. Use the clip or photo it came from.",
    unkept: "Keep that clip or photo in your Library first.",
    not_ready: "That clip is still being made ready. A video can use it once it is.",
    stretch: "One of the moments has no length. Choose where it starts and ends.",
    past_end: "One of the moments runs past the end of its clip.",
    block_length: "One of the parts is too short or too long to watch.",
    length: "The parts together run between 8 and 15 seconds.",
    people: "Someone in a clip or photo can be recognized. Say they agreed to be shown first.",
    lines: "The opening words are one or two short lines.",
    opens_on_card: "The opening words sit over a picture. This video opens on a card.",
    card: "A words card takes one to three short lines.",
    quote: "That quote is too long to read on a phone.",
    label: "A caption is one short line.",
  },
  pair: ["Before", "After"],
  quoteFrom: { google_review: "Google review", client: "A client" },
  failed: FAILED,
  bell: {
    ready: "Your video is ready",
    readyBody: (name) => `${fileSaidOf(name)} is in Content, under Made.`,
    failed: "Your video could not be made",
    failedBody: (reason) => `${FAILED[reason]} ${FAILED_NEXT[reason]}`,
  },
};

const FAILED_ES: Record<PieceFail, string> = {
  clips: "Uno de sus clips o fotos ya no está en tu Biblioteca, o todavía no se puede usar.",
  draw: "Esta vez no se pudo dibujar.",
  store: "Se dibujó pero no se pudo guardar. Revisa que haya espacio.",
  unknown: "Esta vez no se pudo hacer.",
};
const FAILED_NEXT_ES: Record<PieceFail, string> = {
  clips: "Pídelo de nuevo cuando esté ahí.",
  draw: "Pídelo de nuevo.",
  store: "Luego pídelo de nuevo.",
  unknown: "Pídelo de nuevo.",
};

const PIECE_WORDS_ES: PieceWords = {
  cardTitle: titled,
  summary: summarized({
    seconds: (n) => `${n} segundos, en vertical.`,
    cards: (n) => `${n} tarjetas de texto.`,
    moments: (n, from) => `${n} momentos de ${from}.`,
    parts: (n, from) => `${n} partes de ${from}.`,
    clips: (n) => (n === 1 ? "tu clip" : `${n} de tus clips`),
    photos: (n) => (n === 1 ? "tu foto" : `${n} de tus fotos`),
    both: "tus clips y fotos",
  }),
  making: "Puedes cerrar esto. Llega a Contenido, en Hecho, y tu campana te avisa.",
  busy: "Ahora mismo se están haciendo tres videos. Haz este cuando termine uno.",
  off: "Los videos todavía no están activos en este espacio.",
  notDrawn: "No se pudieron dibujar los cuadros. Aun así puedes hacerlo.",
  boardSaid: "Cada parte del video en orden, con su texto donde lo muestra el video",
  follows: {
    making: "Haciéndolo",
    stage: {
      queued: () => "Empezando",
      waiting_clip: () => "Tu clip todavía se está preparando, así que este tarda más: hasta 20 minutos.",
      drawing: () => "Armándolo",
      saving: () => "Guardándolo en Contenido",
    },
    ready: "Está listo",
    readyWhere: "En Contenido, en Hecho.",
    open: "Abrir",
    failedMark: "No se pudo hacer",
    gone: "Este video ya no está en Contenido.",
  },
  wont: {
    blocks: "Un video lleva de dos a seis partes.",
    file: "Uno de sus clips o fotos ya no está en tu Biblioteca.",
    not_video: "Ese momento necesita un clip de video. Ese archivo es una imagen.",
    not_photo: "Ese momento necesita una foto. Ese archivo es un video.",
    made: "Eso ya se hizo aquí. Usa el clip o la foto de donde salió.",
    unkept: "Guarda primero ese clip o esa foto en tu Biblioteca.",
    not_ready: "Ese clip todavía se está preparando. Un video puede usarlo cuando esté listo.",
    stretch: "Uno de los momentos no tiene duración. Elige dónde empieza y dónde termina.",
    past_end: "Uno de los momentos pasa del final de su clip.",
    block_length: "Una de las partes es demasiado corta o demasiado larga.",
    length: "Las partes juntas duran entre 8 y 15 segundos.",
    people: "En un clip o una foto se reconoce a alguien. Di primero que aceptó aparecer.",
    lines: "El texto de apertura es una o dos líneas cortas.",
    opens_on_card: "El texto de apertura va sobre una imagen. Este video empieza con una tarjeta.",
    card: "Una tarjeta de texto lleva de una a tres líneas cortas.",
    quote: "Esa cita es demasiado larga para leerla en un teléfono.",
    label: "Un rótulo es una línea corta.",
  },
  pair: ["Antes", "Después"],
  quoteFrom: { google_review: "Reseña en Google", client: "Cliente" },
  failed: FAILED_ES,
  bell: {
    ready: "Tu video está listo",
    readyBody: (name) => `${fileSaidOf(name)} está en Contenido, en Hecho.`,
    failed: "No se pudo hacer tu video",
    failedBody: (reason) => `${FAILED_ES[reason]} ${FAILED_NEXT_ES[reason]}`,
  },
};

/** What a video says, in its own language. */
export const pieceWordsIn = (language: PieceLanguage): PieceWords => (language === "es" ? PIECE_WORDS_ES : PIECE_WORDS);
