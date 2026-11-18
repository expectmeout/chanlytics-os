/**
 * A watched folder's walk (the footage sources plan, P2; job kind `source_walk`): its tree listed folder by folder, a
 * page at a time, into source_items. Three kinds, one walk:
 *
 *   snapshot   the first listing of the whole tree, after which the folder is watched.
 *   reconcile  a re-walk of the whole tree: daily where something changed lately, weekly otherwise, and after a place
 *              in the provider's changes was lost. It finds what the changes missed, and what is no longer there.
 *   subtree    the contents of a folder that appeared, or moved in.
 *
 * Inside a shared drive folders are listed many in one question to the provider (a call costs the same whatever it
 * holds), and one at a time where such a question is refused, since the provider does not say which folder is no
 * longer there. Outside a shared drive a folder is always asked alone: asked together, the provider answers only
 * what the account itself made, opened or was given directly.
 *
 * Where a walk stands is on rows, never in a job: the folder's run and kind on its source, and on each of the tree's
 * folders the run that listed it whole and the page it stands at. A step lists as much as fits before its deadline and
 * puts the next step on the ledger; a step that died is taken up by the clock (00641 sources_hand_out) where the rows
 * say. Every write is once an item, so a page listed twice changes nothing.
 *
 * What a re-walk did not find is only marked as missed (source_items.missed_run). When the tree is listed, each missed
 * item's own record is asked for, and only then is it said gone, outside or unreadable (away.ts); a wave of them is
 * held instead. A folder listed in one step is compared in memory, so a re-walk writes nothing on an item that did
 * not change; one too large for a step stamps what it sees (seen_run) and closes with one statement.
 */
import {
  DAY_MS,
  SECOND_MS,
  SOURCE_WALK_KINDS,
  isOneOf,
  textOrEmpty,
  type SourceItemRecord,
  type SourceWalkKind,
} from "@chanlytics/contracts";
import {
  beginSourceWalk,
  countSourceItems,
  insertSourceItems,
  listFoldersToWalk,
  listNewestListed,
  listSourceChildren,
  listSourceItemsByIds,
  listSourceItemsMissed,
  markFoldersUnseen,
  markSourceItems,
  moveSourceItems,
  patchSourceFolders,
  patchSourceWalk,
  type SourceItemRow,
} from "@chanlytics/db/files";
import { scheduleJobOnce, type ClaimedJob } from "@chanlytics/jobs";
import { logger } from "../../shared/log.js";
import { holdSource, markAway, itemStandingOf, type AwayMark } from "./away.js";
import { keepPage, planPage } from "./items.js";
import { agreesWithHold, isMassGone, nextWalkOf, SOURCE_PACE } from "./pace.js";
import { freezeSource, leaveRefusedKey, openSource, type OpenSource } from "./standing.js";
import { SOURCE_WORDS } from "./words.js";

type Db = OpenSource["db"];

/** No page is asked for with less than this left of a step: a page of a thousand and its writes end inside it. */
const PAGE_ROOM_MS = 12 * SECOND_MS;

/** What one step came to, for its line. */
interface Walked {
  folders: number;
  pages: number;
  added: number;
  missed: number;
  ended: boolean;
  /** What the step spent at its provider, in its units. */
  units: number;
}

/** One walk in flight: the folder it belongs to, its run and kind, when its step stops, and what the step has done. */
interface Walk {
  open: OpenSource;
  run: number;
  kind: SourceWalkKind;
  deadline: number;
  /** What the run's earlier steps spent at the provider: a whole walk's units set how soon the next one is. */
  unitsBefore: number;
  /** How many items the source holds, counted once a step: the listing's cap is held against it. */
  held: number;
  out: Walked;
}

/** How a folder's listing stopped short of its end: out of time, or told to rest. */
type Stopped = { restMs: number };

/** The next step of a run, put on the ledger: due now, or after the rest its provider asked for. */
async function scheduleWalkStep(walk: Walk, step: string, restMs: number): Promise<void> {
  await scheduleJobOnce(walk.open.db, {
    tenantId: walk.open.ref.tenantId,
    kind: "source_walk",
    dueAt: new Date(Date.now() + restMs),
    payload: { source_id: walk.open.ref.sourceId, run: String(walk.run), step, walk: walk.kind },
  });
}

/** The step after this one: a number counts on, and a step the clock named (`again-…`) starts counting. */
const stepAfter = (step: string): string => (/^\d+$/.test(step) ? String(Number(step) + 1) : `${step}.1`);

