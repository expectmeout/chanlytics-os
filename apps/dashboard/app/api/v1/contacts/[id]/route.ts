import { AppError } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { recordDecision } from "@/server/verbs";
import { schedule, removeMediaObjects, rescheduleBlobErase } from "@/server/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digits = (s: string) => s.replace(/\D/g, "");

/**
 * DELETE /api/v1/contacts/:id — honour a deletion request.
 *
 * privacy.html promises this and nothing implemented it. Four stores hold the
 * customer: Postgres rows, the private `media` bucket, the Vercel Blob thread,
 * and the scheduled jobs that would still speak to them.
 *
 * ORDER IS THE DESIGN. The Blob job is queued FIRST — durably, as a jobs row —
 * because its key is the customer's phone digits and after the tombstone there
 * is nowhere left to recompute it. Storage objects go SECOND, before the rows
 * that name their paths, and a Storage failure STOPS here rather than running
 * the irreversible delete. The rows go LAST, in one transaction. A crash at
 * any point leaves the request retryable; the reverse order leaves a
 * transcript in Blob that nobody can ever find again.
 */
export const DELETE = withRoute(async (_req, ctx) => {
  const id = String(ctx.params.id ?? "");
  if (!UUID.test(id)) throw new AppError("not_found", "Contact not found.");

  // RLS scopes this read to the caller's workspaces, so a contact they cannot
  // see is a 404 rather than a leak. The ROLE is then decided against the
  // contact's own tenant, never a default workspace — passing it as `wanted`
  // also clears memberContext's `ambiguous` flag, which requireRole rejects.
  const { data: contact, error } = await ctx.supabase
    .from("contacts")
    .select("id, tenant_id, phone_e164, erased_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!contact) throw new AppError("not_found", "Contact not found.");
  requireRole(await memberContext(ctx, contact.tenant_id), "owner");

  // Already erased: never destroy twice, but DO re-drive a leg that is still
  // outstanding. This is the whole retry story for a failed Blob delete.
  if (contact.erased_at) {
    const retry = await rescheduleBlobErase(contact.tenant_id, id);
    return {
      contact_id: id, already_erased: true, erased_at: contact.erased_at,
      blob: retry ? { job_id: retry.jobId, state: "scheduled" } : { state: "settled" },
    };
  }

  /* ---- 1. keys and paths, read while the rows still exist ---- */
  const { data: idents } = await ctx.supabase
    .from("contact_identities").select("external_id").eq("contact_id", id);
  // apps/edge/lib/store.ts keys threads on phone DIGITS: the WhatsApp path uses
  // the wa_id (bare digits) and the Retell path strips the leading "+" from a
  // from_number that has already been proven E.164, so both equal the digits.
  const threadIds = [...new Set(
    [contact.phone_e164 ?? "", ...(idents ?? []).map((i) => i.external_id ?? "")]
      .map(digits).filter(Boolean),
  )];

  const { data: calls } = await ctx.supabase
    .from("calls").select("recording").eq("contact_id", id);
  const { data: media } = await ctx.supabase
    .from("messages").select("media").eq("contact_id", id).not("media", "is", null);
  const paths = [...new Set([
    ...(calls ?? []).map((c) => (c.recording as { storage_path?: string } | null)?.storage_path),
    ...(media ?? []).map((m) => (m.media as { storage_path?: string } | null)?.storage_path),
  ].filter((p): p is string => !!p))];

  /* ---- 2. Blob FIRST: queued durably before anything is destroyed ---- */
  let blob: Json;
  try {
    const { jobId } = await schedule(contact.tenant_id, "blob_thread_erase", new Date(), {
      contact_id: id, namespace: contact.tenant_id, thread_ids: threadIds,
    } as unknown as Json);
    blob = { job_id: jobId, state: "scheduled", threads: threadIds.length };
  } catch (e) {
    // Refusing here is the honest outcome: nothing has been deleted, so the
    // owner retries rather than being told a partial erasure succeeded.
    console.error("erase_blob_schedule_failed", id, e instanceof Error ? e.message : e);
    throw new AppError(
      "internal",
      "Could not queue the stored-conversation erase, so nothing was deleted. Try again.",
      500,
    );
  }

  /* ---- 3. Storage, before the rows that name it ---- */
  const storage = await removeMediaObjects(paths);
  if (storage.error) {
    // Step 4 is irreversible and it deletes the only rows that still name these
    // objects. Stop while the request is entirely retryable rather than leaving
    // a recording behind with nothing pointing at it.
    console.error("erase_storage_failed", id, storage.error);
    throw new AppError(
      "internal",
      "The stored recordings and media could not be removed, so the erasure was not " +
      "completed. The conversation itself has not been deleted; the stored-conversation " +
      "copy is already queued for removal, and repeating this request finishes the job.",
      500,
    );
  }

  /* ---- 4. the rows, in one transaction, carrying the legs into the ledger ---- */
  const { data: rpc, error: rpcErr } = await ctx.supabase.rpc("erase_contact", {
    p_contact_id: id,
    p_legs: {
      blob,
      storage: { requested: storage.requested, removed: storage.removed.length },
    } as unknown as Json,
  });
  if (rpcErr) throw new Error(`erase_contact: ${rpcErr.message}`);
  const out = rpc as unknown as {
    counts?: Record<string, number>; storage_paths?: string[]; jobs_canceled?: number;
  };

  /* ---- 5. anything that landed during the window ----
     The RPC's set is the authoritative one (it also sees messages and calls
     reached only through the conversation). A call ingested between step 3 and
     step 4 would otherwise leave audio behind. remove() on an absent key is a
     no-op, so re-listing an already-removed path costs nothing. */
  const missed = (out.storage_paths ?? []).filter((p) => !paths.includes(p));
  const sweep = missed.length ? await removeMediaObjects(missed) : null;
  if (sweep) {
    // decisions has no UPDATE policy for a session, so a late leg is a second
    // row on the same subject rather than an edit of the first.
    await recordDecision(ctx, contact.tenant_id, "contact", id, "erase", {
      leg: "storage_sweep", requested: sweep.requested,
      removed: sweep.removed.length, error: sweep.error,
    } as Json);
  }

  return {
    contact_id: id,
    erased: true,
    counts: out.counts ?? {},
    jobs_canceled: out.jobs_canceled ?? 0,
    blob,
    storage: {
      requested: storage.requested + (sweep?.requested ?? 0),
      removed: storage.removed.length + (sweep?.removed.length ?? 0),
      error: sweep?.error ?? null,
    },
  };
});

export const dynamic = "force-dynamic";