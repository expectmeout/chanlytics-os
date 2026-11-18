/**
 * Taking a watched folder's file in (00642, the footage sources plan's P3): what a take reads and writes of
 * `source_items`, the doors it knocks on, and the day's budgets. Only the service role writes, through these.
 *
 * An item's state moves only from the states its writer names, so a take whose job runs twice, the video platform's
 * word heard twice, and the sync's own listing never write over one another. A take that must wait puts its item back
 * to `waiting` with why and until when; the clock's hand-out (source_takes_hand_out) gives it its next job.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DbFailure,
  MIN_MS,
  recordOrEmpty,
  type SchemaSet,
  type SourceItemWhy,
  type TenantId,
} from "@chanlytics/contracts";
import { z } from "zod";
import type { Database } from "../../types";
import { readAnswer } from "../../shared/read-json";
import { platformWide } from "../../shared/tenant-db";
import type { SourceItemFacts } from "./source-items";

type Db = SupabaseClient<Database>;
export type SourceTakeItem = Database["public"]["Tables"]["source_items"]["Row"];
type ItemPatch = Database["public"]["Tables"]["source_items"]["Update"];
type ItemState = SchemaSet<"source_items.state">;

/** How many times a fetch that failed is tried again before its item says it failed. */
const SOURCE_TAKE_RETRIES = 2;

/** How long a failed fetch rests before its first try again, and before its second. */
const RETRY_RESTS_MS = [2 * MIN_MS, 10 * MIN_MS] as const;

/** One of a workspace's items; null when it is not this workspace's. */
export async function findSourceItem(db: Db, tenantId: TenantId, id: string): Promise<SourceTakeItem | null> {
  const { data, error } = await db
    .from("source_items")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new DbFailure(error, "cannot read the watched folder's item");
  return data;
}

/**
 * An item by its id alone, whichever workspace's: the relay's ticket names an item, never a workspace. Null when
 * there is none.
 */
export async function findSourceItemAnywhere(db: Db, id: string): Promise<SourceTakeItem | null> {
  const { data, error } = await platformWide(db).from("source_items").select("*").eq("id", id).maybeSingle();
  if (error) throw new DbFailure(error, "cannot read the watched folder's item");
  return data;
}

/**
 * One item moved, only from the states named: a row another writer has since moved on is left alone. Answers whether
 * it moved.
 */
export async function moveSourceTake(
  db: Db,
  params: { tenantId: TenantId; id: string; from: readonly ItemState[]; patch: ItemPatch },
): Promise<boolean> {
  const { data, error } = await db
    .from("source_items")
    .update(params.patch)
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id)
    .in("state", [...params.from])
    .select("id");
  if (error) throw new DbFailure(error, "cannot move the watched folder's item");
  return data.length > 0;
}

/**
 * Every waiting item of a workspace set to wait for the same thing until the same time (a day's budget, room for
 * videos, room in the Library), so one refusal parks the rest and the clock does not hand each its own job to learn
 * the same. `kind` names videos alone where only they wait. Answers how many now wait for it.
 */
export async function holdSourceTakes(
  db: Db,
  params: { tenantId: TenantId; kind: "video" | null; why: SourceItemWhy; until: Date },
): Promise<number> {
  let waiting = db
    .from("source_items")
    .update({ why: params.why, take_after: params.until.toISOString() })
    .eq("tenant_id", params.tenantId)
    .eq("state", "waiting");
  if (params.kind) waiting = waiting.eq("kind", params.kind);
  const { data, error } = await waiting.select("id");
  if (error) throw new DbFailure(error, "cannot park the workspace's waiting items");
  return data.length;
}

/** A fetch that failed: the item waits to be tried again, or says it failed once its tries are spent. */
function retryPatchOf(item: Pick<SourceTakeItem, "take_tries">, reason: SourceItemWhy, now: Date): ItemPatch {
  if (item.take_tries >= SOURCE_TAKE_RETRIES) return { state: "failed", why: reason, file_id: null, take_after: null };
  const rest = RETRY_RESTS_MS[item.take_tries] ?? RETRY_RESTS_MS[RETRY_RESTS_MS.length - 1] ?? MIN_MS;
  return {
    state: "waiting",
    why: "retry",
    file_id: null,
    take_tries: item.take_tries + 1,
    take_after: new Date(now.getTime() + rest).toISOString(),
  };
}

/**
 * A take that ended before it began a file, counted as a failed try: its job ended for good (settle.ts, `stopped`),
 * or its provider would not give the item (`unreadable`). The item waits to be tried again, or says it failed, with
 * why, once its tries are spent. One whose file exists is the video platform's to finish, and is left. Answers whether
 * the item changed.
 */
