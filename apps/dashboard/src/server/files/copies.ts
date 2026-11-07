/**
 * The copies Ask reads pictures by (decision 0099, step 2). The edge holds the model's key, so it makes them
 * (apps/edge/lib/files/copies.ts); here is only asking, and it never fails a turn: a picture that can't be had is said in words.
 * A copy comes with its size, the pixels the model will see, so a box can be named in them. A picture made for one turn (a
 * zoom, a post drawn for a look) goes up as its bytes and is held a day.
 */
import "server-only";
import { SECOND_MS, recordOrNull, type FileMime } from "@chanlytics/contracts";
import { callEdge, edgeConfigured } from "@/server/shared/edge";
import { log } from "@/server/shared/log";

/** How long the edge has for a few copies: a resize and an upload each, where the look's copy has run out. */
const COPIES_MS = 25 * SECOND_MS;

/** A copy as a request sends it: the id only the edge made, and the size the model sees, where the edge could say. */
export interface FileCopy {
  fileId: string;
  width: number | null;
  height: number | null;
}

/** A picture made for this turn, as the edge takes it. */
export interface PictureMade {
  bytes: Uint8Array;
  mime: FileMime;
  name: string;
}

interface Who {
  tenantId: string;
  userId: string | null;
}

/** One knock on the edge's door, with what it answered as a record, or null where it did not answer. */
async function copiesDoor(
  who: Who,
  body: Record<string, unknown>,
  leftMs: number,
): Promise<Record<string, unknown> | null> {
  if (!edgeConfigured()) return null;
  const answer = await callEdge(
    "/api/admin/files/copies",
    { tenant_id: who.tenantId, ...body },
    { workspace: who.tenantId, user: who.userId, timeoutMs: Math.min(COPIES_MS, Math.max(SECOND_MS, leftMs)) },
  );
  const said = recordOrNull(answer.body);
  if (answer.status !== 200 || !said) {
    log.warn("ask_file_copies_failed", {
      tenant_id: who.tenantId,
      status: answer.status,
      ...(typeof said?.detail === "string" ? { detail: said.detail.slice(0, 200) } : {}),
    });
    return null;
  }
  return said;
}

const sizeOf = (row: Record<string, unknown>) => ({
  width: typeof row.width === "number" ? row.width : null,
  height: typeof row.height === "number" ? row.height : null,
});

/** What a request sends a picture by, by the file it is of. A file left out has no copy to send. */
export async function fileCopiesOf(
  who: Who,
  ids: readonly string[],
  leftMs: number = COPIES_MS,
): Promise<ReadonlyMap<string, FileCopy>> {
  const out = new Map<string, FileCopy>();
  if (ids.length === 0) return out;
  const said = await copiesDoor(who, { ids }, leftMs);
  const copies = said?.copies;
  if (!Array.isArray(copies)) return out;
  for (const c of copies) {
    const row = recordOrNull(c);
    if (typeof row?.id === "string" && typeof row.file_id === "string")
      out.set(row.id, { fileId: row.file_id, ...sizeOf(row) });
  }
  return out;
}

/** A picture made here, held at Anthropic for a day, or null where it could not be: said in words then, never a failed turn. */
export async function pictureCopyOf(
  who: Who,
  picture: PictureMade,
  leftMs: number = COPIES_MS,
): Promise<FileCopy | null> {
  const said = await copiesDoor(
    who,
    {
      pictures: [
        { key: "one", bytes: Buffer.from(picture.bytes).toString("base64"), mime: picture.mime, name: picture.name },
      ],
    },
    leftMs,
  );
  const row = Array.isArray(said?.pictures) ? recordOrNull(said.pictures[0]) : null;
  if (typeof row?.file_id !== "string") return null;
  return { fileId: row.file_id, ...sizeOf(row) };
}
