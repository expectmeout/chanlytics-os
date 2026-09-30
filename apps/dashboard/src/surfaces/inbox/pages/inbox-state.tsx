/**
 * The Inbox page's state and the moves every verb shares (moved from pages/inbox.jsx, decision 0015, step 3).
 *
 * Inbox is one record of the page (`ix`), made in the order the page always made it, each part reading what the parts
 * above it made: its state and the effects that keep it true (useInboxState), the moves every verb shares (inboxMoves),
 * the verdict (inboxVerdict), the veto window (useInboxVeto, useInboxAutoSend), a seeded thread's verbs (inbox-acts.tsx),
 * the bulk acts (inbox-bulk.tsx), what is on screen, the keys, a bucket picked, the counts and the page drawn
 * (inbox-page.tsx). The hooks are called in the order the page always called them, so every hook keeps its cell.
 * Each part is typed by the record so far: `Object.assign(ix, part(ix))` says what it added.
 */
import { useEffect, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import { CONF, FOCUS_COMPOSER_MS, IX_NOW, STALE_AFTER_MS, TICK_MS } from "../constants";
import { IX_CONCURRENT } from "../sample";
import { ixBucketOf, ixDraftKey, ixHeld, ixReadAgain, ixSending, ixWaitsOnYou } from "../rules";
import { ixKeepPlace, ixPlace } from "../place";
import {
  appNavigate,
  canDo,
  canNavigate,
  currentRoute,
  demoSession,
  seededDeals,
  seededLeads,
  useToast,
  type Flash,
  type SeededLead,
} from "../shell";
import { inboxData, IX_STORE, VW_STORE, VW_UTIL, type Decision } from "../store";
import { threadVerbs } from "../thread/thread-verbs";
import type { RealThread, Resolution, SeededThread, Thread, ThreadState, TimelineEntry, VerdictOption } from "../types";
import { refreshInbox } from "../verbs";

/** A concurrent change waiting to merge (the mockup's scripted one): the thread it landed on, and what landed. */
interface Stale {
  threadId: string;
  update: (typeof IX_CONCURRENT)[string];
}

/** What an undo puts back on a thread: the record an act takes of it before it changes it. */
export interface Snap {
  id: string;
  state: ThreadState;
  timeline: TimelineEntry[];
  resolution: Resolution | undefined;
  unread: boolean;
}

/** The record an act takes of a thread before it changes it. */
export const snapOf = (t: Thread): Snap => ({
  id: t.id,
  state: t.state,
  timeline: t.timeline,
  resolution: t.resolution,
  unread: t.unread,
});

/**
 * A thread with some of its fields changed: what every `{ ...x, ... }` the page wrote did, said once. A patch over a
 * real thread carries only what a real thread may hold, and the page patches a seeded thread's state onto seeded threads.
 */
export const patched = (x: Thread, patch: Partial<Omit<SeededThread, "real">>): Thread =>
  ({ ...x, ...patch }) as Thread;

/** The bucket a thread that is there sits in: a thread always has a state, so never nothing. */
const bucketOf = (t: Thread): string => ixBucketOf(t) ?? "";

/** Replace one thread by id: the page's one way to change a thread it holds. */
type Mutate = (id: string, fn: (t: Thread) => Thread) => void;

// Saved views are real predicates, not search hacks.
export const IX_VIEW_FILTERS: Record<string, (t: Thread) => boolean> = {
  vip: (t) => /vip/i.test(t.whoMeta) || t.tags.some((x) => /vip/i.test(x)),
  "at-risk": (t) => (t.value ?? 0) >= 1000 && t.state !== "done",
  "high-conf": (t) => !!t.approval && (t.confidence ?? 0) >= CONF.SAFE,
  "new-leads": (t) => /lead/i.test(t.whoMeta),
};

// The bucket a thread is IN, never the state it holds: one whose own reply is on its way out is in Needs you.
const firstBucketWithThreads = (list: Thread[]): string => {
  for (const s of ["escalated", "needs", "snoozed", "done"]) {
    if (list.some((x) => ixBucketOf(x) === s)) return s;
  }
  return "escalated";
};

// The phone's width, where the list and the thread take turns on the screen (mobile.css, 720px).
const ixOnPhone = (): boolean => !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);

