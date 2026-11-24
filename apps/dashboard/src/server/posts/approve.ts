/**
 * The owner's approval of a made post or video for its placements (the content loop PRD's 3, 5.3 and 6.2, pass 1b): the
 * press that is the approval, on the member's own session. Before anything is written, the checks a press is held to
 * (posts/checks.ts): the place takes it, AI is not paused, its reason stands. No yes is read. Then the
 * words that go are held to what the piece takes (posts/caption.ts), and the exact thing approved is read: each shape a
 * placement sends, by its path in the file's folder and the full SHA-256 of its bytes, so the edge sends those bytes or none
 * (00681 post_as_approved), and each shape measured from those same bytes against what its place takes (pass 4: its size,
 * length, codec and sound; contracts content/making/renditions.ts), before anything is kept. One door writes it all, in one
 * transaction (00713 post_approve_whole): the facts the owner stated, the piece's words, and the approval; a door that refuses
 * keeps none of it. An owner's own words are never judged by a guess: what they type and press is theirs.
 */
import "server-only";
import { createHash } from "node:crypto";
import {
  AppError,
  CONTENT_CHECK_WORDS,
  ON_INSTAGRAM,
  PLACE_CAPABILITIES,
  fileMadePathOf,
  goodUntilOf,
  postPathOf,
  renditionRefusalOf,
  renditionShapeOf,
  type InstagramPostable,
  type OwnersFact,
  type PieceApprovalSnapshot,
  type PieceIntent,
  type PostPlace,
  type RenditionShape,
  type SnapshotRendition,
  type TenantId,
} from "@chanlytics/contracts";
import { measureMedia } from "@chanlytics/channels/files";
import { approvePostsWhole, type FileMemberRow, type PostsApproved } from "@chanlytics/db/files";
import { isSendingStopped } from "@chanlytics/db/workspace";
import { jsonCopyOf } from "@chanlytics/db/shared";
import { logAndGoOn } from "@chanlytics/log";
import { log } from "@/server/shared/log";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";
import { getStoredConfig } from "@/server/workspace/config-row";
import { bucket } from "../files/file";
import { keepMadeWords, readWordsToKeep } from "./caption";
import { readPlacementRefusals, type PlacementAsked } from "./checks";
import { googlePicturePathOf } from "./make";

/** What a press approves: its placements, what its words are about, any fact the owner stated, and who pressed. */
interface ApprovalAsked {
  placements: PlacementAsked[];
  intent: PieceIntent | null;
  facts: OwnersFact[];
  via: "press" | "card";
  /** Whether each place's connection takes a post now (the caller read it). */
  connections: Readonly<Partial<Record<PostPlace, InstagramPostable>>>;
  /**
   * The piece's posts still waiting are let go in the same step, these set in their place (00708 piece_posts_replace):
   * "Approve version 2" and "Post this one instead", with the posts still waiting the owner saw, held still while they are
   * swapped (00713). Absent for a press that adds a place.
   */
  replace?: { expected: readonly string[] };
}

/** Where a shape of this made file is kept: a picture's shapes beside its original, a video's own file. */
function shapePathOf(tenantId: TenantId, row: FileMemberRow, shape: RenditionShape): string {
  if (shape === "google") return googlePicturePathOf(tenantId, row.id);
  if (row.kind === "video") return fileMadePathOf(tenantId, row.id, "video");
  return postPathOf(tenantId, row.id, shape === "9x16" ? "story" : shape === "1x1" ? "square" : "portrait");
}

/** Each shape the placements send, read now: its path and the full SHA-256 of its bytes. */
async function readShapes(tenantId: TenantId, row: FileMemberRow, shapes: readonly RenditionShape[]) {
  return Promise.all(
    // At most four shapes, one a placement (contracts RENDITION_SHAPES).
    [...new Set(shapes)].map(async (shape) => {
      const path = shapePathOf(tenantId, row, shape);
      const read = await bucket().download(path);
      if (read.error) {
        log.error("post_approve_shape_unread", { tenant_id: tenantId, shape, error: read.error.message });
        throw new AppError("unavailable", ON_INSTAGRAM.notSent);
      }
      const bytes = Buffer.from(await read.data.arrayBuffer());
      return {
        shape,
        path,
        checksum: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.length,
        measured: measureMedia(bytes),
      };
    }),
  );
}

/** Each fact the owner stated, as their claim until its day ends (owner_claims, 00706): kept by the approval's own door. */
const claimsOf = (facts: readonly OwnersFact[]) =>
  facts.map((fact) => ({ kind: "fact" as const, text: fact.says, source: "said" as const, valid_until: fact.until }));

