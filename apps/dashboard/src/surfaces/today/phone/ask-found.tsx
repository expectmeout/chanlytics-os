/**
 * Ask found, on a phone (decision 0076): Ask's ideas from its morning, which a desk draws under Need you's people (decision
 * 0071), each in the row the desk draws it in (need-you/people-rows.tsx ideaRows) with its own work: Approve, Open in Ask,
 * Not today. One acted on keeps its place for the visit. The reviews to answer are To do's on a phone (phone/to-do.tsx) and
 * Worth a look stands under the day's numbers (leaks.tsx LeakLines). Never in the count of who needs you, never the coral.
 */
import { useState } from "react";
import { DEFAULT_TIMEZONE, TODAY_PHONE_WORDS, type AskMorningCard } from "@chanlytics/contracts";
import { surfaceValue } from "../../surface-values";
import { ideaRows, type NeedYouExtrasCtx } from "../need-you/people-rows";
import { appNavigate, canDo, useMoved, useToast, workspaceClock } from "../shell";

/** The heading's id, which the list is named by. */
const ASK_FOUND_ID = "today-ask-found-title";

export function TodayAskFound() {
  // Ask's morning is read again while Ask writes it by the queue's own wait (queue.tsx useMorningWait).
  useMoved(["ask_morning"]);
  const [toastNode, flash] = useToast();
  // An idea approved or set aside leaves the morning's next read: it is kept in its place for the visit.
  const [kept, setKept] = useState<readonly AskMorningCard[]>([]);
  const morning = surfaceValue("ask_morning")?.dto ?? null;
  const read = morning?.offered ? morning.cards : [];
  const ideas = [...kept, ...read.filter((c) => !kept.some((k) => k.id === c.id))];
  if (!ideas.length) return toastNode;
  const ctx: NeedYouExtrasCtx = {
    nav: (to) => appNavigate(to),
    verbKind: () => "ghost",
    may: canDo("approve"),
    tz: workspaceClock()?.zone() ?? DEFAULT_TIMEZONE,
    flash,
    keep: () => undefined,
    kept: new Set(kept.map((k) => k.id)),
    expanded: new Set(),
    expand: () => undefined,
    word: "appointment",
    stepDone: () => undefined,
    keepIdea: (card) => setKept((was) => (was.some((k) => k.id === card.id) ? was : [...was, card])),
    keepReview: () => undefined,
  };
  return (
    <section className="tq today-ask-found" data-testid="today-ask-found" aria-labelledby={ASK_FOUND_ID}>
      <div className="tq-head">
        <span className="tq-title" id={ASK_FOUND_ID}>
          {TODAY_PHONE_WORDS.askFound}
        </span>
        <span className="tq-count tabular">{ideas.length}</span>
      </div>
      <div className="tq-list">
        {ideaRows(ideas, { messageId: morning?.message_id ?? null, threadId: morning?.thread_id ?? null }, ctx)}
      </div>
      {toastNode}
    </section>
  );
}