// The bucket the member had (the Inbox's place, place.ts ixPlace) comes back with a refresh; a thread the
// address names opens in it when it lists that thread, and in its own bucket when it does not.
const ixOpeningBucket = (THREADS: Thread[], initialThreadId: string | null): string => {
  const t = initialThreadId ? THREADS.find((x) => x.id === initialThreadId) : undefined;
  const had = ixPlace().bucket;
  if (t) return typeof had === "string" && had && (had === "all" || ixBucketOf(t) === had) ? had : bucketOf(t);
  return typeof had === "string" && had ? had : firstBucketWithThreads(THREADS);
};

/** A seeded thread with what the session decided on it laid over: snoozed, or done with the choice made. */
const withDecision = (t: Thread, d: Decision): Thread => {
  if (d.kind === "snoozed") return { ...t, state: "snoozed", wake: d.wake, unread: false };
  return { ...t, state: "done", unread: false, resolution: d };
};

/** What a re-read of the Inbox moves: the setters the follower of reads (ixFollowReads) is given, and the refs it reads. */
interface FollowReads {
  setThreads: Dispatch<SetStateAction<Thread[]>>;
  setKeepOpenId: Dispatch<SetStateAction<string | null>>;
  setActiveBucket: Dispatch<SetStateAction<string>>;
  setActiveThreadId: Dispatch<SetStateAction<string | null>>;
  shownRef: RefObject<Thread | null>;
  routeThreadRef: RefObject<string | null>;
}

// SurfaceData seam: a real-data swap replaces window.INBOX_DATA.THREADS —
// reseed local state (real threads never live in IX_STORE).
const ixFollowReads = ({
  setThreads,
  setKeepOpenId,
  setActiveBucket,
  setActiveThreadId,
  shownRef,
  routeThreadRef,
}: FollowReads) => {
  const reseed = () =>
    setThreads(
      (inboxData().THREADS || []).map((t) => {
        const d = IX_STORE.get(t.id);
        if (!d || t.real) return { ...t };
        return withDecision(t, d);
      }),
    );
  const onSwap = () => {
    const list = inboxData().THREADS || [];
    // The thread on screen stays open though this read moves it out of its bucket. What happened to it is said by
    // the pane, where the thread lives (ThreadPane).
    const shown = shownRef.current;
    if (shown && shown.real && list.some((x) => x.id === shown.id)) setKeepOpenId(shown.id);
    reseed();
    if (!list.length) return;
    // A bucket the member picked stays picked, even when this read empties it: an empty list says so, where being
    // moved somewhere else a moment after the tap looked like the tap had failed. Nothing picked yet is the other
    // case -- the first read of a workspace whose threads are all Handled opens on Handled, not on an empty Needs
    // you. Asked by the list's own rule (ixBucketOf), not by a thread's state: a reply counting down holds "done"
    // while it stands in Needs you, and a bucket of only those read as empty.
    setActiveBucket((b) => {
      const picked = ixPlace().bucket;
      if (picked) return b;
      return list.some((x) => ixBucketOf(x) === b) ? b : firstBucketWithThreads(list);
    });
    // A thread the route still names stays selected though the list does not hold it: the pane keeps
    // saying it is missing, where clearing it let the refresh open the first thread in its place.
    setActiveThreadId((id) =>
      list.some((x) => x.id === id) || (id !== null && id === routeThreadRef.current) ? id : null,
    );
  };
  window.addEventListener("surface:inbox", onSwap);
  return () => window.removeEventListener("surface:inbox", onSwap);
};

