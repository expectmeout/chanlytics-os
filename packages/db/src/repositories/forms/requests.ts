/**
 * A hosted form's entries, and what happened to each (00680; the Forms plan, 3.2 and 3.5). The door keeps an entry
 * through one write, form_request_take: the version checked, once by the page's own id, the person through
 * resolve_person, the entry and its event, together; a doubtful entry is kept held with no person, a test with neither
 * person nor event. What answered a request is a link from it (form_entry_links), written by the act itself: a member's
 * reply and their word that it was answered another way on their own client, under the table's row rules; a
 * conversation that arrived with the request's code on the service role. Answered is read, never kept: the requests
 * nobody has answered are form_requests_open's. A read that fails THROWS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, heldContactId, recordOrEmpty, type ContactId, type TenantId } from "@chanlytics/contracts";
import { tenantDb } from "../../shared/tenant-db";
import type { Database, Json } from "../../types";

type Db = SupabaseClient<Database>;

/** Who an entry is about, as typed. */
export interface FormReach {
  name: string | null;
  email: string | null;
  phone: string | null;
}

/** Why an entry is held for a look. */
export type FormHeldWhy = "hidden_field" | "too_fast" | "too_many" | "member";

/** What the door hands its one write. */
export interface FormRequestToTake {
  tenantId: TenantId;
  formId: string;
  versionId: string;
  /** The id the page made before it sent: the same press sent twice is one entry. */
  ref: string;
  answers: Json;
  reach: FormReach;
  /** A digest of what was typed (sha-256, hex). */
  words: string;
  source: Json | null;
  linkCode: string | null;
  test: boolean;
  heldWhy: Exclude<FormHeldWhy, "member"> | null;
}

/**
 * What the door's one write came to. `closed`: the form is not live. `stale`: the version is neither live nor replaced
 * within a day, with the live one. `forgotten`: a person who asked to be forgotten, and nothing written.
 */
export type FormRequestTaken =
  | { outcome: "accepted" | "again"; entryId: string; contactId: ContactId | null; code: string | null }
  | { outcome: "held" | "test"; entryId: string; contactId: null; code: string | null }
  | { outcome: "closed" | "forgotten"; entryId: null; contactId: null }
  | { outcome: "stale"; entryId: null; contactId: null; versionId: string | null };

const keptText = (kept: unknown): string | null => (typeof kept === "string" && kept ? kept : null);

/** A reach read back from what was kept. */
function formReachOf(kept: unknown): FormReach {
  const row = recordOrEmpty(kept);
  return { name: keptText(row.name), email: keptText(row.email), phone: keptText(row.phone) };
}

/** The entry kept with its person and its event, held for a look, or nothing at all (form_request_take). */
export async function takeFormRequest(db: Db, entry: FormRequestToTake): Promise<FormRequestTaken> {
  const { data, error } = await db.rpc("form_request_take", {
    p_tenant_id: entry.tenantId,
    p_form_id: entry.formId,
    p_version_id: entry.versionId,
    p_ref: entry.ref,
    p_answers: entry.answers,
    p_reach: { ...entry.reach },
    p_words: entry.words,
    p_source: entry.source ?? undefined,
    p_link_code: entry.linkCode ?? undefined,
    p_test: entry.test,
    p_held_why: entry.heldWhy ?? undefined,
  });
  if (error) throw new DbFailure(error, "form_request_take");
  return takenFrom(data);
}

/** What form_request_take answered (and form_time_request_take with it), read back. */
export function takenFrom(data: unknown): FormRequestTaken {
  const row = recordOrEmpty(data);
  const outcome = row.outcome;
  if (outcome === "closed" || outcome === "forgotten") return { outcome, entryId: null, contactId: null };
  if (outcome === "stale") return { outcome, entryId: null, contactId: null, versionId: keptText(row.version_id) };
  if (typeof row.entry_id !== "string") throw new Error("form_request_take answered without an entry");
  const code = keptText(row.code);
  if (outcome === "held" || outcome === "test") return { outcome, entryId: row.entry_id, contactId: null, code };
  if (outcome !== "accepted" && outcome !== "again")
    throw new Error("form_request_take answered an outcome nobody knows");
  const contact = keptText(row.contact_id);
  return { outcome, entryId: row.entry_id, contactId: contact ? heldContactId(contact) : null, code };
}

/**
 * A held entry let through (form_entry_let_through): `accepted` with its person resolved and its event written then;
 * `back` for a request a member had set aside; `forgotten` for a person who asked to be, whose entry is deleted;
 * `gone` where no held entry is there.
 */
