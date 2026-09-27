import "server-only";
import { DAY_MS, personName } from "@chanlytics/contracts";
import { namesOfPeople, searchMessages, type MessageHit } from "@chanlytics/db";
import { stamp, type Reader, type RowRef } from "./index";

/** The most characters of words a search is handed: search_messages' work grows with the words' length (00219). */
const SEARCH_WORDS_MAX = 200;
/** The days a search reads back from the turn's clock when none is asked, and the most it reads. */
const WINDOW_DAYS = 30;
const WINDOW_DAYS_MAX = 90;
/** The most hits search_messages answers (00219: least(greatest(p_limit, 1), 50)). */
const HITS_MAX = 50;

/** One hit, named, with the row a citation of it names. */
interface SaidHit extends MessageHit {
  /** Who it is with, as the pages name them. */
  who: string;
  /** Its thread for a message, the call for a call; null for a message with no thread, which 00219 never answers. */
  ref: RowRef | null;
}

/** A number held to [lo, hi], or `absent` when it is none. */
const heldTo = (n: number | null, lo: number, hi: number, absent: number): number =>
  n === null || !Number.isFinite(n) ? absent : Math.min(hi, Math.max(lo, Math.round(n)));

/**
 * What was said, found (Ask Rewired, Phase 4: D6, D12): the workspace's messages and call transcripts that hold the
 * words, newest first, through search_messages (00219), which runs as the member, so RLS decides what it answers, as
 * it decides every other read of those rows. No page reads it; Ask's inbox.search is its reader.
 *
 * Bounded three ways: the words trimmed and cut at SEARCH_WORDS_MAX characters; the window `days` back from the turn's
 * clock, WINDOW_DAYS unless asked and WINDOW_DAYS_MAX at most; the hits at the caller's cap, held to the function's own
 * fifty. Each hit is named as the pages name its person (personName), the names read once for every hit's person
 * (namesOfPeople); a hit with no person, or with one the member cannot read, is named as the Inbox names a thread with
 * nobody on file. A message is a row of its thread, cited and opened as the Inbox's row is (inbox/th-<conversation>); a
 * call found by its transcript is the call, opened as the Calls page opens it (conversations/cv-<id>).
 */
export const messageSearch: Reader<
  { words: string; days: number | null; limit: number },
  { words: string; days: number; hits: SaidHit[] }
> = {
  name: "messageSearch",
  async read(rc, { words, days, limit }) {
    const said = words.trim().slice(0, SEARCH_WORDS_MAX);
    const window = heldTo(days, 1, WINDOW_DAYS_MAX, WINDOW_DAYS);
    const since = new Date(rc.now.getTime() - window * DAY_MS);
    const found = await searchMessages(rc.ctx.supabase, rc.tenantId, said, since, heldTo(limit, 1, HITS_MAX, HITS_MAX));
    const ids = [...new Set(found.flatMap((h) => (h.contactId ? [h.contactId] : [])))];
    const named = new Map(
      (ids.length ? await namesOfPeople(rc.ctx.supabase, rc.tenantId, ids) : []).map((p) => [p.id, p]),
    );
    const hits = found.map((h): SaidHit => {
      const who = personName(h.contactId ? named.get(h.contactId) : null);
      const ref: RowRef | null =
        h.kind === "call"
          ? { kind: "call", id: h.id, route: `conversations/cv-${h.id}`, label: who }
          : h.conversationId
            ? { kind: "thread", id: h.conversationId, route: `inbox/th-${h.conversationId}`, label: who }
            : null;
      return { ...h, who, ref };
    });
    // A thread two of its messages matched is one row.
    const rows = [
      ...new Map(hits.flatMap((h) => (h.ref ? [[`${h.ref.kind}:${h.ref.id}`, h.ref] as const] : []))).values(),
    ];
    return { data: { words: said, days: window, hits }, rows, stamp: stamp() };
  },
};
