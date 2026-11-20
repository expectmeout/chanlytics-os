/**
 * What a watched folder holds (00639, 00641): one row per provider item seen under it, folders included, since they
 * are the tree's index. The one place `source_items` is typed. Only the service role writes, through these.
 *
 * Every write is safe to make twice, and none takes a row from another writer: an item is inserted once (a second
 * insert of the same provider id writes nothing), its facts are written over, and its state moves only from the
 * states named. So a read or a walk whose job died part way is simply run again, and a state the taking of a file set
 * (the next phase's) is never written over by a listing.
 *
 * A provider's id is 33 to 44 characters, and a request's line holds eight thousand: an `.in()` of ids goes a
 * hundred at a time. A read answers a thousand rows at most, so a folder's children are read a page at a time.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";

import { DbFailure, type SchemaSet, type TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;
export type SourceItemRow = Database["public"]["Tables"]["source_items"]["Row"];
type ItemInsert = Database["public"]["Tables"]["source_items"]["Insert"];
type ItemPatch = Database["public"]["Tables"]["source_items"]["Update"];
type ItemState = SchemaSet<"source_items.state">;

/** How many ids one statement names: inside the gateway's request line with room to spare. */
const IDS_A_STATEMENT = 100;

/** How many rows one read answers: PostgREST's own most. */
const ROWS_A_READ = 1000;

/** The states of an item that is not where it was: gone, moved out, or no longer readable. */
export const SOURCE_ITEM_AWAY = ["gone", "outside", "no_access"] as const satisfies readonly ItemState[];

/** One folder's source, named with its workspace: what every statement here is scoped by. */
export interface SourceRef {
  tenantId: TenantId;
  sourceId: string;
}

const chunksOf = <T>(list: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, index) => list.slice(index * size, (index + 1) * size));

/** The items a source holds under these provider ids: the tree's index for a page of changes or of a listing. */
export async function listSourceItemsByIds(
  db: Db,
  ref: SourceRef,
  providerIds: readonly string[],
): Promise<SourceItemRow[]> {
  const out: SourceItemRow[] = [];
  for (const ids of chunksOf([...new Set(providerIds)], IDS_A_STATEMENT)) {
    const { data, error } = await db
      .from("source_items")
      .select("*")
      .eq("tenant_id", ref.tenantId)
      .eq("source_id", ref.sourceId)
      .in("provider_id", ids);
    if (error) throw new DbFailure(error, "cannot read the watched folder's items");
    out.push(...data);
  }
  return out;
}

