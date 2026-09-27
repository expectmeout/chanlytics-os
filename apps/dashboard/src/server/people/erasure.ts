import "server-only";
import { erasedEmailHash, erasedPhoneHash } from "@chanlytics/contracts";
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
 * After an erasure: the jobs that carried the customer's number or words.
 *
 * erase_contact cancels what is still scheduled and touches nothing else, so
 * done, failed and canceled outbound_send rows kept `to_phone` and `body` in
 * their payload — a copy of the conversation the erasure promised to remove.
 * Matched by contact id or by the number in any of its forms.
 */
/** The states a job is finished in: its payload is a copy nothing will read again, so an erasure may scrub it. */
export const FINISHED_JOB_STATES = ["done", "failed", "canceled"] as const;

export async function scrubErasedJobs(
  tenantId: string,
  contactId: string,
  phones: string[],
  /** Only these states; every state when absent (after erase_contact has canceled what was scheduled). */
  states?: readonly string[],
): Promise<number> {
  const db = serviceDb();
  let q = db.from("jobs").select("id, payload").eq("tenant_id", tenantId);
  if (states) q = q.in("state", [...states]);
  const { data: rows, error } = await q;
  if (error) throw new Error(`scrub_jobs_read: ${error.message}`);
  const digits = new Set(phones.map((p) => p.replace(/\D/g, "")).filter(Boolean));
  const hit = (rows ?? []).filter((j) => {
    const p = (j.payload ?? {}) as Record<string, unknown>;
    if (p.contact_id === contactId) return true;
    const to = typeof p.to_phone === "string" ? p.to_phone.replace(/\D/g, "") : "";
    return !!to && digits.has(to);
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
