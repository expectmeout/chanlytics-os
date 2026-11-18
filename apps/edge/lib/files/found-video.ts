/**
 * A found video kept (Content's empty state, 14 Nov 2026; 00626): what a business's website plays, a connected profile holds
 * or its Instagram posted, fetched by the video platform from its address, so its bytes never pass through us. The row is
 * made as soon as the platform holds it, at its road's status; the platform's word finishes it, and Ask's look (it watches
 * and listens) is asked for there, as for an upload. A workspace that takes no videos (features.video_preview) is passed
 * over, and so is one where the platform's keys are unset.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { videoPreviewOf, type FileVideoMime, type TenantId } from "@chanlytics/contracts";
import { askStreamToFetch, deleteStreamVideo } from "@chanlytics/channels/files";
import { findWorkspaceNameAndConfig } from "@chanlytics/db/campaigns";
import { findFileForWork, recordVideoFound, type FoundVideoFate } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { logAndGoOn } from "@chanlytics/log";
import { streamAccount } from "./video-keys.js";

type Db = SupabaseClient<Database>;

/**
 * What became of a found video: kept; here already (or let go); the Library is full; the videos are, for one of its
 * length (`minutes`); longer than AI can watch (`long`); not one to keep here (`passed`); or the video platform's own
 * account has no storage left (`stopped`), which no other video of the batch can get past either.
 */
export type FoundVideoKept = Exclude<FoundVideoFate["fate"], "room"> | "passed" | "stopped";

/** A video file's type by what its address ends in; Instagram's reels and anything unnamed are MP4. */
function videoMimeOf(url: string): FileVideoMime {
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      // Not an address: the platform will say so.
      return "";
    }
  })();
  if (path.endsWith(".mov")) return "video/quicktime";
  if (path.endsWith(".webm")) return "video/webm";
  return "video/mp4";
}

/**
 * What a found video is known by: its road and what the road calls it (a site's address, a post's code), hashed. Its bytes
 * are the platform's, so this is its fingerprint, and the same video found again is its twin.
 */
const foundVideoPrintOf = (source: string, ref: string): string =>
  `found:${createHash("sha256").update(`${source}|${ref}`).digest("hex")}`;

/** Whether the workspace takes videos; a read that fails is no. */
async function takesVideos(db: Db, tenantId: TenantId): Promise<boolean> {
  const config = await findWorkspaceNameAndConfig(db, tenantId)
    .then((w) => w.config)
    .catch(logAndGoOn("found video: read the video switch", null));
  return config !== null && videoPreviewOf(config);
}

/**
 * One found video kept once, let in by its length (00643): `seconds` is its road's own word for it, null where the
 * road says none (a website's is judged when the video platform says it). The door judges before the platform is asked,
 * so a twin, one a person let go, a full Library, full minutes and a video too long cost no fetch. The platform refusing
 * the address is a pass (a page's video can be gone); the database failing throws, so the batch is tried again.
 */
export async function keepFoundVideo(
  db: Db,
  tenantId: TenantId,
  params: { source: string; status: "inbox" | "filed"; url: string; ref: string; name: string; seconds: number | null },
): Promise<FoundVideoKept> {
  const account = streamAccount();
  if (!account || !(await takesVideos(db, tenantId))) return "passed";
  const id = randomUUID();
  const video = {
    tenantId,
    id,
    status: params.status,
    source: params.source,
    sourceRef: params.ref,
    name: params.name,
    mime: videoMimeOf(params.url),
    fingerprint: foundVideoPrintOf(params.source, params.ref),
    seconds: params.seconds,
  };
  const judged = await recordVideoFound(db, { ...video, mediaRef: null });
  // A fresh id is never a row already, so kept is not an answer to the judging: read as here, never as a video kept.
  if (judged.fate !== "room") return judged.fate === "kept" ? "here" : judged.fate;
  const fetched = await askStreamToFetch(account, { url: params.url, name: id });
  // The platform is preparing as many videos as it takes at once: this one is asked for again, with what the batch
  // could not keep (found.ts), never passed over.
  if (!fetched.ok && fetched.busy) throw new Error("found video: the video platform is preparing as many as it takes");
  if (!fetched.ok) return fetched.full ? "stopped" : "passed";
  const letItGo = () => deleteStreamVideo(account, fetched.mediaRef).catch(logAndGoOn("found video: let it go", false));
  let fate;
  try {
    fate = await recordVideoFound(db, { ...video, mediaRef: fetched.mediaRef });
  } catch (e) {
    // A lost answer may still have committed: the platform's copy goes only where no row holds it.
    if (!(await findFileForWork(db, tenantId, id).catch(() => true))) await letItGo();
    throw e;
  }
  if (fate.fate === "kept") return "kept";
  // Its room went, or its twin came, between the judging and the fetch: the copy is let go, and the door's word stands.
  await letItGo();
  return fate.fate === "room" ? "passed" : fate.fate;
}
