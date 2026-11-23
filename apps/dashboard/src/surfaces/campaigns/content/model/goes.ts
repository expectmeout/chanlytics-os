/**
 * Where a piece goes, a line a placement (the content loop PRD's 8.2 and 21.3; the journey canvas, board Piece, cells 11
 * to 24): each place and kind the piece has a post at, where it stands there in the owner's words, whether it mends
 * itself, and the one thing to do. A post is "On Instagram" only once the account was seen holding it; a story says when
 * it ended by itself; a take-down says the place's answer and never guesses it. Pure: the posts, its take-down, a clock
 * and now are handed in.
 */
import {
  DAY_MS,
  MIN_MS,
  ON_FACEBOOK,
  ON_INSTAGRAM,
  POST_PLACE_SAID,
  POST_PULLABLE,
  TAKE_DOWN_WORDS,
  placementSaid,
  postCameDownAt,
  postComingDownOf,
  postStoppedWhyOf,
  postWaitsForItsTime,
  type PieceTakeDownDto,
  type PostDto,
  type PostKind,
  type PostPlace,
} from "@chanlytics/contracts";

/** A line's tone: up, moving, the owner's to act on, ended, or plain. */
export type GoesTone = "ok" | "live" | "you" | "gone" | "";

/** What a line offers, as data: the page draws each as a press and knows what it does. */
export type GoesAct =
  | { is: "see"; href: string }
  | { is: "move"; postId: string }
  | { is: "pull"; postId: string; says: string }
  | { is: "tell_ai"; says: string; prompt: string }
  /** A line to AI the owner finishes: its hint, and what their words are begun with. */
  | { is: "say_ai"; hint: string; begin: string }
  | { is: "approve"; says: string }
  | { is: "words"; says: string }
  | { is: "connect" }
  | { is: "open_place"; says: string; href: string }
  | { is: "deleted"; postId: string }
  /** "Keep it up", of a post a place left to its owner to delete: it stays, on their word. */
  | { is: "keep"; postId: string };

/** One placement's line. */
export interface GoesLine {
  key: string;
  place: PostPlace;
  kind: PostKind;
  /** "Instagram reel", "Instagram story", "Instagram post", "Google". */
  name: string;
  said: string;
  tone: GoesTone;
  /** A second, quieter sentence: what is happening, or how to do it by hand. */
  note: string | null;
  /** Something is moving and mends itself: the line's one ring turns. */
  moving: boolean;
  acts: GoesAct[];
  /** What the piece's one status says for this line, where that is not the line's own words; null where it is. */
  status: string | null;
}

export const GOES_WORDS = {
  title: "Where it goes",
  /** The line to AI at the piece's foot. */
  tell: "Tell AI what to change",
  notYet: "Not yet",
  hereToo: "Post it here too",
  timed: (when: string) => `Goes up ${when}`,
  changeTime: "Change time",
  dontPost: "Don't post",
  gettingReady: (place: PostPlace) => `${POST_PLACE_SAID[place]} is getting it ready`,
  posting: (place: PostPlace) => `Posting to ${POST_PLACE_SAID[place]}`,
  checking: (place: PostPlace) => `Checking with ${POST_PLACE_SAID[place]}`,
  checkingNote: (place: PostPlace) =>
    `No answer came back, so Chanlytics is asking ${POST_PLACE_SAID[place]} what it has. It won't post twice.`,
  up: (place: PostPlace, when: string | null) =>
    when ? `On ${POST_PLACE_SAID[place]} · ${when}` : `On ${POST_PLACE_SAID[place]}`,
  storyEnded: (place: PostPlace, when: string | null) =>
    when ? `Was on ${POST_PLACE_SAID[place]} for a day · ${when}` : `Was on ${POST_PLACE_SAID[place]} for a day`,
  seeIt: "See it",
  changed: "Changed since you approved it",
  lookAgain: "Look again",
  leaveOut: "Leave it out",
  changeWords: "Change the words",
  stillSo: "Tell AI it still stands",
  needsConnecting: (place: PostPlace) => `${POST_PLACE_SAID[place]} needs connecting again`,
  connect: "Connect",
  paused: "AI is paused · nothing posts",
  didnt: (reason: string | null) => (reason ? `Didn't post · ${reason}` : "Didn't post"),
  tryAgain: "Try again",
  shorten: "Shorten it",
  makeAgain: "Make it again",
  dismiss: "Dismiss",
  lateNote: "It was fixed after the day it was about.",
  /** What the line to AI is begun with. */
  ask: {
    stillSo: "It still stands: ",
    again: "Make it again",
  },
  /** The piece's one status, where every placement says the same or one leads. */
  pill: {
    changed: "Changed · approve it again",
    didnt: (place: PostPlace) => `Didn't post on ${POST_PLACE_SAID[place]}`,
    places: (words: string, n: number) => (n > 1 ? `${words} · ${n} places` : words),
  },
} as const;

