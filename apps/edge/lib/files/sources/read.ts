/**
 * A watched folder's read (the footage sources plan, P2; job kind `source_read`): its provider's changes since the
 * place its row keeps, a page at a time, to the end of the list.
 *
 * The list covers the whole account, so a page is read in two steps. First the ids alone: a change belongs to the
 * folder when its parent is one of the tree's folders, or it is an item the tree already holds. Only then is such an
 * item's own record read (its name, its size, its length). What changed elsewhere in the account is never named, and
 * neither is anything that is no folder, photo or video, wherever it sits: a document is passed over unread.
 *
 * The order of a page's writes is what makes a crash harmless. The items are kept first (each once, each state moved
 * only from where a listing left it), then what left is marked, and only then does the place move, from the place
 * the page was read at and nowhere else. A job that dies before the place moves reads the same page again and changes
 * nothing it had already written; one that dies after it starts from the new place. Two reads of one folder cannot
 * both move it. So a file is neither lost nor listed twice.
 *
 * `removed` alone is "deleted, or no longer readable": the item's own record is asked for before anything is said of
 * it (away.ts). A folder new to the tree, or back in it, has its contents listed by a walk of its own. The read ends by
 * writing the folder's pace (pace.ts) and, where its channel is due, opening the next one (channel.ts).
 */
import { SECOND_MS, type SourceChange, type SourceItemRecord, type SourceReply } from "@chanlytics/contracts";
import {
  countSourceItems,
  findMediaSource,
  listSourceItemsAwaitingLength,
  listSourceItemsByIds,
  moveSourceCursor,
  patchMediaSource,
  pullSourceReadSooner,
  type MediaSourceRow,
  type SourceItemRow,
} from "@chanlytics/db/files";
import { scheduleJobOnce, type ClaimedJob } from "@chanlytics/jobs";
import { logger } from "../../shared/log.js";
import { checkFolderAnswers, isInTree, markAway, itemStandingOf, type AwayMark } from "./away.js";
import { keepChannel } from "./channel.js";
import { keepPage, planPage } from "./items.js";
import { isLengthSoon, nextReadOf, SOURCE_PACE, soonestRewalkOf } from "./pace.js";
import { freezeSource, leaveRefusedKey, openSource, type OpenSource } from "./standing.js";

type Db = OpenSource["db"];

/** No page is asked for with less than this left of a job: its records and its writes end inside it. */
const PAGE_ROOM_MS = 15 * SECOND_MS;

/**
 * How far past its job's deadline a page's records may still be asked for. One that runs longer (its provider slow) is
 * left unkept, its place unmoved, and read again with a whole job's time: the function never ends under it.
 */
const RECORDS_OVER_MS = 5 * SECOND_MS;

/** What one read came to, for its line. */
interface ReadOut {
  pages: number;
  changes: number;
  inside: number;
  added: number;
  marked: number;
  held: number;
  ended: boolean;
  /** What the read spent at its provider, in its units. */
  units: number;
}

/** How a read stopped before the end of the list. */
type Stopped = { restMs: number } | "frozen" | "lost_place" | "moved_by_another";

/** One page of changes, sorted: what to read, what left, and whether the watched folder itself is among them. */
interface PageSorted {
  /** Items inside the tree, or known to it and reported removed: each one's own record is asked for. */
  toRead: string[];
  /** Known items its provider says are in the bin, or that now sit outside the tree. */
  marks: AwayMark[];
  rootChanged: boolean;
}

const isHere = (row: Pick<SourceItemRow, "state"> | undefined): boolean =>
  row !== undefined && row.state !== "gone" && row.state !== "outside" && row.state !== "no_access";

