/**
 * The identities the runner makes for itself, over Web Crypto so this package
 * knows no runtime: a run row's id is derived from what it is (the round, the
 * phase, the term), so two starters of one round make the same row and the
 * second insert meets the first (E1: the row is made once, then claimed once).
 */

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

/** A uuid, version 5-shaped, from the SHA-1 of its parts: stable across invocations, unique across rounds. */
export async function runIdFor(roundId: string, phase: "probe" | "main" | "check", term: string): Promise<string> {
  const h = hex(await crypto.subtle.digest("SHA-1", enc.encode(`lead_run:${roundId}:${phase}:${term}`)));
  const v = `${h.slice(0, 12)}5${h.slice(13, 16)}${((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 32)}`;
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`;
}
