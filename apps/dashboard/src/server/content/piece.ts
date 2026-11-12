/**
 * A video made from a business's clips, for a member (decision 0122): the plan checked, the storyboard a card shows, and what
 * its press begins. Both read what they need afresh, so a card's body is never trusted: the clips as they now stand, who is in
 * them, the business's look. The provenance of the words was held when the card was made (Ask's act, where it is known who said
 * what); a person's press is their word, so here they are held only to what can be drawn. No model is called here.
 *
 * The press writes the video's row and its job's first step (00613 piece_begin), with the look as it stood, so the video drawn is
 * the one the card showed. The video itself is made by the job (apps/edge/lib/files/piece-make.ts) and lands in Files.
 */
import "server-only";
import { z } from "zod";
import {
  AppError,
  FILE_VIDEO_SECONDS_MAX,
  PIECE_FRAME,
  PIECE_LIMITS,
  PIECE_TEMPLATE,
  PIECE_WORDS_HOLDS,
  PIECE_WORDS_PLACES,
  compilePiece,
  parseTenantConfig,
  pieceFileIdsOf,
  piecePlanOf,
  pieceWordsIn,
  postWordsIn,
  resolveFacts,
  videoPreviewOf,
  whoStandsOf,
  type PieceLookKept,
  type PiecePlan,
  type PieceRefused,
  type PieceSource,
  type PieceTimeline,
  type TenantId,
} from "@chanlytics/contracts";
import { beginPiece, findFile, updateFileRow, type FileMemberRow } from "@chanlytics/db/files";
import { findWorkspaceLook } from "@chanlytics/db/look";
import { asJson } from "@chanlytics/db/shared";
import { fileDoorRefusal } from "@/server/files/file";
import { postBandOf, postUndrawable } from "@/server/files/post-check";
import { colourOn } from "@/server/posts/layout";
import { postPhoneOf } from "@/server/posts/phone";
import * as readers from "@/server/readers/facts";
import { fileDtoOf } from "@/server/readers/files";
import { getKnownFacts } from "@/server/readers/settings";
import { load, readerContext } from "@/server/shared/reader";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";

/**
 * The most cuts a plan kept as "Hook first" holds: as a card made before a video was arranged in blocks carries it.
 */
const HOOK_CUTS_MAX = 5;

/** What a kept plan says whichever shape it is kept in. */
const planWords = {
  words_at: z.enum(PIECE_WORDS_PLACES),
  words_hold: z.enum(PIECE_WORDS_HOLDS),
  end_line: z.string().max(PIECE_LIMITS.endLine).nullable(),
  language: z.enum(["en", "es"]),
  people_agreed: z.boolean(),
};

/** A plan kept as "Hook first", the one shape a video had: its cuts are read as clip blocks (contracts piecePlanOf). */
const hookInput = z.object({
  shape: z.literal("hook_cut"),
  cuts: z
    .array(
      z.object({
        file_id: z.uuid(),
        from: z.number().min(0).max(FILE_VIDEO_SECONDS_MAX),
        to: z.number().min(0).max(FILE_VIDEO_SECONDS_MAX),
      }),
    )
    .min(PIECE_LIMITS.blocksMin)
    .max(HOOK_CUTS_MAX),
  lines: z.array(z.string().min(1).max(PIECE_LIMITS.line)).min(1).max(PIECE_LIMITS.lines),
  ...planWords,
});

const blockSeconds = z.number().min(0).max(PIECE_LIMITS.reelMaxS);
const blockLabel = z.string().max(PIECE_LIMITS.label).nullable();
const shotInput = z.object({ file_id: z.uuid(), at: z.number().min(0).max(FILE_VIDEO_SECONDS_MAX).nullable() });

