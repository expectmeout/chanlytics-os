/**
 * The shelf, as the app asks it (the archive plan's B2): the private bucket where a video Chanlytics made keeps a
 * copy of its own, behind the relay (apps/relay/src/shelf.ts), so the video's copy at the video platform can be let go
 * and fetched again. Five things are asked of it: put a file there, read back what it holds, remove it, the address
 * the video platform fetches it from, and the list of what one workspace's shelf holds.
 *
 * A file is put by having the relay pull it from an address, held to the size and the SHA-256 this side names in the
 * put's ticket: no bytes pass through the app, and only those bytes can end under the file's key. Every ask rides a
 * ticket of the shelf's own (./relay-ticket.ts `signShelfTicket`) for one workspace's one file and one use; a put's and
 * a delete's ride the header and never an address.
 *
 * What the shelf holds is said as it is. That it holds none, that it gave no answer, and that it holds other bytes are
 * three answers here and never one: a video is let go or called lost on the strength of them. Nothing here knows a
 * row or a page.
 */
import { MIN_MS, SECOND_MS, isObjectRecord } from "@chanlytics/contracts";
import type { ModelDeps } from "../ai/anthropic";
import { fetchFromProvider, type ProviderReply } from "../shared/provider-fetch";
import { SHA_256_HEX, signShelfTicket } from "./relay-ticket";

/** Where the shelf is asked, and what its tickets are signed with: the relay's address and the ticket's key. */
export interface Shelf {
  relayUrl: string;
  ticketKey: string;
}

/** Whose file: the object's key on the shelf is these two. */
interface ShelfVideo {
  tenantId: string;
  fileId: string;
}

/** What the shelf holds of a file: its size, and its SHA-256 where the shelf keeps one. */
interface ShelfRecord {
  bytes: number;
  sha256: string | null;
}

/** Why a put did not happen: other bytes, another length, the place pulled from, a relay with no shelf, or no answer. */
type ShelfPutRefusal = "mismatch" | "size" | "source" | "off" | "failed";

/** A put's bound: the relay pulls and stores inside it. The job's window allows forty seconds. */
const PUT_TRY_MS = 35 * SECOND_MS;
/** A record's read, and a removal. */
const ASK_TRY_MS = 10 * SECOND_MS;
/** How long a ticket the app itself uses runs: a put, a delete, a list, and its own read of a record. */
const OWN_TICKET_MS = 5 * MIN_MS;
/** One page of a workspace's list: the relay names up to a thousand files a page. Asked once: a list is a floor, tried again next pass. */
const LIST_TRY_MS = 5 * SECOND_MS;
/** The most pages one list is read for. A shelf holds a workspace's made videos, never this many thousands. */
const LIST_PAGES_MAX = 10;

const nowOf = (deps: ModelDeps): number => (deps.now ?? Date.now)();

/** The shelf's address for a file's video. Throws on a relay that is not reached over https: a ticket never rides less. */
function shelfUrlOf(shelf: Shelf, video: ShelfVideo, tail = ""): URL {
  const base = new URL(shelf.relayUrl);
  if (base.protocol !== "https:") throw new Error("the relay is reached over https");
  return new URL(`/shelf/${encodeURIComponent(video.fileId)}/video${tail}`, base);
}

function ticketFor(shelf: Shelf, video: ShelfVideo, use: "read" | "delete", nowMs: number): string {
  return signShelfTicket(shelf.ticketKey, {
    tenant: video.tenantId,
    file: video.fileId,
    use,
    expiresAt: Math.floor((nowMs + OWN_TICKET_MS) / SECOND_MS),
  });
}

/**
 * Where the video platform fetches a file's video from: the relay's address for it, ending as a video's does, under a
 * ticket that reads and ends at `expiresAt` (unix seconds).
 */
export function relayShelfAddress(shelf: Shelf, video: ShelfVideo, expiresAt: number): string {
  const address = shelfUrlOf(shelf, video, ".mp4");
  address.searchParams.set(
    "ticket",
    signShelfTicket(shelf.ticketKey, { tenant: video.tenantId, file: video.fileId, use: "read", expiresAt }),
  );
  return address.toString();
}

/** The word the relay refused with, where its answer is one of its own. */
function shelfRefusalOf(reply: ProviderReply): { error: string; reason: string } | null {
  const body = isObjectRecord(reply.json) ? reply.json : null;
  return body && typeof body.error === "string" && typeof body.reason === "string"
    ? { error: body.error, reason: body.reason }
    : null;
}

function putRefusalOf(reply: ProviderReply): ShelfPutRefusal {
  const refusal = shelfRefusalOf(reply);
  if (refusal?.error === "shelf" && refusal.reason === "mismatch") return "mismatch";
  if (refusal?.error === "shelf" && refusal.reason === "off") return "off";
  if (refusal?.error === "source") return refusal.reason === "size" ? "size" : "source";
  return "failed";
}

/**
 * A file's video put on the shelf: pulled by the relay from `from`, and held there to exactly these bytes. Asked
 * once: a put that gave no answer may or may not have landed, which the record read back says, and its job tries
 * again. Answers what was stored, or why nothing was.
 */
