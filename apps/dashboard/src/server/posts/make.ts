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
  postNameOf,
  postPhotoWont,
  postWordsIn,
  recordOrNull,
  type PostPlan,
  type PostPicture,
  type PostShapeName,
} from "@chanlytics/contracts";
import { postBandOf, postPathOf, postUndrawable } from "../files/post-check";
import { fileFingerprintOf, FINGERPRINT_BYTES } from "@chanlytics/channels/files";
import { updateFileRow, recordFileMade, findFile, startFile, type FileMemberRow } from "@chanlytics/db/files";
import { log } from "@/server/shared/log";
import type { Member } from "@/server/shared/route";
import { serviceDb } from "@/server/shared/service-db";
import type { RouteContext } from "@/server/shared/with-route";
import { bucket, fileDoorRefusal } from "../files/file";
import { composePost } from "./compose";
import { POST_SIZES } from "./layout";
import { getMaterial, type PostMaterial } from "./material";
import { asJson } from "@chanlytics/db/shared";
import type { TenantId } from "@chanlytics/contracts";

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
export async function getPhoto(ctx: RouteContext, plan: PostPlan): Promise<FileMemberRow> {
  const file = await findFile(ctx.supabase, plan.file_id);
  if (!file) throw new AppError("not_found", W.gone, 404);
  const wont = postPhotoWont(file);
  if (wont) throw new AppError("validation", postWordsIn(plan.language).photoWont[wont]);
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

export const postDrawn = (
  plan: PostPlan,
  material: PostMaterial,
  shape: PostPicture,
  draft: boolean,
): Promise<Buffer> =>
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
  plan: PostPlan & { shape?: PostPicture | undefined },
): Promise<Response> {
  const file = await getPhoto(ctx, plan);
  const material = await getMaterial(ctx, member, file);
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
async function storeShapes(tenantId: TenantId, id: string, shapes: Record<PostShapeName, Buffer>): Promise<void> {
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
  throw new AppError("unavailable", W.notSaved);
}

const letShapesGo = async (tenantId: TenantId, id: string): Promise<void> => {
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
  const file = await getPhoto(ctx, plan);
  const id = randomUUID();
  // The fair word at the cap, before anything is drawn, and the purge that empties this folder a day on if it never becomes a file:
  // a function that dies between storing the shapes and the door below can't take them back itself.
  const started = await startFile(ctx.supabase, member.tenantId, id);
  if (started.error) throw fileDoorRefusal(started.error);
  if (plan.people_agreed) {
    const { error } = await updateFileRow(ctx.supabase, { tenantId: member.tenantId, id: file.id, whoInIt: "agreed" });
    if (error) throw fileDoorRefusal(error);
  }
  const material = await getMaterial(ctx, member, file);
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
  const answered = await recordFileMade(serviceDb(), {
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
      ...(look?.people ? { people: asJson(look.people) } : {}),
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
  const row = await findFile(ctx.supabase, kept);
  return { file_id: kept, name: row?.name ?? "", twin: answered.fate === "here" };
}
