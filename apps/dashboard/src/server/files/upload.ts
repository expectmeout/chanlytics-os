/**
 * A member's photo on its way in (decision 0099). It goes straight from the browser to storage over an address signed here: a
 * function could not carry 25 MB, and nothing else needs to read it on the way. So what arrived is proven afterwards from its
 * first bytes, read here and never taken from the browser's word: an image of the kind it said, large enough to use. Only then
 * is there a file: nothing holds a name for a photo that never arrives. Keeping a proven upload is the service role's, so no
 * session can say what the bytes are.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import {
  AppError,
  FILE_LOOK_EDITION,
  FILE_PIXELS_MAX,
  FILE_SIDE_MIN,
  FILE_TYPES,
  FILE_WORDS as W,
  SECOND_MS,
  fileNameOf,
  filePathOf,
  recordOrNull,
  type FileMime,
} from "@chanlytics/contracts";
import { FINGERPRINT_BYTES, fileFingerprintOf } from "@chanlytics/channels";
import { imageHeaderOf } from "@chanlytics/core";
import { fileFound, fileStart } from "@chanlytics/db";
import { log } from "@/server/shared/log";
import type { Member } from "@/server/shared/route";
import { serviceDb } from "@/server/shared/service-db";
import type { RouteContext } from "@/server/shared/with-route";
import { bucket, doorRefusal } from "./file";

/** How long the address of an upload's first bytes is good for, and how long reading them may take. */
const HEAD_LINK_S = 60;
const HEAD_READ_MS = 15 * SECOND_MS;
/** How wide a copy is asked for where the head can't say, and how long Storage's decoder is given, inside a browser's patience. */
const DECODE_WIDTH = 320;
const DECODE_READ_MS = 10 * SECOND_MS;

/** POST files/start: the door's word, and where the browser sends the bytes. There is no file yet. */
export async function startUpload(
  ctx: RouteContext,
  member: Member,
  input: { mime: FileMime },
): Promise<{ id: string; upload_url: string }> {
  const id = randomUUID();
  const started = await fileStart(ctx.supabase, member.tenantId, id);
  if (started.error) throw doorRefusal(started.error);
  const signed = await bucket().createSignedUploadUrl(filePathOf(member.tenantId, id, input.mime));
  if (signed.error || !signed.data) {
    log.error("file_upload_sign_failed", { tenant_id: member.tenantId, error: signed.error?.message ?? "no address" });
    throw new AppError("internal", W.notSaved, 503);
  }
  return { id, upload_url: signed.data.signedUrl };
}

/** Its first bytes and its whole size, or null where nothing arrived. */
async function firstBytesOf(path: string): Promise<{ head: Uint8Array; size: number } | null> {
  const link = await bucket().createSignedUrl(path, HEAD_LINK_S);
  if (link.error || !link.data) return null;
  const res = await fetch(link.data.signedUrl, {
    headers: { range: `bytes=0-${FINGERPRINT_BYTES - 1}` },
    signal: AbortSignal.timeout(HEAD_READ_MS),
  });
  if (!res.ok) return null;
  const head = new Uint8Array(await res.arrayBuffer());
  const whole = /\/(\d+)$/.exec(res.headers.get("content-range") ?? "")?.[1];
  return { head, size: whole ? Number(whole) : head.length };
}

/**
 * Where the head can't say (a HEIC keeps its size deep inside it, a JPEG can carry more metadata than was read), Storage's own
 * decoder is asked for a small copy. Only its plain no refuses: Storage answers HTTP 400 for many things, and the true status
 * is in the body. Anything else, a timeout included, is no answer about the photo, so the file is kept and the look tries it.
 * A file Storage can't decode at all answers 500 in both places (real upload, 5 Nov 2026), the same as an outage, so it is
 * kept too: one tile that says its name, which its owner can delete, against refusing every HEIC while Storage is down.
 */
async function decoderRefuses(path: string, tenantId: string, mime: FileMime, size: number): Promise<boolean> {
  const say = (status: string) => log.info("file_decoder_answered", { tenant_id: tenantId, status, mime, bytes: size });
  const link = await bucket().createSignedUrl(path, HEAD_LINK_S, {
    transform: { width: DECODE_WIDTH, resize: "contain" },
  });
  if (link.error || !link.data) {
    say("not signed");
    return false;
  }
  try {
    const res = await fetch(link.data.signedUrl, {
      headers: { accept: "image/webp" },
      signal: AbortSignal.timeout(DECODE_READ_MS),
    });
    if (res.ok) {
      await res.body?.cancel();
      say("ok");
      return false;
    }
    const inBody = recordOrNull(await res.json().catch(() => null))?.statusCode;
    say(`${res.status}/${String(inBody)}`);
    return inBody === "400";
  } catch {
    say("no answer");
    return false;
  }
}

/** The file by its own first bytes: its size where it says it, or the words that refuse it. */
async function provenImage(
  read: { head: Uint8Array; size: number },
  path: string,
  tenantId: string,
  mime: FileMime,
): Promise<{ width: number | null; height: number | null } | { refused: string }> {
  const seen = imageHeaderOf(read.head);
  if (!seen) {
    return (await decoderRefuses(path, tenantId, mime, read.size))
      ? { refused: W.unreadable }
      : { width: null, height: null };
  }
  if (seen.kind !== FILE_TYPES[mime]) return { refused: W.wrongType };
  if (Math.min(seen.width, seen.height) < FILE_SIDE_MIN) return { refused: W.tooSmall };
  if (seen.width * seen.height > FILE_PIXELS_MAX) return { refused: W.tooManyPixels };
  return { width: seen.width, height: seen.height };
}

/**
 * POST files/[id]/done: the bytes proven, and a file made of them, or answered with the one it twins. Asked twice, it answers
 * the same. It never deletes bytes: a lost answer asked again must still find them, and the purge file_start left on the
 * ledger empties a folder that never became a file.
 */
export async function finishUpload(
  ctx: RouteContext,
  member: Member,
  id: string,
  input: { name: string; mime: FileMime },
): Promise<{ file_id: string; twin: boolean }> {
  const path = filePathOf(member.tenantId, id, input.mime);
  const read = await firstBytesOf(path);
  if (!read) throw new AppError("validation", W.notSaved);
  const proven = await provenImage(read, path, member.tenantId, input.mime);
  if ("refused" in proven) throw new AppError("validation", proven.refused);
  const answered = await fileFound(serviceDb(), {
    tenantId: member.tenantId,
    id,
    status: "filed",
    source: "upload",
    sourceRef: null,
    name: fileNameOf(input.name) || "photo",
    mime: input.mime,
    bytes: read.size,
    fingerprint: fileFingerprintOf(read.head, read.size),
    width: proven.width,
    height: proven.height,
    shows: null,
    edition: FILE_LOOK_EDITION,
    actor: ctx.userId,
  });
  if (answered.fate === "full") throw new AppError("validation", W.full);
  return { file_id: answered.file_id ?? id, twin: answered.fate === "here" };
}
