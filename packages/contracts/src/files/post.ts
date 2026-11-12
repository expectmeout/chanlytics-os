/**
 * A post made from a photo, by code (decision 0099, step 3): what is asked for, in what a card reads, with nothing behind it to
 * ride into a page. No model touches the pixels and it costs nothing, so the card is the real picture and changing its words is
 * free. What may be said is post-check.ts's.
 */
/** The shapes a post is made in. Portrait is the file itself, and what a card shows first. */
export const POST_SHAPES = ["portrait", "square", "story"] as const;
export type PostShapeName = (typeof POST_SHAPES)[number];

/** What a picture can be drawn as: those, and the wide one Google shows a post in, drawn only as it goes there. */
export const POST_PICTURES = [...POST_SHAPES, "wide"] as const;
export type PostPicture = (typeof POST_PICTURES)[number];

/** Whose voice the words are set in: a serif's, or a plain sans's. */
export const POST_VOICES = ["classic", "modern"] as const;
export type PostVoice = (typeof POST_VOICES)[number];

/**
 * How the words stand with the photo: `over` it on a dark scrim, centred; `left` over it, set from the margin as a magazine does;
 * on a `band` of the business's colour beside it; or under it on a plain page, the photo in a `frame`.
 */
export const POST_LAYOUTS = ["over", "left", "band", "frame"] as const;
export type PostLayoutName = (typeof POST_LAYOUTS)[number];

/** How much each part of a post may say and still read on a phone. */
export const POST_LIMITS = { line: 60, over: 32, under: 80 } as const;

/** The two languages a post is worded in. */
export type PostLanguage = "en" | "es";

/** What a post is asked to be: the same on the card, at its preview and at its Save, so what they saw is what is kept. */
export type PostPlan = {
  file_id: string;
  line: string;
  over: string | null;
  under: string | null;
  /** The band with the business's own number; code writes it, so a number is never typed. */
  book: boolean;
  words_at: "top" | "bottom";
  voice: PostVoice;
  layout: PostLayoutName;
  language: PostLanguage;
  /** The owner said in this thread that the people in the photo agreed: their word, kept on the photo as it is saved. */
  people_agreed: boolean;
  /** Where the photo is a moment of a video: that moment, in seconds from its start. Null for a photo. */
  at: number | null;
};

/** The plan a card carries, read back: a card's payload is JSON, and a page's reading of it is never a second shape. */
export function postPlanOf(payload: Record<string, unknown>): PostPlan {
  const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  return {
    file_id: text(payload.file_id) ?? "",
    line: text(payload.line) ?? "",
    over: text(payload.over),
    under: text(payload.under),
    book: payload.book === true,
    words_at: payload.words_at === "top" ? "top" : "bottom",
    voice: payload.voice === "modern" ? "modern" : "classic",
    layout: POST_LAYOUTS.find((l) => l === payload.layout) ?? "over",
    language: payload.language === "es" ? "es" : "en",
    people_agreed: payload.people_agreed === true,
    at: typeof payload.at === "number" && Number.isFinite(payload.at) && payload.at >= 0 ? payload.at : null,
  };
}

/**
 * Words drawn on a picture, as sentences a person reads or hears: each part ended where it has no end of its own. What a
 * caption starts from on the post's sheet, and what Instagram reads out for the picture; "" when there are none.
 */
export function postSentencesOf(parts: readonly (string | null)[]): string {
  return parts
    .filter((w): w is string => !!w)
    .map((w) => (/[.!?]$/.test(w) ? w : `${w}.`))
    .join(" ");
}

/** A plan as it goes out: what was typed, with the spaces a person leaves while typing taken off, and an empty part no part. */
export function postPlanTidied(plan: PostPlan): PostPlan {
  return { ...plan, line: plan.line.trim(), over: plan.over?.trim() || null, under: plan.under?.trim() || null };
}

/** Why some words can't go on a picture, whoever wrote them. Each is said to the model and to a person in their own words. */
export type PostUndrawable = "long" | "character" | "contact" | "number";

