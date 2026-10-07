import "server-only";
import { DAY_MS, callerName, personName } from "@chanlytics/contracts";
import {
  callersOf,
  messageSenders,
  namesOfPeople,
  searchMessages,
  type MessageHit,
  type MessageSender,
} from "@chanlytics/db";
import { stamp, type Reader, type RowRef } from "./index";

/** The most characters of words a search is handed: search_messages' work grows with the words' length (00219). */
const SEARCH_WORDS_MAX = 200;
/** The days a search reads back from the turn's clock when none is asked, and the most it reads. */
const WINDOW_DAYS = 30;
const WINDOW_DAYS_MAX = 90;
/** The most hits search_messages answers (00219: least(greatest(p_limit, 1), 50)). */
const HITS_MAX = 50;

/** One hit, named, with what became of a message and the row a citation of it names. */
interface SaidHit extends MessageHit {
  /** Who it is with, as the pages name them: a message's person by personName, a call by callerName. */
  who: string;
  /** A message's sender, status and kind, which the search does not answer; null for a call. */
  sent: MessageSender | null;
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
 * Bounded three ways: the words trimmed and cut at SEARCH_WORDS_MAX characters, counted as characters (code points),
 * never halving one the database would refuse; the window `days` back from the turn's clock, WINDOW_DAYS unless asked
 * and WINDOW_DAYS_MAX at most; the hits at the caller's cap, held to the function's own fifty.
 *
 * Then three reads by the hits' ids, at once, each one bounded read (packages/db): the people's names
 * (namesOfPeople), the messages' sender, status and kind (messageSenders), and the calls' lines (callersOf). A message
 * is named as the pages name its person (personName), and a hit with nobody on file as the Inbox names one; a call as
 * every call surface names it (callerName: the person, else the number the phone showed, else "Caller ID withheld").
 * A hit whose row that second read no longer answers -- erased, or gone between the two reads -- is left out. A
 * message is a row of its thread, cited and opened as the Inbox's row is (inbox/th-<conversation>); a call found by its
 * transcript is the call, opened as the Calls page opens it (conversations/cv-<id>).
 */
export const messageSearch: Reader<
  { words: string; days: number | null; limit: number },
  { words: string; days: number; hits: SaidHit[] }
> = {
  name: "messageSearch",
  async read(rc, { words, days, limit }) {
    const said = Array.from(words.trim()).slice(0, SEARCH_WORDS_MAX).join("");
    const window = heldTo(days, 1, WINDOW_DAYS_MAX, WINDOW_DAYS);
    const since = new Date(rc.now.getTime() - window * DAY_MS);
    const db = rc.ctx.supabase;
    const found = await searchMessages(db, rc.tenantId, said, since, heldTo(limit, 1, HITS_MAX, HITS_MAX));
    const people = [...new Set(found.flatMap((h) => (h.contactId ? [h.contactId] : [])))];
    const messages = found.filter((h) => h.kind === "message").map((h) => h.id);
    const calls = found.filter((h) => h.kind === "call").map((h) => h.id);
    const [names, senders, lines] = await Promise.all([
      people.length ? namesOfPeople(db, rc.tenantId, people) : [],
      messages.length ? messageSenders(db, rc.tenantId, messages) : [],
      calls.length ? callersOf(db, rc.tenantId, calls) : [],
    ]);
    const named = new Map(names.map((p) => [p.id, p]));
    const sent = new Map(senders.map((m) => [m.id, m]));
    const line = new Map(lines.map((c) => [c.id, c]));
    const hits = found.flatMap((h): SaidHit[] => {
      const person = h.contactId ? (named.get(h.contactId) ?? null) : null;
      if (h.kind === "call") {
        const c = line.get(h.id);
        if (!c) return [];
        const who = callerName({ from_e164: c.from_e164, from_raw: c.from_raw, contact: person });
        return [
          { ...h, who, sent: null, ref: { kind: "call", id: h.id, route: `conversations/cv-${h.id}`, label: who } },
        ];
      }
      const m = sent.get(h.id);
      if (!m) return [];
      const who = personName(person);
      const ref: RowRef | null = h.conversationId
        ? { kind: "thread", id: h.conversationId, route: `inbox/th-${h.conversationId}`, label: who }
        : null;
      return [{ ...h, who, sent: m, ref }];
    });
    // A thread two of its messages matched is one row.
    const rows = [
      ...new Map(hits.flatMap((h) => (h.ref ? [[`${h.ref.kind}:${h.ref.id}`, h.ref] as const] : []))).values(),
    ];
    return { data: { words: said, days: window, hits }, rows, stamp: stamp() };
  },
};
