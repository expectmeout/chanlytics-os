/**
 * What an import finds for a business's files (decision 0099): each picture judged by its own bytes and kept once, a batch at a
 * time on the ledger, and the bell rung once when something waits on a person.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import {
  FILE_CACHE_S,
  FILE_LOOK_EDITION,
  FILE_NAME_WORDS,
  FILE_PIXELS_MAX,
  FILE_SIDE_MIN,
  FILE_WORDS,
  SECOND_MS,
  fileNameOf,
  filePathOf,
  type FileMime,
  type FileShows,
  recordOrEmpty,
} from "@chanlytics/contracts";
import { FINGERPRINT_BYTES, fileFingerprintOf } from "@chanlytics/channels/files";
import { RESPONSE_MAX_BYTES, publicFetcher } from "@chanlytics/channels/shared";
import { fetchImageBytes, type SitePage } from "@chanlytics/channels/website";
import { findPlacePhotoUri, type PlaceDetails } from "@chanlytics/channels/google";
import { imageHeaderOf, sitePhotosFrom } from "@chanlytics/core";
import { findFileForWork, recordFileFound, markFileSeen, filesBucket } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { scheduleJobOnce, type ClaimedJob } from "@chanlytics/jobs";
import { http } from "../shared/google/places.js";
import { recordNotification } from "../shared/alerts/notify.js";
import { env } from "../shared/env.js";
import { errField, logger } from "../shared/log.js";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** The shortest side a website's picture may have: a smaller one is a thumbnail or a decoration, not a photo to keep. */
const FOUND_SIDE_MIN = 400;
/** How many characters of a batch's hash name it: enough that two batches never share one. */
const BATCH_KEY_CHARS = 16;
/** How many found pictures are read at once. */
const FETCHES_AT_ONCE = 4;
const FETCH_MS = 5 * SECOND_MS;

/** A found picture, as a job or an import part hands it: where it is, and what is known of it. */
export interface FoundFile {
  url: string;
  ref: string;
  shows?: FileShows | null;
  /** What to call it until the look does. Absent, the last word of its address. */
  name?: string;
}

const MIME_OF_KIND: Readonly<Record<string, FileMime>> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** A name to start from, until the look gives a better one: the picture's own, or where it came from. */
function firstNameOf(url: string, source: string): string {
  try {
    const base = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    return fileNameOf(base, 6) || fileNameOf(source);
  } catch {
    return fileNameOf(source);
  }
}

/** What became of a found picture: new here, here already (or let go), no room for it, or not one to keep. */
type FoundFate = "kept" | "here" | "full" | "passed";

/**
 * One found picture read, judged by its own bytes, and kept once (00551 file_found). A picture that cannot be read is passed
 * over: an import is not held up by one bad address. Storage or the database failing throws, and leaves no bytes behind with
 * no row to find them. A road that files what it brings still asks the door of a picture already here, with no bytes stored:
 * the owner's profile files a twin that only waited, and takes over from what a listing offered.
 */
export async function keepFoundFile(
  db: Db,
  tenantId: TenantId,
  params: { source: string; status: "inbox" | "filed"; file: FoundFile },
): Promise<FoundFate> {
  const bytes = await fetchImageBytes(publicFetcher(), params.file.url, FETCH_MS, RESPONSE_MAX_BYTES);
  const head = bytes ? imageHeaderOf(bytes) : null;
  const mime = head ? MIME_OF_KIND[head.kind] : undefined;
  if (!bytes || !head || !mime) return "passed";
  // Google takes a photo from 250 pixels, and a logo tends to sit there. A website's small pictures are its furniture.
  if (Math.min(head.width, head.height) < (params.source === "website" ? FOUND_SIDE_MIN : FILE_SIDE_MIN))
    return "passed";
  if (head.width * head.height > FILE_PIXELS_MAX) return "passed";
  const fingerprint = fileFingerprintOf(bytes.subarray(0, FINGERPRINT_BYTES), bytes.length);
  const id = randomUUID();
  const request = {
    tenantId,
    id,
    status: params.status,
    source: params.source,
    sourceRef: params.file.ref,
    name: params.file.name
      ? fileNameOf(params.file.name, FILE_NAME_WORDS) || fileNameOf(params.source)
      : firstNameOf(params.file.url, params.source),
    mime,
    bytes: bytes.length,
    fingerprint,
    width: head.width,
    height: head.height,
    shows: params.file.shows ?? null,
    edition: FILE_LOOK_EDITION,
    actor: null,
  };
  if (await markFileSeen(db, tenantId, fingerprint)) {
    if (params.status !== "filed") return "here";
    return (await recordFileFound(db, request)).fate;
  }
  const path = filePathOf(tenantId, id, mime);
  const stored = await filesBucket(db).upload(path, bytes, {
    contentType: mime,
    upsert: false,
    cacheControl: String(FILE_CACHE_S),
  });
  if (stored.error) throw new Error(`file_fetch: ${stored.error.message}`);
  let fate: FoundFate;
  try {
    fate = (await recordFileFound(db, request)).fate;
  } catch (e) {
    // A lost answer may still have committed: the bytes go only where no row holds them.
    if (!(await findFileForWork(db, tenantId, id).catch(() => true))) await filesBucket(db).remove([path]);
    throw e;
  }
  if (fate !== "kept") await filesBucket(db).remove([path]);
  return fate;
}