/** A door's answer that approved nothing, in the owner's words. */
function refusedFate(answer: PostsApproved): AppError {
  if (answer.fate === "busy") return new AppError("conflict", ON_INSTAGRAM.busy, 409);
  if (answer.fate === "gone") return new AppError("not_found", ON_INSTAGRAM.gone, 404);
  if (answer.fate === "not_a_post") return new AppError("validation", ON_INSTAGRAM.notAPost);
  if (answer.fate === "wrong_kind") return new AppError("validation", ON_INSTAGRAM.wrongKind);
  if (answer.fate === "changed") return new AppError("conflict", ON_INSTAGRAM.held.changed, 409);
  return new AppError("validation", CONTENT_CHECK_WORDS.afterItsDay);
}

/** The words a placement goes with: none for a story, else what was written, trimmed. */
const placementWordsOf = (p: PlacementAsked): string | null => (p.kind === "story" ? null : p.caption?.trim() || null);

/**
 * The approval: the checks, the words kept, the shapes' bytes read and summed, then the one door. Answers what the door
 * wrote, or throws the owner's words for what stands in the way; nothing is kept or written for a press that is refused.
 */
export async function approvePlacements(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  approval: ApprovalAsked,
): Promise<PostsApproved> {
  const zone = member.facts?.timezone ?? "UTC";
  const refused = await readPlacementRefusals(ctx.supabase, {
    tenantId: member.tenantId,
    zone,
    file: row,
    placements: approval.placements,
    intent: approval.intent,
    facts: approval.facts,
    connections: approval.connections,
    stopped: await isSendingStopped(ctx.supabase, member.tenantId),
    config: () => getStoredConfig(ctx.supabase, member.tenantId),
  });
  if (refused) throw new AppError("validation", refused);
  // The exact bytes each placement sends, read and summed, and each held to what its place takes: a shape a place would
  // refuse is said now, in that place's words, before anything is kept.
  const shapes = await readShapes(
    member.tenantId,
    row,
    approval.placements.map((p) => renditionShapeOf(p.place, p.kind)),
  );
  for (const p of approval.placements) {
    const shape = shapes.find((s) => s.shape === renditionShapeOf(p.place, p.kind));
    const refusal = shape ? renditionRefusalOf(p.place, p.kind, shape.measured) : null;
    if (refusal) throw new AppError("validation", refusal.words);
  }
  // The words that go are the piece's own from now on, held now to what it takes (posts/caption.ts readWordsToKeep) and
  // kept by the door with the approval.
  const said = approval.placements.map(placementWordsOf).find((w) => w !== null);
  const words = said ? await readWordsToKeep(ctx, member, row, said) : null;
  const goodUntil = goodUntilOf(approval.intent, zone);
  const now = new Date().toISOString();
  const renditions: SnapshotRendition[] = shapes.map(({ shape, path, checksum }) => ({
    shape,
    file_id: row.id,
    path,
    checksum,
  }));
  const snapshot: Omit<PieceApprovalSnapshot, "revision"> & { revision: null } = {
    revision: null,
    renditions,
    placements: approval.placements.map((p) => ({
      place: p.place,
      kind: p.kind,
      at: p.when ?? now,
      caption: placementWordsOf(p),
    })),
    uses: ["post"],
    spend: null,
    facts: [],
  };
  const answer = await approvePostsWhole(ctx.supabase, {
    tenantId: member.tenantId,
    fileId: row.id,
    approval: jsonCopyOf({
      snapshot,
      intent: approval.intent,
      renditions: shapes.map(({ shape, path, checksum, bytes }) => ({ shape, path, checksum, bytes })),
      placements: approval.placements.map((p) => ({
        place: p.place,
        kind: p.kind,
        at: p.when,
        caption: placementWordsOf(p),
        good_until: goodUntil,
        capability_edition: PLACE_CAPABILITIES[p.place].edition,
      })),
      via: approval.via,
      // A fact the owner stated is kept as their own claim (owner_claims, 00706; PRD 6.1), valid until its day ends: the
      // send's check reads it there, and an approval no longer carries it.
      claims: claimsOf(approval.facts),
      ...(words === null ? {} : { words }),
      ...(approval.replace ? { replace: true, expected: approval.replace.expected } : {}),
    }),
  });
  if (answer.fate !== "approved") throw refusedFate(answer);
  // How it was made says the same words from now on (Details, AI's card), the service role's to write. The approval and the
  // piece's words are kept already, so one that could not be written is logged and the press stands.
  if (words !== null)
    await keepMadeWords(member, row, words).catch(logAndGoOn("a post's words kept on how it was made", false));
  return answer;
}