export async function endSourceTake(
  db: Db,
  tenantId: TenantId,
  id: string,
  reason: "stopped" | "unreadable" = "stopped",
  now = new Date(),
): Promise<boolean> {
  const item = await findSourceItem(db, tenantId, id);
  if (!item || item.state !== "taking" || item.file_id) return false;
  const { data, error } = await db
    .from("source_items")
    .update(retryPatchOf(item, reason, now))
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("state", "taking")
    .is("file_id", null)
    .select("id");
  if (error) throw new DbFailure(error, "cannot end the watched folder's take");
  return data.length > 0;
}

/** The items a Library file came from that are still being taken or are in: what the video platform's word settles. */
async function listTakesOfFile(db: Db, tenantId: TenantId, fileId: string): Promise<SourceTakeItem[]> {
  const { data, error } = await db
    .from("source_items")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("file_id", fileId)
    .in("state", ["taking", "in"]);
  if (error) throw new DbFailure(error, "cannot read the file's origins");
  return data;
}

/** The video platform says a taken clip is playable: every item still taking it is in. Answers how many. */
export async function settleTakesReady(db: Db, tenantId: TenantId, fileId: string): Promise<number> {
  const { data, error } = await db
    .from("source_items")
    .update({ state: "in", why: null, take_after: null })
    .eq("tenant_id", tenantId)
    .eq("file_id", fileId)
    .eq("state", "taking")
    .select("id");
  if (error) throw new DbFailure(error, "cannot settle the watched folder's take");
  return data.length;
}

/**
 * The video platform could not prepare a taken clip: each item that came to it waits to be fetched again, or says it
 * failed once its tries are spent, and none points at the failed file any more. Answers how many will be tried again
 * and how many failed for good.
 */
export async function settleTakesFailed(
  db: Db,
  params: { tenantId: TenantId; fileId: string; why: SourceItemWhy; now?: Date },
): Promise<{ again: number; failed: number }> {
  const now = params.now ?? new Date();
  let again = 0;
  let failed = 0;
  for (const item of await listTakesOfFile(db, params.tenantId, params.fileId)) {
    const patch = retryPatchOf(item, params.why, now);
    const { data, error } = await db
      .from("source_items")
      .update(patch)
      .eq("tenant_id", params.tenantId)
      .eq("id", item.id)
      .eq("file_id", params.fileId)
      .in("state", ["taking", "in"])
      .select("id");
    if (error) throw new DbFailure(error, "cannot settle the watched folder's take");
    if (data.length === 0) continue;
    if (patch.state === "failed") failed += 1;
    else again += 1;
  }
  return { again, failed };
}

/**
 * The video platform said a taken clip's length, which its provider never had, and the clip was passed over for it
 * (00642 file_media_ready, fate `passed`): each item that came to it ends as too long, or waits for room until
 * `roomAfter`, with the length it turned out to have, and none points at the removed file any more. Answers how many.
 */
export async function settleTakesPassed(
  db: Db,
  params: { tenantId: TenantId; fileId: string; why: "long" | "minutes"; seconds: number | null; roomAfter: Date },
): Promise<number> {
  const patch: ItemPatch =
    params.why === "long"
      ? { state: "too_big", why: "seconds", file_id: null, take_after: null }
      : { state: "waiting", why: "room", file_id: null, take_after: params.roomAfter.toISOString() };
  const { data, error } = await db
    .from("source_items")
    .update({ ...patch, ...(params.seconds === null ? {} : { seconds: params.seconds }) })
    .eq("tenant_id", params.tenantId)
    .eq("file_id", params.fileId)
    .in("state", ["taking", "in"])
    .select("id");
  if (error) throw new DbFailure(error, "cannot settle the watched folder's take");
  return data.length;
}

/**
 * A watched folder's clip the video platform could not prepare, removed: only a file a watched folder brought, a
 * video, failed and not yet removed. Its owner never chose it and never removed it, so nothing is written to
 * files_let_go, and the same clip may be fetched again. Answers whether it was one; its purge lets the copy go.
 */
