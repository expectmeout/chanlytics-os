/**
 * Honour a deletion request: an erasure in the order the design gives it, and the job that finishes one that stopped
 * (decision 0036). The whole of DELETE /api/v1/contacts/:id runs here as the owner's press, behind the route that
 * judges who may ask (the owner, on the contact's own workspace, on a fresh session); the erasure_finish job runs it
 * again for a person a press left blocked.
 *
 * Three stores hold the customer: Postgres rows, the private `media` bucket, and the scheduled jobs that would still
 * speak to them. ORDER IS THE DESIGN. The keys are read first (reads only, retryable with nothing to undo). Then the
 * BLOCK (beginErasure, 00124): from that moment the wire refuses the person and the passive doors will not bring them
 * back, whatever happens to the legs below; and beside it the FINISH goes on the ledger (erasure_finish, 00500), a job
 * due once any press has had time to end, which finds the person erased and itself withdrawn with every other job that
 * named them (erase_contact cancels the scheduled ones), or finds them still blocked and finishes the erasure, tried
 * again by the ledger's waits. Then the copies keyed on the number (Ask turns, finished jobs, kept deliveries, other
 * people's notes, the receptionist's kept turns) are scrubbed while the number is still in hand, fail-closed, because
 * nothing after the tombstone can find them again. Storage objects go next, before the rows that name their paths,
 * and a Storage failure STOPS there rather than running the irreversible delete; the person is blocked meanwhile, not
 * live. The rows go LAST, in one transaction. A crash at any point leaves the request retryable, and the finish takes
 * it.
 *
 * The legs are packages/db's (erasure/legs.ts, and the scrubs' own repositories). Which client runs each is the
 * caller's: the route hands its session's for the key reads, the Ask scrub, the policy delete and erase_contact (RLS
 * the floor, the owner's role the door, and erase_contact reads the owner from auth.uid()), and the service role's for
 * the block, Storage and the scrubs granted to it alone; the job hands the service role's for both, which erase_contact
 * and the Ask scrub admit for a person whose block an owner's press wrote (00500).
 */
import { AppError, MIN_MS } from "@chanlytics/contracts";
import { logger } from "@chanlytics/channels";
import {
  appointmentsScrub,
  beginErasure,
  dropPersonPolicy,
  erasableContact,
  eraseContactRows,
  erasureKeys,
  FINISHED_JOB_STATES,
  identityExternalIds,
  mediaPathsOf,
  recordingPathsOf,
  recordSystemDecision,
  removeMediaObjects,
  scrubAskTurns,
  scrubErasedJobs,
  scrubModelTurns,
  scrubPersonNotes,
  scrubProviderEvents,
  visitNeedles,
  type ErasedRows,
  type Json,
} from "@chanlytics/db";
import { errText, type ClaimedJob, type JobContext } from "./context";
import type { Db } from "./ledger";
import { scheduleJobOnce } from "./schedule";

/** The person an erasure acts on, as the route's scope or the finish's own read found them: live, or erased and re-driven. */
interface ErasurePerson {
  id: string;
  tenant_id: string;
  phone_e164: string | null;
  email: string | null;
  erased_at: string | null;
}

/** The clients an erasure runs on, and the ledger row a late leg writes: which is which is the caller's (the header). */
interface ErasureClients {
  session: Db;
  service: Db;
  /** The Storage sweep's row on the ledger: the route records it as the member who pressed, the finish as the system. */
  record: (payload: Json) => Promise<unknown>;
}

interface ErasureOptions {
  /** Whether to put the finish on the ledger beside the block: a press does; the finish, running the erasure again, does not. */
  finishLater: boolean;
}

/**
 * How long after the block the finish is due: longer than any press's own run (a route's function is ended by its host
 * within minutes), so a press and its finish never run at once; short enough that a stopped erasure is finished within
 * the hour with the ledger's tries (RETRY_WAITS_MS), which is what the owner is told.
 */
const ERASURE_FINISH_AFTER_MS = 10 * MIN_MS;

/** What step 1 read while the rows still exist: the keys a copy is found by (erasureKeys), and the Storage paths. */
interface ErasureKeys {
  identifiers: string[];
  needles: string[];
  paths: string[];
}

