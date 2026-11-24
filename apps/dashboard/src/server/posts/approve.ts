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
 *
 * AI's approval under the owner's rung (00714) has no member to sign it in: a week's placements are readied (prepareApproval:
 * every check, its drawn piece's words kept) and each is placed with its slot in one write, by the 8:00 approval's own door
 * for what was readied overnight and by plan_slot_place for what is made after (placeSlotAsAI). One post a slot, however often
 * its making is asked.
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
  type POST_VIAS,
} from "@chanlytics/contracts";
import { measureMedia } from "@chanlytics/channels/files";
import {
  approvePostsWhole,
  keepClaim,
  keepPieceWords,
  placeSlot,
  type ApproveFate,
  type FileMemberRow,
  type PostsApproved,
} from "@chanlytics/db/files";
import { isSendingStopped } from "@chanlytics/db/workspace";
import { jsonCopyOf } from "@chanlytics/db/shared";
import type { Json } from "@chanlytics/db/types";
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
  /** A person's press, their Approve on AI's card, or AI under the owner's rung (00714: the door takes rung from the service alone). */
  via: (typeof POST_VIAS)[number];
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
const factClaims = (facts: readonly OwnersFact[]) =>
  facts.map((fact) => ({ kind: "fact" as const, text: fact.says, source: "said" as const, valid_until: fact.until }));

/** A door's answer that approved nothing, in the owner's words. */
function refusedFate(fate: ApproveFate): AppError {
  if (fate === "busy") return new AppError("conflict", ON_INSTAGRAM.busy, 409);
  if (fate === "gone") return new AppError("not_found", ON_INSTAGRAM.gone, 404);
  if (fate === "not_a_post") return new AppError("validation", ON_INSTAGRAM.notAPost);
  if (fate === "wrong_kind") return new AppError("validation", ON_INSTAGRAM.wrongKind);
  if (fate === "changed") return new AppError("conflict", ON_INSTAGRAM.held.changed, 409);
  return new AppError("validation", CONTENT_CHECK_WORDS.afterItsDay);
}

/** The words a placement goes with: none for a story, else what was written, trimmed. */
const placementWordsOf = (p: PlacementAsked): string | null => (p.kind === "story" ? null : p.caption?.trim() || null);

/** What the approving door takes (post_approve's p_approval) and the words it changes, read and held before anything is kept. */
interface ApprovalRead {
  body: object;
  /** The piece's words from now on, where they change; null where they are its own already. */
  words: string | null;
}

/**
 * The approval read: the checks, the shapes' bytes read and summed, the words held to what the piece takes, and what the door
 * takes. Throws the owner's words for what stands in the way; nothing is kept.
 */
async function readApproval(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  approval: ApprovalAsked,
): Promise<ApprovalRead> {
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
  // The words that go are the piece's own from now on, held now to what it takes (posts/caption.ts readWordsToKeep): kept
  // by the owner's door with the approval, or as AI's is readied (prepareApproval).
  const placementWords = approval.placements.map(placementWordsOf).find((w) => w !== null);
  const words = placementWords ? await readWordsToKeep(ctx, member, row, placementWords) : null;
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
  const body = {
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
  };
  return { body, words };
}

/** How it was made says the same words from now on (Details, AI's card), the service role's to write: logged where it could not be. */
async function keepWordsMade(member: Member, row: FileMemberRow, words: string | null): Promise<void> {
  if (words !== null)
    await keepMadeWords(member, row, words).catch(logAndGoOn("a post's words kept on how it was made", false));
}

/**
 * AI's approval readied (00714), for a door that keeps neither facts nor words: the 8:00 approval's, which places each slot
 * readied overnight, and plan_slot_place's for what is made after. Its facts and its drawn piece's words are kept now, as the
 * owner's press keeps them with its approval; what the door takes is answered. Throws the owner's words for what stands in
 * the way.
 */
export async function prepareApproval(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  approval: ApprovalAsked,
): Promise<Json> {
  const { body, words } = await readApproval(ctx, member, row, approval);
  for (const claim of factClaims(approval.facts)) await keepClaim(ctx.supabase, member.tenantId, claim);
  if (words !== null) await keepPieceWords(ctx.supabase, { tenantId: member.tenantId, fileId: row.id, caption: words });
  await keepWordsMade(member, row, words);
  return jsonCopyOf(body);
}

/**
 * AI's placement of a week's slot under the owner's rung (00714 plan_slot_place): the slot's post and the slot's link to it in
 * one write, so a making asked twice, or two at once, place a slot once. Answers whether it was placed now (`placed`), has
 * its post already or is no longer AI's (`taken`), or its time has come (`past`); throws the owner's words for a refusal.
 */
export async function placeSlotAsAI(
  ctx: RouteContext,
  member: Member,
  slot: { id: string; fileId: string; approval: Json },
): Promise<"placed" | "taken" | "past"> {
  const fate = await placeSlot(ctx.supabase, member.tenantId, slot);
  if (fate === "approved") return "placed";
  if (fate === "taken" || fate === "past") return fate;
  throw refusedFate(fate);
}

/**
 * The approval, then the one door: the owner's press whole (00713 post_approve_whole), the facts they stated, the piece's
 * words and the approval or none of it. Answers what the door wrote, or throws the owner's words for what stands in the way.
 * AI's under the rung never comes here: it is readied (prepareApproval) and placed with its slot (placeSlotAsAI).
 */
export async function approvePlacements(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  approval: ApprovalAsked & { via: "press" | "card" },
): Promise<PostsApproved> {
  const { body, words } = await readApproval(ctx, member, row, approval);
  const answer = await approvePostsWhole(ctx.supabase, {
    tenantId: member.tenantId,
    fileId: row.id,
    approval: jsonCopyOf({
      ...body,
      // A fact the owner stated is kept as their own claim (owner_claims, 00706; PRD 6.1), valid until its day ends: the
      // send's check reads it there, and an approval no longer carries it.
      claims: factClaims(approval.facts),
      ...(words === null ? {} : { words }),
      ...(approval.replace ? { replace: true, expected: approval.replace.expected } : {}),
    }),
  });
  if (answer.fate !== "approved") throw refusedFate(answer.fate);
  // The approval and the piece's words are kept already, so made words that could not be written are logged and the press stands.
  await keepWordsMade(member, row, words);
  return answer;
}
