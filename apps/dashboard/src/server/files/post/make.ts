/**
 * A post from a photo, for a member (decision 0099, step 3): the picture a card shows, and what its Save keeps. Both read what they
 * need afresh, so a card's body is never trusted, and both draw from the same plan, so what they saw is what is kept. The
 * provenance of the words was held when the card was made (contracts postWordsProblem, Ask's act); a person's press is their word,
 * so here they are held only to what can be drawn. No model is called and nothing is spent.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AppError,
  FILE_CACHE_S,
  FILE_WORDS as W,
  POST_LAYOUTS,
  POST_LIMITS,
  POST_SHAPES,
  POST_VOICES,
  postBandOf,
  postNameOf,
  postPathOf,
  postPhotoProblem,
  postUndrawable,
  postWordsIn,
  recordOrNull,
  type PostPlan,
  type PostShapeName,
} from "@chanlytics/contracts";
import { fileFingerprintOf, FINGERPRINT_BYTES } from "@chanlytics/channels";
import { fileChange, fileMade, fileOf, fileStart, type FileMemberRow, type Json } from "@chanlytics/db";
import { log } from "@/server/log";
import type { Member } from "@/server/route";
import { serviceDb } from "@/server/service-db";
import type { RouteContext } from "@/server/with-route";
import { bucket, doorRefusal } from "../file";
import { composePost } from "./compose";
import { POST_SIZES } from "./layout";
import { materialOf, type PostMaterial } from "./material";

/** What a press sends, as both routes take it. A card made before layouts names none, and draws as it did. */
export const postPlanInput = z.object({
  file_id: z.uuid(),
  line: z.string().min(1).max(POST_LIMITS.line),
  over: z.string().max(POST_LIMITS.over).nullable(),
  under: z.string().max(POST_LIMITS.under).nullable(),
  book: z.boolean(),
  words_at: z.enum(["top", "bottom"]),
  voice: z.enum(POST_VOICES),
  layout: z.enum(POST_LAYOUTS).default("over"),
  language: z.enum(["en", "es"]),
  people_agreed: z.boolean(),
});

/** A photo a post may be made from, or the words that say why not. */
async function photoFor(ctx: RouteContext, plan: PostPlan): Promise<FileMemberRow> {
  const file = await fileOf(ctx.supabase, plan.file_id);
  if (!file) throw new AppError("not_found", W.gone, 404);
  const problem = postPhotoProblem(file);
  if (problem) throw new AppError("validation", `This photo can't be used: ${problem}.`);
  for (const [words, limit] of [
    [plan.line, POST_LIMITS.line],
    [plan.over, POST_LIMITS.over],
    [plan.under, POST_LIMITS.under],
  ] as const) {
    const wrong = words ? postUndrawable(words, limit) : null;
    if (wrong) throw new AppError("validation", postWordsIn(plan.language).undrawable[wrong]);
  }
  return file;
}

const postDrawn = (plan: PostPlan, material: PostMaterial, shape: PostShapeName, draft: boolean): Promise<Buffer> =>
  composePost({
    photo: material.photo,
    subject: material.subject,
    shape: POST_SIZES[shape],
    wordsAt: plan.words_at,
    voice: plan.voice,
    layout: plan.layout,
    accent: material.accent,
    logo: material.logo,
    draft,
    words: {
      over: plan.over,
      line: plan.line,
      under: plan.under,
      act: plan.book && material.phone ? postBandOf(material.phone, plan.language) : null,
    },
  });

/** POST files/post/preview: the real picture, for a card to show, and whether the business has a number to offer. Nothing is kept. */
export async function previewPost(
  ctx: RouteContext,
  member: Member,
  plan: PostPlan & { shape?: PostShapeName | undefined },
): Promise<Response> {
  const file = await photoFor(ctx, plan);
  const material = await materialOf(ctx, member, file);
  const picture = await postDrawn(plan, material, plan.shape ?? "portrait", true);
  return new Response(new Uint8Array(picture), {
    status: 200,
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "private, no-store",
      "x-post-phone": material.phone ? "1" : "0",
    },
  });
}

