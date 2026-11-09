/**
 * A call back made from the thread ends as one made from Today's sheet does (one sheet, 9 Nov 2026; Today's need-you/call-work.tsx):
 * how did it go. Reached them hands the thread back; No answer puts a call on tomorrow's steps; Didn't call says nothing happened.
 * The press that rang them is on the band, and what it did is kept by thread for the visit: the phone's own app came between.
 */
import { useState, useSyncExternalStore } from "react";
import { NEED_YOU_WORDS as W, callDays } from "@chanlytics/contracts";
import { commitVerb } from "@/bridge/verbs/commit";
import { Button } from "../../kit/button/button";
import { Notice } from "../../kit/notice/notice";
import { clockZone, gate, useToast } from "../shell";
import type { Thread } from "../types";

const called = new Set<string>();
const hearers = new Set<() => void>();
const tell = () => hearers.forEach((on) => on());
const hear = (on: () => void) => {
  hearers.add(on);
  return () => hearers.delete(on);
};

/** Say a call was made from this thread: its band asks how it went. */
export function markCalled(threadId: string): void {
  called.add(threadId);
  tell();
}

const forget = (threadId: string) => {
  called.delete(threadId);
  tell();
};

/** How the call went, on a thread it was made from; nothing on any other. */
export function CallAfter({ thread, onHandBack }: { thread: Thread; onHandBack: (threadId: string) => void }) {
  const asks = useSyncExternalStore(
    hear,
    () => called.has(thread.id),
    () => false,
  );
  const [busy, setBusy] = useState(false);
  const [toastNode, flash] = useToast();
  if (!asks) return toastNode;
  const again = async () => {
    const tomorrow = callDays(Date.now(), clockZone()).find((d) => d.label === "Tomorrow");
    if (!thread.clientId || !tomorrow) return forget(thread.id);
    setBusy(true);
    const r = await commitVerb("note", {
      contact_id: thread.clientId,
      body: W.call.againStep,
      team_only: true,
      due_on: tomorrow.key,
      who: thread.who,
    });
    setBusy(false);
    if (!r.ok) return flash({ tone: "danger", msg: <>{r.message}</> });
    flash({ msg: <>{W.call.again}</> });
    forget(thread.id);
  };
  return (
    <>
      <Notice
        fact={W.call.how}
        label={W.call.how}
        line
        className="ix-dock"
        testid="ix-call-after"
        act={
          <>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                onHandBack(thread.id);
                forget(thread.id);
              }}
              {...gate("approve", "hand the thread back")}
            >
              {W.call.reached}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void again()}
              {...gate("approve", "set a step")}
            >
              {W.call.noAnswer}
            </Button>
            <Button size="sm" variant="quiet" disabled={busy} onClick={() => forget(thread.id)}>
              {W.call.didNot}
            </Button>
          </>
        }
      />
      {toastNode}
    </>
  );
}
