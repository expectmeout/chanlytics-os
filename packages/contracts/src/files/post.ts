/**
 * A post made from a photo, by code (decision 0099, step 3): what is asked for, in what a card reads, with nothing behind it to
 * ride into a page. No model touches the pixels and it costs nothing, so the card is the real picture and a change of mind is
 * another card. What may be said is post-check.ts's.
 */
/** The shapes a post is made in. Portrait is the file itself, and what a card shows. */
export const POST_SHAPES = ["portrait", "square", "story"] as const;
export type PostShapeName = (typeof POST_SHAPES)[number];

/** Whose voice the words are set in: a serif's, or a plain sans's. */
export const POST_VOICES = ["classic", "modern"] as const;
export type PostVoice = (typeof POST_VOICES)[number];

/** How much each part of a post may say and still read on a phone. */
export const POST_LIMITS = { line: 60, over: 32, under: 80 } as const;

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
  language: "en" | "es";
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
    language: payload.language === "es" ? "es" : "en",
    people_agreed: payload.people_agreed === true,
  };
}

export const POST_WORDS = {
  cardTitle: (line: string) => `Post: ${line}`,
  /** What the card says under the picture. */
  summary: (fileName: string) => `From ${fileName}. Saved in portrait, square and story.`,
  save: "Save to Files",
  saving: "Saving",
  saved: (name: string) => `Saved to Files as ${name}`,
  removed: "Taken out of Files",
  notDrawn: "The picture could not be drawn. Saving still works.",
  noPhone: "there is no phone number in Settings to put on the band: leave book off, or ask them to add it",
  download: "Download",
  share: "Share",
  shareFailed: "Sharing didn't open. Download it instead.",
  gone: "This post isn't in Files any more.",
  shapesSaid: "Shape",
  shapes: { portrait: "Portrait", square: "Square", story: "Story" },
} as const;
