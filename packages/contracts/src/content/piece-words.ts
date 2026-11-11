/**
 * What a video made from a business's clips says to a person (decision 0122), in the video's own language: its card before the
 * press and as the video is made, checked and ready; why a plan can't be made; why one asked for was not; and the bell's lines.
 * Every sentence a page or the bell says of one comes from here. A line is one fact, and a button a verb she would say.
 */
import type { PieceFail, PieceStage } from "./piece-making";
import type { PieceLanguage, PieceWont } from "./pieces";

/** What a video says to a person, in the video's own language. */
export interface PieceWords {
  cardTitle: (line: string) => string;
  /** What the card says of the video under its stills: how long, which way up, what from. True before the press and after it. */
  summary: (moments: number, seconds: number, clips: number) => string;
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
   * The card once pressed, as the video's own row stands (piece-card.ts pieceStandsOf): being made, with where it is at;
   * made and being looked at; ready; not made; or no longer in Files.
   */
  follows: {
    making: string;
    stage: Record<PieceStage, (moments: number) => string>;
    checkingMark: string;
    checking: string;
    ready: string;
    /** Where a video that is ready is: its length is the card's own line. */
    readyWhere: string;
    open: string;
    failedMark: string;
    gone: string;
  };
  wont: Record<PieceWont, string>;
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

/** Why a video was not made, and what a person does about each. */
const FAILED: Record<PieceFail, string> = {
  clips: "One of its clips isn't in Files any more, or can't be used yet.",
  draw: "It could not be drawn this time.",
  store: "It was drawn but could not be kept in Files. Check there is room for it.",
  unknown: "It could not be made this time.",
};
const FAILED_NEXT: Record<PieceFail, string> = {
  clips: "Ask for it again once the clip is there.",
  draw: "Ask for it again.",
  store: "Then ask for it again.",
  unknown: "Ask for it again.",
};

/** In English, which is also what a video says where nothing names a language. */
export const PIECE_WORDS: PieceWords = {
  cardTitle: (line) => `Video: ${line}`,
  summary: (moments, seconds, clips) =>
    `${Math.round(seconds)} seconds, vertical. ${moments} moments from ${clips === 1 ? "your clip" : `${clips} of your clips`}.`,
  making: "You can close this. It lands in Files, under Made by Ask, and your bell says so.",
  busy: "Three videos are being made right now. Make this one once one of them is done.",
  off: "Videos aren't on for this workspace yet.",
  notDrawn: "The stills could not be drawn. Making it still works.",
  boardSaid: "The first frame of each moment, with the opening words where the video shows them",
  follows: {
    making: "Making it",
    stage: {
      queued: () => "Starting",
      waiting_clip: () => "Your clip is still being made ready, so this one takes longer: up to 20 minutes.",
      drawing: (moments) => `Cutting ${moments} moments`,
      saving: () => "Putting it in Files",
    },
    checkingMark: "Ask is checking",
    checking: "Made. Ask looks at it before you do.",
    ready: "It's ready",
    readyWhere: "In Files, under Made by Ask.",
    open: "Open",
    failedMark: "Couldn't make it",
    gone: "This video isn't in Files any more.",
  },
  wont: {
    cuts: "A video takes two to five moments from your clips.",
    file: "One of the clips isn't in Files any more.",
    not_video: "A video is made from video clips. That file is a picture.",
    made: "That's a video made here already. Use the clips it came from.",
    unkept: "Keep that clip in Files first.",
    not_ready: "That clip is still being made ready. A video can use it once it is.",
    stretch: "One of the moments has no length. Choose where it starts and ends.",
    past_end: "One of the moments runs past the end of its clip.",
    cut_length: "Each moment runs between a second and a half and four seconds.",
    length: "The moments together run between 8 and 15 seconds.",
    people: "Someone in a clip can be recognized. Say they agreed to be shown first.",
    lines: "The opening words are one or two short lines.",
  },
  failed: FAILED,
  bell: {
    ready: "Your video is ready",
    readyBody: (name) => `${name} is in Files, under Made by Ask.`,
    failed: "Your video could not be made",
    failedBody: (reason) => `${FAILED[reason]} ${FAILED_NEXT[reason]}`,
  },
};

const FAILED_ES: Record<PieceFail, string> = {
  clips: "Uno de sus clips ya no está en Archivos, o todavía no se puede usar.",
  draw: "Esta vez no se pudo dibujar.",
  store: "Se dibujó pero no se pudo guardar en Archivos. Revisa que haya espacio.",
  unknown: "Esta vez no se pudo hacer.",
};
const FAILED_NEXT_ES: Record<PieceFail, string> = {
  clips: "Pídelo de nuevo cuando el clip esté ahí.",
  draw: "Pídelo de nuevo.",
  store: "Luego pídelo de nuevo.",
  unknown: "Pídelo de nuevo.",
};

const PIECE_WORDS_ES: PieceWords = {
  cardTitle: (line) => `Video: ${line}`,
  summary: (moments, seconds, clips) =>
    `${Math.round(seconds)} segundos, en vertical. ${moments} momentos de ${clips === 1 ? "tu clip" : `${clips} de tus clips`}.`,
  making: "Puedes cerrar esto. Llega a Archivos, en Hecho por Ask, y tu campana te avisa.",
  busy: "Ahora mismo se están haciendo tres videos. Haz este cuando termine uno.",
  off: "Los videos todavía no están activos en este espacio.",
  notDrawn: "No se pudieron dibujar los cuadros. Aun así puedes hacerlo.",
  boardSaid: "El primer cuadro de cada momento, con el texto de apertura donde lo muestra el video",
  follows: {
    making: "Haciéndolo",
    stage: {
      queued: () => "Empezando",
      waiting_clip: () => "Tu clip todavía se está preparando, así que este tarda más: hasta 20 minutos.",
      drawing: (moments) => `Cortando ${moments} momentos`,
      saving: () => "Guardándolo en Archivos",
    },
    checkingMark: "Ask lo está revisando",
    checking: "Hecho. Ask lo mira antes que tú.",
    ready: "Está listo",
    readyWhere: "En Archivos, en Hecho por Ask.",
    open: "Abrir",
    failedMark: "No se pudo hacer",
    gone: "Este video ya no está en Archivos.",
  },
  wont: {
    cuts: "Un video lleva de dos a cinco momentos de tus clips.",
    file: "Uno de los clips ya no está en Archivos.",
    not_video: "Un video se hace con clips de video. Ese archivo es una imagen.",
    made: "Ese video ya se hizo aquí. Usa los clips de los que salió.",
    unkept: "Guarda primero ese clip en Archivos.",
    not_ready: "Ese clip todavía se está preparando. Un video puede usarlo cuando esté listo.",
    stretch: "Uno de los momentos no tiene duración. Elige dónde empieza y dónde termina.",
    past_end: "Uno de los momentos pasa del final de su clip.",
    cut_length: "Cada momento dura entre un segundo y medio y cuatro segundos.",
    length: "Los momentos juntos duran entre 8 y 15 segundos.",
    people: "En un clip se reconoce a alguien. Di primero que aceptó aparecer.",
    lines: "El texto de apertura es una o dos líneas cortas.",
  },
  failed: FAILED_ES,
  bell: {
    ready: "Tu video está listo",
    readyBody: (name) => `${name} está en Archivos, en Hecho por Ask.`,
    failed: "No se pudo hacer tu video",
    failedBody: (reason) => `${FAILED_ES[reason]} ${FAILED_NEXT_ES[reason]}`,
  },
};

/** What a video says, in its own language. */
export const pieceWordsIn = (language: PieceLanguage): PieceWords => (language === "es" ? PIECE_WORDS_ES : PIECE_WORDS);