/** What Storage said it removed (removeMediaObjects). */
type StorageLeg = Awaited<ReturnType<typeof removeMediaObjects>>;

/** A press: a live person erased, an erased one re-driven. */
export async function eraseOrRedrive(clients: ErasureClients, contact: ErasurePerson, options: ErasureOptions) {
  return contact.erased_at ? redriveErasure(clients, contact) : erasePerson(clients, contact, options);
}

/** A live person, erased in the order the header gives, and what was removed. */
async function erasePerson(clients: ErasureClients, contact: ErasurePerson, options: ErasureOptions) {
  const keys = await readErasureKeys(clients.session, contact);
  await blockErasure(clients.service, contact);
  const finishWaits = options.finishLater && (await scheduleFinish(clients.service, contact));
  await scrubCopiesFirst(clients, contact, keys, finishWaits);
  const storage = await removeStoredObjects(clients.service, contact, keys.paths, finishWaits);
  const out = await eraseRows(clients.session, contact, storage);
  await forgetAfterRows(clients, contact, keys);
  const sweep = await sweepLateObjects(clients, contact, out, keys.paths);
  return erasedAnswer(contact.id, out, storage, sweep);
}

/**
 * Already erased: never destroy twice, but DO re-drive every leg that may still be outstanding. The legs after the
 * rows are best effort by design -- they log and carry on rather than turn a finished erasure into a failure -- so a
 * transient refusal on any of them leaves the erased person's words in Ask, their number in a done job's payload,
 * their name on a policy row or on a visit. All of them are deletes or overwrites keyed on the contact, so repeating
 * one that already ran costs nothing.
 *
 * The needles are empty here, nothing is left to recover them from, and nothing needs them: the copies keyed on the
 * number were scrubbed before anything was destroyed, fail-closed, and erase_contact scrubs the jobs it cancels in the
 * same transaction. A re-drive repeats the id-keyed legs, and says which of them held.
 */
async function redriveErasure(clients: ErasureClients, contact: ErasurePerson) {
  const needles: string[] = [];
  const policy = await dropPolicyBestEffort(clients.session, contact);
  const ask = (await scrubAskBestEffort(clients.session, contact, needles)) !== null;
  const jobs = await scrubJobsBestEffort(clients.service, contact, needles);
  const appointments = await scrubAppointmentsBestEffort(clients.service, contact, needles);
  return {
    contact_id: contact.id,
    already_erased: true,
    erased_at: contact.erased_at,
    redriven: { policy, ask, jobs, appointments },
  };
}

/* ---- 1. keys and paths, read while the rows still exist ---- */
// THESE READS FAIL CLOSED. Nothing has been destroyed yet, so a read that could not be made is a retry -- and an
// identities read that came back empty because it errored would scrub the Ask turns without the WhatsApp wa_ids,
// leaving the customer's number quoted in an assistant's memory while the owner is told the person was erased.
async function readErasureKeys(db: Db, contact: ErasurePerson): Promise<ErasureKeys> {
  const externalIds = await unread("WhatsApp identities", () => identityExternalIds(db, contact.id));
  // The number and the address, as a finished job carries them (`identifiers`) and as an Ask turn may spell them
  // (`needles`): read off the row and its identities while they exist.
  const { identifiers, needles } = erasureKeys(contact, externalIds);
  const recordings = await unread("call recordings", () => recordingPathsOf(db, contact.id));
  const media = await unread("stored media", () => mediaPathsOf(db, contact.id));
  return { identifiers, needles, paths: [...new Set([...recordings, ...media])] };
}

async function unread<T>(what: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch {
    throw new AppError("internal", `Could not read this person's ${what}, so nothing was deleted. Try again.`, 500);
  }
}

/* ---- the block, before anything is destroyed, and the finish beside it ---- */
// After the reads (they destroy nothing and a failed one is a retry with nothing to undo), before the first
// destructive leg. Written with the number still on the row: the digest the tombstone keeps is computed from it. A
// write that could not be made is a retry too.
async function blockErasure(db: Db, contact: ErasurePerson): Promise<void> {
  try {
    await beginErasure(db, contact.tenant_id, contact.id, {
      phone: contact.phone_e164 ?? null,
      email: contact.email ?? null,
    });
  } catch (e) {
    logger().error("erase_begin_failed", { tenant_id: contact.tenant_id, contact: contact.id, error: errText(e) });
    throw new AppError(
      "internal",
      "Could not mark this person as being erased, so nothing was deleted. Try again.",
      500,
    );
  }
}