/** A page's changes sorted by the tree's index: `known` holds the rows under the changes' ids and their parents'. */
export function sortChanges(
  open: Pick<OpenSource, "source">,
  changes: readonly SourceChange[],
  known: ReadonlyMap<string, SourceItemRow>,
): PageSorted {
  const sorted: PageSorted = { toRead: [], marks: [], rootChanged: false };
  for (const change of changes) {
    const row = known.get(change.id);
    if (change.id === open.source.folder_id) sorted.rootChanged = true;
    else if (change.removed) {
      // Deleted, or no longer readable: its own record says which.
      if (isHere(row)) sorted.toRead.push(change.id);
    } else if (change.trashed) {
      if (isHere(row)) sorted.marks.push({ providerId: change.id, state: "gone" });
    } else if (change.kind === null) {
      // A type the folder does not list (a document): never read, and no change inside for the pace. One the tree
      // still holds is no longer what it lists.
      if (isHere(row)) sorted.marks.push({ providerId: change.id, state: "outside" });
    } else if (isInTree(open, change.parentId, known)) sorted.toRead.push(change.id);
    else if (isHere(row)) sorted.marks.push({ providerId: change.id, state: "outside" });
  }
  return sorted;
}

/** What asking for a page's records came to: the items still in the tree, and the ways the others left. */
interface PageRead {
  items: SourceItemRecord[];
  marks: AwayMark[];
}

/** A page's records as they are sorted: what `PageRead` holds, and the ids its provider answered a 404 for. */
interface RecordsSorted extends PageRead {
  notFound: string[];
}

/**
 * One item's own record, sorted. One in the tree is an item to keep; one in the bin, or under a parent the tree does
 * not hold, has left if the tree knew it; one its provider refuses is unreadable, never gone; a 404 is asked about.
 */
function sortRecord(
  open: OpenSource,
  record: { id: string; reply: Exclude<SourceReply<SourceItemRecord>, { verdict: "pace" }> },
  known: ReadonlyMap<string, SourceItemRow>,
  sorted: RecordsSorted,
): void {
  const { id, reply } = record;
  const tracked = isHere(known.get(id));
  if (reply.verdict === "ok") {
    const standing = itemStandingOf(open, reply.answer, known);
    if (standing === "here") sorted.items.push(reply.answer);
    else if (tracked) sorted.marks.push({ providerId: id, state: standing });
    return;
  }
  // Something the tree holds that its provider no longer shows: unreadable is said at once, a 404 is asked about.
  if (!tracked) return;
  if (reply.verdict === "gone") sorted.notFound.push(id);
  else sorted.marks.push({ providerId: id, state: "no_access" });
}

/**
 * Each item's own record, a few at a time, sorted (sortRecord). A 404 is gone only where the watched folder itself
 * still answers; where it does not, the folder is frozen and nothing is said of its items.
 */
async function readRecords(
  read: Pick<Read, "open" | "deadline">,
  ids: readonly string[],
  known: ReadonlyMap<string, SourceItemRow>,
): Promise<PageRead | Stopped> {
  const { open } = read;
  const sorted: RecordsSorted = { items: [], marks: [], notFound: [] };
  for (let from = 0; from < ids.length; from += SOURCE_PACE.recordsAtOnce) {
    if (Date.now() > read.deadline + RECORDS_OVER_MS) return { restMs: 0 };
    const batch = ids.slice(from, from + SOURCE_PACE.recordsAtOnce);
    // A few at a time (SOURCE_PACE.recordsAtOnce), never the page at once.
    const replies = await Promise.all(batch.map((id) => open.drive.getItem(open.token, id)));
    for (const [index, id] of batch.entries()) {
      const reply = replies[index];
      if (!reply) continue;
      if (reply.verdict === "pace") return { restMs: reply.restMs };
      sortRecord(open, { id, reply }, known, sorted);
    }
  }
  if (sorted.notFound.length > 0) {
    const answers = await checkFolderAnswers(open);
    if (answers === "no") return "frozen";
    if (answers !== "yes") return answers;
    sorted.marks.push(...sorted.notFound.map((providerId): AwayMark => ({ providerId, state: "gone" })));
  }
  return { items: sorted.items, marks: sorted.marks };
}

/** One read in flight: its folder, when it stops, and what it has done. */
interface Read {
  open: OpenSource;
  deadline: number;
  /** Folders new to the tree, or back in it: a walk lists what they hold. */
  folders: number;
  /** Whether a hold stands on the folder: one that stood before the read, or one a page of it set. */
  holding: boolean;
  out: ReadOut;
}

/** Where a read stands: its place in the list, and the folder's row as the last write returned it. */
interface Place {
  cursor: string;
  row: MediaSourceRow;
}

