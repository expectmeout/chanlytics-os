/**
 * A made post on its way to the business's Facebook Page (the content loop PRD's pass 5): a person's press, and only that,
 * which is the approval the placement records, as Instagram's (posts/instagram.ts). The press writes the post and its first
 * job through its door (00681 post_approve), and answers at once; the edge makes it ready on the Page, rechecks right
 * before the send, and sends it. Until the send, Don't post stops it.
 *
 * Offered only where the workspace has Facebook switched on (`features.places.facebook`, the canary first), the Meta link
 * is on for it, and the link keeps a Page it may post to (contracts pagePostableOf).
 */
import "server-only";
import {
  AppError,
  ON_FACEBOOK,
  intentOfAbout,
  pagePostableOf,
  placeSwitchedOn,
  type InstagramPostable,
  type InstagramPostKind,
  type OwnersFact,
  type PostAbout,
  type PostDto,
  type TenantId,
} from "@chanlytics/contracts";
import { findMetaInstagramRow } from "@chanlytics/db/channels";
import type { FileMemberRow, MemberPostRow } from "@chanlytics/db/files";
import { getTenantConfig } from "@chanlytics/db/workspace";
import { readMetaSwitch } from "@/server/connections/meta";
import { postDtoOf } from "@/server/readers/content";
import type { Member } from "@/server/shared/route";
import { serviceDb } from "@/server/shared/service-db";
import type { RouteContext } from "@/server/shared/with-route";
import { approvePlacements } from "./approve";

/**
 * Whether this workspace's Page takes a post now; null where Facebook is not offered here at all (the Meta link off, or
 * the place not switched on), so nothing is said of it.
 */
export async function readFacebookPostable(tenantId: TenantId): Promise<InstagramPostable | null> {
  if (!(await readMetaSwitch(tenantId))) return null;
  const workspace = await getTenantConfig(serviceDb(), tenantId);
  if (!placeSwitchedOn(workspace?.config, "facebook")) return null;
  return pagePostableOf(await findMetaInstagramRow(serviceDb(), tenantId));
}

/** A file's posts on Facebook, newest first, of the file's posts read under the member's session. */
export const facebookPostsOf = (rows: readonly MemberPostRow[]): PostDto[] =>
  rows.filter((r) => r.place === "facebook").map(postDtoOf);

/** What a press on Facebook carries: how it goes, its words, its time, and what AI's card said its words are about. */
interface FacebookPress {
  as: InstagramPostKind;
  caption?: string | undefined;
  when?: string | undefined;
  about?: PostAbout | undefined;
  facts?: OwnersFact[] | undefined;
}

/**
 * POST files/[id]/facebook: the post approved for the Page, a picture as a post or a story, a video as a reel, now or at a
 * time the person chose. The press is the approval: of these bytes, these words, this place (posts/approve.ts).
 */
export async function postFileToFacebook(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  input: FacebookPress,
): Promise<{ post_id: string; status: "queued" }> {
  if (row.source !== "made") throw new AppError("validation", ON_FACEBOOK.wrongKind);
  const postable = await readFacebookPostable(member.tenantId);
  if (postable === null || postable === "not_connected") throw new AppError("conflict", ON_FACEBOOK.notConnected, 409);
  if (postable === "line_off") throw new AppError("conflict", ON_FACEBOOK.lineOff, 409);
  // A story shows no caption, so none is kept for one.
  const caption = input.as === "story" ? null : input.caption?.trim() || null;
  const approved = await approvePlacements(ctx, member, row, {
    placements: [{ place: "facebook", kind: input.as, caption, when: input.when ?? null }],
    intent: intentOfAbout(input.about),
    facts: input.facts ?? [],
    via: "press",
    connections: { facebook: "yes" },
  });
  const postId = approved.posts[0]?.post_id;
  if (!postId) throw new AppError("not_found", ON_FACEBOOK.notSent, 404);
  return { post_id: postId, status: "queued" };
}
