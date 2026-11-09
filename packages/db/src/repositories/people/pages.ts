/** People: pages. */

import { heldContactId, heldTenantId, DbFailure } from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  openDealsFromJson,
  type NameableContact,
  type PersonDecisionDto,
  type PersonRowDto,
  recordOrEmpty,
  recordOrNull,
} from "@chanlytics/contracts";
import type { Database } from "../../types";
import { readAllRowsByKey } from "../../shared/paged";
import { listThreadsBy } from "./waiting-on-you";
import { PERSON_FACE_COLUMNS } from "../../shared/person-columns";
import type { TenantId, ContactId } from "@chanlytics/contracts";

export type Db = SupabaseClient<Database>;

/** Rows per page: what people_list answers at most (the database clamps p_limit to it). */
export const PEOPLE_PAGE = 1000;

/**
 * The most ids one read names: `.in()` puts every id in the URL, and a request fails at about two hundred. The one
 * bound for every read by ids here (listNamesOfPeople, listMessageSenders, listCallers).
 */
export const IDS_PER_READ = 100;

/**
 * What these people are called, as contracts' personName makes a name: their name, WhatsApp name, number and address,
 * by id. Read under the caller's row security and the workspace's own filter (RLS would show a member of two workspaces
 * the other's people): a person the caller cannot read, or of another workspace, is not answered. One read for a
 * hundred ids or fewer, in batches past that. A read that fails THROWS: a name the database could not answer is never
 * "Unknown".
 */
export async function listNamesOfPeople(
  db: Db,
  tenantId: TenantId,
  ids: readonly ContactId[],
): Promise<Array<{ id: string } & NameableContact>> {
  const out: Array<{ id: string } & NameableContact> = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await db
      .from("contacts")
      .select(PERSON_FACE_COLUMNS)
      .eq("tenant_id", tenantId)
      .in("id", ids.slice(i, i + IDS_PER_READ));
    if (error) throw new DbFailure(error, "listNamesOfPeople");
    out.push(...(data ?? []));
  }
  return out;
}

/** The most decisions a person's page holds: the newest, so what drops is the oldest history. */
const PERSON_DECISIONS = 500;

/**
 * What a person's page shows of what was decided: the ledger's rows about their threads (a take-over, a snooze, a
 * resolve) and about them (pausing or resuming the receptionist for this person is recorded against the contact, not a
 * thread: core person-mode, many-at-once), newest first, at most PERSON_DECISIONS. One read: a decision is about a
 * contact or a conversation, and an id is never both's, so the subject's kind and its id each name the set and the
 * pair is exactly the person and their threads. A person with no thread still has their own. A read that fails THROWS: a
 * history the database could not answer is never a history with nothing in it.
 */
export async function listPersonDecisions(
  db: Db,
  tenantId: TenantId,
  contactId: ContactId,
  conversationIds: readonly string[],
): Promise<PersonDecisionDto[]> {
  const { data, error } = await db
    .from("decisions")
    .select("id, verb, subject_type, subject_id, actor_type, actor_user_id, created_at, payload")
    .eq("tenant_id", tenantId)
    .in("subject_type", ["contact", "conversation"])
    .in("subject_id", [contactId, ...conversationIds])
    // Newest first, and the same order every read: two decisions one transaction wrote share their moment.
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PERSON_DECISIONS);
  if (error) throw new DbFailure(error, "person decisions");
  return (data ?? []).map((d) => ({ ...d, payload: recordOrNull(d.payload) }));
}

/**
 * Where a page of People starts (0021, 00276): just past this place in the kept order, a row's `in_touch_at`,
 * `added_at` and `id`. Someone who writes between two pages moves above it, so a pass that follows it reads nobody
 * twice; they are read on the next pass.
 */
export interface PeopleCursor {
  at: string;
  added: string;
  id: string;
}

/**
 * The place just past a row, when its database says it (00276). Null for a row without it: a database before 00276,
 * whose next page is read by offset, and which is never named a cursor it cannot take.
 */
export function peopleCursorOf(row: PersonRowDto | undefined): PeopleCursor | null {
  return row?.in_touch_at && row.added_at ? { at: row.in_touch_at, added: row.added_at, id: row.id } : null;
}

