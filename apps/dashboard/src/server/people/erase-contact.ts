/**
 * Honour a deletion request: the whole of DELETE /api/v1/contacts/:id, behind the route that judges who may ask (the
 * owner, on the contact's own workspace, on a fresh session).
 *
 * privacy.html promises this and nothing implemented it. Three stores hold the customer: Postgres rows, the private
 * `media` bucket, and the scheduled jobs that would still speak to them. ORDER IS THE DESIGN. The keys are read first
 * (reads only, retryable with nothing to undo). Then the BLOCK (beginErasure, 00124): from that moment the wire refuses
 * the person and the passive doors will not bring them back, whatever happens to the legs below. Then the copies keyed
 * on the number (Ask turns, finished jobs) are scrubbed while the number is still in hand, fail-closed, because nothing
 * after the tombstone can find them again. Storage objects go next, before the rows that name their paths, and a
 * Storage failure STOPS there rather than running the irreversible delete; the person is blocked meanwhile, not live.
 * The rows go LAST, in one transaction. A crash at any point leaves the request retryable.
 *
 * The legs that use the service role (the block, Storage, the jobs scrub) are people/erasure.ts's; this module is the
 * order they run in, on the session's client for the rest.
 */
import { AppError } from "@chanlytics/contracts";
import { appointmentsScrub, scrubPersonNotes, scrubProviderEvents, type Json } from "@chanlytics/db";
import { serviceDb } from "@/server/service-db";
import { type erasureScope, recordDecision } from "@/server/verbs";
import {
  removeMediaObjects,
  scrubErasedJobs,
  beginErasure,
  erasureKeys,
  FINISHED_JOB_STATES,
} from "@/server/people/erasure";
import type { RouteContext } from "@/server/with-route";
import { log } from "@/server/log";

export async function eraseContact(ctx: RouteContext, contact: ErasedContact) {
  return contact.erased_at ? redriveErasure(ctx, contact) : erasePerson(ctx, contact);
}

/** The person an erasure acts on, as erasureScope read them: live, or already erased and re-driven. */
type ErasedContact = Awaited<ReturnType<typeof erasureScope.load>>;

/**
 * Already erased: never destroy twice, but DO re-drive every leg that may
 * still be outstanding. The legs after step 4 are best effort by design --
 * they log and carry on rather than turn a finished erasure into a failure
 * -- so a transient refusal on any of them leaves the erased person's
 * words in Ask, their number in a done job's payload, or their name on a
 * policy row. All of them are deletes or overwrites keyed on the contact,
 * so repeating one that already ran costs nothing.
 *
 * The needles are empty here, nothing is left to recover them from, and
 * nothing needs them: step 2 scrubbed every copy keyed on the number before
 * anything was destroyed, fail-closed, and erase_contact scrubs the jobs it
 * cancels in the same transaction. A re-drive repeats the id-keyed legs.
 */
async function redriveErasure(ctx: RouteContext, contact: ErasedContact) {
  const needles: string[] = [];
  const polErr = await dropPersonPolicy(ctx, contact);
  const { error: askErr } = await scrubAskTurns(ctx, contact, needles);
  if (askErr) log.error("erase_ask_scrub_failed", { contact: contact.id, error: askErr.message });
  const jobs = await scrubJobsBestEffort(contact, needles);
  return {
    contact_id: contact.id,
    already_erased: true,
    erased_at: contact.erased_at,
    redriven: { policy: !polErr, ask: !askErr, jobs },
  };
}

/** A live person, erased in the order the design above gives, and what was removed. */
async function erasePerson(ctx: RouteContext, contact: ErasedContact) {
  const keys = await readErasureKeys(ctx, contact);
  await blockErasure(contact);
  await scrubCopiesFirst(ctx, contact, keys);
  const storage = await removeStoredObjects(contact, keys.paths);
  const out = await eraseRows(ctx, contact, storage);
  await forgetAfterRows(ctx, contact, keys);
  const sweep = await sweepLateObjects(ctx, contact, out, keys.paths);
  return erasedAnswer(contact.id, out, storage, sweep);
}

/** What step 1 read while the rows still exist: the keys a copy is found by (erasureKeys), and the Storage paths. */
interface ErasureKeys {
  identifiers: string[];
  needles: string[];
  paths: string[];
}

/** What Storage said it removed (removeMediaObjects). */
type StorageLeg = Awaited<ReturnType<typeof removeMediaObjects>>;