/** Why a file can't be a post's photo. Like the words, each is said to the model and to a person in their own words. */
export type PostPhotoWont = "made" | "unkept" | "design" | "video" | "moment";

/**
 * Why this file can't be a post's photo, or null: it is a video not ready yet (a post is drawn from one moment of it, which
 * only a ready one gives), a post already, or it isn't kept yet, or it has a design of its own that more words would clash
 * with. Here, with nothing behind it, so a page can ask before it offers the press.
 */
export function postPhotoWont(fields: {
  status: string;
  source: string;
  shows: string | null;
  kind?: string | undefined;
  media_status?: string | null | undefined;
}): PostPhotoWont | null {
  if (fields.kind === "video" && fields.media_status !== "ready") return "video";
  if (fields.source === "made") return "made";
  if (fields.status !== "filed") return "unkept";
  if (fields.shows === "graphic" || fields.shows === "logo") return "design";
  return null;
}

/** How far past a clip's end a moment may be named and still be its last frame: a length read to the hundredth is not the frame's. */
const MOMENT_SLACK_S = 0.05;

/**
 * Why this moment can't be a post's photo, or null: a video's post is drawn from one moment of it, named and inside the clip. A
 * photo has no moment, so any named for one is no problem of its own: it is not read.
 */
export function postMomentWont(
  fields: { kind?: string | undefined; seconds?: number | null | undefined },
  at: number | null,
): PostPhotoWont | null {
  if (fields.kind !== "video") return null;
  return at === null || at > (fields.seconds ?? 0) + MOMENT_SLACK_S ? "moment" : null;
}

/** What a post says to a person, in the post's own language. */
export interface PostWords {
  cardTitle: (line: string) => string;
  /** What the card says under the picture, true before the press and after it. */
  summary: (fileName: string) => string;
  save: string;
  saved: (name: string) => string;
  /** A post's new version, saved beside the first: what the toast says, where a line under its fields said it before. */
  savedNew: (name: string) => string;
  saveNew: string;
  /** A tap on the picture being changed: it opens full size, in a tab of its own (Content's Change it). */
  full: string;
  cancel: string;
  removed: string;
  undo: string;
  notDrawn: string;
  download: string;
  share: string;
  shareFailed: string;
  gone: string;
  openInContent: string;
  shapesSaid: string;
  shapes: Record<PostShapeName, string>;
  edit: string;
  editDone: string;
  line: string;
  over: string;
  under: string;
  /** The presses that open a line above and below, where the editor folds the empty ones away (post-edit.tsx `fold`). */
  addOver: string;
  addUnder: string;
  needsLine: string;
  voiceSaid: string;
  voices: Record<PostVoice, string>;
  layoutSaid: string;
  layouts: Record<PostLayoutName, string>;
  wordsAtSaid: string;
  wordsAt: Record<PostPlan["words_at"], string>;
  band: string;
  bandOn: string;
  bandOff: string;
  undrawable: Record<PostUndrawable, string>;
  photoWont: Record<PostPhotoWont, string>;
}

