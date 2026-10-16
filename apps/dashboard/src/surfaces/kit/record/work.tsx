/**
 * Work half-done that is not a fold: a composer's words (moved whole from legacy/components/record-fold.jsx, decision
 * 0015).
 *
 * The one rule for a composer (the loading standard's G): its words are kept in the tab as they are typed (the tab's
 * memory, by `kind`, and `key` where there is one composer per thing -- a playbook being changed), come back when the
 * composer opens again, and go when the server takes them (`done`) or the person throws them away. While it holds
 * words, the tab asks before closing over them and Settings' rail before replacing them (the registry's hold), and its
 * Cancel asks once (`leave` -> `asking`; UnsavedAsk draws the question; `discard` and `stay` answer it). With nothing
 * typed, Cancel closes at once. The page says what counts as words (`dirty`) and what to keep (`value`); what was kept
 * is read as the page's state is made, with tabDraft(kind, key).
 *
 *   const kept = tabDraft("broadcast");
 *   const work = useUnsavedWork("broadcast", null, { value: { aud, name, ... }, dirty: !!name.trim(), onLeave: close });
 *   <button onClick={work.leave}>Cancel</button>
 *   {work.asking ? <UnsavedAsk onYes={work.discard} onNo={work.stay} testid="bc-leave" /> : null}
 *
 * Nothing is kept where the tab has no memory (the standalone harness): the guard still asks, the draft is the page's.
 */
import { useEffect, useRef, useState } from "react";
import { Confirm } from "../confirm/confirm";
import { recFolds } from "./registry";
import { tabMemory } from "./shell-verbs";

export const tabDraft = (kind: string, key?: string | null) => {
  const mem = tabMemory();
  return mem ? mem.draft(kind, key == null ? undefined : key) : null;
};

/**
 * Work handed to a composer that is not open yet, kept as its own words would be: the composer opens on it where it reads
 * tabDraft(kind, key) (Sent's Send it again, filling Campaigns' composer with what a run sent).
 */
export const keepTabDraft = (kind: string, value: unknown, key?: string | null) => {
  tabMemory()?.keepDraft(kind, value, key == null ? undefined : key);
};

/** What a composer says of its words: what to keep, whether there are any, and where Cancel goes. */
interface UnsavedWorkOptions {
  value: unknown;
  dirty: boolean;
  onLeave: () => void;
}

/** What the rule answers a composer: whether words are held, whether Cancel is asking, and the ways to answer it. */
export type UnsavedWork = ReturnType<typeof useUnsavedWork>;

export function useUnsavedWork(
  kind: string,
  key: string | null | undefined,
  { value, dirty, onLeave }: UnsavedWorkOptions,
) {
  const [asking, setAsking] = useState(false);
  const dirtyNow = useRef(dirty);
  dirtyNow.current = dirty;
  const k = key == null ? undefined : key;
  const drop = () => {
    const mem = tabMemory();
    if (mem) mem.dropDraft(kind, k);
  };
  // Kept as it changes, never on a timer: a tab closed a keystroke later has the keystroke. Nothing typed, nothing kept.
  const json = JSON.stringify(value);
  useEffect(() => {
    const mem = tabMemory();
    if (!mem) return;
    if (dirty) mem.keepDraft(kind, value, k);
    else drop();
    // what is kept is the words as they were typed (json), never each draw's fresh copy of them
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, k, json, dirty]);
  useEffect(() => recFolds.hold(`${kind}:${k || ""}`, () => dirtyNow.current), [kind, k]);
  return {
    dirty,
    asking,
    leave: () => {
      if (dirtyNow.current) setAsking(true);
      else {
        drop();
        onLeave();
      }
    },
    discard: () => {
      setAsking(false);
      drop();
      onLeave();
    },
    stay: () => setAsking(false),
    // The server took it: there is nothing left to keep.
    done: drop,
  };
}

/**
 * The one question, where the Cancel was, and its two answers. Nothing under it: a line saying nothing had been sent
 * said the question again (Ruben, 10 Oct 2026, the sheets made shorter).
 */
export function UnsavedAsk({
  onYes,
  onNo,
  busy = false,
  testid = null,
}: {
  onYes: () => void;
  onNo?: () => void;
  busy?: boolean;
  testid?: string | null;
}) {
  return (
    <Confirm
      question="Discard what you wrote?"
      yes="Discard"
      no="Keep writing"
      discard
      busy={busy}
      onYes={onYes}
      onNo={onNo}
      testid={testid}
    />
  );
}
