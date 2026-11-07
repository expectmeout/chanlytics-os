/** People: people. */

import type { PostgrestError } from "@supabase/supabase-js";
import type { DoubtSeen, PersonAtLeadDto, PersonDoubtDto, PersonSignerDto, SeenMarksDto } from "@chanlytics/contracts";
import type { Json } from "../../database.types";
import { getPersonIdsWaitingOnYou } from "./waiting-on-you";
import { IDS_PER_READ, type Db } from "./pages";
import { PERSON_FACE_COLUMNS } from "../../shared/person-columns";

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
export async function listPeopleAtLead(db: Db, tenantId: string, leadId: string): Promise<PersonAtLeadDto[]> {
  const { data, error } = await db
    .from("contacts")
    .select("id, display_name, wa_profile_name, phone_e164, email, name_source")
    .eq("tenant_id", tenantId)
    .eq("lead_id", leadId)
    .is("erased_at", null)
    .is("merged_into_contact_id", null)
    .limit(PEOPLE_AT_A_LEAD);
  if (error) throw new Error(`listPeopleAtLead: ${error.message}`);
  const people = data ?? [];
  if (!people.length) return [];
  const ids = people.map((p) => p.id);
  // Who waits on a person by the one standing rule, on their latest thread: a colleague whose thread the reader holds
  // wore a Needs you dot from the raw needs_human column (the wiring's second audit, R11 S9-1).
  const [moments, needs] = await Promise.all([
    db.from("person_moments").select("contact_id, in_touch_at").eq("tenant_id", tenantId).in("contact_id", ids),
    getPersonIdsWaitingOnYou(db, tenantId, ids, Date.now()),
  ]);
  if (moments.error) throw new Error(`listPeopleAtLead: ${moments.error.message}`);
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
export async function listSigners(db: Db, tenantId: string, personId: string): Promise<PersonSignerDto[]> {
  const { data, error } = await db
    .from("sequence_replies")
    .select("message_id, signer_name, signer_title, signer_state, read_at, intent, claim")
    .eq("tenant_id", tenantId)
    .eq("contact_id", personId)
    .in("signer_state", ["offered", "adopted"])
    .is("undone_at", null)
    .order("read_at", { ascending: false })
    .limit(5);
  if (error) throw new Error(`listSigners: ${error.message}`);
  return (data ?? []).flatMap((item) =>
    item.signer_name && (item.signer_state === "offered" || item.signer_state === "adopted")
      ? [
          {
            message_id: item.message_id,
            name: item.signer_name,
            title: item.signer_title,
            state: item.signer_state,
            read_at: item.read_at,
            intent: item.intent,
            claim: item.claim,
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
export async function resolvePerson(db: Db, resolvePersonInput: ResolvePersonInput): Promise<ResolvedPerson> {
  // Every argument of 00342's signature is named, an empty word for what the caller did not see (the door reads it as
  // none), so a database still on 00342 answers the call as one on 00344 does: either deploy order. p_seen_at, which
  // 00344 added with a default, is never named.
  const { data, error } = await db.rpc("resolve_person", {
    p_tenant_id: resolvePersonInput.tenantId,
    p_channel: resolvePersonInput.channel ?? "",
    p_external: resolvePersonInput.external ?? "",
    p_phone: resolvePersonInput.phone ?? "",
    p_email: resolvePersonInput.email ?? "",
    p_name: resolvePersonInput.name ?? "",
    p_assurance: resolvePersonInput.assurance,
    p_source: resolvePersonInput.source,
    p_detail: resolvePersonInput.detail ?? {},
  });
  if (error) throw Object.assign(new Error(`resolve_person: ${error.message}`), { code: error.code });
  const row = (data ?? {}) as Record<string, unknown>;
  if (typeof row.contact_id !== "string") throw new Error("resolve_person answered without a person");
  return {
    contact_id: row.contact_id,
    outcome: row.outcome === "new" || row.outcome === "filled" ? row.outcome : "matched",
    existed: row.existed === true,
    matched_by: typeof row.matched_by === "string" ? (row.matched_by as ResolvedPerson["matched_by"]) : null,
    email: typeof row.email === "string" ? (row.email as ResolvedPerson["email"]) : null,
    filled: Array.isArray(row.filled) ? row.filled.filter((x): x is string => typeof x === "string") : [],
    identity: typeof row.identity === "string" ? (row.identity as ResolvedPerson["identity"]) : null,
    doubt: typeof row.doubt === "string" ? row.doubt : null,
    doubt_seen: typeof row.doubt_seen === "string" ? (row.doubt_seen as DoubtSeen) : null,
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
    .select(PERSON_FACE_COLUMNS)
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
export async function findDoubtOn(
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
export async function markContactSeen(db: Db, tenantId: string, contactIds: readonly string[]): Promise<SeenMarksDto> {
  const { data, error } = await db.rpc("contact_seen", { p_tenant_id: tenantId, p_contact_ids: [...contactIds] });
  if (error) throw error;
  const value = (data ?? {}) as { floor_at?: unknown; marks?: unknown };
  const marks = Array.isArray(value.marks) ? (value.marks as Record<string, unknown>[]) : [];
  return {
    floor_at: stampOf(value.floor_at),
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
  const value = (data ?? {}) as Record<string, unknown>;
  return {
    contact_id: contactId,
    seen_at: stampOf(value.seen_at),
    unread_at: stampOf(value.unread_at),
    marked_at: stampOf(value.marked_at),
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
  params: {
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
    p_contact_id: params.contactId,
    p_purpose: params.purpose,
    p_consent: params.consent,
    p_source: params.source,
    ...(params.note ? { p_note: params.note } : {}),
    ...(params.messageId ? { p_message_id: params.messageId } : {}),
    ...(params.batch ? { p_batch: params.batch } : {}),
    ...(params.via ? { p_via: params.via } : {}),
    ...(params.undoOf ? { p_undo_of: params.undoOf } : {}),
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
  params: { tenantId: string; phone: string | null; email: string | null; name: string; source: string },
): Promise<{ data: { contact_id: string; existed: boolean } | null; error: PostgrestError | null }> {
  const { data, error } = params.email
    ? await db.rpc("add_person", {
        p_tenant_id: params.tenantId,
        p_phone_e164: params.phone ?? "",
        p_email: params.email,
        p_display_name: params.name,
        p_source: params.source,
      })
    : await db.rpc("create_person", {
        p_tenant_id: params.tenantId,
        p_phone_e164: params.phone ?? "",
        p_display_name: params.name,
        p_source: params.source,
      });
  if (error) return { data: null, error };
  const row = (data ?? {}) as { contact_id?: unknown; existed?: unknown };
  return { data: { contact_id: String(row.contact_id), existed: row.existed === true }, error: null };
}
