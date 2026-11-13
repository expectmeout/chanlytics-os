/**
 * Campaigns › Content, what its page is handed and what it says: everything Ask made for the business (a post from a photo,
 * a video from its clips) and where each piece stands, read from the records that exist (00613 `pieces`, `files` made here,
 * 00611 `posts`). Pure, with nothing behind it. Every sentence the page says comes from here.
 *
 * A piece can be up on Google and held on Instagram at once: each place keeps its own state, and the tile says the one
 * thing that matters most (the content canvas, "Every state a piece can be in"): what needs the owner, then what is
 * working, then what is done.
 */
import type { FileDto } from "../files/views";
import type { ContentIdeaFiles } from "./ideas";
import type { ContentView } from "./address";
import type { PieceFail, PieceStage } from "./piece-making";
import { pieceWordsIn } from "./piece-words";
import type { PieceLanguage } from "./pieces";
import {
  POST_ON_ITS_WAY,
  POST_PLACE_SAID,
  POST_SOON_MS,
  linkPlaceSaid,
  postWaitsForItsTime,
  type HandPostDto,
  type PostDto,
  type PostPlace,
} from "./posts";

/** How many made pieces a page holds, and the most one read answers (a page that has scrolled reads what it holds again). */
export const CONTENT_PAGE = 24;
export const CONTENT_MAX = 96;
/** The most videos being made, or not made, the page names: a workspace makes three at a time (PIECES_MAKING_MAX). */
export const CONTENT_MAKING_MAX = 12;
/** How many days a video that could not be made stays on the page. */
export const CONTENT_FAILED_DAYS = 7;
/** How many lines a view of posts holds a page, and the most stopped posts Needs you looks through. */
export const CONTENT_LINES_PAGE = 24;
export const CONTENT_STOPPED_MAX = 48;

/** A video asked for that is no file yet: being made, or not made. */
export interface ContentMakingDto {
  id: string;
  status: "making" | "failed";
  stage: PieceStage;
  failed_why: PieceFail | null;
  /** The words it opens on, a line each, as its plan was pressed: its opening words, or its first card's. */
  lines: string[];
  language: PieceLanguage;
  /** How many blocks it puts together. */
  moments: number;
  /** The first picture it shows (a clip's file or a photo), dim on its tile while it is made; null where the plan names none. */
  first_picture: string | null;
  created_at: string;
}

/** One made piece: its file, and its posts at every place, newest first. */
export interface ContentMadeDto {
  file: FileDto;
  posts: PostDto[];
  /** Where its owner said they posted it themselves (00620), or none: read apart from its posts, which a press sends. */
  by_hand?: HandPostDto | null;
}

/** One post at one place, with the piece it is of: a line of Needs you, Scheduled or Posted. */
export interface ContentLineDto {
  post: PostDto;
  file: FileDto;
}

/** How the whole stands, whichever page of it a read holds. */
export interface ContentTally {
  /** Everything made here that is still in Files. */
  made: number;
  /** Posts that are up, at any place. */
  posted: number;
  /** Posts that stopped and are still the newest at their place, and videos that could not be made. */
  needs: number;
  /** Videos being made now. */
  making: number;
  /** Posts that wait for their time. */
  scheduled: number;
  /** What the Library keeps: the files the business added, which Ask did not make. */
  library: number;
  /** What Ask made and was set aside: Made's own Set aside, reached from the foot of All, never the Library's. */
  aside: number;
}

/**
 * GET content, for one view of Made: what is being made (on the first page of All, and in Being made and Needs you), a page
 * of what was made (All), or a page of lines (Needs you, Scheduled, Posted), and the tally of every view. `next` asks for the
 * page after this; null at the last.
 */
export interface ContentPageDto {
  /** The view this answers. */
  view: ContentView;
  making: ContentMakingDto[];
  made: ContentMadeDto[];
  lines: ContentLineDto[];
  next: string | null;
  tally: ContentTally;
  /** The files each idea would be made from (ideas.ts contentIdeaFilesOf): read with All's first page, empty with any other. */
  ideas: ContentIdeaFiles[];
  /** The one piece that needs the owner, by its file, where exactly one post stopped and no video failed: the amber line opens it. */
  needsOne: string | null;
  /** The words All was found by (files_found: a piece's name and what Ask's look saw or heard in it), or null: all of it. */
  about: string | null;
}

/** How many a view holds, from the tally: what the views' control says beside each. */
export function contentViewCountOf(tally: ContentTally, view: ContentView): number {
  if (view === "all") return tally.made;
  if (view === "posted") return tally.posted;
  return tally[view];
}

