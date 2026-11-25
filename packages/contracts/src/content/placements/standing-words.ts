/**
 * Where a post stands, in words: the one table (the content status review of 24 Nov 2026, C5). A standing is one fact
 * (standing.ts), and every screen that says it reads its words here, a column a screen:
 *
 *   tile     under a piece's picture in Made, and its row in a list: a few words and a day
 *   status   the open piece's one sentence, where it is not a line's own words
 *   line     the open piece's line for one placement, with the hour; `note` is its second, quieter sentence
 *   row      a place's row or cell: where the piece stands there, the place already named beside it
 *   week     the Week's row for a creative
 *   bell     the notice that leaves the page: its title, and its body where it has one
 *   ai       what AI is told, a plain clause it can put in a sentence
 *
 * Words only: which standing a post is in is standing.ts's to say, and which press a line offers is its screen's. A
 * place is said by its name (POST_PLACE_SAID); a day and an hour are handed in, by the business's own clock.
 * `docs/words.md`, "Where a post stands", shows the same table to a person.
 */
import { POST_KIND_SAID, POST_PLACE_SAID, type PostKind, type PostPlace } from "../posts";
import { capitalize } from "../../shared/words";

const at = (place: PostPlace): string => POST_PLACE_SAID[place];
const placesListed = (places: readonly PostPlace[]): string => [...new Set(places)].map(at).join(" and ");
/** A day or an hour after a middle dot, where there is one to say. */
const dotted = (words: string, when: string | null): string => (when ? `${words} · ${when}` : words);
/** A day after the words, as a row says it: "Posted Monday". */
const spaced = (words: string, when: string | null): string => (when ? `${words} ${when}` : words);

/** Of a post removed at its place: who did not do it, and where it was done. Its line's second sentence, and its bell's. */
const notFromHere = (place: PostPlace): string =>
  `Chanlytics didn't take it down. It was deleted on ${at(place)} itself.`;

/** That nobody here can say a post is at its place: its tile's words, its line's and the Week's. */
const unsure = (place: PostPlace): string => `Couldn't confirm it's on ${at(place)}`;

/** Where its owner looks for a post at its place. */
const LOOK_AT = {
  instagram: "the account",
  facebook: "the Page",
  google: "the profile",
} as const satisfies Record<PostPlace, string>;

