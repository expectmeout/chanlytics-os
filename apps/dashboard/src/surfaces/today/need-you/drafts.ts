/**
 * Ask's drafts on Today's rows (decision 0071, E2): what each waiting thread's row offers to send, read from what Ask kept
 * (GET conversations/drafts) and asked for where none answers their newest message (POST conversations/[id]/draft), a few
 * at a time. Held in the tab by the thread and the kind, with the message it answers, so a row drawn again reads it at
 * once, a draft a teammate's tab wrote is read and never written twice, and a new message from them asks for a new one.
 *
 * A member who acts asks for the drafts that are missing; anyone else reads what was kept, and a row with none says so.
 */
import { useSyncExternalStore } from "react";
import {
  NEED_YOU_WORDS,
  REPLY_DRAFTS_IDS_MAX,
  draftHasWords,
  draftIsCurrent,
  type ReplyDraftDto,
  type ReplyDraftKind,
} from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";

/** A thread's draft as a row draws it. */
type DraftState =
  | { state: "writing" }
  | { state: "ready"; draft: ReplyDraftDto }
  | { state: "asks"; question: string }
  | { state: "none" }
  | { state: "failed"; why: string };

/** A draft a row wants: its thread, its kind, and their newest message, which the draft must answer. */
export interface DraftWant {
  conversationId: string;
  kind: ReplyDraftKind;
  forMessageId: string | null;
}

/** How many drafts are written at once: each is a model call, and the rows wait their turn. */
const WRITING_AT_ONCE = 2;

const draftKeyOf = (w: Pick<DraftWant, "conversationId" | "kind">) => `${w.conversationId}:${w.kind}`;

/** Each draft as it stands, with the message it was asked for, so a newer one asks again. */
const draftsHeld = new Map<string, { s: DraftState; forMessageId: string | null }>();
const draftHearers = new Set<() => void>();
const tellDrafts = () => draftHearers.forEach((l) => l());

/** The drafts waiting their turn to be written, and how many are being written now. */
const draftQueue: DraftWant[] = [];
let writing = 0;

function set(w: DraftWant, s: DraftState) {
  draftsHeld.set(draftKeyOf(w), { s, forMessageId: w.forMessageId });
  tellDrafts();
}

/** A kept draft as the row draws it: its words, or the question Ask could not answer from the facts. */
function draftStateOf(d: ReplyDraftDto): DraftState {
  if (draftHasWords(d)) return { state: "ready", draft: d };
  const q = d.words.asks[0];
  return q ? { state: "asks", question: q } : { state: "failed", why: NEED_YOU_WORDS.couldNot };
}

/** Write the next draft waiting, while fewer than WRITING_AT_ONCE are being written. */
function writeNext() {
  while (writing < WRITING_AT_ONCE && draftQueue.length) {
    const w = draftQueue.shift();
    if (!w) return;
    writing += 1;
    void api()("POST conversations/[id]/draft", {
      params: { id: w.conversationId },
      body: { kind: w.kind },
      refresh: false,
    })
      .then((r) => set(w, r.ok ? draftStateOf(r.data) : { state: "failed", why: r.message || NEED_YOU_WORDS.couldNot }))
      .catch(() => set(w, { state: "failed", why: NEED_YOU_WORDS.couldNot }))
      .finally(() => {
        writing -= 1;
        writeNext();
      });
  }
}

/** Whether the tab already holds this draft, for the message the row names. */
function holds(w: DraftWant): boolean {
  const h = draftsHeld.get(draftKeyOf(w));
  return !!h && h.forMessageId === w.forMessageId;
}

/**
 * The drafts these rows want: what was kept is read in one request; what is missing, or answers an older message, is
 * written (`mayWrite`: a member who acts) or said to be none. Drafts the tab holds for the same message are left alone.
 */
export async function wantDrafts(wants: readonly DraftWant[], mayWrite: boolean): Promise<void> {
  const fresh = wants.filter((w) => !holds(w)).slice(0, REPLY_DRAFTS_IDS_MAX);
  if (!fresh.length) return;
  for (const w of fresh) set(w, { state: "writing" });
  const ids = [...new Set(fresh.map((w) => w.conversationId))];
  const read = await api()("GET conversations/drafts", { query: { ids: ids.join(",") } }).catch(() => null);
  const kept = read && read.ok ? read.data.drafts : [];
  for (const w of fresh) {
    const d = kept.find((k) => k.conversation_id === w.conversationId && k.kind === w.kind);
    if (d && draftIsCurrent(d, w.forMessageId)) set(w, draftStateOf(d));
    else if (mayWrite) draftQueue.push(w);
    else set(w, { state: "none" });
  }
  writeNext();
}

const hearDrafts = (on: () => void) => {
  draftHearers.add(on);
  return () => draftHearers.delete(on);
};

/** A row's draft as it stands, drawn again as it changes; nothing while the row wants none. */
export function useDraft(w: DraftWant | null): DraftState | null {
  return useSyncExternalStore(
    hearDrafts,
    () => (w ? (draftsHeld.get(draftKeyOf(w))?.s ?? null) : null),
    () => null,
  );
}

/** What the section's one line counts: the drafts ready and being written, of the rows it draws. */
export function useDraftCounts(wants: readonly DraftWant[]): { replies: number; briefs: number; writing: number } {
  const snapshot = useSyncExternalStore(
    hearDrafts,
    () => wants.map((w) => draftsHeld.get(draftKeyOf(w))?.s.state ?? "").join(","),
    () => "",
  );
  const states = snapshot.split(",");
  let replies = 0;
  let briefs = 0;
  let writingNow = 0;
  states.forEach((s, i) => {
    if (s === "writing") writingNow += 1;
    else if (s === "ready" && wants[i]?.kind === "brief") briefs += 1;
    else if (s === "ready") replies += 1;
  });
  return { replies, briefs, writing: writingNow };
}