export async function letFormEntryThrough(
  db: Db,
  tenantId: TenantId,
  entryId: string,
): Promise<"accepted" | "back" | "forgotten" | "gone"> {
  const { data, error } = await db.rpc("form_entry_let_through", { p_tenant_id: tenantId, p_entry_id: entryId });
  if (error) throw new DbFailure(error, "form_entry_let_through");
  const outcome = recordOrEmpty(data).outcome;
  return outcome === "accepted" || outcome === "back" || outcome === "forgotten" ? outcome : "gone";
}

/** A request a member says is not a real one, held (form_entry_hold). Answers whether one was held. */
export async function holdFormEntry(db: Db, tenantId: TenantId, entryId: string): Promise<boolean> {
  const { data, error } = await db.rpc("form_entry_hold", { p_tenant_id: tenantId, p_entry_id: entryId });
  if (error) throw new DbFailure(error, "form_entry_hold");
  return data === true;
}

/** A request nobody has answered, as form_requests_open reads it. */
export interface OpenFormRequest {
  id: string;
  formId: string;
  versionId: string;
  contactId: ContactId | null;
  createdAt: string;
  /** The answers as kept, by field id: read against the request's version (contracts readFormAnswers). */
  answers: Record<string, unknown>;
  reach: FormReach;
  /** The place its link was shared, where it came through one. */
  place: string | null;
  heading: string | null;
  /** A reply to it failed to reach them. */
  unreached: boolean;
  /** The time it asked for, as its visit stands now (00688, F3), or null where it asked for none. */
  time: OpenFormRequestTime | null;
}

/** A time a request asked for, as its visit stands now. */
export interface OpenFormRequestTime {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  service: string | null;
  status: string;
  expiresAt: string | null;
  timezone: string;
}

/** The time a request asked for, read back; null where it asked for none. */
function openTimeKept(kept: unknown): OpenFormRequestTime | null {
  const row = recordOrEmpty(kept);
  if (typeof row.appointment_id !== "string" || typeof row.starts_at !== "string" || typeof row.ends_at !== "string")
    return null;
  return {
    appointmentId: row.appointment_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    service: keptText(row.service),
    status: keptText(row.status) ?? "proposed",
    expiresAt: keptText(row.expires_at),
    timezone: keptText(row.timezone) ?? "UTC",
  };
}

/** The requests of a workspace's forms nobody has answered, newest first (form_requests_open). */
export async function listOpenFormRequests(db: Db, tenantId: TenantId): Promise<OpenFormRequest[]> {
  const { data, error } = await db.rpc("form_requests_open", { p_tenant_id: tenantId });
  if (error) throw new DbFailure(error, "form_requests_open");
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return rows.flatMap((line) => {
    const row = recordOrEmpty(line);
    if (typeof row.id !== "string" || typeof row.form_id !== "string" || typeof row.version_id !== "string") return [];
    const contact = keptText(row.contact_id);
    return [
      {
        id: row.id,
        formId: row.form_id,
        versionId: row.version_id,
        contactId: contact ? heldContactId(contact) : null,
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
        answers: recordOrEmpty(row.answers),
        reach: formReachOf(row.reach),
        place: keptText(row.place),
        heading: keptText(row.heading),
        unreached: row.unreached === true,
        time: openTimeKept(row.time),
      },
    ];
  });
}

/** One entry of a hosted form as a member's screens read it. */
export interface FormEntryRead {
  id: string;
  formId: string;
  versionId: string;
  linkId: string | null;
  contactId: ContactId | null;
  createdAt: string;
  state: "accepted" | "processed" | "held";
  heldWhy: FormHeldWhy | null;
  test: boolean;
  answers: Json;
  reach: FormReach;
  source: Json | null;
  /** Whether its code was carried into a chat. */
  codeUsed: boolean;
}

const ENTRY_COLUMNS =
  "id, form_id, version_id, link_id, contact_id, created_at, state, held_why, test, answers, reach, source, code_used_at";

/** Why an entry is held, read back from what was kept; null for a word nobody knows. */
function heldWhyKept(kept: string | null): FormHeldWhy | null {
  if (kept === "hidden_field" || kept === "too_fast" || kept === "too_many" || kept === "member") return kept;
  return null;
}

function entryReadOf(row: {
  id: string;
  form_id: string | null;
  version_id: string | null;
  link_id: string | null;
  contact_id: string | null;
  created_at: string;
  state: string;
  held_why: string | null;
  test: boolean;
  answers: Json;
  reach: Json | null;
  source: Json | null;
  code_used_at: string | null;
}): FormEntryRead[] {
  if (!row.form_id || !row.version_id) return [];
  return [
    {
      id: row.id,
      formId: row.form_id,
      versionId: row.version_id,
      linkId: row.link_id,
      contactId: row.contact_id ? heldContactId(row.contact_id) : null,
      createdAt: row.created_at,
      state: row.state === "held" || row.state === "processed" ? row.state : "accepted",
      heldWhy: heldWhyKept(row.held_why),
      test: row.test,
      answers: row.answers,
      reach: formReachOf(row.reach),
      source: row.source,
      codeUsed: row.code_used_at !== null,
    },
  ];
}

