/**
 * A view's leads as one file, of any size (decision 0103). The route answers a chunk of it and where the next begins
 * (server/leads/export.ts); this asks until none is left and joins them, so the page saves one file. A press that POSTs,
 * not a link: marking what a chunk took moves the month's count (§0.2, decision 0047, lane 6). Apart from surface.ts, which
 * stands at its file limit. The file keeps the view's own order, so a lead that moves in that order while a large file is
 * walked may land twice or not at all; the walk lasts seconds.
 */
import type { ApiResult } from "@/client/api";
import { leadCall } from "./surface";
import type { LeadsExportView } from "./surface-types";
import { readDir } from "./view-query";

/** The place a read got to, as the chunk before answered it. */
type Cursor = { key: string; id: string };

/** What the route answers for one chunk; how many the view keeps (`matching`) rides the first alone. */
interface LeadsExportChunk {
  file: string;
  csv: string;
  rows: number;
  next: Cursor | null;
  matching?: number;
}

/** The file: its name and its text, the leads it holds, how many the view keeps, and whether it holds them all. */
interface LeadsExportWalk {
  file: string;
  csv: string;
  rows: number;
  of: number | null;
  whole: boolean;
}

/** How many times a later chunk is asked for before the file is saved without it. */
const CHUNK_TRIES = 2;

/**
 * One chunk of a view's file. Nothing is read again behind it: a walk would read the page of Leads again for each, and every
 * chunk but the last has more to come. The page reads the leads again once, when the file is whole (page/acts.tsx).
 */
export function exportLeadsFile(
  view: LeadsExportView,
  after: Cursor | null = null,
): Promise<ApiResult<LeadsExportChunk>> {
  return leadCall<LeadsExportChunk>("POST leads/export", {
    body: { ...view, dir: readDir(view), ...(after ? { after_key: after.key, after_id: after.id } : {}) },
    refresh: false,
  });
}

/** A later chunk, asked for twice. One that fails twice, or whose cursor stands still (the walk would never end), is none. */
async function laterChunk(
  view: LeadsExportView,
  after: Cursor,
  fetchChunk: typeof exportLeadsFile,
): Promise<LeadsExportChunk | null> {
  for (let tried = 0; tried < CHUNK_TRIES; tried += 1) {
    const got = await fetchChunk(view, after);
    if (got.ok && (got.data.next?.key !== after.key || got.data.next?.id !== after.id)) return got.data;
  }
  return null;
}

/**
 * Every chunk of a view's file, joined, in the order they were read. A first chunk that fails is the failure, as it always
 * was; a later one that cannot be read ends the walk with what it holds, and the file says so (`whole: false`). `progress`
 * says how far it has come, after each chunk that has another behind it: a file of one chunk says nothing meanwhile.
 */
export async function walkLeadsExport(
  view: LeadsExportView,
  on: { progress: (done: number, of: number | null) => void },
  fetchChunk: typeof exportLeadsFile = exportLeadsFile,
): Promise<ApiResult<LeadsExportWalk>> {
  const first = await fetchChunk(view);
  if (!first.ok) return first;
  const of = first.data.matching ?? null;
  const parts = [first.data.csv];
  let rows = first.data.rows;
  let after = first.data.next;
  let whole = true;
  while (after) {
    on.progress(rows, of);
    const chunk = await laterChunk(view, after, fetchChunk);
    if (!chunk) {
      whole = false;
      break;
    }
    parts.push(chunk.csv);
    rows += chunk.rows;
    after = chunk.next;
  }
  return { ok: true, data: { file: first.data.file, csv: parts.join(""), rows, of, whole } };
}
