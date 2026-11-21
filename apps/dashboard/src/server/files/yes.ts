/**
 * A yes for one use of a file, given and taken back (00665; the content PRD's step L4 and section 8). An owner says it to
 * AI, in a conversation or on the file's own line to AI: AI's act keeps it (ask/tools/act/files/yes.ts), and its card's
 * press and Undo come here through their routes. Both doors ask the settings permission themselves, on the member's own
 * session, and restate the file's yeses in the same transaction, so every page and AI read the change with the row. A
 * door's refusal (not theirs to change, a file gone) is a DbFailure the route, or AI's act, words as the door said it.
 *
 * Taking a yes back holds every post of the file, and of every piece drawn from it, that is still waiting, in that same
 * transaction, and answers every one already up or on its way, for the owner to take down where it is. Every ad made
 * here that shows the person is paused in the same act, or cancelled while it is set up, as a remediation, and the owner
 * told (the Ads plan's G16; 00676): it runs again only with another picture. The answer says each, and what came of it.
 */
import "server-only";
import {
  AppError,
  fileUseOf,
  type FileYesFacts,
  type FileYesTakenBack,
  type FileYesUse,
  type TenantId,
} from "@chanlytics/contracts";
import { recordFileYes, takeBackFileYes, type FileYesKept } from "@chanlytics/db/files";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";

/** What a post held by a take-back says where it waits (posts.held_reason): what happened, and nothing to look up. */
const YES_TAKEN_BACK_HELD = "Someone in it took back their yes. Make it again from another photo.";

/** A yes said to AI for a file: who said it, for which uses, in which conversation. */
export async function recordYes(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  input: { fileId: string; uses: readonly FileYesUse[]; who: string; threadId: string | null },
): Promise<FileYesKept> {
  return recordFileYes(ctx.supabase, { tenantId, ...input });
}

/** A yes taken back, for the uses named or every use: what was held, and what is up or on its way. */
export async function takeBackYes(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  input: { fileId: string; uses: readonly FileYesUse[] | null },
): Promise<FileYesTakenBack> {
  return takeBackFileYes(ctx.supabase, { tenantId, ...input, held: YES_TAKEN_BACK_HELD });
}

/** Who a yes from a card's press names: the card said only that the people shown agreed. */
const PEOPLE_IN_IT = "The people in it";

/** A card made before a yes was taken back gives none back: the owner says it to AI again. */
const CARD_AFTER_TAKE_BACK = "Someone in it took back their yes to posts. Tell AI if they say yes again.";

/**
 * The owner's word on a card (propose_post's and propose_piece's `people_agreed`: they told AI in the conversation that
 * the people shown agreed), kept at the card's press as a yes for posts on each file that needs one, before anything is
 * made from it. One whose yes for posts was taken back refuses the press: a card made before that never gives it back.
 */
export async function keepCardYes(
  ctx: RouteContext,
  member: Member,
  files: readonly (FileYesFacts & { id: string })[],
): Promise<void> {
  const stands = files.map((file) => ({ file, at: fileUseOf("post", file) }));
  if (stands.some(({ at }) => at.is === "taken_back")) throw new AppError("validation", CARD_AFTER_TAKE_BACK);
  for (const { file } of stands.filter(({ at }) => at.is === "ask"))
    await recordYes(ctx, member.tenantId, { fileId: file.id, uses: ["post"], who: PEOPLE_IN_IT, threadId: null });
}