/**
 * The finish, on the ledger beside the block (erasure_finish, 00500): once per person while one waits (its key), due
 * ERASURE_FINISH_AFTER_MS on, naming them by the id alone. A press that ends well leaves it to erase_contact, which
 * withdraws it with every scheduled job naming the person; one that stops, or dies, leaves it to run. A ledger that
 * would not take it (a database before 00500 refuses the kind: either app may deploy first) is logged and the press
 * goes on: the finish is a net under the erasure, never a leg of it. True when one waits.
 */
async function scheduleFinish(db: Db, contact: ErasurePerson): Promise<boolean> {
  try {
    await scheduleJobOnce(db, {
      tenantId: contact.tenant_id,
      kind: "erasure_finish",
      dueAt: new Date(Date.now() + ERASURE_FINISH_AFTER_MS),
      payload: { contact_id: contact.id },
    });
    return true;
  } catch (e) {
    logger().error("erase_finish_schedule_failed", {
      tenant_id: contact.tenant_id,
      contact: contact.id,
      error: errText(e),
    });
    return false;
  }
}

/* ---- 2. the copies keyed on the number, while the number is still in hand ---- */
// FAIL CLOSED, and BEFORE the rows are destroyed. An Ask turn that quoted the number and a finished job that carried
// it (`to_phone` in a done outbound_send) are found by digits the tombstone will not hold and contact_identities will
// no longer have, so a re-driven erasure could never reach them. Scrubbed here, a transient refusal is a retry with
// nothing to undo; scrubbed only after the rows are gone, it was a copy kept for ever. Scheduled jobs are left to
// erase_contact, which cancels and scrubs them in the same transaction as the delete; one in flight finishes first,
// and the best-effort pass after step 4 reaches it. Each leg commits on its own, so only the Ask scrub, one function
// that commits whole, can stop with nothing removed; a leg after it stops with what the legs before it removed
// already gone (stoppedPartway).
async function scrubCopiesFirst(
  clients: ErasureClients,
  contact: ErasurePerson,
  keys: ErasureKeys,
  finishWaits: boolean,
): Promise<void> {
  try {
    await scrubAskTurns(clients.session, contact.tenant_id, contact.id, keys.needles);
  } catch (e) {
    logger().error("erase_ask_prescrub_failed", {
      tenant_id: contact.tenant_id,
      contact: contact.id,
      error: errText(e),
    });
    throw new AppError(
      "internal",
      `The assistant's memory of this person could not be scrubbed, so nothing was deleted. ${tryAgain(finishWaits)}`,
      500,
    );
  }
  try {
    await scrubErasedJobs(clients.service, contact.tenant_id, contact.id, keys.identifiers, FINISHED_JOB_STATES);
  } catch (e) {
    logger().error("erase_jobs_prescrub_failed", {
      tenant_id: contact.tenant_id,
      contact: contact.id,
      error: errText(e),
    });
    throw new AppError(
      "internal",
      stoppedPartway("The finished jobs that carried this person's number could not be scrubbed", finishWaits),
      500,
    );
  }
  // The deliveries the intake ledger keeps a week (00336) hold the number and the words as a provider sent them: found
  // by every spelling the Ask scrub uses, while they are in hand, and fail closed for the same reason as the jobs.
  try {
    await scrubProviderEvents(clients.service, contact.tenant_id, keys.needles);
  } catch (e) {
    logger().error("erase_deliveries_prescrub_failed", {
      tenant_id: contact.tenant_id,
      contact: contact.id,
      error: errText(e),
    });
    throw new AppError(
      "internal",
      stoppedPartway(
        "The deliveries kept for replay that carried this person's number could not be scrubbed",
        finishWaits,
      ),
      500,
    );
  }
  // Other people's notes that carry their number or address (00341, decision 0036): the needle overwritten in place,
  // the note kept, by the same spellings and for the same reason. Their own notes go with them in step 4.
  try {
    await scrubPersonNotes(clients.service, contact.tenant_id, contact.id, keys.needles);
  } catch (e) {
    logger().error("erase_notes_prescrub_failed", {
      tenant_id: contact.tenant_id,
      contact: contact.id,
      error: errText(e),
    });
    throw new AppError(
      "internal",
      stoppedPartway("The notes that carried this person's number or address could not be scrubbed", finishWaits),
      500,
    );
  }
  // The receptionist's kept turns (00401, decision 0039) that quote them from someone else's thread or notes: deleted
  // by the same spellings, while they are in hand. Their own turns go with their conversations in step 4.
  try {
    await scrubModelTurns(clients.service, contact.tenant_id, keys.needles);
  } catch (e) {
    logger().error("erase_turns_prescrub_failed", {
      tenant_id: contact.tenant_id,
      contact: contact.id,
      error: errText(e),
    });
    throw new AppError(
      "internal",
      stoppedPartway("The receptionist's kept turns that named this person could not be scrubbed", finishWaits),
      500,
    );
  }
}

