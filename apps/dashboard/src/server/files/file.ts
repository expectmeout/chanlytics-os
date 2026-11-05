/**
 * A business's files, what a member does to one already there (decision 0099). Every write goes through a door on the member's
 * own session, which asks the settings permission itself. The service role here only signs addresses.
 */
import "server-only";
import {
  AppError,
  DAY_MS,
  FILE_TYPES,
  FILE_WORDS as W,
  SECOND_MS,
  WEEK_MS,
  fileNameOf,
  filePathOf,
  type FileMime,
  type FileShows,
} from "@chanlytics/contracts";
import { fileChange, fileKeepMany, fileOf, fileRemove, filesBucket, type FileMemberRow } from "@chanlytics/db";
import { log } from "@/server/log";
import { requireUuid } from "@/server/request-guards";
import { row, type Member } from "@/server/route";
import { serviceDb } from "@/server/service-db";
import type { RouteContext } from "@/server/with-route";

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
export function doorRefusal(error: { code?: string; message: string }): AppError {
  if (error.code === "42501") return new AppError("forbidden", error.message, 403);
  if (error.code === "22023") return new AppError("validation", error.message);
  if (error.code === "P0002") return new AppError("not_found", error.message, 404);
  log.error("db_failed", { code: error.code ?? null, error: error.message });
  return new AppError("internal", W.notSaved, 500);
}

export const bucket = () => filesBucket(serviceDb());

/** A file the caller may see (RLS), or a 404. */
export const fileScope = row(async (ctx: RouteContext, params): Promise<FileMemberRow> => {
  const found = await fileOf(ctx.supabase, requireUuid(params.id, "file"));
  if (!found) throw new AppError("not_found", W.gone, 404);
  return found;
});

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
