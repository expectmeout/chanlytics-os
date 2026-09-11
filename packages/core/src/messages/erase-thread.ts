import type { EraseThreadPorts } from "./ports";

export interface EraseThreadCommand {
  tenantId: string;
  jobId: string;
  payload: { contact_id?: string; namespace?: string; thread_ids?: unknown; scrubbed?: boolean };
}

/**
 * blob_thread_erase: the copy Postgres cannot reach. The Vercel Blob thread
 * holds the verbatim conversation outside RLS and outside the database, so
 * deleting the rows is not deleting the data. The dashboard queues this job
 * BEFORE it destroys anything, so a crash mid-erasure leaves a retryable
 * request rather than an orphaned transcript whose key nobody can reconstruct.
 */
export async function eraseBlobThread(ports: EraseThreadPorts, cmd: EraseThreadCommand): Promise<void> {
  const p = cmd.payload;
  // A sibling job (a retry that raced this one) already finished this
  // contact's Blob leg and scrubbed every payload for it: nothing to do, and
  // no second ledger row.
  if (p.scrubbed) return;
  if (!p.namespace) throw new Error("blob_thread_erase: payload has no namespace");
  const ids = (Array.isArray(p.thread_ids) ? p.thread_ids : []).filter((t): t is string => typeof t === "string" && t.length > 0);
  const failed: string[] = [];
  for (const id of ids) if (!(await ports.eraseThread(p.namespace, id))) failed.push(id);
  if (failed.length) throw new Error(`blob_thread_erase: ${failed.length} thread(s) not deleted`);
  // The payload carried the customer's phone digits, because that IS the Blob
  // key. Once the objects are gone it is a durable copy of the identifier we
  // were asked to erase, in a table whose rows are never deleted. Scrub it,
  // but only on success: while the leg is outstanding, this payload is the
  // only thing that can retry it. EVERY job row for this contact is scrubbed,
  // not just this one, so an earlier crashed attempt does not keep the digits.
  const scrubbed = { contact_id: p.contact_id ?? null, namespace: p.namespace, threads: ids.length, scrubbed: true };
  await ports.scrub(cmd.tenantId, p.contact_id ? { contactId: p.contact_id } : { jobId: cmd.jobId }, scrubbed);
  // Same ledger as the owner's own erase decision, so one query tells the whole story.
  if (p.contact_id) await ports.recordErased(cmd.tenantId, p.contact_id, ids.length, cmd.jobId);
}
