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

/** What a composer says of its words: what to keep, whether there are any, and where Cancel goes. */
interface UnsavedWork {
  value: unknown;
  dirty: boolean;
  onLeave: () => void;
}

export function useUnsavedWork(kind: string, key: string | null | undefined, { value, dirty, onLeave }: UnsavedWork) {
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

/** The one question, where the Cancel was. `what` is what has not happened: sent, saved, submitted. */
export function UnsavedAsk({
  onYes,
  onNo,
  busy = false,
  what = "sent",
  testid = null,
}: {
  onYes: () => void;
  onNo?: () => void;
  busy?: boolean;
  what?: string;
  testid?: string | null;
}) {
  return (
    <Confirm
      question="Throw away what you've written?"
      detail={`Nothing has been ${what}.`}
      yes="Yes, throw it away"
      no="Keep writing"
      danger
      busy={busy}
      onYes={onYes}
      onNo={onNo}
      testid={testid}
    />
  );
}