/** Which views draw lines (when, where, what to do), and which draw tiles (the piece, to look at). */
export const contentViewDrawsLines = (view: ContentView): boolean =>
  view === "needs" || view === "scheduled" || view === "posted";

/** Where a made piece stands, as its tile says it. */
export type ContentMark =
  | { is: "ready" }
  /** A video Ask made, posted nowhere: nothing posts a video from here (decision 0121), so it is saved, and posted from the phone. */
  | { is: "save" }
  | { is: "going"; place: PostPlace }
  /** Set for its time at a place, and that time: the soonest, where two wait. Not moving yet, so nothing turns. */
  | { is: "timed"; place: PostPlace; at: string }
  /** Up, at each place, and when the newest of them went up (null where no time is kept). */
  | { is: "posted"; places: PostPlace[]; at: string | null }
  /** Held before its send, or refused: the file's own sheet says why. */
  | { is: "stuck"; place: PostPlace }
  /** Posted by its owner's own hand, as they said (00620): when they said so, and where its link says, if it has one. */
  | { is: "by_hand"; at: string; where: string | null };

/**
 * The post that says where a piece stands at each place: the newest there (the list comes newest first). A post the owner let
 * go (Don't post) is no news of its own: where an earlier one is still up at that place, that one says it, since letting a
 * second post go never takes the first one down; else nothing stands there.
 */
export function newestAtEachPlace(posts: readonly PostDto[]): PostDto[] {
  const seen = new Set<PostPlace>();
  const newest: PostDto[] = [];
  for (const post of posts) {
    if (seen.has(post.place)) continue;
    seen.add(post.place);
    const stillUp =
      post.status === "pulled" ? posts.find((p) => p.place === post.place && p.status === "published") : null;
    newest.push(stillUp ?? post);
  }
  return newest;
}

/**
 * Where a made piece stands, as its tile, its row and Today count it: a video that went nowhere is to be saved, never "ready to
 * post" (Ruben, 12 Nov 2026: no press here posts it); anything else, where its posts say (contentMarkOf).
 */
export function contentPieceMarkOf(
  piece: { file: Pick<FileDto, "kind">; posts: readonly PostDto[]; by_hand?: HandPostDto | null },
  nowMs: number,
): ContentMark {
  const mark = contentMarkOf(piece.posts, nowMs);
  if (mark.is !== "ready") return mark;
  // Nothing sent from here stands anywhere: what its owner said they posted themselves is where it stands.
  if (piece.by_hand) return { is: "by_hand", at: piece.by_hand.at, where: linkPlaceSaid(piece.by_hand.link) };
  return piece.file.kind === "video" ? { is: "save" } : mark;
}

/**
 * Where a made piece stands, from its posts: what needs the owner first, then what is going up now, then what waits for its
 * time, then what is up, then nothing. A post set for Saturday is not "Posting" all week: it is timed until its time comes.
 * A post on its way is the one there whatever went up since it was asked for (00611 posts_one_on_its_way: one at a time per
 * place), so a story set for Saturday still says so once the post before it is up; a stop speaks only while it is the newest.
 */
export function contentMarkOf(posts: readonly PostDto[], nowMs: number): ContentMark {
  const newest = newestAtEachPlace(posts);
  const stuck = newest.find((p) => p.status === "held" || p.status === "failed");
  if (stuck) return { is: "stuck", place: stuck.place };
  const onItsWay = posts.filter((p) => POST_ON_ITS_WAY.includes(p.status));
  const going = onItsWay.find((p) => !postWaitsForItsTime(p, nowMs));
  if (going) return { is: "going", place: going.place };
  const timed = [...onItsWay].sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))[0];
  if (timed) return { is: "timed", place: timed.place, at: timed.scheduled_for };
  const up = newest.filter((p) => p.status === "published");
  if (up.length === 0) return { is: "ready" };
  const times = up.flatMap((p) => (p.published_at ? [p.published_at] : [])).sort();
  return { is: "posted", places: up.map((p) => p.place), at: times.at(-1) ?? null };
}

/** How many ideas Ask can make now, as the first day's sentence starts on it: "Three", "One". */
const ideasSaid = (n: number): string => ["One", "Two", "Three"][n - 1] ?? String(n);