/**
 * One page of the list: sorted, its records read, its items kept, what left marked, and then the place moved, with the
 * folder's pace written beside it on the last page. Answers how the read stopped, or where it now stands and whether
 * that page was the list's last.
 */
async function readPage(read: Read, place: Place): Promise<Stopped | { place: Place; last: boolean }> {
  const { open } = read;
  const reply = await open.drive.listChanges(open.token, open.folder, place.cursor);
  if (reply.verdict === "pace") return { restMs: reply.restMs };
  if (reply.verdict !== "ok") {
    // A place its provider no longer knows is found again.
    if (reply.verdict === "gone") return "lost_place";
    // A shared drive's list refused: the account is no longer that drive's member, and the folder cannot be read.
    if (open.folder.driveId) return "frozen";
    // The account's own list, refused as an item is: no answer to act on. Nothing is paused; the job is tried again.
    throw new Error(`footage folder ${open.source.id}: its account's change list answered ${reply.verdict}`);
  }
  const { changes, nextPage, cursor } = reply.answer;
  // The tree's rows under the changes' ids, and under their parents' where a change is of a type the folder lists.
  const ids = changes.flatMap((change) =>
    change.parentId && (change.kind !== null || change.removed) ? [change.id, change.parentId] : [change.id],
  );
  const known = new Map((await listSourceItemsByIds(open.db, open.ref, ids)).map((row) => [row.provider_id, row]));
  const sorted = sortChanges(open, changes, known);
  const records = await readRecords(read, sorted.toRead, known);
  if (typeof records === "string" || "restMs" in records) return records;
  if (sorted.rootChanged && (await checkFolderAnswers(open)) === "no") return "frozen";

  const plan = planPage(open.ref, records.items, [...known.values()], true);
  const room = plan.inserts.length > 0 ? SOURCE_PACE.itemsMax - (await countSourceItems(open.db, open.ref, null)) : 0;
  const kept = await keepPage(open.db, open.ref, plan, room);
  const away = await markAway(open, [...sorted.marks, ...records.marks], read.holding ? "held" : "judge");
  read.holding ||= away.held > 0;
  read.folders += open.source.include_subfolders ? kept.folders.length : 0;
  read.out.changes += changes.length;
  read.out.inside += records.items.length + sorted.marks.length + records.marks.length;
  read.out.added += kept.added;
  read.out.marked += away.marked;
  read.out.held += away.held;
  read.out.pages += 1;

  const last = nextPage === null;
  const to = nextPage ?? cursor ?? place.cursor;
  const now = Date.now();
  const pace = last
    ? nextReadOf(
        { busyReads: place.row.busy_reads, lastChangeAt: place.row.last_change_at },
        { changes: read.out.changes, inside: read.out.inside, signalled: false },
        now,
      )
    : null;
  const moved = await moveSourceCursor(open.db, {
    tenantId: open.ref.tenantId,
    id: open.ref.sourceId,
    from: place.cursor,
    to,
    patch: pace
      ? {
          last_read_at: new Date(now).toISOString(),
          next_read_at: pace.nextReadAt,
          read_gap_seconds: pace.readGapSeconds,
          busy_reads: pace.busyReads,
          last_change_at: pace.lastChangeAt,
        }
      : {},
  });
  if (!moved) return "moved_by_another";
  return { place: { cursor: to, row: moved }, last };
}

/** A read that stopped short, set down: when the folder is read next, or what it has become. */
async function leaveRead(read: Read, cursor: string, stopped: Stopped): Promise<void> {
  const { open } = read;
  if (stopped === "frozen") return freezeSource(open);
  if (stopped === "moved_by_another") return;
  if (stopped === "lost_place") return findPlaceAgain(open, cursor);
  // Told to rest, or out of time: the clock hands the folder its next read then, so no try of this job is spent.
  await patchMediaSource(open.db, {
    tenantId: open.ref.tenantId,
    id: open.ref.sourceId,
    from: ["watching"],
    patch: { next_read_at: new Date(Date.now() + stopped.restMs).toISOString() },
  });
}

/**
 * The place in the list its provider no longer knows: a new place is taken from now, and the whole tree is walked
 * again, which finds everything the lost stretch held.
 */