/** A batch's items, as the job carries them; anything else is passed over. */
function itemsOf(raw: unknown): FoundFile[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((i: unknown) => {
    const o = recordOrEmpty(i);
    if (typeof o.url !== "string" || !o.url) return [];
    return [{ url: o.url, ref: typeof o.ref === "string" ? o.ref : o.url }];
  });
}

/** A listing's photo is named in the job and its address asked for as it is read, since an address does not last. */
async function addressedNow(source: string, file: FoundFile): Promise<FoundFile | null> {
  if (source !== "google_listing") return file;
  const key = env.GOOGLE_PLACES_API_KEY;
  const url = key ? await findPlacePhotoUri(http, key, file.url) : null;
  return url ? { ...file, url } : null;
}

/**
 * The roads a batch may come by. All wait in the Inbox for a person's word: a website's photos may be anyone's, and linking
 * a public listing does not prove it is yours. Only a connected profile, whose owner signed in, files what it brings.
 */
const FOUND_ROADS: ReadonlySet<string> = new Set(["website", "google_listing"]);

/** One picture of a batch, what became of it, or that it could not be kept for now, which the batch throws for at its end. */
async function oneFound(db: Db, job: ClaimedJob, source: string, item: FoundFile): Promise<FoundFate | "failed"> {
  const log = logger({ tenant_id: job.tenant_id });
  let file: FoundFile | null;
  try {
    file = await addressedNow(source, item);
  } catch (e) {
    // Google refusing one name is a pass: a name can expire, and asking again would not change it.
    log.warn("file_fetch_failed", { source, step: "address", error: errField(e) });
    return "passed";
  }
  if (!file) return "passed";
  try {
    return await keepFoundFile(db, job.tenant_id, { source, status: "inbox", file });
  } catch (e) {
    log.warn("file_fetch_failed", { source, step: "keep", error: errField(e) });
    return "failed";
  }
}

/**
 * file_fetch: a batch read a few at a time, and no read started past the deadline: what is left goes on as its own job. The
 * bell rings once, as soon as something waits on a person, and before anything can throw. Storage or the database failing
 * throws at the end, so the ledger tries again and nothing the site offered is lost to a blip; what was kept stays kept.
 */
export async function fetchFiles(db: Db, job: ClaimedJob, deadline: number): Promise<void> {
  const source = String(job.payload.source);
  if (!FOUND_ROADS.has(source)) throw new Error(`file_fetch: nothing here brings ${source} in`);
  const items = itemsOf(job.payload.items);
  let kept = 0;
  let failed = 0;
  let full = false;
  let at = 0;
  for (; at < items.length && Date.now() < deadline && !full; at += FETCHES_AT_ONCE) {
    const result = await Promise.all(
      items.slice(at, at + FETCHES_AT_ONCE).map((item) => oneFound(db, job, source, item)),
    );
    kept += result.filter((f) => f === "kept").length;
    failed += result.filter((f) => f === "failed").length;
    full = result.includes("full");
  }
  const rang = job.payload.rang === true;
  if (kept > 0 && !rang) {
    await recordNotification(
      job.tenant_id,
      { kind: "files_waiting", title: FILE_WORDS.bell.title, body: FILE_WORDS.bell.body, route: "admin/files" },
      db,
    );
  }
  if (!full && at < items.length) {
    await askForFoundFiles(db, job.tenant_id, { source, items: items.slice(at), rang: rang || kept > 0 });
  }
  logger({ tenant_id: job.tenant_id }).info("file_fetch_done", { source, asked: items.length, kept, failed, full });
  if (failed > 0) throw new Error(`file_fetch: ${failed} of ${items.length} could not be kept`);
}

/** A batch asked for, once for what it holds: the same pictures found again are no second job. */
export async function askForFoundFiles(
  db: Db,
  tenantId: TenantId,
  { source, items, rang = false }: { source: string; items: readonly FoundFile[]; rang?: boolean },
): Promise<void> {
  if (items.length === 0) return;
  const batch = createHash("sha256")
    .update(
      items
        .map((i) => i.ref)
        .sort()
        .join("\n"),
    )
    .digest("hex")
    .slice(0, BATCH_KEY_CHARS);
  await scheduleJobOnce(db, {
    tenantId,
    kind: "file_fetch",
    dueAt: new Date(),
    payload: { source, batch, items: items.map((i) => ({ url: i.url, ref: i.ref })), ...(rang ? { rang: true } : {}) },
  });
}

/** The photographs a read site's pages show, each once. */
export function sitePhotosOf(pages: readonly SitePage[]): FoundFile[] {
  const urls = new Set(pages.flatMap((p) => sitePhotosFrom(p.html, p.url)));
  return [...urls].map((url) => ({ url, ref: url }));
}

/** A name as two spellings of it are one: Café Luna is Cafe Luna, and punctuation says nothing. */
const sameNameOf = (name: string): string => fileNameOf(name.normalize("NFKD").replace(/\p{M}/gu, ""));

/** The photos a linked listing shows by the business itself. A customer's picture of the place is not the owner's to use. */
export async function askForListingPhotos(db: Db, tenantId: TenantId, place: PlaceDetails): Promise<void> {
  const own = sameNameOf(place.name);
  const theirs = place.photos.filter((p) => p.author && sameNameOf(p.author) === own);
  await askForFoundFiles(db, tenantId, {
    source: "google_listing",
    items: theirs.map((p) => ({ url: p.name, ref: p.name })),
  });
}
