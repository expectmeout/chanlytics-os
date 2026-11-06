/**
 * A post made from a photo, by code (decision 0099, step 3): what is asked for, in what a card reads, with nothing behind it to
 * ride into a page. No model touches the pixels and it costs nothing, so the card is the real picture and changing its words is
 * free. What may be said is post-check.ts's.
 */
/** The shapes a post is made in. Portrait is the file itself, and what a card shows first. */
export const POST_SHAPES = ["portrait", "square", "story"] as const;
export type PostShapeName = (typeof POST_SHAPES)[number];

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
  };
}

/** A plan as it goes out: what was typed, with the spaces a person leaves while typing taken off, and an empty part no part. */
export function postPlanTidied(plan: PostPlan): PostPlan {
  return { ...plan, line: plan.line.trim(), over: plan.over?.trim() || null, under: plan.under?.trim() || null };
}

/** Why some words can't go on a picture, whoever wrote them. Each is said to the model and to a person in their own words. */
export type PostUndrawable = "long" | "character" | "contact" | "number";

/** What a post says to a person, in the post's own language. */
export interface PostWords {
  cardTitle: (line: string) => string;
  /** What the card says under the picture, true before the press and after it. */
  summary: (fileName: string) => string;
  save: string;
  saved: (name: string) => string;
  removed: string;
  undo: string;
  notDrawn: string;
  download: string;
  share: string;
  shareFailed: string;
  gone: string;
  openInFiles: string;
  shapesSaid: string;
  shapes: Record<PostShapeName, string>;
  edit: string;
  editDone: string;
  line: string;
  over: string;
  under: string;
  needsLine: string;
  voiceSaid: string;
  voices: Record<PostVoice, string>;
  layoutSaid: string;
  layouts: Record<PostLayoutName, string>;
  wordsAtSaid: string;
  wordsAt: Record<PostPlan["words_at"], string>;
  band: string;
  undrawable: Record<PostUndrawable, string>;
}

/** In English, which is also what a post says where nothing names a language. */
export const POST_WORDS = {
  cardTitle: (line: string) => `Post: ${line}`,
  summary: (fileName: string) => `From ${fileName}. Comes in portrait, square and story.`,
  save: "Save to Files",
  saved: (name: string) => `Saved to Files as ${name}`,
  removed: "Taken out of Files",
  undo: "Undo",
  notDrawn: "The picture could not be drawn. Saving still works.",
  download: "Download",
  share: "Share",
  shareFailed: "Sharing didn't open. Download it instead.",
  gone: "This post isn't in Files any more.",
  openInFiles: "Open in Files",
  shapesSaid: "Shape",
  shapes: { portrait: "Portrait", square: "Square", story: "Story" },
  edit: "Edit",
  editDone: "Done",
  line: "Headline",
  over: "Above it",
  under: "Below it",
  needsLine: "Give it a headline.",
  voiceSaid: "Type",
  voices: { classic: "Classic", modern: "Modern" },
  layoutSaid: "Layout",
  layouts: { over: "Over photo", left: "Left", band: "Band", frame: "Frame" },
  wordsAtSaid: "Words",
  wordsAt: { top: "Top", bottom: "Bottom" },
  band: "Phone number",
  undrawable: {
    long: "That's too long to read on a phone.",
    character: "That has a character the post can't draw, such as an emoji.",
    contact: "Links and emails don't go on a post.",
    number: "Turn on Phone number rather than typing it.",
  },
} as const satisfies PostWords;

const POST_WORDS_ES: PostWords = {
  cardTitle: (line) => `Publicación: ${line}`,
  summary: (fileName) => `De ${fileName}. En vertical, cuadrado e historia.`,
  save: "Guardar en Archivos",
  saved: (name) => `Guardada en Archivos como ${name}`,
  removed: "Quitada de Archivos",
  undo: "Deshacer",
  notDrawn: "No se pudo dibujar la imagen. Aun así puedes guardarla.",
  download: "Descargar",
  share: "Compartir",
  shareFailed: "No se pudo abrir compartir. Descárgala.",
  gone: "Esta publicación ya no está en Archivos.",
  openInFiles: "Abrir en Archivos",
  shapesSaid: "Formato",
  shapes: { portrait: "Vertical", square: "Cuadrado", story: "Historia" },
  edit: "Editar",
  editDone: "Listo",
  line: "Titular",
  over: "Encima",
  under: "Debajo",
  needsLine: "Escribe un titular.",
  voiceSaid: "Letra",
  voices: { classic: "Clásica", modern: "Moderna" },
  layoutSaid: "Diseño",
  layouts: { over: "Sobre la foto", left: "Izquierda", band: "Banda", frame: "Marco" },
  wordsAtSaid: "Texto",
  wordsAt: { top: "Arriba", bottom: "Abajo" },
  band: "Teléfono",
  undrawable: {
    long: "Es demasiado largo para leerlo en un teléfono.",
    character: "Tiene un carácter que la publicación no puede dibujar, como un emoji.",
    contact: "Los enlaces y correos no van en una publicación.",
    number: "Activa Teléfono en vez de escribirlo.",
  },
};

/** What a post says, in its own language. */
export const postWordsIn = (language: PostLanguage): PostWords => (language === "es" ? POST_WORDS_ES : POST_WORDS);

/** What the model is told where a post needs a number and the business has none. */
export const POST_NO_PHONE =
  "there is no phone number in Settings to put on the band: leave book off, or ask them to add it";
