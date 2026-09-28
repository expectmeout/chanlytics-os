/**
 * Bytes for the digests and signatures: a string's UTF-8, and a digest as hex. Four modules made their own encoder and
 * two their own hex; the encoder keeps no state between calls, so one serves them all. It is made on first use, not
 * when contracts loads: the shell's mockup bundle and the e2e fixtures run contracts where there is no TextEncoder.
 */

let encoder: InstanceType<typeof TextEncoder> | null = null;

/** A string's UTF-8 bytes. */
export const utf8Bytes = (s: string): ReturnType<InstanceType<typeof TextEncoder>["encode"]> =>
  (encoder ??= new TextEncoder()).encode(s);

/** A digest's bytes as lowercase hex, two characters a byte. */
export const hexOf = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