/** A target that can say what is over it: an element, and anything a test stands in for one. */
interface Closer {
  closest: (selector: string) => unknown;
}
const isCloser = (v: unknown): v is Closer =>
  typeof v === "object" && v !== null && "closest" in v && typeof v.closest === "function";

/** The tag of an event's target, when it is an element: nothing for a target that has none. */
const tagOf = (target: EventTarget | null): string =>
  target && "tagName" in target && typeof target.tagName === "string" ? target.tagName : "";

/** Whether an event's target is a field of free text the member is writing in. */
const isEditable = (target: EventTarget | null): boolean =>
  !!(target && "isContentEditable" in target && target.isContentEditable);

// A key the page leaves alone: a chord, one another listener took or one pressed in a dialog, or one typed in a field.
export const ixKeyLeft = (e: KeyboardEvent): boolean => {
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  // Not a key something else took, and not one pressed inside a dialog over the page (the deal sheet, any
  // aria-modal): an arrow on its select moved the thread behind it, and A on its buttons approved.
  if (e.defaultPrevented || (isCloser(e.target) && e.target.closest('[aria-modal="true"]'))) return true;
  const tag = tagOf(e.target).toLowerCase();
  if (tag === "input" || tag === "textarea" || isEditable(e.target)) return true;
  return false;
};

/** The page's door to the address: the record of the entry the page itself moved, and the three moves that use it. */
interface InboxAddress {
  ownRouteRef: RefObject<string | null>;
  goTo: (id: string | null) => void;
  openThread: (id: string) => void;
  closeThread: () => void;
}

/**
 * The Inbox's one door to the address, and a record that the page moved it itself. A thread the address gains from
 * OUTSIDE -- the bell, a link, a cold boot -- takes a phone's screen; one the page wrote itself does not. A desktop's
 * read replaces the address, so Back leaves the Inbox rather than replaying every thread read. On a phone the address
 * names a thread only while it is the screen (a bucket's first thread, written for the desktop's pane, opened it on a
 * refresh), and a tap makes it an entry of its own: Back -- the browser's, Android's, the app's -- closes it to its
 * list, and the thread's own Back is that same step. One the address brought closes to its list in place.
 */
const useInboxAddress = (
  initialThreadId: string | null,
  setPhoneThreadOpen: Dispatch<SetStateAction<boolean>>,
): InboxAddress => {
  const ownRouteRef = useRef<string | null>(initialThreadId);
  const phoneEntryRef = useRef<string | null>(null);
  const goTo = (id: string | null) => {
    ownRouteRef.current = id && !ixOnPhone() ? id : null;
    if (canNavigate()) appNavigate(ownRouteRef.current ? `inbox/${ownRouteRef.current}` : "inbox", { replace: true });
  };
  const openThread = (id: string) => {
    if (!ixOnPhone() || !canNavigate()) return goTo(id);
    ownRouteRef.current = id;
    phoneEntryRef.current = `inbox/${id}`;
    appNavigate(`inbox/${id}`);
  };
  const closeThread = () => {
    if (phoneEntryRef.current === currentRoute()) return window.history.back();
    setPhoneThreadOpen(false);
    goTo(null);
  };
  return { ownRouteRef, goTo, openThread, closeThread };
};

/** The page's state: every cell, its setter, and the refs the effects keep. */
export interface InboxState extends Omit<InboxAddress, "ownRouteRef"> {
  threads: Thread[];
  setThreads: Dispatch<SetStateAction<Thread[]>>;
  activeBucket: string;
  setActiveBucket: Dispatch<SetStateAction<string>>;
  activeThreadId: string | null;
  setActiveThreadId: Dispatch<SetStateAction<string | null>>;
  selected: string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
  bulkBusy: string | null;
  setBulkBusy: Dispatch<SetStateAction<string | null>>;
  bulkRunRef: RefObject<boolean>;
  phoneThreadOpen: boolean;
  setPhoneThreadOpen: Dispatch<SetStateAction<boolean>>;
  activeView: string | null;
  setActiveView: Dispatch<SetStateAction<string | null>>;
  listedHere: (t: Thread) => boolean;
  stale: Stale | null;
  setStale: Dispatch<SetStateAction<Stale | null>>;
  keepOpenId: string | null;
  setKeepOpenId: Dispatch<SetStateAction<string | null>>;
  shownRef: RefObject<Thread | null>;
  toastNode: ReactNode;
  ppFlash: (flash: Flash) => void;
  planParams: Record<string, number>;
  setPlanParams: Dispatch<SetStateAction<Record<string, number>>>;
}