/**
 * One page of people: after a cursor, or an offset. The page arguments are named only when they leave their defaults,
 * so a database that has not been given 00112 answers the first page as it always has, and one before 00276 is never
 * named a cursor (a cursor comes only from a row that carries its place). A read that fails THROWS: a page the
 * database could not answer is never an empty workspace.
 */
export async function listPeoplePage(
  db: Db,
  tenantId: TenantId,
  page: { q?: string | null; offset?: number; limit?: number; after?: PeopleCursor | null } = {},
): Promise<PersonRowDto[]> {
  const offset = page.offset ?? 0;
  const limit = page.limit ?? PEOPLE_PAGE;
  const after = page.after ?? null;
  const { data, error } = await db.rpc("people_list", {
    p_tenant_id: tenantId,
    ...(page.q ? { p_query: page.q } : {}),
    ...(offset > 0 ? { p_offset: offset } : {}),
    ...(limit !== PEOPLE_PAGE ? { p_limit: limit } : {}),
    ...(after ? { p_after_at: after.at, p_after_added: after.added, p_after_id: after.id } : {}),
  });
  if (error) throw new DbFailure(error);
  return (data ?? []).map(rowOfPeopleList);
}

type PeopleListRow = Database["public"]["Functions"]["people_list"]["Returns"][number];

/**
 * A people_list row as People reads it: every open deal (0029) arrives as jsonb, read into its shape, or left absent
 * where the database has no such column. One reading for the list and the person page.
 */
function rowOfPeopleList({ open_deals, ...row }: PeopleListRow): PersonRowDto {
  const deals = openDealsFromJson(open_deals);
  return deals === undefined ? row : { ...row, open_deals: deals };
}

type PersonOf = string | { thread: string };

/**
 * One person's People row, as the list shows it (people_list narrowed to them), or null for someone it does not hold.
 * The person page reads its row here, so it is read the way the list reads it, and the Inbox's head the person a thread is
 * with (`{ thread }`: none for a thread this workspace does not hold, GET contacts?thread). A read that fails THROWS.
 */
export async function findPersonRow(db: Db, tenantId: TenantId, personOf: PersonOf): Promise<PersonRowDto | null> {
  const [thread] = typeof personOf === "string" ? [] : await listThreadsBy(db, tenantId, "id", [personOf.thread]);
  const contactId = typeof personOf === "string" ? personOf : thread?.contact_id;
  if (!contactId) return null;
  const { data, error } = await db.rpc("people_list", { p_tenant_id: tenantId, p_contact_id: contactId });
  if (error) throw new DbFailure(error);
  const first = (data ?? [])[0];
  return first ? rowOfPeopleList(first) : null;
}

/**
 * Everyone, every page of them: whatever counts people counts everyone. One call is at most a thousand rows, and a
 * caller that does not loop gets a thousand with no error, no flag and no way to tell them from "that is everyone".
 * Each page after the first starts just past the last row's place (00276), so nobody is read twice when someone writes
 * between two pages; from a database before 00276, by offset, as it always was.
 */
export async function listEveryoneIn(db: Db, tenantId: TenantId): Promise<PersonRowDto[]> {
  const all: PersonRowDto[] = [];
  for await (const page of everyonePages(db, tenantId)) all.push(...page);
  return all;
}

/** Every page of people in the kept order, each just past the last row's place; by offset before 00276. */
async function* everyonePages(db: Db, tenantId: TenantId): AsyncGenerator<PersonRowDto[]> {
  let read = 0;
  for (let after: PeopleCursor | null = null; ;) {
    const page = await listPeoplePage(db, tenantId, after ? { after } : { offset: read });
    read += page.length;
    yield page;
    if (page.length < PEOPLE_PAGE) return;
    after = peopleCursorOf(page[page.length - 1]);
  }
}

/** More people than any workspace holds; a copy whose read reaches it throws rather than call a part the whole. */
const COPY_READ_CAP = 500_000;

/** How many people a copy reads by their own row at once, for the ones its pass missed. */
const MISSED_AT_ONCE = 10;