/** What erase_contact answers: what it deleted, the paths it saw, the scheduled jobs it canceled. */
interface ErasedRows {
  counts?: Record<string, number>;
  storage_paths?: string[];
  jobs_canceled?: number;
}

/* ---- 1. keys and paths, read while the rows still exist ---- */
// THESE READS FAIL CLOSED. Nothing has been destroyed yet, so a read that
// could not be made is a retry — and an identities read that came back
// empty because it errored would scrub the Ask turns without the WhatsApp
// wa_ids, leaving the customer's number quoted in an assistant's memory
// while the owner is told the person was erased.
function refuseUnreadKey(what: string, e: { message: string } | null): void {
  if (e)
    throw new AppError("internal", `Could not read this person's ${what}, so nothing was deleted. Try again.`, 500);
}

async function readErasureKeys(ctx: RouteContext, contact: ErasedContact): Promise<ErasureKeys> {
  const id = contact.id;
  const { data: idents, error: identErr } = await ctx.supabase
    .from("contact_identities")
    .select("external_id")
    .eq("contact_id", id);
  refuseUnreadKey("WhatsApp identities", identErr);
  // The number and the address, as a finished job carries them (`identifiers`) and as an Ask turn may spell them
  // (`needles`): read off the row and its identities while they exist.
  const { identifiers, needles } = erasureKeys(
    contact,
    (idents ?? []).map((i) => i.external_id),
  );

  const { data: calls, error: callErr } = await ctx.supabase.from("calls").select("recording").eq("contact_id", id);
  refuseUnreadKey("call recordings", callErr);
  const { data: media, error: mediaErr } = await ctx.supabase
    .from("messages")
    .select("media")
    .eq("contact_id", id)
    .not("media", "is", null);
  refuseUnreadKey("stored media", mediaErr);
  return { identifiers, needles, paths: storedPathsOf(calls ?? [], media ?? []) };
}

/** Every Storage path a call's recording or a message's media names, once each. */
function storedPathsOf(calls: { recording: unknown }[], media: { media: unknown }[]): string[] {
  return [
    ...new Set(
      [
        ...calls.map((c) => (c.recording as { storage_path?: string } | null)?.storage_path),
        ...media.map((m) => (m.media as { storage_path?: string } | null)?.storage_path),
      ].filter((p): p is string => !!p),
    ),
  ];
}

/* ---- the block, before anything is destroyed ---- */
// After the reads (they destroy nothing and a failed one is a retry with
// nothing to undo), before the first destructive leg. Written with the
// number still on the row: the digest the tombstone keeps is computed
// from it. A write that could not be made is a retry too.
async function blockErasure(contact: ErasedContact): Promise<void> {
  try {
    await beginErasure(contact.tenant_id, contact.id, {
      phone: contact.phone_e164 ?? null,
      email: contact.email ?? null,
    });
  } catch (e) {
    log.error("erase_begin_failed", { contact: contact.id, error: e });
    throw new AppError(
      "internal",
      "Could not mark this person as being erased, so nothing was deleted. Try again.",
      500,
    );
  }
}

/* ---- 2. the copies keyed on the number, while the number is still in hand ---- */
// FAIL CLOSED, and BEFORE anything is destroyed. An Ask turn that quoted
// the number and a finished job that carried it (`to_phone` in a done
// outbound_send) are found by digits the tombstone will not hold and
// contact_identities will no longer have, so a re-driven erasure could
// never reach them. Scrubbed here, a transient refusal is a retry with
// nothing to undo; scrubbed only after the rows are gone, it was a copy
// kept for ever. Scheduled jobs are left to erase_contact, which cancels
// and scrubs them in the same transaction as the delete; one in flight
// finishes first, and the best-effort pass after step 4 reaches it.
async function scrubCopiesFirst(ctx: RouteContext, contact: ErasedContact, keys: ErasureKeys): Promise<void> {
  const { error: askErr } = await scrubAskTurns(ctx, contact, keys.needles);
  if (askErr) {
    log.error("erase_ask_prescrub_failed", { contact: contact.id, error: askErr.message });
    throw new AppError(
      "internal",
      "The assistant's memory of this person could not be scrubbed, so nothing was deleted. Try again.",
      500,
    );
  }
  try {
    await scrubErasedJobs(contact.tenant_id, contact.id, keys.identifiers, FINISHED_JOB_STATES);
  } catch (e) {
    log.error("erase_jobs_prescrub_failed", { contact: contact.id, error: e });
    throw new AppError(
      "internal",
      "The finished jobs that carried this person's number could not be scrubbed, so nothing was deleted. Try again.",
      500,
    );
  }
  // The deliveries the intake ledger keeps a week (00336) hold the number and the words as a provider sent them: found
  // by every spelling the Ask scrub uses, while they are in hand, and fail closed for the same reason as the jobs.
  try {
    await scrubProviderEvents(serviceDb(), contact.tenant_id, keys.needles);
  } catch (e) {
    log.error("erase_deliveries_prescrub_failed", { contact: contact.id, error: e });
    throw new AppError(
      "internal",
      "The deliveries kept for replay that carried this person's number could not be scrubbed, so nothing was deleted. Try again.",
      500,
    );
  }
  // Other people's notes that carry their number or address (00341, decision 0036): the needle overwritten in place,
  // the note kept, by the same spellings and for the same reason. Their own notes go with them in step 4.
  try {
    await scrubPersonNotes(serviceDb(), contact.tenant_id, contact.id, keys.needles);
  } catch (e) {
    log.error("erase_notes_prescrub_failed", { contact: contact.id, error: e });
    throw new AppError(
      "internal",
      "The notes that carried this person's number or address could not be scrubbed, so nothing was deleted. Try again.",
      500,
    );
  }
}

