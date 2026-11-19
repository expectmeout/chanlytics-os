/**
 * A page of what a watched folder holds, kept (the footage sources plan, P2): the items a walk listed or a read of the
 * changes found inside, written into source_items. The rules are pure (`planPage`); the writes are three kinds, each
 * safe to make twice, in an order a crash can stop anywhere: new items inserted once, known items' facts written over
 * where they changed (an item its provider says nothing new of is not written at all), and states moved only from the
 * states a listing gives. So a job that died part way is run again and changes nothing
 * it had already written, and a state the taking of a file set is never written over here.
 *
 * What a listing says of an item: a folder is `listed`; a photo or a video of a type the Library does not take (a RAW
 * photo) is `not_media`, listed so its owner can be told it was passed over (a document is never listed); a photo
 * or a video over the Library's caps is `too_big`, with which cap; any other photo or video is `waiting` where it is
 * wanted (a change found it, or its bytes changed) and `listed` otherwise. Nothing is taken into the Library here.
 *
 * A video its provider lists without a length is not known yet: never too long and never passed over for lacking
 * one. Its row says until when the length is waited for (`length_until`, pace.ts), and a read asks again.
 *
 * What a listing does for the taking of files (00643). An item that was in, left and is seen again still holds its
 * file on its row: it is asked for at once, by a re-walk as by a change, since its take finds that file and fetches
 * nothing. Bytes that are no longer the ones taken are a new file: such a row lets go of the file it held, and one
 * the taking holds (`taking`, `in`, `let_go`, `failed`) is asked for again. An item that moves starts its tries anew.
 */
import {
  FILE_BYTES_MAX,
  FILE_VIDEO_BYTES_MAX,
  FILE_VIDEO_SECONDS_MAX,
  isOneOf,
  type SourceItemRecord,
  type SourceItemState,
} from "@chanlytics/contracts";
import {
  askToTakeAgain,
  insertSourceItems,
  keepSourceItemFacts,
  markFilesSuperseded,
  moveSourceItems,
  patchSourceFolders,
  SOURCE_ITEM_AWAY,
  type SourceItemFacts,
  type SourceItemPlace,
  type SourceItemRow,
  type SourceRef,
} from "@chanlytics/db/files";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db/types";
import { lengthUntilOf } from "./pace.js";

type Db = SupabaseClient<Database>;

/** The states a listing gives and may write over. The rest (`taking`, `in`, `let_go`, `failed`) are the taking's own. */
const LISTING_STATES = [
  "listed",
  "waiting",
  "too_big",
  "not_media",
  ...SOURCE_ITEM_AWAY,
] as const satisfies readonly SourceItemState[];

/** A state and the reason beside it: which cap a `too_big` item is over. */
interface Standing {
  state: SourceItemState;
  why: "bytes" | "seconds" | null;
}

/** What a listing says of an item its provider still holds. `wanted`: a photo or a video that fits is to be taken in. */
function freshStateOf(item: SourceItemRecord, wanted: boolean): Standing {
  if (item.kind === "folder") return { state: "listed", why: null };
  if (item.kind === "other") return { state: "not_media", why: null };
  const bytesMax = item.kind === "video" ? FILE_VIDEO_BYTES_MAX : FILE_BYTES_MAX;
  if (item.bytes !== null && item.bytes > bytesMax) return { state: "too_big", why: "bytes" };
  if (item.kind === "video" && item.seconds !== null && item.seconds > FILE_VIDEO_SECONDS_MAX)
    return { state: "too_big", why: "seconds" };
  return { state: wanted ? "waiting" : "listed", why: null };
}

/** Whether an item's bytes are no longer the ones its row keeps, by its provider's own checksum and size. */
const bytesChanged = (known: SourceItemRow, item: SourceItemRecord): boolean =>
  known.checksum !== item.checksum || known.bytes !== item.bytes;

/**
 * Where a known item's state moves to on being seen again, or null when it stays. One the taking holds stays. One that
 * was away (gone, moved out, unreadable) is here again. A photo or a video already listed or waiting keeps its place
 * unless its bytes changed or it holds a file, either of which makes it wanted; anything else takes what the listing
 * says now.
 */