/**
 * One page of a listing kept: its items written, those a run had marked as missed and now sees unmarked, and the walk
 * said to be alive. False when the run is no longer this walk's (another began over it, or the folder stopped).
 */
async function keepWalkPage(walk: Walk, items: readonly SourceItemRecord[]): Promise<boolean> {
  const { open, run } = walk;
  const ids = items.map((item) => item.id);
  const known = walk.kind === "snapshot" ? [] : await listSourceItemsByIds(open.db, open.ref, ids);
  const kept = await keepPage(
    open.db,
    open.ref,
    planPage(open.ref, items, known, false),
    SOURCE_PACE.itemsMax - walk.held,
  );
  walk.held += kept.added;
  walk.out.added += kept.added;
  const seenAgain = known.filter((row) => row.missed_run === run);
  if (seenAgain.length > 0) {
    await markSourceItems(open.db, open.ref, {
      providerIds: seenAgain.map((row) => row.provider_id),
      patch: { missed_run: null },
    });
    // A folder found again in this run is listed in it after all.
    await patchSourceFolders(open.db, open.ref, {
      providerIds: seenAgain.filter((seen) => seen.kind === "folder").map((seen) => seen.provider_id),
      patch: { walked_run: null },
    });
  }
  const alive = await patchSourceWalk(open.db, {
    tenantId: open.ref.tenantId,
    id: open.ref.sourceId,
    run,
    patch: {
      walk_touched_at: new Date().toISOString(),
      ...(kept.left > 0 ? { last_error: SOURCE_WORDS.full, last_error_at: new Date().toISOString() } : {}),
    },
  });
  return alive !== null;
}

/** Folders listed whole, closed: what the run did not see in them is marked as missed, and they are not listed again. */
async function closeFolders(
  walk: Walk,
  folders: readonly SourceItemRow[],
  seen: ReadonlySet<string> | null,
): Promise<void> {
  const { open, run } = walk;
  const ids = folders.map((folder) => folder.provider_id);
  if (walk.kind === "reconcile") {
    if (seen === null) await markFoldersUnseen(open.db, open.ref, { parentIds: ids, run });
    else {
      const children = await listSourceChildren(open.db, open.ref, ids);
      const missed = children.filter((child) => !seen.has(child.provider_id)).map((child) => child.provider_id);
      await markSourceItems(open.db, open.ref, { providerIds: missed, patch: { missed_run: run } });
    }
  }
  await patchSourceFolders(open.db, open.ref, { providerIds: ids, patch: { walked_run: run, walk_page: null } });
  walk.out.folders += folders.length;
}

/** Folders listed together, in flight: the folders, and what this step has seen in them. */
interface Listing {
  folders: readonly SourceItemRow[];
  /** Held in memory; null where an earlier step left the listing part way, and what a page shows is stamped instead. */
  seen: Set<string> | null;
}

/** How a listing ended short of its end, or null when its folders are listed whole. */
type ListingEnd = Stopped | "frozen" | "not_this_run" | null;

/** A listing left part way: what was seen so far is stamped, and the page it stands at kept on each folder's row. */
async function leaveListing(walk: Walk, listing: Listing, at: string | null, restMs: number): Promise<Stopped> {
  const { open, run } = walk;
  const { folders, seen } = listing;
  if (seen !== null) await markSourceItems(open.db, open.ref, { providerIds: [...seen], patch: { seen_run: run } });
  if (at !== null)
    await patchSourceFolders(open.db, open.ref, {
      providerIds: folders.map((folder) => folder.provider_id),
      patch: { walk_page: at },
    });
  return { restMs };
}

/**
 * Folders their provider would not list. One alone: the watched one is frozen with nothing marked, one inside it is
 * missed and asked after. Several together: one of them is not there and the provider does not say which, so each is
 * listed alone, from its first page.
 */
async function leaveUnlisted(walk: Walk, folders: readonly SourceItemRow[]): Promise<ListingEnd> {
  const { open, run } = walk;
  const [alone, ...others] = folders;
  if (!alone) return null;
  if (others.length === 0) {
    if (alone.provider_id === open.source.folder_id) return "frozen";
    await markSourceItems(open.db, open.ref, { providerIds: [alone.provider_id], patch: { missed_run: run } });
    await closeFolders(walk, [alone], null);
    return null;
  }
  // The page they stood at together is no one folder's: each starts again.
  if (alone.walk_page !== null)
    await patchSourceFolders(open.db, open.ref, {
      providerIds: folders.map((folder) => folder.provider_id),
      patch: { walk_page: null },
    });
  for (const folder of folders) {
    const stopped = await listFolders(walk, [{ ...folder, walk_page: null }]);
    if (stopped !== null) return stopped;
  }
  return null;
}

