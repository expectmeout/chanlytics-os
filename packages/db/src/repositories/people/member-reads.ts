/**
 * What the member's People pages read and write of a person beside their own doors (decision 0111): people by id,
 * the workspace's reply rules a page at a time, how many people a narrowing lists, a person's notes, a note added from
 * a bulk act, and the details doors (a name, notes, a proposal). Read on the member's own client. Each answer is the
 * database's as it came; the caller says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";
import type { TenantId, ContactId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** These people's workspace and erasure. */
export const listPeopleStanding = async (db: Db, contactIds: ContactId[]) =>
  db.from("contacts").select("id, tenant_id, erased_at").in("id", contactIds);

/** One page (`from` to `to`) of the workspace's reply rules, the workspace's own first. */
export const pageReplyRules = async (db: Db, tenantId: TenantId, from: number, to: number) =>
  db
    .from("policies")
    .select("subject_type, subject_id, mode")
    .eq("tenant_id", tenantId)
    .eq("class", "reply")
    .order("subject_type", { ascending: true, nullsFirst: true })
    .order("id")
    .range(from, to);

/**
 * How many of the workspace's people the People page lists (`listedOr`, people_page's own rule, 00547), and of them,
 * with `searchOr`, those a search names.
 */
export const countPeopleListed = async (db: Db, tenantId: TenantId, listedOr: string, searchOr: string | null) => {
  const query = db
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("erased_at", null)
    .is("merged_into_contact_id", null)
    .or(listedOr);
  return searchOr ? query.or(searchOr) : query;
};

/** What a note is read with. */
const NOTE_COLUMNS =
  "id, contact_id, body, author_kind, author_user_id, for_user_id, team_only, state, source, version, created_at, updated_at, due_on, done_at, done_by, deal_id, for_seen_at";

/** A person's notes, newest first, `limit` of them. */
export const listPersonNotes = async (db: Db, tenantId: TenantId, contactId: ContactId, limit: number) =>
  db
    .from("person_notes")
    .select(NOTE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(limit);

/** One of a person's notes, or none. */
export const findPersonNote = async (db: Db, contactId: ContactId, noteId: string) =>
  db.from("person_notes").select(NOTE_COLUMNS).eq("id", noteId).eq("contact_id", contactId).maybeSingle();

/** A note added to a person from a bulk act (person_note_add, its source `bulk`). */
export const addBulkNote = async (db: Db, contactId: ContactId, body: string) =>
  db.rpc("person_note_add", { p_contact_id: contactId, p_body: body, p_source: "bulk" });

/** A person's name, through its door (set_person_name). */
export const setPersonName = async (db: Db, contactId: ContactId, name: string) =>
  db.rpc("set_person_name", { p_contact_id: contactId, p_name: name });

/** A person's notes field, through its door (set_person_notes). */
export const setPersonNotes = async (db: Db, contactId: ContactId, notes: string) =>
  db.rpc("set_person_notes", { p_contact_id: contactId, p_notes: notes });

/** A person's proposal link, through its door (set_person_proposal). */
export const setPersonProposal = async (db: Db, contactId: ContactId, url: string) =>
  db.rpc("set_person_proposal", { p_contact_id: contactId, p_url: url });

/** A person's identities on each channel, the oldest first: what their page lists as how they reach the business. */
export const listPersonIdentities = async (db: Db, contactId: ContactId) =>
  db
    .from("contact_identities")
    .select("channel, external_id, created_at")
    .eq("contact_id", contactId)
    .order("created_at");

/** What a person's own row holds beside the list's: the owner's notes, their proposal's link, what came before, and how they came. */
export const findPersonOwnColumns = async (db: Db, contactId: ContactId) =>
  db
    .from("contacts")
    .select("notes, proposal_url, before, acquired_via, acquired_ref")
    .eq("id", contactId)
    .maybeSingle();

/** The receptionist's reply mode for one person (`contactId`), or the workspace's own (null): one policy row, or none. */
export const findReplyPolicyMode = async (db: Db, tenantId: TenantId, contactId: ContactId | null) => {
  const policy = db.from("policies").select("mode").eq("tenant_id", tenantId).eq("class", "reply");
  return (
    contactId ? policy.eq("subject_type", "contact").eq("subject_id", contactId) : policy.is("subject_type", null)
  ).maybeSingle();
};

/** How a person first came, where it was not a message or a call: the door's contact.added row for them. */
export const findPersonAddedRow = async (db: Db, tenantId: TenantId, contactId: ContactId) =>
  db
    .from("events")
    .select("data, created_at")
    .eq("tenant_id", tenantId)
    .eq("kind", "contact.added")
    .eq("subject_type", "contact")
    .eq("subject_id", contactId)
    .order("created_at")
    .limit(1)
    .maybeSingle();

/** Every change to a person's consent, the newest first, two hundred at most: the ledger rows the doors write. */
export const listPersonConsentChanges = async (db: Db, tenantId: TenantId, contactId: ContactId) =>
  db
    .from("events")
    .select("id, subject_id, created_at, data")
    .eq("tenant_id", tenantId)
    .eq("kind", "contact.consent_changed")
    .eq("subject_type", "contact")
    .eq("subject_id", contactId)
    .order("created_at", { ascending: false })
    .limit(200);