/** What the lines read beside the posts. */
interface GoesKnown {
  takeDown: PieceTakeDownDto | null;
  /** A short moment, in the page's zone: "Sat 5:26 PM". */
  when: (iso: string) => string;
  nowMs: number;
  /** Whether this person may post: a reader's line says where it stands, and offers only its door to the post. */
  may: boolean;
}

/** The order a piece's placements are listed in. */
const GOES_ORDER: readonly (readonly [PostPlace, PostKind])[] = [
  ["instagram", "reel"],
  ["instagram", "picture"],
  ["instagram", "story"],
  ["google", "picture"],
  // A Page (pass 5), after the places a piece already went to, in Instagram's order.
  ["facebook", "reel"],
  ["facebook", "picture"],
  ["facebook", "story"],
];

type Said = Pick<GoesLine, "said" | "tone" | "note" | "moving" | "acts" | "status">;
const lineSaysOf = (line: string, tone: GoesTone, more: Partial<Said> = {}): Said => ({
  said: line,
  tone,
  note: null,
  moving: false,
  acts: [],
  status: null,
  ...more,
});

const KIND_SAID: Record<PostKind, string> = { picture: "post", story: "story", reel: "reel" };

/** A post being taken down, or one a take-down could not finish. */
function comingDownSaid(post: PostDto, known: GoesKnown): Said | null {
  const down = postComingDownOf(post, known.takeDown, known.nowMs);
  if (!down) return null;
  const { place } = post;
  if (down.is === "asking") return lineSaysOf(TAKE_DOWN_WORDS.asking(place), "live", { moving: true });
  if (down.is === "unconfirmed")
    return lineSaysOf(TAKE_DOWN_WORDS.unconfirmed(place), "", {
      note: TAKE_DOWN_WORDS.unconfirmedNote(known.when(down.since)),
    });
  // The place could not, or refused: the step by hand, with the place's own link, and the owner's word once it is
  // done; or their other choice, to keep it up (the canvas's Piece 34: the third press, after the two that finish it).
  const acts: GoesAct[] = known.may
    ? [
        ...(post.permalink
          ? [{ is: "open_place", says: TAKE_DOWN_WORDS.open(place), href: post.permalink } satisfies GoesAct]
          : []),
        { is: "deleted", postId: post.id },
        { is: "keep", postId: post.id },
      ]
    : [];
  const stillUp = down.said === TAKE_DOWN_WORDS.stillUp(place);
  return lineSaysOf(TAKE_DOWN_WORDS.cant(place), "you", {
    note: stillUp ? down.said : TAKE_DOWN_WORDS.cantHow(place, KIND_SAID[post.kind]),
    acts,
  });
}

/**
 * How long a post Instagram took may still be on its way to being seen on the account: the account is asked two minutes
 * after the send (00681 post_moved), and again a few times where it gives no answer.
 */
const POST_SEEN_WAIT_MS = 10 * MIN_MS;

/**
 * A post's take-down that its owner answered by leaving the post up, where a place had left the delete to them ("Keep
 * it up", 00689): it holds who and when. Undefined where its take-down says anything else.
 */
const leftUpOf = (post: PostDto, takeDown: PieceTakeDownDto | null) =>
  takeDown?.actions.find(
    (a) => a.target === "post" && a.target_id === post.id && a.act === "take_down" && a.outcome === "left_up",
  );

/** A story that has run its day: gone from the place by itself, though its row still says it went up (Meta says nothing). */
const storyRanItsDay = (post: Pick<PostDto, "kind" | "published_at">, nowMs: number): boolean =>
  post.kind === "story" && !!post.published_at && nowMs - Date.parse(post.published_at) > DAY_MS;