export async function removeFailedTake(db: Db, tenantId: TenantId, fileId: string, now = new Date()): Promise<boolean> {
  const { data, error } = await db
    .from("files")
    .update({ removed_at: now.toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", fileId)
    .eq("source", "drive")
    .eq("kind", "video")
    .eq("media_status", "failed")
    .is("removed_at", null)
    .select("id");
  if (error) throw new DbFailure(error, "cannot remove the failed clip");
  return data.length > 0;
}

/** The states a take's own writes leave an item in: what a listing never writes over (source-items.ts). */
const TAKEN_STATES = ["taking", "in", "let_go", "failed"] as const satisfies readonly ItemState[];

/**
 * Items whose bytes changed at their provider after a take of them began or ended, as the sync's listing finds them:
 * new bytes are a new file, so each is asked for again. It goes back to `waiting` with what its provider says of it
 * now, lets go of the file it held (which stays in the Library) and its tries start again. One statement an item,
 * its state and its facts together, and only from the states a take leaves: an item the sync has since marked away,
 * or one already waiting, is left as it is. Answers how many were asked for.
 */
export async function askToTakeAgain(db: Db, items: readonly SourceItemFacts[]): Promise<number> {
  let moved = 0;
  for (const { tenant_id, source_id, provider_id, ...facts } of items) {
    const { data, error } = await db
      .from("source_items")
      .update({ ...facts, state: "waiting", why: null, take_after: null, take_tries: 0, file_id: null })
      .eq("tenant_id", tenant_id)
      .eq("source_id", source_id)
      .eq("provider_id", provider_id)
      .in("state", [...TAKEN_STATES])
      .select("id");
    if (error) throw new DbFailure(error, "cannot ask for the watched folder's item again");
    moved += data.length;
  }
  return moved;
}

/* ------------------------------------------------------------------------------------- what is already here */

/**
 * Another item of the workspace with the same bytes, by their provider's own checksum and size, whose take has ended:
 * `in`, with a file still in the Library, or `let_go`, its owner having removed it. So a file uploaded to the folder
 * again shares what is here with no download. Null where there is none, or the one there no longer holds a file.
 */
export async function findSourceTwin(
  db: Db,
  tenantId: TenantId,
  bytes: { checksum: string; size: number; exceptId: string },
): Promise<{ state: "in"; fileId: string } | { state: "let_go" } | null> {
  const { data, error } = await db
    .from("source_items")
    .select("state, file_id")
    .eq("tenant_id", tenantId)
    .eq("checksum", bytes.checksum)
    .eq("bytes", bytes.size)
    .in("state", ["in", "let_go"])
    .neq("id", bytes.exceptId)
    .limit(SOURCE_TWINS_READ);
  if (error) throw new DbFailure(error, "cannot read the watched folder's items of the same bytes");
  const held = data.flatMap((twin) => (twin.state === "in" && twin.file_id ? [twin.file_id] : []));
  if (held.length > 0) {
    const live = await db
      .from("files")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("id", held)
      .is("removed_at", null)
      .limit(1);
    if (live.error) throw new DbFailure(live.error, "cannot read the file the same bytes became");
    const fileId = live.data[0]?.id;
    if (fileId) return { state: "in", fileId };
  }
  return data.some((twin) => twin.state === "let_go") ? { state: "let_go" } : null;
}

/** How many items of the same bytes are read to find one that still holds a file. */
const SOURCE_TWINS_READ = 5;

/**
 * Which of these copies at the video platform a Library file holds, whichever workspace's (a copy's id is one across
 * them all): what a take reads before it deletes a copy an earlier try of it may have left.
 */
export async function listMediaHeld(db: Db, mediaRefs: readonly string[]): Promise<Set<string>> {
  if (mediaRefs.length === 0) return new Set();
  const { data, error } = await platformWide(db)
    .from("files")
    .select("media_ref")
    .in("media_ref", [...mediaRefs]);
  if (error) throw new DbFailure(error, "cannot read which copies a file holds");
  return new Set(data.flatMap((row) => (row.media_ref ? [row.media_ref] : [])));
}

/* ---------------------------------------------------------------------------------------------- the clip's door */

/**
 * What the door says of a watched folder's clip: there is room for it (judging only), it is kept, it is the file
 * already here, its owner let it go, the Library is full, the videos are, or it is longer than AI can watch.
 */
export type SourcedVideoFate = {
  fate: "room" | "kept" | "here" | "let_go" | "full" | "minutes" | "long";
  file_id: string | null;
  media_ref: string | null;
};

const SOURCED_FATES = ["room", "kept", "here", "let_go", "full", "minutes", "long"] as const;

/**
 * A watched folder's clip judged, or written (00642 file_video_sourced). With no copy named (`mediaRef` null) the door
 * only judges, before the video platform is asked; with one it writes the row, uploading and filed, and makes the item
 * its origin in the same transaction. The service role's; asked twice it answers the same.
 */
export async function recordVideoSourced(
  db: Db,
  video: {
    tenantId: TenantId;
    id: string;
    itemId: string;
    mediaRef: string | null;
    name: string;
    mime: string;
    bytes: number;
    seconds: number | null;
    fingerprint: string;
  },
): Promise<SourcedVideoFate> {
  const { data, error } = await db.rpc("file_video_sourced", {
    p_tenant_id: video.tenantId,
    p_id: video.id,
    p_item_id: video.itemId,
    p_media_ref: video.mediaRef,
    p_name: video.name,
    p_mime: video.mime,
    p_bytes: video.bytes,
    p_seconds: video.seconds,
    p_fingerprint: video.fingerprint,
  });
  if (error) throw new DbFailure(error, "file video sourced");
  const answer = recordOrEmpty(data);
  const fate = SOURCED_FATES.find((known) => known === answer.fate);
  if (!fate) throw new Error("file video sourced: no fate answered");
  return {
    fate,
    file_id: typeof answer.file_id === "string" ? answer.file_id : null,
    media_ref: typeof answer.media_ref === "string" ? answer.media_ref : null,
  };
}

/* -------------------------------------------------------------------------------------- the clock and the budgets */

/**
 * The takes' hand-out (00642 source_takes_hand_out, decision 0115): each waiting item whose time has come is moved to
 * taking and given its job, while its workspace has fewer than `inFlight` being taken and the video platform is
 * preparing fewer than `videosAtOnce` clips; a take that never ended waits again; a paused kind is handed nothing.
 * For one workspace (as a take of its ends, so the next begins at once) or, with none named, for all (the clock).
 * Answers how many jobs it wrote.
 */
export async function handOutSourceTakes(
  db: Db,
  params: { tenantId: TenantId | null; inFlight: number; limit: number; staleSeconds: number; videosAtOnce: number },
): Promise<number> {
  const { data, error } = await db.rpc("source_takes_hand_out", {
    // With no workspace named the clock's form runs, for all of them.
    p_tenant_id: params.tenantId,
    p_in_flight: params.inFlight,
    p_limit: params.limit,
    p_stale_seconds: params.staleSeconds,
    p_videos_max: params.videosAtOnce,
  });
  if (error) throw new DbFailure(error, "cannot hand out the watched folders' takes");
  return typeof data === "number" ? data : 0;
}

/** Which of the day's budgets bound a take. */
const SOURCE_BUDGETS_BOUND = ["units", "platform_bytes", "workspace_takes", "workspace_bytes"] as const;
type SourceBudgetBound = (typeof SOURCE_BUDGETS_BOUND)[number];

/** What the day's budgets say of a take: go, or wait, with which budget binds and when the next day begins. */
type SourceTakeSpend = { fate: "go" } | { fate: "wait"; binds: SourceBudgetBound; until: Date };

const SpendAnswer = z.object({
  fate: z.enum(["go", "wait", "unknown"]),
  binds: z.enum(SOURCE_BUDGETS_BOUND).optional(),
  until: z.string().optional(),
});

/**
 * A take's budget, spent or refused in one place (00642 source_take_spend): the platform's bytes and units of the day
 * and the workspace's takes and bytes of the day. Every number is the caller's setting. Throws for an item that is not
 * this workspace's.
 */
export async function spendSourceTake(
  db: Db,
  spend: {
    tenantId: TenantId;
    itemId: string;
    bytes: number;
    units: number;
    platformBytesMax: number;
    workspaceBytesMax: number;
    workspaceTakesMax: number;
    unitsMax: number;
  },
): Promise<SourceTakeSpend> {
  const { data, error } = await db.rpc("source_take_spend", {
    p_tenant_id: spend.tenantId,
    p_item_id: spend.itemId,
    p_bytes: spend.bytes,
    p_units: spend.units,
    p_platform_bytes_max: spend.platformBytesMax,
    p_workspace_bytes_max: spend.workspaceBytesMax,
    p_workspace_takes_max: spend.workspaceTakesMax,
    p_units_max: spend.unitsMax,
  });
  if (error) throw new DbFailure(error, "cannot spend the take's budget");
  const answer = readAnswer("source_take_spend", SpendAnswer, data);
  if (answer.fate === "go") return { fate: "go" };
  if (answer.fate !== "wait" || !answer.binds || !answer.until)
    throw new Error("source take spend: the item is not this workspace's");
  return { fate: "wait", binds: answer.binds, until: new Date(answer.until) };
}

/** A provider's units counted as they are spent (00642 source_units_spend). Answers the day's units so far. */
export async function spendSourceUnits(db: Db, units: number): Promise<number> {
  const { data, error } = await db.rpc("source_units_spend", { p_units: units });
  if (error) throw new DbFailure(error, "cannot count the provider's units");
  return typeof data === "number" ? data : 0;
}
