/**
 * Where a piece goes, a line a placement (the content loop PRD's 8.2 and 21.3; the journey canvas, board Piece, cells 11
 * to 24): each place and kind the piece has a post at, where it stands there in the owner's words, whether it mends
 * itself, and the one thing to do. Where each post stands is contracts' one answer (placements/standing.ts), the same
 * one the piece's tile reads; here it is given its words and its presses. A post is "On Instagram" only once the
 * account was seen holding it; a story says when it ended by itself; a take-down says the place's answer and never
 * guesses it. Pure: the posts, its take-down, a clock and now are handed in.
 */
import {
  ON_INSTAGRAM,
  POST_PLACE_SAID,
  POST_PULLABLE,
  STANDING_WORDS,
  TAKE_DOWN_WORDS,
  pieceStandingOf,
  placementSaid,
  placementStandingOf,
  postComingDownOf,
  postStoppedWhyOf,
  standingIsOut,
  type PieceTakeDownDto,
  type PlacementStanding,
  type PostDto,
  type PostKind,
  type PostPlace,
  type PostStands,
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
  | { is: "keep"; postId: string }
  /** "It's there" and "It's not there", of a post its place never confirmed: its owner looked, and says which. */
  | { is: "there"; postId: string }
  | { is: "not_there"; postId: string };

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
  hereToo: "Post it here too",
  changeTime: "Change time",
  dontPost: "Don't post",
  seeIt: "See it",
  changed: "Changed since you approved it",
  lookAgain: "Look again",
  leaveOut: "Leave it out",
  changeWords: "Change the words",
  stillSo: "Tell AI it still stands",
  needsConnecting: (place: PostPlace) => `${POST_PLACE_SAID[place]} needs connecting again`,
  connect: "Connect",
  paused: "AI is paused · nothing posts",
  tryAgain: "Try again",
  shorten: "Shorten it",
  makeAgain: "Make it again",
  dismiss: "Dismiss",
  /** What the line to AI is begun with. */
  ask: {
    stillSo: "It still stands: ",
    again: "Make it again",
  },
  /** The piece's one status, where every placement says the same or one leads. */
  pill: {
    changed: "Changed · approve it again",
    places: (words: string, n: number) => (n > 1 ? `${words} · ${n} places` : words),
  },
} as const;

/** Where a post stands, in words: the one table every screen reads (contracts standing-words.ts), here its `line` column. */
const SAYS = STANDING_WORDS;

/** What the lines read beside the posts. */
interface GoesKnown {
  takeDown: PieceTakeDownDto | null;
  /** A short moment, in the page's zone: "Sat 5:26 PM". */
  when: (iso: string) => string;
  nowMs: number;
  /** Whether this person may post: a reader's line says where it stands, and offers only its door to the post. */
  may: boolean;
}

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
    note: stillUp ? down.said : TAKE_DOWN_WORDS.cantHow(place, post.kind),
    acts,
  });
}

/**
 * A post's take-down that its owner answered by leaving the post up, where a place had left the delete to them ("Keep
 * it up", 00689): it holds who and when. Undefined where its take-down says anything else.
 */
const leftUpOf = (post: PostDto, takeDown: PieceTakeDownDto | null) =>
  takeDown?.actions.find(
    (a) => a.target === "post" && a.target_id === post.id && a.act === "take_down" && a.outcome === "left_up",
  );

/** The door to a post at its place, where it has one. */
const seeOf = (post: PostDto): GoesAct[] => (post.permalink ? [{ is: "see", href: post.permalink }] : []);

/** A post that is up, seen at its place: when it went up, or who chose to keep it up. */
function upSaid(post: PostDto, known: GoesKnown): Said {
  // Left up by its owner's own word, where a place would not take it down (the canvas's Piece 35): who kept it and
  // when, in green, so a teammate reads a choice. The piece's one status says where it is: on the place.
  const left = leftUpOf(post, known.takeDown);
  if (left?.finished_at)
    return lineSaysOf(TAKE_DOWN_WORDS.keptUp(left.left_up_by, known.when(left.finished_at)), "ok", {
      acts: seeOf(post),
      status: SAYS.up.line(post.place, null),
    });
  const at = post.published_at ? known.when(post.published_at) : null;
  return lineSaysOf(SAYS.up.line(post.place, at), "ok", { acts: seeOf(post) });
}