/* ---- 3. Storage, before the rows that name it ---- */
async function removeStoredObjects(contact: ErasedContact, paths: string[]): Promise<StorageLeg> {
  const id = contact.id;
  const storage = await removeMediaObjects(contact.tenant_id, paths);
  if (storage.error) {
    // Step 4 is irreversible and it deletes the only rows that still name these
    // objects. Stop while the request is entirely retryable rather than leaving
    // a recording behind with nothing pointing at it.
    log.error("erase_storage_failed", { contact: id, error: storage.error });
    throw new AppError(
      "internal",
      "The stored recordings and media could not be removed, so the erasure was not " +
        "completed. Nothing has been deleted, and repeating this request finishes the job.",
      500,
    );
  }
  return storage;
}

/* ---- 4. the rows, in one transaction, carrying the legs into the ledger ---- */
async function eraseRows(ctx: RouteContext, contact: ErasedContact, storage: StorageLeg): Promise<ErasedRows> {
  const { data: rpc, error: rpcErr } = await ctx.supabase.rpc("erase_contact", {
    p_contact_id: contact.id,
    p_legs: {
      storage: { requested: storage.requested, removed: storage.removed.length },
    } as unknown as Json,
  });
  if (rpcErr) throw new Error(`erase_contact: ${rpcErr.message}`);
  return rpc as unknown as ErasedRows;
}

/** After the rows: the legs that are best effort, because past step 4 the person IS erased. */
async function forgetAfterRows(ctx: RouteContext, contact: ErasedContact, keys: ErasureKeys): Promise<void> {
  // The person's own receptionist setting goes with them: a policy row scoped
  // to an erased contact is a name that outlives its erasure.
  await dropPersonPolicy(ctx, contact);
  // The Ask turns that quoted them, for every member of the workspace: an
  // assistant's memory of a person is a name that outlives its erasure too.
  // The needles, read off the row before erase_contact ran, because the row no longer has them. Step 2
  // already scrubbed with them; this pass catches a turn written since, and a re-driven erasure scrubs
  // by the id alone.
  const { data: scrubbed, error: askErr } = await scrubAskTurns(ctx, contact, keys.needles);
  if (askErr) log.error("erase_ask_scrub_failed", { contact: contact.id, error: askErr.message });
  else log.info("erase_ask_scrubbed", { contact: contact.id, messages: scrubbed });
  // The jobs that carried their number or words. erase_contact cancels what
  // is still scheduled; done, failed and canceled rows kept `to_phone` and
  // `body` in their payload forever.
  const jobsScrubbed = await scrubJobsBestEffort(contact, keys.identifiers);
  log.info("erase_jobs_scrubbed", { contact: contact.id, jobs: jobsScrubbed });
  await scrubKeptDeliveriesBestEffort(contact, keys.needles);
  await scrubOthersNotesBestEffort(contact, keys.needles);
  await scrubAppointmentsBestEffort(contact, keys.needles);
}

/* ---- 5. anything that landed during the window ----
   The RPC's set is the authoritative one (it also sees messages and calls
   reached only through the conversation). A call ingested between step 3 and
   step 4 would otherwise leave audio behind. remove() on an absent key is a
   no-op, so re-listing an already-removed path costs nothing. */
