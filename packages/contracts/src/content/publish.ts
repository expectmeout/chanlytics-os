/**
 * A made post put up at its places by Ask, now or at a time (Ruben, 12 Nov 2026: a time is asked of Ask, never offered on the
 * page as times written into it, the same for every business). The owner says "post it Saturday at ten"; Ask answers with a
 * card that names the post, where it goes, when, and the caption that goes with it; the owner presses Post. The press goes
 * through each place's own door (POST files/[id]/google, POST files/[id]/instagram), as the page's Post it does, so every
 * check a door makes it still makes. A caption Ask wrote is kept on the post first, as Details keeps one, so the post says
 * what went: the caption is typed in one place, and read the same way by every place that says it (postCaptionOf).
 */
import { asText, rec, type ProposalCall, type ProposalSpecAboveOperator } from "../ask/proposals/spec";
import { postSentencesOf } from "../files/post";
import type { FileMade } from "../files/views";
import { isOneOf, nonBlankOrNull } from "../shared/unknown";
import { CONTENT_ROUTE } from "./address";
import { INSTAGRAM_POST_KINDS, POST_PLACES, type InstagramPostKind, type PostDto, type PostPlace } from "./posts";

/**
 * A made post's caption, as Details says it, as Post it sends it and as Ask's card proposes it: theirs where they wrote one
 * (none, where they cleared it), else what went to a place, newest first, else what Ask wrote on the picture.
 */
export function postCaptionOf(posts: readonly Pick<PostDto, "caption">[], made: FileMade | null): string | null {
  if (made && made.caption !== null) return made.caption.trim() || null;
  const sent = posts.find((p) => p.caption && p.caption.trim())?.caption ?? null;
  if (sent) return sent;
  return made ? postSentencesOf([made.plan.line, made.plan.under]) || null : null;
}

/** What Ask's card to put a post up holds. */
export interface PostPublish {
  file_id: string;
  /** Where it is put up. A place whose post is moved instead is in `moves`, never here too. */
  places: PostPlace[];
  /**
   * The posts already set for a time, each at its place, that go to this card's `when` in place of a second one there (00621,
   * Change time as the page has it); none on most cards.
   */
  moves: { place: PostPlace; post_id: string }[];
  /** On Instagram, a post or a story; a story shows no caption. */
  as: InstagramPostKind;
  /** When it goes up, with its offset; null is as the card is pressed. */
  when: string | null;
  /** That time as the business's clock says it ("Saturday, Nov 15 at 10:00 AM"), for the card and its receipt. */
  when_said: string | null;
  caption: string;
  /** The caption is Ask's, not the one the post has: pressed, it is kept on the post first. */
  caption_new: boolean;
  language: "en" | "es";
}

/** The moves a payload names, each a place and the post waiting there; anything else is left out. */
function movesIn(value: unknown): PostPublish["moves"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((one) => {
    const move = rec(one);
    const postId = asText(move.post_id);
    return isOneOf(POST_PLACES, move.place) && postId ? [{ place: move.place, post_id: postId }] : [];
  });
}

/** A card's payload, read back. */
export function postPublishOf(payload: Record<string, unknown>): PostPublish {
  const places = Array.isArray(payload.places) ? payload.places.filter((p) => isOneOf(POST_PLACES, p)) : [];
  return {
    file_id: asText(payload.file_id),
    places: POST_PLACES.filter((p) => places.includes(p)),
    moves: movesIn(payload.moves),
    as: isOneOf(INSTAGRAM_POST_KINDS, payload.as) ? payload.as : "picture",
    when: nonBlankOrNull(payload.when),
    when_said: nonBlankOrNull(payload.when_said),
    caption: asText(payload.caption),
    caption_new: payload.caption_new === true,
    language: payload.language === "es" ? "es" : "en",
  };
}

const PLACE_WORDS = {
  en: { instagram: "Instagram", story: "your Instagram story", google: "Google", and: "and" },
  es: { instagram: "Instagram", story: "tu historia de Instagram", google: "Google", and: "y" },
} as const;

/** Where it goes, in words: "Instagram and Google", "your Instagram story". */
function whereSaid(p: Pick<PostPublish, "places" | "as" | "language">): string {
  const w = PLACE_WORDS[p.language];
  return p.places.map((place) => (place === "instagram" && p.as === "story" ? w.story : w[place])).join(` ${w.and} `);
}