/**
 * Everyone exactly once, a page at a time, for a copy of them (the people CSV, the workspace export).
 *
 * everyoneIn's cursor is on a key that moves: someone the pass has not reached who writes moves above it, and is read
 * on the next pass. People has a next pass; a file does not, so it left them out and looked whole, and by offset
 * (before 00276) it also held the person on the boundary twice. The order is people_list's alone, so no key that never
 * moves can page it. So the pass keeps each person the first time it reads them; then the ids of everyone live are
 * read by the one key that never moves, their own (after the pass, so whoever came in during it is among them); and
 * whoever the pass missed is read by their own row. Everyone live when the read ends is in the copy once; someone
 * erased or merged during it is in it as they were, or not at all. A read that fails THROWS.
 */
export async function* listEveryoneOnceIn(db: Db, tenantId: TenantId): AsyncGenerator<PersonRowDto[]> {
  const seen = new Set<string>();
  for await (const page of everyonePages(db, tenantId)) {
    const fresh = page.filter((p) => !seen.has(p.id));
    for (const p of fresh) seen.add(p.id);
    yield fresh;
  }
  const live = await readAllRowsByKey<{ id: string }>(
    "live people",
    (c) => c.id,
    (after, size) => {
      let q = db
        .from("contacts")
        .select("id")
        .eq("tenant_id", tenantId)
        .is("erased_at", null)
        .is("merged_into_contact_id", null);
      if (after) q = q.gt("id", after);
      return q.order("id").limit(size);
    },
    COPY_READ_CAP,
    (subject, cap) => {
      throw new Error(`${subject}: more than ${cap}; no copy is whole`);
    },
  );
  const missed = live.map((c) => c.id).filter((id) => !seen.has(id));
  for (let i = 0; i < missed.length; i += MISSED_AT_ONCE) {
    const rows = await Promise.all(missed.slice(i, i + MISSED_AT_ONCE).map((id) => findPersonRow(db, tenantId, id)));
    yield rows.filter((r): r is PersonRowDto => r !== null);
  }
}

/**
 * The erasure digests of these values in this workspace (00263 erasure_digests): the database's own, since only it
 * holds the pepper that keys them once the re-key has run. Value → digest, one call for all of them; a value asked
 * twice is asked once. Throws when the database cannot answer: "we could not check" is never "nobody was erased".
 */
export async function getErasureDigests(db: Db, tenantId: TenantId, values: string[]): Promise<Map<string, string>> {
  const items = [...new Set(values.filter((v) => v !== ""))];
  if (items.length === 0) return new Map();
  const { data, error } = await db.rpc("erasure_digests", { p_tenant_id: tenantId, p_values: items });
  if (error) throw new DbFailure(error, "cannot make the erasure digests");
  const digests = data ?? [];
  if (digests.length !== items.length) throw new Error("the erasure digests came back short");
  const out = new Map<string, string>();
  for (const [i, value] of items.entries()) {
    const digest = digests[i];
    if (digest === undefined) throw new Error("the erasure digests came back short");
    out.set(value, digest);
  }
  return out;
}

/**
 * An erasure's hand in other people's notes (person_notes_scrub, 00341; decision 0036): each of the person's numbers
 * and addresses (`needles`, erasureKeys) overwritten with "[erased]" in place, in every note of the workspace but the
 * person's own, which go with them. Nothing is deleted and names are left. Answers how many notes changed. Service role.
 */
export async function scrubPersonNotes(
  db: Db,
  tenantId: TenantId,
  contactId: ContactId,
  needles: readonly string[],
): Promise<number> {
  const { data, error } = await db.rpc("person_notes_scrub", {
    p_tenant_id: tenantId,
    p_contact_id: contactId,
    p_needles: [...needles],
  });
  // A database before 00341 has no scrub, and the notes stay as they were: the dashboard may deploy first (either order).
  if (error && (error.code === "PGRST202" || error.code === "42883")) return 0;
  if (error) throw new DbFailure(error, "person_notes_scrub");
  return data ?? 0;
}

/** A door's answer as it came, with the database's own error beside it (the dashboard's noteAnswer reads it). */
type DoorAnswer = { data: unknown; error: { code?: string; message: string } | null };

/**
 * A member writes a note on a person, as themselves (person_note_add, 0007): the door's answer as it came, {note} or
 * {error}, with the database's own error beside it, for the caller to read as the notes route reads one (the
 * dashboard's noteAnswer). The plan a conversation begins with is kept this way (core begin.ts), for the receptionist
 * to read, never for the team alone.
 */