async function findPlaceAgain(open: OpenSource, cursor: string): Promise<void> {
  const start = await open.drive.getStartCursor(open.token, open.folder);
  if (start.verdict !== "ok") return;
  const moved = await moveSourceCursor(open.db, {
    tenantId: open.ref.tenantId,
    id: open.ref.sourceId,
    from: cursor,
    to: start.answer,
    patch: { next_walk_at: new Date().toISOString() },
  });
  if (moved) open.log.warn("source_place_lost", { source: open.source.id });
}

/** The walk that lists what new folders hold, put on the ledger unless a walk is in flight (it lists them itself). */
async function walkNewFolders(read: Read, row: MediaSourceRow): Promise<void> {
  if (read.folders === 0 || row.walk_kind !== null) return;
  await scheduleJobOnce(read.open.db, {
    tenantId: read.open.ref.tenantId,
    kind: "source_walk",
    dueAt: new Date(),
    payload: { source_id: read.open.ref.sourceId, run: String(row.walk_run + 1), step: "0", walk: "subtree" },
  });
}

/**
 * The folder's videos listed without their length, asked after again: a fresh upload is measured by its provider a
 * few minutes after it is listed, and no second change is counted on to say so. One whose length arrived has it
 * kept, and is said too long where it is. Only the record's facts are taken: where an item sits and whether it left
 * are the changes' to say. True when one still waits that was uploaded moments ago.
 */
async function rereadLengths(read: Read, row: MediaSourceRow): Promise<boolean> {
  const { open } = read;
  const now = Date.now();
  // Only a folder something happened in within the wait can hold one, and only a read with time left asks.
  const lately = (at: string | null) => at !== null && Date.parse(at) > now - SOURCE_PACE.lengthWaitMs;
  if (!(lately(row.last_change_at) || lately(row.reconciled_at)) || now + PAGE_ROOM_MS > read.deadline) return false;
  const rows = await listSourceItemsAwaitingLength(open.db, open.ref, {
    after: new Date(now).toISOString(),
    limit: SOURCE_PACE.lengthsARead,
  });
  const records: SourceItemRecord[] = [];
  for (let from = 0; from < rows.length; from += SOURCE_PACE.recordsAtOnce) {
    const batch = rows.slice(from, from + SOURCE_PACE.recordsAtOnce);
    const replies = await Promise.all(batch.map((item) => open.drive.getItem(open.token, item.provider_id)));
    if (replies.some((reply) => reply.verdict === "pace")) break;
    for (const [index, item] of batch.entries()) {
      const reply = replies[index];
      if (reply?.verdict === "ok" && !reply.answer.trashed) records.push({ ...reply.answer, parentId: item.parent_id });
    }
  }
  await keepPage(open.db, open.ref, planPage(open.ref, records, rows, false), 0);
  const measured = new Set(records.filter((record) => record.seconds !== null).map((record) => record.id));
  return rows.some((item) => !measured.has(item.provider_id) && isLengthSoon(item.length_until, now));
}

/**
 * A read that reached the end of the list, closed: a signal that came while it ran brings the next read one gap on, a
 * folder that changed is walked within a day, a fresh upload still without its length brings the next read a few
 * minutes on, and its channel is opened where one is due.
 */
async function endRead(read: Read, row: MediaSourceRow, startedAt: number): Promise<void> {
  const { open } = read;
  read.out.ended = true;
  // At or after the read began: a signal in the same instant may be for a change the list did not hold yet.
  const signalled = row.signalled_at !== null && Date.parse(row.signalled_at) >= startedAt;
  const awaited = await rereadLengths(read, row);
  const now = Date.now();
  // A folder that changed is walked within a day, unless its last whole walk spent more than that allows.
  const soon = soonestRewalkOf(row.reconciled_at, row.walk_units, now);
  const walkSooner = read.out.inside > 0 && (row.next_walk_at === null || Date.parse(row.next_walk_at) > soon);
  // The sooner of the two: one gap after a signal, or the few minutes a fresh upload's length takes.
  const readIn = Math.min(
    signalled ? (row.read_gap_seconds ?? 0) * SECOND_MS : Infinity,
    awaited ? SOURCE_PACE.lengthRetryMs : Infinity,
  );
  // Forward only: a signal that came since the read's last page has already brought the row's read forward.
  if (Number.isFinite(readIn))
    await pullSourceReadSooner(open.db, {
      tenantId: open.ref.tenantId,
      id: open.ref.sourceId,
      to: new Date(now + readIn).toISOString(),
    });
  if (walkSooner)
    await patchMediaSource(open.db, {
      tenantId: open.ref.tenantId,
      id: open.ref.sourceId,
      from: ["watching"],
      patch: { next_walk_at: new Date(soon).toISOString() },
    });
  await walkNewFolders(read, row);
  await keepChannel({ ...open, source: row });
}

