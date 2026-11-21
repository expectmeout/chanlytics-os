/**
 * A website's key for the form door (00674; the Forms plan, F0): made at random where an owner asks for one (the
 * dashboard), shown to them once, and kept only as its sha-256, which the edge's door looks it up by. 32 random bytes
 * in base64url: 43 characters, the length of the first key made from the platform's own (contracts WebsiteFormBody).
 */
import { createHash, randomBytes } from "node:crypto";

/** A new key: shown once, never kept. */
export function newWebsiteFormKey(): string {
  return randomBytes(32).toString("base64url");
}

/** A key as it is kept and looked up: its sha-256, in hex. */
export function websiteFormKeyHash(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}