/** One block as a plan names it (contracts PieceBlock). What it may hold is the checker's to say, in words (compilePiece). */
const blockInput = z.discriminatedUnion("is", [
  z.object({
    is: z.literal("clip"),
    file_id: z.uuid(),
    from: z.number().min(0).max(FILE_VIDEO_SECONDS_MAX),
    to: z.number().min(0).max(FILE_VIDEO_SECONDS_MAX),
    label: blockLabel,
  }),
  z.object({ is: z.literal("photo"), file_id: z.uuid(), seconds: blockSeconds, label: blockLabel }),
  z.object({ is: z.literal("pair"), before: shotInput, after: shotInput, seconds: blockSeconds }),
  z.object({
    is: z.literal("words"),
    lines: z.array(z.string().max(PIECE_LIMITS.cardLine)).max(PIECE_LIMITS.cardLines),
    seconds: blockSeconds,
  }),
  z.object({
    is: z.literal("quote"),
    text: z.string().max(PIECE_LIMITS.quote),
    from: z.string().max(PIECE_LIMITS.quoteFrom).nullable(),
    over: shotInput.nullable(),
    seconds: blockSeconds,
  }),
]);

/** A plan kept in blocks, as Ask arranges one (decision 0126). */
const blocksInput = z.object({
  shape: z.literal("blocks"),
  blocks: z.array(blockInput).min(PIECE_LIMITS.blocksMin).max(PIECE_LIMITS.blocksMax),
  // None where the video opens on a card.
  lines: z.array(z.string().min(1).max(PIECE_LIMITS.line)).max(PIECE_LIMITS.lines),
  ...planWords,
});

/**
 * What a card's stills are asked with: the payload its card carries, in the shape it is kept in. Nothing is stored for a still.
 */
export const pieceBoardInput = z.union([hookInput, blocksInput]);

/** The card's own key, so the same press twice is one video. */
const pressKey = { key: z.string().min(1).max(100) };

/**
 * A press: the payload a card carries, in the shape it is kept in, and the card's key. The door stores what came (00615
 * piece_begin takes either shape), and every reader reads it as blocks.
 */
export const pieceBeginInput = z.union([hookInput.extend(pressKey), blocksInput.extend(pressKey)]);

/** An address as an end card says it: the street and the town, the rest left to a map. */
const shortAddressOf = (address: string | null): string | null =>
  address
    ?.split(",")
    .slice(0, 2)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ") || null;

/** The business's own as a video wears it, read now: its colour and mark, its name, its number as a post's band says it, its address. */
async function pieceLookFor(
  ctx: RouteContext,
  tenantId: TenantId,
  language: PiecePlan["language"],
  config: unknown,
): Promise<PieceLookKept> {
  const [look, known] = await Promise.all([findWorkspaceLook(ctx.supabase, tenantId), getKnownFacts(ctx, tenantId)]);
  const facts = resolveFacts(parseTenantConfig(config)?.brain ?? null, known);
  const phone = await postPhoneOf(ctx, tenantId, config);
  return {
    // The business's colour where it reads on the end card's ground, as a post's words wear it (posts/layout.ts).
    accent: colourOn(look?.accent ?? null, PIECE_FRAME.ink, PIECE_FRAME.paper),
    logo_path: look?.logo_path ?? null,
    name: facts.business_name.value ?? look?.name ?? "",
    book: phone ? postBandOf(phone, language) : null,
    address: shortAddressOf(facts.address.value),
  };
}

/** A clip as the plan's checker reads it, from the row a member may see. */
const pieceSourceOf = (file: FileMemberRow): PieceSource => ({
  id: file.id,
  kind: file.kind,
  status: file.status,
  source: file.source,
  media_status: file.media_status,
  seconds: file.seconds === null ? null : Number(file.seconds),
  people_unasked: whoStandsOf(fileDtoOf(file)).is === "ask",
});

/** A plan that passed: the timeline it draws, the look it was drawn in, and its clips. */
export interface PieceChecked {
  timeline: PieceTimeline;
  look: PieceLookKept;
  files: FileMemberRow[];
}

/**
 * The plan checked against its files and the look as they now stand (contracts compilePiece): each clip is the workspace's own
 * ready, kept video and each photo its own kept photo, each stretch is inside its clip, and whoever is in them agreed. What
 * passed, or why it did not and which block it is about. Ask's act says the why to the model; a route says it to a person.
 */
