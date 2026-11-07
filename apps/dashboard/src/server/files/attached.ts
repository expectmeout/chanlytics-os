/**
 * The files a person's question came with (decision 0099, step 2). The thread keeps their ids and nothing else of them: a name
 * changes and a file goes, and what the turn and the history say is what the file says now. The pictures go in ahead of the
 * words, as Anthropic asks; a later turn's history carries the name and what the look saw, and Ask opens the file again if it
 * needs to.
 *
 * A video (stage B, D10) goes as its sheet, named a video of its length, with how its frames are laid out and what was heard of
 * its sound after it, as data; one still being prepared is named as such, and Ask says it will open it once it is.
 */
import "server-only";
import {
  ASK_ATTACHED_MAX,
  UUID,
  fileSoundOf,
  recordOrNull,
  videoSheetAfterOf,
  videoSheetWhatOf,
  type AskLanguage,
  type FileDto,
  type FileSound,
} from "@chanlytics/contracts";
import { listFilesNamedBy } from "@chanlytics/db/files";
import type { RouteContext } from "../shared/with-route";
import type { AskedPicture } from "../ask/tools/context/tool-defs";
import type { FileCopy } from "./copies";

/** A file as a question says it, as it is now: a video's length, where it stands, its frame's shape and what was heard besides. */
export type AttachedFile = Pick<FileDto, "id" | "name" | "line"> &
  Partial<Pick<FileDto, "kind" | "seconds" | "media_status" | "width" | "height">> & { sound?: FileSound };

/** The ids of the files a question came with, as the Line sends them, each once. Anything else is none: never a refused question. */
export function attachedIdsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((id): id is string => typeof id === "string" && UUID.test(id));
  return [...new Set(ids)].slice(0, ASK_ATTACHED_MAX);
}

/** The ids a question's row keeps, or none. */
export const fileIdsOf = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];

/** The files of these ids that are still there for the caller. */
export async function getAttached(
  ctx: RouteContext,
  tenantId: string,
  ids: readonly string[],
): Promise<ReadonlyMap<string, AttachedFile>> {
  const rows = await listFilesNamedBy(ctx.supabase, tenantId, ids);
  return new Map(
    rows.map((row) => {
      const line = recordOrNull(row.look)?.line;
      const file: AttachedFile = { id: row.id, name: row.name, line: typeof line === "string" ? line : null };
      if (row.kind !== "video") return [row.id, file];
      return [
        row.id,
        {
          ...file,
          kind: "video",
          seconds: row.seconds,
          media_status: row.media_status as FileDto["media_status"],
          width: row.width,
          height: row.height,
          sound: fileSoundOf(row.sound),
        },
      ];
    }),
  );
}

/** What the model reads for one video the question came with: its sheet and what was heard, or how it stands. */
function videoAttached(file: AttachedFile, copy: FileCopy | undefined): AskedPicture {
  const seconds = file.seconds ?? 0;
  if (file.media_status === "failed")
    return {
      said: `The file ${file.name}, a video, is attached to this question, but the video platform could not read it. Say so, and do not guess what it shows.`,
      fileId: null,
    };
  if (file.media_status !== "ready" || !copy)
    return {
      said: `The file ${file.name}, a video, is attached to this question and is still being prepared: its frames and its sound are not in yet. Say so, do not guess what it shows, and say you will look once it is ready.`,
      fileId: null,
    };
  const size = copy.width && copy.height ? ` (${copy.width}×${copy.height})` : "";
  return {
    said: `${videoSheetWhatOf(file.name, seconds)}${size}, attached to this question:`,
    fileId: copy.fileId,
    after: videoSheetAfterOf({
      seconds,
      width: file.width ?? null,
      height: file.height ?? null,
      sound: file.sound ?? {},
    }),
  };
}

/** What the model reads for each file the question came with: its name and the picture, or that the picture could not be had. */
export const attachedPictures = (
  files: readonly AttachedFile[],
  copies: ReadonlyMap<string, FileCopy>,
): AskedPicture[] =>
  files.map((file) => {
    const copy = copies.get(file.id);
    if (file.kind === "video") return videoAttached(file, copy);
    const fileId = copy?.fileId ?? null;
    const size = copy?.width && copy.height ? ` (${copy.width}×${copy.height})` : "";
    return {
      said: fileId
        ? `The file ${file.name}${size}, attached to this question:`
        : `The file ${file.name} is attached to this question, but could not be opened. Say so, and do not guess what it shows.`,
      fileId,
    };
  });

/** The words for a question that came with files and none of its own, so the model is asked something, in the person's language. */
export const noWordsIn = (language: AskLanguage): string =>
  language === "es" ? "(Sin palabras, solo el archivo adjunto.)" : "(No words, only the attached file.)";