/** What a stop before any copy is gone says last: a press again, or the finish that waits on the ledger. */
function tryAgain(finishWaits: boolean): string {
  return finishWaits ? "It will finish on its own within the hour, or try again now." : "Try again.";
}

/**
 * What a leg says when it stops an erasure after the Ask scrub. The copies the legs before it removed stay removed
 * (each committed on its own), so "nothing was deleted" would be false, and an owner who believed it could leave a
 * person half erased. The person is held meanwhile, the finish on the ledger takes the rest, and a second press
 * repeats every leg and finishes now. It says what it had removed without claiming there was any: a person no leg
 * before it found has nothing removed yet.
 */
function stoppedPartway(what: string, finishWaits: boolean): string {
  return (
    `${what}, so the erasure stopped partway. What it had already removed stays removed, and nothing more was ` +
    `deleted. ${finishWaits ? "It will finish on its own within the hour, or delete them again to finish now." : "Delete them again to finish."}`
  );
}

/* ---- 3. Storage, before the rows that name it ---- */
async function removeStoredObjects(
  db: Db,
  contact: ErasurePerson,
  paths: string[],
  finishWaits: boolean,
): Promise<StorageLeg> {
  const storage = await removeMediaObjects(db, contact.tenant_id, paths);
  if (storage.refused)
    logger().error("media_remove_refused", { tenant_id: contact.tenant_id, refused: storage.refused });
  if (storage.error) {
    // Step 4 is irreversible and it deletes the only rows that still name these objects. Stop while the request is
    // entirely retryable rather than leaving a recording behind with nothing pointing at it. Every copy leg has run by
    // now, so it says what stays removed.
    logger().error("media_remove_failed", { tenant_id: contact.tenant_id, error: storage.error });
    logger().error("erase_storage_failed", { tenant_id: contact.tenant_id, contact: contact.id, error: storage.error });
    throw new AppError(
      "internal",
      stoppedPartway("The stored recordings and media could not be removed", finishWaits),
      500,
    );
  }
  return storage;
}

/* ---- 4. the rows, in one transaction, carrying the legs into the ledger ---- */
function eraseRows(db: Db, contact: ErasurePerson, storage: StorageLeg): Promise<ErasedRows> {
  return eraseContactRows(db, contact.id, {
    storage: { requested: storage.requested, removed: storage.removed.length },
  });
}

/** After the rows: the legs that are best effort, because past step 4 the person IS erased. */
async function forgetAfterRows(clients: ErasureClients, contact: ErasurePerson, keys: ErasureKeys): Promise<void> {
  // The person's own receptionist setting goes with them: a policy row scoped to an erased contact is a name that
  // outlives its erasure.
  await dropPolicyBestEffort(clients.session, contact);
  // The Ask turns that quoted them, for every member of the workspace: an assistant's memory of a person is a name
  // that outlives its erasure too. The needles, read off the row before erase_contact ran, because the row no longer
  // has them. Step 2 already scrubbed with them; this pass catches a turn written since, and a re-driven erasure
  // scrubs by the id alone.
  const scrubbed = await scrubAskBestEffort(clients.session, contact, keys.needles);
  if (scrubbed !== null)
    logger().info("erase_ask_scrubbed", { tenant_id: contact.tenant_id, contact: contact.id, messages: scrubbed });
  // The jobs that carried their number or words. erase_contact cancels what is still scheduled; done, failed and
  // canceled rows kept `to_phone` and `body` in their payload forever.
  const jobs = await scrubJobsBestEffort(clients.service, contact, keys.identifiers);
  logger().info("erase_jobs_scrubbed", { tenant_id: contact.tenant_id, contact: contact.id, jobs });
  // The kept deliveries, other people's notes and the receptionist's kept turns that name them, again: one that came,
  // was written or was taken while the erasure ran is caught here, as a job in flight is. A failure is logged and
  // carries on; the ledger's week-long purge and the turns' thirty-day clock take what they left.
  await scrubDeliveriesBestEffort(clients.service, contact, keys.needles);
  await scrubNotesBestEffort(clients.service, contact, keys.needles);
  await scrubTurnsBestEffort(clients.service, contact, keys.needles);
  await scrubAppointmentsBestEffort(clients.service, contact, keys.needles);
}

