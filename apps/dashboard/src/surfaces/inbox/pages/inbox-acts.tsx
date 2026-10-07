/**
 * The Inbox's decisions on a thread (moved from pages/inbox.jsx, decision 0015, step 3): approve or decline a seeded
 * thread's plan and snooze one; wake, archive, take over and hand back; and a reply sent. A real thread's go to the
 * server through the one thread's verbs (thread-verbs.tsx); a seeded thread's change it here, with an Undo.
 */
import { FOCUS_COMPOSER_MS, IX_NOW } from "../constants";
import { patched, snapOf, type InboxSoFar, type Snap } from "./inbox-state";
import { canDo } from "../shell";
import { conversationsData, inboxData, IX_STORE } from "../store";
import type { SendWords } from "../thread/composer";

/** The choice a plan's parameter made, when the plan has one. */
interface DecideMeta {
  param?: string;
}

/** Approve or decline a seeded thread's plan, and snooze one: each records, says so with an Undo, and moves the queue on. */
export const inboxDecide = (ix: InboxSoFar) => {
  const { threads, activeBucket, setActiveThreadId, realVerb, flash, nextNeedsAfter, mutate } = ix;
  const decide = (id: string, action: string, meta: DecideMeta = {}) => {
    // The role first, for a real thread too: its hand-back used to skip this check and reach the server.
    if (!canDo("approve")) return;
    const tReal = threads.find((x) => x.id === id);
    if (tReal && tReal.real) {
      if (action === "__HANDBACK__")
        void realVerb(tReal, "hand-back", undefined, "cleared — the receptionist is answering again");
      return;
    }
    const t = threads.find((x) => x.id === id);
    if (!t) return;
    const prev = snapOf(t);
    const declined = /decline/i.test(action);
    IX_STORE.set(id, { action, at: IX_NOW, declined, kind: "decided", param: meta.param || null });
    mutate(id, (x) => ({
      ...x,
      state: "done",
      unread: false,
      resolution: { action, at: IX_NOW, declined, param: meta.param || null },
      timeline: [
        ...x.timeline,
        {
          type: "event",
          kind: "decision",
          at: IX_NOW,
          body: `You chose “${action}”${meta.param ? ` · ${meta.param}` : ""} — ${declined ? `${x.agent.name} is handling the fallback${x.approval && x.approval.fallback ? `: ${x.approval.fallback}` : ""}` : `${x.agent.name} is executing`}`,
        },
      ],
    }));
    flash(`${action}${meta.param ? ` · ${meta.param}` : ""} — ${t.who}`, prev);
    if (t.state === "needs") {
      const nxt = nextNeedsAfter(id);
      if (nxt && activeBucket === "needs") setActiveThreadId(nxt);
    }
  };

  const snooze = (id: string, wake = "tomorrow 10:00", opts: { silent?: boolean } = {}): Snap | null => {
    if (!canDo("approve")) return null;
    const t = threads.find((x) => x.id === id);
    if (!t || t.state === "snoozed") return null;
    if (t.real) {
      void realVerb(t, "snooze", {}, "snoozed until tomorrow 10:00");
      return null;
    }
    const prev = snapOf(t);
    IX_STORE.set(id, { action: "Snoozed", at: IX_NOW, kind: "snoozed", wake });
    mutate(id, (x) => ({ ...x, state: "snoozed", wake, unread: false }));
    if (!opts.silent) flash(`Snoozed until ${wake} — ${t.who}`, prev);
    if (!opts.silent && activeBucket === "needs") {
      const nxt = nextNeedsAfter(id);
      if (nxt) setActiveThreadId(nxt);
    }
    return prev;
  };
  return { decide, snooze };
};

