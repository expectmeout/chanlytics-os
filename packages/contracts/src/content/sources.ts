/**
 * Where Ask looks for a business's photos and videos, and what came of it (Content's empty state, 14 Nov 2026; the canvas
 * "Content empty state"): its website, its Google listing and its Instagram, each a line that says what it is, how its read
 * stands and what came in, and the card's one state over them all: nothing known yet, looking, found (waiting in the Library
 * for a Keep), or looked and found nothing, and why. Read with Content's page while nothing is kept (server
 * readers/content-sources.ts); every sentence is here, the page composes. Pure.
 */
import type { FilmShot } from "../imports/business-reads";
import { groupedPlural } from "../shared/words";

export type ContentSourcePlace = "website" | "google_listing" | "instagram";

/** What a place's pages showed before each was judged: a website's read (business_reads.facts.media). */
export interface ContentSourceSeen {
  photos: number;
  videos: number;
  /** Players of another platform the pages embed (YouTube, Vimeo), which nothing here can bring in. */
  embedded: number;
}

/** One place, as the page is told it. */
export interface ContentSourceDto {
  place: ContentSourcePlace;
  /** Where it is: the site's address, the account's handle; null where none is known. A linked listing says "listing". */
  address: string | null;
  /** Being read or brought in now. */
  reading: boolean;
  /**
   * While it is read, when a run that has said nothing since stops being believed (its start and half an hour): the page
   * reads itself once then, where no notice would have told it the run ended. Null where it is not read.
   */
  reading_until: string | null;
  /** When it was last read; null for never. */
  read_at: string | null;
  /** What came in from it and is still here (waiting or kept). */
  photos: number;
  videos: number;
  seen: ContentSourceSeen | null;
  /** Why it could not be read, in its own words for the owner; null where it was. */
  unread: string | null;
}

export interface ContentSourcesDto {
  places: ContentSourceDto[];
  /** Three clips to film for a video, as the website's read wrote them for this business; none where it wrote none. */
  film: FilmShot[];
}

/** The card's state, over every place. */
export type ContentSourcesState = "unknown" | "looking" | "found" | "none";

/** One place's line on the card. */
export interface ContentSourceLine {
  place: ContentSourcePlace;
  name: string;
  sub: string;
  status: string;
  /** live: being read now; ok: something came; rest: nothing yet. */
  tone: "live" | "ok" | "rest";
}

export interface ContentSourcesSaid {
  state: ContentSourcesState;
  title: string;
  body: string;
  lines: ContentSourceLine[];
  /** What the one input to Ask waits for, and the line under it. */
  ask: { placeholder: string; hint: string };
}

export const CONTENT_SOURCE_WORDS = {
  title: {
    unknown: (videos: boolean) => (videos ? "Where are your photos and videos?" : "Where are your photos?"),
    looking: (videos: boolean) => (videos ? "Looking for your photos and videos" : "Looking for your photos"),
    none: "Nothing to use yet",
  },
  body: {
    unknown: (videos: boolean) =>
      videos
        ? "Paste a link and Ask brings them in. It looks at each photo, and watches and listens to each video."
        : "Paste a link and Ask brings them in, and looks at each one.",
    looking: "What Ask finds waits in the Library for your OK.",
    found: "Keep the ones that are yours in the Library.",
    tooSmall: "The photos there are too small to post.",
    embeddedOnly: "Its videos play from YouTube or Vimeo, which Ask can't bring in.",
    nothingThere: "There was nothing there to bring in.",
    couldNotRead: "Ask couldn't read it.",
  },
  found: (photos: number, videos: number) =>
    `Ask found ${[photos ? groupedPlural(photos, "photo") : null, videos ? groupedPlural(videos, "video") : null]
      .filter(Boolean)
      .join(" and ")}`,
  lookedAt: (names: readonly string[]) => `Ask looked at ${names.join(" and ")}.`,
  sub: {
    website: "Your website",
    google_listing: "Photos you posted there",
    instagram: "Instagram",
    instagramUnknown: "Paste it below to add it",
  },
  names: { website: "your website", google_listing: "your Google listing", instagram: "your Instagram" },
  listing: "Your Google listing",
  instagram: "Instagram",
  status: {
    looking: "Looking",
    reading: "Reading",
    notLinked: "Not linked",
    notReadYet: "Not read yet",
    couldNotRead: "Couldn't read it",
    tooSmall: "Too small to use",
    none: "None found",
    noneYours: "None posted by you",
  },
  ask: {
    /** Short enough for one line on a phone; the hint under it says which links. */
    placeholder: "Paste a link",
    hint: "Your Instagram or your website",
  },
  addFromPhone: "Add from your phone",
  film: "For a video, film these three",
  or: "or",
  openLibrary: "Open the Library",
} as const;

