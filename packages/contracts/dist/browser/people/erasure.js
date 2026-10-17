async function legacyDigest(tenantId, identifier) {
  const bytes = new TextEncoder().encode(`${tenantId}:${identifier}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function legacyErasedPhoneHash(tenantId, phoneE164) {
  return legacyDigest(tenantId, phoneE164);
}
export function legacyErasedEmailHash(tenantId, email) {
  return legacyDigest(tenantId, email);
}
export function legacyLeadSuppressionHash(tenantId, value) {
  return legacyDigest(tenantId, value);
}