/**
 * A frozen folder asked after: one that answers again is watched again and walked at the clock's next turn; one that
 * does not waits another quiet floor. True when it thawed.
 */
async function thaw(open: OpenSource): Promise<boolean> {
  const answers = await checkFolderAnswers(open);
  const now = Date.now();
  if (answers === "yes") {
    const nowIso = new Date(now).toISOString();
    await patchMediaSource(open.db, {
      tenantId: open.ref.tenantId,
      id: open.ref.sourceId,
      from: ["frozen"],
      patch: { state: "watching", last_error: null, last_error_at: null, next_read_at: nowIso, next_walk_at: nowIso },
    });
    return true;
  }
  const restMs = answers === "no" ? SOURCE_PACE.quietFloorMs : answers.restMs;
  await patchMediaSource(open.db, {
    tenantId: open.ref.tenantId,
    id: open.ref.sourceId,
    from: ["frozen"],
    patch: { next_read_at: new Date(now + restMs).toISOString() },
  });
  return false;
}

/** source_read as the job runner takes it: the folder's changes read from the place its row keeps. */
export async function runSourceRead(
  db: Db,
  job: ClaimedJob,
  deadline: number,
): Promise<{ read: ReadOut } | { skipped: string }> {
  const log = logger({ tenant_id: job.tenant_id });
  const sourceId = typeof job.payload.source_id === "string" ? job.payload.source_id : "";
  const opened = await openSource(db, { tenantId: job.tenant_id, sourceId }, ["watching", "frozen"], log);
  if (!opened.ok) return { skipped: opened.skipped };
  try {
    return await readOpened(opened.open, deadline);
  } catch (error) {
    // A key its provider refused is settled before anything is paused; anything else is the job's to fail on.
    return leaveRefusedKey(opened.open, error);
  }
}

/** A folder opened for its read: thawed where it was frozen, then read from the place its row keeps. */
async function readOpened(opened: OpenSource, deadline: number): Promise<{ read: ReadOut } | { skipped: string }> {
  let open = opened;
  if (open.source.state === "frozen") {
    if (!(await thaw(open))) return { skipped: "the folder is frozen" };
    const thawed = await findMediaSource(open.db, open.ref.tenantId, open.ref.sourceId);
    if (!thawed) return { skipped: "no such folder" };
    open = { ...open, source: thawed };
  }
  const cursor = open.source.change_cursor;
  if (!cursor) return { skipped: "the folder has no place in its changes" };
  const startedAt = Date.now();
  const read: Read = {
    open,
    deadline,
    folders: 0,
    holding: open.source.hold_at !== null,
    out: { pages: 0, changes: 0, inside: 0, added: 0, marked: 0, held: 0, ended: false, units: 0 },
  };
  for (let place: Place = { cursor, row: open.source }; ;) {
    // Out of time before the end of the list: the place is kept, and the clock hands the folder its next read at once.
    const page = Date.now() + PAGE_ROOM_MS > deadline ? { restMs: 0 } : await readPage(read, place);
    if (typeof page === "string" || "restMs" in page) {
      await leaveRead(read, place.cursor, page);
      await walkNewFolders(read, place.row);
      break;
    }
    place = page.place;
    if (page.last) {
      await endRead(read, place.row, startedAt);
      break;
    }
  }
  read.out.units = open.spent.units;
  open.log.info("source_read", { source: open.source.id, ...read.out });
  return { read: read.out };
}