/** A post set for its time: when it goes, with Change time and Don't post while each still can be. */
function waitingSaid(post: PostDto, known: GoesKnown): Said {
  const acts: GoesAct[] = known.may
    ? [
        ...(post.status === "queued" ? [{ is: "move", postId: post.id } satisfies GoesAct] : []),
        ...(POST_PULLABLE.includes(post.status)
          ? [{ is: "pull", postId: post.id, says: GOES_WORDS.dontPost } satisfies GoesAct]
          : []),
      ]
    : [];
  return lineSaysOf(SAYS.waiting.line(known.when(post.scheduled_for)), "", { acts });
}

/** A post going up now, step by step: its place is getting it ready, or it is being posted and not yet seen there. */
const goingUpSaid = (post: PostDto): Said =>
  post.status === "preparing"
    ? lineSaysOf(SAYS.going_up.lineGettingReady(post.place), "live", { moving: true })
    : lineSaysOf(SAYS.going_up.line(post.place), "live", { moving: true });

/**
 * The place a post of the piece was removed at itself, by its owner there or by the place, or null: what an ad made
 * from the piece says while it still runs (contracts ads/on-piece.ts). The first in the order places are listed.
 */
export function removedPlaceOf(
  posts: readonly PostDto[],
  takeDown: PieceTakeDownDto | null,
  nowMs: number,
): PostPlace | null {
  const { placements } = pieceStandingOf(posts, takeDown, nowMs);
  return placements.find((at) => at.standing.is === "came_down" && at.standing.there)?.place ?? null;
}

/**
 * A post its place took and was never seen holding, past the time that read takes: nobody here can say it went up. The
 * line says so in its tile's words, and asks its owner, who can look: two presses, the first the one that leads (the
 * content status review of 24 Nov 2026, D5). A reader is asked nothing.
 */
const unconfirmedSaid = (post: PostDto, known: GoesKnown): Said =>
  lineSaysOf(SAYS.unconfirmed.line(post.place), "you", {
    note: SAYS.unconfirmed.note(post.place),
    acts: [
      ...(known.may
        ? [{ is: "there", postId: post.id } satisfies GoesAct, { is: "not_there", postId: post.id } satisfies GoesAct]
        : []),
      ...seeOf(post),
    ],
  });

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
  const reason = post.held_reason ?? ON_INSTAGRAM.heldNoReason;
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
  return lineSaysOf(SAYS.stopped.line(stoppedWhy), "you", {
    acts: known.may ? [fix, { is: "pull", postId: post.id, says: GOES_WORDS.dismiss }] : [],
  });
}

/**
 * A post that never went, or is no longer there: what its standing says, in grey. One removed at its place itself says
 * so, with when it was noticed, and that Chanlytics did not take it down (the review of 24 Nov 2026, A12).
 */
function goneSaid(post: PostDto, standing: PlacementStanding, known: GoesKnown): Said | null {
  const when = "at" in standing && standing.at ? known.when(standing.at) : null;
  if (standing.is === "came_down")
    return standing.there
      ? lineSaysOf(SAYS.removed.line(post.place, when), "gone", { note: SAYS.removed.note(post.place) })
      : lineSaysOf(SAYS.came_down.line(when), "gone");
  if (standing.is === "ended") return lineSaysOf(SAYS.ended.line(when), "gone");
  // Let go because its day went by: said, since it never went. One the owner let go says nothing: the place is free again.
  if (standing.is === "let_go" && standing.late && post.held_reason)
    return lineSaysOf(SAYS.let_go.line(post.held_reason), "gone", { note: SAYS.let_go.note });
  return null;
}

