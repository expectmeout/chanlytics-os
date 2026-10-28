/**
 * Ask's drafts on Today's rows (decision 0071, E2): what each waiting thread's row offers to send, read from what Ask kept
 * (GET conversations/drafts) and asked for where none answers their newest message (POST conversations/[id]/draft), a few
 * at a time. Held in the tab by the thread and the kind, with the message it answers, so a row drawn again reads it at
 * once, a draft a teammate's tab wrote is read and never written twice, and a new message from them asks for a new one.
 * The workspace's newest kept drafts come with Today's own first reads (drafts-surface.ts), so a row draws with its words
 * from its first frame; only one whose draft is not among them is read by its thread.
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
import { onSurfaceMoved } from "@/legacy-bridge/surface-status";
import { surfaceValue } from "../../surface-values";
import type { ReplyDraftsSurface } from "./drafts-surface";

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

/** Ask writing a draft, and a row with none and nobody to write it: one object each, as a store's snapshot must be. */
const WRITING: DraftState = { state: "writing" };
const NO_DRAFT: DraftState = { state: "none" };

/** The kept draft that still answers this row, among the workspace's newest that came with Today's first reads. */
function keptDraftOf(held: ReplyDraftsSurface | undefined, w: DraftWant): ReplyDraftDto | undefined {
  return held?.drafts.find(
    (d) => d.conversation_id === w.conversationId && d.kind === w.kind && draftIsCurrent(d, w.forMessageId),
  );
}

/** A kept draft's state, one object per draft, so a row reading it twice reads the same one (useDraft's snapshot). */
const keptStates = new WeakMap<ReplyDraftDto, DraftState>();
function keptStateOf(d: ReplyDraftDto): DraftState {
  let s = keptStates.get(d);
  if (!s) keptStates.set(d, (s = draftStateOf(d)));
  return s;
}

/**
 * A row's draft before the tab has asked for it: the kept one that answers it, else, where the newest came whole (all
 * the workspace keeps), Ask writing it for a member who acts and none for anyone else, as wantDrafts will say a moment
 * later; else not known yet (its thread's read is still to come).
 */
function beforeAsked(w: DraftWant, may: boolean): DraftState | null {
  const held = surfaceValue("reply_drafts");
  const kept = keptDraftOf(held, w);
  if (kept) return keptStateOf(kept);
  if (!held?.complete) return null;
  return may ? WRITING : NO_DRAFT;
}

/** A missing draft: written by a member who acts, in turn; none for anyone else. */
function missing(w: DraftWant, mayWrite: boolean) {
  if (!mayWrite) return set(w, NO_DRAFT);
  set(w, WRITING);
  draftQueue.push(w);
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
      // The drafts Today read with its own, read again behind it (refresh-map.ts), so a reload draws these words at once; and
      // nothing else a page reads moves with a draft, so the reads shared in flight are kept.
      refresh: "behind",
      keepsReads: true,
    })
      .then((r) => set(w, r.ok ? draftStateOf(r.data) : { state: "failed", why: r.message || NEED_YOU_WORDS.couldNot }))
      .catch(() => set(w, { state: "failed", why: NEED_YOU_WORDS.couldNot }))
      .finally(() => {
        writing -= 1;
        writeNext();
      });
  }
}

/**
 * What the tab holds of this draft, where it was asked for the message the row names: one for an older message answers
 * less than the row shows, and the row drew its words until the new one came.
 */
function heldDraftOf(w: DraftWant): DraftState | undefined {
  const h = draftsHeld.get(draftKeyOf(w));
  return h && h.forMessageId === w.forMessageId ? h.s : undefined;
}

/** Whether the tab already holds this draft, for the message the row names. */
function holds(w: DraftWant): boolean {
  return heldDraftOf(w) !== undefined;
}

/**
 * The drafts these rows want: the kept ones that came with Today's first reads (drafts-surface.ts) are taken as they are;
 * where those were all the workspace keeps, the rest are missing; else what was kept on the rest is read in one request.
 * What is missing, or answers an older message, is written (`mayWrite`: a member who acts) or said to be none. Drafts the
 * tab holds for the same message are left alone.
 */
export async function wantDrafts(wants: readonly DraftWant[], mayWrite: boolean): Promise<void> {
  const fresh = wants.filter((w) => !holds(w)).slice(0, REPLY_DRAFTS_IDS_MAX);
  if (!fresh.length) return;
  const held = surfaceValue("reply_drafts");
  const unread: DraftWant[] = [];
  for (const w of fresh) {
    const d = keptDraftOf(held, w);
    if (d) set(w, keptStateOf(d));
    else if (held?.complete) missing(w, mayWrite);
    else unread.push(w);
  }
  if (unread.length) {
    for (const w of unread) set(w, WRITING);
    const ids = [...new Set(unread.map((w) => w.conversationId))];
    const read = await api()("GET conversations/drafts", { query: { ids: ids.join(",") } }).catch(() => null);
    const kept = read && read.ok ? read.data.drafts : [];
    for (const w of unread) {
      const d = kept.find((k) => k.conversation_id === w.conversationId && k.kind === w.kind);
      if (d && draftIsCurrent(d, w.forMessageId)) set(w, draftStateOf(d));
      else missing(w, mayWrite);
    }
  }
  writeNext();
}

/** Heard as a draft changes in the tab, and as the kept ones Today read come in or are read again. */
const hearDrafts = (on: () => void) => {
  draftHearers.add(on);
  const unhear = onSurfaceMoved(["reply_drafts"], on);
  return () => {
    draftHearers.delete(on);
    unhear();
  };
};

/**
 * A row's draft as it stands, drawn again as it changes; nothing while the row wants none. Before the tab has asked for
 * it, the kept one or what asking will say (beforeAsked), so a row draws with its words, or with Ask writing them, from its
 * first frame: `may`, whether this member acts (the row's own), decides between writing and none.
 */
export function useDraft(w: DraftWant | null, may: boolean): DraftState | null {
  return useSyncExternalStore(
    hearDrafts,
    () => (w ? (heldDraftOf(w) ?? beforeAsked(w, may)) : null),
    () => null,
  );
}

/**
 * What the section's one line counts: the drafts ready and being written, of the rows it draws, as the rows draw them
 * from their first frame (useDraft), so the line stands with the rows rather than a moment after.
 */
export function useDraftCounts(
  wants: readonly DraftWant[],
  may: boolean,
): { replies: number; briefs: number; writing: number } {
  const snapshot = useSyncExternalStore(
    hearDrafts,
    () => wants.map((w) => (heldDraftOf(w) ?? beforeAsked(w, may))?.state ?? "").join(","),
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
