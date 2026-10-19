/**
 * The Sequences page's reads of one sequence and its presses (decision 0060). A record, who is in it and what it sent are
 * read through the typed client: a record opened again paints from the last answer this tab holds and is read again
 * behind (read-cache.ts: in memory, per workspace, emptied by any write); a refusal is never kept. Every press is a verb
 * (contracts PROPOSAL_SPECS, committed through the one walk, legacy-bridge/verbs): the sequence's own (`sequence_step`,
 * `sequence_step_remove`, `sequence_words`, `sequence_leave`), a sequence's state as a campaign's (`playbook_change`) and a
 * batch's approval as a run's (`run`), so the receipt and the undo are the ones Ask's card would say. `pressed` says what
 * landed, in a toast with its undo where the verb keeps one.
 */
import type { VerbKind } from "@chanlytics/contracts";
import type { ApiResult, Output } from "@/client/api";
import { api } from "@/legacy-bridge/api";
import { readCache } from "@/legacy-bridge/read-cache";
import { commitVerb, undoVerb } from "@/legacy-bridge/verbs/commit";
import { refusalToast } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";

type RecordAnswer = ApiResult<Output<"GET sequences/[id]">>;
type PeopleAnswer = ApiResult<Output<"GET sequences/[id]/people">>;
type HistoryAnswer = ApiResult<Output<"GET sequences/[id]/history">>;
type ReachAnswer = ApiResult<Output<"GET sequences/[id]/reach">>;
type ListAnswer = ApiResult<Output<"GET sequences">>;
type PlaceAnswer = ApiResult<Output<"GET leads/[id]/place">>;

const records = readCache<RecordAnswer>("sequence", (r) => r.ok);
const peoples = readCache<PeopleAnswer>("sequence_people", (r) => r.ok);
const histories = readCache<HistoryAnswer>("sequence_history", (r) => r.ok);
const reaches = readCache<ReachAnswer>("sequence_reach", (r) => r.ok);
const sequenceLists = readCache<ListAnswer>("sequence_list", (r) => r.ok);
const places = readCache<PlaceAnswer>("lead_place", (r) => r.ok);

export const sequenceVerbs = {
  /** One sequence: its row, its steps, who approves its batches. */
  record: (id: string) => records.through(id, () => api()("GET sequences/[id]", { params: { id } })),
  peekRecord: (id: string): RecordAnswer | null => records.peek(id),
  /** Who is in it, by where they stand. */
  people: (id: string) => peoples.through(id, () => api()("GET sequences/[id]/people", { params: { id } })),
  peekPeople: (id: string): PeopleAnswer | null => peoples.peek(id),
  /** What it sent, newest first; `before` pages back. The first page is kept, a page further back never. */
  history: (id: string, before?: string) =>
    before
      ? api()("GET sequences/[id]/history", { params: { id }, query: { before } })
      : histories.through(id, () => api()("GET sequences/[id]/history", { params: { id } })),
  peekHistory: (id: string): HistoryAnswer | null => histories.peek(id),
  /** What Turn on asks with beside the record: who its next run reaches, a run's most, the workspace's pause. */
  reach: (id: string) => reaches.through(id, () => api()("GET sequences/[id]/reach", { params: { id } })),
  peekReach: (id: string): ReachAnswer | null => reaches.peek(id),
  /** Every sequence of the workspace (the list's read): the picker's sequences to leads, one cached answer. */
  list: () => sequenceLists.through("all", () => api()("GET sequences")),
  peekList: (): ListAnswer | null => sequenceLists.peek("all"),
  /** Where one lead stands (00459 sequence_place): the lead sheet's Sequence section, as the record files them. */
  place: (leadId: string) => places.through(leadId, () => api()("GET leads/[id]/place", { params: { id: leadId } })),
  peekPlace: (leadId: string): PlaceAnswer | null => places.peek(leadId),
};

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
