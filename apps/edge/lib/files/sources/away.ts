/**
 * What is no longer where it was in a watched folder (the footage sources plan, P2): the three ways an item leaves,
 * told apart and never mistaken for one another, and the hold on a wave of them.
 *
 *   gone       in the bin: its provider says it is trashed. That is the one sign of a deletion a provider gives.
 *   outside    still there, moved out of the watched tree.
 *   no_access  its provider no longer lets it be read, or no longer shows it at all. Never read as gone: access lost
 *              never deletes.
 *
 * Google answers 404 both for a file that was deleted and for one the account can no longer see (a folder someone
 * restricted, a file moved somewhere private), and its change list says "removed" for both. So a 404 is never "gone"
 * (Ruben, 18 Nov 2026: a file that vanishes is kept, not counted as deleted): an item the bin never showed is
 * `no_access`, with `not_found` as its why, and it is listed again by itself if its provider shows it again. One
 * deleted for good with the bin never seen stays so until its owner removes it from the Library. Where the watched
 * folder itself does not answer (`checkFolderAnswers`), the folder is frozen instead, with nothing marked.
 *
 * A folder that leaves takes what it holds with it (`listSubtree`). An item's Library file is not touched here: the row
 * says where its original stands, and what becomes of the file is the next phases' (the plan's D3 grace).
 *
 * The hold: a run that would mark more items gone or moved out than the pace lets leave marks none, writes the hold on
 * the folder's row and sets its next re-walk a day on. That re-walk, if it still misses them, agrees and marks them;
 * so does one after a person confirmed. No access is never held: it removes nothing.
 */
import { SOURCE_ITEM_STATES, type SourceItemRecord, type SourceItemState } from "@chanlytics/contracts";
import {
  countSourceItems,
  listSourceChildren,
  listSourceItemsByIds,
  moveSourceItems,
  patchMediaSource,
  SOURCE_ITEM_AWAY,
  type SourceItemRow,
} from "@chanlytics/db/files";
import { isMassGone, SOURCE_PACE } from "./pace.js";
import type { OpenSource } from "./standing.js";

/** One of the three ways an item is no longer where it was. */
type AwayState = (typeof SOURCE_ITEM_AWAY)[number];

/** An item to mark, by its provider's id. */
export interface AwayMark {
  providerId: string;
  state: AwayState;
  /** Said with `no_access` alone: its provider no longer shows the item at all, and the bin never showed it. */
  why?: "not_found";
}

/** The mark of an item its provider answered a 404 for: unreadable, never gone, since a 404 does not say deleted. */
export const unfoundMarkOf = (providerId: string): AwayMark => ({ providerId, state: "no_access", why: "not_found" });

/** Marks that send their items to one state for one reason, with everything under them. */
interface Leaving {
  state: AwayState;
  why: string | null;
  ids: string[];
}

/** Whether a group takes items out of the tree: in the bin or moved out. Unreadable removes nothing. */
const isRemoval = (group: Pick<Leaving, "state">): boolean => group.state !== "no_access";

const isAway = (state: string): boolean => SOURCE_ITEM_AWAY.some((away) => away === state);

/**
 * Whether a parent is part of the watched tree: the watched folder itself, or (where subfolders count) a folder the
 * tree holds that is still where it was.
 */
export function isInTree(
  open: Pick<OpenSource, "source">,
  parentId: string | null,
  known: ReadonlyMap<string, Pick<SourceItemRow, "kind" | "state">>,
): boolean {
  if (parentId === null) return false;
  if (parentId === open.source.folder_id) return true;
  const parent = known.get(parentId);
  return open.source.include_subfolders && parent?.kind === "folder" && parent.state === "listed";
}

/** These items and everything under the folders among them: each still where it was, by its provider's id. */
async function listSubtree(open: Pick<OpenSource, "db" | "ref">, providerIds: readonly string[]): Promise<string[]> {
  const all = new Set(providerIds);
  let level = [...all];
  // Depth by depth: a provider's tree is a hundred folders deep at most, and a level is one read of its children.
  while (level.length > 0) {
    const children = await listSourceChildren(open.db, open.ref, level);
    level = [];
    for (const child of children) {
      if (all.has(child.provider_id)) continue;
      all.add(child.provider_id);
      if (child.kind === "folder") level.push(child.provider_id);
    }
  }
  return [...all];
}

