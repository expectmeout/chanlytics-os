/**
 * Where a piece stands, as AI is told it (the content status review of 24 Nov 2026, B4). AI's read of the business's
 * files carried no standing, so "is my post up?" and "why didn't Saturday's story go?" had no source. This says it from
 * the one standing every screen reads (standing.ts pieceStandingOf) in the one table's words (standing-words.ts, its
 * `ai` column), so what AI says of a piece is what its tile and its open piece say.
 *
 * One clause a placement (a place and a kind), each named by what it is: `post: up on Instagram since Mon, 9:02 AM`. A
 * post still up beneath a newer one of its placement is said too, and a newer one let go because its day passed. A
 * piece nothing of which ever went out says so in one clause. Pure: the time, and how a moment is said, are handed in.
 */
import { postStoppedWhyOf, type PostDto, type PostKind } from "../posts";
import { STANDING_WORDS } from "./standing-words";
import { pieceStandingOf, type PlacementStanding, type PostStands } from "./standing";

/** What a placement is called before its clause: a Google post is a post. */
const KIND_NAMED = { picture: "post", story: "story", reel: "reel" } as const satisfies Record<PostKind, string>;

/** What the clauses are handed: the time, and a moment in the business's own words ("Mon, 9:02 AM"). */
export interface StandsSaidKnown {
  nowMs: number;
  when: (iso: string) => string;
}

/** One post's standing as a clause; null for one its owner let go, which says nothing: its place is free again. */
function clauseOf(at: PostStands, standing: PlacementStanding, known: StandsSaidKnown): string | null {
  const says = STANDING_WORDS;
  const { place } = at.post;
  const moment = (iso: string | null): string | null => (iso ? known.when(iso) : null);
  if (standing.is === "waiting") return says.waiting.ai(place, known.when(standing.at));
  if (standing.is === "going_up") return says.going_up.ai(place);
  if (standing.is === "checking") return says.checking.ai(place);
  if (standing.is === "unconfirmed") return says.unconfirmed.ai(place);
  if (standing.is === "up") return says.up.ai(place, moment(standing.at));
  if (standing.is === "ended") return says.ended.ai(moment(standing.at));
  if (standing.is === "stopped") return says.stopped.ai(place, postStoppedWhyOf(at.post));
  if (standing.is === "came_down")
    return standing.there ? says.removed.ai(place, moment(standing.at)) : says.came_down.ai(place, moment(standing.at));
  return standing.late ? says.let_go.ai : null;
}

/**
 * Where a piece stands, a clause a placement, in the order its places are listed; `["never posted"]` for one nothing
 * of which ever went out. A post its owner put up themselves is said first, since nothing here sent it.
 */
export function pieceStandsSaid(
  piece: { posts: readonly PostDto[]; byHandWhere?: string | null | undefined },
  known: StandsSaidKnown,
): string[] {
  const { placements } = pieceStandingOf(piece.posts, null, known.nowMs);
  const clauses = placements.flatMap((at) => {
    const named = (post: PostStands, standing: PlacementStanding): string[] => {
      const clause = clauseOf(post, standing, known);
      return clause ? [`${KIND_NAMED[at.kind]}: ${clause}`] : [];
    };
    return [
      ...named(at, at.standing),
      ...(at.under ? named(at.under, at.under.standing) : []),
      ...(at.late ? named(at.late, at.late.standing) : []),
    ];
  });
  const byHand = piece.byHandWhere === undefined ? [] : [STANDING_WORDS.by_hand.ai(piece.byHandWhere)];
  const every = [...byHand, ...clauses];
  return every.length > 0 ? every : [STANDING_WORDS.never.ai];
}
