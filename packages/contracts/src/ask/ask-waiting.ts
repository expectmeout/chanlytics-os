/**
 * Who needs you right now, as Ask says it (moved out of ask-answer.ts, which stood at its 800 lines): the people Today's
 * queue draws as holds, how many more wait past them (the one count's holds and replies counting down), the campaign runs
 * waiting for a word that can still send them, the searches waiting for an answer, and the reply windows closing, which
 * are said as windows and never as someone who needs you (the wiring's second audit, S7-8 and W-thread-wait-step-4).
 */
import type { AskLanguage } from "./ask-language";
import { runsWaitingSentence } from "../shell/campaign-rooms";

/** One person on Today's queue, as Ask draws them: a hold, or a thread whose reply window is closing. */
interface AskWaitingRow {
  id: string;
  kind: "thread" | "call";
  who: string;
  channel: string;
  when: string;
  line: string;
  to: string;
}

/**
 * Who is waiting, as Today's queue draws them (TodayVM.queue.rows, six at most): the holds (`people`), how many more
 * wait past those (the holds and the replies counting down that the queue does not draw), the runs waiting for a yes,
 * the searches waiting for an answer, and the reply windows closing. Null is a queue not read yet: nobody is claimed to
 * be waiting.
 */
export interface AskWaiting {
  people: AskWaitingRow[];
  /** Holds and replies counting down past the rows the queue draws: who else needs you. */
  more: number;
  /** A run's reach is the people it would send to. */
  runs: Array<{ id: string; label: string; reach: number; to: string }>;
  /** Searches that stopped to ask, waiting on the owner (Today's queue's search rows). */
  searches: Array<{ id: string; name: string; question: string; to: string }>;
  /** Reply windows closing, in the people's row shape: said as windows, never as someone who needs you. */
  windows: AskWaitingRow[];
}

/** Up to two names, then how many others: "Ana, Sam and 3 others"; a count alone when fewer names are drawn. */
const names = (list: string[], total: number, es: boolean) => {
  if (total <= 2 && list.length === total) return list.join(es ? " y " : " and ");
  const [a, b] = list;
  if (a === undefined || b === undefined)
    return es ? `${total} ${total === 1 ? "persona" : "personas"}` : `${total} ${total === 1 ? "person" : "people"}`;
  const rest = total - 2;
  return es ? `${a}, ${b} y ${rest} más` : `${a}, ${b} and ${rest} ${rest === 1 ? "other" : "others"}`;
};

/** Words a person reads when the queue has not been read: nobody is claimed to be waiting. */
const unreadQueueWords = (es: boolean) =>
  es ? "La cola de hoy aún no se ha leído." : "Today's queue hasn't been read yet.";

/** The runs clause, in the words Today's head and the Inbox's band say (runsWaitingSentence), as a clause. */
function runsClause(n: number, es: boolean): string {
  if (!n) return "";
  if (es) return `${n === 1 ? "un envío de campaña espera" : `${n} envíos de campaña esperan`} tu decisión`;
  const sentence = runsWaitingSentence(n);
  return `${sentence.charAt(0).toLowerCase()}${sentence.slice(1, -1)}`;
}

/** One search is named, since its question is the thing waiting; several are only counted, like the runs. */
function searchesClause(w: AskWaiting, es: boolean): string {
  const k = w.searches.length;
  const [one] = w.searches;
  if (!k) return "";
  if (k === 1 && one)
    return es
      ? `tu búsqueda de ${one.name} espera tu respuesta`
      : `your search for ${one.name} is waiting for your answer`;
  return es ? `${k} búsquedas esperan tu respuesta` : `${k} searches are waiting for your answer`;
}

/** One closing window names its person; several are counted. Never "needs you": nobody asked for a person. */
function windowsClause(w: AskWaiting, es: boolean): string {
  const n = w.windows.length;
  const [one] = w.windows;
  if (!n) return "";
  if (n === 1 && one)
    return es ? `la ventana de respuesta de ${one.who} se está cerrando` : `${one.who}'s reply window is closing`;
  return es ? `${n} ventanas de respuesta se están cerrando` : `${n} reply windows are closing`;
}

/**
 * Right now, in a sentence: the people waiting, then the runs waiting for a yes, then the searches waiting for an
 * answer, then the reply windows closing -- four populations, four clauses. "Nobody needs you" only over none of them.
 */
export function rightNowLine(w: AskWaiting | null, language: AskLanguage): string {
  const es = language === "es";
  if (!w) return unreadQueueWords(es);
  const who = w.people.map((p) => p.who);
  const total = who.length + w.more;
  const people = total
    ? es
      ? `${names(who, total, true)} ${total === 1 ? "te espera" : "te esperan"}`
      : `${names(who, total, false)} ${total === 1 ? "needs" : "need"} you`
    : "";
  const clauses = [people, runsClause(w.runs.length, es), searchesClause(w, es), windowsClause(w, es)].filter(Boolean);
  if (!clauses.length) return es ? "Nadie te espera ahora mismo." : "Nobody needs you right now.";
  const s = clauses.join("; ");
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}

/**
 * The counts rightNowLine's sentence is built from, so pills beside it never disagree: people waiting (drawn and past
 * the rows), runs waiting, searches waiting and reply windows closing.
 */
export function rightNowCounts(w: AskWaiting | null): {
  people: number;
  runs: number;
  searches: number;
  windows: number;
} {
  return w
    ? { people: w.people.length + w.more, runs: w.runs.length, searches: w.searches.length, windows: w.windows.length }
    : { people: 0, runs: 0, searches: 0, windows: 0 };
}
