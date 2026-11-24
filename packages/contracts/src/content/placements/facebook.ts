/**
 * Facebook as a place (the content loop PRD's pass 5): a business's Page, reached through the Meta link (call 10: one owner
 * per account, so the Page rides the same sign-in as its Instagram account). What the link must hold to post there, the Page
 * it keeps, whether a workspace has the place switched on (PRD 16.3, `features.places.<place>`, the canary first), and the
 * place's own sentences. Read against Meta's Pages guide on 23 November 2026; nothing here has been seen on a real Page.
 */
import { recordOrNull } from "../../shared/unknown";
import { ON_INSTAGRAM, type InstagramPostable, type PostPlace } from "../posts";

/**
 * What posting to a Page asks of the link's token (Meta's Pages guide): the post itself, reading the Page it posts as, and the
 * list of Pages, which the other two lean on. A story with a business's own sign-in asks `business_management` too, which
 * is read where a story is sent, not here: a picture and a reel go without it.
 */
export const PAGE_POSTING_PERMISSIONS = ["pages_manage_posts", "pages_read_engagement", "pages_show_list"] as const;

/** A Page the link keeps on its row (`tenant_channels.config.page`): its id, and its name for the row and the sheet. */
export interface MetaPage {
  id: string;
  name: string | null;
}

/** The Page a link's row keeps; null where it keeps none (a sign-in that shared no Page, or one made before pass 5). */
export function metaPageOf(config: unknown): MetaPage | null {
  const page = recordOrNull(recordOrNull(config)?.page);
  const id = typeof page?.id === "string" && /^\d{5,32}$/.test(page.id) ? page.id : null;
  if (!id) return null;
  return { id, name: typeof page?.name === "string" && page.name.trim() ? page.name.trim() : null };
}

/** Whether a workspace has a place switched on (`features.places.<place>`), as it turns on per workspace, the canary first. */
export function placeSwitchedOn(config: unknown, place: PostPlace): boolean {
  const places = recordOrNull(recordOrNull(recordOrNull(config)?.features)?.places);
  return places?.[place] === true;
}

/**
 * Whether the link's row can post to a Page now: connected, Meta still accepting it, a Page kept, and the token carrying
 * every permission posting there asks. A row the daily check found lapsed is not connected, as for Instagram.
 */
export function pagePostableOf(row: { config: unknown } | null): InstagramPostable {
  if (!row) return "not_connected";
  const config = recordOrNull(row.config);
  if (config?.token_lapsed_at) return "not_connected";
  const scopes = Array.isArray(config?.scopes) ? config.scopes : [];
  const held = PAGE_POSTING_PERMISSIONS.every((p) => scopes.includes(p));
  return held && metaPageOf(config) ? "yes" : "line_off";
}

/** Facebook's own sentences: the press's, the hold's at the send, a refusal's, and a take-down left to the owner. */
export const ON_FACEBOOK = {
  notConnected: "Connect Meta in Settings, under Connections, to post to your Facebook Page.",
  lineOff: "Facebook did not allow posting to a Page. Connect Meta again and choose your Page.",
  /** A made video sent as a picture or a story, or a picture as a reel: each file goes the one way it can. */
  wrongKind: "A video goes on Facebook as a reel, and a picture as a post or a story.",
  notSent: ON_INSTAGRAM.notSent,
  /** Why the recheck right before the send stopped it, where the place itself is the reason (00611 held_reason). */
  held: {
    disconnected: "Facebook is no longer connected. Connect Meta again, then post it again.",
    lineOff: "Facebook no longer allows posting to your Page. Connect Meta again and choose your Page.",
  },
  /** Taking a post down, where the Page itself must be the way (the remediation's needs_person, not_possible). */
  takeDown: {
    byHand: "Facebook didn't let Chanlytics take it down. Delete it on your Facebook Page.",
    noId: "Chanlytics has no record of where this is on Facebook. Delete it on your Facebook Page.",
  },
  /** What a refusal says, by what Facebook answered: the sheet's line and the bell's. */
  refused: {
    picture: "Facebook couldn't take this picture. Make a new version and post that.",
    video: "Facebook couldn't take this video. Make a new version and post that.",
    token: "Facebook no longer accepts the connection. Connect Meta again, then post it again.",
    permission: "Facebook didn't let Chanlytics post to this Page. Connect Meta again and choose your Page.",
    busy: "Facebook is busy right now. Post it again in a few minutes.",
    other: "Facebook did not take the post.",
    unknown: "Facebook did not say whether this went up. Look at the Page before posting it again.",
  },
} as const;

/** Which of Facebook's refusal sentences a refusal is. */
export type FacebookRefusal = keyof typeof ON_FACEBOOK.refused;
