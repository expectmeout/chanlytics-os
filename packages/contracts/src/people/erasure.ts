/**
 * The LEGACY digest an erased person left behind: sha256 of "<tenant>:<value>".
 *
 * Since 00249 the database makes every digest (erasure_digest, erasure_digests): this one until the re-key has run,
 * and after it the same digest keyed with a pepper only Vault holds, so a dump of the tables no longer lets anyone hash
 * every number to read who asked to be forgotten. Nothing in production computes a digest here any more; the edge and
 * the dashboard ask the database. This stays as the inner half the database keys, which tests use to say what the
 * database should have stored before the re-key.
 *
 * Erasure removes every identifier from the row (00027, and 00125 for the
 * address). It keeps one derived value per identifier (00124, 00125) so the
 * passive doors -- the calendar import, a call event for a call that began
 * before the request, an email arriving from the address -- can recognise the
 * person and leave them erased, without keeping the number or the address.
 * Tenant-keyed, so the same digest names nobody in another workspace. Web
 * Crypto, so the same function runs on the edge and in the dashboard's server.
 */
async function keyedDigest(tenantId: string, identifier: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${tenantId}:${identifier}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Of the number as stored: E.164 with its "+". */
export function erasedPhoneHash(tenantId: string, phoneE164: string): Promise<string> {
  return keyedDigest(tenantId, phoneE164);
}

/** Of the address as stored: normalizeEmail's output, never a raw header. */
export function erasedEmailHash(tenantId: string, email: string): Promise<string> {
  return keyedDigest(tenantId, email);
}

/**
 * A lead's email, phone or place id on the never-again list (lead_suppressions,
 * 00140): the same keyed digest, so SQL's lead_suppression_hash(tenant, value)
 * and this agree byte for byte (lead-engine.db.test.mjs proves it). The value
 * is the one stored: E.164 with its "+", normalizeEmail's output, the place id.
 */
export function leadSuppressionHash(tenantId: string, value: string): Promise<string> {
  return keyedDigest(tenantId, value);
}
