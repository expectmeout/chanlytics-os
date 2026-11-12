/**
 * A still from a video (the content redesign's stage 3): one moment of a clip, or of a video Ask made, seen and kept as a photo
 * of the library. The picture is the one the edge cuts of that moment for a post (posts/material.ts readFrame), so seeing a
 * moment and keeping it read one object, and a post from that moment reads it again for nothing. Kept, it is a photo like one
 * added by hand (upload.ts finishUpload): proven, named for its video and its moment, filed, and looked at.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import {
  AppError,
  DAY_MS,
  FILE_WORDS,
  SECOND_MS,
  STILL_WORDS,
  filePathOf,
  stillNameOf,
  stillWont,
} from "@chanlytics/contracts";
import { startFile, type FileMemberRow } from "@chanlytics/db/files";
import { readFrame } from "@/server/posts/material";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";
import { bucket, fileDoorRefusal } from "./file";
import { finishUpload } from "./upload";

/** How long a browser keeps a moment's picture: a moment of a video never changes. */
const STILL_KEPT_S = DAY_MS / SECOND_MS;

/** The moment, refused in words where it is no moment of a video that is ready. */
function stillMomentOf(video: FileMemberRow, at: number): number {
  if (video.kind !== "video" || video.media_status !== "ready") throw new AppError("validation", STILL_WORDS.notReady);
  if (stillWont(video, at)) throw new AppError("validation", STILL_WORDS.wont);
  return at;
}

/** GET files/[id]/still?at=: the picture of one moment, as a still of it would be kept. */
export async function viewStill(
  ctx: RouteContext,
  member: Member,
  video: FileMemberRow,
  at: number,
): Promise<Response> {
  const picture = await readFrame(ctx, member.tenantId, video, stillMomentOf(video, at));
  return new Response(new Uint8Array(picture), {
    headers: { "content-type": "image/jpeg", "cache-control": `private, max-age=${STILL_KEPT_S}` },
  });
}

/** POST files/[id]/still `{ at }`: that moment kept as a photo of the library. Answers the photo, or the one it twins. */
export async function keepStill(
  ctx: RouteContext,
  member: Member,
  video: FileMemberRow,
  input: { at: number },
): Promise<{ file_id: string; twin: boolean }> {
  const picture = await readFrame(ctx, member.tenantId, video, stillMomentOf(video, input.at));
  const id = randomUUID();
  // The fair word at the cap before anything is stored, and the purge that empties the folder if it never becomes a file.
  const started = await startFile(ctx.supabase, member.tenantId, id);
  if (started.error) throw fileDoorRefusal(started.error);
  const stored = await bucket().upload(filePathOf(member.tenantId, id, "image/jpeg"), picture, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (stored.error) throw new AppError("unavailable", FILE_WORDS.notSaved);
  return finishUpload(ctx, member, id, { name: stillNameOf(video.name, input.at), mime: "image/jpeg" });
}
