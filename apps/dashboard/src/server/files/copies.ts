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
  person: Who,
  body: Record<string, unknown>,
  leftMs: number,
): Promise<Record<string, unknown> | null> {
  if (!edgeConfigured()) return null;
  const answer = await callEdge(
    "/api/admin/files/copies",
    { tenant_id: person.tenantId, ...body },
    { workspace: person.tenantId, user: person.userId, timeoutMs: Math.min(COPIES_MS, Math.max(SECOND_MS, leftMs)) },
  );
  const sentence = recordOrNull(answer.body);
  if (answer.status !== 200 || !sentence) {
    log.warn("ask_file_copies_failed", {
      tenant_id: person.tenantId,
      status: answer.status,
      ...(typeof sentence?.detail === "string" ? { detail: sentence.detail.slice(0, 200) } : {}),
    });
    return null;
  }
  return sentence;
}

const sizeOf = (row: Record<string, unknown>) => ({
  width: typeof row.width === "number" ? row.width : null,
  height: typeof row.height === "number" ? row.height : null,
});

/** What a request sends a picture by, by the file it is of. A file left out has no copy to send. */
export async function listFileCopiesOf(
  person: Who,
  ids: readonly string[],
  leftMs: number = COPIES_MS,
): Promise<ReadonlyMap<string, FileCopy>> {
  const out = new Map<string, FileCopy>();
  if (ids.length === 0) return out;
  const sentence = await copiesDoor(person, { ids }, leftMs);
  const copies = sentence?.copies;
  if (!Array.isArray(copies)) return out;
  for (const c of copies) {
    const row = recordOrNull(c);
    if (typeof row?.id === "string" && typeof row.file_id === "string")
      out.set(row.id, { fileId: row.file_id, ...sizeOf(row) });
  }
  return out;
}

/** A video's moment as Ask asks for it: one moment, a box of one (in the pixels that moment was shown at), or a stretch. */
type MomentAsked =
  | { id: string; at: number; box?: readonly [number, number, number, number]; of?: readonly [number, number] }
  | { id: string; from: number; to: number };

/** A moment drawn by the edge and held for the turn: its copy, and what it was drawn as; or the words that say why not. */
type MomentDrawn =
  | (FileCopy & {
      box: readonly [number, number, number, number] | null;
      of: readonly [number, number] | null;
      from: number | null;
      to: number | null;
      step: number | null;
      frames: number | null;
    })
  | { wont: string };

const numberOr = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** `n` numbers, or null. */
const numbersOr = (v: unknown, n: number): number[] | null =>
  Array.isArray(v) && v.length === n && v.every((x): x is number => typeof x === "number") ? v : null;
const pairOr = (v: unknown): readonly [number, number] | null => {
  const n = numbersOr(v, 2);
  return n ? [n[0] ?? 0, n[1] ?? 0] : null;
};
const boxOr = (v: unknown): readonly [number, number, number, number] | null => {
  const n = numbersOr(v, 4);
  return n ? [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 0] : null;
};

/**
 * A video's moment, drawn on the edge (where Stream's keys are) and held at Anthropic for a day, as a zoom of a photo is. Never a
 * failed turn: what could not be drawn is said in words.
 */
export async function drawVideoMoment(
  member: Who,
  moment: MomentAsked,
  leftMs: number = COPIES_MS,
): Promise<MomentDrawn> {
  const reply = await copiesDoor(member, { moments: [{ key: "one", ...moment }] }, leftMs);
  const row = Array.isArray(reply?.moments) ? recordOrNull(reply.moments[0]) : null;
  if (!row) return { wont: "it could not be drawn just now" };
  if (typeof row.file_id !== "string")
    return { wont: typeof row.wont === "string" ? row.wont : "it could not be drawn just now" };
  return {
    fileId: row.file_id,
    ...sizeOf(row),
    box: boxOr(row.box),
    of: pairOr(row.of),
    from: numberOr(row.from),
    to: numberOr(row.to),
    step: numberOr(row.step),
    frames: numberOr(row.frames),
  };
}

/** A picture made here, held at Anthropic for a day, or null where it could not be: said in words then, never a failed turn. */
export async function findPictureCopy(
  person: Who,
  picture: PictureMade,
  leftMs: number = COPIES_MS,
): Promise<FileCopy | null> {
  const sentence = await copiesDoor(
    person,
    {
      pictures: [
        { key: "one", bytes: Buffer.from(picture.bytes).toString("base64"), mime: picture.mime, name: picture.name },
      ],
    },
    leftMs,
  );
  const row = Array.isArray(sentence?.pictures) ? recordOrNull(sentence.pictures[0]) : null;
  if (typeof row?.file_id !== "string") return null;
  return { fileId: row.file_id, ...sizeOf(row) };
}
