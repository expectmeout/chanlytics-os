/**
 * A link to a business's photos and videos, brought in (Content's empty state, 14 Nov 2026): what a pasted link is, in code
 * (its website, its Instagram, or a place nothing here can read, and why), and Ask's card that brings it in, which the owner
 * presses. What is brought waits in the Library for their Keep, as everything found does. Pure.
 *
 * A Google Drive folder is a place too (the footage sources plan, P5): its link, or the words "Google Drive" where the
 * owner says their photos are there and has no link to hand. It is not read once but watched, and what lands in it is
 * the business's own, so it goes straight into the Library: its card is the folder's own steps (connect, choose, watch),
 * and its last press watches the folder. Google Photos, which no app can watch, and a link to one file each say so.
 */
import { asText, type ProposalSpecAboveOperator } from "../ask/proposals/spec";
import { FOOTAGE_SAID } from "../files/footage-said";
import { agoWords, waitedLabel } from "../shared/time";
import { recordOrEmpty } from "../shared/unknown";
import { groupedPlural } from "../shared/words";
import { CONTENT_LIBRARY_ROUTE } from "./address";
import { siteHostOf } from "./sources";

/**
 * What a link is: a website to read, an Instagram account, a Google Drive folder to watch (`folderId` null where the
 * owner named Drive and no folder yet), or one nothing here brings in.
 */
export type BringIn =
  | { place: "website"; url: string }
  | { place: "instagram"; handle: string }
  | { place: "drive"; folderId: string | null }
  | { place: "none"; why: BringInRefusal };

/** A place that is read once: what its card's own words name. */
type BringInRead = Extract<BringIn, { place: "website" | "instagram" }>;

export type BringInRefusal = "player" | "photos" | "drive_file" | "post" | "social" | "not_a_link";

/** An Instagram handle as Instagram writes one. */
const HANDLE = /^[a-z0-9._]{1,30}$/i;

/** Instagram's own pages, never an account: a post, a reel, a story, its menus. */
const NOT_AN_ACCOUNT = new Set(["p", "reel", "reels", "stories", "explore", "accounts", "direct", "tv"]);

/** Hosts whose videos play from a player page Stream cannot fetch. */
const PLAYERS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/;
/** Google Drive's own pages, and Google's documents, which are single files. */
const DRIVES = /(^|\.)(drive\.google\.com|docs\.google\.com)$/;
/** Google Photos: no app can watch a library or an album there. */
const PHOTOS = /(^|\.)(photos\.google\.com|photos\.app\.goo\.gl)$/;
/** A Drive folder's id, as Drive writes one. */
const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;
/** The words an owner's place is named by where they gave no link: "Google Drive", "my Drive", "a Drive folder". */
const DRIVE_NAMED = /^(my |our |a |the )?(google )?drive( folder)?$/i;
/** Drive's own front pages, which name no folder. */
const DRIVE_FRONT = /^(drive(\/u\/\d+)?(\/(my-drive|home))?)?$/;

/**
 * A Google Drive address as a folder to watch. A folder's own link holds its id; Drive's front page names no folder,
 * so the owner chooses one; anything else there is one file.
 */
function driveOf(url: URL): BringIn {
  const parts = url.pathname.split("/").filter(Boolean);
  const drive = url.hostname.toLowerCase().replace(/^www\./, "") === "drive.google.com";
  const id = parts[parts.indexOf("folders") + 1] ?? "";
  if (drive && parts.includes("folders") && DRIVE_ID.test(id)) return { place: "drive", folderId: id };
  if (drive && DRIVE_FRONT.test(parts.join("/"))) return { place: "drive", folderId: null };
  return { place: "none", why: "drive_file" };
}
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
  if (DRIVE_NAMED.test(raw.trim())) return { place: "drive", folderId: null };
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
  if (PHOTOS.test(host)) return { place: "none", why: "photos" };
  if (DRIVES.test(host)) return driveOf(url);
  if (SOCIALS.test(host)) return { place: "none", why: "social" };
  return { place: "website", url: `${url.protocol}//${url.host}${url.pathname === "/" ? "/" : url.pathname}` };
}