async function sweepLateObjects(
  ctx: RouteContext,
  contact: ErasedContact,
  out: ErasedRows,
  paths: string[],
): Promise<StorageLeg | null> {
  const id = contact.id;
  const missed = (out.storage_paths ?? []).filter((p) => !paths.includes(p));
  const sweep = missed.length ? await removeMediaObjects(contact.tenant_id, missed) : null;
  if (sweep) {
    // decisions has no UPDATE policy for a session, so a late leg is a second
    // row on the same subject rather than an edit of the first. Best effort
    // like the legs above it: past step 4 the person IS erased, and
    // throwing here would report that as a failure and send the owner back to
    // a route that now answers `already_erased`.
    await recordDecision(ctx, contact.tenant_id, "contact", id, "erase", {
      leg: "storage_sweep",
      requested: sweep.requested,
      removed: sweep.removed.length,
      error: sweep.error,
    }).catch((e: unknown) => {
      log.error("erase_sweep_decision_failed", { contact: id, error: e });
    });
  }
  return sweep;
}

/** The answer: what went, in both Storage passes together. */
function erasedAnswer(id: string, out: ErasedRows, storage: StorageLeg, sweep: StorageLeg | null) {
  return {
    contact_id: id,
    erased: true,
    counts: out.counts ?? {},
    jobs_canceled: out.jobs_canceled ?? 0,
    storage: {
      requested: storage.requested + (sweep?.requested ?? 0),
      removed: storage.removed.length + (sweep?.removed.length ?? 0),
      error: sweep?.error ?? null,
    },
  };
}

/* ---- the legs an erasure and its re-drive share ---- */

/** The person's policy rows, deleted; a refusal is logged, and handed back for the re-drive's answer. */
async function dropPersonPolicy(ctx: RouteContext, contact: ErasedContact): Promise<{ message: string } | null> {
  const { error: polErr } = await ctx.supabase
    .from("policies")
    .delete()
    .eq("tenant_id", contact.tenant_id)
    .eq("subject_type", "contact")
    .eq("subject_id", contact.id);
  if (polErr) log.error("erase_person_policy_failed", { contact: contact.id, error: polErr.message });
  return polErr;
}

/** The Ask turns that name the person, by their id and every spelling in `needles` (scrub_ask_for_contact). */
function scrubAskTurns(ctx: RouteContext, contact: ErasedContact, needles: string[]) {
  return ctx.supabase.rpc("scrub_ask_for_contact", {
    p_tenant_id: contact.tenant_id,
    p_contact_id: contact.id,
    p_needles: needles,
  });
}

/** Every job that carried the person, scrubbed; a failure is logged and counts as none, never a failed erasure. */
function scrubJobsBestEffort(contact: ErasedContact, identifiers: readonly string[]): Promise<number> {
  return scrubErasedJobs(contact.tenant_id, contact.id, identifiers).catch((e: unknown) => {
    log.error("erase_jobs_scrub_failed", { contact: contact.id, error: e });
    return 0;
  });
}

/**
 * The kept deliveries that name them, again: one that came while the erasure ran is caught here, as a job in flight is.
 * A failure is logged and carries on, and the ledger's week-long purge takes whatever it left.
 */
async function scrubKeptDeliveriesBestEffort(contact: ErasedContact, needles: readonly string[]): Promise<void> {
  try {
    await scrubProviderEvents(serviceDb(), contact.tenant_id, needles);
  } catch (e) {
    log.error("erase_deliveries_scrub_failed", { contact: contact.id, error: e });
  }
}

/** Other people's notes, again: one written while the erasure ran is caught here. A failure is logged and carries on. */
async function scrubOthersNotesBestEffort(contact: ErasedContact, needles: readonly string[]): Promise<void> {
  try {
    await scrubPersonNotes(serviceDb(), contact.tenant_id, contact.id, needles);
  } catch (e) {
    log.error("erase_notes_scrub_failed", { contact: contact.id, error: e });
  }
}

/**
 * Their visits (appointments_scrub, 00345; decision 0036): the time and the service stay the business's, the client's
 * name, number, address and note go, and the notices that named them lose the name. A failure is logged and carries on.
 */
async function scrubAppointmentsBestEffort(contact: ErasedContact, needles: readonly string[]): Promise<void> {
  try {
    await appointmentsScrub(serviceDb(), { tenantId: contact.tenant_id, contactId: contact.id, needles });
  } catch (e) {
    log.error("erase_appointments_scrub_failed", { contact: contact.id, error: e });
  }
}
