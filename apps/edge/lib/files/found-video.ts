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
import { findFileForWork, markFileSeen, recordVideoFound } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { logAndGoOn } from "@chanlytics/log";
import { streamAccount } from "./video-keys.js";

type Db = SupabaseClient<Database>;

/** What became of a found video: kept, here already (or let go), no room, or not one to keep here. */
type FoundVideoFate = "kept" | "here" | "full" | "passed";

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
 * One found video kept once. A twin or one a person let go is not fetched again; the platform refusing the address is a
 * pass (a page's video can be gone); the database failing throws, so the batch is tried again.
 */
export async function keepFoundVideo(
  db: Db,
  tenantId: TenantId,
  params: { source: string; status: "inbox" | "filed"; url: string; ref: string; name: string },
): Promise<FoundVideoFate> {
  const account = streamAccount();
  if (!account || !(await takesVideos(db, tenantId))) return "passed";
  const fingerprint = foundVideoPrintOf(params.source, params.ref);
  if (await markFileSeen(db, tenantId, fingerprint)) return "here";
  const id = randomUUID();
  const fetched = await askStreamToFetch(account, { url: params.url, name: id });
  if (!fetched.ok) return fetched.full ? "full" : "passed";
  const letItGo = () => deleteStreamVideo(account, fetched.mediaRef).catch(logAndGoOn("found video: let it go", false));
  let fate;
  try {
    fate = await recordVideoFound(db, {
      tenantId,
      id,
      mediaRef: fetched.mediaRef,
      status: params.status,
      source: params.source,
      sourceRef: params.ref,
      name: params.name,
      mime: videoMimeOf(params.url),
      fingerprint,
    });
  } catch (e) {
    // A lost answer may still have committed: the platform's copy goes only where no row holds it.
    if (!(await findFileForWork(db, tenantId, id).catch(() => true))) await letItGo();
    throw e;
  }
  if (fate.fate === "kept") return "kept";
  await letItGo();
  return fate.fate === "minutes" ? "full" : fate.fate;
}