export async function putOnShelf(
  shelf: Shelf,
  video: ShelfVideo & { from: string; bytes: number; sha256: string },
  deps: ModelDeps = {},
): Promise<{ ok: true; record: ShelfRecord } | { ok: false; why: ShelfPutRefusal }> {
  const ticket = signShelfTicket(shelf.ticketKey, {
    tenant: video.tenantId,
    file: video.fileId,
    use: "put",
    expiresAt: Math.floor((nowOf(deps) + OWN_TICKET_MS) / SECOND_MS),
    bytes: video.bytes,
    sha256: video.sha256,
  });
  const reply = await fetchFromProvider(
    "relay",
    shelfUrlOf(shelf, video).toString(),
    {
      method: "POST",
      headers: { authorization: `Bearer ${ticket}`, "content-type": "application/json" },
      body: JSON.stringify({ from: video.from }),
      timeoutMs: PUT_TRY_MS,
    },
    deps,
  );
  const stored = reply.outcome === "ok" && isObjectRecord(reply.json) ? reply.json : null;
  if (!stored || typeof stored.bytes !== "number") return { ok: false, why: putRefusalOf(reply) };
  const sha256 = typeof stored.sha256 === "string" && SHA_256_HEX.test(stored.sha256) ? stored.sha256 : null;
  return { ok: true, record: { bytes: stored.bytes, sha256 } };
}

/**
 * What the shelf holds of a file's video: its record, null where the shelf says it holds none, and `ok: false` where
 * it gave no answer that can be believed (no answer at all, a relay with no shelf, a 404 the shelf did not say).
 */
export async function readShelfRecord(
  shelf: Shelf,
  video: ShelfVideo,
  deps: ModelDeps = {},
): Promise<{ ok: true; record: ShelfRecord | null } | { ok: false }> {
  const address = shelfUrlOf(shelf, video);
  address.searchParams.set("ticket", ticketFor(shelf, video, "read", nowOf(deps)));
  const reply = await fetchFromProvider(
    "relay",
    address.toString(),
    { method: "HEAD", timeoutMs: ASK_TRY_MS, idempotent: true, tries: 2 },
    deps,
  );
  // Nothing there, in the shelf's own word: a HEAD has no body, so it says so in a header.
  if (reply.status === 404 && reply.headers?.get("x-shelf") === "none") return { ok: true, record: null };
  const length = reply.headers?.get("content-length") ?? "";
  if (reply.outcome !== "ok" || !/^\d+$/.test(length)) return { ok: false };
  const sum = reply.headers?.get("x-shelf-sha256") ?? "";
  return { ok: true, record: { bytes: Number(length), sha256: SHA_256_HEX.test(sum) ? sum : null } };
}

/** A file's video taken off the shelf. True once the shelf says it holds none, which one never put says too. */
export async function removeFromShelf(shelf: Shelf, video: ShelfVideo, deps: ModelDeps = {}): Promise<boolean> {
  const nowMs = nowOf(deps);
  const reply = await fetchFromProvider(
    "relay",
    shelfUrlOf(shelf, video).toString(),
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${ticketFor(shelf, video, "delete", nowMs)}` },
      timeoutMs: ASK_TRY_MS,
      idempotent: true,
      tries: 2,
    },
    deps,
  );
  return reply.outcome === "ok";
}

/** One page of a list, as the relay answers one, or null where the answer is not a page of the shelf's. */
function listPageOf(reply: ProviderReply): { files: string[]; other: number; next: string | null } | null {
  const body = reply.outcome === "ok" && isObjectRecord(reply.json) ? reply.json : null;
  if (!body || !Array.isArray(body.files) || typeof body.more !== "boolean") return null;
  const files = body.files.filter((id): id is string => typeof id === "string");
  // Every name is a file's id, or the page is not one to act on.
  if (files.length !== body.files.length) return null;
  const more = body.more ? (typeof body.cursor === "string" && body.cursor ? body.cursor : null) : null;
  // More to come and nowhere to go on from: half a list, which is no list.
  if (body.more && !more) return null;
  return { files, other: typeof body.other === "number" ? body.other : 0, next: more };
}

/**
 * What one workspace's shelf holds: the ids of the files with an object there, every page of them, and how many keys
 * under its name are no file's. `ok: false` where the whole list could not be had (no answer, a relay with no shelf or
 * older than the list, a page that is not one, more pages than a shelf holds): half a list is never answered, since
 * what is missing from it would read as missing from the shelf. No page is asked for once `untilMs` has come, where
 * the caller has a time to keep: a list cut short by the clock is no answer either.
 */
export async function listShelf(
  shelf: Shelf,
  tenantId: string,
  deps: ModelDeps = {},
  untilMs: number | null = null,
): Promise<{ ok: true; files: string[]; other: number } | { ok: false }> {
  const base = new URL(shelf.relayUrl);
  if (base.protocol !== "https:") throw new Error("the relay is reached over https");
  const ticket = signShelfTicket(shelf.ticketKey, {
    tenant: tenantId,
    use: "list",
    expiresAt: Math.floor((nowOf(deps) + OWN_TICKET_MS) / SECOND_MS),
  });
  const files: string[] = [];
  let other = 0;
  let cursor: string | null = null;
  for (let page = 0; page < LIST_PAGES_MAX; page += 1) {
    if (untilMs !== null && nowOf(deps) >= untilMs) return { ok: false };
    const address = new URL("/shelf/list", base);
    if (cursor) address.searchParams.set("cursor", cursor);
    const reply = await fetchFromProvider(
      "relay",
      address.toString(),
      { method: "GET", headers: { authorization: `Bearer ${ticket}` }, timeoutMs: LIST_TRY_MS, idempotent: true },
      deps,
    );
    const read = listPageOf(reply);
    if (!read) return { ok: false };
    files.push(...read.files);
    other += read.other;
    if (!read.next) return { ok: true, files, other };
    cursor = read.next;
  }
  return { ok: false };
}
