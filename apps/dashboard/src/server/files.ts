/**
 * A business's files, a member's side (decision 0099). A member's own photo goes straight from the browser to storage over
 * an address signed here: a function could not carry 25 MB, and nothing else needs to read it on the way. So what arrived
 * is proven afterwards from its first bytes, read here and never taken from the browser's word: an image of the kind it
 * said, large enough to use. Only then is there a file: nothing holds a name for a photo that never arrives. Every write goes
 * through a door on the member's own session, which asks the settings permission itself, but one: keeping a proven upload is
 * the service role's, so no session can say what the bytes are. The service role otherwise only signs addresses.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import {
  AppError,
  DAY_MS,
  FILE_LOOK_EDITION,
  FILE_PIXELS_MAX,
  FILE_SIDE_MIN,
  FILE_TYPES,
  FILE_WORDS as W,
  SECOND_MS,
  WEEK_MS,
  fileNameOf,
  filePathOf,
  recordOrNull,
  type FileMime,
  type FileShows,
} from "@chanlytics/contracts";
import { FINGERPRINT_BYTES, fileFingerprintOf } from "@chanlytics/channels";
import { imageHeaderOf } from "@chanlytics/core";
import {
  fileChange,
  fileFound,
  fileKeepMany,
  fileOf,
  fileRemove,
  fileStart,
  filesBucket,
  type FileMemberRow,
} from "@chanlytics/db";
import { log } from "@/server/log";
import { requireUuid } from "@/server/request-guards";
import { row, type Member } from "@/server/route";
import { serviceDb } from "@/server/service-db";
import type { RouteContext } from "@/server/with-route";

/** How long the address of an upload's first bytes is good for, and how long reading them may take. */
const HEAD_LINK_S = 60;
const HEAD_READ_MS = 15 * SECOND_MS;
/** How wide a copy is asked for where the head can't say, and how long Storage's decoder is given, inside a browser's patience. */
const DECODE_WIDTH = 320;
const DECODE_READ_MS = 10 * SECOND_MS;
/**
 * How long a picture's address lasts, and a little less for how long a browser keeps being sent to it. Storage's CDN keeps a
 * copy per signed address, so a fresh address each hour would be a fresh resize for every picture on every device. It costs
 * that a link outlives a removed member by up to a week; deleting the file ends it for everyone within a minute.
 */
const VIEW_LINK_S = WEEK_MS / SECOND_MS;
const VIEW_KEEP_S = (6 * DAY_MS) / SECOND_MS;
/** The widths a picture is drawn at, so one picture is resized a few times and never once per asker. */
const VIEW_WIDTHS = [480, 1280] as const;
const VIEW_WIDEST = 2000;

/** The door's refusal, in its own words; anything else is ours to say. */
function doorRefusal(error: { code?: string; message: string }): AppError {
  if (error.code === "42501") return new AppError("forbidden", error.message, 403);
  if (error.code === "22023") return new AppError("validation", error.message);
  if (error.code === "P0002") return new AppError("not_found", error.message, 404);
  log.error("db_failed", { code: error.code ?? null, error: error.message });
  return new AppError("internal", W.notSaved, 500);
}

const bucket = () => filesBucket(serviceDb());

/** A file the caller may see (RLS), or a 404. */
export const fileScope = row(async (ctx: RouteContext, params): Promise<FileMemberRow> => {
  const found = await fileOf(ctx.supabase, requireUuid(params.id, "file"));
  if (!found) throw new AppError("not_found", W.gone, 404);
  return found;
});

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
async function headOf(path: string): Promise<{ head: Uint8Array; size: number } | null> {
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
 * is in the body, where "400" is a source it could not read. Anything else, a timeout included, is no answer about the
 * photo, so the file is kept and the look tries it. What it said is logged: the first real upload is what proves this.
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
  const read = await headOf(path);
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

/** PATCH files/[id]: what a person says of it. */
export async function changeFile(
  ctx: RouteContext,
  member: Member,
  file: FileMemberRow,
  input: {
    name?: string | undefined;
    shows?: FileShows | undefined;
    who_in_it?: "no_one" | "agreed" | undefined;
    status?: "filed" | "set_aside" | undefined;
  },
): Promise<{ ok: true }> {
  const name = input.name === undefined ? undefined : fileNameOf(input.name);
  if (name === "") throw new AppError("validation", W.nameEmpty);
  const { error } = await fileChange(ctx.supabase, {
    tenantId: member.tenantId,
    id: file.id,
    name,
    shows: input.shows,
    whoInIt: input.who_in_it,
    status: input.status,
  });
  if (error) throw doorRefusal(error);
  return { ok: true };
}

/** POST files/keep: the Inbox's one press. Answers how many moved. */
export async function keepFiles(
  ctx: RouteContext,
  member: Member,
  input: { ids: string[] },
): Promise<{ kept: number }> {
  const { data, error } = await fileKeepMany(ctx.supabase, member.tenantId, input.ids);
  if (error) throw doorRefusal(error);
  return { kept: typeof data === "number" ? data : 0 };
}

/** DELETE files/[id]: hidden now, its bytes gone by the job. */
export async function removeFile(ctx: RouteContext, member: Member, file: FileMemberRow): Promise<{ ok: true }> {
  const { error } = await fileRemove(ctx.supabase, member.tenantId, file.id);
  if (error) throw doorRefusal(error);
  return { ok: true };
}

/** The nearest width we draw at, for what a page asked. */
function widthOf(asked: string | null): number {
  const n = Number(asked);
  return VIEW_WIDTHS.find((w) => w >= n) ?? VIEW_WIDEST;
}

/**
 * GET files/[id]/view: a redirect to the picture, kept by the browser for most of the address's life, so a page of them paints
 * from disk and not from a page of requests. `w` is a resized copy; `download` the original, under its name. A HEIC is drawn
 * only as a copy, since a browser cannot read one.
 */
export async function viewFile(file: FileMemberRow, url: URL): Promise<Response> {
  const download = url.searchParams.has("download");
  const asked = url.searchParams.get("w");
  const mime = file.mime as FileMime;
  const opts = download
    ? { download: `${file.name}.${FILE_TYPES[mime]}` }
    : asked !== null || FILE_TYPES[mime] === "heic"
      ? { transform: { width: widthOf(asked), resize: "contain" as const } }
      : {};
  const link = await bucket().createSignedUrl(filePathOf(file.tenant_id, file.id, mime), VIEW_LINK_S, opts);
  if (link.error || !link.data) {
    log.error("file_view_sign_failed", { tenant_id: file.tenant_id, error: link.error?.message ?? "no address" });
    throw new AppError("internal", W.failedRead, 503);
  }
  // A picture's bytes never change, but a download's name does: that redirect is asked for afresh each time.
  const keep = download ? "private, no-store" : `private, max-age=${VIEW_KEEP_S}`;
  return new Response(null, { status: 302, headers: { location: link.data.signedUrl, "cache-control": keep } });
}