function movedStateOf(known: SourceItemRow, item: SourceItemRecord, wanted: boolean): Standing | null {
  if (!isOneOf(LISTING_STATES, known.state)) return null;
  // The file a take gave it is still on its row: its take is asked for, which finds that file and fetches nothing.
  const held = Boolean(known.file_id);
  if (isOneOf(SOURCE_ITEM_AWAY, known.state)) return freshStateOf(item, wanted || held);
  const takeNow = bytesChanged(known, item) || held;
  const fresh = freshStateOf(item, wanted || takeNow);
  const resting = (state: string) => state === "listed" || state === "waiting";
  if (resting(known.state) && resting(fresh.state))
    return takeNow && known.state === "listed" && item.kind !== "folder" ? { state: "waiting", why: null } : null;
  return fresh.state === known.state && fresh.why === known.why ? null : fresh;
}

/** The provider's facts of an item as its row keeps them. */
function itemFactsOf(ref: SourceRef, item: SourceItemRecord): SourceItemFacts {
  return {
    tenant_id: ref.tenantId,
    source_id: ref.sourceId,
    provider_id: item.id,
    kind: item.kind,
    parent_id: item.parentId,
    name: item.name,
    modified_at: item.modifiedAt,
    checksum: item.checksum,
    bytes: item.bytes,
    seconds: item.seconds,
    added_by: item.addedBy,
    length_until: lengthUntilOf(item),
  };
}

/** Whether two moments are the same one, however each is written (a provider's `Z`, the database's `+00:00`). */
const isSameMoment = (one: string | null, other: string | null): boolean =>
  one === other || (one !== null && other !== null && Date.parse(one) === Date.parse(other));

/** Whether a row already sits where its provider says the item does, under the name it gives. */
const keepsPlace = (row: SourceItemRow, place: SourceItemPlace): boolean =>
  row.kind === place.kind && row.parent_id === place.parent_id && row.name === place.name;

/** Whether a row already keeps everything its provider says of the item: one that does is not written. */
const keepsFacts = (row: SourceItemRow, facts: SourceItemFacts): boolean =>
  keepsPlace(row, facts) &&
  isSameMoment(row.modified_at, facts.modified_at) &&
  row.checksum === facts.checksum &&
  row.bytes === facts.bytes &&
  row.seconds === facts.seconds &&
  row.added_by === facts.added_by &&
  isSameMoment(row.length_until, facts.length_until);

/**
 * The same bytes are the same length. A length its provider does not give (a video it has not measured yet) takes
 * nothing from a row that knows it: the taking of a file may have measured it, and said the item too long by it.
 */
const withKnownLength = (row: SourceItemRow, item: SourceItemRecord): SourceItemRecord =>
  item.seconds === null && row.seconds !== null && row.checksum === item.checksum && row.bytes === item.bytes
    ? { ...item, seconds: row.seconds }
    : item;

/**
 * What a listing writes of an item the taking holds: it is asked for again where its bytes are no longer the ones
 * taken (new bytes are a new file), and otherwise only where it sits and its name, where either changed.
 */
function planTaken(plan: PagePlan, ref: SourceRef, row: SourceItemRow, item: SourceItemRecord): void {
  const taken = itemFactsOf(ref, item);
  if (item.kind !== "folder" && bytesChanged(row, item)) {
    plan.retakes.push(taken);
    if (row.file_id) plan.superseded.push(row.file_id);
    return;
  }
  const { tenant_id, source_id, provider_id, kind, parent_id, name } = taken;
  const place = { tenant_id, source_id, provider_id, kind, parent_id, name };
  if (!keepsPlace(row, place)) plan.places.push(place);
}

/** What a page comes to, before anything is written. */
interface PagePlan {
  /** Items seen for the first time, each with the state the listing gives it. */
  inserts: (SourceItemFacts & Standing)[];
  /** Known items whose facts changed: written over. */
  facts: SourceItemFacts[];
  /** Known items the taking holds, moved or renamed: only where they sit and their name. */
  places: SourceItemPlace[];
  /** Known items whose state moves, by the state they move to. */
  moves: { standing: Standing; providerIds: string[] }[];
  /** Known items a listing may write whose bytes are no longer those of the file they hold: they let go of it. */
  letGo: string[];
  /** Known items the taking holds whose bytes are no longer the ones taken: asked for again, with these facts. */
  retakes: SourceItemFacts[];
  /** The Library files those two let go of: marked superseded first, so the seven-day cleanup reads them by it. */
  superseded: string[];
  /** Folders that are new to the tree, or back in it: their contents are still to be listed. */
  folders: string[];
}

