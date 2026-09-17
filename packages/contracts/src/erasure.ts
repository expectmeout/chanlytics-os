/**
 * The keyed digest an erased person leaves behind.
 *
 * Erasure removes every identifier from the row (00027). It keeps this one
 * derived value (00124) so the passive doors -- the calendar import, a call
 * event for a call that began before the request -- can recognise the number
 * and leave the person erased, without keeping the number. Tenant-keyed, so
 * the same digest names nobody in another workspace. Web Crypto, so the same
 * function runs on the edge and in the dashboard's server.
 */
export async function erasedPhoneHash(tenantId: string, phoneE164: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${tenantId}:${phoneE164}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