/**
 * The page's state, in the order the page always declared it, and the effects that keep it true: the address
 * followed, a re-read landing (ixFollowReads), the mockup's scripted concurrent change, and the sidebar's count.
 */
export const useInboxState = (THREADS: Thread[], initialThreadId: string | null): InboxState => {
  const [threads, setThreads] = useState<Thread[]>(() =>
    THREADS.map((t) => {
      // Overlay session decisions (made here or from Tasks) so state survives navigation
      const d = IX_STORE.get(t.id);
      return d ? withDecision(t, d) : { ...t };
    }),
  );
  const [activeBucket, setActiveBucket] = useState<string>(() => ixOpeningBucket(THREADS, initialThreadId));
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    // The bucket's first row opens first, in the list's own order (ixRank): a reply about to send, then a thread that
    // needs you. A teammate's thread opened in its place (I2).
    initialThreadId ||
      (
        THREADS.find((x) => ixSending(x)) ||
        THREADS.find((x) => x.state === "needs" || (x.real && x.needsYou)) ||
        THREADS[0]
      )?.id ||
      null,
  );
  const [selected, setSelected] = useState<string[]>([]);
  // A bulk act on real threads while it runs: the bar says so, and a second press asks nothing.
  const [bulkBusy, setBulkBusy] = useState<string | null>(null); // "snooze" | "archive" | "wake"
  const bulkRunRef = useRef(false);
  // On a phone the list and the thread take turns on the screen: a tap opens
  // the thread, Back returns to the list. A deep link opens straight onto the
  // thread. Desktop ignores the flag (mobile.css owns the breakpoint).
  const [phoneThreadOpen, setPhoneThreadOpen] = useState(!!initialThreadId);
  const [activeView, setActiveView] = useState<string | null>(null);
  // Whether the bucket (or view) on screen lists a thread: the one rule the list and the pane both follow.
  const viewFilter = activeView ? IX_VIEW_FILTERS[activeView] : null;
  const listedHere = (t: Thread) =>
    viewFilter ? !!viewFilter(t) : activeBucket === "all" || ixBucketOf(t) === activeBucket;
  const [stale, setStale] = useState<Stale | null>(null); // { threadId, update } — concurrent change waiting to merge
  // A real re-read that moves the open thread: the thread kept on screen though its bucket no longer lists it --
  // never another customer's in its place. What happened to it, the pane says (ThreadPane).
  const [keepOpenId, setKeepOpenId] = useState<string | null>(null);
  const shownRef = useRef<Thread | null>(null);
  const firedRef = useRef<Record<string, boolean>>({});
  const [toastNode, ppFlash] = useToast();
  const [planParams, setPlanParams] = useState<Record<string, number>>({}); // per-thread plan-param pick — lifted so hotkey A and the button write the same record

  // The thread the route names, as of this render, for the re-read below: its listener is bound once.
  const routeThreadRef = useRef<string | null>(initialThreadId);
  routeThreadRef.current = initialThreadId;
  const { ownRouteRef, goTo, openThread, closeThread } = useInboxAddress(initialThreadId, setPhoneThreadOpen);

  // Deep-link follows later navigations too
  useEffect(
    () => {
      // An address naming no thread is the list: Back from a thread on a phone lands here, and the thread closes.
      if (!initialThreadId) {
        ownRouteRef.current = null;
        setPhoneThreadOpen(false);
        return;
      }
      const t = threads.find((x) => x.id === initialThreadId);
      // The address follows every click now (selectThread), so a thread the bucket on screen lists keeps that bucket:
      // one picked in All stays in All.
      if (!t) return;
      setActiveThreadId(initialThreadId);
      if (!listedHere(t)) setActiveBucket(bucketOf(t));
      // Only a thread the address gained from outside opens over a phone's list. A tap has already opened its own
      // (selectThread), and a bucket picked opens none.
      if (ownRouteRef.current !== initialThreadId) setPhoneThreadOpen(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kept as the JSX drew it: follows the address alone, so a re-read never re-opens the thread
    [initialThreadId],
  );

  // Real threads carry the answer (viewmodel `needsYou`) rather than having it
  // re-derived here — this count drives the sidebar badge, and Today used to
  // dispatch a DIFFERENT number over the top of it. Seeded mockup threads keep
  // the demo rule, since "needs" is a state real threads can never hold. A reply
  // about to send waits on you too, by the one rule above (ixWaitsOnYou).
  const needsCount = threads.filter((t) => ixWaitsOnYou(t)).length;

  useEffect(
    () => ixFollowReads({ setThreads, setKeepOpenId, setActiveBucket, setActiveThreadId, shownRef, routeThreadRef }),
    [],
  );

  // Concurrent change: while you READ a scripted thread, something lands on it.
  // Arm on open, fire once, clear if you navigate away first — never a silent
  // overwrite; the thread pane shows a Refresh banner.
  useEffect(() => {
    if (!demoSession() || activeThreadId === null) return undefined;
    const cfg = IX_CONCURRENT[activeThreadId];
    if (!cfg || firedRef.current[activeThreadId]) return undefined;
    const timer = setTimeout(() => {
      firedRef.current[activeThreadId] = true;
      setStale({ threadId: activeThreadId, update: cfg });
    }, cfg.afterMs || STALE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [activeThreadId]);

  // Sidebar badge sync
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("inbox:counts", { detail: { needs: needsCount } }));
  }, [needsCount]);

  return {
    threads,
    setThreads,
    activeBucket,
    setActiveBucket,
    activeThreadId,
    setActiveThreadId,
    selected,
    setSelected,
    bulkBusy,
    setBulkBusy,
    bulkRunRef,
    phoneThreadOpen,
    setPhoneThreadOpen,
    activeView,
    setActiveView,
    listedHere,
    stale,
    setStale,
    keepOpenId,
    setKeepOpenId,
    shownRef,
    toastNode,
    ppFlash,
    planParams,
    setPlanParams,
    goTo,
    openThread,
    closeThread,
  };
};