export async function addPersonNote(
  db: Db,
  contactId: ContactId,
  body: string,
  teamOnly: boolean,
  more: { forUserId?: string | null; dueOn?: string | null; dealId?: string | null } = {},
): Promise<DoorAnswer> {
  const { data, error } = await db.rpc("person_note_add", {
    p_contact_id: contactId,
    p_body: body,
    p_team_only: teamOnly,
    ...(more.forUserId ? { p_for_user_id: more.forUserId } : {}),
    ...(more.dueOn ? { p_due_on: more.dueOn } : {}),
    ...(more.dealId ? { p_deal_id: more.dealId } : {}),
  });
  return { data, error };
}

/** A call a member made, as the door keeps it (person_call_logged, 0052): the note's words and the lead's ask, spelled by contracts. */
export interface PersonCallArgs {
  contactId: ContactId;
  outcome: string;
  body: string;
  dueOn: string | null;
  tell: boolean;
  stepBody: string | null;
  lead: { stage: string | null; reason: string | null; note: string | null; spokeWith: string | null } | null;
  /** This call was the call back they asked for (00422): sent only when true, so a database before it answers as before. */
  closesCallBack: boolean;
}

/**
 * A call logged on a person, as the signed-in member (person_call_logged): a note (a step with a day), and the outcome on
 * the lead their business is, where it is open. The door's answer as it came, {note, step, lead} or {error}, with the
 * database's own error beside it, for the caller to read as the notes route reads one.
 */
export async function logPersonCall(db: Db, personCallArgs: PersonCallArgs): Promise<DoorAnswer> {
  const { data, error } = await db.rpc("person_call_logged", {
    p_contact_id: personCallArgs.contactId,
    p_outcome: personCallArgs.outcome,
    p_body: personCallArgs.body,
    p_tell: personCallArgs.tell,
    ...(personCallArgs.dueOn ? { p_due_on: personCallArgs.dueOn } : {}),
    ...(personCallArgs.stepBody ? { p_step_body: personCallArgs.stepBody } : {}),
    ...(personCallArgs.lead?.stage ? { p_lead_stage: personCallArgs.lead.stage } : {}),
    ...(personCallArgs.lead?.reason ? { p_lead_reason: personCallArgs.lead.reason } : {}),
    ...(personCallArgs.lead?.note ? { p_lead_note: personCallArgs.lead.note } : {}),
    ...(personCallArgs.lead?.spokeWith ? { p_spoke_with: personCallArgs.lead.spokeWith } : {}),
    ...(personCallArgs.closesCallBack ? { p_closes_call_back: true } : {}),
  });
  return { data, error };
}

/** What the merge door answers (merge_people, 00326): the kept record, the merged one, and what moved. */
interface MergedPeople {
  contact_id: ContactId;
  merged: string;
  tenant_id: TenantId;
  decision_id: string;
  consent: string;
  marketing_consent: string;
  email_marketing: string;
  counts: Record<string, number | string>;
}

/**
 * Two records of one person become one (decision 0028): the one door, `merge_people`, as the signed-in owner. The caller
 * is `auth.uid()` inside the door, so the session client is what is handed in, never the service role. The door's
 * refusals come back as the database's error with the sentence contracts holds (MERGE_REFUSALS); the route turns one
 * into its own status (dbRefusal). Everything the door moves, it moves in one transaction.
 */
export async function mergePeople(db: Db, keep: string, merge: string): Promise<MergedPeople> {
  const { data, error } = await db.rpc("merge_people", { p_keep: keep, p_merge: merge });
  if (error) throw new DbFailure(error);
  return mergedOf(data);
}

/**
 * Where a person combined into another now is (0028): the record kept, through up to five later combines, in this
 * workspace; null where they were never combined, or the record kept is erased or not here. A read that fails THROWS.
 */
export async function findKeptPerson(db: Db, tenantId: TenantId, contactId: ContactId): Promise<string | null> {
  let at = contactId;
  for (let hop = 0; hop <= 5; hop++) {
    const { data, error } = await db
      .from("contacts")
      .select("merged_into_contact_id, erased_at")
      .eq("tenant_id", tenantId)
      .eq("id", at)
      .maybeSingle();
    if (error) throw new DbFailure(error);
    if (!data || data.erased_at) return null;
    if (!data.merged_into_contact_id) return at === contactId ? null : at;
    at = data.merged_into_contact_id;
  }
  return null;
}

