/**
 * The files a person's question came with (decision 0099, step 2). The thread keeps their ids and nothing else of them: a name
 * changes and a file goes, and what the turn and the history say is what the file says now. The pictures go in ahead of the
 * words, as Anthropic asks; a later turn's history carries the name and what the look saw, and Ask opens the file again if it
 * needs to.
 */
import "server-only";
import { ASK_ATTACHED_MAX, UUID, recordOrNull, type AskLanguage, type FileDto } from "@chanlytics/contracts";
import { filesNamedBy } from "@chanlytics/db";
import type { RouteContext } from "../with-route";
import type { AskedPicture } from "../ask/tools/context";

/** A file as a question says it, as it is now. */
export type AttachedFile = Pick<FileDto, "id" | "name" | "line">;

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
export async function attachedNow(
  ctx: RouteContext,
  tenantId: string,
  ids: readonly string[],
): Promise<ReadonlyMap<string, AttachedFile>> {
  const rows = await filesNamedBy(ctx.supabase, tenantId, ids);
  return new Map(
    rows.map((r) => {
      const line = recordOrNull(r.look)?.line;
      return [r.id, { id: r.id, name: r.name, line: typeof line === "string" ? line : null }];
    }),
  );
}

/** What the model reads for each file the question came with: its name and the picture, or that the picture could not be had. */
export const attachedPictures = (files: readonly AttachedFile[], copies: ReadonlyMap<string, string>): AskedPicture[] =>
  files.map((f) => {
    const fileId = copies.get(f.id) ?? null;
    return {
      said: fileId
        ? `The file ${f.name}, attached to this question:`
        : `The file ${f.name} is attached to this question, but could not be opened. Say so, and do not guess what it shows.`,
      fileId,
    };
  });

/** The words for a question that came with files and none of its own, so the model is asked something, in the person's language. */
export const noWordsIn = (language: AskLanguage): string =>
  language === "es" ? "(Sin palabras, solo el archivo adjunto.)" : "(No words, only the attached file.)";
