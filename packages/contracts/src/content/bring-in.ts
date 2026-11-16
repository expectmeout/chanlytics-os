/**
 * A link to a business's photos and videos, brought in (Content's empty state, 14 Nov 2026): what a pasted link is, in code
 * (its website, its Instagram, or a place nothing here can read, and why), and Ask's card that brings it in, which the owner
 * presses. What is brought waits in the Library for their Keep, as everything found does. Pure.
 */
import { asText, type ProposalSpecAboveOperator } from "../ask/proposals/spec";
import { CONTENT_LIBRARY_ROUTE } from "./address";
import { siteHostOf } from "./sources";

/** What a link is: a website to read, an Instagram account, or one nothing here brings in. */
export type BringIn =
  { place: "website"; url: string } | { place: "instagram"; handle: string } | { place: "none"; why: BringInRefusal };

export type BringInRefusal = "player" | "drive" | "post" | "social" | "not_a_link";

/** An Instagram handle as Instagram writes one. */
const HANDLE = /^[a-z0-9._]{1,30}$/i;

/** Instagram's own pages, never an account: a post, a reel, a story, its menus. */
const NOT_AN_ACCOUNT = new Set(["p", "reel", "reels", "stories", "explore", "accounts", "direct", "tv"]);

/** Hosts whose videos play from a player page Stream cannot fetch. */
const PLAYERS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/;
/** Google's places for a folder of photos, which need Drive's own access. */
const DRIVES = /(^|\.)(drive\.google\.com|docs\.google\.com|photos\.google\.com|photos\.app\.goo\.gl)$/;
/** Other social places, not brought in yet. */
const SOCIALS = /(^|\.)(facebook\.com|fb\.com|tiktok\.com|x\.com|twitter\.com|threads\.net|pinterest\.com)$/;

/** A link as an address, with https put in front where the owner left it off; null for words that are no address. */
function linkAddressOf(raw: string): URL | null {
  const text = raw.trim().replace(/[)>.,;]+$/, "");
  if (!text || /\s/.test(text)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.hostname.includes(".") ? url : null;
  } catch {
    // Not an address.
    return null;
  }
}

/** What a pasted link is. An "@name" alone is an Instagram account. */
export function bringInOf(raw: string): BringIn {
  const at = /^@([a-z0-9._]{1,30})$/i.exec(raw.trim());
  if (at?.[1]) return { place: "instagram", handle: at[1].toLowerCase() };
  const url = linkAddressOf(raw);
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) return { place: "none", why: "not_a_link" };
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    const first = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (!first || NOT_AN_ACCOUNT.has(first.toLowerCase())) return { place: "none", why: "post" };
    return HANDLE.test(first)
      ? { place: "instagram", handle: first.toLowerCase() }
      : { place: "none", why: "not_a_link" };
  }
  if (PLAYERS.test(host)) return { place: "none", why: "player" };
  if (DRIVES.test(host)) return { place: "none", why: "drive" };
  if (SOCIALS.test(host)) return { place: "none", why: "social" };
  return { place: "website", url: `${url.protocol}//${url.host}${url.pathname === "/" ? "/" : url.pathname}` };
}

export const BRING_IN_WORDS = {
  title: (b: Exclude<BringIn, { place: "none" }>) =>
    b.place === "website" ? `Bring in what ${siteHostOf(b.url)} shows` : `Bring in @${b.handle}'s posts and reels`,
  summary: (b: Exclude<BringIn, { place: "none" }>, videos: boolean) =>
    b.place === "website"
      ? `AI reads ${siteHostOf(b.url)} for its photos${videos ? " and videos" : ""}. They wait in the Library for your approval.`
      : `AI brings in the newest posts${videos ? " and reels" : ""} of @${b.handle}. Only your own account: they wait in the Library for your approval.`,
  receipt: "AI is bringing them in. They wait in the Library for your approval.",
  /** Why a link is not brought in, for Ask to say in its own words. */
  refused: {
    player:
      "A YouTube or Vimeo video can't be brought in from its link. The owner can add the video file from their phone.",
    drive: "AI can't read a Google Drive or Google Photos folder yet. The owner can add those photos from their phone.",
    post: "That is one post, not an account. Ask for the account's own link, like instagram.com/theirname.",
    social: "Only a website or an Instagram account can be brought in so far, not that page.",
    not_a_link: "That isn't a link to a website or an Instagram account.",
  } satisfies Record<BringInRefusal, string>,
} as const;

/**
 * The card: one press brings in what the link holds. Whoever may keep what is found (the Library's Keep, POST files/keep) may
 * press it, since a read of an Instagram is paid for; the route reads the link again, so a card changed by hand is read as it
 * stands.
 */
export const bringInSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "bring in photos and videos from a link",
  gate: "settings",
  commit: ({ payload }) => ({ route: "POST content/bring-in", body: { link: asText(payload.link) } }),
  receipt: () => BRING_IN_WORDS.receipt,
  open: () => CONTENT_LIBRARY_ROUTE,
};