/** A form's entries, the newest first, at most `limit`: its requests, its tests and its held pile. */
export async function listFormEntries(
  db: Db,
  listed: { tenantId: TenantId; formId: string; limit: number },
): Promise<FormEntryRead[]> {
  const { data, error } = await tenantDb(db, listed.tenantId)
    .from("form_entries")
    .select(ENTRY_COLUMNS)
    .eq("form_id", listed.formId)
    .order("created_at", { ascending: false })
    .limit(listed.limit);
  if (error) throw new DbFailure(error, "form_entries");
  return data.flatMap(entryReadOf);
}

/** One entry of a hosted form, or null where the workspace has none by that id. */
export async function findFormRequest(db: Db, tenantId: TenantId, entryId: string): Promise<FormEntryRead | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("form_entries")
    .select(ENTRY_COLUMNS)
    .eq("id", entryId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "form_entries");
  return data ? (entryReadOf(data)[0] ?? null) : null;
}

/** One entry held for a look: the form it is of, the version its visitor saw, and when it came. */
export interface HeldFormEntry {
  formId: string;
  versionId: string;
  createdAt: string;
}

/**
 * A workspace's entries held for a look since before a moment, the oldest first: what Today says of a held pile nobody
 * has looked at. At most 500: a held entry goes at 30 days (form_entries_purge), and a form takes few a day.
 */
export async function listFormEntriesHeldBefore(db: Db, tenantId: TenantId, before: string): Promise<HeldFormEntry[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("form_entries")
    .select("form_id, version_id, created_at")
    .eq("state", "held")
    .eq("test", false)
    .not("form_id", "is", null)
    .lt("created_at", before)
    .order("created_at")
    .limit(500);
  if (error) throw new DbFailure(error, "form_entries");
  return data.flatMap((row) =>
    row.form_id && row.version_id
      ? [{ formId: row.form_id, versionId: row.version_id, createdAt: row.created_at }]
      : [],
  );
}