/** Wake, archive, take over and hand back: a real thread's go to the server, a seeded thread's change it here. */
export const inboxThreadActs = (ix: InboxSoFar) => {
  const { threads, setActiveBucket, setActiveThreadId, realVerb, flash, mutate, ppFlash, VW } = ix;
  const wake = (id: string) => {
    if (!canDo("approve")) return;
    const t = threads.find((x) => x.id === id);
    if (!t || t.state !== "snoozed") return;
    if (t.real) {
      void realVerb(t, "wake", {}, "awake — back in the queue");
      return;
    }
    const wakeAt = t.wake;
    IX_STORE.clear(id);
    mutate(id, (x) => patched(x, { state: "needs", wake: undefined, unread: true }));
    setActiveBucket("needs");
    setActiveThreadId(id);
    ppFlash({
      msg: (
        <>
          Woke <b>{t.who}</b> — back in Needs you
        </>
      ),
      undo: () => {
        IX_STORE.set(id, { action: "Snoozed", at: IX_NOW, kind: "snoozed", wake: wakeAt });
        mutate(id, (x) => ({ ...x, state: "snoozed", wake: wakeAt, unread: false }));
      },
    });
  };

  const archiveThread = (id: string, opts: { silent?: boolean } = {}): Snap | null => {
    if (!canDo("approve")) return null;
    const t = threads.find((x) => x.id === id);
    if (!t) return null;
    if (t.real) {
      void realVerb(t, "archive", {}, "archived");
      return null;
    }
    const prev = snapOf(t);
    IX_STORE.set(id, { action: "Archived", at: IX_NOW, kind: "decided" });
    mutate(id, (x) => ({ ...x, state: "done", unread: false, resolution: { action: "Archived", at: IX_NOW } }));
    if (!opts.silent) flash(`Archived — ${t.who}`, prev);
    return prev;
  };

  const takeOver = (id: string) => {
    if (!canDo("approve")) return;
    const tReal = threads.find((x) => x.id === id);
    if (tReal && tReal.real) {
      void realVerb(tReal, "take-over", undefined, "you have it — the receptionist is paused");
      return;
    }
    if (VW.state[id] && !VW.state[id].sent) VW.state[id].held = true; // one voice — agent timer dies
    mutate(id, (x) => ({
      ...x,
      takenOver: true,
      timeline: [
        ...x.timeline,
        { type: "event", kind: "takeover", at: IX_NOW, body: "You took this thread — agents stand down" },
      ],
    }));
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("inbox:focus-composer")), FOCUS_COMPOSER_MS);
  };

  const handBack = (id: string) => {
    if (!canDo("approve")) return;
    const t = threads.find((x) => x.id === id);
    if (!t || !t.takenOver) return;
    if (t.real) {
      void realVerb(t, "hand-back", undefined, "handed back — the receptionist resumes");
      return;
    }
    mutate(id, (x) => ({
      ...x,
      takenOver: false,
      timeline: [
        ...x.timeline,
        {
          type: "event",
          kind: "takeover",
          at: IX_NOW,
          body: `Handed back — ${x.agent.name} resumes with your replies as context`,
        },
      ],
    }));
    ppFlash({
      msg: (
        <>
          Handed back to <b>{t.agent.name}</b> — it resumes with your replies as context
        </>
      ),
      undo: () => mutate(id, (x) => ({ ...x, takenOver: true, timeline: x.timeline.slice(0, -1) })),
    });
  };
  return { wake, archiveThread, takeOver, handBack };
};

/** What the decisions on a thread add to the record. */
export type InboxActs = ReturnType<typeof inboxDecide> &
  ReturnType<typeof inboxThreadActs> &
  ReturnType<typeof inboxReply>;

/** A reply sent: a real thread's through the one thread's verb, a seeded thread's into its timeline. */
export const inboxReply = (ix: InboxSoFar) => {
  const { threads, VW, realVerb, mutate, ppFlash } = ix;
  const sendReply = (id: string, text: SendWords, viaApproval?: boolean): Promise<boolean> | void => {
    if (!canDo("approve")) return;
    if (VW.state[id] && !VW.state[id].sent) VW.state[id].held = true; // your reply replaces the queued draft
    const t = threads.find((x) => x.id === id);
    if (!t) return;
    if (t.real) {
      return text && typeof text === "object" && text.template
        ? // Forward the CHOSEN template. This passed undefined, so the courier
          // fell back to a hardcoded booking_link_v1/en_US — right for one
          // workspace, a guaranteed server rejection for every other.
          realVerb(
            t,
            "reply-template",
            typeof text.template === "object" ? { template: text.template } : undefined,
            typeof text.template === "object" ? `${text.template.name} on its way` : "booking link on its way",
            true,
          )
        : realVerb(t, "reply", { text: typeof text === "string" ? text : "" }, "reply on its way", true);
    }
    const body = typeof text === "string" ? text : "";
    if (viaApproval || t.state === "drafts") {
      IX_STORE.set(id, { action: viaApproval ? "Approved & sent" : "Sent", at: IX_NOW, kind: "decided" });
    }
    mutate(id, (x) =>
      patched(x, {
        unread: false,
        state: viaApproval || x.state === "drafts" ? "done" : x.state,
        resolution:
          viaApproval || x.state === "drafts"
            ? { action: viaApproval ? "Approved & sent" : "Sent", at: IX_NOW }
            : x.resolution,
        timeline: [
          ...x.timeline,
          { type: "msg", from: "agent", channel: x.primaryChannel, at: IX_NOW, body, byYou: true },
        ],
      }),
    );
    // Honest claim: cite the channel; link the conversation only when one exists
    const convo = t.clientId && (conversationsData().CONVERSATIONS || []).find((v) => v.clientId === t.clientId);
    const labels: Record<string, string> = inboxData().CHANNEL_LABELS || {};
    ppFlash({
      msg: (
        <>
          Sent to <b>{t.who}</b> via {labels[t.primaryChannel] || t.primaryChannel}
        </>
      ),
      links: convo ? [{ label: "View conversation", to: `conversations/${convo.id}` }] : [],
    });
  };
  return { sendReply };
};