/** In English, which is also what a post says where nothing names a language. */
export const POST_WORDS = {
  cardTitle: (line: string) => `Post: ${line}`,
  summary: (fileName: string) => `From ${fileName}. Comes in portrait, square and story.`,
  save: "Save to Content",
  saved: (name: string) => `Saved to Content as ${name}`,
  savedNew: (name: string) => `Saved as ${name}. The first one stays.`,
  saveNew: "Save as new",
  full: "Open full size",
  cancel: "Cancel",
  removed: "Taken out of Content",
  undo: "Undo",
  notDrawn: "The picture could not be drawn. Saving still works.",
  download: "Download",
  share: "Share",
  shareFailed: "Sharing didn't open. Download it instead.",
  gone: "This post isn't in Content any more.",
  openInContent: "Open in Content",
  shapesSaid: "Shape",
  shapes: { portrait: "Portrait", square: "Square", story: "Story" },
  edit: "Edit",
  editDone: "Done",
  line: "Headline",
  over: "Above it",
  under: "Below it",
  addOver: "Line above",
  addUnder: "Line below",
  needsLine: "Give it a headline.",
  voiceSaid: "Type",
  voices: { classic: "Classic", modern: "Modern" },
  layoutSaid: "Layout",
  layouts: { over: "Over photo", left: "Left", band: "Band", frame: "Frame" },
  wordsAtSaid: "Words",
  wordsAt: { top: "Top", bottom: "Bottom" },
  band: "Number",
  bandOn: "On the post",
  bandOff: "Left off",
  undrawable: {
    long: "That's too long to read on a phone.",
    character: "That has a character the post can't draw, such as an emoji.",
    contact: "Links and emails don't go on a post.",
    number: "Put your number on with the button below, rather than typing it.",
  },
  photoWont: {
    made: "That's a post already. Use the photo it came from.",
    unkept: "Keep this photo in your Library first.",
    design: "This picture already has words or a design on it, so more would clash.",
    video: "This video is still being made ready. A post can use it once it is.",
    moment: "Choose the moment of the video the post is made from.",
  },
} as const satisfies PostWords;

const POST_WORDS_ES: PostWords = {
  cardTitle: (line) => `Publicación: ${line}`,
  summary: (fileName) => `De ${fileName}. En vertical, cuadrado e historia.`,
  save: "Guardar en Contenido",
  saved: (name) => `Guardada en Contenido como ${name}`,
  savedNew: (name) => `Guardada como ${name}. La primera se queda.`,
  saveNew: "Guardar como nueva",
  full: "Abrir a tamaño completo",
  cancel: "Cancelar",
  removed: "Quitada de Contenido",
  undo: "Deshacer",
  notDrawn: "No se pudo dibujar la imagen. Aun así puedes guardarla.",
  download: "Descargar",
  share: "Compartir",
  shareFailed: "No se pudo abrir compartir. Descárgala.",
  gone: "Esta publicación ya no está en Contenido.",
  openInContent: "Abrir en Contenido",
  shapesSaid: "Formato",
  shapes: { portrait: "Vertical", square: "Cuadrado", story: "Historia" },
  edit: "Editar",
  editDone: "Listo",
  line: "Titular",
  over: "Encima",
  under: "Debajo",
  addOver: "Línea arriba",
  addUnder: "Línea abajo",
  needsLine: "Escribe un titular.",
  voiceSaid: "Letra",
  voices: { classic: "Clásica", modern: "Moderna" },
  layoutSaid: "Diseño",
  layouts: { over: "Sobre la foto", left: "Izquierda", band: "Banda", frame: "Marco" },
  wordsAtSaid: "Texto",
  wordsAt: { top: "Arriba", bottom: "Abajo" },
  band: "Teléfono",
  bandOn: "En la publicación",
  bandOff: "Sin teléfono",
  undrawable: {
    long: "Es demasiado largo para leerlo en un teléfono.",
    character: "Tiene un carácter que la publicación no puede dibujar, como un emoji.",
    contact: "Los enlaces y correos no van en una publicación.",
    number: "Pon tu teléfono con el botón de abajo, en vez de escribirlo.",
  },
  photoWont: {
    made: "Eso ya es una publicación. Usa la foto de la que salió.",
    unkept: "Guarda primero esta foto en tu Biblioteca.",
    design: "Esta imagen ya tiene texto o un diseño, y más texto chocaría.",
    video: "Este video todavía se está preparando. Una publicación puede usarlo cuando esté listo.",
    moment: "Elige el momento del video con el que se hace la publicación.",
  },
};

/** What a post says, in its own language. */
export const postWordsIn = (language: PostLanguage): PostWords => (language === "es" ? POST_WORDS_ES : POST_WORDS);

/** What the model is told where a post needs a number and the business has none. */
export const POST_NO_PHONE =
  "there is no phone number in Settings to put on the band: leave book off, or ask them to add it";
