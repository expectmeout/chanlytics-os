/**
 * The identities the runner makes for itself, over Web Crypto so this package
 * knows no runtime: a run row's id is derived from what it is (the round, the
 * phase, the term), so two starters of one round make the same row and the
 * second insert meets the first (E1: the row is made once, then claimed once).
 */
import { uuidV5 } from "../uuid-v5";

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

/** A uuid, version 5-shaped, from its parts (uuid-v5.ts): stable across invocations, unique across rounds. */
export async function runIdFor(roundId: string, phase: "probe" | "main" | "check", term: string): Promise<string> {
  return uuidV5(`lead_run:${roundId}:${phase}:${term}`);
}