/* ---- 5. anything that landed during the window ----
   The RPC's set is the authoritative one (it also sees messages and calls reached only through the conversation). A
   call ingested between step 3 and step 4 would otherwise leave audio behind. remove() on an absent key is a no-op,
   so re-listing an already-removed path costs nothing. */
async function sweepLateObjects(
  clients: ErasureClients,
  contact: ErasurePerson,
  out: ErasedRows,
  paths: string[],
): Promise<StorageLeg | null> {
  const missed = out.storage_paths.filter((p) => !paths.includes(p));
  const sweep = missed.length ? await removeMediaObjects(clients.service, contact.tenant_id, missed) : null;
  if (sweep) {
    // decisions has no UPDATE policy for a session, so a late leg is a second row on the same subject rather than an
    // edit of the first. Best effort like the legs above it: past step 4 the person IS erased, and throwing here would
    // report that as a failure and send the owner back to a route that now answers `already_erased`.
    await clients
      .record({ leg: "storage_sweep", requested: sweep.requested, removed: sweep.removed.length, error: sweep.error })
      .catch((e: unknown) => {
        logger().error("erase_sweep_decision_failed", {
          tenant_id: contact.tenant_id,
          contact: contact.id,
          error: errText(e),
        });
      });
  }
  return sweep;
}

/** The answer: what went, in both Storage passes together. */
function erasedAnswer(id: string, out: ErasedRows, storage: StorageLeg, sweep: StorageLeg | null) {
  return {
    contact_id: id,
    erased: true,
    counts: out.counts,
    jobs_canceled: out.jobs_canceled,
    storage: {
      requested: storage.requested + (sweep?.requested ?? 0),
      removed: storage.removed.length + (sweep?.removed.length ?? 0),
      error: sweep?.error ?? null,
    },
  };
}

/* ---- the legs an erasure and its re-drive share, each best effort: a failure is logged and said, never a failed erasure ---- */

/** The person's policy rows, deleted; whether it held. */
async function dropPolicyBestEffort(db: Db, contact: ErasurePerson): Promise<boolean> {
  try {
    await dropPersonPolicy(db, contact.tenant_id, contact.id);
    return true;
  } catch (e) {
    logger().error("erase_person_policy_failed", {
      tenant_id: contact.tenant_id,
      contact: contact.id,
      error: errText(e),
    });
    return false;
  }
}

/** The Ask turns that name the person, by their id and every spelling in `needles`: how many went, or null when refused. */
async function scrubAskBestEffort(db: Db, contact: ErasurePerson, needles: readonly string[]): Promise<number | null> {
  try {
    return await scrubAskTurns(db, contact.tenant_id, contact.id, needles);
  } catch (e) {
    logger().error("erase_ask_scrub_failed", { tenant_id: contact.tenant_id, contact: contact.id, error: errText(e) });
    return null;
  }
}

/** Every job that carried the person, scrubbed; a failure is logged and counts as none. */
function scrubJobsBestEffort(db: Db, contact: ErasurePerson, identifiers: readonly string[]): Promise<number> {
  return scrubErasedJobs(db, contact.tenant_id, contact.id, identifiers).catch((e: unknown) => {
    logger().error("erase_jobs_scrub_failed", { tenant_id: contact.tenant_id, contact: contact.id, error: errText(e) });
    return 0;
  });
}