const PUBLISH_WORDS = {
  en: {
    title: (name: string) => `Post ${name}`,
    summary: (where: string, when: string | null) => (when ? `To ${where}, ${when}.` : `To ${where}, now.`),
    sent: (where: string) => `On its way to ${where}.`,
    set: (where: string, when: string) => `Set for ${when} on ${where}.`,
    /** A card that only moves a post already set: its head, its line, and what its press says (the page's own words). */
    moveTitle: (name: string) => `Move ${name}`,
    moveSummary: (where: string, when: string) => `On ${where}, to ${when}.`,
    alsoMoves: (where: string) => `${where} moves to it.`,
    moved: (where: string, when: string) => `Now set for ${when} on ${where}.`,
  },
  es: {
    title: (name: string) => `Publicar ${name}`,
    summary: (where: string, when: string | null) => (when ? `En ${where}, ${when}.` : `En ${where}, ahora.`),
    sent: (where: string) => `En camino a ${where}.`,
    set: (where: string, when: string) => `Programado para ${when} en ${where}.`,
    moveTitle: (name: string) => `Mover ${name}`,
    moveSummary: (where: string, when: string) => `En ${where}, para ${when}.`,
    alsoMoves: (where: string) => `${where} pasa a esa hora.`,
    moved: (where: string, when: string) => `Ahora programado para ${when} en ${where}.`,
  },
} as const;

/** Where its moved posts are, in words, as where it goes is said. */
const movedWhere = (p: PostPublish): string => whereSaid({ ...p, places: p.moves.map((move) => move.place) });

/** The card's head and its one line, as Ask's tool makes them. */
export function publishCardWords(p: PostPublish, name: string): { title: string; summary: string } {
  const says = PUBLISH_WORDS[p.language];
  const moves = p.moves.length > 0 && p.when_said !== null;
  // Only a move: the post is up for no new place, so the card says what moves and to when.
  if (moves && p.places.length === 0)
    return { title: says.moveTitle(name), summary: says.moveSummary(movedWhere(p), p.when_said ?? "") };
  const summary = says.summary(whereSaid(p), p.when_said);
  return { title: says.title(name), summary: moves ? `${summary} ${says.alsoMoves(movedWhere(p))}` : summary };
}

/**
 * The press's calls: the caption kept first where it is new, then each post already set moved to the card's time (the file's
 * one door for it, 00621), then each place's own door, now or at its time.
 */
function publishCallsOf(p: PostPublish): ProposalCall[] {
  const id = { id: p.file_id };
  const when = p.when ? { when: p.when } : {};
  const calls: ProposalCall[] = [];
  if (p.caption_new) calls.push({ route: "PATCH files/[id]", params: id, body: { caption: p.caption } });
  if (p.when)
    for (const move of p.moves)
      calls.push({ route: "PATCH files/[id]/posts", params: id, body: { post_id: move.post_id, when: p.when } });
  if (p.places.includes("google"))
    calls.push({ route: "POST files/[id]/google", params: id, body: { summary: p.caption, ...when } });
  if (p.places.includes("instagram"))
    calls.push({
      route: "POST files/[id]/instagram",
      params: id,
      body: { as: p.as, ...(p.as === "story" ? {} : { caption: p.caption }), ...when },
    });
  return calls;
}

/**
 * Ask's card to put a made post up. Whoever may post from the page may press it: the press is the approval, as it is there.
 * No Undo of its own: a post set for a time has Don't post and Change time where it stands (Campaigns › Content), and one
 * that went up is taken down there.
 */
export const publishSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "put a post up",
  gate: "settings",
  commit: ({ payload }) => publishCallsOf(postPublishOf(payload)),
  receipt: ({ payload }) => {
    const p = postPublishOf(payload);
    const says = PUBLISH_WORDS[p.language];
    const moved = p.moves.length > 0 && p.when_said ? says.moved(movedWhere(p), p.when_said) : null;
    if (p.places.length === 0 && moved) return moved;
    const put = p.when_said ? says.set(whereSaid(p), p.when_said) : says.sent(whereSaid(p));
    return moved ? `${put} ${moved}` : put;
  },
  open: ({ payload }) => `${CONTENT_ROUTE}:${asText(rec(payload).file_id)}`,
};
