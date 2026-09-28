/**
 * Bytes for the digests and signatures: a string's UTF-8, and a digest as hex. Four modules made their own encoder and
 * two their own hex; the encoder keeps no state between calls, so one serves them all.
 */

/** Encodes a string as UTF-8. */
export const utf8Encoder = new TextEncoder();

/** A digest's bytes as lowercase hex, two characters a byte. */
export const hexOf = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