export async function checkPieceClips(
  ctx: RouteContext,
  tenantId: TenantId,
  plan: PiecePlan,
  config: unknown,
): Promise<({ ok: true } & PieceChecked) | PieceRefused> {
  const ids = pieceFileIdsOf(plan);
  const found = await Promise.all(ids.map((id) => findFile(ctx.supabase, id)));
  // This workspace's own: a member of two reads both under their session, and the job that draws reads this one alone.
  const files = found.filter((file): file is FileMemberRow => file !== null && file.tenant_id === tenantId);
  const look = await pieceLookFor(ctx, tenantId, plan.language, config);
  const compiled = compilePiece(plan, files.map(pieceSourceOf), {
    accent: look.accent,
    logo: look.logo_path !== null,
    name: look.name,
    book: look.book,
    address: look.address,
  });
  return compiled.ok ? { ok: true, timeline: compiled.timeline, look, files } : compiled;
}

/**
 * A member's plan checked, or the refusal in the plan's own language: videos are on for the workspace, the words can be drawn,
 * and the plan passes against the clips as they stand.
 */
export async function checkPiecePlan(ctx: RouteContext, member: Member, plan: PiecePlan): Promise<PieceChecked> {
  const config = await load(readerContext(ctx, member), readers.config, undefined).then((r) => r.data?.config ?? null);
  if (!videoPreviewOf(config)) throw new AppError("validation", pieceWordsIn(plan.language).off);
  for (const [words, limit] of [
    ...plan.lines.map((line) => [line, PIECE_LIMITS.line] as const),
    [plan.end_line, PIECE_LIMITS.endLine] as const,
    ...plan.blocks.flatMap(blockWordsOf),
  ]) {
    const wrong = words ? postUndrawable(words, limit) : null;
    if (wrong) throw new AppError("validation", postWordsIn(plan.language).undrawable[wrong]);
  }
  const checked = await checkPieceClips(ctx, member.tenantId, plan, config);
  if (!checked.ok) throw new AppError("validation", pieceWordsIn(plan.language).wont[checked.wont]);
  return checked;
}

/** The words a block draws of its own, each with the most it may run: a caption, a card's lines, a quote and who said it. */
function blockWordsOf(block: PiecePlan["blocks"][number]): (readonly [string | null, number])[] {
  if (block.is === "clip" || block.is === "photo") return [[block.label, PIECE_LIMITS.label]];
  if (block.is === "words") return block.lines.map((line) => [line, PIECE_LIMITS.cardLine] as const);
  if (block.is === "quote")
    return [
      [block.text, PIECE_LIMITS.quote],
      [block.from, PIECE_LIMITS.quoteFrom],
    ];
  return [];
}

/** How long a checked plan's video runs, in seconds: its timeline's own. */
export const pieceSecondsOf = (timeline: PieceTimeline): number =>
  Math.round((timeline.frames / PIECE_FRAME.fps) * 10) / 10;

/**
 * POST files/video: the press. The plan is checked afresh, a person's word that those in the clips agreed goes on each clip through
 * its own door, and the video's row is written with the first step of the job that makes it. Kept once by the card's key.
 */
export async function beginPieceFor(
  ctx: RouteContext,
  member: Member,
  input: z.infer<typeof pieceBeginInput>,
): Promise<{ piece_id: string; fate: "begun" | "here" }> {
  const { key, ...kept } = input;
  const plan = piecePlanOf(kept);
  const checked = await checkPiecePlan(ctx, member, plan);
  if (plan.people_agreed) {
    for (const file of checked.files) {
      if (file.who_in_it === "agreed") continue;
      const { error } = await updateFileRow(ctx.supabase, {
        tenantId: member.tenantId,
        id: file.id,
        whoInIt: "agreed",
      });
      if (error) throw fileDoorRefusal(error);
    }
  }
  const begun = await beginPiece(ctx.supabase, {
    tenantId: member.tenantId,
    // As its card sent it: a row holds either shape (00615), and every reader reads it as blocks.
    plan: asJson(kept),
    look: asJson(checked.look),
    key,
    edition: PIECE_TEMPLATE.edition,
  });
  if (begun.fate === "busy" || !begun.piece_id) throw new AppError("validation", pieceWordsIn(plan.language).busy);
  return { piece_id: begun.piece_id, fate: begun.fate };
}