/** One page of a listing kept and noted as seen: in memory, or stamped where the listing takes more than one step. */
async function keepListed(walk: Walk, listing: Listing, items: readonly SourceItemRecord[]): Promise<boolean> {
  const { open, run } = walk;
  if (!(await keepWalkPage(walk, items))) return false;
  walk.out.pages += 1;
  const ids = items.map((item) => item.id);
  if (listing.seen === null) await markSourceItems(open.db, open.ref, { providerIds: ids, patch: { seen_run: run } });
  else for (const id of ids) listing.seen.add(id);
  return true;
}

/**
 * Folders listed together (a shared drive's; anywhere else one alone), page by page, until the listing's end or the
 * step's: one question to the provider covers all of them (pace.ts, foldersAtOnce). A listing that fits in one step
 * is compared in memory when it closes; one that does not keeps the page it stands at on each folder's row and stamps
 * what it has seen, so the step that ends it closes it with one statement. Answers how it stopped, or null when the
 * folders are listed whole.
 */
async function listFolders(walk: Walk, folders: readonly SourceItemRow[]): Promise<ListingEnd> {
  const { open } = walk;
  const at = folders[0]?.walk_page ?? null;
  // In one order always: the page a listing stands at belongs to the question as it was first asked.
  const ids = folders.map((folder) => folder.provider_id).sort();
  const listing: Listing = { folders, seen: at === null ? new Set() : null };
  for (let page = at; ;) {
    if (Date.now() + PAGE_ROOM_MS > walk.deadline) return leaveListing(walk, listing, page, 0);
    const reply = await open.drive.listChildrenOf(open.token, open.folder, ids, page);
    if (reply.verdict === "pace") return leaveListing(walk, listing, page, reply.restMs);
    if (reply.verdict !== "ok") return leaveUnlisted(walk, folders);
    if (!(await keepListed(walk, listing, reply.answer.items))) return "not_this_run";
    page = reply.answer.nextPage;
    if (page === null) {
      await closeFolders(walk, folders, listing.seen);
      return null;
    }
  }
}

/**
 * The folders a step lists next, together: those an earlier step left part way (they share the page they stand at),
 * else as many as one question takes that this run has not listed. One this run did not find where it was comes alone.
 */
function foldersTogether(pending: readonly SourceItemRow[], run: number): SourceItemRow[] {
  const [first] = pending;
  if (!first) return [];
  if (first.missed_run === run) return [first];
  return pending.filter((folder) => folder.walk_page === first.walk_page && folder.missed_run !== run);
}

/**
 * What a re-walk did not find, asked after: each missed item's own record read, and each said where it stands. A wave
 * is held, unless this walk agrees with a hold that stood before it or a person confirmed it. Answers how the asking
 * stopped short, or null when nothing is left to ask.
 */
async function settleMissed(walk: Walk): Promise<Stopped | null> {
  const { open, run } = walk;
  const missed = await countSourceItems(open.db, open.ref, { missedRun: run });
  walk.out.missed += missed;
  if (missed === 0) return null;
  const { hold_at: holdAt, hold_confirmed_at: confirmedAt, walk_started_at: startedAt } = open.source;
  const agreed = confirmedAt !== null || agreesWithHold(holdAt, startedAt);
  if (!agreed && isMassGone(missed, await countSourceItems(open.db, open.ref, { here: true }))) {
    // Held: nothing is marked, and the re-walk a day on agrees or finds them back. A hold that stands keeps its day.
    if (holdAt === null) await holdSource(open, missed);
    return null;
  }
  for (;;) {
    if (Date.now() + PAGE_ROOM_MS > walk.deadline) return { restMs: 0 };
    const rows = await listSourceItemsMissed(open.db, open.ref, { run, limit: SOURCE_PACE.missedAStep });
    if (rows.length === 0) return null;
    const rest = await askAfter(walk, rows);
    if (rest !== null) return rest;
  }
}

