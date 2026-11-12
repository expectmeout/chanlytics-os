/**
 * What Ask can make, offered where nothing is made yet and as Ask's starters on Campaigns › Content (the content canvas,
 * "The first day" and "Make"): ideas in general words, true of any business that keeps photos and clips, each with the
 * words Ask is asked in both languages.
 *
 * Each is one Ask can make today, and is asked for as it makes it. A picture post is one photo and the owner's own words
 * (Ask's post tool, which never puts a customer's words on a post), so a before and after (two pictures) and a review (a
 * customer's words) are made as videos: a pair, and a quote card from a review the workspace holds (Ask's video tool). Where
 * the workspace takes no videos, the one idea is a post from a photo.
 *
 * Each idea that is made from files names the ones it would use (contentIdeaFilesOf), chosen from the newest kept: its row
 * shows them, and Ask is asked to use them (contentIdeaAsk), so what the owner saw is what is made.
 */
import type { FileDto } from "../files/views";

/** One idea: what it is called, the line under it, what Ask is asked, and whether it is offered where videos are taken. */
export interface ContentIdea {
  key: "before_after" | "review" | "video" | "photo_post";
  title: string;
  sub: string;
  ask: Readonly<Record<"en" | "es", string>>;
  /** Offered where the workspace takes videos (true), or where it does not (false). */
  videos: boolean;
}

export const CONTENT_IDEAS: readonly ContentIdea[] = [
  {
    key: "before_after",
    title: "A before and after",
    sub: "From two of your photos",
    ask: {
      en: "Make a short before and after video from two of my photos.",
      es: "Haz un video corto de antes y después con dos de mis fotos.",
    },
    videos: true,
  },
  {
    key: "review",
    title: "Your newest review, as a post",
    sub: "What someone said about you on Google",
    ask: {
      en: "Make a short video from my newest Google review, in the words it was written.",
      es: "Haz un video corto con mi reseña de Google más reciente, con sus palabras tal cual.",
    },
    videos: true,
  },
  {
    key: "video",
    title: "Meet the business in 10 seconds",
    sub: "A video from your clips",
    ask: {
      en: "Make a 10-second video that introduces the business, from my clips.",
      es: "Haz un video de 10 segundos que presente el negocio, con mis clips.",
    },
    videos: true,
  },
  {
    key: "photo_post",
    title: "Your newest photo, as a post",
    sub: "From one of your photos",
    ask: {
      en: "Make a post from my newest photo.",
      es: "Haz una publicación con mi foto más reciente.",
    },
    videos: false,
  },
];

/** The ideas a workspace is offered: what it can make where it takes videos, and a post from a photo where it does not. */
export const contentIdeasFor = (videos: boolean): readonly ContentIdea[] =>
  CONTENT_IDEAS.filter((idea) => idea.videos === videos);

/** The files an idea would be made from, by name as files says them; none for one that is made from words (a review). */
export interface ContentIdeaFiles {
  key: ContentIdea["key"];
  files: { id: string; name: string }[];
}

/**
 * Which files each idea would use, from the newest kept files, newest first: the two newest photos of the work for a before
 * and after, up to four clips that can be played for a video, the newest photo for a post. A before and after with fewer
 * than two photos of the work names none, and Ask chooses.
 */
export function contentIdeaFilesOf(
  kept: readonly Pick<FileDto, "id" | "name" | "kind" | "shows" | "media_status">[],
): ContentIdeaFiles[] {
  const named = (files: typeof kept) => files.map((f) => ({ id: f.id, name: f.name }));
  const photos = kept.filter((f) => f.kind !== "video");
  const work = photos.filter((f) => f.shows === "work");
  const clips = kept.filter((f) => f.kind === "video" && f.media_status === "ready");
  return [
    { key: "before_after", files: work.length >= 2 ? named(work.slice(0, 2)) : [] },
    { key: "video", files: named(clips.slice(0, 4)) },
    { key: "photo_post", files: named(photos.slice(0, 1)) },
  ];
}

/** What Ask is asked for an idea: its words, and the files its row showed, by name, where it showed any. */
export function contentIdeaAsk(
  idea: ContentIdea,
  files: readonly { name: string }[],
): Readonly<Record<"en" | "es", string>> {
  if (files.length === 0) return idea.ask;
  const names = files.map((f) => f.name).join(", ");
  return { en: `${idea.ask.en} Use ${names}.`, es: `${idea.ask.es} Usa ${names}.` };
}
