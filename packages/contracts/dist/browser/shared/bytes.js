let encoder = null;
export const utf8Bytes = (s) => (encoder ??= new TextEncoder()).encode(s);
export const hexOf = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
