/**
 * The demo's bell and presence (moved from legacy/components/topbar.jsx, the one-system plan's step 7d; demo mode kept,
 * Ruben, 20 Oct 2026). The seeded notes (bell-demo.ts) are read only in a demo session, so a real workspace's bell draws
 * the server's rows alone and none of this is heard there. The demo's senders (the Agents store and fleet, the seeded
 * verdict thread, the scripted lead) push notes in; decisions flip notes in place.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { LegacyFlash } from "../../legacy-verbs";
import { TB_NOTIFS, type DemoNote } from "./bell-demo";
import { isDemoFrame } from "../frame-window";

// Session overlay: the bell reflects what you've already handled.
export const tbOverlay = (n: DemoNote): DemoNote => {
  if (n.threadId && window.IX_STORE) {
    const rec = window.IX_STORE.get(n.threadId);
    if (rec && rec.kind === "decided") {
      return {
        ...n,
        unread: false,
        icon: rec.declined ? "x" : "check",
        tone: rec.declined ? "" : "ok",
        title: n.title.split(" — ")[0] + " — " + (rec.declined ? "declined" : "decided"),
        message: `You chose “${rec.action}” at ${rec.at} — the agent is executing.`,
        actions: [{ label: "View thread", to: `inbox/${n.threadId}`, primary: true }],
      };
    }
  }
  return n;
};

type SetNotes = Dispatch<SetStateAction<DemoNote[]>>;

/** One note pushed to the top, unless a note with its id is there already. */
const pushOnce = (setNotifs: SetNotes, note: DemoNote) =>
  setNotifs((list) => (list.some((n) => n.id === note.id) ? list : [note, ...list]));

// Listing review outcomes: a rejection lands in the bell; the fix closes the loop.
const onListingOf = (setNotifs: SetNotes) => (e: Event) => {
  const id = (e as CustomEvent<{ id?: string }>).detail?.id;
  const l = ((window.STORE_DATA || {}).STORE_LISTINGS || []).find((x) => x.id === id);
  if (!l) return;
  const nid = "n-lst-" + id;
  if (l.status === "rejected") {
    const item: DemoNote = {
      id: nid,
      icon: "x",
      tone: "danger",
      unread: true,
      time: "now",
      title: `Listing rejected — ${l.name}`,
      message: l.rejectReason || "Review failed — see the checklist in Studio.",
      actions: [
        { label: "Fix in Studio", to: "studio", primary: true },
        { label: "Your listings", to: "store" },
      ],
    };
    setNotifs((list) => {
      const i = list.findIndex((n) => n.id === nid);
      if (i < 0) return [item, ...list];
      const next = [...list];
      next[i] = item;
      return next;
    });
  } else if (l.status === "listed") {
    // Only close the loop for listings the bell flagged as rejected.
    setNotifs((list) => {
      const i = list.findIndex((n) => n.id === nid);
      if (i < 0) return list;
      const next = [...list];
      next[i] = {
        id: nid,
        icon: "check",
        tone: "ok",
        unread: true,
        time: "now",
        title: `Listed — ${l.name}`,
        message: "Passed all 5 review checks after your fix — live in the Store.",
        actions: [{ label: "Your listings", to: "store", primary: true }],
      };
      return next;
    });
  }
};

type Detail = Record<string, string | undefined>;
const eventDetailOf = (e: Event): Detail => (e as CustomEvent<Detail>).detail || {};

// Commit moments push into the bell: a lead converted (flow 1); decisions (flow 2) overlay in place.
const onLeadConvOf = (setNotifs: SetNotes) => (e: Event) => {
  const d = eventDetailOf(e);
  pushOnce(setNotifs, {
    id: "n-lead-" + d.leadId,
    icon: "deal",
    tone: "ok",
    unread: true,
    time: "now",
    title: `Lead converted — ${d.name}`,
    message: "Client record created · entered New this month.",
    actions: [
      { label: "Open client", to: d.clientId ? "clients/" + d.clientId : "clients", primary: true },
      { label: "Leads", to: "clients/leads" },
    ],
  });
};

const onLeadArrOf = (setNotifs: SetNotes) => (e: Event) => {
  const d = eventDetailOf(e);
  if (d.phase === "arrived") {
    pushOnce(setNotifs, {
      id: "n-lead-arr",
      icon: "phone",
      tone: "accent",
      unread: true,
      time: "now",
      title: "New lead — Riley Nguyen",
      message: "Missed call → texted back. SMS Agent answered in 9s; Qualifier is scoring intent.",
      actions: [{ label: "All leads", to: "clients/leads", primary: true }],
    });
  } else if (d.phase === "scored") {
    setNotifs((list) =>
      list.map((n) =>
        n.id === "n-lead-arr"
          ? {
              ...n,
              icon: "sparkle",
              unread: true,
              time: "now",
              title: "Lead scored 78 — Riley Nguyen",
              message:
                "Qualifier: prenatal cert is the constraint — Emma has Thu 2:00 open. Books itself when she confirms.",
            }
          : n,
      ),
    );
  }
};

