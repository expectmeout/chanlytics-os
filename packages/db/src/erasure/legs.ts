/**
 * An erasure's legs, each a read or a write of what it reaches (decision 0036). The order they run in, and what a stop
 * at each one means, is packages/jobs/src/erasure.ts (erasePerson): the dashboard's route runs it as the owner's press,
 * and the erasure_finish job runs it again for a person a press left blocked. Here is only what each leg asks of the
 * tables: the person as a finish reads them, the keys a copy is found by, the block, the finished jobs' scrub, the
 * person's policy rows, the Ask turns, the rows (erase_contact) and the stored objects. The scrubs of the deliveries,
 * notes, turns and visits are their own repositories'. A read or a write that fails throws: a leg that could not be
 * made is the caller's to stop on, never one that ran with nothing.
 */
import { formatPhoneDisplay, normalizeEmail } from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";
import { readAllRowsByKey } from "../paged";
import { erasureDigests } from "../repositories/people";

type Db = SupabaseClient<Database>;

/** The person an erasure acts on, as a finish reads them: live and blocked, or erased and re-driven. */
interface ErasableContact {
  id: string;
  tenant_id: string;
  phone_e164: string | null;
  email: string | null;
  erased_at: string | null;
  erasing_since: string | null;
}

/** The person by their id, on the service role: null when there is no such row. Throws on a failed read. */
export async function erasableContact(db: Db, contactId: string): Promise<ErasableContact | null> {
  const { data, error } = await db
    .from("contacts")
    .select("id, tenant_id, phone_e164, email, erased_at, erasing_since")
    .eq("id", contactId)
    .maybeSingle();
  if (error) throw new Error(`erasable_contact: ${error.message}`);
  return data;
}

/* ---- the keys a copy is found by, read while the rows still exist ---- */

/** A North American number as formatPhoneDisplay writes it, `+1 (AAA) EEE-NNNN`, read back into its three groups. */
const NORTH_AMERICAN = /^\+1 \((\d{3})\) (\d{3})-(\d{4})$/;

/**
 * The keys an erasure finds a person's copies by, from what the route read while the rows exist: the contact's number
 * and address, and the external id of each of their identities (a WhatsApp wa_id is the number's digits, an email
 * identity's an address). Pure; it reads nothing.
 *
 * `identifiers` match the finished jobs (scrubErasedJobs): the digits of the number and of every identity, then the
 * address as stored. `needles` are what the Ask scrub looks for (scrub_ask_for_contact): the identifiers, then every
 * way a sentence spells each number -- the display form the pages and the assistant write, `+1 (555) 010-0123`
 * (formatPhoneDisplay, never a second implementation), and for a North American number the national forms read off it,
 * `5550100123`, `(555) 010-0123`, `555-010-0123`, `555.010.0123`, `555 010 0123` -- then every address, lower-cased.
 * The person's names and their conversations' and calls' ids are the database's to find: the scrub reads them off the
 * live rows.
 */
export function erasureKeys(
  contact: { phone_e164: string | null; email: string | null },
  externalIds: readonly (string | null)[],
): { identifiers: string[]; needles: string[] } {
  const digitsOf = (s: string | null) => (s ?? "").replace(/\D/g, "");
  const keys = [contact.phone_e164, ...externalIds];
  const identifiers = [...new Set(keys.map(digitsOf).filter(Boolean)), ...(contact.email ? [contact.email] : [])];
  const numbers = new Set(
    keys
      .filter((k) => !normalizeEmail(k))
      .map(digitsOf)
      .filter(Boolean),
  );
  const spoken = [...numbers].flatMap((n) => {
    const shown = formatPhoneDisplay(n);
    if (!shown) return [];
    const na = NORTH_AMERICAN.exec(shown);
    if (!na) return [shown];
    const [, area, exchange, line] = na;
    return [
      shown,
      `${area}${exchange}${line}`,
      `(${area}) ${exchange}-${line}`,
      `${area}-${exchange}-${line}`,
      `${area}.${exchange}.${line}`,
      `${area} ${exchange} ${line}`,
    ];
  });
  const addresses = [contact.email, ...externalIds].map((a) => normalizeEmail(a)).filter((a): a is string => !!a);
  return { identifiers, needles: [...new Set([...identifiers, ...spoken, ...addresses])] };
}

/**
 * The needles a visit is found by (appointments_scrub, 00345): the erasure's own, and each number's E.164 spelling,
 * `+15550100123`. That is how a visit keeps its client's number, and it is a spelling no sentence writes, so the
 * needles do not carry it (they hold a number's digits and the forms a page or a person writes it in): without it a
 * visit the read never linked to the person kept their number after they were erased.
 */
export function visitNeedles(needles: readonly string[]): string[] {
  const e164 = needles.filter((n) => /^[1-9]\d{6,14}$/.test(n)).map((n) => `+${n}`);
  return [...new Set([...needles, ...e164])];
}