/** The kept deliveries that name them, again (00336); the week's purge takes what a failure here leaves. */
async function scrubDeliveriesBestEffort(db: Db, contact: ErasurePerson, needles: readonly string[]): Promise<void> {
  try {
    await scrubProviderEvents(db, contact.tenant_id, needles);
  } catch (e) {
    logger().error("erase_deliveries_scrub_failed", {
      tenant_id: contact.tenant_id,
      contact: contact.id,
      error: errText(e),
    });
  }
}

/** Other people's notes, again (00341): one written while the erasure ran is caught here. */
async function scrubNotesBestEffort(db: Db, contact: ErasurePerson, needles: readonly string[]): Promise<void> {
  try {
    await scrubPersonNotes(db, contact.tenant_id, contact.id, needles);
  } catch (e) {
    logger().error("erase_notes_scrub_failed", {
      tenant_id: contact.tenant_id,
      contact: contact.id,
      error: errText(e),
    });
  }
}

/** The receptionist's kept turns that name them, again (00401); their thirty-day clock takes what a failure here leaves. */
async function scrubTurnsBestEffort(db: Db, contact: ErasurePerson, needles: readonly string[]): Promise<void> {
  try {
    await scrubModelTurns(db, contact.tenant_id, needles);
  } catch (e) {
    logger().error("erase_turns_scrub_failed", {
      tenant_id: contact.tenant_id,
      contact: contact.id,
      error: errText(e),
    });
  }
}

/**
 * Their visits (appointments_scrub, 00345; decision 0036): the time and the service stay the business's, the client's
 * name, number, address and note go, and the notices that named them lose the name. Found by the person's id too, so a
 * re-drive with no needles reaches them. Whether it held.
 */
async function scrubAppointmentsBestEffort(
  db: Db,
  contact: ErasurePerson,
  needles: readonly string[],
): Promise<boolean> {
  try {
    await appointmentsScrub(db, {
      tenantId: contact.tenant_id,
      contactId: contact.id,
      // A visit keeps the number as E.164, a spelling the needles do not carry (visitNeedles).
      needles: visitNeedles(needles),
    });
    return true;
  } catch (e) {
    logger().error("erase_appointments_scrub_failed", {
      tenant_id: contact.tenant_id,
      contact: contact.id,
      error: errText(e),
    });
    return false;
  }
}

/* ---- the finish: the job ---- */

/**
 * erasure_finish: an erasure a press left unfinished, finished (decision 0036; 00500). payload: { contact_id }, put on
 * the ledger beside the block by every press, due ERASURE_FINISH_AFTER_MS on; a press that ended well had erase_contact
 * withdraw it. Written to be run again (ledger RETRY_WAITS_MS): every leg is a delete or an overwrite keyed on the
 * person, so a second run repeats nothing it should not. A person already erased has the id-keyed legs run again; one
 * never blocked is nobody's press, and nothing is done.
 */
export async function erasureFinish(ctx: JobContext, job: ClaimedJob): Promise<void> {
  const contactId = job.payload.contact_id;
  if (typeof contactId !== "string") throw new Error("erasure_finish: the payload names no contact");
  const contact = await erasableContact(ctx.db, contactId);
  if (!contact || contact.tenant_id !== job.tenant_id) {
    logger().warn("erasure_finish_nobody", { tenant_id: job.tenant_id, job: job.id, contact: contactId });
    return;
  }
  const clients: ErasureClients = {
    session: ctx.db,
    service: ctx.db,
    record: (payload) =>
      recordSystemDecision(ctx.db, {
        tenantId: contact.tenant_id,
        subjectType: "contact",
        subjectId: contact.id,
        verb: "erase",
        payload,
      }),
  };
  if (contact.erased_at) {
    const { redriven } = await redriveErasure(clients, contact);
    logger().info("erasure_finish_done", { tenant_id: job.tenant_id, job: job.id, contact: contactId, redriven });
    return;
  }
  if (!contact.erasing_since) {
    logger().warn("erasure_finish_not_begun", { tenant_id: job.tenant_id, job: job.id, contact: contactId });
    return;
  }
  const { counts, jobs_canceled } = await erasePerson(clients, contact, { finishLater: false });
  logger().info("erasure_finish_done", {
    tenant_id: job.tenant_id,
    job: job.id,
    contact: contactId,
    counts,
    jobs_canceled,
  });
}
