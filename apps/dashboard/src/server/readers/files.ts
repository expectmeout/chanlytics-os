import "server-only";
import {
  AppError,
  FILES_MAX,
  FILES_PAGE,
  FILE_WORDS as W,
  ROLE_PERMS,
  fileCursorOf,
  fileShelfOpening,
  filesTallyOf,
  recordOrNull,
  shelfFilterOf,
  type FileDto,
  type FileForAsk,
  type FilePeople,
  type FileShelf,
  type FilesPageDto,
} from "@chanlytics/contracts";
import { filesOf, filesOnShelfOf, filesTalliedOf, type FileMemberRow } from "@chanlytics/db";
import { load, stamp, type Reader } from "./index";

/** Who the look counted, as the row keeps it; null until it has, or where it could not say. */
function filePeopleOf(raw: unknown): FilePeople | null {
  const p = recordOrNull(raw);
  return typeof p?.count === "number" && typeof p.recognizable === "number"
    ? { count: p.count, recognizable: p.recognizable }
    : null;
}

/** A row as the page and Ask read it: never where it is stored, and of its look only what a person reads. */
export function fileDtoOf(r: FileMemberRow): FileDto {
  const look = recordOrNull(r.look);
  return {
    id: r.id,
    status: r.status as FileDto["status"],
    source: r.source as FileDto["source"],
    name: r.name,
    bytes: r.bytes,
    width: r.width,
    height: r.height,
    shows: r.shows as FileDto["shows"],
    who_in_it: r.who_in_it as FileDto["who_in_it"],
    people: filePeopleOf(look?.people),
    look_status: r.look_status as FileDto["look_status"],
    line: typeof look?.line === "string" ? look.line : null,
    issues: Array.isArray(look?.issues) ? look.issues.filter((i): i is string => typeof i === "string") : [],
    looks_like_stock: look?.looks_like_stock === true,
    created_at: r.created_at,
  };
}

const lookWordsOf = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((w): w is string => typeof w === "string") : [];
const qualityWord = (raw: unknown): FileForAsk["quality"]["sharp"] =>
  raw === "good" || raw === "ok" || raw === "poor" ? raw : null;

/** A row as Ask reads it: what the page does, and the rest of what the look saw. */
function fileForAskOf(r: FileMemberRow): FileForAsk {
  const look = recordOrNull(r.look);
  const quality = recordOrNull(look?.quality);
  const subject = Array.isArray(look?.subject) && look.subject.length === 4 ? look.subject : null;
  return {
    ...fileDtoOf(r),
    text_seen: lookWordsOf(look?.text_seen),
    quality: { sharp: qualityWord(quality?.sharp), light: qualityWord(quality?.light) },
    colors: lookWordsOf(look?.colors),
    subject: subject as FileForAsk["subject"],
  };
}

/** What Ask reads of the workspace's files, its line in the facts and its catalog alike. */
export const filesForAsk: Reader<undefined, { files: FileForAsk[] }> = {
  name: "filesForAsk",
  async read(rc) {
    const rows = await filesOf(rc.ctx.supabase, rc.tenantId);
    return { data: { files: rows.map(fileForAskOf) }, rows: [], stamp: stamp() };
  },
};

/** What each file says of itself and no more: what Ask's line and a page's tally count, on every turn and every page. */
export const filesTallied: Reader<
  undefined,
  { files: Pick<FileDto, "status" | "shows" | "source" | "look_status" | "created_at">[] }
> = {
  name: "filesTallied",
  async read(rc) {
    const rows = await filesTalliedOf(rc.ctx.supabase, rc.tenantId);
    return {
      data: {
        files: rows.map((r) => ({
          status: r.status as FileDto["status"],
          shows: r.shows as FileDto["shows"],
          source: r.source as FileDto["source"],
          look_status: r.look_status as FileDto["look_status"],
          created_at: r.created_at,
        })),
      },
      rows: [],
      stamp: stamp(),
    };
  },
};

/** What a page of the library is asked for. Nothing asked is where it opens, at a page's length. */
interface FilesAsked {
  shelf?: FileShelf | undefined;
  limit?: number | undefined;
  before?: string | undefined;
}

/** A place in a shelf's order, as fileCursorOf said it, or a refusal: a cursor this route did not give reads nothing. */
function cursorAsked(before: string | undefined): { at: string; id: string } | null {
  if (before === undefined) return null;
  const [at = "", id = "", ...rest] = before.split("|");
  if (rest.length || Number.isNaN(Date.parse(at)) || !/^[0-9a-f-]{36}$/i.test(id))
    throw new AppError("validation", W.failedRead);
  return { at, id };
}

/**
 * GET files, as the route answers it: a page of one shelf, newest first, and how the whole library stands. A shelf a change left empty
 * falls back to where the library opens, as a first visit does. The Inbox comes whole: its one press covers all of it, and it empties.
 */
export const files: Reader<FilesAsked, FilesPageDto> = {
  name: "files",
  async read(rc, asked) {
    const before = cursorAsked(asked.before);
    const { files: all } = (await load(rc, filesTallied, undefined)).data;
    const tally = filesTallyOf(all);
    const holds = asked.shelf === "all" || (asked.shelf && tally.shelves[asked.shelf]);
    const shelf = holds && asked.shelf ? asked.shelf : fileShelfOpening(tally, !!ROLE_PERMS[rc.role]?.settings);
    const limit = shelf === "inbox" ? FILES_MAX : Math.min(asked.limit ?? FILES_PAGE, FILES_MAX);
    // One past the page, so its last page says it is its last with no second read.
    const rows = await filesOnShelfOf(rc.ctx.supabase, rc.tenantId, shelfFilterOf(shelf), {
      limit: limit + 1,
      before,
    });
    const page = rows.slice(0, limit).map(fileDtoOf);
    const last = page.at(-1);
    return {
      data: { files: page, shelf, next: rows.length > limit && last ? fileCursorOf(last) : null, tally },
      rows: [],
      stamp: stamp(),
    };
  },
};