/** The external id of each of the person's identities, read while the rows exist. Throws on a failed read. */
export async function identityExternalIds(db: Db, contactId: string): Promise<(string | null)[]> {
  const { data, error } = await db.from("contact_identities").select("external_id").eq("contact_id", contactId);
  if (error) throw new Error(`erasure_identities: ${error.message}`);
  return (data ?? []).map((i) => i.external_id);
}

/** The Storage paths the person's call recordings name, read while the rows exist. Throws on a failed read. */
export async function recordingPathsOf(db: Db, contactId: string): Promise<string[]> {
  const { data, error } = await db.from("calls").select("recording").eq("contact_id", contactId);
  if (error) throw new Error(`erasure_recordings: ${error.message}`);
  return storagePathsOf((data ?? []).map((c) => c.recording));
}

/** The Storage paths the person's messages' media name, read while the rows exist. Throws on a failed read. */
export async function mediaPathsOf(db: Db, contactId: string): Promise<string[]> {
  const { data, error } = await db
    .from("messages")
    .select("media")
    .eq("contact_id", contactId)
    .not("media", "is", null);
  if (error) throw new Error(`erasure_media: ${error.message}`);
  return storagePathsOf((data ?? []).map((m) => m.media));
}

/** The `storage_path` each stored value names, where it names one. */
function storagePathsOf(stored: readonly unknown[]): string[] {
  return stored.map((s) => (s as { storage_path?: string } | null)?.storage_path).filter((p): p is string => !!p);
}

/* ---- the block, before anything is destroyed ---- */

/**
 * The first leg of an erasure: the block, written before anything is destroyed. From this moment the wire refuses the
 * person (deliver.ts reads erasing_since beside erased_at), and the tombstone keeps a keyed digest of each identifier
 * the person has (made by the database, 00263) so the calendar import, a late call event, or mail from the address do
 * not bring them back. Both identifiers are named by the caller, present or null: a digest that is not written here
 * can never be written, because the erasure removes what it is computed from. Service role: a session cannot write
 * contacts, and the route has already judged the owner. Idempotent: a second request finds the block written and
 * changes nothing.
 */
export async function beginErasure(
  db: Db,
  tenantId: string,
  contactId: string,
  ids: { phone: string | null; email: string | null },
): Promise<void> {
  // The database makes the digests (00263): only it holds the pepper that keys them.
  const digests = await erasureDigests(
    db,
    tenantId,
    [ids.phone, ids.email].filter((v): v is string => !!v),
  );
  const phoneHash = ids.phone ? (digests.get(ids.phone) ?? null) : null;
  const emailHash = ids.email ? (digests.get(ids.email) ?? null) : null;
  const { error } = await db
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

/* ---- the stored objects ---- */

/**
 * Whether a stored object's path is this workspace's own: `<workspace id>/…`, as the edge writes every one (a message's
 * attachment `<tenant>/<conversation>/<message>.<ext>`, a call's recording `<tenant>/calls/<call>.<ext>`), with no
 * empty, `.` or `..` segment. The bucket is private and the signer holds the service role, so the path on the row is
 * the only thing that says whose the object is: a path that names another workspace is never signed, whatever wrote
 * it (00260 stops a member writing one on a message), and never removed by its erasure.
 */
export function inWorkspace(tenantId: string, storagePath: string): boolean {
  const parts = storagePath.split("/");
  return parts.length >= 2 && parts[0] === tenantId && parts.every((p) => p !== "" && p !== "." && p !== "..");
}

/**
 * The stored objects an erased person's rows name, removed from the private `media` bucket. storage.objects has no RLS
 * policies at all: the service role is the only door. Only this workspace's own (`<tenant>/…`, inWorkspace) are asked
 * for, and `refused` counts the rest (a row that names another workspace's object, which a member could write before
 * 00260). A key that is already absent is the desired end state, so a short `removed` list is NOT a failure; only a
 * transport error is, said rather than thrown, for the caller to stop on or carry.
 */
export async function removeMediaObjects(
  db: Db,
  tenantId: string,
  named: readonly string[],
): Promise<{ requested: number; removed: string[]; refused: number; error: string | null }> {
  const paths = named.filter((p) => inWorkspace(tenantId, p));
  const refused = named.length - paths.length;
  if (!paths.length) return { requested: 0, removed: [], refused, error: null };
  const { data, error } = await db.storage.from("media").remove(paths);
  if (error) return { requested: paths.length, removed: [], refused, error: error.message };
  return { requested: paths.length, removed: (data ?? []).map((o) => o.name), refused, error: null };
}

/* ---- the jobs that carried them ---- */

/** The states a job is finished in: its payload is a copy nothing will read again, so an erasure may scrub it. */
export const FINISHED_JOB_STATES = ["done", "failed", "canceled"] as const;

/** More jobs than any workspace holds; a read that reaches it throws rather than scrub a part and call it all. */
const SCRUB_READ_CAP = 500_000;

/**
 * The jobs that carried the customer's number, address or words, scrubbed.
 *
 * erase_contact cancels what is still scheduled and touches nothing else, so done, failed and canceled outbound_send
 * rows kept `to_phone`, `to_email` or `to_instagram` and `body` in their payload: a copy of the conversation the
 * erasure promised to remove. Matched by contact id, by the number in any of its forms, or by the address, cased as
 * it may be.
 *
 * Every job of the workspace is read, a page at a time. One select answered at most 1,000 rows, silently (PostgREST's
 * max_rows), so in any workspace past its thousandth job the scrub looked at the first thousand and left the rest
 * holding the person's number and words (the scorecard of 26 September 2026). Each page is read after the last id of
 * the one before (readAllRowsByKey), not by offset: the nightly purge (00215) deletes finished jobs, and a row deleted
 * during an offset read moves the rest back a place, so one would never be read. A read that stops short throws,
 * never a scrub believed whole.
 */
export async function scrubErasedJobs(
  db: Db,
  tenantId: string,
  contactId: string,
  /** Every spelling of the person's number, and their address: an email send carries `to_email`, never a number. */
  identifiers: readonly string[],
  /** Only these states; every state when absent (after erase_contact has canceled what was scheduled). */
  states?: readonly string[],
): Promise<number> {
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
    // A DM's address is the person's Instagram-scoped id, all digits, kept among their identities (decision 0001, step 8).
    const dm = typeof p.to_instagram === "string" ? p.to_instagram : "";
    if (dm && digits.has(dm)) return true;
    const address = typeof p.to_email === "string" ? p.to_email.trim().toLowerCase() : "";
    return !!address && addresses.has(address);
  });
  for (const j of hit) {
    // Its error too: a provider's refusal can quote the number or the address it refused.
    const { error: uerr } = await db
      .from("jobs")
      .update({ payload: { scrubbed_at: new Date().toISOString(), reason: "contact erased" }, last_error: null })
      .eq("id", j.id);
    if (uerr) throw new Error(`scrub_jobs_update: ${uerr.message}`);
  }
  return hit.length;
}

