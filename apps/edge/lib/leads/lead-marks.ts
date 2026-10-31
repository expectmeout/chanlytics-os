/**
 * The wires the collect's mark step runs on (D6): reading a business's home page, and (00161) the copy we keep. The
 * collect's own wires (lead-wires.ts) and the backfill for leads found before 00161 (tooling/scripts/ops) read through
 * these, so a mark is found one way.
 *
 * The home page is read by the platform's one page reader (`markPageText`: lib/public-page.ts sitePage, Firecrawl's
 * scrape). A mark drawn straight off a business's site never shows, because the dashboard's content policy lets images
 * in from three hosts. So the collect asks for the bytes once (`imageBytes`, over the guarded fetch: the page names the
 * picture's address), core judges them (mark-image.ts), and a copy is kept in the public lead-marks bucket under its
 * own hash (`storeLeadMark`), on the Supabase origin the policy already allows. The same logo found by two workspaces
 * is one file, and a file never changes once written, so it is served with a year's cache.
 *
 * All three answer null rather than throwing: a lead without a mark is an ordinary lead, and the next round tries again.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import type { MarkImage } from "../packages/core.js";
import { LEAD_MARKS_BUCKET } from "../packages/contracts.js";
import { logger } from "../log.js";
import { sitePage } from "../public-page.js";

/**
 * The image read is channels' (site-reads.ts): one reading of a picture a business's own site names, which the
 * dashboard's look for a workspace's logo makes too. Named here for the collect's wires.
 */
export { imageBytes } from "../packages/channels.js";

/** How much of a home page is read for a mark: a head is at the top, and the rest is not ours to hold. */
const MARK_PAGE_CHARS = 96_000;

/** A lead's home page as a browser drew it, for the marks its head declares; null where it could not be read. */
export async function markPageText(url: string, timeoutMs: number): Promise<string | null> {
  return (await sitePage(url, { timeoutMs, maxChars: MARK_PAGE_CHARS }))?.html ?? null;
}

const STORE_TIMEOUT_MS = 4_000;
const A_YEAR_S = String(365 * 24 * 60 * 60);

/** `<sha256 of the bytes>.<the kind they were read as>`: the only shape 00161's CHECK lets the column hold. */
export function leadMarkPath(bytes: Uint8Array, image: MarkImage): string {
  return `${createHash("sha256").update(bytes).digest("hex")}.${image.kind}`;
}

/** Keep the copy: the stored path, or null when storage refused or did not answer in time. */
export async function storeLeadMark(
  db: SupabaseClient<Database>,
  bytes: Uint8Array,
  image: MarkImage,
  timeoutMs = STORE_TIMEOUT_MS,
): Promise<string | null> {
  const path = leadMarkPath(bytes, image);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<{ error: { message: string } }>((resolve) => {
      timer = setTimeout(() => resolve({ error: { message: `timed out after ${timeoutMs} ms` } }), timeoutMs);
    });
    // The same bytes are the same name, so writing them again changes nothing a reader could see.
    const upload = db.storage
      .from(LEAD_MARKS_BUCKET)
      .upload(path, bytes, { contentType: image.contentType, cacheControl: A_YEAR_S, upsert: true });
    const { error } = await Promise.race([upload, late]);
    if (!error) return path;
    logger().warn("lead_mark_store_failed", { path, message: String(error.message).slice(0, 200) });
    return null;
  } catch (e) {
    logger().warn("lead_mark_store_failed", {
      path,
      message: String(e instanceof Error ? e.message : e).slice(0, 200),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
