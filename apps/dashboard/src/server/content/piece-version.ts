/**
 * A made video's versions, pressed (00708; the version board, approved 23 Nov 2026 with its calls 14 and 15):
 *
 *   approve  "Approve version 2" on the piece's own file, or "Post this one instead" on an older version's file: that file
 *            approved for every placement of the piece still waiting, at its time and with its words, the waiting
 *            posts let go in the same step (posts/approve.ts, `replace`). The checks a press is held to all run.
 *   again    "Try again" where a new version could not be made: the same card's plan drawn once more, in the look as
 *            it now stands (piece_begin tries a failed card anew).
 */
import "server-only";
import { z } from "zod";
import {
  AppError,
  PIECE_TEMPLATE,
  isOneOf,
  POST_KINDS,
  POST_PLACES,
  piecePlanOf,
  recordOrEmpty,
  type PostPlace,
} from "@chanlytics/contracts";
import {
  beginPieceVersion,
  findPieceOfVideo,
  findVersionDrawing,
  listPiecePosts,
  type FileMemberRow,
  type VideoPieceRow,
} from "@chanlytics/db/files";
import { asJson } from "@chanlytics/db/shared";
import { readInstagramPostable } from "@/server/connections/meta";
import { checkPieceClips } from "./piece";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";
import { getStoredConfig } from "@/server/workspace/config-row";
import { approvePlacements } from "../posts/approve";
import { readFacebookPostable } from "../posts/facebook";

export const versionInput = z.strictObject({ to: z.enum(["approve", "again"]) });

/** The piece's words for what stands in the way, said where a press is refused. */
const VERSION_REFUSED = {
  notAVersion: "This isn't one of a made video's versions.",
  nothingWaits: "Nothing of this video waits to go up.",
  notFailed: "Nothing to try again: its newest version was made.",
  making: "Its new version is being made now. It asks you once it's ready.",
} as const;

/** The posts of a piece still set to go: what a version's approval sets in their place. */
const STILL_SET_TO_GO = ["queued", "preparing", "held"] as const;

/** POST files/[id]/version: approve this version for every place the piece was set for, or draw a new one again. */
export async function pressVersion(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  input: z.infer<typeof versionInput>,
): Promise<{ fate: string }> {
  if (row.source !== "made" || row.kind !== "video") throw new AppError("validation", VERSION_REFUSED.notAVersion);
  const piece = await findPieceOfVideo(ctx.supabase, member.tenantId, row.id);
  if (!piece) throw new AppError("validation", VERSION_REFUSED.notAVersion);
  return input.to === "again" ? drawAgain(ctx, member, piece.id) : approveVersion(ctx, member, row, piece);
}

async function approveVersion(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  piece: VideoPieceRow,
): Promise<{ fate: string }> {
  const posts = await listPiecePosts(ctx.supabase, member.tenantId, { id: piece.id, fileId: piece.file_id ?? row.id });
  const waiting = posts.filter((p) => isOneOf(STILL_SET_TO_GO, p.status) && p.place !== "hand");
  if (waiting.length === 0) throw new AppError("validation", VERSION_REFUSED.nothingWaits);
  const [instagram, facebook] = await Promise.all([
    readInstagramPostable(member.tenantId),
    readFacebookPostable(member.tenantId),
  ]);
  const connections: Partial<Record<PostPlace, NonNullable<typeof instagram>>> = {};
  if (instagram) connections.instagram = instagram;
  if (facebook) connections.facebook = facebook;
  const now = Date.now();
  await approvePlacements(ctx, member, row, {
    placements: waiting.flatMap((p) =>
      isOneOf(POST_PLACES, p.place) && isOneOf(POST_KINDS, p.kind)
        ? [
            {
              place: p.place,
              kind: p.kind,
              caption: p.kind === "story" ? null : p.caption,
              // Its time where that is still to come; one whose time passed while it waited goes now.
              when: Date.parse(p.scheduled_for) > now ? p.scheduled_for : null,
            },
          ]
        : [],
    ),
    // The reason the piece was made for goes on with every version: its day or offer still dates each post, is asked
    // again at the press and at the send, and a version is never a way past a reason that has ended.
    intent: piece.intent,
    facts: [],
    via: "press",
    connections,
    // The posts the owner saw still waiting: held still while they are swapped, and one that began to go up since is
    // no longer what they approved (00713).
    replace: { expected: waiting.map((p) => p.id) },
  });
  return { fate: "approved" };
}

async function drawAgain(ctx: RouteContext, member: Member, pieceId: string): Promise<{ fate: string }> {
  const drawing = await findVersionDrawing(ctx.supabase, member.tenantId, pieceId);
  if (!drawing) throw new AppError("validation", VERSION_REFUSED.notFailed);
  if (!drawing.failed) throw new AppError("validation", VERSION_REFUSED.making);
  const plan = recordOrEmpty(drawing.plan);
  const config = await getStoredConfig(ctx.supabase, member.tenantId);
  const checked = await checkPieceClips(ctx, member.tenantId, piecePlanOf(plan), config);
  if (!checked.ok) throw new AppError("validation", VERSION_REFUSED.notFailed);
  const begun = await beginPieceVersion(ctx.supabase, {
    tenantId: member.tenantId,
    pieceId,
    plan: drawing.plan,
    look: asJson(checked.look),
    key: drawing.card_key,
    edition: PIECE_TEMPLATE.edition,
  });
  return { fate: begun.fate };
}
