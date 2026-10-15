/**
 * Everyone in People, as `people_list` (00112) computes them under the caller's row security.
 *
 * One pager for the dashboard's lists, counts and exports and the edge's playbook sweep: each had its own loop over
 * the same function, with its own page size and its own rule for when to name the page arguments. And the names of a
 * few people by their ids, for a read that holds their ids and not their names (Ask's message search).
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  openDealsFromJson,
  type DoubtSeen,
  type NameableContact,
  type PersonAtLeadDto,
  type PersonDecisionDto,
  type PersonDoubtDto,
  type PersonRowDto,
  type PersonSignerDto,
  type SeenMarksDto,
} from "@chanlytics/contracts";
import type { Database, Json } from "../database.types";
import { readAllRowsByKey } from "../paged";
import { personIdsWaitingOnYou } from "./waiting-on-you";

type Db = SupabaseClient<Database>;

/** Rows per page: what people_list answers at most (the database clamps p_limit to it). */
export const PEOPLE_PAGE = 1000;

/**
 * The most ids one read names: `.in()` puts every id in the URL, and a request fails at about two hundred. The one
 * bound for every read by ids here (namesOfPeople, messageSenders, callersOf).
 */
export const IDS_PER_READ = 100;

/**
 * What these people are called, as contracts' personName makes a name: their name, WhatsApp name, number and address,
 * by id. Read under the caller's row security and the workspace's own filter (RLS would show a member of two workspaces
 * the other's people): a person the caller cannot read, or of another workspace, is not answered. One read for a
 * hundred ids or fewer, in batches past that. A read that fails THROWS: a name the database could not answer is never
 * "Unknown".
 */
