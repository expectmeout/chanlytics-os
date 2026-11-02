/**
 * The Sequences page's reads of one sequence and its presses (decision 0060). A record, who is in it and what it sent are
 * read through the typed client: a record opened again paints from the last answer this tab holds and is read again
 * behind (read-cache.ts, kept in the tab as a person's page is: through a write and a reload, painted and read again); a
 * refusal is never kept. A door to one reached for reads it ahead (warmSequenceRoute). Every press is a verb
 * (contracts PROPOSAL_SPECS, committed through the one walk, legacy-bridge/verbs): the sequence's own (`sequence_step`,
 * `sequence_step_remove`, `sequence_words`, `sequence_leave`), a sequence's state as a campaign's (`playbook_change`) and a
 * batch's approval as a run's (`run`), so the receipt and the undo are the ones Ask's card would say. `pressed` says what
 * landed, in a toast with its undo where the verb keeps one.
 */
import { parseSequencesRoute, type VerbKind } from "@chanlytics/contracts";
import type { ApiResult, Output } from "@/client/api";
import { api } from "@/legacy-bridge/api";
import { readCache } from "@/legacy-bridge/read-cache";
import { commitVerb, undoVerb } from "@/legacy-bridge/verbs/commit";
import { refusalToast } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { warmSources } from "../reach-out/sources";

type RecordAnswer = ApiResult<Output<"GET sequences/[id]">>;
type PeopleAnswer = ApiResult<Output<"GET sequences/[id]/people">>;
type HistoryAnswer = ApiResult<Output<"GET sequences/[id]/history">>;
type ReachAnswer = ApiResult<Output<"GET sequences/[id]/reach">>;
type ListAnswer = ApiResult<Output<"GET sequences">>;
type PlaceAnswer = ApiResult<Output<"GET leads/[id]/place">>;

// A record, its People and its History's first page are kept in the tab (read-cache.ts `tab`): in memory alone, any press in
// the workspace let them all go, so every record opened after one read from nothing behind "Reading…" (the load review of
// 18 Oct 2026). Kept, they paint at once and are read again behind, as a person's page is.
const records = readCache<RecordAnswer>("sequence", (r) => r.ok, { tab: true });
const peoples = readCache<PeopleAnswer>("sequence_people", (r) => r.ok, { tab: true });
const histories = readCache<HistoryAnswer>("sequence_history", (r) => r.ok, { tab: true });
const reaches = readCache<ReachAnswer>("sequence_reach", (r) => r.ok);
const sequenceLists = readCache<ListAnswer>("sequence_list", (r) => r.ok);
const places = readCache<PlaceAnswer>("lead_place", (r) => r.ok, { tab: true });

const readRecord = (id: string) => api()("GET sequences/[id]", { params: { id } });
const readPeople = (id: string) => api()("GET sequences/[id]/people", { params: { id } });
const readHistory = (id: string) => api()("GET sequences/[id]/history", { params: { id } });
const readPlace = (leadId: string) => api()("GET leads/[id]/place", { params: { id: leadId } });

export const sequenceVerbs = {
  /** One sequence: its row, its steps, who approves its batches. */
  record: (id: string) => records.through(id, () => readRecord(id)),
  peekRecord: (id: string): RecordAnswer | null => records.peek(id),
  /** Who is in it, by where they stand. */
  people: (id: string) => peoples.through(id, () => readPeople(id)),
  peekPeople: (id: string): PeopleAnswer | null => peoples.peek(id),
  /** What it sent, newest first; `before` pages back. The first page is kept, a page further back never. */
  history: (id: string, before?: string) =>
    before
      ? api()("GET sequences/[id]/history", { params: { id }, query: { before } })
      : histories.through(id, () => readHistory(id)),
  peekHistory: (id: string): HistoryAnswer | null => histories.peek(id),
  /** What Turn on asks with beside the record: who its next run reaches, a run's most, the workspace's pause. */
  reach: (id: string) => reaches.through(id, () => api()("GET sequences/[id]/reach", { params: { id } })),
  peekReach: (id: string): ReachAnswer | null => reaches.peek(id),
  /** Every sequence of the workspace (the list's read): the picker's sequences to leads, one cached answer. */
  list: () => sequenceLists.through("all", () => api()("GET sequences")),
  peekList: (): ListAnswer | null => sequenceLists.peek("all"),
  /** Where one lead stands (00459 sequence_place): the lead sheet's Sequence section, as the record files them. */
  place: (leadId: string) => places.through(leadId, () => readPlace(leadId)),
  peekPlace: (leadId: string): PlaceAnswer | null => places.peek(leadId),
  /** An email the owner wrote, read by Ask into lines on how they write, kept in its memory (decision 0078). */
  learnVoice: (text: string) => commitVerb("sequence_voice", { text }),
};