/** One page's plan: `known` is what the source already holds under the page's ids. */
export function planPage(
  ref: SourceRef,
  items: readonly SourceItemRecord[],
  known: readonly SourceItemRow[],
  wanted: boolean,
): PagePlan {
  const byId = new Map(known.map((row) => [row.provider_id, row]));
  const plan: PagePlan = {
    inserts: [],
    facts: [],
    places: [],
    moves: [],
    letGo: [],
    retakes: [],
    superseded: [],
    folders: [],
  };
  const moves = new Map<string, { standing: Standing; providerIds: string[] }>();
  for (const item of items) {
    const row = byId.get(item.id);
    if (!row) {
      plan.inserts.push({ ...itemFactsOf(ref, item), ...freshStateOf(item, wanted) });
      if (item.kind === "folder") plan.folders.push(item.id);
      continue;
    }
    if (!isOneOf(LISTING_STATES, row.state)) {
      planTaken(plan, ref, row, item);
      continue;
    }
    const seen = withKnownLength(row, item);
    const facts = itemFactsOf(ref, seen);
    if (!keepsFacts(row, facts)) plan.facts.push(facts);
    if (row.file_id && bytesChanged(row, seen)) {
      plan.letGo.push(item.id);
      plan.superseded.push(row.file_id);
    }
    const moved = movedStateOf(row, seen, wanted);
    if (!moved) continue;
    const key = `${moved.state}:${moved.why ?? ""}`;
    const group = moves.get(key) ?? { standing: moved, providerIds: [] };
    group.providerIds.push(item.id);
    moves.set(key, group);
    // A folder that was away is in the tree again, and what it holds was marked away with it.
    if (item.kind === "folder" && isOneOf(SOURCE_ITEM_AWAY, row.state)) plan.folders.push(item.id);
  }
  plan.moves = [...moves.values()];
  return plan;
}

/** What keeping a page wrote. */
interface PageKept {
  /** How many items were new to the source. */
  added: number;
  /** How many new items were left unwritten because the source holds as many as it lists (`room`). */
  left: number;
  /** Folders whose contents are still to be listed: new to the tree, or back in it. */
  folders: string[];
}

/**
 * A page written: new items once (as many as there is `room` for), known items' changed facts over what was kept, and each
 * state moved only from the states a listing gives. A folder back in the tree is to be listed again from its first page.
 *
 * A row lets go of a file whose bytes changed BEFORE its new facts are kept: stopped between the two, the next listing
 * still sees the change. Written the other way round it would see none, and the old file would be called the item's.
 * And the file is marked superseded before either (00654): its mark is what the seven-day cleanup reads it by, never
 * that no origin is left.
 */
export async function keepPage(db: Db, ref: SourceRef, plan: PagePlan, room: number): Promise<PageKept> {
  const inserts = plan.inserts.slice(0, Math.max(0, room));
  const seenAt = new Date().toISOString();
  const added = await insertSourceItems(
    db,
    inserts.map((row) => ({ ...row, first_seen_at: seenAt })),
  );
  await markFilesSuperseded(db, ref.tenantId, plan.superseded);
  await moveSourceItems(db, ref, { providerIds: plan.letGo, from: LISTING_STATES, patch: { file_id: null } });
  await keepSourceItemFacts(db, plan.facts);
  await keepSourceItemFacts(db, plan.places);
  for (const move of plan.moves)
    await moveSourceItems(db, ref, {
      providerIds: move.providerIds,
      from: LISTING_STATES,
      // An item that moves starts its tries anew: one that failed twice before it left is not failed by its next.
      patch: { state: move.standing.state, why: move.standing.why, gone_at: null, missed_run: null, take_tries: 0 },
    });
  await askToTakeAgain(db, plan.retakes);
  const fresh = new Set(plan.inserts.map((row) => row.provider_id));
  const written = new Set(inserts.map((row) => row.provider_id));
  // A folder back in the tree is listed again from its first page; a new one the cap left unwritten is not in the tree.
  const back = plan.folders.filter((id) => !fresh.has(id));
  await patchSourceFolders(db, ref, { providerIds: back, patch: { walked_run: null, walk_page: null } });
  return {
    added,
    left: plan.inserts.length - inserts.length,
    folders: [...back, ...plan.folders.filter((id) => written.has(id))],
  };
}