/** One page of missed items, each asked of its provider and marked for what it is; one still in the tree is unmarked. */
async function askAfter(walk: Walk, rows: readonly SourceItemRow[]): Promise<Stopped | null> {
  const { open } = walk;
  const marks: AwayMark[] = [];
  const here: SourceItemRecord[] = [];
  const records: { row: SourceItemRow; item: SourceItemRecord }[] = [];
  for (let from = 0; from < rows.length; from += SOURCE_PACE.recordsAtOnce) {
    const batch = rows.slice(from, from + SOURCE_PACE.recordsAtOnce);
    const replies = await Promise.all(batch.map((row) => open.drive.getItem(open.token, row.provider_id)));
    for (const [index, reply] of replies.entries()) {
      const row = batch[index];
      if (!row) continue;
      if (reply.verdict === "pace") return { restMs: reply.restMs };
      // The tree was just listed under this grant, so the folder answers: a 404 on one of its items is a deletion.
      if (reply.verdict === "ok") records.push({ row, item: reply.answer });
      else marks.push({ providerId: row.provider_id, state: reply.verdict === "gone" ? "gone" : "no_access" });
    }
  }
  const parents = await listSourceItemsByIds(
    open.db,
    open.ref,
    records.flatMap(({ item }) => (item.parentId ? [item.parentId] : [])),
  );
  const tree = new Map(parents.map((row) => [row.provider_id, row]));
  for (const { row, item } of records) {
    const standing = itemStandingOf(open, item, tree);
    if (standing === "here") here.push(item);
    else marks.push({ providerId: row.provider_id, state: standing });
  }
  // Still in the tree, somewhere the walk had already passed: its place is kept.
  await keepPage(open.db, open.ref, planPage(open.ref, here, rows, false), 0);
  await markAway(open, marks, "agreed");
  // Each has been asked after and said for what it is: none of the page is missed any more.
  await markSourceItems(open.db, open.ref, {
    providerIds: rows.map((row) => row.provider_id),
    patch: { missed_run: null },
  });
  return null;
}

/**
 * A walk ended: the newest of what it listed for the first time asked for (the plan's D11: the last thirty days, fifty
 * at most), the hold cleared where nothing is held any more, the folder watched, and its next walk set. A first walk
 * hands the folder its first read at once, from the place saved before the walk began.
 */
async function endWalk(walk: Walk): Promise<void> {
  const { open, run } = walk;
  const now = Date.now();
  const startedAt = open.source.walk_started_at ?? new Date(now).toISOString();
  const newest = await listNewestListed(open.db, open.ref, {
    seenFrom: startedAt,
    modifiedFrom: new Date(now - SOURCE_PACE.firstWatchDays * DAY_MS).toISOString(),
    limit: SOURCE_PACE.firstWatchItems,
  });
  await moveSourceItems(open.db, open.ref, { providerIds: newest, from: ["listed"], patch: { state: "waiting" } });
  const whole = walk.kind !== "subtree";
  // What the walk missed and did not ask after is held: the next re-walk, a day on at most, agrees or finds it back.
  const held =
    walk.kind === "reconcile" &&
    walk.out.missed > 0 &&
    (await countSourceItems(open.db, open.ref, { missedRun: run })) > 0;
  const first = open.source.state === "setting_up";
  const nowIso = new Date(now).toISOString();
  // A hold's own day stands: the walk that may agree with it is a re-walk's span after it was written.
  const heldSince = open.source.hold_at === null ? now : Date.parse(open.source.hold_at);
  const nextWalk = held
    ? new Date(Math.max(now, heldSince + SOURCE_PACE.rewalkMs)).toISOString()
    : nextWalkOf(open.source.last_change_at, now, walk.unitsBefore + open.spent.units);
  const ended = await patchSourceWalk(open.db, {
    tenantId: open.ref.tenantId,
    id: open.ref.sourceId,
    run,
    patch: {
      walk_kind: null,
      walk_started_at: null,
      walk_touched_at: null,
      ...(whole
        ? { reconciled_at: nowIso, next_walk_at: nextWalk, walk_units: walk.unitsBefore + open.spent.units }
        : {}),
      ...(whole && !held ? { hold_at: null, hold_count: null, hold_confirmed_at: null } : {}),
      ...(first ? { state: "watching", next_read_at: nowIso } : {}),
    },
  });
  if (!ended) return;
  walk.out.ended ||= true;
  if (first)
    await scheduleJobOnce(open.db, {
      tenantId: open.ref.tenantId,
      kind: "source_read",
      dueAt: new Date(now),
      payload: { source_id: open.ref.sourceId },
    });
}

/**
 * The run this step belongs to, begun where the step is its first: the run after the folder's newest, only while no
 * walk is in flight, with the watched folder itself written as the tree's root. Null when the step is not this run's.
 */