export const STANDING_WORDS = {
  /** It never went out. "Ready to post" is said of nothing else. */
  never: {
    tile: "Ready to post",
    row: "Not yet",
    ai: "never posted",
  },
  /** A made video where nothing takes a reel from here: it is saved, and posted from the phone. */
  saved: {
    tile: "Ready to save",
    ai: "a video to save and post from the phone: nothing here takes a reel",
  },
  /** Its owner said they posted it themselves (00620): "Posted by you · Monday", "On TikTok, by you · Monday". */
  by_hand: {
    tile: (where: string | null, day: string) => `${where ? `On ${where}, by you` : "Posted by you"} · ${day}`,
    ai: (where: string | null) => (where ? `posted by its owner on ${where}` : "posted by its owner, not from here"),
  },
  /** Set for its time. */
  waiting: {
    tile: (day: string) => `Set for ${day}`,
    /** What goes up, as a sentence starts on it: "Story goes up Sat, 9:00 AM". */
    status: (kind: PostKind, when: string) => `${capitalize(POST_KIND_SAID[kind])} goes up ${when}`,
    line: (when: string) => `Goes up ${when}`,
    week: (when: string) => `Goes up ${when}`,
    ai: (place: PostPlace, when: string) => `set to go up on ${at(place)} ${when}`,
  },
  /** Going up now: its place is getting it ready, or it is being posted and not yet seen there. */
  going_up: {
    tile: (place: PostPlace) => `Posting to ${at(place)}`,
    line: (place: PostPlace) => `Posting to ${at(place)}`,
    lineGettingReady: (place: PostPlace) => `${at(place)} is getting it ready`,
    row: "Posting",
    ai: (place: PostPlace) => `going up on ${at(place)} now`,
  },
  /** Sent with no answer: its place is asked what it has. The tile and the row say it is posting. */
  checking: {
    line: (place: PostPlace) => `Checking with ${at(place)}`,
    note: (place: PostPlace) =>
      `No answer came back, so Chanlytics is asking ${at(place)} what it has. It won't post twice.`,
    ai: (place: PostPlace) => `sent to ${at(place)} with no answer yet: being checked`,
  },
  /**
   * Its place took it and was never seen holding it: nobody here can say it is up, so its owner is asked, with two
   * presses (the content status review of 24 Nov 2026, D5). The tile and the open piece say the same words; the note
   * says what to do, and the presses are the two answers.
   */
  unconfirmed: {
    tile: unsure,
    line: unsure,
    note: (place: PostPlace) => `${at(place)} never said it has this post. Look at ${LOOK_AT[place]}, then say which.`,
    there: "It's there",
    notThere: "It's not there",
    row: "Couldn't confirm",
    week: unsure,
    ai: (place: PostPlace) => `sent to ${at(place)}, which never confirmed it went up: its owner is asked to look`,
  },
  /** Up. */
  up: {
    tile: (places: readonly PostPlace[], day: string | null) => dotted(`On ${placesListed(places)}`, day),
    line: (place: PostPlace, when: string | null) => dotted(`On ${at(place)}`, when),
    row: (day: string | null) => spaced("Posted", day),
    /** Up a moment ago, as the press that sent it is still in mind. */
    rowJustNow: "Posted just now",
    week: (places: readonly PostPlace[], day: string) => `On ${placesListed(places)} · ${day}`,
    bell: { title: (place: PostPlace) => `Posted to ${at(place)}` },
    ai: (place: PostPlace, when: string | null) => spaced(`up on ${at(place)}`, when ? `since ${when}` : null),
  },
  /** A story that ran its day: it ended by itself, and nothing is to be done. Grey. */
  ended: {
    tile: (day: string | null) => dotted("Story ended", day),
    line: (when: string | null) => dotted("Story ended", when),
    row: (day: string | null) => spaced("Story ended", day),
    week: "Story ended",
    /** Posted lists the stories that ran, each marked: after its line, and after its place in a desk's Where. */
    posted: (line: string) => `${line} · Story ended`,
    postedWhere: (where: string) => `${where} · ended`,
    ai: (when: string | null) => spaced("a story that ran its day and ended by itself", when),
  },
  /** Taken down from here: its owner asked, and its place said it is gone. Grey. */
  came_down: {
    tile: (day: string | null) => dotted("Taken down", day),
    line: (when: string | null) => dotted("Taken down", when),
    row: (day: string | null) => spaced("Taken down", day),
    week: "Taken down",
    bell: {
      /** A piece that cannot be named is "A post", never a blank title. */
      title: (piece: string) => `Taken down · ${piece || "A post"}`,
      body: (places: readonly PostPlace[]) => `From ${placesListed(places)}`,
    },
    ai: (place: PostPlace, when: string | null) => spaced(`taken down from ${at(place)} by its owner`, when),
  },
  /**
   * Removed at its place itself, by its owner there or by the place: nobody took it down from here, and its line says
   * so, with when Chanlytics noticed. Grey.
   */
  removed: {
    tile: (place: PostPlace, day: string | null) => dotted(`Removed on ${at(place)}`, day),
    line: (place: PostPlace, when: string | null) =>
      spaced(`Removed on ${at(place)}`, when ? `· noticed ${when}` : null),
    note: notFromHere,
    row: (day: string | null) => spaced("Removed there", day),
    week: (place: PostPlace) => `Removed on ${at(place)}`,
    bell: {
      title: (place: PostPlace, piece: string) => `Removed on ${at(place)} · ${piece || "A post"}`,
      body: notFromHere,
      /** Where an ad made from the piece is still on: said, with where its one press is. Never paused by itself. */
      bodyWithAd: (place: PostPlace) => `${notFromHere(place)} Its ad is still running: open the piece to pause it.`,
    },
    ai: (place: PostPlace, when: string | null) =>
      spaced(`removed on ${at(place)} itself, not taken down from here`, when ? `(noticed ${when})` : null),
  },
  /** Held before its send, or refused by its place: it waits for its owner. Amber. */
  stopped: {
    tile: "Didn't post",
    status: (place: PostPlace) => `Didn't post on ${at(place)}`,
    line: (reason: string | null) => dotted("Didn't post", reason),
    row: "Didn't post",
    week: (place: PostPlace, reason: string) => dotted(`Didn't post on ${at(place)}`, reason || null),
    bell: { body: (reason: string) => dotted("Didn't post", reason || null) },
    /**
     * The reason kept on a post its place took and does not hold, by the place's own word or its owner's: it never
     * went up, so it is a post that did not go, and never one that was taken down.
     */
    notThere: (place: PostPlace) => `${at(place)} doesn't have it.`,
    ai: (place: PostPlace, reason: string | null) =>
      spaced(`not posted on ${at(place)}: it waits for its owner`, reason ? `(${reason})` : null),
  },
  /** Let go because its day passed: never sent late. Its line is the reason it kept, a middle dot between its sentences. */
  let_go: {
    line: (reason: string) => reason.replace(/\.$/u, "").replace(". ", " · "),
    note: "It was fixed after the day it was about.",
    week: "Won't go up",
    ai: "let go: its day passed before it could be posted",
  },
} as const;