/**
 * Where one post stands, in the owner's words, from its standing; null where it says nothing of its placement (let go
 * by the owner). A post still out that a take-down reached says where that stands first: asked and waiting, the
 * owner's to finish, or late with no answer.
 */
function postSaid({ post, standing }: PostStands, known: GoesKnown): Said | null {
  const down = standingIsOut(standing) ? comingDownSaid(post, known) : null;
  if (down) return down;
  if (standing.is === "up") return upSaid(post, known);
  if (standing.is === "unconfirmed") return unconfirmedSaid(post, known);
  if (standing.is === "stopped") return post.status === "held" ? heldSaid(post, known) : failedSaid(post, known);
  if (standing.is === "waiting") return waitingSaid(post, known);
  if (standing.is === "checking")
    return lineSaysOf(SAYS.checking.line(post.place), "live", {
      moving: true,
      note: SAYS.checking.note(post.place),
    });
  if (standing.is === "going_up") return goingUpSaid(post);
  return goneSaid(post, standing, known);
}

/**
 * The piece's placements, in the one order (contracts pieceStandingOf): for each place and kind, the post that speaks
 * for it, and under it the one still up where a newer one waits, goes up, stopped or was never confirmed (a second post
 * after Monday's), so neither hides the other; over it, a newer one that was let go because its day passed. A placement whose posts say nothing (the owner let it go) has no line:
 * the place is offered again where a post can go.
 */
export function goesLinesOf(posts: readonly PostDto[], known: GoesKnown): GoesLine[] {
  return pieceStandingOf(posts, known.takeDown, known.nowMs).placements.flatMap((at) =>
    [...(at.late ? [at.late] : []), at, ...(at.under ? [at.under] : [])].flatMap((stands) => {
      const line = postSaid(stands, known);
      return line
        ? [{ key: stands.post.id, place: at.place, kind: at.kind, name: placementSaid(at.place, at.kind), ...line }]
        : [];
    }),
  );
}

/** The order the piece's one status is chosen in: what needs the owner, then what moves, then what is up. */
const LEADS: readonly GoesTone[] = ["you", "live", "", "ok", "gone"];

/**
 * The piece's status in one sentence, for its pill: the line that leads, short. A change since the approval asks for it
 * again; several placements set for the same thing say how many. `leads` is the post the piece's one standing leads
 * with (contracts pieceStandingOf, goesLeadOf): among the lines of the leading tone it is the one said, so the open
 * piece and its tile name the same post (the soonest that waits, the last that came down).
 */
export function goesPillOf(
  lines: readonly GoesLine[],
  leads: string | null,
): { said: string; tone: GoesTone; moving: boolean } | null {
  const leading = LEADS.flatMap((tone) => lines.filter((line) => line.tone === tone));
  const lead = leading.find((line) => line.tone === leading[0]?.tone && line.key === leads) ?? leading[0];
  if (!lead) return null;
  if (lead.said === GOES_WORDS.changed) return { said: GOES_WORDS.pill.changed, tone: "you", moving: false };
  // A refusal's reason is its line's to say: the pill says where it did not go.
  if (lead.said.startsWith(SAYS.stopped.line(null)))
    return { said: SAYS.stopped.status(lead.place), tone: "you", moving: false };
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

/** The post a piece's one standing leads with, by its id; null for a piece that never went out. */
export function goesLeadOf(posts: readonly PostDto[], takeDown: PieceTakeDownDto | null, nowMs: number): string | null {
  const { lead } = pieceStandingOf(posts, takeDown, nowMs);
  return lead.is === "never" ? (lead.late?.post.id ?? null) : lead.at.post.id;
}

/**
 * Whether a piece has anything a take-down would reach: a post out, at its place or past holding on its way there
 * (contracts standingIsOut). A story that has run its day is gone already, and a take-down asks nothing of it (00682),
 * so it alone offers nothing to press.
 */
export const takeDownOffered = (posts: readonly PostDto[], nowMs: number): boolean =>
  posts.some((post) => standingIsOut(placementStandingOf(post, null, nowMs)));
