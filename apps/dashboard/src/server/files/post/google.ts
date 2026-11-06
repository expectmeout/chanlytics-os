/**
 * A kept post on the business's Google profile, and off it (decision 0099, step 3): a person's press, and only that. The picture is
 * drawn for what Google shows, from what the post was asked to be, and kept in the file's own folder, so what empties the folder empties
 * it. Google fetches it by itself, some time after it answers, so its address lasts a day. The edge holds the token and says it to Google.
 */
import "server-only";
import { AppError, DAY_MS, FILE_WORDS, SECOND_MS, fileFolderOf, type PostPlan } from "@chanlytics/contracts";
import type { FileMemberRow } from "@chanlytics/db";
import { edgeGoogle } from "@/server/connections/google";
import { log } from "@/server/log";
import type { Member } from "@/server/route";
import type { RouteContext } from "@/server/with-route";
import { bucket } from "../file";
import { materialOf } from "./material";
import { photoFor, postDrawn } from "./make";
import { fileRecord } from "./record";

const W = FILE_WORDS.google;

/** Long enough for Google to come for it, whenever it does. */
const PICTURE_LINK_S = DAY_MS / SECOND_MS;
/** A photo read, a picture drawn and Google asked: the slowest a press waits. */
const GOOGLE_ASKED_MS = 25 * SECOND_MS;

/** The picture Google is sent to fetch. Drawn afresh each time: a post's words never change, but its logo and its colour may. */
async function pictureForGoogle(ctx: RouteContext, member: Member, fileId: string, plan: PostPlan): Promise<string> {
  const photo = await photoFor(ctx, plan);
  const material = await materialOf(ctx, member, photo);
  const picture = await postDrawn(plan, material, "wide", false);
  const path = `${fileFolderOf(member.tenantId, fileId)}/google.jpg`;
  const stored = await bucket().upload(path, picture, { contentType: "image/jpeg", upsert: true });
  if (stored.error) {
    log.error("file_google_store_failed", { tenant_id: member.tenantId, error: stored.error.message });
    throw new AppError("internal", W.notSent, 503);
  }
  const signed = await bucket().createSignedUrl(path, PICTURE_LINK_S);
  if (signed.error || !signed.data) {
    log.error("file_google_store_failed", { tenant_id: member.tenantId, error: signed.error?.message ?? "no address" });
    throw new AppError("internal", W.notSent, 503);
  }
  return signed.data.signedUrl;
}

/** What the edge said, in a person's words. */
function refusedBy(a: { status: number; body?: Record<string, unknown> | null }): AppError {
  const reason = typeof a.body?.error === "string" ? a.body.error : "failed";
  if (reason === "not_connected") return new AppError("conflict", W.notConnected, 409);
  if (reason === "no_token") return new AppError("conflict", W.noToken, 409);
  if (reason === "not_found") return new AppError("not_found", FILE_WORDS.gone, 404);
  if (reason === "google_refused") {
    const detail = typeof a.body?.detail === "string" ? ` ${a.body.detail.slice(0, 200)}` : "";
    return new AppError("internal", `${W.refused}${detail}`, 502);
  }
  return new AppError("internal", W.notSent, 502);
}

/** POST files/[id]/google: the post goes up. What it says is a person's, and goes as they typed it. */
export async function postFileToGoogle(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  input: { summary: string },
): Promise<{ name: string; search_url: string | null; state: string | null }> {
  if (row.source !== "made") throw new AppError("validation", W.notAPost);
  const { made } = await fileRecord(ctx, member, row);
  if (!made?.from) throw new AppError("validation", W.noPhoto);
  const photoUrl = await pictureForGoogle(ctx, member, row.id, made.plan);
  const a = await edgeGoogle(
    {
      op: "post",
      tenant_id: member.tenantId,
      user_id: ctx.userId,
      file_id: row.id,
      summary: input.summary,
      photo_url: photoUrl,
      language: made.plan.language,
      call: made.plan.book,
    },
    GOOGLE_ASKED_MS,
  );
  if (a.status !== 200 || a.body?.ok !== true) throw refusedBy(a);
  return {
    name: String(a.body.name),
    search_url: typeof a.body.search_url === "string" ? a.body.search_url : null,
    state: typeof a.body.state === "string" ? a.body.state : null,
  };
}

/** DELETE files/[id]/google: the post comes off the profile. It stays in Files. */
export async function takeFileOffGoogle(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  input: { name: string },
): Promise<{ down: true }> {
  const a = await edgeGoogle(
    { op: "unpost", tenant_id: member.tenantId, user_id: ctx.userId, file_id: row.id, post_name: input.name },
    GOOGLE_ASKED_MS,
  );
  if (a.status !== 200 || a.body?.ok !== true) throw refusedBy(a);
  return { down: true };
}
