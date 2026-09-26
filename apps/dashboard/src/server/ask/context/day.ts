import "server-only";
import { toCallVM, toInboxThreadVM, toTodayVM, type CallVM, type InboxThreadVM } from "@chanlytics/contracts";
import { load, type ReaderContext } from "../../readers";
import * as facts from "../../readers/facts";
import { today as todayReader } from "../../readers/today";
import { inbox as inboxReader } from "../../readers/inbox";
import { conversations as conversationsReader } from "../../readers/conversations";
import { escalations as escalationsReader } from "../../readers/escalations";
import { calls as callsReader } from "../../readers/calls";
import { aggregateOf, idsOf, line, pageWithView, refOf, sourceOf, type ContextRow, type Provider } from "./rows";

/**
 * The day's pages, as their context: Today, the Inbox, Conversations and Live. Each reads the ids the page sent
 * through the page's own reader, keeps the rows the reader returned (a thread another workspace holds is not among
 * them, so it is simply absent) and writes each row with the page's own view model, as Ask's tools do.
 */

/** A thread's state in the words list_threads says it in (tools.ts), from the Inbox row's own view model. */
export function threadState(v: InboxThreadVM): string {
  if (v.needsYou) return "needs you";
  if (v.takenOver) return "waiting on you";
  if (v.state === "snoozed") return "snoozed";
  if (v.optedOut) return "opted out";
  return "answering";
}

/** A draft held on the thread, as list_threads marks one. */
const held = (v: InboxThreadVM): string | null => (v.veto || v.heldDraft ? "draft held" : null);

/** A thread's line: who, its state, a held draft, the last word, when. */
const threadLine = (v: InboxThreadVM, route: string): string =>
  line([v.who, threadState(v), held(v), v.preview, v.lastAtFull], route);

/** A call's line, as list_calls says a call: who, how it went, when, how long, what it was about. */
const callLine = (v: CallVM): string =>
  line([v.who, v.outcome, v.at, v.duration, v.summary.headline], `conversations/cv-${v.callId}`);

const callRow = (v: CallVM): ContextRow => ({
  source: sourceOf("call", v.callId),
  title: v.who,
  text: callLine(v),
  ref: refOf("call", v.callId, v.who),
});

/** The open escalation each thread shows, as the Inbox picks it: the last one keyed wins, so a thread shows its oldest. */
const escalationsBy = <E extends { conversation_id: string }>(open: E[]): Map<string, E> =>
  new Map(open.map((e) => [e.conversation_id, e]));

const zone = (rc: ReaderContext) => load(rc, facts.facts, undefined).then((r) => r.data.timezone);

/** Today: the queue's rows the page drew, each as the queue says it, and the day's standing and figures. */
export const today: Provider = async (rc, ctx) => {
  const { metrics, conversations, escalations, calls, searches } = (await load(rc, todayReader, undefined)).data;
  const vm = toTodayVM(metrics, conversations, escalations, calls, rc.now, searches);
  const rows: ContextRow[] = [];
  for (const r of idsOf(ctx, "thread", "call", "search")) {
    // The page's own mapping (legacy-bridge/ask/context.ts): a search is `q-s-<id>`, a person's row its thread, else the call.
    const q = vm.queue.rows.find((x) =>
      r.kind === "search"
        ? x.kind === "search" && x.id === `q-s-${r.id}`
        : x.kind !== "search" &&
          (r.kind === "thread" ? x.conversationId === r.id : !x.conversationId && x.callId === r.id),
    );
    if (!q) continue;
    rows.push({
      source: sourceOf(r.kind, r.id),
      title: q.who,
      text: line([q.who, q.status[0], q.when, ...q.status.slice(1), q.sentence], q.cta.to),
      ref: r.kind === "thread" ? refOf("thread", r.id, q.who) : r.kind === "call" ? refOf("call", r.id, q.who) : null,
    });
  }
  return {
    rows,
    aggregate: aggregateOf([
      `Today: ${vm.standing.headline}`,
      vm.standing.detail,
      ...vm.standing.chips.map((c) => c.text),
      vm.queue.parts.length ? vm.queue.parts.join(", ") : vm.queue.empty.sub,
      ...(vm.figures ?? []).map((f) => `${f.label}: ${f.value}`),
      vm.calls?.line,
    ]),
  };
};