/** Every word the Content page says. */
export const CONTENT_WORDS = {
  tab: "Content",
  /** What a video with no opening words is called. */
  video: "Video",
  /** The head's coral act on Made (the content canvas): it opens Ask on Content, with the ideas it can make. */
  /** The head's coral act on Made, as Campaigns' others say theirs ("New sequence", "New message"): a phone draws its "+" alone. */
  make: "New",
  /** The Library's coral act: its picker, for photos and videos. */
  add: "Add",
  /** Make's sheet over the page (sheets/make.tsx): what Ask can make now, and its line for anything else. */
  makeSheet: {
    title: "Make something",
    sub: "From your photos, clips and reviews",
    say: "Or say what you want",
  },
  makingTitle: "Being made",
  /** Made's search line, as the Library's is ("Find a photo or video"). */
  find: "Find a post or video",
  more: "Show more",
  /** The next page of what was made could not be read: what is on screen stands. */
  moreFailed: "Couldn't read more just now. Try again.",
  /** What a read that failed could not read: "Couldn't read your content". */
  failedWhat: "your content",
  empty: {
    title: "Nothing made yet",
    /** The first day (the content canvas, PhHome "first"): what Ask makes, then how many ideas it can make now. */
    body: (ideas: number) =>
      `Ask makes posts from your photos and videos from your clips. ${ideasSaid(ideas)} it can make now:`,
    /** Where the workspace takes no videos (features.video_preview): Ask makes no video there, so it says none. */
    bodyPhotos: (ideas: number) => `Ask makes posts from your photos. ${ideasSaid(ideas)} it can make now:`,
    /** Nothing it could be made from yet: what Ask makes, and the one thing to do first. */
    addFirst: (videos: boolean) =>
      videos
        ? "Ask makes posts from your photos and videos from your clips. Add a few to start."
        : "Ask makes posts from your photos. Add a few to start.",
    /** The door to the Library while it is empty. */
    addDoor: (videos: boolean) => (videos ? "Add photos and clips" : "Add photos"),
  },
  /** Where a piece stands, under its tile (the content canvas: a dot and a few words). A video is ready to post too: its Post sheet offers what works. */
  mark: {
    ready: "Ready to post",
    /** A video's: its Save video leads, and it is posted from the phone. */
    save: "Ready to save",
    going: (place: PostPlace) => `Posting to ${POST_PLACE_SAID[place]}`,
    /** "On Instagram · Monday": where it is, and the day the newest went up. */
    posted: (places: readonly PostPlace[], day: string | null) =>
      `On ${places.map((p) => POST_PLACE_SAID[p]).join(" and ")}${day ? ` · ${day}` : ""}`,
    /** Said once: why is the place's row in its sheet (Post it), where it is posted again or let go. */
    stuck: "Didn't post",
    /** Set for its time: "Set for Saturday", "Set for today". The open piece says the place and the hour. */
    timed: (day: string) => `Set for ${day}`,
    /** Posted by the owner's own hand: "Posted by you · Monday", or "On TikTok, by you · Monday" where its link says where. */
    byHand: (where: string | null, day: string) => `${where ? `On ${where}, by you` : "Posted by you"} · ${day}`,
  },
  /** One line over the pieces while anything needs the owner (the content canvas, PhHome): what, and Look. */
  needsLine: {
    posts: (n: number) => (n === 1 ? "1 post didn't go out" : `${n} posts didn't go out`),
    videos: (n: number) => (n === 1 ? "A video couldn't be made" : `${n} videos couldn't be made`),
    /** Both at once: "1 post and a video need you". */
    both: (posts: number, videos: number) =>
      `${posts === 1 ? "1 post" : `${posts} posts`} and ${videos === 1 ? "a video" : `${videos} videos`} need you`,
    /** The amber line opens what needs the owner: the one piece where one does, else Needs you. */
    look: "Look",
  },
  /** A piece deleted, with Undo for as long as the note shows. */
  deleted: (name: string) => `Deleted “${name}”`,
  /** An open piece: its step, where it stands at a place, and its acts. */
  piece: {
    step: {
      post: "Post",
      postTo: (place: PostPlace) => `Post to ${POST_PLACE_SAID[place]}`,
      again: "Post again",
      keep: "Keep it",
      make: "Make a post",
      dontPost: "Don't post",
      /** A post that waits for its time: "Instagram story goes up tomorrow 9:00 PM". */
      timed: (post: string, when: string) => `${post} goes up ${when}`,
    },
    stands: {
      none: "Not yet",
      going: "Posting",
      up: (when: string | null) => (when ? `Posted ${when}` : "Posted"),
      /** Up a moment ago (the content canvas, PhAct "posting"): "Google · Posted just now". */
      justNow: "Posted just now",
      stuck: "Didn't post",
    },
    place: POST_PLACE_SAID,
    of: (at: number, of: number) => `${at} of ${of}`,
    save: "Save",
    ask: "Ask about it",
    more: "More",
    changeIt: "Change it",
    /**
     * Change it, for a post that is out nowhere yet: the change takes its place, rather than a twin beside it (Ruben, 12 Nov
     * 2026: a typo fixed left two). Where it is up, on its way or set for a time, Save as new keeps the one out there.
     */
    change: { save: "Save", saved: "Changed." },
    /**
     * I posted it (00620): the owner's word that a piece is up by their own hand, since nothing posts a video from here
     * (decision 0121). One press; its link is theirs to add after, and says where. Not posted takes it back.
     */
    byHand: {
      say: "I posted it",
      said: "Marked as posted.",
      /** Where it stands, in a word or two (the desk list's column). */
      stands: "Posted by you",
      addLink: "Add its link",
      linkLabel: "Its link",
      linkHint: "Paste its link",
      keep: "Save",
      see: "See it",
      takeBack: "Not posted",
      tookBack: "Marked as not posted.",
      linkWrong: "Paste the post's full link, starting with https://",
      /** Said of a photo of the Library: only what Ask made is posted from here, or marked so. */
      notMade: "Only a piece Ask made is marked as posted.",
    },
    /** Set aside while a post of it waited to go out: that post is let go with it (server files/file.ts), and said so. */
    asideStops: (places: readonly PostPlace[]) =>
      `Set aside. Its post to ${places.map((p) => POST_PLACE_SAID[p]).join(" and ")} won't go out.`,
    rename: "Rename",
    video: (clock: string) => `Video · ${clock}`,
    picture: "Picture post",
    photo: "Photo",
    clip: (clock: string) => `Clip · ${clock}`,
    gone: "That piece isn't here any more.",
  },
  /**
   * A piece opened on a phone (the content canvas, "Open a piece", board PhView): full screen and dark, its glass top, the
   * foot over the picture, Details and More. Each line is said from what the records hold, never made up: a video's "from 4
   * of your clips" is its plan counted (pieces.ts pieceCountOf), a post's "from one of your photos" the photo it came from.
   */
  viewer: {
    close: "Close",
    soundOn: "Sound on",
    soundOff: "Sound off",
    /** A tap on the picture or the reel (Ruben, 12 Nov 2026: a person reaches for it): it opens full size, in a tab of its own. */
    openFull: "Open full size",
    details: "Details",
    /** "made today", "made Monday", "made Nov 3": the day by the business's own clock. */
    made: (day: string) => `made ${day}`,
    /** What a piece was made from, counted: "4 of your clips", "one of your photos", "2 clips and 1 photo of yours". */
    from: (clips: number, photos: number) => {
      const some = (n: number, kind: string) => (n === 1 ? `one of your ${kind}s` : `${n} of your ${kind}s`);
      const many = (n: number, kind: string) => `${n} ${kind}${n === 1 ? "" : "s"}`;
      if (photos === 0) return some(clips, "clip");
      if (clips === 0) return some(photos, "photo");
      return `${many(clips, "clip")} and ${many(photos, "photo")} of yours`;
    },
    /** A post made from a moment of a video, rather than a photo. */
    fromClip: "one of your clips",
    madeFrom: (from: string) => `from ${from}`,
    /** Details' head under the name: what it is, and its size in pixels. */
    size: (width: number, height: number) => `${width} × ${height}`,
    facts: {
      words: "Caption",
      /** A made piece's caption, written where it stands: tapped, it is a box; left, it is kept. */
      captionAdd: "Add a caption",
      captionSaving: "Saving",
      captionSaved: "Saved",
      /** Over the pictures it was made from, which say how many: the line under its name says it in words. */
      madeFrom: "Made from",
      made: "Made",
      added: "Added",
      sound: "Sound",
    },
    kinds: { picture: "Post", story: "Story", reel: "Reel" },
    /** "Sat, 9:00 AM", "tomorrow, 9:00 AM": a day near today and its time. */
    at: (day: string, time: string) => `${day}, ${time}`,
    /** A day as the time a thing happened at says it: "Today at 9:41", "Monday at 9:41". */
    dayAt: (day: string, time: string) => `${day.charAt(0).toUpperCase()}${day.slice(1)} at ${time}`,
    /**
     * The keys a desk walks an open piece with (the content canvas, board Desk), each its cap and what it does. Space turns a
     * video's sound on and off, as the glass does: the reel plays by itself, and Stream's frame takes no key from the page.
     */
    keys: {
      walk: ["←", "→"],
      next: "Next piece",
      space: "Space",
      sound: "Sound",
      lead: "P",
      esc: "Esc",
      close: "Close",
    },
  },
  /** A made video's words, made again (campaigns/content/video-again.tsx): More › Change it on a video Ask made. */
  again: {
    make: "Make it again",
    needsLine: "It opens on a line: write one.",
    making: "Making it again. It's in Made in about a minute.",
  },
  /** Content's two lists, as the control at the list's top says them. */
  lists: { made: "Made", library: "Library", label: "Show what" },
  /** Made's views, as the control beside Made says them, and what each says when it holds nothing. */
  views: {
    name: {
      all: "All",
      needs: "Needs you",
      making: "Being made",
      scheduled: "Scheduled",
      posted: "Posted",
      aside: "Set aside",
    },
    label: "Show",
    empty: {
      all: "Nothing made yet.",
      needs: "Nothing needs you.",
      making: "Nothing is being made.",
      scheduled: "Nothing is waiting for its time.",
      posted: "Nothing is posted yet.",
      aside: "Nothing is set aside.",
    },
    thisWeek: "This week",
    earlier: "Earlier",
    open: "Open",
    /** The lines' own words (the content canvas, PhList). */
    didntPost: (reason: string) => `Didn't post · ${reason}`,
    couldntMake: (reason: string) => `Couldn't be made · ${reason}`,
    /** A video Ask could not make, asked of Ask again as it was made: in its words, with why it was not. */
    makeAgainAsk: (title: string, why: string) => ({
      en: `Make this video again: "${title}". Last time it couldn't be made: ${why}`,
      es: `Haz de nuevo este video: "${title}". La vez pasada no se pudo hacer: ${why}`,
    }),
    nothingElse: "Nothing else needs you.",
    /** A post at its time goes up by itself: "Instagram story · posts by itself". */
    byItself: (where: string) => `${where} · posts by itself`,
    /** A day Scheduled's posts wait for: "Tomorrow · Thu, Nov 12" while it is near, else "Sat, Nov 14". */
    dayHead: (near: string | null, date: string) =>
      near ? `${near.charAt(0).toUpperCase()}${near.slice(1)} · ${date}` : date,
    onCalendar: "Each one also shows on your Calendar.",
    /** "Google · today, 9:12 AM", "Instagram · Monday". */
    upAt: (where: string, when: string) => `${where} · ${when}`,
    grid: "Grid",
    list: "List",
    columns: {
      piece: "Piece",
      stands: "Where it stands",
      // Scheduled and Posted on a desk (lines-table.tsx): the same table, narrowed.
      when: "When",
      posted: "Posted",
      where: "Where",
      how: "How it goes",
      byItself: "Posts by itself",
    },
    count: (n: number) => (n === 1 ? "1 piece, newest first" : `${n} pieces, newest first`),
  },
  /** The composer: one post, to every place switched on. */
  post: {
    title: "Post it",
    /** The one press, as every app that posts says it: where it goes is the switches over it (and its name for a screen reader). */
    go: "Post",
    /**
     * Asked where Post was pressed, before anything goes up (Ruben, 12 Nov 2026: a post is public, and one press sent it with
     * no question). The Post that answers it is the approval (decision 0121); what each place does with it is said under it.
     */
    ask: {
      question: (places: readonly PostPlace[]) => `Post to ${places.map((p) => POST_PLACE_SAID[p]).join(" and ")} now?`,
      detail: (places: readonly PostPlace[]) =>
        [
          places.includes("google") ? "Google shows it right away." : null,
          places.includes("instagram") ? "Instagram takes a minute or two, and Don't post stops it until then." : null,
        ]
          .filter(Boolean)
          .join(" "),
      no: "Back",
    },
    /** A time for it, beside Post: the day and time picked as words of a sentence, as a send's are (broadcasts/when.tsx). */
    later: {
      open: "Schedule",
      says: "Post",
      yes: "Schedule",
      note: (when: string, city: string) => `Goes up ${when}, ${city} time. Don't post stops it until then.`,
      set: (places: readonly PostPlace[], when: string) =>
        `Set for ${when} on ${places.map((p) => POST_PLACE_SAID[p]).join(" and ")}.`,
    },
    asWhat: "On Instagram, as",
    send: (places: readonly PostPlace[]) => `Post to ${places.map((p) => POST_PLACE_SAID[p]).join(" and ")}`,
    nowhere: "Choose where it goes.",
    /** The caption is typed in Details alone (viewer/caption.tsx): where it is missing or too long, that is where it is put right. */
    wordsNeeded: "Add a caption first.",
    tooLongForGoogle: "Google takes 1,500 characters at most. Shorten the caption, or turn Google off.",
    sent: (places: readonly PostPlace[]) => `On its way to ${places.map((p) => POST_PLACE_SAID[p]).join(" and ")}.`,
    oneFailed: (place: PostPlace, reason: string) => `${POST_PLACE_SAID[place]}: ${reason}`,
  },
} as const;

