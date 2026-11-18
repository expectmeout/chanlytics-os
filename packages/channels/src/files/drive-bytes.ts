/**
 * A Drive file's bytes, read by the app itself (the footage sources plan, "Taking a file in"). Two reads only: a clip's
 * first MiB, which gives it the fingerprint an upload has, and a photo whole, which goes into Storage. A video's own
 * bytes never come this way: the video platform fetches them through the relay.
 *
 * Each read is one download to Google (200 of its units since 1 May 2026), under an hour's key in a header. The key is
 * never part of an address, and nothing of the answer but its bytes and its size is kept.
 *
 * A refusal is judged where every refusal of Drive's is (drive.ts driveRefusalOf): its "not now" is the verdict
 * `pace`, a 404 `gone`, a 403 about the file `no_access`; a refused key (a 401) or a missing scope throws
 * SourceKeyRefused, which only the sync can settle. A reply that never came, or a body cut short, is no verdict: the
 * read throws and its job is tried again.
 */
import type { SourceReply } from "@chanlytics/contracts";
import { fetchFromProvider } from "../shared/provider-fetch";
import { driveRefusalOf } from "./drive";

const DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files";

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
  if (reply.outcome !== "ok") return driveRefusalOf("files.get media", reply, "item");
  if (!reply.body) throw new DriveBytesUnread(reply.status, "no body");
  let bytes: Uint8Array;
  try {
    bytes = await readUpTo(reply.body, read.most);
  } catch (failure) {
    // The body stopped part way (the bound ended it, or the network did): half a file is no file.
    throw new DriveBytesUnread(reply.status, failure instanceof Error ? failure.message : "the body stopped");
  }
  return { verdict: "ok", answer: { bytes, size: wholeSizeOf(reply.headers) ?? bytes.length } };
}
