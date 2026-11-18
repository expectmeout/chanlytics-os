/**
 * A Drive file's bytes, read by the app itself (the footage sources plan, "Taking a file in"). Two reads only: a clip's
 * first MiB, which gives it the fingerprint an upload has, and a photo whole, which goes into Storage. A video's own
 * bytes never come this way: the video platform fetches them through the relay.
 *
 * Each read is one download to Google (200 of its units since 1 May 2026), under an hour's key in a header. The key is
 * never part of an address, and nothing of the answer but its bytes and its size is kept.
 *
 * Drive's "not now" (429, or a 403 that names a rate or a quota) is the verdict `pace`, a 404 `gone`, a 401 or any
 * other 403 `no_access`. A reply that never came, or a body cut short, is no verdict: the read throws and its job is
 * tried again.
 */
import { MIN_MS, recordOrEmpty, recordOrNull, type SourceReply } from "@chanlytics/contracts";
import { fetchFromProvider, type ProviderReply } from "../shared/provider-fetch";

const DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files";

/** How long to rest when Drive says "not now" and names no time. */
const DRIVE_BYTES_REST_MS = MIN_MS;

/** What a test hands in instead of the network. */
type DriveBytesDeps = Parameters<typeof fetchFromProvider>[3];

/** A file's first bytes as Drive sent them, and how large the whole file is. */
interface DriveBytes {
  /** The file's first `most` bytes, or all of it where it is shorter. */
  bytes: Uint8Array;
  /** The whole file's size, as Drive's answer says it; the bytes read where it says none. */
  size: number;
}

/** Drive gave no bytes to act on: the read's job is tried again. */
class DriveBytesUnread extends Error {
  constructor(
    readonly status: number,
    reason: string,
  ) {
    super(`drive bytes: ${reason} (status ${status})`);
    this.name = "DriveBytesUnread";
  }
}

/** Drive's own one-word reason on a refusal (`error.errors[0].reason`), or none. */
function refusalReasonOf(reply: Pick<ProviderReply, "json">): string {
  const errors = recordOrNull(recordOrNull(reply.json)?.error)?.errors;
  const reason = Array.isArray(errors) ? recordOrEmpty(errors[0]).reason : null;
  return typeof reason === "string" ? reason : "";
}

/** The whole file's size from a range's answer (`bytes 0-1048575/56812805`), or null where Drive names none. */
function wholeSizeOf(headers: Headers | null): number | null {
  const total = /\/(\d+)$/.exec(headers?.get("content-range") ?? "")?.[1];
  return total === undefined ? null : Number(total);
}

/** A body read to its end or to `most` bytes, whichever comes first; what is past `most` is never held. */
async function readUpTo(body: ReadableStream<Uint8Array>, most: number): Promise<Uint8Array> {
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let held = 0;
  try {
    while (held < most) {
      const { done, value } = await reader.read();
      if (done) break;
      const part = value.subarray(0, most - held);
      parts.push(part);
      held += part.length;
    }
  } finally {
    // Whatever Drive still had to send is not wanted: the connection is given back.
    await reader.cancel().catch(() => undefined);
  }
  const out = new Uint8Array(held);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/**
 * The first `most` bytes of one Drive file, and the whole file's size. A file shorter than `most` comes whole, so one
 * read serves both a clip's first MiB and a photo. `timeoutMs` bounds the answer and its body together.
 */
export async function readDriveBytes(
  accessToken: string,
  fileId: string,
  read: { most: number; timeoutMs: number },
  deps?: DriveBytesDeps,
): Promise<SourceReply<DriveBytes>> {
  const reply = await fetchFromProvider(
    "google",
    `${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Range: `bytes=0-${Math.max(1, Math.floor(read.most)) - 1}` },
      timeoutMs: read.timeoutMs,
      // Asked once more when no answer came: a read reads the same.
      tries: 2,
      idempotent: true,
      stream: true,
    },
    deps,
  );
  if (reply.outcome !== "ok" || !reply.body) {
    if (reply.status === 429 || (reply.status === 403 && /ratelimit|dailylimit|quota/i.test(refusalReasonOf(reply))))
      return { verdict: "pace", restMs: reply.retryAfterMs ?? DRIVE_BYTES_REST_MS };
    if (reply.status === 404) return { verdict: "gone" };
    if (reply.status === 401 || reply.status === 403) return { verdict: "no_access" };
    throw new DriveBytesUnread(reply.status, reply.error ?? "no answer");
  }
  let bytes: Uint8Array;
  try {
    bytes = await readUpTo(reply.body, read.most);
  } catch (failure) {
    // The body stopped part way (the bound ended it, or the network did): half a file is no file.
    throw new DriveBytesUnread(reply.status, failure instanceof Error ? failure.message : "the body stopped");
  }
  return { verdict: "ok", answer: { bytes, size: wholeSizeOf(reply.headers) ?? bytes.length } };
}
