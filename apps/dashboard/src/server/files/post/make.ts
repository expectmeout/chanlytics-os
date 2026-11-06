/**
 * A post from a photo, for a member (decision 0099, step 3): the picture a card shows, and what its Save keeps. Both read what they
 * need afresh, so a card's body is never trusted, and both draw from the same plan, so what they saw is what is kept. The
 * provenance of the words was held when the card was made (contracts postWordsProblem, Ask's act); a person's press is their word,
 * so here they are held only to what can be postDrawn. No model is called and nothing is spent.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AppError,
  FILE_CACHE_S,
  FILE_WORDS as W,
  POST_LIMITS,
  POST_SHAPES,
  POST_VOICES,
  WORKSPACE_LOGOS_BUCKET,
  fileNameOf,
  filePathOf,
  postBandOf,
  postPathOf,
  postPhotoProblem,
  postWordsProblem,
  recordOrNull,
  type FileMime,
  type PostPlan,
  type PostShapeName,
} from "@chanlytics/contracts";
import { fileFingerprintOf, FINGERPRINT_BYTES } from "@chanlytics/channels";
import { fileChange, fileMade, fileOf, workspaceLookOf, type FileMemberRow, type Json } from "@chanlytics/db";
import { log } from "@/server/log";
import { load, readerContext } from "@/server/readers";
import * as readers from "@/server/readers/facts";
import type { Member } from "@/server/route";
import { serviceDb } from "@/server/service-db";
import type { RouteContext } from "@/server/with-route";
import { bucket, doorRefusal } from "../file";
import { asPng, composePost } from "./compose";
import { POST_SIZES } from "./layout";
import { postPhoneOf } from "./phone";

/** What a press sends, as both routes take it. */
export const postPlanInput = z.object({
  file_id: z.uuid(),
  line: z.string().min(1).max(POST_LIMITS.line),
  over: z.string().max(POST_LIMITS.over).nullable(),
  under: z.string().max(POST_LIMITS.under).nullable(),
  book: z.boolean(),
  words_at: z.enum(["top", "bottom"]),
  voice: z.enum(POST_VOICES),
  language: z.enum(["en", "es"]),
  people_agreed: z.boolean(),
});

/** The widest a photo is read at: enough for the tallest shape, and every kind it may be kept in comes back as one the code reads. */
const PHOTO_READ_WIDTH = 2000;

/** What a post is postDrawn from, read afresh. */
interface PostMaterial {
  photo: Buffer;
  subject: readonly [number, number, number, number] | null;
  accent: string | null;
  logo: string | null;
  phone: string | null;
}

const asFour = (v: unknown): readonly [number, number, number, number] | null =>
  Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number")
    ? (v as [number, number, number, number])
    : null;

/** The business's mark, ready to draw, or none. A mark that can't be read costs the mark, never the post. */
async function logoOf(tenantId: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  const read = await serviceDb().storage.from(WORKSPACE_LOGOS_BUCKET).download(path);
  if (read.error || !read.data) {
    log.warn("file_post_logo_failed", { tenant_id: tenantId, error: read.error?.message ?? "no bytes" });
    return null;
  }
  const mark = await asPng(Buffer.from(await read.data.arrayBuffer()));
  if (!mark) log.warn("file_post_logo_failed", { tenant_id: tenantId, error: "unreadable" });
  return mark ? `data:image/png;base64,${mark.toString("base64")}` : null;
}

async function materialOf(ctx: RouteContext, member: Member, file: FileMemberRow): Promise<PostMaterial> {
  const path = filePathOf(file.tenant_id, file.id, file.mime as FileMime);
  const [read, look, config] = await Promise.all([
    bucket().download(path, { transform: { width: PHOTO_READ_WIDTH, resize: "contain" } }),
    workspaceLookOf(ctx.supabase, member.tenantId),
    load(readerContext(ctx, member), readers.config, undefined).then((r) => r.data),
  ]);
  if (read.error || !read.data) {
    log.error("file_post_read_failed", { tenant_id: file.tenant_id, error: read.error?.message ?? "no bytes" });
    throw new AppError("internal", W.failedRead, 503);
  }
  return {
    photo: Buffer.from(await read.data.arrayBuffer()),
    subject: asFour(recordOrNull(file.look)?.subject),
    accent: look?.accent ?? null,
    logo: await logoOf(member.tenantId, look?.logo_path ?? null),
    phone: await postPhoneOf(ctx, member.tenantId, config?.config ?? null),
  };
}

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
    const wrong = words ? postWordsProblem(words, words, limit) : null;
    if (wrong) throw new AppError("validation", `Those words can't be postDrawn: ${wrong}.`);
  }
  return file;
}

const postDrawn = (plan: PostPlan, material: PostMaterial, shape: PostShapeName): Promise<Buffer> =>
  composePost({
    photo: material.photo,
    subject: material.subject,
    shape: POST_SIZES[shape],
    wordsAt: plan.words_at,
    voice: plan.voice,
    accent: material.accent,
    logo: material.logo,
    words: {
      over: plan.over,
      line: plan.line,
      under: plan.under,
      act: plan.book && material.phone ? postBandOf(material.phone, plan.language) : null,
    },
  });

/** POST files/post/preview: the real picture, for a card to show. Nothing is kept. */
export async function previewPost(
  ctx: RouteContext,
  member: Member,
  plan: PostPlan & { shape?: PostShapeName | undefined },
): Promise<Response> {
  const file = await photoFor(ctx, plan);
  const picture = await postDrawn(plan, await materialOf(ctx, member, file), plan.shape ?? "portrait");
  return new Response(new Uint8Array(picture), {
    status: 200,
    headers: { "content-type": "image/jpeg", "cache-control": "private, no-store" },
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
  if (plan.people_agreed) {
    const { error } = await fileChange(ctx.supabase, { tenantId: member.tenantId, id: file.id, whoInIt: "agreed" });
    if (error) throw doorRefusal(error);
  }
  const material = await materialOf(ctx, member, file);
  const [portrait, square, story] = await Promise.all([
    postDrawn(plan, material, "portrait"),
    postDrawn(plan, material, "square"),
    postDrawn(plan, material, "story"),
  ]);
  const id = randomUUID();
  await storeShapes(member.tenantId, id, {
    portrait: portrait,
    square: square,
    story: story,
  });
  const look = recordOrNull(file.look);
  // Nothing else would ever let these bytes go: no row names them until the door answers.
  const answered = await fileMade(serviceDb(), {
    tenantId: member.tenantId,
    id,
    name: fileNameOf(plan.line, 5) || "post",
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