/** The moves every verb shares: a real thread's verbs, the stale change merged, the toast, the queue, a thread opened. */
export const inboxMoves = (ix: InboxState) => {
  const {
    threads,
    setThreads,
    listedHere,
    setActiveBucket,
    setActiveView,
    setActiveThreadId,
    setPhoneThreadOpen,
    setKeepOpenId,
    stale,
    setStale,
    ppFlash,
    openThread,
  } = ix;
  // Real-thread verbs commit through the API and the re-read repaints: no local mutation, no IX_STORE -- the server
  // owns state. They are the one thread's (threadVerbs), so a verb means the same here and in Conversations.
  const { verb: realVerb, hold: realHold } = threadVerbs(ppFlash);

  const reconcile = () => {
    if (!stale) return;
    const { threadId, update } = stale;
    mutate(threadId, (x) => ({ ...x, unread: true, timeline: [...x.timeline, ...update.append] }));
    setStale(null);
    const behind = update.append.filter((e) => e.type === "msg").length;
    ppFlash({
      msg: (
        <>
          <b>{update.by}</b>'s reply is now in view — you were {behind} message behind
        </>
      ),
    });
  };

  const flash = (msg: ReactNode, prev: Snap | null = null) =>
    ppFlash({
      msg,
      undo: prev
        ? () => {
            IX_STORE.clear(prev.id);
            mutate(prev.id, (x) =>
              patched(x, {
                state: prev.state,
                timeline: prev.timeline,
                resolution: prev.resolution,
                unread: prev.unread,
                wake: undefined,
              }),
            );
            setActiveThreadId(prev.id);
          }
        : null,
    });

  const nextNeedsAfter = (id: string): string | null => {
    const rank: Record<string, number> = { P1: 0, P2: 1, P3: 2 };
    const rest = threads
      .filter((t) => t.state === "needs" && t.id !== id)
      .sort((a, b) => (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9));
    return rest[0]?.id || null;
  };

  const mutate: Mutate = (id, fn) => setThreads((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));

  // Opening a thread clears its unread dot; Mark as unread sets it back (one honest meaning of "unread").
  // On a real thread the dot means it needs you (the view model's needsYou), so opening it changes nothing: it
  // cleared, and the next read lit it again (I2). A seeded thread's dot is its unread one.
  // A search spans every bucket (inbox-list.tsx), so a thread picked from it may live in another: its own bucket opens
  // with it. The pane looked only in the bucket on screen and fell to that bucket's first thread -- another customer,
  // with the reply meant for this one in its composer.
  const selectThread = (id: string) => {
    const t = threads.find((x) => x.id === id);
    if (t && !listedHere(t)) {
      setActiveBucket(bucketOf(t));
      setActiveView(null);
      ixKeepPlace({ bucket: ixBucketOf(t) });
    }
    setActiveThreadId(id);
    setPhoneThreadOpen(true);
    setKeepOpenId(null);
    mutate(id, (x) => (x.unread && !x.real ? { ...x, unread: false } : x));
    // The thread open is the address's: a refresh opens it again and the crumbs name it.
    openThread(id);
  };
  const markUnread = (id: string) => {
    mutate(id, (x) => ({ ...x, unread: true }));
    ppFlash({
      msg: (
        <>
          <b>Marked unread</b> — bumped to the top of your list
        </>
      ),
    });
  };
  return { realVerb, realHold, reconcile, flash, nextNeedsAfter, mutate, selectThread, markUnread };
};

