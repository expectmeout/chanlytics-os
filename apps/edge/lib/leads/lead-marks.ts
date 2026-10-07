/**
 * The wires the collect's mark step runs on (D6): reading a business's home page, and (00161) the copy we keep.
 *
 * A mark drawn straight off a business's site never shows, because the dashboard's content policy lets images in
 * from three hosts. So the collect asks for the bytes once (`imageBytes`), core judges them (mark-image.ts), and a
 * copy is kept in the public lead-marks bucket under its own hash (`storeLeadMark`), on the Supabase origin the
 * policy already allows. The same logo found by two workspaces is one file, and a file never changes once written,
 * so it is served with a year's cache.
 *
 * All three answer null rather than throwing: a lead without a mark is an ordinary lead, and the next round tries again.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import type { MarkImage } from "../packages/core.js";
import { LEAD_MARKS_BUCKET } from "../packages/contracts.js";
import { logger } from "../log.js";
import { BOT_USER_AGENT } from "../public-page.js";

const STORE_TIMEOUT_MS = 4_000;
/** A read is given at least this, whatever the caller has left, and at most the cap for what it reads. */
const READ_FLOOR_MS = 500;
const PAGE_READ_CAP_MS = 8_000;
const IMAGE_READ_CAP_MS = 5_000;
const A_YEAR_S = String(365 * 24 * 60 * 60);

/** `<sha256 of the bytes>.<the kind they were read as>`: the only shape 00161's CHECK lets the column hold. */
export function leadMarkPath(bytes: Uint8Array, image: MarkImage): string {
  return `${createHash("sha256").update(bytes).digest("hex")}.${image.kind}`;
}

/** How much of a page is worth reading for a mark: a head is at the top, and a megabyte of body is not ours to hold. */
const PAGE_MAX_BYTES = 96_000;
/**
 * One GET of a page as text, for the engine's own reading (D6). It is a business's own home page, asked for once
 * while we are already deciding about them: no redirect chain beyond the platform's own, no cookie kept, nothing
 * followed off the page, and the first ninety kilobytes only -- the head is at the top and the rest is not ours.
 * Anything that is not a page we can read answers null, because a lead without a mark is an ordinary lead.
 */
export async function pageText(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<string | null> {
  const stop = AbortSignal.timeout(Math.max(READ_FLOOR_MS, Math.min(timeoutMs, PAGE_READ_CAP_MS)));
  try {
    const res = await fetchImpl(url, {
      signal: stop,
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": BOT_USER_AGENT,
      },
    });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").toLowerCase().includes("html")) return null;
    const body = await res.text();
    return body.slice(0, PAGE_MAX_BYTES);
  } catch {
    return null;
  }
}

/**
 * One GET of an image, never more than `maxBytes`: a length said up front past it is refused before a byte is read,
 * and a body that runs past it is cut off and refused. No AVIF or SVG is asked for, since neither is kept.
 */
export async function imageBytes(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const stop = AbortSignal.timeout(Math.max(READ_FLOOR_MS, Math.min(timeoutMs, IMAGE_READ_CAP_MS)));
  try {
    const res = await fetchImpl(url, {
      signal: stop,
      redirect: "follow",
      headers: {
        accept: "image/png,image/jpeg,image/webp,image/gif,image/x-icon;q=0.9,*/*;q=0.5",
        "user-agent": BOT_USER_AGENT,
      },
    });
    if (!res.ok || !res.body) return null;
    if (Number(res.headers.get("content-length") ?? 0) > maxBytes) {
      await res.body.cancel().catch(() => undefined);
      return null;
    }
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      parts.push(value);
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const part of parts) {
      out.set(part, at);
      at += part.byteLength;
    }
    return out;
  } catch {
    return null;
  }
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