async function beginOrJoin(open: OpenSource, run: number, kind: SourceWalkKind): Promise<OpenSource | null> {
  const { source } = open;
  if (source.walk_kind !== null) return source.walk_run === run ? open : null;
  if (source.walk_run !== run - 1) return null;
  const begun = await beginSourceWalk(open.db, {
    tenantId: open.ref.tenantId,
    id: open.ref.sourceId,
    run,
    kind,
    at: new Date().toISOString(),
  });
  if (!begun) return null;
  await insertSourceItems(open.db, [
    {
      tenant_id: open.ref.tenantId,
      source_id: open.ref.sourceId,
      provider_id: source.folder_id,
      kind: "folder",
      parent_id: null,
      name: source.folder_name,
      state: "listed",
      first_seen_at: begun.walk_started_at ?? new Date().toISOString(),
    },
  ]);
  return { ...open, source: begun };
}

/** One step of a walk: folders listed until the tree is done or the step is, then what was missed, then its end. */
async function stepWalk(walk: Walk, step: string): Promise<void> {
  const { open, run } = walk;
  const only = open.source.include_subfolders ? null : open.source.folder_id;
  for (;;) {
    const pending = await listFoldersToWalk(open.db, open.ref, {
      run,
      whole: walk.kind !== "subtree",
      only,
      // Together only inside a shared drive: anywhere else its provider answers many folders in part.
      limit: open.folder.driveId ? SOURCE_PACE.foldersAtOnce : 1,
    });
    const together = foldersTogether(pending, run);
    const [first] = together;
    if (!first) break;
    let stopped: ListingEnd = null;
    // A folder this run did not find where it was is not listed: what it holds is missed with it, and asked after.
    if (first.missed_run === run) await closeFolders(walk, together, null);
    else stopped = await listFolders(walk, together);
    if (stopped === "not_this_run") return;
    if (stopped === "frozen") return freezeSource(open);
    if (stopped !== null) return scheduleWalkStep(walk, stepAfter(step), stopped.restMs);
  }
  const rest = walk.kind === "reconcile" ? await settleMissed(walk) : null;
  if (rest !== null) return scheduleWalkStep(walk, stepAfter(step), rest.restMs);
  await endWalk(walk);
}

/** source_walk as the job runner takes it: one step of the run its payload names. */
export async function runSourceWalk(
  db: Db,
  job: ClaimedJob,
  deadline: number,
): Promise<{ walked: Walked } | { skipped: string }> {
  const log = logger({ tenant_id: job.tenant_id });
  const run = Number(textOrEmpty(job.payload.run));
  const kind = textOrEmpty(job.payload.walk);
  if (!Number.isInteger(run) || run < 1 || !isOneOf(SOURCE_WALK_KINDS, kind)) return { skipped: "not a walk's step" };
  const opened = await openSource(
    db,
    { tenantId: job.tenant_id, sourceId: textOrEmpty(job.payload.source_id) },
    ["setting_up", "watching"],
    log,
  );
  if (!opened.ok) return { skipped: opened.skipped };
  try {
    return await walkOpened(opened.open, { run, kind, step: textOrEmpty(job.payload.step) }, deadline);
  } catch (error) {
    // A key its provider refused is settled before anything is paused; anything else is the job's to fail on.
    return leaveRefusedKey(opened.open, error);
  }
}

/** A folder opened for a walk's step: the run begun or joined, and the step taken. */
async function walkOpened(
  opened: OpenSource,
  named: { run: number; kind: SourceWalkKind; step: string },
  deadline: number,
): Promise<{ walked: Walked } | { skipped: string }> {
  const { run, kind } = named;
  const open = await beginOrJoin(opened, run, kind);
  if (!open) return { skipped: "not this run's step" };
  const walk: Walk = {
    open,
    run,
    // A step taken up again belongs to the walk the row names, whatever its payload said.
    kind: isOneOf(SOURCE_WALK_KINDS, open.source.walk_kind) ? open.source.walk_kind : kind,
    deadline,
    unitsBefore: open.source.walk_units,
    held: await countSourceItems(open.db, open.ref, null),
    out: { folders: 0, pages: 0, added: 0, missed: 0, ended: false, units: 0 },
  };
  await stepWalk(walk, named.step);
  walk.out.units = open.spent.units;
  // A whole walk that goes on keeps what it has spent so far on its row, for the step that ends it.
  if (!walk.out.ended && walk.kind !== "subtree")
    await patchSourceWalk(open.db, {
      tenantId: open.ref.tenantId,
      id: open.ref.sourceId,
      run,
      patch: { walk_units: walk.unitsBefore + open.spent.units },
    });
  open.log.info("source_walked", { source: open.source.id, run, kind: walk.kind, ...walk.out });
  return { walked: walk.out };
}