export type InboxMoves = ReturnType<typeof inboxMoves>;

/** Puts a seeded lead's stage back where the verdict found it. */
const stageKeeper = (lead: SeededLead) => {
  const stage = lead.stage;
  return () => {
    lead.stage = stage;
  };
};

/** The words the verdict writes on the thread's timeline. */
const verdictWords = (est: number, opt: VerdictOption): string =>
  `Verdict: ${opt.label} — ${opt.verb === "interested" ? "AI stands down; any inbound reopens with context" : opt.verb === "deal" ? `tracked in Pipeline · $${(est || 0).toLocaleString()} est. — AI handles admin only` : "client record live; service comms resume"}`;

/** The verdict after a meeting, on the thread it spawned. */
export const inboxVerdict = (ix: InboxState & InboxMoves) => {
  const { threads, activeBucket, setActiveThreadId, ppFlash, nextNeedsAfter, mutate } = ix;
  // ---- Verdict gate: the ONE post-meeting human decision (closed set) ----
  const verdictDecide = (id: string, opt: VerdictOption) => {
    if (!canDo("approve")) return;
    const t = threads.find((x) => x.id === id);
    if (!t || !t.verdict) return;
    const verdict = t.verdict;
    const prev = snapOf(t);
    const lead = seededLeads().find((l) => l.id === verdict.leadId);
    const putStageBack = lead ? stageKeeper(lead) : null;
    if (lead) lead.stage = opt.verb === "interested" ? "nurture" : "converted";
    IX_STORE.set(id, { action: opt.label, at: IX_NOW, kind: "decided" });
    mutate(id, (x) => ({
      ...x,
      state: "done",
      unread: false,
      resolution: { action: opt.label, at: IX_NOW },
      timeline: [...x.timeline, { type: "event", kind: "decision", at: IX_NOW, body: verdictWords(verdict.est, opt) }],
    }));
    let dealAdded = false;
    const deals = seededDeals();
    if (opt.verb === "deal" && deals && !deals.some((x) => x.id === "d-gabby")) {
      deals.unshift({
        id: "d-gabby",
        stage: "qualified",
        who: t.who,
        initials: "GM",
        clientId: null,
        label: "Consult follow-on",
        value: verdict.est || 0,
        inStage: "now",
        agent: { glyph: "Q", name: "Qualifier" },
        next: "Yours — agents do admin only",
        threadId: t.id,
        source: "IG reel · verdict",
      });
      dealAdded = true;
    }
    window.dispatchEvent(new CustomEvent("leads:verdict", { detail: { leadId: verdict.leadId, verdict: opt.verb } }));
    if (opt.verb === "client")
      window.dispatchEvent(
        new CustomEvent("leads:converted", { detail: { leadId: verdict.leadId, name: t.who, clientId: null } }),
      );
    ppFlash({
      msg: (
        <>
          <b>{opt.label}</b> — {t.who}
        </>
      ),
      links: [
        {
          label: opt.verb === "deal" ? "Pipeline" : opt.verb === "client" ? "Clients" : "Leads",
          to: opt.verb === "deal" ? "pipeline" : opt.verb === "client" ? "clients" : "clients/leads",
        },
      ],
      undo: () => {
        IX_STORE.clear(id);
        if (putStageBack) putStageBack();
        if (dealAdded) {
          const P = seededDeals();
          const i = P ? P.findIndex((x) => x.id === "d-gabby") : -1;
          if (P && i >= 0) P.splice(i, 1);
        }
        mutate(id, (x) =>
          patched(x, { state: prev.state, timeline: prev.timeline, resolution: prev.resolution, unread: prev.unread }),
        );
      },
    });
    // Same advance behavior as decide(): the queue moves on after a verdict
    if (prev.state === "needs") {
      const nxt = nextNeedsAfter(id);
      if (nxt && activeBucket === "needs") setActiveThreadId(nxt);
    }
  };
  return { verdictDecide };
};

