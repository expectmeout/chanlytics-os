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
import type { Database, Json } from "../database.types";
import { readAllRows, type Page } from "../paged";

type Db = SupabaseClient<Database>;

/**
 * A list with every id on it, and its rule when it is a smart list (00155): who is on a smart list is judged on every
 * read (contracts savedListIds), and `ids` is empty for one.
 */
export interface SavedListRow {
  id: string;
  name: string;
  ids: string[];
  rule: unknown;
  /** When it was archived (00169): it leaves People's rail and still resolves for the playbooks that name it. */
  archived_at: string | null;
}

/** A list as a verb acts on it: the workspace it belongs to is the one its role is judged in. */
export interface ListRow {
  id: string;
  tenant_id: string;
  name: string;
  /** A smart list's rule, or null for a list kept by hand: nobody is put on or taken off a rule by hand. */
  rule: unknown;
  /** When it was archived (00169); null for a live list. */
  archived_at: string | null;
}

export interface WriteError {
  code?: string;
  message: string;
}

/**
 * A read that names a column a database has not reached yet -- `rule` (00155), `archived_at` (00169) -- answers
 * "column does not exist": read again without it, and every list is one kept by hand, or live, as it was. Either deploy
 * order works.
 */
const missingColumn = (message: string, column: string): boolean =>
  new RegExp(`\\b${column}\\b`).test(message) && /does not exist|could not find/i.test(message);

/** The columns a list is read with, the newest first; each read that misses one tries the next. */
const LIST_COLUMNS = ["rule, archived_at", "rule", ""] as const;

async function readWithFallback<T>(read: (columns: string) => Promise<T>, base: string): Promise<T> {
  let last: unknown = null;
  for (const extra of LIST_COLUMNS) {
    try {
      return await read(extra ? `${base}, ${extra}` : base);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!missingColumn(message, "archived_at") && !missingColumn(message, "rule")) throw e;
      last = e;
    }
  }
  throw last;
}

type ListCols = { id: string; name: string; rule?: unknown; archived_at?: string | null };

async function listRows(
  db: Db,
  tenantId: string,
): Promise<{ id: string; name: string; rule: unknown; archived_at: string | null }[]> {
  const rows = await readWithFallback(
    (columns) =>
      readAllRows<ListCols>(
        "segments",
        (from, to) =>
          // The columns are chosen at run time, past the client's typed parser: the rows are the columns named.
          db
            .from("segments")
            .select(columns)
            .eq("tenant_id", tenantId)
            .order("name")
            .order("id")
            .range(from, to) as unknown as PromiseLike<Page<ListCols>>,
      ),
    "id, name",
  );
  return rows.map((l) => ({ id: l.id, name: l.name, rule: l.rule ?? null, archived_at: l.archived_at ?? null }));
}

/** Every saved list of one workspace with every id on it, by name. Scoped by tenant, not by row security alone. */
export async function savedListsFor(db: Db, tenantId: string): Promise<SavedListRow[]> {
  const [lists, members] = await Promise.all([
    listRows(db, tenantId),
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
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    ids: byList.get(l.id) ?? [],
    rule: l.rule ?? null,
    archived_at: l.archived_at,
  }));
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
  const data = await readWithFallback(async (columns) => {
    const { data, error } = (await db
      .from("segments")
      .select(columns)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle()) as unknown as { data: ListCols | null; error: { message: string } | null };
    if (error) throw new Error(`segments: ${error.message}`);
    return data;
  }, "id, name");
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    ids: data.rule == null ? await listMemberIds(db, data.id) : [],
    rule: data.rule ?? null,
    archived_at: data.archived_at ?? null,
  };
}

/** The list a verb acts on, read under row security alone: one the caller cannot see is no list. */
export async function listRow(db: Db, id: string): Promise<ListRow | null> {
  const data = await readWithFallback(async (columns) => {
    const { data, error } = (await db.from("segments").select(columns).eq("id", id).maybeSingle()) as unknown as {
      data: (ListCols & { tenant_id: string }) | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(`segments: ${error.message}`);
    return data;
  }, "id, tenant_id, name");
  return data
    ? {
        id: data.id,
        tenant_id: data.tenant_id,
        name: data.name,
        rule: data.rule ?? null,
        archived_at: data.archived_at ?? null,
      }
    : null;
}

/**
 * A new list in the maker's name: empty and kept by hand, or smart with its rule. A name the workspace already has is
 * the database's 23505.
 */
export async function createList(
  db: Db,
  tenantId: string,
  name: string,
  userId: string,
  rule: Json | null = null,
): Promise<{ list: { id: string; name: string } | null; error: WriteError | null }> {
  const { data, error } = await db
    .from("segments")
    .insert({ tenant_id: tenantId, name, created_by: userId, ...(rule ? { rule } : {}) })
    .select("id, name")
    .single();
  return error ? { list: null, error } : { list: { id: data.id, name: data.name }, error: null };
}

/** A list's new name: one of the two columns a member may change (00155's column grant). */
export async function renameList(db: Db, id: string, name: string): Promise<{ error: WriteError | null }> {
  const { error } = await db.from("segments").update({ name }).eq("id", id);
  return { error };
}

/** A smart list's new rule: the other column a member may change. */
export async function setListRule(db: Db, id: string, rule: Json): Promise<{ error: WriteError | null }> {
  const { error } = await db.from("segments").update({ rule }).eq("id", id);
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

/**
 * A list archived (a moment) or restored (null): the column a member may change (00169's grant). A restore under a name
 * a live list now has is the database's 23505.
 */
export async function archiveList(
  db: Db,
  id: string,
  at: Date | null,
  /** A new name to come back under, in the same write: a restore and its rename land together or not at all. */
  name?: string,
): Promise<{ error: WriteError | null; count: number }> {
  // RLS hides a row it will not let change, without an error: the row is read back and counted.
  const { data, error } = await db
    .from("segments")
    .update({ archived_at: at ? at.toISOString() : null, ...(name ? { name } : {}) })
    .eq("id", id)
    .select("id");
  return { error, count: data?.length ?? 0 };
}

/** The playbooks that name a list: what archiving it pauses. */
export async function playbooksOnList(
  db: Db,
  tenantId: string,
  listId: string,
): Promise<{ id: string; name: string; state: string }[]> {
  const { data, error } = await db
    .from("playbooks")
    .select("id, name, state")
    .eq("tenant_id", tenantId)
    .eq("list_id", listId)
    .order("name");
  if (error) {
    // A database 00155 has not reached has no list_id: no playbook names a list there.
    if (missingColumn(error.message, "list_id")) return [];
    throw new Error(`playbooks: ${error.message}`);
  }
  return (data ?? []) as { id: string; name: string; state: string }[];
}

/** A list and its member rows. `count` says whether anything was removed: a delete that removed nothing is no delete. */
export async function deleteList(db: Db, id: string): Promise<{ error: WriteError | null; count: number | null }> {
  const { error, count } = await db.from("segments").delete({ count: "exact" }).eq("id", id);
  return { error, count };
}
