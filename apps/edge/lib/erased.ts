/**
 * The erased, recognised by the digest they left (contracts/erasure.ts,
 * migration 00124), so the passive doors leave them erased.
 *
 * Passive: the calendar import, which makes people from appointments; a call
 * event for a call that began before the deletion request, which would make
 * the person again with the call's data. Active -- a new message, a new call
 * -- is the person coming back, and is not this file's business.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./workspace/db.js";
import { erasedPhoneHash } from "./workspace/contracts.js";

type Db = SupabaseClient<Database>;

export interface Tombstone { erased_at: string | null; erasing_since: string | null }

/** The tombstones among these numbers, by number. A read that fails throws: "we could not check" is not "nobody". */
export async function erasedTombstones(db: Db, tenantId: string, phones: string[]): Promise<Map<string, Tombstone>> {
  const out = new Map<string, Tombstone>();
  const unique = [...new Set(phones.filter(Boolean))];
  if (!unique.length) return out;
  const hashes = await Promise.all(unique.map((p) => erasedPhoneHash(tenantId, p)));
  const byHash = new Map(unique.map((p, i) => [hashes[i], p]));
  const { data, error } = await db
    .from("contacts")
    .select("erased_phone_hash, erased_at, erasing_since")
    .eq("tenant_id", tenantId)
    .in("erased_phone_hash", hashes);
  if (error) throw new Error(`erased_tombstones: ${error.message}`);
  for (const row of (data ?? []) as { erased_phone_hash: string | null; erased_at: string | null; erasing_since: string | null }[]) {
    const phone = row.erased_phone_hash ? byHash.get(row.erased_phone_hash) : undefined;
    if (phone) out.set(phone, { erased_at: row.erased_at, erasing_since: row.erasing_since });
  }
  return out;
}

/**
 * Whether a call from this number, begun at this moment, belongs to an
 * erasure: the request came after the call began, so the call's data must
 * not make the person again. A call begun after the request is the person
 * calling back, and is not erased.
 */
export async function erasedBeforeCall(db: Db, tenantId: string, phoneE164: string, startedAtIso: string): Promise<boolean> {
  const t = (await erasedTombstones(db, tenantId, [phoneE164])).get(phoneE164);
  if (!t) return false;
  const since = t.erasing_since ?? t.erased_at;
  return !!since && Date.parse(startedAtIso) < Date.parse(since);
}
