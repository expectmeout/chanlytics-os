import "server-only";
import {
  AppError,
  FILES_MAX,
  FILES_PAGE,
  FILE_LOOK_SCHEMA,
  FILE_WORDS as W,
  fileCursorOf,
  fileNameOf,
  filesTallyOf,
  recordOrNull,
  shelfFilterOf,
  type FileDto,
  type FileKind,
  type FilePeople,
  type FileShelf,
  type FilesPageDto,
  UUID,
} from "@chanlytics/contracts";
import type { FileForAsk } from "@/server/files/line";
import {
  listFilesByName,
  listFilesFound,
  listFilesOnShelf,
  listFilesTallied,
  type FileMemberRow,
} from "@chanlytics/db/files";
import { load, readerStamp, type Reader } from "../shared/reader";

/** Who the look counted, as the row keeps it; null until it has, or where it could not say. */
function filePeopleOf(raw: unknown): FilePeople | null {
  const p = recordOrNull(raw);
  return typeof p?.count === "number" && typeof p.recognizable === "number"
    ? { count: p.count, recognizable: p.recognizable }
    : null;
}

/** The kinds of picture a look answers in, as its own schema lists them (contracts files/look.ts, edition 2). */
const LOOKS_LIKE = FILE_LOOK_SCHEMA.properties.looks_like.enum;

/** A row as the page and Ask read it: never where it is stored, and of its look only what a person reads. */
export function fileDtoOf(fileMember: FileMemberRow): FileDto {
  const look = recordOrNull(fileMember.look);
  return {
    id: fileMember.id,
    kind: fileMember.kind,
    status: fileMember.status,
    source: fileMember.source,
    name: fileMember.name,
    bytes: fileMember.bytes,
    width: fileMember.width,
    height: fileMember.height,
    seconds: fileMember.seconds,
    media_status: fileMember.media_status,
    sound_said: fileMember.sound_said,
    shows: fileMember.shows,
    who_in_it: fileMember.who_in_it,
    people: filePeopleOf(look?.people),
    look_status: fileMember.look_status,
    line: typeof look?.line === "string" ? look.line : null,
    issues: Array.isArray(look?.issues) ? look.issues.filter((i): i is string => typeof i === "string") : [],
    looks_like_stock: look?.looks_like_stock === true,
    looks_like: LOOKS_LIKE.find((kind) => kind === look?.looks_like) ?? null,
    created_at: fileMember.created_at,
  };
}

const lookWordsOf = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((w): w is string => typeof w === "string") : [];
const qualityWord = (raw: unknown): FileForAsk["quality"]["sharp"] =>
  raw === "good" || raw === "ok" || raw === "poor" ? raw : null;

/** The moments a video's look kept (contracts fileVideoLookOf wrote them): each a time and its words, or none. */
const lookMomentsOf = (raw: unknown): FileForAsk["moments"] =>
  Array.isArray(raw)
    ? raw.flatMap((m) => {
        const moment = recordOrNull(m);
        return typeof moment?.at === "number" && typeof moment.what === "string"
          ? [{ at: moment.at, what: moment.what }]
          : [];
      })
    : [];

/** A row as Ask reads it: what the page does, and the rest of what the look saw. */
function fileForAskOf(fileMember: FileMemberRow): FileForAsk {
  const look = recordOrNull(fileMember.look);
  const quality = recordOrNull(look?.quality);
  const subject = Array.isArray(look?.subject) && look.subject.length === 4 ? look.subject : null;
  return {
    ...fileDtoOf(fileMember),
    text_seen: lookWordsOf(look?.text_seen),
    quality: { sharp: qualityWord(quality?.sharp), light: qualityWord(quality?.light) },
    colors: lookWordsOf(look?.colors),
    subject: subject as FileForAsk["subject"],
    use: typeof look?.use === "string" && look.use ? look.use : null,
    stands_at: typeof look?.poster_at === "number" ? look.poster_at : null,
    moments: lookMomentsOf(look?.moments),
  };
}

/**
 * The files Ask names, by the name it and the owner both say (cleaned as a name is) or by the row's id, which a turn's scope names
 * its file by: those rows alone, so a question about one file reads one.
 */
export const filesNamedForAsk: Reader<{ names: readonly string[] }, { files: FileForAsk[] }> = {
  name: "filesNamedForAsk",
  async read(rc, request) {
    const rows = await listFilesByName(rc.ctx.supabase, rc.tenantId, {
      names: request.names.map((n) => fileNameOf(n)),
      ids: request.names,
    });
    return { data: { files: rows.map(fileForAskOf) }, rows: [], stamp: readerStamp() };
  },
};

