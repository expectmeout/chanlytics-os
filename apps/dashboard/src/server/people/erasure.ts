import "server-only";
import { erasedEmailHash, erasedPhoneHash } from "@chanlytics/contracts";
import { readAllRowsByKey } from "@chanlytics/db";
import { serviceDb } from "../service-db";

/**
 * Remove private objects from the `media` bucket.
 *
 * storage.objects has no RLS policies at all — service-role is the only door,
 * which is why this cannot live on the session client like the rest of an
 * erasure. A key that is already absent is the desired end state, so a short
 * `removed` list is NOT a failure; only a transport error is.
 */
/**
 * The first leg of an erasure: the block, written before anything is
 * destroyed. From this moment the wire refuses the person (deliver.ts reads
 * erasing_since beside erased_at), and the tombstone keeps a keyed digest of
 * each identifier the person has (contracts/erasure.ts) so the calendar
 * import, a late call event, or mail from the address do not bring them back.
 * Both identifiers are named by the caller, present or null: a digest that is
 * not written here can never be written, because the erasure removes what it
 * is computed from. Service role: a session cannot write
 * contacts, and the route has already judged the owner. Idempotent: a second
 * request finds the block written and changes nothing.
 */
export async function beginErasure(
  tenantId: string,
  contactId: string,
  ids: { phone: string | null; email: string | null },
): Promise<void> {
  const phoneHash = ids.phone ? await erasedPhoneHash(tenantId, ids.phone) : null;
  const emailHash = ids.email ? await erasedEmailHash(tenantId, ids.email) : null;
  const { error } = await serviceDb()
    .from("contacts")
    .update({
      erasing_since: new Date().toISOString(),
      ...(phoneHash ? { erased_phone_hash: phoneHash } : {}),
      ...(emailHash ? { erased_email_hash: emailHash } : {}),
    })
    .eq("id", contactId)
    .eq("tenant_id", tenantId)
    .is("erased_at", null)
    .is("erasing_since", null);
  if (error) throw new Error(`begin_erasure: ${error.message}`);
}

export async function removeMediaObjects(
  paths: string[],
): Promise<{ requested: number; removed: string[]; error: string | null }> {
  if (!paths.length) return { requested: 0, removed: [], error: null };
  const { data, error } = await serviceDb().storage.from("media").remove(paths);
  if (error) {
    console.error("media_remove_failed", error.message);
    return { requested: paths.length, removed: [], error: error.message };
  }
  return { requested: paths.length, removed: (data ?? []).map((o) => o.name), error: null };
}

/**
 * After an erasure: the jobs that carried the customer's number, address or words.
 *
 * erase_contact cancels what is still scheduled and touches nothing else, so
 * done, failed and canceled outbound_send rows kept `to_phone` or `to_email` and
 * `body` in their payload — a copy of the conversation the erasure promised to
 * remove. Matched by contact id, by the number in any of its forms, or by the
 * address, cased as it may be.
 *
 * Every job of the workspace is read, a page at a time. One select answered at
 * most 1,000 rows, silently (PostgREST's max_rows), so in any workspace past its
 * thousandth job the scrub looked at the first thousand and left the rest holding
 * the person's number and words (the scorecard of 26 September 2026). Each page
 * is read after the last id of the one before (readAllRowsByKey), not by offset:
 * the nightly purge (00215) deletes finished jobs, and a row deleted during an
 * offset read moves the rest back a place, so one would never be read. A read
 * that stops short is a failure, never a scrub believed whole: the route refuses
 * before anything is deleted.
 */
/** The states a job is finished in: its payload is a copy nothing will read again, so an erasure may scrub it. */
export const FINISHED_JOB_STATES = ["done", "failed", "canceled"] as const;

/** More jobs than any workspace holds; a read that reaches it throws rather than scrub a part and call it all. */
const SCRUB_READ_CAP = 500_000;

export async function scrubErasedJobs(
  tenantId: string,
  contactId: string,
  /** Every spelling of the person's number, and their address: an email send carries `to_email`, never a number. */
  identifiers: readonly string[],
  /** Only these states; every state when absent (after erase_contact has canceled what was scheduled). */
  states?: readonly string[],
): Promise<number> {
  const db = serviceDb();
  const rows = await readAllRowsByKey<{ id: string; payload: unknown }>(
    "scrub_jobs_read",
    (job) => job.id,
    (after, size) => {
      let q = db.from("jobs").select("id, payload").eq("tenant_id", tenantId);
      if (states) q = q.in("state", [...states]);
      if (after) q = q.gt("id", after);
      return q.order("id").limit(size);
    },
    SCRUB_READ_CAP,
    (what, cap) => {
      throw new Error(`${what}: more than ${cap} jobs; none scrubbed`);
    },
  );
  const isAddress = (s: string) => s.includes("@");
  const digits = new Set(
    identifiers
      .filter((s) => !isAddress(s))
      .map((s) => s.replace(/\D/g, ""))
      .filter(Boolean),
  );
  const addresses = new Set(identifiers.filter(isAddress).map((s) => s.trim().toLowerCase()));
  const hit = rows.filter((j) => {
    const p = (j.payload ?? {}) as Record<string, unknown>;
    if (p.contact_id === contactId) return true;
    const to = typeof p.to_phone === "string" ? p.to_phone.replace(/\D/g, "") : "";
    if (to && digits.has(to)) return true;
    const address = typeof p.to_email === "string" ? p.to_email.trim().toLowerCase() : "";
    return !!address && addresses.has(address);
  });
  for (const j of hit) {
    const { error: uerr } = await db
      .from("jobs")
      .update({ payload: { scrubbed_at: new Date().toISOString(), reason: "contact erased" } })
      .eq("id", j.id);
    if (uerr) throw new Error(`scrub_jobs_update: ${uerr.message}`);
  }
  return hit.length;
}