/** What happened to one entry. */
export interface FormEntryLink {
  id: string;
  entryId: string;
  kind: "reply" | "conversation" | "visit" | "marked";
  messageId: string | null;
  conversationId: string | null;
  appointmentId: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** A link's kind, read back from what was kept; null for a word nobody knows. */
function linkKindOf(kept: string): FormEntryLink["kind"] | null {
  if (kept === "reply" || kept === "conversation" || kept === "visit" || kept === "marked") return kept;
  return null;
}

/** The links of some entries, the oldest first. */
export async function listFormEntryLinks(
  db: Db,
  tenantId: TenantId,
  entryIds: readonly string[],
): Promise<FormEntryLink[]> {
  if (entryIds.length === 0) return [];
  const { data, error } = await tenantDb(db, tenantId)
    .from("form_entry_links")
    .select("id, entry_id, kind, message_id, conversation_id, appointment_id, created_by, created_at")
    .in("entry_id", [...entryIds])
    .order("created_at");
  if (error) throw new DbFailure(error, "form_entry_links");
  return data.flatMap((row) => {
    const kind = linkKindOf(row.kind);
    if (!kind) return [];
    return [
      {
        id: row.id,
        entryId: row.entry_id,
        kind,
        messageId: row.message_id,
        conversationId: row.conversation_id,
        appointmentId: row.appointment_id,
        createdBy: row.created_by,
        createdAt: row.created_at,
      },
    ];
  });
}

/** The reply a member sent from a request, kept as what answered it. */
export async function linkFormReply(
  db: Db,
  linked: { tenantId: TenantId; entryId: string; messageId: string; userId: string },
): Promise<void> {
  const { error } = await db.from("form_entry_links").insert({
    tenant_id: linked.tenantId,
    entry_id: linked.entryId,
    kind: "reply",
    message_id: linked.messageId,
    created_by: linked.userId,
  });
  if (error) throw new DbFailure(error, "form_entry_links");
}

/** A member's word that a request was answered another way. Said twice, it is said once. */
export async function markFormEntryAnswered(
  db: Db,
  marked: { tenantId: TenantId; entryId: string; userId: string },
): Promise<void> {
  const { error } = await db.from("form_entry_links").insert({
    tenant_id: marked.tenantId,
    entry_id: marked.entryId,
    kind: "marked",
    created_by: marked.userId,
  });
  if (error && error.code !== "23505") throw new DbFailure(error, "form_entry_links");
}

/** That word taken back. Answers whether one was there. */
export async function removeFormEntryMark(db: Db, unmarked: { tenantId: TenantId; entryId: string }): Promise<boolean> {
  const { data, error } = await db
    .from("form_entry_links")
    .delete()
    .eq("tenant_id", unmarked.tenantId)
    .eq("entry_id", unmarked.entryId)
    .eq("kind", "marked")
    .select("id");
  if (error) throw new DbFailure(error, "form_entry_links");
  return data.length > 0;
}

/** What one place a form is shared brought, over a window. */
export interface FormPlaceResult {
  formId: string;
  linkId: string | null;
  requests: number;
  talked: number;
  visits: number;
  /** The people who asked: one person with two requests is one. */
  people: number;
  newPeople: number;
  /** The requests that asked for a time (00688, F3). */
  asked: number;
}

/** What a workspace's forms brought over the last `days`, by place, and each link's opens (form_results). */
export async function readFormResults(
  db: Db,
  tenantId: TenantId,
  days: number,
): Promise<{ places: FormPlaceResult[]; opens: Map<string, number>; bookingOpens: Map<string, number> }> {
  const { data, error } = await db.rpc("form_results", { p_tenant_id: tenantId, p_days: days });
  if (error) throw new DbFailure(error, "form_results");
  const row = recordOrEmpty(data);
  const count = (kept: unknown) => (typeof kept === "number" && kept > 0 ? kept : 0);
  const places = (Array.isArray(row.places) ? row.places : []).flatMap((line: unknown) => {
    const place = recordOrEmpty(line);
    if (typeof place.form_id !== "string") return [];
    return [
      {
        formId: place.form_id,
        linkId: keptText(place.link_id),
        requests: count(place.requests),
        talked: count(place.talked),
        visits: count(place.visits),
        people: count(place.people),
        newPeople: count(place.new_people),
        asked: count(place.asked),
      },
    ];
  });
  const countsBy = (lines: unknown, key: "link_id" | "form_id") => {
    const by = new Map<string, number>();
    for (const line of Array.isArray(lines) ? lines : []) {
      const open = recordOrEmpty(line);
      const id = open[key];
      if (typeof id === "string") by.set(id, count(open.opens));
    }
    return by;
  };
  // Each link's opens; and each form's business's own booking page, opened from it (00688).
  return { places, opens: countsBy(row.opens, "link_id"), bookingOpens: countsBy(row.booking_opens, "form_id") };
}

/**
 * Before a message that carries a request's code is kept (form_code_person): the number that wrote, added to the
 * request's person where they have an address and no number. Answers whether a number was added.
 */
export async function addRequestCodeNumber(
  db: Db,
  carried: { tenantId: TenantId; code: string; phone: string },
): Promise<boolean> {
  const { data, error } = await db.rpc("form_code_person", {
    p_tenant_id: carried.tenantId,
    p_code: carried.code,
    p_phone: carried.phone,
  });
  if (error) throw new DbFailure(error, "form_code_person");
  return data === true;
}

/**
 * After that message is kept (form_code_link): its conversation linked to the request, which answers it, and the code
 * spent. Answers the request it linked, or null for a code that is unknown, spent, or past its days.
 */
export async function linkRequestCode(
  db: Db,
  carried: { tenantId: TenantId; code: string; conversationId: string; messageId: string | null },
): Promise<{ entryId: string; samePerson: boolean } | null> {
  const { data, error } = await db.rpc("form_code_link", {
    p_tenant_id: carried.tenantId,
    p_code: carried.code,
    p_conversation_id: carried.conversationId,
    p_message_id: carried.messageId ?? undefined,
  });
  if (error) throw new DbFailure(error, "form_code_link");
  const row = recordOrEmpty(data);
  if (row.linked !== true || typeof row.entry_id !== "string") return null;
  return { entryId: row.entry_id, samePerson: row.same_person === true };
}

/** Held entries past 30 days and tests past 7, gone (form_entries_purge). Answers how many went. */
export async function purgeFormEntries(db: Db): Promise<number> {
  const { data, error } = await db.rpc("form_entries_purge");
  if (error) throw new DbFailure(error, "form_entries_purge");
  return typeof data === "number" ? data : 0;
}

/** How many entries wait in each form's held pile, by form: what the list says quietly beside a form. */
export async function countHeldFormEntries(db: Db, tenantId: TenantId): Promise<Map<string, number>> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("form_entries")
    .select("form_id")
    .eq("state", "held")
    .not("form_id", "is", null)
    .limit(1000);
  if (error) throw new DbFailure(error, "form_entries");
  const held = new Map<string, number>();
  for (const row of data) if (row.form_id) held.set(row.form_id, (held.get(row.form_id) ?? 0) + 1);
  return held;
}