/**
 * A mark in the owner's words. A made video posted nowhere is ready to save (contentPieceMarkOf), while a reel has no road
 * to Instagram from here (decision 0121). `dayOf` says a day by the business's own clock.
 */
export function contentMarkSaid(mark: ContentMark, dayOf: (at: string) => string): string {
  if (mark.is === "going") return CONTENT_WORDS.mark.going(mark.place);
  if (mark.is === "timed") return CONTENT_WORDS.mark.timed(dayOf(mark.at));
  if (mark.is === "posted") return CONTENT_WORDS.mark.posted(mark.places, mark.at ? dayOf(mark.at) : null);
  if (mark.is === "stuck") return CONTENT_WORDS.mark.stuck;
  if (mark.is === "by_hand") return CONTENT_WORDS.mark.byHand(mark.where, dayOf(mark.at));
  if (mark.is === "save") return CONTENT_WORDS.mark.save;
  return CONTENT_WORDS.mark.ready;
}

/**
 * A mark's tone, as its dot draws it: grey ready, the accent turning while it moves, the accent still while it waits for its
 * time, green out, amber where it needs the owner.
 */
export type ContentMarkTone = "ready" | "going" | "timed" | "up" | "need";

export const contentMarkToneOf = (mark: ContentMark): ContentMarkTone => {
  if (mark.is === "posted" || mark.is === "by_hand") return "up";
  if (mark.is === "stuck") return "need";
  return mark.is === "save" ? "ready" : mark.is;
};

