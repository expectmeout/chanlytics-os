/**
 * The key a business's website sends its forms with (00674; the Forms plan, F0, and Ruben's call 9).
 *
 * A key of the workspace's own: one per site, made at random by the dashboard (server/connections/website-forms.ts),
 * shown once, kept only as its sha-256 in form_keys, with when it was last used and when it ends. A key changed is a
 * new one beside it, the old one honoured a day; a key ended is refused at once.
 *
 * The first key, made from the service role's key and the workspace's id as before 00674 (00488), keeps working beside
 * them until it is ended: a site that changes nothing keeps sending. Its row is made at its first use (form_entry_take),
 * so it has a "last used" of its own, which says when the site has moved to a key of its own. A rotated service role
 * key changes it, and a site still on it is refused until it is given a key of the workspace's own; a site that has
 * moved is not touched.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { websiteFormKeyHash } from "@chanlytics/channels/tokens";
import { findFirstFormKey, findFormKeyByHash } from "@chanlytics/db/people";
import { env } from "../shared/env.js";
import type { pg } from "../shared/pg.js";
import { websiteKeyWorks, type TenantId } from "@chanlytics/contracts";

type Db = NonNullable<ReturnType<typeof pg>>;

/** The workspace's first key, or null where the edge has no service role key to make it from. */
function firstKeyOf(tenantId: TenantId): string | null {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createHmac("sha256", key).update(`website-form:${tenantId}`).digest("base64url");
}

/** Whether the key a form came with is the workspace's first key, in constant time; nothing to compare with is no match. */
function isFirstKey(tenantId: TenantId, given: string): boolean {
  const want = firstKeyOf(tenantId);
  if (!want) return false;
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(want, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Which of the workspace's keys a form came with: one of its own (`keyId`), or its first key (`keyId` null); or why it
 * is refused: a key nobody gave this workspace, or one that has ended. A read that fails THROWS: the door answers the
 * site that it could not check, never that the key is wrong.
 */
export async function checkWebsiteFormKey(
  db: Db,
  tenantId: TenantId,
  given: string,
  nowMs: number,
): Promise<{ ok: true; keyId: string | null } | { ok: false; why: "unknown" | "ended" }> {
  if (isFirstKey(tenantId, given)) {
    const first = await findFirstFormKey(db, tenantId);
    return !first || websiteKeyWorks(first, nowMs) ? { ok: true, keyId: null } : { ok: false, why: "ended" };
  }
  const own = await findFormKeyByHash(db, tenantId, websiteFormKeyHash(given));
  if (!own) return { ok: false, why: "unknown" };
  return websiteKeyWorks(own, nowMs) ? { ok: true, keyId: own.id } : { ok: false, why: "ended" };
}
