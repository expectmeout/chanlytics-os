/**
 * What came before Chanlytics, kept (decision 0073, 00478): a message the connected mailbox held, a chat WhatsApp synced
 * with its app kept, each through the one door (`ingest_before`), which resolves the person as a client list's would,
 * makes or finds the thread, and keeps the message once by its provider id, marked as before Chanlytics and handled.
 * Nothing it writes is a reply waiting, a yes, or today's. The service role's alone: the history jobs on the edge.
 *
 * Beside it, the three that read and write a client file's people (decision 0073, R22): a line of the file into People
 * (import_person), how many people the workspace holds, and what a file line says of a person before Chanlytics
 * (person_before_note), each on the member's session.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";
import { tenantDb } from "../../tenant-db";

type Db = SupabaseClient<Database>;

/** One message from before, as the door takes it. */
export interface BeforeMessage {
  tenantId: string;
  channel: "email" | "whatsapp";
  /** The wire's own id for the person: the address for email, the WhatsApp id for a chat. */
  external: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  /** The provider's id for the message: the replay gate. */
  messageId: string;
  direction: "inbound" | "outbound";
  type?: "text" | "media";
  body: string | null;
  at: string;
  meta?: Json;
}

/** What the door did: kept now, kept already, or a person who asked to be forgotten (left out). */
export interface BeforeKept {
  kept: boolean;
  erased: boolean;
  conversationId: string | null;
  contactId: string | null;
  /** A new person in People, made by this message. */
  newPerson: boolean;
}

export async function keepBefore(db: Db, m: BeforeMessage): Promise<BeforeKept> {
  const { data, error } = await db.rpc("ingest_before", {
    p_tenant_id: m.tenantId,
    p_channel: m.channel,
    p_external: m.external,
    p_phone: m.phone ?? "",
    p_email: m.email ?? "",
    p_name: m.name ?? "",
    p_message_external_id: m.messageId,
    p_direction: m.direction,
    p_type: m.type ?? "text",
    p_body: m.body ?? "",
    p_channel_ts: m.at,
    p_meta: m.meta ?? {},
  });
  if (error) throw Object.assign(new Error(`ingest_before: ${error.message}`), { code: error.code });
  const o = (data ?? {}) as Record<string, unknown>;
  if (o.erased === true) return { kept: false, erased: true, conversationId: null, contactId: null, newPerson: false };
  return {
    kept: o.is_new === true,
    erased: false,
    conversationId: typeof o.conversation_id === "string" ? o.conversation_id : null,
    contactId: typeof o.contact_id === "string" ? o.contact_id : null,
    newPerson: o.person === "new",
  };
}

/** What import_person made of a line: the person, whether they were on file already, and what became of the address. */
interface ImportedPerson {
  contact_id: string;
  existed: boolean;
  email: "set" | "kept" | "taken" | null;
}

/**
 * One line of a client file into People (import_person, 00263), on the member's session: the door resolves the person,
 * fills what is empty and makes the address's digest itself. What the line does not have is sent empty, which the door
 * reads as none. The door's refusal comes back with its code (22023 a line it will not take, PE001 a person forgotten).
 */
export async function importPerson(
  db: Db,
  tenantId: string,
  p: { name: string; phone: string | null; email: string | null },
): Promise<{ ok: true; made: ImportedPerson } | { ok: false; code: string | undefined; message: string }> {
  const { data, error } = await db.rpc("import_person", {
    p_tenant_id: tenantId,
    p_name: p.name,
    p_phone_e164: p.phone ?? "",
    p_email: p.email ?? "",
  });
  if (error) return { ok: false, code: error.code, message: error.message };
  return { ok: true, made: importedOf(data) };
}

/** The door's answer as its fields: the person's id, whether they were on file, and what became of the address. */
function importedOf(data: Json): ImportedPerson {
  const o = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const email = o.email === "set" || o.email === "kept" || o.email === "taken" ? o.email : null;
  return { contact_id: typeof o.contact_id === "string" ? o.contact_id : "", existed: o.existed === true, email };
}

/**
 * How many people the workspace holds (neither erased nor merged into another): the first run's "Your dashboard, filling
 * in" and Live's "0 of 604 said yes" (decision 0073). Counted by the database, never by reading every row.
 */
export async function peopleCount(db: Db, tenantId: string): Promise<number> {
  const { count, error } = await tenantDb(db, tenantId)
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .is("erased_at", null)
    .is("merged_into_contact_id", null);
  if (error) throw new Error(`cannot count the people: ${error.message}`);
  return count ?? 0;
}

/**
 * One line of a client file beyond who the person is (decision 0073, R22): their notes where none are on file, and the
 * last visit, visits, birthday and tool in contacts.before, each where not already there (person_before_note). Under the
 * member's session: the door asks that they act for the workspace.
 */
export async function personBeforeNote(
  db: Db,
  tenantId: string,
  contactId: string,
  before: { via?: string; last_visit?: string; visits?: number; birthday?: string },
  notes: string | null,
): Promise<void> {
  const { error } = await db.rpc("person_before_note", {
    p_tenant_id: tenantId,
    p_contact_id: contactId,
    p_before: before as Json,
    p_notes: notes ?? undefined,
  });
  if (error) throw new Error(error.message);
}
