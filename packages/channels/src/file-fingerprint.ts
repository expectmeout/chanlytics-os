/**
 * What makes two files one (decision 0099): the sha256 of a file's first MiB and its size. Reading a whole file to compare
 * it would be a large read for what is almost always a photo; these two together tell a re-sent file from a new one, and
 * take the same read whether it arrived by a member's upload or a fetch.
 */
import { createHash } from "node:crypto";

/** How much of a file is read for its fingerprint. */
export const FINGERPRINT_BYTES = 1_048_576;

/** A file's fingerprint, from its size and at least its first FINGERPRINT_BYTES (or all of it, where it is shorter). */
export function fileFingerprintOf(head: Uint8Array, size: number): string {
  return createHash("sha256").update(head.subarray(0, FINGERPRINT_BYTES)).update(String(size)).digest("hex");
}