export async function namesOfPeople(
  db: Db,
  tenantId: string,
  ids: readonly string[],
): Promise<Array<{ id: string } & NameableContact>> {
  const out: Array<{ id: string } & NameableContact> = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await db
      .from("contacts")
      .select("id, display_name, wa_profile_name, phone_e164, email")
      .eq("tenant_id", tenantId)
      .in("id", ids.slice(i, i + IDS_PER_READ));
    if (error) throw new Error(`namesOfPeople: ${error.message}`);
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
export async function personDecisions(
  db: Db,
  tenantId: string,
  contactId: string,
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
  if (error) throw new Error(`person decisions: ${error.message}`);
  return (data ?? []).map((d) => ({ ...d, payload: d.payload as Record<string, unknown> | null }));
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
export async function peoplePage(
  db: Db,
  tenantId: string,
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
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
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

/**
 * One person's People row, as the list shows it (people_list narrowed to them), or null for someone it does not hold.
 * The person page reads its row here, so it is read the way the list reads it. A read that fails THROWS.
 */
export async function personRow(db: Db, tenantId: string, contactId: string): Promise<PersonRowDto | null> {
  const { data, error } = await db.rpc("people_list", { p_tenant_id: tenantId, p_contact_id: contactId });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  const first = (data ?? [])[0];
  return first ? rowOfPeopleList(first) : null;
}

/**
 * Everyone, every page of them: whatever counts people counts everyone. One call is at most a thousand rows, and a
 * caller that does not loop gets a thousand with no error, no flag and no way to tell them from "that is everyone".
 * Each page after the first starts just past the last row's place (00276), so nobody is read twice when someone writes
 * between two pages; from a database before 00276, by offset, as it always was.
 */
export async function everyoneIn(db: Db, tenantId: string): Promise<PersonRowDto[]> {
  const all: PersonRowDto[] = [];
  for await (const page of everyonePages(db, tenantId)) all.push(...page);
  return all;
}

/** Every page of people in the kept order, each just past the last row's place; by offset before 00276. */
async function* everyonePages(db: Db, tenantId: string): AsyncGenerator<PersonRowDto[]> {
  let read = 0;
  for (let after: PeopleCursor | null = null; ;) {
    const page = await peoplePage(db, tenantId, after ? { after } : { offset: read });
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
export async function* everyoneOnceIn(db: Db, tenantId: string): AsyncGenerator<PersonRowDto[]> {
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
    (what, cap) => {
      throw new Error(`${what}: more than ${cap}; no copy is whole`);
    },
  );
  const missed = live.map((c) => c.id).filter((id) => !seen.has(id));
  for (let i = 0; i < missed.length; i += MISSED_AT_ONCE) {
    const rows = await Promise.all(missed.slice(i, i + MISSED_AT_ONCE).map((id) => personRow(db, tenantId, id)));
    yield rows.filter((r): r is PersonRowDto => r !== null);
  }
}

/**
 * The erasure digests of these values in this workspace (00263 erasure_digests): the database's own, since only it
 * holds the pepper that keys them once the re-key has run. Value → digest, one call for all of them; a value asked
 * twice is asked once. Throws when the database cannot answer: "we could not check" is never "nobody was erased".
 */
export async function erasureDigests(db: Db, tenantId: string, values: string[]): Promise<Map<string, string>> {
  const asked = [...new Set(values.filter((v) => v !== ""))];
  if (asked.length === 0) return new Map();
  const { data, error } = await db.rpc("erasure_digests", { p_tenant_id: tenantId, p_values: asked });
  if (error) throw new Error(`cannot make the erasure digests: ${error.message}`);
  const digests = data ?? [];
  if (digests.length !== asked.length) throw new Error("the erasure digests came back short");
  const out = new Map<string, string>();
  for (const [i, value] of asked.entries()) {
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
  tenantId: string,
  contactId: string,
  needles: readonly string[],
): Promise<number> {
  const { data, error } = await db.rpc("person_notes_scrub", {
    p_tenant_id: tenantId,
    p_contact_id: contactId,
    p_needles: [...needles],
  });
  // A database before 00341 has no scrub, and the notes stay as they were: the dashboard may deploy first (either order).
  if (error && (error.code === "PGRST202" || error.code === "42883")) return 0;
  if (error) throw new Error(`person_notes_scrub: ${error.message}`);
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
export async function addPersonNote(db: Db, contactId: string, body: string, teamOnly: boolean): Promise<DoorAnswer> {
  const { data, error } = await db.rpc("person_note_add", {
    p_contact_id: contactId,
    p_body: body,
    p_team_only: teamOnly,
  });
  return { data, error };
}

/** A call a member made, as the door keeps it (person_call_logged, 0052): the note's words and the lead's ask, spelled by contracts. */
export interface PersonCallArgs {
  contactId: string;
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
export async function logPersonCall(db: Db, a: PersonCallArgs): Promise<DoorAnswer> {
  const { data, error } = await db.rpc("person_call_logged", {
    p_contact_id: a.contactId,
    p_outcome: a.outcome,
    p_body: a.body,
    p_tell: a.tell,
    ...(a.dueOn ? { p_due_on: a.dueOn } : {}),
    ...(a.stepBody ? { p_step_body: a.stepBody } : {}),
    ...(a.lead?.stage ? { p_lead_stage: a.lead.stage } : {}),
    ...(a.lead?.reason ? { p_lead_reason: a.lead.reason } : {}),
    ...(a.lead?.note ? { p_lead_note: a.lead.note } : {}),
    ...(a.lead?.spokeWith ? { p_spoke_with: a.lead.spokeWith } : {}),
    ...(a.closesCallBack ? { p_closes_call_back: true } : {}),
  });
  return { data, error };
}

/** What the merge door answers (merge_people, 00326): the kept record, the merged one, and what moved. */
interface MergedPeople {
  contact_id: string;
  merged: string;
  tenant_id: string;
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
  if (error) throw error;
  return mergedOf(data);
}

/**
 * Where a person combined into another now is (0028): the record kept, through up to five later combines, in this
 * workspace; null where they were never combined, or the record kept is erased or not here. A read that fails THROWS.
 */
export async function keptPersonOf(db: Db, tenantId: string, contactId: string): Promise<string | null> {
  let at = contactId;
  for (let hop = 0; hop <= 5; hop++) {
    const { data, error } = await db
      .from("contacts")
      .select("merged_into_contact_id, erased_at")
      .eq("tenant_id", tenantId)
      .eq("id", at)
      .maybeSingle();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
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
function mergedOf(v: unknown): MergedPeople {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const word = (k: string): string => (typeof o[k] === "string" ? o[k] : "");
  if (!word("contact_id") || !word("merged")) throw new Error("merge_people answered without the two records");
  const counts =
    o.counts && typeof o.counts === "object" && !Array.isArray(o.counts) ? (o.counts as Record<string, unknown>) : {};
  const out: Record<string, number | string> = {};
  for (const [k, n] of Object.entries(counts)) if (typeof n === "number" || typeof n === "string") out[k] = n;
  return {
    contact_id: word("contact_id"),
    merged: word("merged"),
    tenant_id: word("tenant_id"),
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
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
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
  if (error) throw error;
  return nameAnswerOf(data, "named");
}

/** Undo of Use this name: the name it replaced goes back, settled, so that sign-off is never taken again. */
export async function undoPersonName(db: Db, personId: string): Promise<PersonNameAnswer> {
  const { data, error } = await db.rpc("person_name_undo", { p_contact_id: personId });
  if (error) throw error;
  return nameAnswerOf(data, "undone");
}

/** The notice's ×: the signer declined for everyone, the name settled. */
export async function declinePersonName(db: Db, personId: string, messageId: string): Promise<PersonNameAnswer> {
  const { data, error } = await db.rpc("person_name_decline", { p_contact_id: personId, p_message_id: messageId });
  if (error) throw error;
  return nameAnswerOf(data, "declined");
}

/** Link a business (0052): the person works at this lead, by a member's hand, settled. */
export async function joinPersonToLead(db: Db, personId: string, leadId: string): Promise<{ leadId: string }> {
  const { data, error } = await db.rpc("person_join_lead", { p_contact_id: personId, p_lead_id: leadId });
  if (error) throw error;
  const o = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  return { leadId: typeof o.lead_id === "string" ? o.lead_id : leadId };
}

/** Not at this business (0052): the person is unlinked from the lead they work at, settled. */
export async function leavePersonLead(db: Db, personId: string): Promise<{ left: boolean }> {
  const { data, error } = await db.rpc("person_leave_lead", { p_contact_id: personId });
  if (error) throw error;
  const o = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  return { left: o.left === true };
}

/**
 * Got it (canvas A, Up next): the member a note is for marks it read, through the door as the signed-in member (it
 * reads auth.uid()). `not_yours` for a note that is for someone else; `not_found` for one the caller cannot see.
 */
export async function seePersonNote(db: Db, noteId: string): Promise<{ seen: boolean; why: string | null }> {
  const { data, error } = await db.rpc("person_note_seen", { p_note_id: noteId });
  if (error) throw error;
  const o = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  return { seen: typeof o.seen === "string", why: typeof o.error === "string" ? o.error : null };
}

/** The most people one business lists: a business is a few people, and the sheet says the rest are there. */
const PEOPLE_AT_A_LEAD = 20;

/**
 * Everyone who works at one lead (contacts.lead_id, 0052), the most recently in touch first, under the caller's row
 * security and the workspace's own filter. Living people only: not erased, not merged into another.
 */
export async function peopleAtLead(db: Db, tenantId: string, leadId: string): Promise<PersonAtLeadDto[]> {
  const { data, error } = await db
    .from("contacts")
    .select("id, display_name, wa_profile_name, phone_e164, email, name_source")
    .eq("tenant_id", tenantId)
    .eq("lead_id", leadId)
    .is("erased_at", null)
    .is("merged_into_contact_id", null)
    .limit(PEOPLE_AT_A_LEAD);
  if (error) throw new Error(`peopleAtLead: ${error.message}`);
  const people = data ?? [];
  if (!people.length) return [];
  const ids = people.map((p) => p.id);
  // Who waits on a person by the one standing rule, on their latest thread: a colleague whose thread the reader holds
  // wore a Needs you dot from the raw needs_human column (the wiring's second audit, R11 S9-1).
  const [moments, needs] = await Promise.all([
    db.from("person_moments").select("contact_id, in_touch_at").eq("tenant_id", tenantId).in("contact_id", ids),
    personIdsWaitingOnYou(db, tenantId, ids, Date.now()),
  ]);
  if (moments.error) throw new Error(`peopleAtLead: ${moments.error.message}`);
  const touched = new Map((moments.data ?? []).map((m) => [m.contact_id, m.in_touch_at]));
  return people
    .map((p) => {
      const at = touched.get(p.id) ?? null;
      // -infinity is People's "never in touch".
      return { ...p, in_touch_at: at && !at.startsWith("-") ? at : null, needs_you: needs.has(p.id) };
    })
    .sort((a, b) => (b.in_touch_at ?? "").localeCompare(a.in_touch_at ?? ""));
}

/**
 * The signers of the replies this person wrote that are still offered or were adopted, the newest first: the notice and
 * its undo. A signer is its reply's writer's alone (0052), never the lead's person a colleague answered for.
 */
export async function signersOf(db: Db, tenantId: string, personId: string): Promise<PersonSignerDto[]> {
  const { data, error } = await db
    .from("sequence_replies")
    .select("message_id, signer_name, signer_title, signer_state, read_at, intent, claim")
    .eq("tenant_id", tenantId)
    .eq("contact_id", personId)
    .in("signer_state", ["offered", "adopted"])
    .is("undone_at", null)
    .order("read_at", { ascending: false })
    .limit(5);
  if (error) throw new Error(`signersOf: ${error.message}`);
  return (data ?? []).flatMap((r) =>
    r.signer_name && (r.signer_state === "offered" || r.signer_state === "adopted")
      ? [
          {
            message_id: r.message_id,
            name: r.signer_name,
            title: r.signer_title,
            state: r.signer_state,
            read_at: r.read_at,
            intent: r.intent,
            claim: r.claim,
          },
        ]
      : [],
  );
}

/** What a door hands resolve_person (00342, 00344): the identity as it saw it, and how sure it is of it. */
export interface ResolvePersonInput {
  tenantId: string;
  /** The provider's identity: its channel and id, both or neither. */
  channel?: "whatsapp" | "voice" | "sms" | "email" | "instagram" | null;
  external?: string | null;
  phone?: string | null;
  email?: string | null;
  name?: string | null;
  /** observed: they wrote to us on that wire; asserted: a member typed it; found: the finder or a feed named it. */
  assurance: "observed" | "asserted" | "found";
  /** Where they came from, on contact.added when the door makes them: calendar, lead, import, manual, call, inbound. */
  source: string;
  /** The caller's own words for contact.added: a calendar guest's title, uid and start; a lead's id. */
  detail?: Json;
}

/** What the door answers. */
export interface ResolvedPerson {
  contact_id: string;
  outcome: "new" | "matched" | "filled";
  existed: boolean;
  matched_by: "identity" | "phone" | "email" | "race" | null;
  email: "set" | "kept" | "taken" | null;
  filled: string[];
  identity: "added" | "raised" | "kept" | null;
  /** The other record one of the identities names, when the pair could be one person; written on person_doubts. */
  doubt: string | null;
  doubt_seen: DoubtSeen | null;
}

/**
 * A person, resolved by the one door (decision 0034): the erasure digests first on the passive paths, then the identity,
 * the number and the address; fills what is empty and never overwrites; never merges, and writes a doubt instead. The
 * service role calls it (the edge's sweeps and doors, the dashboard's server); a session is refused, so a member's
 * door is create_person or import_person. A person who asked to be forgotten refuses with the door's own code, PE001,
 * which a caller counts as one person refused, never everyone: the error's code is kept on the thrown error.
 */
export async function resolvePerson(db: Db, p: ResolvePersonInput): Promise<ResolvedPerson> {
  // Every argument of 00342's signature is named, an empty word for what the caller did not see (the door reads it as
  // none), so a database still on 00342 answers the call as one on 00344 does: either deploy order. p_seen_at, which
  // 00344 added with a default, is never named.
  const { data, error } = await db.rpc("resolve_person", {
    p_tenant_id: p.tenantId,
    p_channel: p.channel ?? "",
    p_external: p.external ?? "",
    p_phone: p.phone ?? "",
    p_email: p.email ?? "",
    p_name: p.name ?? "",
    p_assurance: p.assurance,
    p_source: p.source,
    p_detail: p.detail ?? {},
  });
  if (error) throw Object.assign(new Error(`resolve_person: ${error.message}`), { code: error.code });
  const o = (data ?? {}) as Record<string, unknown>;
  if (typeof o.contact_id !== "string") throw new Error("resolve_person answered without a person");
  return {
    contact_id: o.contact_id,
    outcome: o.outcome === "new" || o.outcome === "filled" ? o.outcome : "matched",
    existed: o.existed === true,
    matched_by: typeof o.matched_by === "string" ? (o.matched_by as ResolvedPerson["matched_by"]) : null,
    email: typeof o.email === "string" ? (o.email as ResolvedPerson["email"]) : null,
    filled: Array.isArray(o.filled) ? o.filled.filter((x): x is string => typeof x === "string") : [],
    identity: typeof o.identity === "string" ? (o.identity as ResolvedPerson["identity"]) : null,
    doubt: typeof o.doubt === "string" ? o.doubt : null,
    doubt_seen: typeof o.doubt_seen === "string" ? (o.doubt_seen as DoubtSeen) : null,
  };
}

/** A person's code at the door: this person asked to be forgotten (00263, 00331). */
export const PERSON_FORGOTTEN = "PE001";

/**
 * The open doubts naming a person (00344 person_doubts, decision 0034 step 4), oldest first, each with the other
 * record as People names a row. Read under the caller's row security. A database before the table answers none, so
 * either deploy order shows a page.
 */
export async function openDoubtsOf(db: Db, tenantId: string, contactId: string): Promise<PersonDoubtDto[]> {
  const { data, error } = await db
    .from("person_doubts")
    .select("id, contact_id, other_id, seen, created_at")
    .eq("tenant_id", tenantId)
    .is("settled_at", null)
    .or(`contact_id.eq.${contactId},other_id.eq.${contactId}`)
    .order("created_at");
  if (error && (error.code === "PGRST205" || error.code === "42P01")) return [];
  if (error) throw new Error(`person_doubts: ${error.message}`);
  const rows = data ?? [];
  if (!rows.length) return [];
  const otherIds = [...new Set(rows.map((r) => (r.contact_id === contactId ? r.other_id : r.contact_id)))];
  const others = await db
    .from("contacts")
    .select("id, display_name, wa_profile_name, phone_e164, email")
    .eq("tenant_id", tenantId)
    .in("id", otherIds.slice(0, IDS_PER_READ))
    .is("erased_at", null)
    .is("merged_into_contact_id", null);
  if (others.error) throw new Error(`person_doubts: ${others.error.message}`);
  const byId = new Map((others.data ?? []).map((c) => [c.id, c]));
  const out: PersonDoubtDto[] = [];
  for (const r of rows) {
    const other = byId.get(r.contact_id === contactId ? r.other_id : r.contact_id);
    if (!other) continue;
    out.push({ id: r.id, seen: r.seen as DoubtSeen, created_at: r.created_at, other });
  }
  return out;
}

/** A doubt by id, when it names this person on either side (read under the caller's row security); null when it does not. */
export async function doubtOn(
  db: Db,
  tenantId: string,
  contactId: string,
  doubtId: string,
): Promise<{ id: string; contact_id: string; other_id: string; settled_as: string | null } | null> {
  const { data, error } = await db
    .from("person_doubts")
    .select("id, contact_id, other_id, settled_as")
    .eq("tenant_id", tenantId)
    .eq("id", doubtId)
    .or(`contact_id.eq.${contactId},other_id.eq.${contactId}`)
    .maybeSingle();
  if (error) throw new Error(`person_doubts: ${error.message}`);
  return data;
}

/** Not the same (person_doubt_dismiss, 00344): the member settles the pair, as themselves. The door's refusals are thrown as they came. */
export async function dismissPersonDoubt(
  db: Db,
  doubtId: string,
): Promise<{ doubt_id: string; settled_as: string | null }> {
  const { data, error } = await db.rpc("person_doubt_dismiss", { p_doubt_id: doubtId });
  if (error) throw error;
  const o = (data ?? {}) as Record<string, unknown>;
  return {
    doubt_id: typeof o.doubt_id === "string" ? o.doubt_id : doubtId,
    settled_as: typeof o.settled_as === "string" ? o.settled_as : null,
  };
}

/** A stamp the door answered, or null. */
const stampOf = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * What the calling member has seen of these people (contact_seen, 00349): their floor, everything before which is
 * seen, and their own marks for the people named. One call for any number of ids: the door takes them in its body.
 * The caller's rows only, by the door's own rule. A read that fails THROWS, and the reader decides what a list says
 * of a reading it could not have (readers/seen.ts: nothing is then called new).
 */
export async function contactSeen(db: Db, tenantId: string, contactIds: readonly string[]): Promise<SeenMarksDto> {
  const { data, error } = await db.rpc("contact_seen", { p_tenant_id: tenantId, p_contact_ids: [...contactIds] });
  if (error) throw error;
  const o = (data ?? {}) as { floor_at?: unknown; marks?: unknown };
  const marks = Array.isArray(o.marks) ? (o.marks as Record<string, unknown>[]) : [];
  return {
    floor_at: stampOf(o.floor_at),
    marks: marks
      .filter((m) => typeof m.contact_id === "string")
      .map((m) => ({
        contact_id: m.contact_id as string,
        seen_at: stampOf(m.seen_at),
        unread_at: stampOf(m.unread_at),
        marked_at: stampOf(m.marked_at),
      })),
  };
}

/**
 * The calling member's own mark on a person (contact_mark, 00349): seen, as they open the person, or unread, as they
 * put it back. `heardAt` is how far they have seen: the customer's last moment as their screen held it, and where
 * there is none the door takes its own clock. `marked_at` is the database's stamp of this writing. The door's refusals
 * are thrown as they came (a person not theirs to see is P0002).
 */
export async function markContact(
  db: Db,
  contactId: string,
  mark: { seen: boolean; heardAt: string | null },
): Promise<{ contact_id: string; seen_at: string | null; unread_at: string | null; marked_at: string | null }> {
  const { data, error } = await db.rpc("contact_mark", {
    p_contact_id: contactId,
    p_seen: mark.seen,
    ...(mark.heardAt ? { p_heard_at: mark.heardAt } : {}),
  });
  if (error) throw error;
  const o = (data ?? {}) as Record<string, unknown>;
  return {
    contact_id: contactId,
    seen_at: stampOf(o.seen_at),
    unread_at: stampOf(o.unread_at),
    marked_at: stampOf(o.marked_at),
  };
}

/**
 * A member records a person's answer and its line in their history together (00356 record_consent), on the member's
 * own session: the purpose's own door (visit messages, or offers), then the consent_change decision as theirs, in one
 * transaction. The door's answer with `decision_id` beside it, or the door's refusal with its SQLSTATE, which the
 * caller words (a route's dbRefusal): nothing is thrown here, since a refusal for one person of a batch is an answer.
 */
export async function recordConsent(
  db: Db,
  p: {
    contactId: string;
    purpose: "conversational" | "marketing";
    consent: string;
    source: string;
    note: string | null;
    /** The message an answer "in their own message" names; none otherwise. */
    messageId: string | null;
    /** How many people the answer was recorded for at once; none for one person's own. */
    batch: number | null;
    via: string | null;
    undoOf: string | null;
  },
): Promise<{ data: Json | null; error: PostgrestError | null }> {
  const { data, error } = await db.rpc("record_consent", {
    p_contact_id: p.contactId,
    p_purpose: p.purpose,
    p_consent: p.consent,
    p_source: p.source,
    ...(p.note ? { p_note: p.note } : {}),
    ...(p.messageId ? { p_message_id: p.messageId } : {}),
    ...(p.batch ? { p_batch: p.batch } : {}),
    ...(p.via ? { p_via: p.via } : {}),
    ...(p.undoOf ? { p_undo_of: p.undoOf } : {}),
  });
  return { data, error };
}

/**
 * A member adds a person by hand, on the member's own session: a number, an address or both, and a name if known.
 * A number alone goes through create_person, as it always did, so a database before 00393 answers it; an address goes
 * through add_person (00393), which takes either. Both resolve through the one door (decision 0034): a number or an
 * address already here is that person, `existed` says so. The door's answer, or its refusal with its SQLSTATE, which
 * the caller words (a route's dbRefusal): nothing is thrown here.
 */
export async function addPersonByHand(
  db: Db,
  p: { tenantId: string; phone: string | null; email: string | null; name: string; source: string },
): Promise<{ data: { contact_id: string; existed: boolean } | null; error: PostgrestError | null }> {
  const { data, error } = p.email
    ? await db.rpc("add_person", {
        p_tenant_id: p.tenantId,
        p_phone_e164: p.phone ?? "",
        p_email: p.email,
        p_display_name: p.name,
        p_source: p.source,
      })
    : await db.rpc("create_person", {
        p_tenant_id: p.tenantId,
        p_phone_e164: p.phone ?? "",
        p_display_name: p.name,
        p_source: p.source,
      });
  if (error) return { data: null, error };
  const o = (data ?? {}) as { contact_id?: unknown; existed?: unknown };
  return { data: { contact_id: String(o.contact_id), existed: o.existed === true }, error: null };
}