export type InboxVerdict = ReturnType<typeof inboxVerdict>;

/** The veto window: its store, the countdown drawn again, and a hold, edit or keystroke on a draft. */
export const useInboxVeto = (ix: InboxState & InboxMoves) => {
  const { threads, ppFlash, realHold } = ix;
  // ---- Veto window: third autonomy mode — safe drafts auto-send unless held ----
  const VW = VW_STORE;
  const [vetoTick, setVetoTick] = useState(0);
  // Only animate while there is actually a countdown. This tree has no
  // memoisation, so an unconditional 1Hz timer re-rendered the entire Inbox
  // once a second, forever, to move a number that isn't there. Real threads
  // carry a veto draft only while one is genuinely held server-side — gated on
  // the DATA rather than on __DEMO_MODE, because the presence listener below
  // is the Away->Available unfreeze path and must keep working either way.
  const hasLiveVeto = threads.some((t) => t.veto);
  useEffect(
    () => {
      VW_UTIL.seed(threads);
      const onPres = () => setVetoTick((n) => n + 1);
      window.addEventListener("presence:changed", onPres);
      const iv = hasLiveVeto ? window.setInterval(() => setVetoTick((n) => n + 1), TICK_MS) : null;
      return () => {
        if (iv) window.clearInterval(iv);
        window.removeEventListener("presence:changed", onPres);
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kept as the JSX drew it: the clock is armed by whether a countdown exists, and the threads are seeded once it does
    [hasLiveVeto],
  );
  // Real threads count down to the SERVER's deadline. VW_UTIL owns a simulated
  // timer for the mockup; borrowing it here would mean the number on screen and
  // the moment the job actually fires were two different clocks.
  // Hold, edit or type on a real draft: server-side, by the one thread's hold (threadVerbs); the countdown here is
  // drawn again as it changes.
  const realVetoAct = (t: RealThread, act: string) => realHold(t, act, () => setVetoTick((n) => n + 1));

  const vetoRemaining = (id: string): number | null => {
    const t = threads.find((x) => x.id === id);
    if (t && t.real) {
      if (!t.veto) return null;
      if (ixHeld(VW.state, t)) return null; // withdrawn, by the draft's own record — no countdown
      // A real draft always has its deadline (the view model gives it): without one the countdown is not a number.
      return Math.max(0, Math.ceil(((t.veto.endsAtMs ?? NaN) - Date.now()) / 1000));
    }
    return VW_UTIL.remaining(id);
  };
  const vetoAct = (id: string, act: string) => {
    const tv = threads.find((x) => x.id === id);
    if (tv && tv.real) return realVetoAct(tv, act);
    if (!canDo("approve")) return;
    const s = VW.state[id] || (VW.state[id] = {});
    if (s.sent) return;
    s.held = true;
    if (act === "edit")
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("inbox:focus-composer")), FOCUS_COMPOSER_MS);
    if (act === "hold")
      ppFlash({
        msg: <>Held — the draft won't send until you act</>,
      });
    setVetoTick((n) => n + 1);
  };
  return { VW, vetoTick, setVetoTick, vetoRemaining, vetoAct };
};

