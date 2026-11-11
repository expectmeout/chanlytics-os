/**
 * POST files/video/preview, for a member: a plan's stills as its card shows them, edge to edge with no caption (the card stands
 * each on its own). The plan is checked afresh, as the press checks it, so a card never shows stills of clips that are gone.
 */
import "server-only";
import type { z } from "zod";
import { piecePlanOf } from "@chanlytics/contracts";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";
import { checkPiecePlan, pieceBoardInput } from "./piece";
import { drawPieceBoard } from "./storyboard";

export { pieceBoardInput };

export async function drawPieceBoardFor(
  ctx: RouteContext,
  member: Member,
  plan: z.infer<typeof pieceBoardInput>,
): Promise<Response> {
  const checked = await checkPiecePlan(ctx, member, piecePlanOf(plan));
  const picture = await drawPieceBoard(ctx, member.tenantId, checked, true);
  return new Response(new Uint8Array(picture), {
    status: 200,
    headers: { "content-type": "image/jpeg", "cache-control": "private, no-store" },
  });
}