/** A post that is up: seen there, sent and not yet seen, a story that ended by itself, or one kept up by choice. */
function upSaid(post: PostDto, known: GoesKnown): Said {
  const at = post.published_at ? known.when(post.published_at) : null;
  if (storyRanItsDay(post, known.nowMs)) return lineSaysOf(GOES_WORDS.storyEnded(post.place, at), "gone");
  const see: GoesAct[] = post.permalink ? [{ is: "see", href: post.permalink }] : [];
  // Left up by its owner's own word, where a place would not take it down (the canvas's Piece 35): who kept it and
  // when, in green, so a teammate reads a choice. The piece's one status says where it is: on the place.
  const left = leftUpOf(post, known.takeDown);
  if (left?.finished_at)
    return lineSaysOf(TAKE_DOWN_WORDS.keptUp(left.left_up_by, known.when(left.finished_at)), "ok", {
      acts: see,
      status: GOES_WORDS.up(post.place, null),
    });
  // Instagram's is said to be on the account only once the account was read holding it, and until then it is still
  // posting: no word between the two (PRD 8.2 as the canvas's call 7 took it). Past the time that read takes, nobody
  // can say it went up, and the line says so in the words a send with no answer always had.
  // A Page's the same (pass 5): a reel is up only once Meta says it is published.
  if (post.place !== "google" && !post.verified_at) {
    const sentMs = post.published_at ? Date.parse(post.published_at) : known.nowMs;
    const unknown = post.place === "facebook" ? ON_FACEBOOK.refused.unknown : ON_INSTAGRAM.refused.unknown;
    return known.nowMs - sentMs < POST_SEEN_WAIT_MS
      ? lineSaysOf(GOES_WORDS.posting(post.place), "live", { moving: true })
      : lineSaysOf(unknown, "you", { acts: see });
  }
  return lineSaysOf(GOES_WORDS.up(post.place, at), "ok", { acts: see });
}

/** A post on its way: set for its time, or going up now, step by step. */
function onItsWaySaid(post: PostDto, known: GoesKnown): Said {
  const { place } = post;
  if (postWaitsForItsTime(post, known.nowMs)) {
    const acts: GoesAct[] = known.may
      ? [
          ...(post.status === "queued" ? [{ is: "move", postId: post.id } satisfies GoesAct] : []),
          ...(POST_PULLABLE.includes(post.status)
            ? [{ is: "pull", postId: post.id, says: GOES_WORDS.dontPost } satisfies GoesAct]
            : []),
        ]
      : [];
    return lineSaysOf(GOES_WORDS.timed(known.when(post.scheduled_for)), "", { acts });
  }
  if (post.status === "checking")
    return lineSaysOf(GOES_WORDS.checking(place), "live", { moving: true, note: GOES_WORDS.checkingNote(place) });
  if (post.status === "preparing") return lineSaysOf(GOES_WORDS.gettingReady(place), "live", { moving: true });
  return lineSaysOf(GOES_WORDS.posting(place), "live", { moving: true });
}

/** A post the recheck held: what stands in the way, and its one fix. */
function heldSaid(post: PostDto, known: GoesKnown): Said {
  const heldWhy = post.held_why;
  const mine = (acts: GoesAct[]): GoesAct[] => (known.may ? acts : []);
  const leave: GoesAct = { is: "pull", postId: post.id, says: GOES_WORDS.leaveOut };
  const words: GoesAct = { is: "words", says: GOES_WORDS.changeWords };
  if (heldWhy === "changed")
    return lineSaysOf(GOES_WORDS.changed, "you", { acts: mine([{ is: "approve", says: GOES_WORDS.lookAgain }]) });
  if (heldWhy === "disconnected" || heldWhy === "line_off" || heldWhy === "place")
    return lineSaysOf(GOES_WORDS.needsConnecting(post.place), "you", { acts: mine([{ is: "connect" }]) });
  if (heldWhy === "stopped") return lineSaysOf(GOES_WORDS.paused, "you");
  const reason = post.held_reason ?? ON_INSTAGRAM.status.held;
  if (heldWhy === "reason_passed")
    return lineSaysOf(reason, "you", {
      acts: mine([leave, words, { is: "say_ai", hint: GOES_WORDS.stillSo, begin: GOES_WORDS.ask.stillSo }]),
    });
  if (heldWhy === "claim") return lineSaysOf(reason, "you", { acts: mine([words, leave]) });
  if (heldWhy === "money") return lineSaysOf(reason, "you", { acts: mine([leave]) });
  return lineSaysOf(reason, "you", { acts: mine([{ is: "pull", postId: post.id, says: GOES_WORDS.dismiss }]) });
}

/** A post the place refused: its reason in the owner's words, and the one thing to do. */
function failedSaid(post: PostDto, known: GoesKnown): Said {
  const stoppedWhy = postStoppedWhyOf(post);
  const fix: GoesAct =
    stoppedWhy === ON_INSTAGRAM.refused.words
      ? { is: "words", says: GOES_WORDS.shorten }
      : stoppedWhy === ON_INSTAGRAM.refused.video || stoppedWhy === ON_INSTAGRAM.refused.picture
        ? { is: "tell_ai", says: GOES_WORDS.makeAgain, prompt: GOES_WORDS.ask.again }
        : { is: "approve", says: GOES_WORDS.tryAgain };
  return lineSaysOf(GOES_WORDS.didnt(stoppedWhy), "you", {
    acts: known.may ? [fix, { is: "pull", postId: post.id, says: GOES_WORDS.dismiss }] : [],
  });
}