/** What heads the made pieces, in one line: how many are made, and how many are out. */
export function contentHeadOf(tally: ContentTally): string {
  if (tally.made === 0) return CONTENT_WORDS.empty.title;
  const count = tally.made === 1 ? "1 piece made" : `${tally.made} pieces made`;
  return `${count} · ${tally.posted === 0 ? "none posted yet" : `${tally.posted} posted`}`;
}

/** A video asked for, as its tile says it: its opening words, where it is at, and why where it was not made. */
export function contentMakingSaid(making: ContentMakingDto): { title: string; state: string; failed: string | null } {
  const says = pieceWordsIn(making.language);
  const title = making.lines.join(" ").trim() || CONTENT_WORDS.video;
  if (making.status === "failed")
    return { title, state: says.follows.failedMark, failed: says.failed[making.failed_why ?? "unknown"] };
  return { title, state: says.follows.stage[making.stage](making.moments), failed: null };
}

/**
 * Whether the page should be read again on its own: a video still being made, or a post going up now. Neither is told to a
 * page by the feed (00611, 00613), so the page asks while one moves and stops when none does. A post set for later is not
 * moving: the page does not ask all week for it.
 */
export function contentMoving(page: ContentPageDto, nowMs: number): boolean {
  return (
    page.making.some((m) => m.status === "making") ||
    page.made.some((m) => contentMarkOf(m.posts, nowMs).is === "going")
  );
}

/**
 * When the page should read itself again for a post set for its time, where nothing moves meanwhile: as that time comes (soon,
 * by POST_SOON_MS), the soonest of every post it holds, its pieces' and its lines'. Then the post is going up, the page asks
 * while it moves (contentMoving), and the piece says Posting, then Posted, not "Set for today" until something else reads.
 * Null where none waits.
 */
export function contentWakesAt(page: Pick<ContentPageDto, "made" | "lines">, nowMs: number): number | null {
  const waiting = [...page.made.flatMap((m) => m.posts), ...page.lines.map((line) => line.post)].filter((post) =>
    postWaitsForItsTime(post, nowMs),
  );
  if (waiting.length === 0) return null;
  return Math.min(...waiting.map((post) => Date.parse(post.scheduled_for))) - POST_SOON_MS;
}