/** Items seen for the first time, written once each: one already there is left as it is. Answers how many were new. */
export async function insertSourceItems(db: Db, rows: readonly ItemInsert[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { data, error } = await db
    .from("source_items")
    .upsert([...rows], { onConflict: "source_id,provider_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new DbFailure(error, "cannot keep the watched folder's new items");
  return data.length;
}

/** What a provider records of an item it still holds: written over what was kept, its state left alone. */
export interface SourceItemFacts {
  tenant_id: TenantId;
  source_id: string;
  provider_id: string;
  kind: SchemaSet<"source_items.kind">;
  parent_id: string | null;
  name: string;
  modified_at: string | null;
  checksum: string | null;
  bytes: number | null;
  seconds: number | null;
  added_by: string | null;
  /** A video listed without its length: until when its record is asked again. Null once it is known. */
  length_until: string | null;
}

/** Where a known item sits and what it is called: all a listing writes of an item whose taking holds its state. */
export type SourceItemPlace = Pick<
  SourceItemFacts,
  "tenant_id" | "source_id" | "provider_id" | "kind" | "parent_id" | "name"
>;

/**
 * Known items' facts written over (their name, where they sit, what their provider says of their bytes), or only where
 * they sit and their name. Every row of one call carries the same columns, and none names a state: a state moves
 * through moveSourceItems alone.
 */
export async function keepSourceItemFacts(
  db: Db,
  rows: readonly SourceItemFacts[] | readonly SourceItemPlace[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db.from("source_items").upsert([...rows], { onConflict: "source_id,provider_id" });
  if (error) throw new DbFailure(error, "cannot keep the watched folder's items");
}

/**
 * Items moved to a state, only from the states named: a row another writer has since moved on is left alone. Answers
 * how many moved.
 */
export async function moveSourceItems(
  db: Db,
  ref: SourceRef,
  params: { providerIds: readonly string[]; from: readonly ItemState[]; patch: ItemPatch },
): Promise<number> {
  let moved = 0;
  for (const ids of chunksOf([...new Set(params.providerIds)], IDS_A_STATEMENT)) {
    const { data, error } = await db
      .from("source_items")
      .update(params.patch)
      .eq("tenant_id", ref.tenantId)
      .eq("source_id", ref.sourceId)
      .in("provider_id", ids)
      .in("state", [...params.from])
      .select("id");
    if (error) throw new DbFailure(error, "cannot move the watched folder's items");
    moved += data.length;
  }
  return moved;
}

/** A change to rows by their provider ids, whatever their state: a walk's own marks (seen, missed). */
export async function markSourceItems(
  db: Db,
  ref: SourceRef,
  params: { providerIds: readonly string[]; patch: Pick<ItemPatch, "seen_run" | "missed_run"> },
): Promise<void> {
  for (const ids of chunksOf([...new Set(params.providerIds)], IDS_A_STATEMENT)) {
    const { error } = await db
      .from("source_items")
      .update(params.patch)
      .eq("tenant_id", ref.tenantId)
      .eq("source_id", ref.sourceId)
      .in("provider_id", ids);
    if (error) throw new DbFailure(error, "cannot mark the watched folder's items");
  }
}

/** A change to folders' own rows: the page their listing stands at, the run that listed them whole. */
export async function patchSourceFolders(
  db: Db,
  ref: SourceRef,
  params: { providerIds: readonly string[]; patch: Pick<ItemPatch, "walk_page" | "walked_run"> },
): Promise<void> {
  for (const ids of chunksOf([...new Set(params.providerIds)], IDS_A_STATEMENT)) {
    const { error } = await db
      .from("source_items")
      .update(params.patch)
      .eq("tenant_id", ref.tenantId)
      .eq("source_id", ref.sourceId)
      .in("provider_id", ids)
      .eq("kind", "folder");
    if (error) throw new DbFailure(error, "cannot keep the folders' place");
  }
}

/**
 * The folders a walk lists next, `limit` at most: those of the tree that this run has not listed whole. A walk of the
 * whole tree (`whole`) takes every folder the run has not listed; a walk of what appeared takes only folders never
 * listed; a source that takes no subfolders (`only`) walks its own folder alone. Those part way through their pages
 * come first, then the oldest seen. None when the run has listed them all.
 */
export async function listFoldersToWalk(
  db: Db,
  ref: SourceRef,
  params: { run: number; whole: boolean; only: string | null; limit: number },
): Promise<SourceItemRow[]> {
  const tree = db
    .from("source_items")
    .select("*")
    .eq("tenant_id", ref.tenantId)
    .eq("source_id", ref.sourceId)
    .eq("kind", "folder")
    .eq("state", "listed");
  // A source that takes no subfolders walks its own folder alone (`only`).
  const folders = params.only === null ? tree : tree.eq("provider_id", params.only);
  const pending = params.whole
    ? folders.or(`walked_run.is.null,walked_run.lt.${params.run}`)
    : folders.is("walked_run", null);
  const { data, error } = await pending
    .order("walk_page", { ascending: true, nullsFirst: false })
    .order("first_seen_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(params.limit);
  if (error) throw new DbFailure(error, "cannot read the watched folder's tree");
  return data;
}

/** What sits directly in these folders and is still where it was: each child's provider id, kind and state. */
export async function listSourceChildren(
  db: Db,
  ref: SourceRef,
  parentIds: readonly string[],
): Promise<Pick<SourceItemRow, "provider_id" | "kind" | "state">[]> {
  const out: Pick<SourceItemRow, "provider_id" | "kind" | "state">[] = [];
  for (const parents of chunksOf([...new Set(parentIds)], IDS_A_STATEMENT)) {
    for (let from = 0; ; from += ROWS_A_READ) {
      const { data, error } = await db
        .from("source_items")
        .select("provider_id, kind, state")
        .eq("tenant_id", ref.tenantId)
        .eq("source_id", ref.sourceId)
        .in("parent_id", parents)
        .not("state", "in", `(${SOURCE_ITEM_AWAY.join(",")})`)
        .order("id", { ascending: true })
        .range(from, from + ROWS_A_READ - 1);
      if (error) throw new DbFailure(error, "cannot read the folder's items");
      out.push(...data);
      if (data.length < ROWS_A_READ) break;
    }
  }
  return out;
}

/**
 * Folders listed over several steps, closed: each of their items this run did not see is marked as missed. One
 * statement a hundred folders, since the run stamped what it saw (seen_run) page by page.
 */
export async function markFoldersUnseen(
  db: Db,
  ref: SourceRef,
  params: { parentIds: readonly string[]; run: number },
): Promise<void> {
  for (const parents of chunksOf([...new Set(params.parentIds)], IDS_A_STATEMENT)) {
    const { error } = await db
      .from("source_items")
      .update({ missed_run: params.run })
      .eq("tenant_id", ref.tenantId)
      .eq("source_id", ref.sourceId)
      .in("parent_id", parents)
      .not("state", "in", `(${SOURCE_ITEM_AWAY.join(",")})`)
      .or(`seen_run.is.null,seen_run.lt.${params.run}`);
    if (error) throw new DbFailure(error, "cannot mark what the folders no longer show");
  }
}

/** The items a run did not find where they were, a page of them: what its end asks their provider about. */
export async function listSourceItemsMissed(
  db: Db,
  ref: SourceRef,
  params: { run: number; limit: number },
): Promise<SourceItemRow[]> {
  const { data, error } = await db
    .from("source_items")
    .select("*")
    .eq("tenant_id", ref.tenantId)
    .eq("source_id", ref.sourceId)
    .eq("missed_run", params.run)
    .not("state", "in", `(${SOURCE_ITEM_AWAY.join(",")})`)
    .order("id", { ascending: true })
    .limit(params.limit);
  if (error) throw new DbFailure(error, "cannot read what the walk did not find");
  return data;
}

/** How many items a source holds: every one, those a run missed, or those still where they were. */
export async function countSourceItems(
  db: Db,
  ref: SourceRef,
  which: { missedRun: number } | { here: true } | null,
): Promise<number> {
  let query = db
    .from("source_items")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ref.tenantId)
    .eq("source_id", ref.sourceId);
  if (which) query = query.not("state", "in", `(${SOURCE_ITEM_AWAY.join(",")})`);
  if (which && "missedRun" in which) query = query.eq("missed_run", which.missedRun);
  const { count, error } = await query;
  if (error) throw new DbFailure(error, "cannot count the watched folder's items");
  return count ?? 0;
}

/**
 * The videos of a source listed without their length that are still waited for (`length_until` after `after`),
 * the longest waited first, `limit` at most: what a read asks its provider about again.
 */
export async function listSourceItemsAwaitingLength(
  db: Db,
  ref: SourceRef,
  params: { after: string; limit: number },
): Promise<SourceItemRow[]> {
  const { data, error } = await db
    .from("source_items")
    .select("*")
    .eq("tenant_id", ref.tenantId)
    .eq("source_id", ref.sourceId)
    .gt("length_until", params.after)
    .in("state", ["listed", "waiting"])
    .order("length_until", { ascending: true })
    .limit(params.limit);
  if (error) throw new DbFailure(error, "cannot read the videos whose length is awaited");
  return data;
}

/**
 * The newest photos and videos a walk listed that nothing has asked for yet: those first seen since the walk began and
 * modified since `modifiedFrom`, newest first, `limit` at most. What a first watch takes in first.
 */
export async function listNewestListed(
  db: Db,
  ref: SourceRef,
  params: { seenFrom: string; modifiedFrom: string; limit: number },
): Promise<string[]> {
  const { data, error } = await db
    .from("source_items")
    .select("provider_id")
    .eq("tenant_id", ref.tenantId)
    .eq("source_id", ref.sourceId)
    .eq("state", "listed")
    .in("kind", ["image", "video"])
    .gte("first_seen_at", params.seenFrom)
    .gte("modified_at", params.modifiedFrom)
    .order("modified_at", { ascending: false })
    .limit(params.limit);
  if (error) throw new DbFailure(error, "cannot read the folder's newest items");
  return data.map((row) => row.provider_id);
}

/**
 * The folder's older files asked for (the footage screens' call 7: "They stay in Drive until you ask AI for them"):
 * every photo and video its listing found and nothing asked for yet waits to be taken, at the day's pace like any other.
 * Answers how many were asked for.
 */
export async function askForListedItems(db: Db, ref: SourceRef): Promise<number> {
  const { count, error } = await db
    .from("source_items")
    .update({ state: "waiting" }, { count: "exact" })
    .eq("tenant_id", ref.tenantId)
    .eq("source_id", ref.sourceId)
    .eq("state", "listed")
    .in("kind", ["image", "video"]);
  if (error) throw new DbFailure(error, "cannot ask for the watched folder's older files");
  return count ?? 0;
}
