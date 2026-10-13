import "server-only";
import { z } from "zod";
import {
  addressOf,
  ASK_CAPS,
  callerName,
  runDaysAt,
  runsThatWait,
  toTodayVM,
  type WaitingRun,
} from "@chanlytics/contracts";
import { load } from "../../../readers";
import { today } from "../../../readers/today";
import { defineRead, noteRow, type ToolContext } from "../context";

async function getToday(t: ToolContext): Promise<unknown> {
  // Today as the page composes it (readers/today.ts), read once in the turn: the Inbox's threads, the metrics the
  // page's Today reads (every line, the workspace's email one too), the calls and the searches. A calls or searches
  // read that failed is null, its own state on the page, never none.
  const { metrics, conversations, escalations, calls, searches, runs, heldThreads } = (
    await load(t.rc, today, undefined)
  ).data;
  // The page's own builder, with the waiting searches the page passes (the queue reads them), and the runs waiting and
  // the threads of holds past the hundred beside it, so the head and the count are the badge's (the wiring's second
  // audit, S7-1 and W-thread-wait-step-4).
  const vm = toTodayVM(metrics, conversations, escalations, calls, t.now, searches, { runs, heldThreads });
  const searchRows = vm.queue.rows.filter((r) => r.kind === "search");
  // A search waiting on its owner is a row a citation names (the queue's row id is `q-s-<search>`).
  for (const r of searchRows) noteRow(t, "search", r.id.replace(/^q-s-/, ""), r.who, r.cta.to);
  for (const r of vm.needsYou?.rows ?? [])
    noteRow(t, "thread", r.conversationId, r.who, `inbox/th-${r.conversationId}`);
  // A row this read RETURNS is a row a citation may name (see the header).
  // These were returned and not recorded, so the assistant could warn about a
  // closing window and then be unable to open the thread it had just named.
  for (const r of vm.windowClosing?.rows ?? []) noteRow(t, "thread", r.id.replace(/^wc-/, ""), r.text, r.to);
  for (const c of calls ?? []) noteRow(t, "call", c.id, callerName(c), `conversations/cv-${c.id}`);
  return {
    standing: {
      headline: vm.standing.headline,
      detail: vm.standing.detail,
      tone: vm.standing.tone,
      chips: vm.standing.chips.map((c) => c.text),
    },
    needs_you: vm.needsYou
      ? {
          count: vm.needsYou.count,
          holds: vm.needsYou.holds,
          // Replies counting down to send in the owner's name, which this does not list (inbox with action list has them).
          replies_on_their_way: vm.needsYou.sends,
          rows: vm.needsYou.rows.slice(0, ASK_CAPS.needsRows).map((r) => ({
            conversation_id: r.conversationId,
            route: `inbox/th-${r.conversationId}`,
            who: r.who,
            reason: r.reason,
            waited: r.waited,
            quote: r.quote,
          })),
        }
      : null,
    // NOT drafts, and not nearly. Every row here is a thread where the CUSTOMER
    // spoke last and nobody has written back (today.ts closingConvs), with
    // WhatsApp's free window running out. Under its old name,
    // `drafts_about_to_send`, the assistant read a person being ignored as a
    // reply already on its way out and told the owner to do nothing. The rule
    // comes from the contracts' own hint, so it is spelled in one place; null
    // when nothing is closing, as the view model itself is.
    reply_window_closing: vm.windowClosing
      ? {
          note: vm.windowClosing.hint,
          rows: vm.windowClosing.rows.map((r) => ({
            conversation_id: r.id.replace(/^wc-/, ""),
            route: r.to,
            text: r.text,
          })),
        }
      : null,
    recap: vm.recap
      ? { sentences: vm.recap.sentences.map((s) => s.text), facts: vm.recap.facts.map((f) => `${f.label}: ${f.value}`) }
      : null,
    calls: vm.calls
      ? {
          line: vm.calls.line,
          // Today's call row is keyed by the bare call id (contracts today.ts), and a call opens where the Today page,
          // calls.list and calls.get open it: conversations/cv-<id>. This said conversations/<id>, which opens nothing.
          rows: vm.calls.rows.slice(0, 5).map((r) => ({
            call_id: r.id,
            route: `conversations/cv-${r.id}`,
            who: r.who,
            at: r.at,
            duration: r.duration,
            note: r.note,
          })),
        }
      : null,
    quiet: vm.quiet ? { headline: vm.quiet.headline, sub: vm.quiet.sub } : null,
    // The runs waiting for your say: an approval that can still send them, or the emails a going run's check holds (null
    // where they could not be read).
    campaign_runs_waiting:
      vm.runs_waiting === null
        ? null
        : {
            count: vm.runs_waiting,
            runs: waitingRunsNamed(
              t,
              runsThatWait(runs ?? [], runDaysAt(metrics.workspace.timezone, t.now)),
              vm.runs_waiting,
            ),
          },
    searches_waiting: searchRows.map((r) => ({ name: r.who, question: r.sentence, route: r.cta.to })),
    period: {
      messages_in: metrics.period.messages_in,
      answered_by_receptionist: metrics.period.answered_by_ai,
      answered_by_you: metrics.period.answered_by_you,
      unanswered: metrics.period.unanswered_in_window,
      calls: metrics.period.calls,
      new_people: metrics.period.new_contacts,
    },
  };
}

/**
 * The runs Today counted as waiting (by the count's own rule, runsThatWait: a run too late to approve is not among them),
 * named for the answer (five at most), each a row a citation names.
 */
function waitingRunsNamed(
  t: ToolContext,
  waiting: ReadonlyArray<WaitingRun & { id: string; name: string }>,
  count: number,
): Array<{ name: string; route: string }> {
  if (!count) return [];
  return waiting.slice(0, 5).map((r) => {
    const route = addressOf({ kind: "send", id: r.id });
    noteRow(t, "broadcast", r.id, r.name, route);
    return { name: r.name, route };
  });
}

export const todayTool = defineRead({
  name: "today",
  description:
    "The Today page as it stands: who needs a person right now, the WhatsApp threads whose free-reply window is closing while the customer waits, today's calls, the standing of the receptionist, a recap and the day's counts. Start here for 'how are we doing', 'what needs me' or 'brief me', and read it for what Today holds when the person is on another page. needs_you counts the holds and the replies counting down to send in your name (replies_on_their_way, which it does not list: inbox with action list has them); campaign_runs_waiting are the runs waiting for your say: those an approval can still send, and going reach-out runs whose check holds emails for you (campaigns with action broadcasts lists them); searches_waiting stopped to ask you. It holds no drafts: inbox with action list and filter held has them, and inbox with action thread has a whole conversation. needs_you and calls are capped, the counts are not; nothing changes because it was read.",
  input: z.object({}),
  label: "Reading Today",
  run: getToday,
});
