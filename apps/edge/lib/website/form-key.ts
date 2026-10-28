/**
 * The key a business's website sends its forms with (00488): one per workspace, made from the service role's key and the
 * workspace's id, so no table keeps it and no page shows it. The site keeps it in its own environment, set by hand from
 * the same derivation; a rotated service role key changes it, and the site's forms are refused until it is set again.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

/** The workspace's key, or null where the edge has no service role key to make it from. */
function websiteFormKeyOf(tenantId: string): string | null {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createHmac("sha256", key).update(`website-form:${tenantId}`).digest("base64url");
}

/** The key a form came with, against its workspace's, in constant time; nothing to compare with is no match. */
export function websiteFormKeyMatches(tenantId: string, given: string): boolean {
  const want = websiteFormKeyOf(tenantId);
  if (!want) return false;
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(want, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
