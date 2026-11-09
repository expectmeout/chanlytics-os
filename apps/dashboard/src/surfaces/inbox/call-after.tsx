/**
 * A call back made from the thread ends as one made from Today's sheet does (one sheet, 9 Nov 2026; Today's need-you/call-work.tsx):
 * how did it go. Reached them hands the thread back; No answer puts a call on tomorrow's steps; Didn't call says nothing happened.
 * The press that rang them is on the band, and what it did is kept by thread for the visit: the phone's own app came between.
 */
import { useState, useSyncExternalStore } from "react";
import { NEED_YOU_WORDS as W, callDays } from "@chanlytics/contracts";
import { commitVerb } from "@/bridge/verbs/commit";
import { Button } from "../kit/button/button";
import { Icon } from "../kit/icon/icon";
import { Notice } from "../kit/notice/notice";
import { callMomentOf } from "../today/need-you/sheet/moment";
import { openClockOf } from "../today/need-you/sheet/reads";
import { clockZone, gate, useToast } from "./shell";
import type { Thread } from "./types";

const called = new Set<string>();
const calledHearers = new Set<() => void>();
const tellCalled = () => calledHearers.forEach((on) => on());
const hearCalled = (on: () => void) => {
  calledHearers.add(on);
  return () => calledHearers.delete(on);
};

/** Say a call was made from this thread: its band asks how it went. */
function markCalled(threadId: string): void {
  called.add(threadId);
  tellCalled();
}

const forgetCalled = (threadId: string) => {
  called.delete(threadId);
  tellCalled();
};

/**
 * What leads on a call back, by the sheet's own rule (callMomentOf): "free after 4 PM" at 9 in the morning waits. Past a week and
 * selling are the sheet's to say, which reads the wait and the call; here only the clock and what they said.
 */
function dockMoment(thread: Thread) {
  return thread.real
    ? callMomentOf(
        { sentence: thread.holdLine ?? thread.summary ?? "", phone: thread.phone ?? null, waitedMs: 0 },
        { nowMs: Date.now(), tz: clockZone(), open: openClockOf() },
      )
    : null;
}

/** Whether a thread the band can ring waits for a time: its presses then stand under its words, which beside three had no room. */
export const callWaits = (thread: Thread, dials: boolean): boolean => dials && dockMoment(thread)?.lead === "wait";

/** The band's press that rings them, and where they said when, the one that waits for it. */
export function CallBackPress({ thread, onTakeOver }: { thread: Thread; onTakeOver: (threadId: string) => void }) {
  const moment = dockMoment(thread);
  const waits = moment?.lead === "wait" && thread.real && !!thread.conversationId;
  const ring = (
    <Button
      size="sm"
      variant={waits ? "quiet" : undefined}
      href={`tel:${thread.phone}`}
      onClick={() => {
        markCalled(thread.id);
        onTakeOver(thread.id);
      }}
      data-testid="ix-call-back"
    >
      <Icon name="phone" size={12} /> {waits ? W.call.callNow : "Call back"}
    </Button>
  );
  if (!waits) return ring;
  return (
    <>
      {ring}
      <Button
        size="sm"
        data-testid="ix-call-wait"
        onClick={() =>
          void commitVerb("thread_verb", {
            verb: "snooze",
            conversation_id: thread.conversationId,
            until: moment.until,
            who: thread.who,
          })
        }
        {...gate("approve", "snooze a conversation")}
      >
        {moment.back}
      </Button>
    </>
  );
}

/** How the call went, on a thread it was made from; nothing on any other. */
export function CallAfter({ thread, onHandBack }: { thread: Thread; onHandBack: (threadId: string) => void }) {
  const asks = useSyncExternalStore(
    hearCalled,
    () => called.has(thread.id),
    () => false,
  );
  const [busy, setBusy] = useState(false);
  const [toastNode, flash] = useToast();
  if (!asks) return toastNode;
  const again = async () => {
    const tomorrow = callDays(Date.now(), clockZone()).find((d) => d.label === "Tomorrow");
    if (!thread.clientId || !tomorrow) return forgetCalled(thread.id);
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
    forgetCalled(thread.id);
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
                forgetCalled(thread.id);
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
            <Button size="sm" variant="quiet" disabled={busy} onClick={() => forgetCalled(thread.id)}>
              {W.call.didNot}
            </Button>
          </>
        }
      />
      {toastNode}
    </>
  );
}
