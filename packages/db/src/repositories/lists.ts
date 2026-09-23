/**
 * Saved lists: a name and the people on it (00044's segments and segment_members), read and written here and
 * nowhere else.
 *
 * The routes, the send, the assistant and the verbs each read these tables themselves, and each read of the members
 * was one select, which PostgREST answers with at most 1000 rows: past a thousand memberships a list silently lost
 * people. Every member read here is paged. A write answers the database's error as it came, code and all, so the
 * route that called it can say the refusal in its own words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { readAllRows } from "../paged";

type Db = SupabaseClient<Database>;

/** A list with every id on it. */
export interface SavedListRow {
  id: string;
  name: string;
  ids: string[];
}

/** A list as a verb acts on it: the workspace it belongs to is the one its role is judged in. */
export interface ListRow {
  id: string;
  tenant_id: string;
  name: string;
}

export interface WriteError {
  code?: string;
  message: string;
}

/** Every saved list of one workspace with every id on it, by name. Scoped by tenant, not by row security alone. */
export async function savedListsFor(db: Db, tenantId: string): Promise<SavedListRow[]> {
  const [lists, members] = await Promise.all([
    readAllRows<{ id: string; name: string }>("segments", (from, to) =>
      db.from("segments").select("id, name").eq("tenant_id", tenantId).order("name").order("id").range(from, to),
    ),
    readAllRows<{ segment_id: string; contact_id: string }>("segment_members", (from, to) =>
      db
        .from("segment_members")
        .select("segment_id, contact_id")
        .eq("tenant_id", tenantId)
        .order("segment_id")
        .order("contact_id")
        .range(from, to),
    ),
  ]);
  const byList = new Map<string, string[]>();
  for (const m of members) {
    const ids = byList.get(m.segment_id) ?? [];
    ids.push(m.contact_id);
    byList.set(m.segment_id, ids);
  }
  return lists.map((l) => ({ id: l.id, name: l.name, ids: byList.get(l.id) ?? [] }));
}

/** Every id on one list. */
export async function listMemberIds(db: Db, listId: string): Promise<string[]> {
  const rows = await readAllRows<{ contact_id: string }>("segment_members", (from, to) =>
    db.from("segment_members").select("contact_id").eq("segment_id", listId).order("contact_id").range(from, to),
  );
  return rows.map((m) => m.contact_id);
}

/** One saved list of this workspace with every id on it, or null when it has no such list: what a send to it enrols. */
export async function savedListFor(db: Db, tenantId: string, id: string): Promise<SavedListRow | null> {
  const { data, error } = await db
    .from("segments")
    .select("id, name")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`segments: ${error.message}`);
  if (!data) return null;
  return { id: data.id, name: data.name, ids: await listMemberIds(db, data.id) };
}

/** The list a verb acts on, read under row security alone: one the caller cannot see is no list. */
export async function listRow(db: Db, id: string): Promise<ListRow | null> {
  const { data, error } = await db.from("segments").select("id, tenant_id, name").eq("id", id).maybeSingle();
  if (error) throw new Error(`segments: ${error.message}`);
  return data ? { id: data.id, tenant_id: data.tenant_id, name: data.name } : null;
}

/** A new, empty list in the maker's name. A name the workspace already has is the database's 23505. */
export async function createList(
  db: Db,
  tenantId: string,
  name: string,
  userId: string,
): Promise<{ list: { id: string; name: string } | null; error: WriteError | null }> {
  const { data, error } = await db
    .from("segments")
    .insert({ tenant_id: tenantId, name, created_by: userId })
    .select("id, name")
    .single();
  return error ? { list: null, error } : { list: { id: data.id, name: data.name }, error: null };
}

/** A list's new name: the one column a member may change (00044's column grant). */
export async function renameList(db: Db, id: string, name: string): Promise<{ error: WriteError | null }> {
  const { error } = await db.from("segments").update({ name }).eq("id", id);
  return { error };
}

/**
 * People onto a list, in the adder's name. Someone already on it is not an error; a person of another workspace or
 * one who was erased is row security's with-check refusal (42501).
 */
export async function addToList(
  db: Db,
  list: Pick<ListRow, "id" | "tenant_id">,
  contactIds: readonly string[],
  userId: string,
): Promise<{ error: WriteError | null }> {
  const rows = contactIds.map((contact_id) => ({
    segment_id: list.id,
    contact_id,
    tenant_id: list.tenant_id,
    added_by: userId,
  }));
  const { error } = await db
    .from("segment_members")
    .upsert(rows, { onConflict: "segment_id,contact_id", ignoreDuplicates: true });
  return { error };
}

/** People off a list. The people stay; only the membership goes. */
export async function dropFromList(
  db: Db,
  listId: string,
  contactIds: readonly string[],
): Promise<{ error: WriteError | null }> {
  const { error } = await db
    .from("segment_members")
    .delete()
    .eq("segment_id", listId)
    .in("contact_id", [...contactIds]);
  return { error };
}

/** A list and its member rows. `count` says whether anything was removed: a delete that removed nothing is no delete. */
export async function deleteList(db: Db, id: string): Promise<{ error: WriteError | null; count: number | null }> {
  const { error, count } = await db.from("segments").delete({ count: "exact" }).eq("id", id);
  return { error, count };
}
