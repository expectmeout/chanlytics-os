/**
 * A thread's draft as every page reads it (decision 0093): written when its hold owes one, on the server, with nobody on a
 * page, and read here. The workspace's newest kept drafts come with a page's own first reads and are heard as they land
 * (drafts-surface.ts), so a row draws with its words from its first frame; a thread whose draft is not among them is read by
 * itself. Today's rows, the Inbox's rows and its reply box read one answer of one row (contracts draftViewOf).
 *
 * Nothing here writes a first draft. A member's change (Rewrite, Change it with Ask) and their Try again go through the
 * edge's door, and what it answers stands until the feed brings the same row back.
 */
import { useSyncExternalStore } from "react";
import {
  NEED_YOU_WORDS,
  REPLY_DRAFTS_IDS_MAX,
  draftViewOf,
  type ReplyDraftDto,
  type ReplyDraftKind,
  type ReplyDraftView,
} from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import { onSurfaceMoved } from "@/bridge/surface-status";
import { surfaceValue } from "../../surface-values";

/**
 * A draft a row wants: its thread, its kind, their newest message, which the draft must answer, whether one is owed here,
 * and when they wrote it, so a draft that never came stops being said to be on its way.
 */
export interface DraftWant {
  conversationId: string;
  kind: ReplyDraftKind;
  forMessageId: string | null;
  expected: boolean;
  askedAtMs: number | null;
}

const draftKeyOf = (w: Pick<DraftWant, "conversationId" | "kind">) => `${w.conversationId}:${w.kind}`;

/** Rows this tab holds apart from the newest: read by their thread, or answered by the edge's door. */
const heldRows = new Map<string, ReplyDraftDto>();
/** Threads whose own read was asked, for their message: once, whatever it found. */
const askedRows = new Set<string>();
/** Drafts a member is having written again, this moment: every row that reads one says so. */
const rewriting = new Set<string>();
const draftHearers = new Set<() => void>();
const tellDrafts = () => draftHearers.forEach((l) => l());

/** The kept row for a want: the newest of what the page read with its own and what this tab was answered. */
function keptOf(w: Pick<DraftWant, "conversationId" | "kind">): ReplyDraftDto | undefined {
  const newest = surfaceValue("reply_drafts")?.drafts.find(
    (d) => d.conversation_id === w.conversationId && d.kind === w.kind,
  );
  const held = heldRows.get(draftKeyOf(w));
  if (!newest || !held) return newest ?? held;
  return Date.parse(held.made_at) > Date.parse(newest.made_at) ? held : newest;
}

/** One answer an answer, so a store's snapshot reads the same object until it says something else. */
const views = new Map<string, { said: string; view: ReplyDraftView }>();

/** A thread's draft now: what every row draws, and what a row with no hook of its own asks. */
export function draftViewNow(w: DraftWant): ReplyDraftView {
  const key = draftKeyOf(w);
  const kept = keptOf(w);
  const view: ReplyDraftView = rewriting.has(key)
    ? { state: "writing" }
    : draftViewOf(kept, {
        forMessageId: w.forMessageId,
        expected: w.expected,
        askedAtMs: w.askedAtMs,
        nowMs: Date.now(),
      });
  const said = `${view.state}:${kept?.made_at ?? ""}:${kept?.for_message_id ?? ""}:${w.forMessageId ?? ""}`;
  const had = views.get(key);
  if (had && had.said === said) return had.view;
  views.set(key, { said, view });
  return view;
}

/**
 * The call the drafts make (POST conversations/[id]/draft): a member's change, or their Try again, kept by the edge on the
 * row every page hears. The reads shared in flight are kept: nothing else a page reads moves with a draft.
 */
const postDraft = (w: Pick<DraftWant, "conversationId" | "kind">, instruction?: string, given?: string) =>
  api()("POST conversations/[id]/draft", {
    params: { id: w.conversationId },
    body: { kind: w.kind, ...(instruction ? { instruction } : {}), ...(instruction && given?.trim() ? { given } : {}) },
    refresh: "behind",
    keepsReads: true,
  });

