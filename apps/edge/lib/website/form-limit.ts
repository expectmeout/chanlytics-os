/**
 * The website form door's limit (00726; the outside reviews' M3). The door is the one a stranger's script can post to
 * with a site's key, and each entry it keeps makes a person, a notice, a drafted reply and, for a sign-up, an email. So
 * a key's entries in a minute and a site's in an hour are counted by the house's limiter (take_rate, the count the
 * dashboard's routes take), and an entry past either is HELD for a look (form_entry_take's p_held_why): kept with who it
 * is about as typed, answered ok to the site, never dropped, and nothing it owes starts until a member lets it through.
 * A real visitor is never refused.
 *
 * A count that cannot be read holds nobody: the entry is kept as any other, and the failure is logged. A test from the
 * site (a developer's own tries) is not counted.
 */
import { HOUR_MS, MIN_MS, recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import { takeRateBucket } from "@chanlytics/db/workspace";
import { errField, type Logger } from "../shared/log.js";
import type { pg } from "../shared/pg.js";

type Db = NonNullable<ReturnType<typeof pg>>;

/**
 * The two limits. A key's: more in one minute than a site's own visitors send, which a script's loop passes at once.
 * A site's, whichever of its keys sent them: a hosted form's own hour (the dashboard's `form_day`).
 */
export const WEBSITE_FORM_LIMITS = {
  key: { bucket: "website_form_key", limit: 20, windowMs: MIN_MS },
  site: { bucket: "website_form_site", limit: 120, windowMs: HOUR_MS },
} as const;

/** Who sent an entry: the workspace, its key (null: the first key) and that key's site (null until the key's first use). */
interface FormSender {
  tenantId: TenantId;
  keyId: string | null;
  siteId: string | null;
}

/** One count taken; whether it is past its limit. A failed count THROWS. */
async function pastLimit(db: Db, rule: (typeof WEBSITE_FORM_LIMITS)["key" | "site"], actor: string): Promise<boolean> {
  const { data, error } = await takeRateBucket(db, {
    p_bucket: rule.bucket,
    p_actor: actor,
    p_limit: rule.limit,
    p_window_ms: rule.windowMs,
  });
  if (error) throw error;
  return recordOrEmpty(data).allowed === false;
}

/**
 * Why an entry is held for a look, or null for one within both limits. The key's minute is counted first, so a flood
 * through one key spends none of its site's hour once the key is past its own.
 */
export async function websiteFormHeldWhy(db: Db, log: Logger, sender: FormSender): Promise<"too_many" | null> {
  const key = sender.keyId ?? "first";
  try {
    if (await pastLimit(db, WEBSITE_FORM_LIMITS.key, `${sender.tenantId}:${key}`)) return "too_many";
    // A key with no site yet (its first use makes one) is its own site for this count.
    if (await pastLimit(db, WEBSITE_FORM_LIMITS.site, `${sender.tenantId}:${sender.siteId ?? key}`)) return "too_many";
    return null;
  } catch (e) {
    // The count could not be read: nobody is held for that, and the entry is kept as any other.
    log.error("website_form_failed", { tenant_id: sender.tenantId, step: "limit", error: errField(e) });
    return null;
  }
}
