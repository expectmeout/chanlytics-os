/**
 * A made post put up at its places by Ask, now or at a time (Ruben, 12 Nov 2026: no preset times written into the page; a time
 * is the owner's, picked in Post it's Schedule or said to Ask). The owner says "post it Saturday at ten"; Ask answers with a
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
  places: PostPlace[];
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

/** A card's payload, read back. */
export function postPublishOf(payload: Record<string, unknown>): PostPublish {
  const places = Array.isArray(payload.places) ? payload.places.filter((p) => isOneOf(POST_PLACES, p)) : [];
  return {
    file_id: asText(payload.file_id),
    places: POST_PLACES.filter((p) => places.includes(p)),
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
  },
  es: {
    title: (name: string) => `Publicar ${name}`,
    summary: (where: string, when: string | null) => (when ? `En ${where}, ${when}.` : `En ${where}, ahora.`),
    sent: (where: string) => `En camino a ${where}.`,
    set: (where: string, when: string) => `Programado para ${when} en ${where}.`,
  },
} as const;

/** The card's head and its one line, as Ask's tool makes them. */
export function publishCardWords(p: PostPublish, name: string): { title: string; summary: string } {
  const says = PUBLISH_WORDS[p.language];
  return { title: says.title(name), summary: says.summary(whereSaid(p), p.when_said) };
}

/** The press's calls: the caption kept first where it is new, then each place's own door, now or at its time. */
function publishCallsOf(p: PostPublish): ProposalCall[] {
  const id = { id: p.file_id };
  const when = p.when ? { when: p.when } : {};
  const calls: ProposalCall[] = [];
  if (p.caption_new) calls.push({ route: "PATCH files/[id]", params: id, body: { caption: p.caption } });
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
 * No Undo of its own: a post set for a time has Don't post where it stands (Campaigns › Content), and one that went up is
 * taken down there.
 */
export const publishSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "put a post up",
  gate: "settings",
  commit: ({ payload }) => publishCallsOf(postPublishOf(payload)),
  receipt: ({ payload }) => {
    const p = postPublishOf(payload);
    const says = PUBLISH_WORDS[p.language];
    return p.when_said ? says.set(whereSaid(p), p.when_said) : says.sent(whereSaid(p));
  },
  open: ({ payload }) => `${CONTENT_ROUTE}:${asText(rec(payload).file_id)}`,
};