/**
 * The door's answer read key by key: a word where it said one, the counts as it gave them, never a cast. An answer
 * that names no kept or merged record is not the door's, and is refused rather than read as a success: the merge has
 * committed by then, and the route answers that something went wrong, never a page with nobody on it.
 */
function mergedOf(value: unknown): MergedPeople {
  const otherValue = recordOrEmpty(value);
  const word = (k: string): string => (typeof otherValue[k] === "string" ? otherValue[k] : "");
  if (!word("contact_id") || !word("merged")) throw new Error("merge_people answered without the two records");
  const counts =
    otherValue.counts && typeof otherValue.counts === "object" && !Array.isArray(otherValue.counts)
      ? recordOrEmpty(otherValue.counts)
      : {};
  const out: Record<string, number | string> = {};
  for (const [k, n] of Object.entries(counts)) if (typeof n === "number" || typeof n === "string") out[k] = n;
  return {
    contact_id: heldContactId(word("contact_id")),
    merged: word("merged"),
    tenant_id: heldTenantId(word("tenant_id")),
    decision_id: word("decision_id"),
    consent: word("consent"),
    marketing_consent: word("marketing_consent"),
    email_marketing: word("email_marketing"),
    counts: out,
  };
}

/* ------------------------------------------------------------ where a person works, and what to call them (0052) -- */

/**
 * What a name door answers (00413: person_name_adopt, person_name_undo, person_name_decline): whether it did it, the
 * name the person now has, and why not where it did not (gone, no_signer, settled, named, not_a_signer).
 */
export interface PersonNameAnswer {
  done: boolean;
  name: string | null;
  why: string | null;
}

/** A door's answer read key by key; the first of `doneKeys` that is true says it was done. */
function nameAnswerOf(v: unknown, doneKey: "named" | "undone" | "declined"): PersonNameAnswer {
  const o = recordOrEmpty(v);
  return {
    done: o[doneKey] === true,
    name: typeof o.name === "string" ? o.name : null,
    why: typeof o.why === "string" ? o.why : null,
  };
}

/**
 * Use this name (0052): the name a reply was signed with becomes its writer's, through the door as the signed-in
 * member (session client: the door reads auth.uid() and refuses anyone who may not act here). A press settles it.
 */
export async function adoptPersonName(db: Db, personId: string, messageId: string): Promise<PersonNameAnswer> {
  const { data, error } = await db.rpc("person_name_adopt", { p_contact_id: personId, p_message_id: messageId });
  if (error) throw new DbFailure(error);
  return nameAnswerOf(data, "named");
}

/** Undo of Use this name: the name it replaced goes back, settled, so that sign-off is never taken again. */
export async function undoPersonName(db: Db, personId: string): Promise<PersonNameAnswer> {
  const { data, error } = await db.rpc("person_name_undo", { p_contact_id: personId });
  if (error) throw new DbFailure(error);
  return nameAnswerOf(data, "undone");
}

/** The notice's ×: the signer declined for everyone, the name settled. */
export async function declinePersonName(db: Db, personId: string, messageId: string): Promise<PersonNameAnswer> {
  const { data, error } = await db.rpc("person_name_decline", { p_contact_id: personId, p_message_id: messageId });
  if (error) throw new DbFailure(error);
  return nameAnswerOf(data, "declined");
}

/** Link a business (0052): the person works at this lead, by a member's hand, settled. */
export async function joinPersonToLead(db: Db, personId: string, leadId: string): Promise<{ leadId: string }> {
  const { data, error } = await db.rpc("person_join_lead", { p_contact_id: personId, p_lead_id: leadId });
  if (error) throw new DbFailure(error);
  const o = recordOrEmpty(data);
  return { leadId: typeof o.lead_id === "string" ? o.lead_id : leadId };
}

/** Not at this business (0052): the person is unlinked from the lead they work at, settled. */
export async function leavePersonLead(db: Db, personId: string): Promise<{ left: boolean }> {
  const { data, error } = await db.rpc("person_leave_lead", { p_contact_id: personId });
  if (error) throw new DbFailure(error);
  const o = recordOrEmpty(data);
  return { left: o.left === true };
}
