/**
 * The owner's approval of a made post or video for its placements (the content loop PRD's 3, 5.3 and 6.2, pass 1b): the
 * press that is the approval, on the member's own session. Before anything is written, the checks a press is held to
 * (packages/core content/policy): the place takes it, the connection allows it, AI is not paused, a yes was not taken
 * back, and its reason stands; words that date something come with what they are about (AI's card writes it). Then the
 * exact thing approved: each shape a placement sends, by its path in the file's folder and the full SHA-256 of its
 * bytes, read now, so the edge sends those bytes or none (00690 post_as_approved). One door writes it all.
 */
import "server-only";
import { createHash } from "node:crypto";
import {
  AppError,
  CHECK_WORDS,
  ON_INSTAGRAM,
  PLACE_CAPABILITIES,
  fileMadePathOf,
  goodUntilOf,
  notesInForce,
  parseTenantConfig,
  postPathOf,
  renditionShapeOf,
  type InstagramPostable,
  type OwnersFact,
  type PieceApprovalSnapshot,
  type PieceIntent,
  type PostKind,
  type PostPlace,
  type RenditionShape,
  type SnapshotRendition,
  type TenantId,
} from "@chanlytics/contracts";
import { evaluate, verdictWords, type PolicyFacts } from "@chanlytics/core";
import { approvePosts, type FileMemberRow, type PostsApproved } from "@chanlytics/db/files";
import { isSendingStopped } from "@chanlytics/db/workspace";
import { jsonCopyOf } from "@chanlytics/db/shared";
import { log } from "@/server/shared/log";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";
import { getStoredConfig } from "@/server/workspace/config-row";
import { bucket } from "../files/file";
import { googlePicturePathOf } from "./make";

/** One placement as the owner approves it: where, as what, with which words, when (null: as it is pressed). */
export interface PlacementAsked {
  place: PostPlace;
  kind: PostKind;
  caption: string | null;
  when: string | null;
}

/** What a press approves: its placements, what its words are about, any fact the owner stated, and who pressed. */
export interface ApprovalAsked {
  placements: PlacementAsked[];
  intent: PieceIntent | null;
  facts: OwnersFact[];
  via: "press" | "card";
  /** Whether each place's connection takes a post now (the caller read it). */
  connections: Readonly<Partial<Record<PostPlace, InstagramPostable>>>;
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
      if (read.error || !read.data) {
        log.error("post_approve_shape_unread", { tenant_id: tenantId, shape, error: read.error?.message ?? "none" });
        throw new AppError("unavailable", ON_INSTAGRAM.notSent);
      }
      const bytes = Buffer.from(await read.data.arrayBuffer());
      return { shape, path, checksum: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
    }),
  );
}

/** The business's notes in force and its services, for the reason, read only where the intent names one. */
async function businessOf(ctx: RouteContext, member: Member, intent: PieceIntent | null, zone: string) {
  if (!intent?.offer && !intent?.service) return { notes: [], services: [] };
  const profile = parseTenantConfig(await getStoredConfig(ctx.supabase, member.tenantId))?.brain?.profile;
  return {
    notes: notesInForce(profile?.notes, zone, new Date()).map((n) => `${n.title} ${n.text}`),
    services: (profile?.services ?? []).map((s) => s.name),
  };
}

/** The checks a press is held to, every refusal at once, in the owner's words. */
async function refusalsOf(ctx: RouteContext, member: Member, row: FileMemberRow, asked: ApprovalAsked) {
  const zone = member.facts?.timezone ?? "UTC";
  const business = await businessOf(ctx, member, asked.intent, zone);
  const stopped = await isSendingStopped(ctx.supabase, member.tenantId);
  const words = asked.placements.map((p) => p.caption ?? "").join("\n");
  const facts: PolicyFacts = {
    rights: { takenBack: !row.yes_for.includes("post") && row.yes_back.includes("post") },
    automation: { stopped, pressedBy: "owner" },
    reason: {
      intent: asked.intent,
      goodUntil: null,
      nowMs: Date.now(),
      zone,
      ...business,
      facts: asked.facts,
      words,
      moment: "approve",
    },
  };
  const placed = asked.placements.map((p) =>
    evaluate({
      publishing: {
        place: p.place,
        kind: p.kind,
        fileKind: row.kind,
        connection: asked.connections[p.place] ?? "not_connected",
        caption: p.caption,
        video:
          row.kind === "video"
            ? { mime: row.mime, bytes: row.bytes, ms: row.seconds ? row.seconds * 1000 : null }
            : null,
      },
    }),
  );
  const verdicts = [evaluate(facts), ...placed];
  return verdicts.map(verdictWords).filter(Boolean).join(" ");
}

/** A door's answer that approved nothing, in the owner's words. */
function refusedFate(answer: PostsApproved): AppError {
  if (answer.fate === "busy") return new AppError("conflict", ON_INSTAGRAM.busy, 409);
  if (answer.fate === "gone") return new AppError("not_found", ON_INSTAGRAM.gone, 404);
  if (answer.fate === "not_a_post") return new AppError("validation", ON_INSTAGRAM.notAPost);
  if (answer.fate === "wrong_kind") return new AppError("validation", ON_INSTAGRAM.wrongKind);
  if (answer.fate === "taken_back") return new AppError("conflict", CHECK_WORDS.takenBack, 409);
  if (answer.fate === "rights") return new AppError("conflict", CHECK_WORDS.notYetSaid(answer.rightsName), 409);
  if (answer.fate === "changed") return new AppError("conflict", ON_INSTAGRAM.held.changed, 409);
  return new AppError("validation", CHECK_WORDS.afterItsDay);
}

/**
 * The approval: the checks, then the shapes' bytes read and summed, then the one door. Answers what the door wrote, or
 * throws the owner's words for what stands in the way.
 */
export async function approvePlacements(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  asked: ApprovalAsked,
): Promise<PostsApproved> {
  const refused = await refusalsOf(ctx, member, row, asked);
  if (refused) throw new AppError("validation", refused);
  const zone = member.facts?.timezone ?? "UTC";
  const goodUntil = goodUntilOf(asked.intent, zone);
  const shapes = await readShapes(
    member.tenantId,
    row,
    asked.placements.map((p) => renditionShapeOf(p.place, p.kind)),
  );
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
    placements: asked.placements.map((p) => ({
      place: p.place,
      kind: p.kind,
      at: p.when ?? now,
      caption: p.kind === "story" ? null : (p.caption?.trim() ?? null),
    })),
    uses: ["post"],
    spend: null,
    facts: asked.facts,
  };
  const approval = {
    snapshot,
    intent: asked.intent,
    renditions: shapes,
    placements: asked.placements.map((p) => ({
      place: p.place,
      kind: p.kind,
      at: p.when,
      caption: p.kind === "story" ? null : (p.caption?.trim() ?? null),
      good_until: goodUntil,
      capability_edition: PLACE_CAPABILITIES[p.place].edition,
    })),
    via: asked.via,
  };
  const answer = await approvePosts(ctx.supabase, {
    tenantId: member.tenantId,
    fileId: row.id,
    approval: jsonCopyOf(approval),
  });
  if (answer.fate !== "approved") throw refusedFate(answer);
  return answer;
}