export type InboxVeto = ReturnType<typeof useInboxVeto>;

/** The record so far, once the veto window is in: what the seeded thread's verbs read. */
export type InboxSoFar = InboxState & InboxMoves & InboxVerdict & InboxVeto;

/** A draft whose window has passed: a seeded one sends; a real one is read again, never invented. */
export const useInboxAutoSend = (ix: InboxSoFar) => {
  const { threads, VW, vetoTick, mutate, ppFlash } = ix;
  useEffect(
    () => {
      threads.forEach((t) => {
        // A real draft is fired by a job, not by this browser. Inventing the
        // sent bubble here would put words in the thread that may never have
        // reached the customer — the exact fabrication this project forbids.
        // At zero the only honest move is to re-read what actually happened.
        if (t.real) {
          if (!t.veto || Date.now() < (t.veto.endsAtMs ?? NaN)) return;
          const readKey = ixDraftKey(t);
          const st = VW.state[readKey] || (VW.state[readKey] = {});
          if (st.held || !ixReadAgain(st, Date.now())) return;
          void refreshInbox();
          return;
        }
        const veto = t.veto;
        if (!veto) return;
        const s = VW.state[t.id];
        if (!s || s.held || s.sent || !s.endsAt || Date.now() < s.endsAt) return;
        s.sent = true;
        const prev = snapOf(t);
        IX_STORE.set(t.id, { action: "Auto-sent", at: IX_NOW, kind: "decided" });
        mutate(t.id, (x) => ({
          ...x,
          state: "done",
          unread: false,
          resolution: { action: "Auto-sent", at: IX_NOW },
          timeline: [
            ...x.timeline,
            { type: "msg", from: "agent", channel: x.primaryChannel, at: IX_NOW, body: veto.draft },
            {
              type: "event",
              kind: "decision",
              at: IX_NOW,
              body: `Auto-sent after the ${veto.window || 30}s veto window — no action taken · logged`,
            },
          ],
        }));
        ppFlash({
          msg: (
            <>
              Auto-sent to <b>{t.who}</b> — veto window passed
            </>
          ),
          undo: () => {
            IX_STORE.clear(t.id);
            mutate(t.id, (x) =>
              patched(x, {
                state: prev.state,
                timeline: prev.timeline,
                resolution: prev.resolution,
                unread: prev.unread,
              }),
            );
          },
        });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kept as the JSX drew it: a draft is looked at once a tick, not whenever the threads change
    [vetoTick],
  );
};