/**
 * A door to a sequence somebody is reaching for (a row of the list under the pointer, a link to one from Leads or Today: the
 * frame's reach, LegacyApp): its record read now, and the tab its address opens on where that tab reads its own, so the
 * press paints them as a person's page paints from People's rows. One the tab holds, read since the last write, reads
 * nothing (read-cache warm), and a read still on its way is shared with the page's (client/api.ts). A door to New (its
 * head's + New) reads the searches its starts are made of, so they draw with New (reach-out/sources.ts).
 */
export function warmSequenceRoute(route: string): void {
  const place = parseSequencesRoute(route);
  if (place?.view === "new") warmSources();
  if (place?.view !== "record") return;
  const { id, tab } = place;
  // A warm never throws: one that fails leaves nothing held, and the page reads as it opens (read-cache warm).
  if (tab === "steps") void warmRecord(id);
  else void records.warm(id, () => readRecord(id));
  if (tab === "people") void peoples.warm(id, () => readPeople(id));
  else if (tab === "history") void histories.warm(id, () => readHistory(id));
}

/**
 * A lead somebody is reaching for (their row under the pointer, the one beside the sheet open): where they stand read now,
 * then the record of the sequence that has them, so their sheet opens whole. One the tab holds, read since the last write,
 * reads nothing, and a read on its way is shared with the sheet's.
 */
export async function warmLeadPlace(leadId: string): Promise<void> {
  const read = places.warm(leadId, () => readPlace(leadId));
  const at = read ? await read.catch(() => null) : places.peek(leadId);
  const id = at && at.ok && at.data ? at.data.sequence.id : null;
  if (id) await records.warm(id, () => readRecord(id))?.catch(() => null);
}

/** Whether a sequence's Steps draws who is in it (steps.tsx usePeopleOf): a step after the first, and no one-off. */
const stepsDrawPeople = (r: RecordAnswer | null): boolean =>
  !!r && r.ok && r.data.sequence.starts !== "date" && r.data.steps.length > 1;

/**
 * A sequence's record read ahead and, where its Steps draws who is in line, who is in it: opening it on its first tab drew
 * the record, then waited again for its people (a local build, 19 Oct 2026: their read left as the record was drawn).
 */
async function warmRecord(id: string): Promise<void> {
  const read = records.warm(id, () => readRecord(id));
  const rec = read ? await read.catch(() => null) : records.peek(id);
  if (stepsDrawPeople(rec)) await peoples.warm(id, () => readPeople(id))?.catch(() => null);
}

/** How many of the list's sequences are read ahead at most, and the breath between two, so none crowds a press. */
const AHEAD_MAX = 12;
const AHEAD_GAP_MS = 120;

/**
 * The list's sequences read ahead, one after another, as People reads the first people it shows once the boot is in
 * (`__warmPeople`): on a phone a row has no pointer to reach it before the press, and a sequence opened read its record
 * then, 480 to 570 ms on a local build and 580 ms to 2.2 s on production (19 Oct 2026). Only those this tab holds nothing
 * of: one it holds paints at once and is read again as it opens. Stops when the tab is put away, or when asked (the answer).
 */
export function warmRecordsAhead(ids: readonly string[]): () => void {
  let stopped = false;
  void (async () => {
    for (const id of ids.slice(0, AHEAD_MAX)) {
      if (stopped || document.visibilityState === "hidden") return;
      if (records.peek(id)) continue;
      await warmRecord(id);
      await new Promise((go) => setTimeout(go, AHEAD_GAP_MS));
    }
  })();
  return () => {
    stopped = true;
  };
}

/**
 * A press through its verb: committed, then said in a toast with the verb's undo where it keeps one, or its refusal in
 * the door's words. True when it landed, so the page reads what it moved.
 */
export async function pressed(
  kind: VerbKind,
  payload: Record<string, unknown>,
  flash: (f: LegacyFlash) => void,
  after: () => void,
): Promise<boolean> {
  const r = await commitVerb(kind, payload);
  if (!r.ok) {
    flash(refusalToast(r));
    return false;
  }
  const kept = r.undo;
  flash({
    tone: "ok",
    msg: r.receipt,
    undo: kept
      ? async () => {
          const u = await undoVerb(kind, kept);
          flash(u.ok ? { tone: "ok", msg: u.receipt } : refusalToast(u));
          after();
        }
      : null,
  });
  after();
  return true;
}
