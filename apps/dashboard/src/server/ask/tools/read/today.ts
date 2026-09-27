import "server-only";
import { z } from "zod";
import { ASK_CAPS, toTodayVM } from "@chanlytics/contracts";
import { load } from "../../../readers";
import { today } from "../../../readers/today";
import { defineRead, type ToolContext } from "../context";

async function getToday(t: ToolContext): Promise<unknown> {
  // Today as the page composes it (readers/today.ts), read once in the turn: the Inbox's threads, the metrics the
  // page's Today reads (every line, the workspace's email one too), the calls and the searches. A calls or searches
  // read that failed is null, its own state on the page, never none.
  const { metrics, conversations, escalations, calls, searches } = (await load(t.rc, today, undefined)).data;
  // The page's own builder, with the waiting searches the page passes (the queue reads them).
  const vm = toTodayVM(metrics, conversations, escalations, calls, t.now, searches);
  for (const r of vm.needsYou?.rows ?? []) t.read.thread.add(r.conversationId);
  // A row this read RETURNS is a row a citation may name (see the header).
  // These were returned and not recorded, so the assistant could warn about a
  // closing window and then be unable to open the thread it had just named.
  for (const r of vm.windowClosing?.rows ?? []) t.read.thread.add(r.id.replace(/^wc-/, ""));
  for (const c of calls ?? []) t.read.call.add(c.id);
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
          // list_calls and get_call open it: conversations/cv-<id>. This said conversations/<id>, which opens nothing.
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

export const get_today = defineRead({
  name: "get_today",
  description:
    "The Today page as it stands: who needs a person right now, the WhatsApp threads whose free-reply window is closing while the customer waits, today's calls, the standing of the receptionist, a recap and the day's counts. Start here for 'how are we doing', 'what needs me' or 'brief me', and read it for what Today holds when the person is on another page. It holds no drafts: list_threads with filter held has them, and get_thread has a whole conversation. needs_you and calls are capped, the counts are not; nothing changes because it was read.",
  input: z.object({}),
  label: "Reading Today",
  run: getToday,
});