const onHandoffOf = (setNotifs: SetNotes) => (e: Event) => {
  const d = eventDetailOf(e);
  pushOnce(setNotifs, {
    id: "n-ho-" + d.agentId,
    icon: "agents",
    tone: "accent",
    unread: true,
    time: "now",
    title: `Handoff — ${d.kind}`,
    message: `Found 3 items low; reorder drafts attached — routed to ${d.route} per your handoff map.`,
    actions: [
      { label: "In Tasks", to: "tasks", primary: true },
      { label: "Its card", to: "fleet/" + d.agentId },
    ],
  });
};

/** When the scripted lead arrives, after the page has stood a while. */
const LEAD_ARRIVES_MS = 18000;

/**
 * The mockup's bell: decisions flip bell items, and a listing-review outcome, a lead converted, the scripted lead arriving
 * and a handoff push session notes. Their senders are the demo's, so a real session registers none of them. Nothing sends a
 * call's ending, a broadcast queued or a batch approved any more (their pages left with the mockup, #1351).
 */
export function useDemoBell(): [DemoNote[], SetNotes] {
  // The seeded notes, in a demo session alone: a real one's bell is the server's rows (useBell's `shown`).
  const [notifs, setNotifs] = useState<DemoNote[]>(() => (isDemoFrame() ? [...TB_NOTIFS] : []));
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isDemoFrame()) return undefined;
    const bump = () => setTick((n) => n + 1);
    const heard: Array<[string, (e: Event) => void]> = [
      ["inbox:decisions", bump],
      ["store:listing", onListingOf(setNotifs)],
      ["leads:converted", onLeadConvOf(setNotifs)],
      ["leads:arrived", onLeadArrOf(setNotifs)],
      ["fleet:handoff", onHandoffOf(setNotifs)],
    ];
    for (const [name, fn] of heard) window.addEventListener(name, fn);
    // The one scripted inbound moment.
    const arrT = setTimeout(() => {
      if (window.LD_STORE && window.LD_STORE.arrive) window.LD_STORE.arrive();
    }, LEAD_ARRIVES_MS);
    return () => {
      clearTimeout(arrT);
      for (const [name, fn] of heard) window.removeEventListener(name, fn);
    };
  }, []);
  return [notifs, setNotifs];
}

/** The demo's seeded threads, which the welcome back counts (the mockup's; the app sets none). */
const demoThreads = () => {
  const data = Reflect.get(window, "INBOX_DATA") as
    { THREADS?: Array<{ id: string; state?: string; veto?: unknown }> } | undefined;
  return (data || {}).THREADS || [];
};

/**
 * Presence is the mockup's too (its control is drawn only in a demo): the label follows it there, and a real session has no
 * Away to hear. Coming back from Away says what changed while you were away (#19): the sends that stayed frozen and the
 * decisions waiting.
 */
export function useDemoPresence(flash: (p: LegacyFlash) => void) {
  const [, prBump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!isDemoFrame()) return undefined;
    window.addEventListener("presence:changed", prBump);
    return () => window.removeEventListener("presence:changed", prBump);
  }, []);
  const prevAwayRef = useRef(!!(window.PR_STORE && window.PR_STORE.away));
  useEffect(() => {
    if (!isDemoFrame()) return undefined;
    const onPr = () => {
      const nowAway = !!(window.PR_STORE && window.PR_STORE.away);
      if (prevAwayRef.current && !nowAway) {
        const T = demoThreads();
        const dec = (id: string) => window.IX_STORE && window.IX_STORE.get(id);
        const needs = T.filter((t) => t.state === "needs" && !dec(t.id)).length;
        const held = T.filter((t) => t.veto && !dec(t.id)).length;
        flash({
          tone: "info",
          msg: (
            <>
              Welcome back —{" "}
              <b>
                {held} send{held === 1 ? "" : "s"}
              </b>{" "}
              stayed frozen,{" "}
              <b>
                {needs} decision{needs === 1 ? "" : "s"}
              </b>{" "}
              waiting. Timers are running again.
            </>
          ),
        });
      }
      prevAwayRef.current = nowAway;
    };
    window.addEventListener("presence:changed", onPr);
    return () => window.removeEventListener("presence:changed", onPr);
  }, []);
}
