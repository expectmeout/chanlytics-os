/**
 * What a line of who waits offers when it is held (Working for you, W11 and W24, calm/held.tsx): on a conversation that holds
 * a person waiting, Done gives it back to AI and Not now puts it off, each through the row's own verb (row-verbs.tsx: Mark
 * done's `hand_back`, Not now's snooze), and each lands where the row's own press lands it: kept in its place, saying what
 * became of it with its Undo (the same row states). A to-do's Done is its own (zones/queue-steps.ts stepDone). Ask AI about
 * this opens AI's field about the conversation, or the person, with nothing written in it.
 */
import { notNowChoices, type AskScope, type TodayQueueRowVM } from "@chanlytics/contracts";
import { commitVerb } from "@/bridge/verbs/commit";
import type { HeldActs } from "../calm/held";
import type { NeedYouRowsCtx } from "./people-rows";
import { setRowState } from "./row-state";
import { rowWords } from "./sheet/row-words";

/** The conversation a held line may act on: one that holds a person waiting, which Mark done and Not now take. */
const heldThreadOf = (row: TodayQueueRowVM): string | null =>
  row.conversationId && (row.kind === "handoff" || row.kind === "reply" || row.kind === "callback")
    ? row.conversationId
    : null;

/** Done: the hold resolved and the thread AI's again, as Mark done does; kept in place with its Undo. */
async function doneOn(row: TodayQueueRowVM, thread: string, ctx: NeedYouRowsCtx): Promise<void> {
  ctx.keep(row);
  const answer = await commitVerb("thread_verb", {
    verb: row.closes ?? "hand_back",
    conversation_id: thread,
    who: row.who,
  });
  if (!answer.ok) {
    ctx.unkeep(row);
    ctx.flash({ tone: "danger", msg: <>{answer.message}</> });
    return;
  }
  setRowState(row.id, "markedDone", answer.undo ?? {});
}

/** Not now, to a time on the business's clock: kept in place, saying when it comes back, with its Wake. */
async function putOff(row: TodayQueueRowVM, thread: string, key: string, ctx: NeedYouRowsCtx): Promise<void> {
  const choice = notNowChoices(ctx.tz, Date.now()).find((c) => c.key === key);
  if (!choice) return;
  ctx.keep(row);
  const answer = await commitVerb("thread_verb", {
    verb: "snooze",
    conversation_id: thread,
    until: choice.until,
    who: row.who,
  });
  if (!answer.ok) {
    ctx.unkeep(row);
    ctx.flash({ tone: "danger", msg: <>{answer.message}</> });
    return;
  }
  setRowState(row.id, "snoozed", { back: choice.back, record: answer.undo ?? {} });
}

/** What AI's field opens about: the conversation, else the person, named as the line names it (a to-do by its words). */
function heldAboutOf(row: TodayQueueRowVM): AskScope | null {
  const label = rowWords(row).name;
  if (row.conversationId) return { kind: "conversation", id: row.conversationId, label };
  return row.person_id ? { kind: "person", id: row.person_id, label } : null;
}

/** A line's acts, held: what this row may do, by what it is and what the member may do. */
export function heldActsOf(row: TodayQueueRowVM, ctx: NeedYouRowsCtx): HeldActs {
  const thread = ctx.may ? heldThreadOf(row) : null;
  const step = row.kind === "step" && ctx.may;
  return {
    name: rowWords(row).name,
    done: thread ? () => void doneOn(row, thread, ctx) : step ? () => void ctx.stepDone(row) : null,
    notNow: thread
      ? { choices: notNowChoices(ctx.tz, Date.now()), choose: (key) => void putOff(row, thread, key, ctx) }
      : null,
    about: heldAboutOf(row),
  };
}
