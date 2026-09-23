import "server-only";
import { AppError } from "@chanlytics/contracts";
import type { SavedListRow } from "@chanlytics/db";

/**
 * Saved lists: what the routes agree on. The tables are read and written in packages/db lists.ts.
 *
 * A list is a name and the people on it. The name is the only thing a person
 * types; the members are ids the page already holds. Both guards live here
 * so the create route and the edit route refuse the same things in the same
 * words.
 */
/** A list with every id on it, as packages/db lists.ts reads it. */
export type SavedListDto = SavedListRow;

export const LIST_NAME_MAX = 60;
export const LIST_BATCH_MAX = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cleanListName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > LIST_NAME_MAX) {
    throw new AppError("validation", `A list needs a name of up to ${LIST_NAME_MAX} characters.`);
  }
  return name;
}

/** An optional array of contact ids: absent is empty; anything else must be uuids, deduplicated, bounded. */
export function cleanIdList(raw: unknown, what: string): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string" || !UUID.test(x))) {
    throw new AppError("validation", `${what} must be a list of contact ids.`);
  }
  const ids = Array.from(new Set(raw as string[]));
  if (ids.length > LIST_BATCH_MAX) throw new AppError("validation", `At most ${LIST_BATCH_MAX} people at a time.`);
  return ids;
}
