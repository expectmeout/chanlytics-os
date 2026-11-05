import "server-only";
import { recordOrNull, type FileDto, type FilePeople, type FilesPageDto } from "@chanlytics/contracts";
import { filesOf, type FileMemberRow } from "@chanlytics/db";
import { stamp, type Reader } from "./index";

/** Who the look counted, as the row keeps it; null until it has, or where it could not say. */
function peopleOf(raw: unknown): FilePeople | null {
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
    people: peopleOf(look?.people),
    look_status: r.look_status as FileDto["look_status"],
    line: typeof look?.line === "string" ? look.line : null,
    issues: Array.isArray(look?.issues) ? look.issues.filter((i): i is string => typeof i === "string") : [],
    looks_like_stock: look?.looks_like_stock === true,
    created_at: r.created_at,
  };
}

/** GET files, as the route answers it: what the workspace keeps, newest first. */
export const files: Reader<undefined, FilesPageDto> = {
  name: "files",
  async read(rc) {
    const rows = await filesOf(rc.ctx.supabase, rc.tenantId);
    return {
      data: { files: rows.map(fileDtoOf) },
      rows: [],
      stamp: stamp(),
    };
  },
};
