/**
 * Which work a row of Need you draws (decision 0071), by its kind: the receptionist's reply counting down, a time picked
 * by text, a call back, a reply to write (a handoff, a closing window, a reach-out's reply), yesterday's visit, a step
 * due. A row past the first two of those is drawn short until it is opened (E8): who, their words, one press that opens
 * it in place, never a send before its words are seen. Rows of another kind (a call worth a listen, a search's question,
 * the rows for the rest) keep their one door.
 */
import type { ReactNode } from "react";
import type { AppointmentWord, TodayQueueRowVM } from "@chanlytics/contracts";
import { CallWork, RequestWork, StepWork } from "./call-work";
import { HeldWork } from "./held-work";
import type { WorkProps } from "./parts";
import { ReplyWork, replyWant } from "./reply-work";
import { VisitWork } from "./visit-work";
import type { DraftWant } from "./drafts";

/** The kinds a reply is written for. */
const REPLY_KINDS: ReadonlySet<TodayQueueRowVM["kind"]> = new Set(["handoff", "window", "reply"]);

/** Whether a row draws work of its own, and so a row past the first two is drawn short. */
export function worksInPlace(r: TodayQueueRowVM): boolean {
  return (
    r.kind === "held" || r.kind === "callback" || r.kind === "visit" || r.kind === "step" || REPLY_KINDS.has(r.kind)
  );
}

/** Whether a row drawn short opens in place to be worked (a send is never made on words not seen); else it acts. */
export function opensToWork(r: TodayQueueRowVM): boolean {
  return r.kind === "callback" || (REPLY_KINDS.has(r.kind) && !!r.conversationId);
}

/** The press a short row opens itself with, by its kind. */
export function shortLabel(r: TodayQueueRowVM): string {
  if (r.request) return "Answer";
  if (r.kind === "callback") return "Call back";
  return "Reply";
}

/** The draft a row wants written ahead (drafts.ts): a reply, or a call back's brief; none for the rest. */
export function draftWantOf(r: TodayQueueRowVM): DraftWant | null {
  if (r.kind === "callback")
    return r.conversationId && r.writes
      ? { conversationId: r.conversationId, kind: "brief", forMessageId: r.writes.for_message_id }
      : null;
  if (r.request || !REPLY_KINDS.has(r.kind)) return null;
  return replyWant(r);
}

/** A row's work, by its kind; null for a row that keeps its one door. */
export function workOf(
  r: TodayQueueRowVM,
  p: Omit<WorkProps, "row">,
  extra: { word: AppointmentWord; stepDone: () => void },
): ReactNode {
  const props = { ...p, row: r };
  if (r.kind === "held") return <HeldWork key={r.held?.message_id ?? r.id} {...props} />;
  if (r.request) return <RequestWork {...props} />;
  if (r.kind === "callback") return <CallWork {...props} />;
  if (REPLY_KINDS.has(r.kind)) return <ReplyWork {...props} />;
  if (r.kind === "visit") return <VisitWork {...props} word={extra.word} />;
  if (r.kind === "step") return <StepWork {...props} onDone={extra.stepDone} />;
  return null;
}