/** Where one post stands, or null where it says nothing of its placement any more (let go by the owner). */
function postSaid(post: PostDto, known: GoesKnown): Said | null {
  const down = comingDownSaid(post, known);
  if (down) return down;
  if (post.status === "taken_down") {
    const at = postCameDownAt(post, known.takeDown);
    return lineSaysOf(TAKE_DOWN_WORDS.cameDown(at ? known.when(at) : null), "gone");
  }
  if (post.status === "published") return upSaid(post, known);
  if (post.status === "held") return heldSaid(post, known);
  if (post.status === "failed") return failedSaid(post, known);
  // Let go because its day went by: said, since it never went. One the owner let go says nothing: the place is free again.
  if (post.status === "pulled")
    return post.held_why === "late" && post.held_reason
      ? lineSaysOf(post.held_reason.replace(/\.$/u, "").replace(". ", " · "), "gone", { note: GOES_WORDS.lateNote })
      : null;
  return onItsWaySaid(post, known);
}

/**
 * The piece's placements, in one order: for each place and kind, the newest post that has something to say, and under it
 * the one that is up where a newer one waits, goes up or stopped (a second post after Monday's), so neither hides the
 * other. A placement whose posts say nothing (the owner let it go) has no line: the place is offered again where a post
 * can go.
 */
export function goesLinesOf(posts: readonly PostDto[], known: GoesKnown): GoesLine[] {
  const newestFirst = [...posts].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return GOES_ORDER.flatMap(([place, kind]) => {
    const there = newestFirst.filter((p) => p.place === place && p.kind === kind);
    const lines = there.flatMap((post) => {
      const line = postSaid(post, known);
      return line ? [{ key: post.id, place, kind, name: placementSaid(place, kind), post, ...line }] : [];
    });
    const first = lines[0];
    if (!first) return [];
    const settled = first.post.status === "published" || first.post.status === "taken_down";
    const up = settled ? undefined : lines.find((line) => line.post.status === "published");
    return [first, ...(up ? [up] : [])].map(({ post: _post, ...line }) => line);
  });
}

/** The order the piece's one status is chosen in: what needs the owner, then what moves, then what is up. */
const LEADS: readonly GoesTone[] = ["you", "live", "", "ok", "gone"];

/**
 * The piece's status in one sentence, for its pill: the line that leads, short. A change since the approval asks for it
 * again; several placements set for the same thing say how many.
 */
export function goesPillOf(lines: readonly GoesLine[]): { said: string; tone: GoesTone; moving: boolean } | null {
  const lead = LEADS.flatMap((tone) => lines.filter((line) => line.tone === tone))[0];
  if (!lead) return null;
  if (lead.said === GOES_WORDS.changed) return { said: GOES_WORDS.pill.changed, tone: "you", moving: false };
  // A refusal's reason is its line's to say: the pill says where it did not go.
  if (lead.said.startsWith(GOES_WORDS.didnt(null)))
    return { said: GOES_WORDS.pill.didnt(lead.place), tone: "you", moving: false };
  // A line whose words are its own to say (a post kept up) gives the status the place it stands at.
  const statusOf = (line: GoesLine): string => line.status ?? line.said;
  const same = lines.filter((line) => line.tone === lead.tone && statusOf(line) === statusOf(lead)).length;
  const timed = lead.tone === "" ? lines.filter((line) => line.tone === "").length : same;
  return { said: GOES_WORDS.pill.places(statusOf(lead), timed), tone: lead.tone, moving: lead.moving };
}

/**
 * Where a piece's take-down stands: still open (a place asked, or the owner's to finish), and whether a place is yet to
 * answer. A post its owner chose to leave up is neither: nothing of it waits, and Take down is there again.
 */
export function takeDownStandsOf(takeDown: PieceTakeDownDto | null): { open: boolean; asking: boolean } {
  const actions = takeDown?.actions.filter((a) => a.act === "take_down") ?? [];
  return {
    open: actions.some((a) => a.outcome !== "done" && a.outcome !== "left_up"),
    asking: actions.some((a) => a.outcome === "pending"),
  };
}

/**
 * Whether a piece has anything a take-down would reach: a post up, or on its way up. A story that has run its day is
 * gone already, and a take-down asks nothing of it (00682), so it alone offers nothing to press.
 */
export const takeDownOffered = (
  posts: readonly Pick<PostDto, "status" | "kind" | "published_at">[],
  nowMs: number,
): boolean =>
  posts.some(
    (post) =>
      post.status === "publishing" ||
      post.status === "checking" ||
      (post.status === "published" && !storyRanItsDay(post, nowMs)),
  );
