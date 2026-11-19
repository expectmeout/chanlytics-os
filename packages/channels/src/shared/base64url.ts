/**
 * Base64url, both ways, over Web APIs alone (btoa, atob): the text a signed state, a Gmail message and a token's claims
 * travel as. No padding out, any padding in.
 */
import { utf8Bytes } from "@chanlytics/contracts";

export function b64url(bytes: Uint8Array | string): string {
  const b = typeof bytes === "string" ? utf8Bytes(bytes) : bytes;
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64url(text: string): Uint8Array {
  const pad = text.length % 4 === 0 ? "" : "=".repeat(4 - (text.length % 4));
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
