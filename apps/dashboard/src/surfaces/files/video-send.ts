/**
 * A video on its way (decision 0099, stage B, D2): straight from the browser to Stream over tus, never through a function of
 * ours, to the one-time address the edge reserved. tus's core is three things: HEAD asks how much has arrived, PATCH sends the
 * next chunk from there, and each answer says where it now stands. A chunk that fails is sent again from where Stream says it
 * stands, after a wait; a reload within the address's life starts from there too, since the address is kept on this device by
 * the clip's fingerprint.
 *
 * tus-js-client does this with seven packages more, and its last release is outside decision 0054's year: the protocol is the
 * few lines below. Nothing here runs until a video is sent.
 */
import { HOUR_MS, MIN_MS, SECOND_MS } from "@chanlytics/contracts";

const MiB = 1024 * 1024;
/** A chunk: large on a desk, small on a phone's line; each a multiple of 256 KiB, as Stream asks, and inside its 5 to 200 MiB. */
const CHUNK_DESK = 50 * MiB;
const CHUNK_PHONE = 10 * MiB;
/** How long before each new try of a chunk: a phone between masts is back in seconds. */
const SEND_AGAIN_AFTER_MS = [0, 3 * SECOND_MS, 5 * SECOND_MS, 10 * SECOND_MS, 20 * SECOND_MS] as const;
/** How much of a clip is read for its fingerprint: the server's own rule (channels fileFingerprintOf), its first MiB and its size. */
const FINGERPRINT_BYTES = MiB;
/** An address lives four hours at Stream: one kept on this device is tried a little before that. */
const KEPT_FOR_MS = 4 * HOUR_MS - 15 * MIN_MS;
/** How long a clip's length is waited for from the browser's own reading of it. */
const LENGTH_WAIT_MS = 8 * SECOND_MS;
/** How often progress is said at most. */
const SENT_STEP = 0.01;

const waited = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TUS = { "tus-resumable": "1.0.0" } as const;

/** A clip's fingerprint, as the server reads a photo's: sha256 of its first MiB and its size, in hex. */
export async function hashVideo(file: File): Promise<string> {
  const head = new Uint8Array(await file.slice(0, FINGERPRINT_BYTES).arrayBuffer());
  const size = new TextEncoder().encode(String(file.size));
  const joined = new Uint8Array(head.length + size.length);
  joined.set(head);
  joined.set(size, head.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", joined));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A clip's length, as the browser reads it, or null where it cannot (a codec it does not play still sends). */
export function readVideoSeconds(file: File): Promise<number | null> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return Promise.resolve(null);
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (seconds: number | null) => {
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    const timer = setTimeout(() => done(null), LENGTH_WAIT_MS);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

/* --------------------------------------------------------------------------------- an address kept on this device -- */

/** Where a clip's upload stood on this device: the file it is, its address, and until when the address lives. */
interface KeptUpload {
  id: string;
  url: string;
  until: number;
}

const keptKeyOf = (fingerprint: string) => `chanlytics.video-upload.${fingerprint}`;

/** The address a clip was going to, where this device kept one that still lives; storage that can't be read keeps none. */
export function keptUploadOf(fingerprint: string): KeptUpload | null {
  try {
    const raw = window.localStorage.getItem(keptKeyOf(fingerprint));
    const stored = raw ? (JSON.parse(raw) as Partial<KeptUpload>) : null;
    if (stored && typeof stored.id === "string" && typeof stored.url === "string" && typeof stored.until === "number")
      return stored.until > Date.now() ? { id: stored.id, url: stored.url, until: stored.until } : null;
  } catch {
    // A private window, or storage turned off: the clip starts again.
  }
  return null;
}

export function keepUpload(fingerprint: string, upload: { id: string; url: string }): void {
  try {
    window.localStorage.setItem(keptKeyOf(fingerprint), JSON.stringify({ ...upload, until: Date.now() + KEPT_FOR_MS }));
  } catch {
    // Not kept: a reload starts the clip again, which is all it costs.
  }
}

export function forgetUpload(fingerprint: string): void {
  try {
    window.localStorage.removeItem(keptKeyOf(fingerprint));
  } catch {
    // Nothing kept, nothing to forget.
  }
}

/* ---------------------------------------------------------------------------------------------------- the send -- */

/** How much of the clip Stream holds: its offset, `gone` where the address is no more, or null where it did not answer. */
export async function readUploadOffset(url: string): Promise<number | "gone" | null> {
  try {
    const res = await window.fetch(url, { method: "HEAD", headers: TUS });
    if (res.status === 404 || res.status === 410 || res.status === 403) return "gone";
    const offset = Number(res.headers.get("upload-offset"));
    return res.ok && Number.isInteger(offset) && offset >= 0 ? offset : null;
  } catch {
    return null;
  }
}

/** One chunk from `offset`, by XMLHttpRequest so how far it has gone can be said. Answers where Stream now stands, or null. */
function sendChunk(
  url: string,
  file: File,
  { offset, size }: { offset: number; size: number },
  onSent?: (sent: number) => void,
): Promise<number | null> {
  return new Promise((resolve) => {
    const put = new XMLHttpRequest();
    let sentBytes = 0;
    put.open("PATCH", url);
    put.setRequestHeader("tus-resumable", "1.0.0");
    put.setRequestHeader("upload-offset", String(offset));
    put.setRequestHeader("content-type", "application/offset+octet-stream");
    put.upload.onprogress = (e) => {
      if (!onSent || !e.lengthComputable || file.size === 0) return;
      const sent = (offset + e.loaded) / file.size;
      if (sent - sentBytes < SENT_STEP && sent < 1) return;
      sentBytes = sent;
      onSent(Math.min(1, sent));
    };
    put.onload = () => {
      const next = Number(put.getResponseHeader("upload-offset"));
      resolve(put.status === 204 && Number.isInteger(next) && next > offset ? next : null);
    };
    put.onerror = () => resolve(null);
    put.ontimeout = () => resolve(null);
    put.send(file.slice(offset, offset + size));
  });
}

const chunkSize = (): number =>
  typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches ? CHUNK_PHONE : CHUNK_DESK;

/**
 * The whole clip, from where Stream says it stands to its end. A chunk that failed is sent again from where Stream then says
 * it stands, after each wait in turn; past the last, or an address that is gone, it did not arrive.
 */
export async function sendVideo(url: string, file: File, onSent?: (sent: number) => void): Promise<boolean> {
  const chunk = chunkSize();
  let tries = 0;
  let offset: number | "gone" | null = await readUploadOffset(url);
  for (;;) {
    if (offset === "gone") return false;
    if (offset !== null && offset >= file.size) {
      onSent?.(1);
      return true;
    }
    const next =
      offset === null
        ? null
        : await sendChunk(url, file, { offset, size: Math.min(chunk, file.size - offset) }, onSent);
    if (next !== null) {
      offset = next;
      tries = 0;
      continue;
    }
    const wait = SEND_AGAIN_AFTER_MS[tries++];
    if (wait === undefined) return false;
    await waited(wait);
    offset = await readUploadOffset(url);
  }
}