/** A made file's shapes, stored. What did not arrive is taken back, and the press is told. */
async function storeShapes(tenantId: string, id: string, shapes: Record<PostShapeName, Buffer>): Promise<void> {
  const stored = await Promise.all(
    POST_SHAPES.map((shape) =>
      bucket().upload(postPathOf(tenantId, id, shape), shapes[shape], {
        contentType: "image/jpeg",
        cacheControl: String(FILE_CACHE_S),
        upsert: false,
      }),
    ),
  );
  const failed = stored.find((s) => s.error);
  if (!failed) return;
  log.error("file_post_store_failed", { tenant_id: tenantId, error: failed.error?.message ?? "" });
  await letShapesGo(tenantId, id);
  throw new AppError("internal", W.notSaved, 503);
}

const letShapesGo = async (tenantId: string, id: string): Promise<void> => {
  const gone = await bucket().remove(POST_SHAPES.map((shape) => postPathOf(tenantId, id, shape)));
  if (gone.error) log.warn("file_post_let_go_failed", { tenant_id: tenantId, error: gone.error.message });
};

/**
 * POST files/post: the post kept, a shape each, as a file like any other. The same picture pressed twice is the one file. A
 * person's word that those in the photo agreed goes on the photo first, through its own door.
 */
export async function makePost(
  ctx: RouteContext,
  member: Member,
  plan: PostPlan,
): Promise<{ file_id: string; name: string; twin: boolean }> {
  const file = await photoFor(ctx, plan);
  const id = randomUUID();
  // The fair word at the cap, before anything is drawn, and the purge that empties this folder a day on if it never becomes a file:
  // a function that dies between storing the shapes and the door below can't take them back itself.
  const started = await fileStart(ctx.supabase, member.tenantId, id);
  if (started.error) throw doorRefusal(started.error);
  if (plan.people_agreed) {
    const { error } = await fileChange(ctx.supabase, { tenantId: member.tenantId, id: file.id, whoInIt: "agreed" });
    if (error) throw doorRefusal(error);
  }
  const material = await materialOf(ctx, member, file);
  const [portrait, square, story] = await Promise.all([
    postDrawn(plan, material, "portrait", false),
    postDrawn(plan, material, "square", false),
    postDrawn(plan, material, "story", false),
  ]);
  await storeShapes(member.tenantId, id, {
    portrait: portrait,
    square: square,
    story: story,
  });
  const look = recordOrNull(file.look);
  // No row names these bytes until the door answers: let them go now, and not a day on.
  const answered = await fileMade(serviceDb(), {
    tenantId: member.tenantId,
    id,
    name: postNameOf(plan.line),
    bytes: portrait.length,
    fingerprint: fileFingerprintOf(portrait.subarray(0, FINGERPRINT_BYTES), portrait.length),
    width: POST_SIZES.portrait.width,
    height: POST_SIZES.portrait.height,
    look: {
      line: `A post saying "${plan.line}", made from ${file.name}.`,
      text_seen: [plan.over, plan.line, plan.under].filter((w): w is string => !!w),
      ...(look?.people ? { people: look.people as Json } : {}),
    },
    whoInIt: plan.people_agreed ? "agreed" : file.who_in_it,
    made: { from: file.id, plan },
    actor: ctx.userId,
  }).catch(async (e: unknown) => {
    await letShapesGo(member.tenantId, id);
    throw e;
  });
  if (answered.fate !== "kept") await letShapesGo(member.tenantId, id);
  if (answered.fate === "full") throw new AppError("validation", W.full);
  const kept = answered.file_id ?? id;
  const row = await fileOf(ctx.supabase, kept);
  return { file_id: kept, name: row?.name ?? "", twin: answered.fate === "here" };
}
