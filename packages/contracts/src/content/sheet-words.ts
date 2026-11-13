/**
 * The words of the sheets over an open piece (the content canvas, PhAct "post", "video" and PhChange): posting it and where it
 * stands at each place, a video's own sheet, changing its words, and the one line to Ask. Kept apart from page.ts so each
 * sheet says what the canvas says, but where Ruben chose otherwise (12 Nov 2026: no presets, one line to Ask, one status).
 */
import { POST_PLACE_SAID, type PostPlace } from "./posts";

export const CONTENT_SHEET_WORDS = {
  post: {
    title: "Post it",
    /** Instagram's two ways, beside its switch. */
    kinds: { picture: "Post", story: "Story" },
    /** "Instagram on", for a screen reader. */
    switchLabel: (place: PostPlace) => `Post to ${POST_PLACE_SAID[place]}`,
  },
  /**
   * A made video's acts, while Instagram takes no video from here (decision 0121): Save video leads, its caption copied as it
   * saves (viewer/foot.tsx), and a picture from it is in More.
   */
  video: {
    save: "Save video",
    copied: "Caption copied",
    picture: "Post a picture from it",
  },
  /** A video's words, made again (PhChange "video"). */
  again: {
    /** The opening words, a line each over the first picture, and the end card's own line. */
    line: (n: number) => (n === 1 ? "Opening line" : "Second line"),
    endLine: "End card",
    /** Asked as Make it again is pressed, where a note stood in the sheet before: what it costs, and that the first stays. */
    confirm: {
      question: "Make a new video?",
      detail: "Takes about a minute. This one stays.",
      yes: "Make it",
      no: "Back",
    },
  },
  /**
   * The one line to Ask on a piece (Ruben, 12 Nov 2026: no rows of presets and no templated asks; where Ask can decide, one
   * input hands it the owner's own words about this piece). Under a post's words, under a video's words, and alone
   * where a piece has nothing to change by hand.
   */
  ask: {
    /** Under the piece's own words, for anything they don't change. */
    more: "Ask anything about it",
    /** Alone, where nothing of the piece is changed by hand. */
    alone: "What should change?",
    /** The box's name, for a screen reader. */
    label: "Ask for a change",
    send: "Ask",
  },
  /** Where a piece stands at each place, in the one list both Post and the status row open (post-both.tsx). */
  places: {
    title: "Where it's posted",
    /** A post set for its time: "Goes up Sat, 9:00 AM". */
    timed: (when: string) => `Goes up ${when}`,
    /** Why a place takes no post, short, beside the way to put it right (Settings › Connections). */
    notConnected: "Not connected",
    lineOff: "Posting is off",
    connect: "Connect",
    /**
     * A post set for its time, moved to another (Ruben, 12 Nov 2026: a time could only be changed by Don't post and starting
     * over): the press beside when it goes up, the foot's act, and what is said once it is moved.
     */
    move: "Change time",
    moved: (place: PostPlace, when: string) => `Now set for ${when} on ${POST_PLACE_SAID[place]}.`,
    /** Change time's sentence, before the day and the time: "Story goes up", "Post goes up". */
    goesUp: (kind: string) => `${kind} goes up`,
    /**
     * Ten minutes before its time Instagram makes the post ready with its words (the edge's post-ready.ts), and holds them: a
     * caption changed now is the piece's, and reaches the next post, not this one.
     */
    wordsHeld: "Instagram already has this post's words: a change now reaches the next one.",
  },
} as const;