/** The Inbox: the threads in the bucket the page drew, and how many each bucket holds, counted as list_threads counts. */
export const inbox: Provider = async (rc, ctx) => {
  const [{ conversations, escalations }, tz] = await Promise.all([
    load(rc, inboxReader, undefined).then((r) => r.data),
    zone(rc),
  ]);
  const byConv = escalationsBy(escalations);
  const vms = conversations.map((c) => toInboxThreadVM(c, byConv.get(c.id) ?? null, tz, rc.now));
  const byId = new Map(vms.map((v) => [v.conversationId, v]));
  const rows: ContextRow[] = [];
  for (const r of idsOf(ctx, "thread")) {
    const v = byId.get(r.id);
    if (!v) continue;
    rows.push({
      source: sourceOf("thread", r.id),
      title: v.who,
      text: threadLine(v, `inbox/th-${r.id}`),
      ref: refOf("thread", r.id, v.who),
    });
  }
  const count = (f: (v: InboxThreadVM) => boolean) => vms.filter(f).length;
  return {
    rows,
    aggregate: aggregateOf([
      `${pageWithView(ctx)}: ${rows.length} threads on screen`,
      `needs you: ${count((v) => v.needsYou)}`,
      `held: ${count((v) => !!v.veto || !!v.heldDraft)}`,
      `waiting on you: ${count((v) => v.takenOver)}`,
      `snoozed: ${count((v) => v.state === "snoozed")}`,
      `threads: ${vms.length}`,
    ]),
  };
};

/**
 * Conversations: the threads and calls on the tab the page drew. The threads by their ids, in one read under the
 * workspace's filter; the calls from the Calls page's own read, the newest hundred.
 */
export const conversations: Provider = async (rc, ctx) => {
  const convIds = idsOf(ctx, "conversation").map((r) => r.id);
  const wantsCalls = idsOf(ctx, "call").length > 0;
  const [convs, open, calls, tz] = await Promise.all([
    convIds.length
      ? load(rc, conversationsReader, { ids: convIds }).then((r) => r.data.conversations)
      : Promise.resolve([]),
    convIds.length
      ? load(rc, escalationsReader, { state: "open" }).then((r) => r.data.escalations)
      : Promise.resolve([]),
    wantsCalls ? load(rc, callsReader, {}).then((r) => r.data.calls) : Promise.resolve([]),
    zone(rc),
  ]);
  const byConv = escalationsBy(open);
  const threads = new Map(convs.map((c) => [c.id, toInboxThreadVM(c, byConv.get(c.id) ?? null, tz, rc.now)]));
  const callVms = new Map(calls.map((c) => [c.id, toCallVM(c, tz, rc.now)]));
  const rows: ContextRow[] = [];
  let nConv = 0;
  let nCalls = 0;
  for (const r of idsOf(ctx, "conversation", "call")) {
    if (r.kind === "conversation") {
      const v = threads.get(r.id);
      if (!v) continue;
      nConv++;
      rows.push({
        source: sourceOf("conversation", r.id),
        title: v.who,
        text: threadLine(v, `conversations/${r.id}`),
        ref: refOf("conversation", r.id, v.who),
      });
    } else {
      const v = callVms.get(r.id);
      if (!v) continue;
      nCalls++;
      rows.push(callRow(v));
    }
  }
  return {
    rows,
    aggregate: aggregateOf([`${pageWithView(ctx)}: ${nConv} conversations and ${nCalls} calls on screen`]),
  };
};

/** Live: the calls the page drew, and how many are live now among the newest hundred. */
export const live: Provider = async (rc, ctx) => {
  const [calls, tz] = await Promise.all([load(rc, callsReader, {}).then((r) => r.data.calls), zone(rc)]);
  const vms = new Map(calls.map((c) => [c.id, toCallVM(c, tz, rc.now)]));
  const rows = idsOf(ctx, "call").flatMap((r) => {
    const v = vms.get(r.id);
    return v ? [callRow(v)] : [];
  });
  const liveNow = [...vms.values()].filter((v) => v.outcome === "live").length;
  return {
    rows,
    aggregate: aggregateOf([`${pageWithView(ctx)}: ${liveNow} live now`, `${rows.length} calls on screen`]),
  };
};