/** Whether the watched folder itself still answers: what makes a 404 on one of its items mean deleted. */
export async function checkFolderAnswers(open: OpenSource): Promise<"yes" | "no" | { restMs: number }> {
  const reply = await open.drive.validateFolder(open.token, open.source.folder_id);
  if (reply.verdict === "ok") return "yes";
  return reply.verdict === "pace" ? { restMs: reply.restMs } : "no";
}

/**
 * Where an item its provider was asked about stands: its record when it is still in the tree, or the way it left.
 * `known` holds the tree's folders the record may name as its parent.
 */
export function itemStandingOf(
  open: Pick<OpenSource, "source">,
  item: SourceItemRecord,
  known: ReadonlyMap<string, Pick<SourceItemRow, "kind" | "state">>,
): "here" | AwayState {
  if (item.trashed) return "gone";
  return isInTree(open, item.parentId, known) ? "here" : "outside";
}

/** What marking came to. */
interface AwayOutcome {
  marked: number;
  /** How many items the hold kept from being marked; 0 when nothing was held. */
  held: number;
}

/**
 * How a run's removals are judged. `judge`: a wave is held, anything less is marked. `held`: a hold already stands, so
 * nothing is marked gone or moved out, and the re-walk decides for all of them at once. `agreed`: a re-walk that still
 * misses what a hold kept, or one a person confirmed, marks them whatever their number.
 */
type AwayRule = "judge" | "held" | "agreed";

/** The marks written, each with everything under it, as the rule says. */
export async function markAway(
  open: OpenSource,
  marks: readonly AwayMark[],
  rule: AwayRule,
  at = new Date(),
): Promise<AwayOutcome> {
  if (marks.length === 0) return { marked: 0, held: 0 };
  const rows = await listSourceItemsByIds(
    open.db,
    open.ref,
    marks.map((mark) => mark.providerId),
  );
  const here = new Map(rows.filter((row) => !isAway(row.state)).map((row) => [row.provider_id, row]));
  const groups = new Map<string, Leaving>();
  for (const mark of marks) {
    if (!here.has(mark.providerId)) continue;
    const key = `${mark.state}:${mark.why ?? ""}`;
    const group = groups.get(key) ?? { state: mark.state, why: mark.why ?? null, ids: [] };
    group.ids.push(mark.providerId);
    groups.set(key, group);
  }
  let leaving: Leaving[] = [];
  for (const group of groups.values()) leaving.push({ ...group, ids: await listSubtree(open, group.ids) });
  const removals = leaving.filter(isRemoval).reduce((sum, group) => sum + group.ids.length, 0);
  let held = 0;
  if (removals > 0 && rule !== "agreed") {
    const standing = rule === "held";
    if (standing || isMassGone(removals, await countSourceItems(open.db, open.ref, { here: true }))) {
      held = removals;
      leaving = leaving.filter((group) => !isRemoval(group));
      if (!standing) await holdSource(open, removals, at);
    }
  }
  let marked = 0;
  for (const { state, why, ids } of leaving)
    marked += await moveSourceItems(open.db, open.ref, {
      providerIds: ids,
      from: SOURCE_ITEM_STATES.filter((from: SourceItemState) => from !== state),
      patch: { state, why, gone_at: at.toISOString(), missed_run: null },
    });
  return { marked, held };
}

/** The hold written on the folder's row, and its next re-walk set a day on: that walk agrees, or finds them back. */
export async function holdSource(open: OpenSource, count: number, at = new Date()): Promise<void> {
  await patchMediaSource(open.db, {
    tenantId: open.source.tenant_id,
    id: open.source.id,
    from: null,
    patch: {
      hold_at: at.toISOString(),
      hold_count: count,
      hold_confirmed_at: null,
      next_walk_at: new Date(at.getTime() + SOURCE_PACE.rewalkMs).toISOString(),
    },
  });
  open.log.warn("source_held", { source: open.source.id, items: count });
}