/** A website's address as its name on a card: its host, with no www (the bring-in card names one by it too). */
export const siteHostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Not an address: as it was written.
    return url;
  }
};

const SOURCE_SAYS = CONTENT_SOURCE_WORDS;

/** "12 photos · 2 videos", or null for nothing. */
function broughtOf(source: ContentSourceDto): string | null {
  const parts = [
    source.photos ? groupedPlural(source.photos, "photo") : null,
    source.videos ? groupedPlural(source.videos, "video") : null,
  ];
  const counted = parts.filter(Boolean).join(" · ");
  return counted || null;
}

/** Where a place's read stands, in its line's last words, and its tone. */
function statusOf(source: ContentSourceDto): { status: string; tone: ContentSourceLine["tone"] } {
  if (source.reading)
    return {
      status: source.place === "instagram" ? SOURCE_SAYS.status.reading : SOURCE_SAYS.status.looking,
      tone: "live",
    };
  const brought = broughtOf(source);
  if (brought) return { status: brought, tone: "ok" };
  if (source.unread) return { status: SOURCE_SAYS.status.couldNotRead, tone: "rest" };
  if (!source.read_at)
    return { status: source.address ? SOURCE_SAYS.status.notReadYet : SOURCE_SAYS.status.notLinked, tone: "rest" };
  if (source.place === "google_listing") return { status: SOURCE_SAYS.status.noneYours, tone: "rest" };
  if (source.seen && source.seen.photos > 0) return { status: SOURCE_SAYS.status.tooSmall, tone: "rest" };
  return { status: SOURCE_SAYS.status.none, tone: "rest" };
}

/** A place's line, or null for one that has nothing to say (a website or a listing nobody named). */
function sourceLineOf(source: ContentSourceDto, others: boolean): ContentSourceLine | null {
  if (source.place === "instagram") {
    if (!source.address && !others) return null;
    const name = source.address ? `@${source.address.replace(/^@/, "")}` : SOURCE_SAYS.instagram;
    return {
      place: source.place,
      name,
      sub: source.address ? SOURCE_SAYS.sub.instagram : SOURCE_SAYS.sub.instagramUnknown,
      ...statusOf(source),
    };
  }
  if (!source.address) return null;
  const name = source.place === "website" ? siteHostOf(source.address) : SOURCE_SAYS.listing;
  return { place: source.place, name, sub: SOURCE_SAYS.sub[source.place], ...statusOf(source) };
}

/** Why what was read brought nothing: what the website showed, else that nothing was there or it could not be read. */
function whyNoneOf(read: readonly ContentSourceDto[]): string {
  const site = read.find((s) => s.place === "website");
  if (site?.seen && site.seen.photos > 0) return SOURCE_SAYS.body.tooSmall;
  if (site?.seen && site.seen.embedded > 0) return SOURCE_SAYS.body.embeddedOnly;
  if (read.every((s) => s.unread)) return SOURCE_SAYS.body.couldNotRead;
  return SOURCE_SAYS.body.nothingThere;
}

/**
 * The card: its state, its words and its lines. Looking wins while any place is read; then what came in; then, where a place
 * was read and brought nothing, why; and nothing known, where no place was ever read or named.
 */
export function contentSourcesSaid(sources: ContentSourcesDto, videos: boolean): ContentSourcesSaid {
  const known = sources.places.filter((s) => s.place !== "instagram" && s.address);
  const lines = sources.places.flatMap((s) => sourceLineOf(s, known.length > 0) ?? []);
  const ask = { placeholder: SOURCE_SAYS.ask.placeholder, hint: SOURCE_SAYS.ask.hint };
  const photos = sources.places.reduce((n, s) => n + s.photos, 0);
  const shown = sources.places.reduce((n, s) => n + (videos ? s.videos : 0), 0);
  if (sources.places.some((s) => s.reading))
    return { state: "looking", title: SOURCE_SAYS.title.looking(videos), body: SOURCE_SAYS.body.looking, lines, ask };
  if (photos + shown > 0)
    return { state: "found", title: SOURCE_SAYS.found(photos, shown), body: SOURCE_SAYS.body.found, lines, ask };
  const read = sources.places.filter((s) => s.read_at || s.unread);
  if (read.length > 0) {
    const names = read.map((s) => SOURCE_SAYS.names[s.place]);
    return {
      state: "none",
      title: SOURCE_SAYS.title.none,
      body: `${SOURCE_SAYS.lookedAt(names)} ${whyNoneOf(read)}`,
      lines,
      ask,
    };
  }
  return {
    state: "unknown",
    title: SOURCE_SAYS.title.unknown(videos),
    body: SOURCE_SAYS.body.unknown(videos),
    lines,
    ask,
  };
}