/**
 * A page of one shelf as Ask lists it, newest first, found by its words where it gives them (00612 files_found: what a file is
 * named, what its look saw, how a video sounds and what is said in it), and how many stand there in all.
 */
export const filesFoundForAsk: Reader<
  { shelf: FileShelf; about?: string | undefined; offset: number; limit: number },
  { files: FileForAsk[]; total: number }
> = {
  name: "filesFoundForAsk",
  async read(rc, request) {
    const { rows, total } = await listFilesFound(rc.ctx.supabase, rc.tenantId, shelfFilterOf(request.shelf), {
      words: request.about,
      offset: request.offset,
      limit: request.limit,
    });
    return { data: { files: rows.map(fileForAskOf), total }, rows: [], stamp: readerStamp() };
  },
};

/** What each file says of itself and no more: what Ask's line and a page's tally count, on every turn and every page. */
export const filesTallied: Reader<
  undefined,
  { files: Pick<FileDto, "status" | "shows" | "source" | "look_status" | "created_at" | "kind">[] }
> = {
  name: "filesTallied",
  async read(rc) {
    const rows = await listFilesTallied(rc.ctx.supabase, rc.tenantId);
    // The read selects these six columns and no more, each typed as the file's own: the rows are the answer.
    return { data: { files: rows }, rows: [], stamp: readerStamp() };
  },
};

/** What a page of the library is asked for. Nothing asked is where it opens, at a page's length. */
interface FilesAsked {
  shelf?: FileShelf | undefined;
  kind?: FileKind | undefined;
  about?: string | undefined;
  limit?: number | undefined;
  before?: string | undefined;
}

/** A place in a shelf's order, as fileCursorOf said it, or a refusal: a cursor this route did not give reads nothing. */
export function cursorAsked(before: string | undefined): { at: string; id: string } | null {
  if (before === undefined) return null;
  const [at = "", id = "", ...rest] = before.split("|");
  if (rest.length || Number.isNaN(Date.parse(at)) || !UUID.test(id)) throw new AppError("validation", W.failedRead);
  return { at, id };
}

/**
 * GET files, as the route answers it: a page of one shelf, newest first, and how the whole library stands. A shelf a change left empty
 * falls back to where the library opens, as a first visit does. The Inbox comes whole: its one press covers all of it, and it empties.
 */
export const files: Reader<FilesAsked, FilesPageDto> = {
  name: "files",
  async read(rc, request) {
    const before = cursorAsked(request.before);
    const { files: all } = (await load(rc, filesTallied, undefined)).data;
    const tally = filesTallyOf(all);
    const holds = request.shelf === "all" || (request.shelf && tally.shelves[request.shelf]);
    // The Library opens on all it keeps: what waits for a yes is a line over it, never where it opens (Ruben, 12 Nov 2026).
    const shelf = holds && request.shelf ? request.shelf : "all";
    const kind = request.kind ?? null;
    const about = request.about?.trim() || null;
    if (about) {
      // Found by its words, a page of the best: what the look saw, what is written on it, what a video says (00612).
      const found = await listFilesFound(rc.ctx.supabase, rc.tenantId, shelfFilterOf(shelf), {
        words: about,
        offset: 0,
        limit: FILES_PAGE,
      });
      const files = found.rows.filter((r) => !kind || r.kind === kind).map(fileDtoOf);
      return { data: { files, shelf, kind, about, next: null, tally }, rows: [], stamp: readerStamp() };
    }
    const limit = shelf === "inbox" ? FILES_MAX : Math.min(request.limit ?? FILES_PAGE, FILES_MAX);
    // One past the page, so its last page says it is its last with no second read.
    const rows = await listFilesOnShelf(
      rc.ctx.supabase,
      rc.tenantId,
      { ...shelfFilterOf(shelf), ...(kind ? { kind } : {}) },
      {
        limit: limit + 1,
        before,
      },
    );
    const page = rows.slice(0, limit).map(fileDtoOf);
    const last = page.at(-1);
    return {
      data: {
        files: page,
        shelf,
        kind,
        about: null,
        next: rows.length > limit && last ? fileCursorOf(last) : null,
        tally,
      },
      rows: [],
      stamp: readerStamp(),
    };
  },
};