/* ---- the id-keyed legs a press and a re-drive share ---- */

/** The person's own policy rows (their receptionist setting), deleted: a row scoped to an erased person is a name that outlives its erasure. Throws on a refusal. */
export async function dropPersonPolicy(db: Db, tenantId: string, contactId: string): Promise<void> {
  const { error } = await db
    .from("policies")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("subject_type", "contact")
    .eq("subject_id", contactId);
  if (error) throw new Error(`erase_person_policy: ${error.message}`);
}

/**
 * The Ask turns that name the person, by their id and every spelling in `needles` (scrub_ask_for_contact, 00238;
 * the lines Ask remembers and the days of its journal with them, 00470): how many went. Throws on a refusal.
 */
export async function scrubAskTurns(
  db: Db,
  tenantId: string,
  contactId: string,
  needles: readonly string[],
): Promise<number> {
  const { data, error } = await db.rpc("scrub_ask_for_contact", {
    p_tenant_id: tenantId,
    p_contact_id: contactId,
    p_needles: [...needles],
  });
  if (error) throw new Error(`scrub_ask_for_contact: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

/* ---- the rows, in one transaction ---- */

/** What erase_contact answers: what it deleted, the paths it saw, the scheduled jobs it canceled. */
export interface ErasedRows {
  counts: Record<string, number>;
  storage_paths: string[];
  jobs_canceled: number;
}

/**
 * The rows, in one transaction (erase_contact): the person's calls, messages, conversations and identities deleted,
 * every scheduled job naming them canceled and scrubbed, the tombstone written and the triggers on it fired, and the
 * ledger's row carrying `legs`, what the caller already did (the Storage objects it removed), so one row tells the whole
 * story. Throws on a refusal.
 */
export async function eraseContactRows(db: Db, contactId: string, legs: Json): Promise<ErasedRows> {
  const { data, error } = await db.rpc("erase_contact", { p_contact_id: contactId, p_legs: legs });
  if (error) throw new Error(`erase_contact: ${error.message}`);
  return erasedRowsOf(data);
}

/** The function's answer read as the shape it promises; a field it did not say is its zero. */
function erasedRowsOf(data: Json): ErasedRows {
  const row = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const counts = row.counts && typeof row.counts === "object" && !Array.isArray(row.counts) ? row.counts : {};
  return {
    counts: Object.fromEntries(Object.entries(counts).filter((e): e is [string, number] => typeof e[1] === "number")),
    storage_paths: Array.isArray(row.storage_paths)
      ? row.storage_paths.filter((p): p is string => typeof p === "string")
      : [],
    jobs_canceled: typeof row.jobs_canceled === "number" ? row.jobs_canceled : 0,
  };
}
