/**
 * Conversations' pick: the rows chosen for one act over all of them, and what stands over the list while any is. The
 * parts and the acts are the pick's own (pick.tsx), which the Inbox's list draws too; this holds the state they need
 * here and says what a Conversations row is to them (cv-rules.ts cvPicked).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cvPicked, cvWhose } from "../cv-rules";
import { demoSession, type Flash } from "../shell";
import { inboxData } from "../store";
import type { ConversationRow, Picked } from "../types";
import { pickArchiveAsk, pickBar, pickMark, pickRun } from "./pick";

/** The pick, as the list draws it: who can be picked, who is, and what stands over the rows while anyone is. */
export interface CvPick {
  /** A row as a pick reads it; null for one that wears no box. */
  of: (c: ConversationRow) => Picked | null;
  /** The names of the rows picked that the tab still holds. */
  selected: string[];
  toggle: (name: string) => void;
  clear: () => void;
  bar: ReactNode;
  ask: ReactNode;
}

/**
 * The pick's state and its acts, over the tab's people. A pick is held by whose the row is (cvWhose), so a read that
 * gives a person a newer row keeps them picked; it lasts through a search and ends with the tab. `unread` is the
 * page's own word for whether a row is new to the reader now (surfaces/seen.ts).
 */
export const useCvPick = (p: {
  /** The tab's people, whole: a pick acts on the person, not on what a search matched of them. */
  everyone: ConversationRow[];
  channel: string;
  unread: (c: ConversationRow) => boolean;
  flash: (flash: Flash) => void;
}): CvPick => {
  const { everyone, channel, unread, flash } = p;
  const [held, setHeld] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const running = useRef(false);
  // Archiving cannot be undone, so the bar asks first; a pick let go drops the question.
  const [askArchive, setAskArchive] = useState(false);
  useEffect(() => setHeld([]), [channel]);
  const byName = new Map(everyone.map((c) => [cvWhose(c), c]));
  // Whether a thread is archived is the Inbox's read to say: a Conversations row does not hold it.
  const archived = new Set(
    (inboxData().THREADS || []).flatMap((t) => (t.real && t.archived && t.conversationId ? [t.conversationId] : [])),
  );
  // The mockup's seeded rows act only inside the Inbox page's demo state: nothing here is theirs to pick.
  const of = (c: ConversationRow): Picked | null => {
    if (demoSession()) return null;
    const whole = byName.get(cvWhose(c)) ?? c;
    return cvPicked(whole, { unread: unread(whole), archived: (id) => archived.has(id) });
  };
  const picks = held.flatMap((name) => {
    const row = byName.get(name);
    return (row && of(row)) ?? [];
  });
  const none = picks.length === 0;
  useEffect(() => {
    if (none) setAskArchive(false);
  }, [none]);
  const clear = () => setHeld([]);
  const run = pickRun({ setSelected: setHeld, setBusy, running, flash });
  const mark = pickMark(picks);
  const threads = picks.filter((x) => !!x.conversationId);
  return {
    of,
    selected: picks.map((x) => x.id),
    toggle: (name) => setHeld((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name])),
    clear,
    bar: none
      ? null
      : pickBar({
          count: picks.length,
          busy,
          mark: mark && { seen: mark.seen, press: () => run.mark(mark) },
          snooze: threads.length ? () => run.act(picks, "snooze") : null,
          archive: threads.length ? () => setAskArchive(true) : null,
          clear,
        }),
    ask:
      !none && askArchive
        ? pickArchiveAsk({
            picked: threads,
            busy,
            onYes: () => run.act(picks, "archive").finally(() => setAskArchive(false)),
            onNo: () => setAskArchive(false),
          })
        : null,
  };
};
