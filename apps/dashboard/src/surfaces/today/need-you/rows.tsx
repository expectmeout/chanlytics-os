/**
 * Which work a row of Need you draws (decision 0071), by its kind: the receptionist's reply counting down, a time picked
 * by text, a call back, a reply to write (a handoff, a closing window, a reach-out's reply), yesterday's visit, a step
 * due. A row past the first two of those is drawn short until it is opened (E8): who, their words, one press that opens
 * it in place, never a send before its words are seen. Rows of another kind (a call worth a listen, a search's question,
 * the rows for the rest) keep their one door.
 */
import type { ReactNode } from "react";
import { NEED_YOU_WORDS as W, type AppointmentWord, type TodayQueueRowVM } from "@chanlytics/contracts";
import { callWhoOf, readingMomentOf } from "./sheet/moment";
import { CallWork } from "./call-work";
import { HeldWork } from "./held-work";
import type { WorkProps } from "./parts";
import { ReplyWork, replyWant } from "./reply-work";
import { RequestWork } from "./sheet/request-work";
import { ReviewWork } from "./review-work";
import { Said } from "./sheet/said";
import { StepWork } from "./sheet/step-work";
import { SearchWork } from "./sheet/search-work";
import { VisitWork } from "./visit-work";
import type { DraftWant } from "./drafts";
import { stepNoteOf, stepNoteWantOf } from "./step-note";

/** The kinds a reply is written for. */
const REPLY_KINDS: ReadonlySet<TodayQueueRowVM["kind"]> = new Set(["handoff", "window", "reply"]);

/** Whether a row draws work of its own, and so a row past the first two is drawn short. */
export function worksInPlace(r: TodayQueueRowVM): boolean {
  return (
    r.kind === "held" ||
    r.kind === "callback" ||
    r.kind === "visit" ||
    r.kind === "step" ||
    r.kind === "review" ||
    r.kind === "search" ||
    REPLY_KINDS.has(r.kind)
  );
}

/** Whether a row drawn short opens in place to be worked (a send is never made on words not seen); else it acts. */
export function opensToWork(r: TodayQueueRowVM): boolean {
  return (
    r.kind === "callback" ||
    r.kind === "step" ||
    r.kind === "visit" ||
    r.kind === "review" ||
    r.kind === "search" ||
    (REPLY_KINDS.has(r.kind) && !!r.conversationId)
  );
}

/** The press a short row opens itself with, by its kind: a reply that never reached them goes again. */
export function shortLabel(r: TodayQueueRowVM): string {
  if (r.request) return "Answer";
  if (r.kind === "callback") return "Call back";
  // A step that arrives with its note written opens to read it (decision 0120); else its own Done.
  if (r.kind === "step") return stepNoteOf(r) ? W.step.readNote : r.cta.label;
  if (r.kind === "review" || r.kind === "search") return r.cta.label;
  if (r.kind === "visit") return W.visit.asks;
  // A reply that never reached them says what can work; a reach-out's that needs nothing more, that it can be let go.
  if (r.failed?.way === "call" && r.phone) return W.call.callWho(callWhoOf(r.who));
  if (r.failed?.way === "template") return W.pickTemplate;
  if (r.failed?.way === "later") return W.failed.later;
  if (r.failed?.way === "done") return W.oldDone.yes;
  if (r.failed) return W.failed.retry;
  const moment = readingMomentOf(r.reading);
  if (moment && moment.reply !== "send") return W.oldDone.yes;
  return "Reply";
}

/** The draft a row reads (drafts.ts): a reply, or a call back's read of whether it is someone selling; none for the rest. */
export function draftWantOf(r: TodayQueueRowVM): DraftWant | null {
  if (r.kind === "callback")
    return r.conversationId && r.writes
      ? {
          conversationId: r.conversationId,
          kind: "brief",
          forMessageId: r.writes.for_message_id,
          expected: false,
          askedAtMs: r.writes.for_message_at_ms ?? null,
        }
      : null;
  // A step's note, kept on the person's thread (decision 0120).
  if (r.kind === "step") return stepNoteWantOf(r);
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
  // What was said stands over the answer wherever the row is drawn whole.
  const said = p.whole ? <Said row={r} pulled={p.pulled} /> : null;
  if (r.kind === "held")
    return (
      <>
        {said}
        <HeldWork key={r.held?.message_id ?? r.id} {...props} />
      </>
    );
  if (r.request)
    return (
      <>
        {said}
        <RequestWork {...props} />
      </>
    );
  if (r.kind === "callback") return <CallWork {...props} />;
  if (r.kind === "search") return <SearchWork {...props} />;
  // A reply that never reached them: the words that failed, theirs and kept, sent again as written with Try again.
  if (r.failed)
    return (
      <>
        {said}
        <ReplyWork {...props} sendWord={W.failed.retry} />
      </>
    );
  if (REPLY_KINDS.has(r.kind))
    return (
      <>
        {said}
        <ReplyWork {...props} />
      </>
    );
  if (r.kind === "visit") return <VisitWork {...props} word={extra.word} />;
  if (r.kind === "step") return <StepWork {...props} onDone={extra.stepDone} />;
  if (r.review)
    return (
      <ReviewWork
        review={r.review}
        rowId={r.id}
        main={p.main}
        may={p.may}
        flash={p.flash}
        foot={p.foot}
        whole={p.whole}
        keep={() => p.keep(r)}
      />
    );
  return null;
}
