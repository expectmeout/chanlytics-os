/**
 * The identities the runner makes for itself, over Web Crypto so this package
 * knows no runtime: a run row's id is derived from what it is (the round, the
 * phase, the term), so two starters of one round make the same row and the
 * second insert meets the first (E1: the row is made once, then claimed once).
 */
import { makeUuidV5 } from "../shared/uuid-v5";
import { utf8Bytes, hexOf } from "@chanlytics/contracts";

export async function hashSha256Hex(text: string): Promise<string> {
  return hexOf(await crypto.subtle.digest("SHA-256", utf8Bytes(text)));
}

/** A uuid, version 5-shaped, from its parts (uuid-v5.ts): stable across invocations, unique across rounds. */
export async function runIdFor(roundId: string, phase: "probe" | "main" | "check", term: string): Promise<string> {
  return makeUuidV5(`lead_run:${roundId}:${phase}:${term}`);
}

/**
 * A main run of a term whose earlier tries failed (decision 0133, retries.ts): the round, the term and the try, so each
 * try is a row of its own and a starter that repeats one meets the row it made. The first try is runIdFor's own.
 */
export async function retryRunIdFor(roundId: string, term: string, tries: number): Promise<string> {
  return tries > 0 ? makeUuidV5(`lead_run:${roundId}:main:${term}:try${tries}`) : runIdFor(roundId, "main", term);
}