export const BRING_IN_WORDS = {
  /** A Google Drive folder, watched: the card's line wherever a card is said in one line (its own steps say the rest). */
  drive: {
    title: (folder: string | null) => (folder ? FOOTAGE_SAID.watchTitle(folder) : "Watch a Google Drive folder"),
    summary: "New photos and videos come in from the folder by themselves, and go straight into the Library.",
    /** Its older files, asked for (call 7): the card's title and line. */
    olderTitle: FOOTAGE_SAID.older.title,
    olderSummary: FOOTAGE_SAID.older.summary,
  },
  title: (b: BringInRead) =>
    b.place === "website" ? `Bring in what ${siteHostOf(b.url)} shows` : `Bring in @${b.handle}'s posts and reels`,
  summary: (b: BringInRead, videos: boolean) =>
    b.place === "website"
      ? `AI reads ${siteHostOf(b.url)} for its photos${videos ? " and videos" : ""}. They wait in the Library for your approval.`
      : `AI brings in the newest posts${videos ? " and reels" : ""} of @${b.handle}. Only your own account: they wait in the Library for your approval.`,
  receipt: "AI is bringing them in. They wait in the Library for your approval.",
  /** The account was read inside the day, so it is not read again: how long ago, and what that read brought in. */
  readLately: (ago: string, photos: number, videos: number) => {
    const brought = [photos ? groupedPlural(photos, "photo") : null, videos ? groupedPlural(videos, "video") : null]
      .filter(Boolean)
      .join(" and ");
    return `AI read this account ${ago} and ${brought ? `brought in ${brought}` : "found nothing new"}. It reads an account once a day.`;
  },
  /** The account's read, asked for inside the day, is still on its way. */
  stillReading: "AI is already reading this account. What it finds waits in the Library for your approval.",
  /** The workspace's reads of the day are used: how long until the next may be asked for. */
  readsUsed: (wait: string) =>
    `AI has read Instagram as often as it can for you today. Paste the link again in ${wait}.`,
  /** Every workspace's reads of the day are used: nothing the owner can change but to come back. */
  readsPaused: "AI can't read Instagram right now. Paste the link again tomorrow.",
  /** Why a link is not brought in, for Ask to say in its own words. */
  refused: {
    player:
      "A YouTube or Vimeo video can't be brought in from its link. The owner can add the video file from their phone.",
    photos: "Google Photos can't be watched from here. The owner can add those photos and videos from their phone.",
    drive_file:
      "That link is one file, not a folder. Ask for the folder it sits in, or the owner can add the video from their phone.",
    post: "That is one post, not an account. Ask for the account's own link, like instagram.com/theirname.",
    social: "Only a website or an Instagram account can be brought in so far, not that page.",
    not_a_link: "That isn't a link to a website or an Instagram account.",
  } satisfies Record<BringInRefusal, string>,
} as const;

/**
 * What the card says once pressed, from the route's answer (the dashboard's server content/bring-in.ts): a read began
 * (`fate` website or instagram); the account was read inside the day (`read_lately`, with `read_ms_ago`, whether that
 * read is still on its way as `reading`, and the `photos` and `videos` it brought); or a day's reads are used
 * (`wait`, with which budget `binds` and `wait_ms` until the next may be asked for). Never as a failure.
 */
function bringInReceiptOf(data: unknown): string {
  const answer = recordOrEmpty(data);
  const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  if (answer.fate === "read_lately")
    return answer.reading === true
      ? BRING_IN_WORDS.stillReading
      : BRING_IN_WORDS.readLately(agoWords(0, count(answer.read_ms_ago)), count(answer.photos), count(answer.videos));
  if (answer.fate === "wait")
    return answer.binds === "workspace_reads"
      ? BRING_IN_WORDS.readsUsed(waitedLabel(count(answer.wait_ms)))
      : BRING_IN_WORDS.readsPaused;
  return BRING_IN_WORDS.receipt;
}

/**
 * The card: one press brings in what the link holds. Whoever may keep what is found (the Library's Keep, POST files/keep) may
 * press it, since a read of an Instagram is paid for; the route reads the link again, so a card changed by hand is read as it
 * stands.
 */
export const bringInSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "bring in photos and videos from a link",
  gate: "settings",
  // A Drive folder is watched, by the folder's own door: the card hands in what its steps settled (the folder, whether
  // the folders inside it count, and whether it takes another's place). Its older files (call 7) are asked for by theirs.
  commit: ({ payload }) => {
    if (payload.place === "drive_older") return { route: "POST sources/older", body: {} };
    return payload.place === "drive"
      ? {
          route: "POST sources/watch",
          body: {
            folder_id: asText(payload.folder_id),
            include_subfolders: payload.include_subfolders !== false,
            instead: payload.instead === true,
          },
        }
      : { route: "POST content/bring-in", body: { link: asText(payload.link) } };
  },
  receipt: (card, data) => {
    if (card.payload.place === "drive_older") {
      const files = recordOrEmpty(data).asked;
      return FOOTAGE_SAID.older.done(typeof files === "number" ? files : 0);
    }
    return card.payload.place === "drive"
      ? FOOTAGE_SAID.watching(asText(card.payload.folder_name))
      : bringInReceiptOf(data);
  },
  open: () => CONTENT_LIBRARY_ROUTE,
};