/**
 * The edge asked, with the row saying it is being written while it answers. Refused, the row says what it said before, and
 * the refusal is answered for the page to say.
 */
async function askAgain(
  w: Pick<DraftWant, "conversationId" | "kind">,
  instruction?: string,
  given?: string,
): Promise<{ ok: true; words: string } | { ok: false; why: string }> {
  const key = draftKeyOf(w);
  rewriting.add(key);
  tellDrafts();
  const r = await postDraft(w, instruction, given).catch(() => null);
  rewriting.delete(key);
  if (r && r.ok) heldRows.set(key, r.data);
  tellDrafts();
  if (r && r.ok) return { ok: true, words: r.data.words.text };
  return { ok: false, why: (r && !r.ok && r.message) || NEED_YOU_WORDS.couldNot };
}

/** What is said to Ask about a draft, with the words on the screen: the new words stand in every row that reads it. */
export const rewriteDraft = (w: Pick<DraftWant, "conversationId" | "kind">, instruction: string, given?: string) =>
  askAgain(w, instruction, given);

/** A draft that could not be written, asked for again. */
export const tryDraftAgain = (w: Pick<DraftWant, "conversationId" | "kind">) => askAgain(w);

/**
 * The drafts these rows want, read where the workspace's newest did not hold them and were not all it keeps: one request,
 * once a thread. A thread with none reads none, and the feed tells of it when one lands.
 */
export async function wantDrafts(wants: readonly DraftWant[]): Promise<void> {
  if (surfaceValue("reply_drafts")?.complete) return;
  const askedKey = (w: DraftWant) => `${draftKeyOf(w)}:${w.forMessageId ?? ""}`;
  const unread = wants.filter((w) => !keptOf(w) && !askedRows.has(askedKey(w))).slice(0, REPLY_DRAFTS_IDS_MAX);
  if (!unread.length) return;
  for (const w of unread) askedRows.add(askedKey(w));
  const ids = [...new Set(unread.map((w) => w.conversationId))];
  const read = await api()("GET conversations/drafts", { query: { ids: ids.join(",") } }).catch(() => null);
  if (!read || !read.ok || !Array.isArray(read.data.drafts)) return;
  for (const d of read.data.drafts) heldRows.set(draftKeyOf({ conversationId: d.conversation_id, kind: d.kind }), d);
  tellDrafts();
}

/** Heard as a draft changes in the tab, and as the kept ones a page read come in or are read again. */
const hearDrafts = (on: () => void) => {
  draftHearers.add(on);
  const unhear = onSurfaceMoved(["reply_drafts"], on);
  return () => {
    draftHearers.delete(on);
    unhear();
  };
};

/** A row's draft as it stands, drawn again as it changes; nothing while the row wants none. */
export function useDraft(w: DraftWant | null): ReplyDraftView | null {
  return useSyncExternalStore(
    hearDrafts,
    () => (w ? draftViewNow(w) : null),
    () => null,
  );
}

/** Drawn again as any draft lands, for a list whose rows read theirs without a hook each (draftViewNow). */
let moved = 0;
const countMoved = (on: () => void) =>
  hearDrafts(() => {
    moved += 1;
    on();
  });
export function useDraftsMoved(): number {
  return useSyncExternalStore(
    countMoved,
    () => moved,
    () => 0,
  );
}

/**
 * What the section's one line counts: the drafts ready and being written, of the rows it draws, as the rows draw them from
 * their first frame (useDraft), so the line stands with the rows rather than a moment after.
 */
export function useDraftCounts(wants: readonly DraftWant[]): { replies: number; briefs: number; writing: number } {
  const snapshot = useSyncExternalStore(
    hearDrafts,
    () => wants.map((w) => draftViewNow(w).state).join(","),
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
