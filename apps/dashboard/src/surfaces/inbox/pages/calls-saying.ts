/**
 * The calls and the threads whose words say what Conversations' box holds (the strips review, 18 Oct 2026). The rows came
 * with every call's turns and the box looked in them; a list's ended call comes without them now (GET calls answers how
 * many there were), so the box asks the server for the calls that say its words (GET calls?q=, over the call's stored
 * transcript), and a row whose call is among them matches. A thread comes with its newest messages alone now
 * (LIST_MESSAGES_EACH), so the box asks for the threads that say them too (GET conversations?q=, over their messages of
 * the last ninety days). Asked a beat after the last key, once for each words; the answer is the rows' own ids (`cv-<call>`,
 * and a thread's its conversation's).
 */
import { useEffect, useMemo, useState } from "react";
import { read } from "@/legacy-bridge/api";
import { cvOnePerPerson, inChannel } from "../cv-rules";
import type { ConversationRow } from "../types";

/** How long the box waits after a key before it asks. */
const ASK_AFTER_KEY_MS = 250;
/** The fewest letters worth asking about. */
const LEAST_WORDS = 2;

const NONE_FOUND: ReadonlySet<string> = new Set();

/** The rows the server says say the words: the calls' (`cv-<call>`) and the threads'; a read that failed finds none. */
async function rowsSaying(words: string): Promise<Set<string>> {
  const [calls, threads] = await Promise.all([
    read("GET calls", { query: { q: words } }).then(
      (d) => d.calls.map((c) => `cv-${c.id}`),
      (): string[] => [],
    ),
    read("GET conversations", { query: { q: words } }).then(
      (d) => d.conversations.map((c) => c.id),
      (): string[] => [],
    ),
  ]);
  return new Set([...calls, ...threads]);
}

function useRowsSaying(query: string): ReadonlySet<string> {
  const words = query.trim();
  const [found, setFound] = useState<{ words: string; ids: ReadonlySet<string> }>({ words: "", ids: NONE_FOUND });
  useEffect(() => {
    if (words.length < LEAST_WORDS) return undefined;
    let live = true;
    const t = setTimeout(() => {
      void rowsSaying(words).then((ids) => {
        if (live) setFound({ words, ids });
      });
    }, ASK_AFTER_KEY_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [words]);
  return found.words === words ? found.ids : NONE_FOUND;
}

/**
 * The tab's rows the box's words leave, one row per person (cvOnePerPerson): a row matches by its name, its last words, the
 * call's summary, its lines where the row holds them, its messages, or a call or a thread the server says says them. Worked out again
 * when the rows are read anew (each read publishes new ones: kept on a counter only a decision moved, the list and the tabs'
 * counts were the first read's for as long as the page was open, 5 Oct 2026), the tab or the words change.
 */
export function useCvVisible(rows: readonly ConversationRow[], channel: string, query: string): ConversationRow[] {
  const saying = useRowsSaying(query);
  return useMemo(() => {
    let list = rows.filter((c) => inChannel(c, channel));
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (c) =>
          c.who.toLowerCase().includes(q) ||
          c.snippet.toLowerCase().includes(q) ||
          (c.summary && (c.summary.headline + " " + c.summary.bullets.join(" ")).toLowerCase().includes(q)) ||
          (c.transcript || []).some((l) => l.text.toLowerCase().includes(q)) ||
          saying.has(c.id) ||
          (c.messages || []).some((m) => m.text.toLowerCase().includes(q)),
      );
    }
    return cvOnePerPerson(list);
  }, [rows, channel, query, saying]);
}
