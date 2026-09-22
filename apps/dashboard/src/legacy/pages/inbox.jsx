/* global React, InboxList, ThreadPane, InboxAgentRail, EmptyState */
// Inbox — composition layer + decide engine.
// Three columns: list rail (320px) | thread pane (flex) | agent context rail (300px, the mockup's: a seeded thread only).
// Decisions are REAL here: approve/decline/snooze move threads, append timeline
// events, update counts (sidebar badge syncs via "inbox:counts"), offer undo,
// and auto-advance to the next decision. Keyboard: A approve · D decline · E edit.

// The one thread's helpers and verbs (thread-pane.jsx), which loads before this page.
const { ixDraftKey, ixHeld, ixReadAgain, threadVerbs } = window;

const IX_NOW = window.CHANLY.IX_NOW;

// Saved views are real predicates, not search hacks.
const IX_VIEW_FILTERS = {
  vip: (t) => /vip/i.test(t.whoMeta) || t.tags.some((x) => /vip/i.test(x)),
  "at-risk": (t) => t.value >= 1000 && t.state !== "done",
  "high-conf": (t) => !!t.approval && t.confidence >= window.CHANLY.CONF.SAFE,
  "new-leads": (t) => /lead/i.test(t.whoMeta),
};

// Hold every draft still counting down. A real draft is a send job on the
// server, so holding it is the withdraw the single Hold makes
// (window.__cancelSend), once per draft. Every countdown stops at once; a
// draft the server refused -- it may already have gone out -- is released and
// named, never shown as held.

// A reply counting down to auto-send waits on you for those seconds: you can still stop it, and after them it is in
// your name. ONE rule for the Needs you chip, the bucket a row sits in, the order it sits in, this page's count and
// the sidebar badge, so no two of them can say different numbers. Such a thread sat in Handled with nothing on its
// row, and the countdown showed only in the pane you had to open first.
const ixSending = (t, nowMs = Date.now()) => !!(t && t.real && t.veto && t.veto.endsAtMs > nowMs
  && !ixHeld(((window.VW_STORE || {}).state) || {}, t));
// The bucket a thread belongs to: its own state, unless a reply of its own is on its way out.
const ixBucketOf = (t, nowMs = Date.now()) => (ixSending(t, nowMs) ? "escalated" : t && t.state);
// What waits on you now: a real thread nobody has taken, or a reply about to send. A seeded thread keeps the
// mockup's rule, since "needs" is a state no real thread holds.
const ixWaitsOnYou = (t, nowMs = Date.now()) => (t && t.real
  ? !!t.needsYou || ixSending(t, nowMs)
  : !!t && (t.state === "needs" || (t.state === "escalated" && !t.takenOver)));
// The order a bucket stands in: a reply about to send first, then what needs you, then the threads you have, then a
// teammate's, each group in the server's order. A teammate's thread sat above the one waiting on you (I2).
const ixRank = (t) => (ixSending(t) ? -1 : t && t.real && t.state === "escalated" ? (t.needsYou ? 0 : t.takenOver ? 1 : 2) : 0);

const ixHoldAll = async (drafts, { state, cancelSend }) => {
  for (const t of drafts) state[ixDraftKey(t)] = { ...(state[ixDraftKey(t)] || {}), held: true };
  const real = drafts.filter((t) => t.real && t.veto && t.veto.messageId);
  const answers = await Promise.all(real.map((t) => (cancelSend
    ? cancelSend(t.veto.messageId)
    : Promise.resolve({ ok: false, message: "The Inbox could not reach the server." }))));
  const refused = [];
  answers.forEach((r, i) => {
    if (r && r.ok) return;
    const t = real[i];
    state[ixDraftKey(t)] = { ...(state[ixDraftKey(t)] || {}), held: false };
    refused.push({ id: t.id, who: t.who, message: (r && r.message) || null });
  });
  return { held: drafts.length - refused.length, refused };
};

// The thread a route names. The id is passed on even when the Inbox has not
// loaded that thread: dropping it opened the first thread in the list --
// another customer's -- in silence, where the Inbox knows to say it is missing.
const ixRouteThread = (param, threads) => {
  const id = typeof param === "string" && param ? param : null;
  const found = id ? (threads || []).find((t) => t.id === id) : null;
  return { id, who: found ? found.who : null };
};

// The people a bulk act could not act on, named beside the server's sentence: grouped by the sentence,
// so twenty refused for one reason read as one line, with no more than three names in it.
const ixNames = (whos) => (whos.length > 3
  ? `${whos.slice(0, 2).join(", ")} and ${whos.length - 2} more`
  : whos.length > 1 ? `${whos.slice(0, -1).join(", ")} and ${whos[whos.length - 1]}` : whos[0] || "");
const ixRefusedWords = (refused) => {
  const by = new Map();
  for (const r of refused) by.set(r.message, [...(by.get(r.message) || []), r.thread.who]);
  return [...by].map(([message, whos]) => `${ixNames(whos)}: ${message}`).join(" ");
};

Object.assign(window, { ixHoldAll, ixSending, ixBucketOf, ixWaitsOnYou, ixRank, ixRouteThread, ixRefusedWords });

const Inbox = ({ density = "medium", showAgentRail = true, onOpenClient = () => {}, initialThreadId = null }) => {
  const { INBOX_BUCKETS, INBOX_VIEWS, THREADS, INBOX_BASELINE } = window.INBOX_DATA;

  const [threads, setThreads] = React.useState(() => THREADS.map((t) => {
    // Overlay session decisions (made here or from Tasks) so state survives navigation
    const d = window.IX_STORE ? window.IX_STORE.get(t.id) : null;
    if (!d) return { ...t };
    if (d.kind === "snoozed") return { ...t, state: "snoozed", wake: d.wake, unread: false };
    return { ...t, state: "done", unread: false, resolution: d };
  }));
  // The bucket a thread is IN, never the state it holds: one whose own reply is on its way out is in Needs you.
  const firstBucketWithThreads = (list) => {
    for (const s of ["escalated", "needs", "snoozed", "done"]) {
      if (list.some((x) => ixBucketOf(x) === s)) return s;
    }
    return "escalated";
  };
  // The bucket the member had (the Inbox's place, inbox-list.jsx ixPlace) comes back with a refresh; a thread the
  // address names opens in it when it lists that thread, and in its own bucket when it does not.
  const [activeBucket, setActiveBucket] = React.useState(() => {
    const t = initialThreadId && THREADS.find((x) => x.id === initialThreadId);
    const had = typeof window.ixPlace === "function" ? window.ixPlace().bucket : null;
    if (t) return had && (had === "all" || ixBucketOf(t) === had) ? had : ixBucketOf(t);
    return typeof had === "string" && had ? had : firstBucketWithThreads(THREADS);
  });
  const [activeThreadId, setActiveThreadId] = React.useState(
    // The bucket's first row opens first, in the list's own order (ixRank): a reply about to send, then a thread that
    // needs you. A teammate's thread opened in its place (I2).
    initialThreadId
      || (THREADS.find((x) => ixSending(x)) || THREADS.find((x) => x.state === "needs" || (x.real && x.needsYou)) || THREADS[0] || {}).id
      || null,
  );
  const [selected, setSelected] = React.useState([]);
  // A bulk act on real threads while it runs: the bar says so, and a second press asks nothing.
  const [bulkBusy, setBulkBusy] = React.useState(null); // "snooze" | "archive" | "wake"
  const bulkRunRef = React.useRef(false);
  // On a phone the list and the thread take turns on the screen: a tap opens
  // the thread, Back returns to the list. A deep link opens straight onto the
  // thread. Desktop ignores the flag (mobile.css owns the breakpoint).
  const [phoneThreadOpen, setPhoneThreadOpen] = React.useState(!!initialThreadId);
  const [activeView, setActiveView] = React.useState(null);
  // Whether the bucket (or view) on screen lists a thread: the one rule the list and the pane both follow.
  const viewFilter = activeView ? IX_VIEW_FILTERS[activeView] : null;
  const listedHere = (t) => (viewFilter ? !!viewFilter(t) : activeBucket === "all" || ixBucketOf(t) === activeBucket);
  const [stale, setStale] = React.useState(null); // { threadId, update } — concurrent change waiting to merge
  // A real re-read that moves the open thread: the thread kept on screen though its bucket no longer lists it --
  // never another customer's in its place. What happened to it, the pane says (ThreadPane).
  const [keepOpenId, setKeepOpenId] = React.useState(null);
  const shownRef = React.useRef(null);
  const firedRef = React.useRef({});
  const [toastNode, ppFlash] = window.usePPToast();
  const [planParams, setPlanParams] = React.useState({}); // per-thread plan-param pick — lifted so hotkey A and the button write the same record

  // The thread the route names, as of this render, for the re-read below: its listener is bound once.
  const routeThreadRef = React.useRef(initialThreadId);
  routeThreadRef.current = initialThreadId;

  // Deep-link follows later navigations too
  React.useEffect(() => {
    if (!initialThreadId) return;
    const t = threads.find((x) => x.id === initialThreadId);
    // The address follows every click now (selectThread), so a thread the bucket on screen lists keeps that bucket:
    // one picked in All stays in All.
    if (t) { setActiveThreadId(initialThreadId); if (!listedHere(t)) setActiveBucket(ixBucketOf(t)); setPhoneThreadOpen(true); }
  }, [initialThreadId]);

  // Real threads carry the answer (viewmodel `needsYou`) rather than having it
  // re-derived here — this count drives the sidebar badge, and Today used to
  // dispatch a DIFFERENT number over the top of it. Seeded mockup threads keep
  // the demo rule, since "needs" is a state real threads can never hold. A reply
  // about to send waits on you too, by the one rule above (ixWaitsOnYou).
  const needsCount = threads.filter((t) => ixWaitsOnYou(t)).length;

  // SurfaceData seam: a real-data swap replaces window.INBOX_DATA.THREADS —
  // reseed local state (real threads never live in IX_STORE).
  React.useEffect(() => {
    const reseed = () => setThreads(((window.INBOX_DATA || {}).THREADS || []).map((t) => {
      const d = window.IX_STORE ? window.IX_STORE.get(t.id) : null;
      if (!d || t.real) return { ...t };
      if (d.kind === "snoozed") return { ...t, state: "snoozed", wake: d.wake, unread: false };
      return { ...t, state: "done", unread: false, resolution: d };
    }));
    const onSwap = () => {
      const list = (window.INBOX_DATA || {}).THREADS || [];
      // The thread on screen stays open though this read moves it out of its bucket. What happened to it is said by
      // the pane, where the thread lives (ThreadPane).
      const shown = shownRef.current;
      if (shown && shown.real && list.some((x) => x.id === shown.id)) setKeepOpenId(shown.id);
      reseed();
      if (!list.length) return;
      setActiveBucket((b) => (list.some((x) => x.state === b) ? b : firstBucketWithThreads(list)));
      // A thread the route still names stays selected though the list does not hold it: the pane keeps
      // saying it is missing, where clearing it let the refresh open the first thread in its place.
      setActiveThreadId((id) => (list.some((x) => x.id === id) || (id !== null && id === routeThreadRef.current) ? id : null));
    };
    window.addEventListener("surface:inbox", onSwap);
    return () => window.removeEventListener("surface:inbox", onSwap);
  }, []);

  // Real-thread verbs commit through the API and the re-read repaints: no local mutation, no IX_STORE -- the server
  // owns state. They are the one thread's (threadVerbs), so a verb means the same here and in Conversations.
  const { verb: realVerb, hold: realHold } = threadVerbs(ppFlash);

  // Concurrent change: while you READ a scripted thread, something lands on it.
  // Arm on open, fire once, clear if you navigate away first — never a silent
  // overwrite; the thread pane shows a Refresh banner.
  React.useEffect(() => {
    const cfg = window.__DEMO_MODE && window.IX_CONCURRENT && window.IX_CONCURRENT[activeThreadId];
    if (!cfg || firedRef.current[activeThreadId]) return;
    const timer = setTimeout(() => {
      firedRef.current[activeThreadId] = true;
      setStale({ threadId: activeThreadId, update: cfg });
    }, cfg.afterMs || 11000);
    return () => clearTimeout(timer);
  }, [activeThreadId]);

  const reconcile = () => {
    if (!stale) return;
    const { threadId, update } = stale;
    mutate(threadId, (x) => ({ ...x, unread: true, timeline: [...x.timeline, ...update.append] }));
    setStale(null);
    ppFlash({ msg: <><b>{update.by}</b>'s reply is now in view — you were {update.append.filter(e => e.type === "msg").length} message behind</> });
  };

  // Sidebar badge sync
  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent("inbox:counts", { detail: { needs: needsCount } }));
  }, [needsCount]);

  const flash = (msg, prev = null) => ppFlash({
    msg,
    undo: prev ? () => {
      if (window.IX_STORE) window.IX_STORE.clear(prev.id);
      mutate(prev.id, (x) => ({ ...x, state: prev.state, timeline: prev.timeline, resolution: prev.resolution, unread: prev.unread, wake: undefined }));
      setActiveThreadId(prev.id);
    } : null,
  });

  const nextNeedsAfter = (id) => {
    const rank = { P1: 0, P2: 1, P3: 2 };
    const rest = threads
      .filter((t) => t.state === "needs" && t.id !== id)
      .sort((a, b) => (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9));
    return rest[0]?.id || null;
  };

  const mutate = (id, fn) => setThreads((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));

  // Opening a thread clears its unread dot; Mark as unread sets it back (one honest meaning of "unread").
  // On a real thread the dot means it needs you (the view model's needsYou), so opening it changes nothing: it
  // cleared, and the next read lit it again (I2). A seeded thread's dot is its unread one.
  // A search spans every bucket (inbox-list.jsx), so a thread picked from it may live in another: its own bucket opens
  // with it. The pane looked only in the bucket on screen and fell to that bucket's first thread -- another customer,
  // with the reply meant for this one in its composer.
  const selectThread = (id) => {
    const t = threads.find((x) => x.id === id);
    if (t && !listedHere(t)) { setActiveBucket(ixBucketOf(t)); setActiveView(null); window.ixKeepPlace({ bucket: ixBucketOf(t) }); }
    setActiveThreadId(id); setPhoneThreadOpen(true); setKeepOpenId(null); mutate(id, (x) => (x.unread && !x.real ? { ...x, unread: false } : x));
    // The thread open is the address's, replaced: a refresh opens it again, the crumbs name it, and Back leaves the
    // Inbox rather than replaying every thread read.
    if (window.appNavigate) window.appNavigate(`inbox/${id}`, { replace: true });
  };
  const markUnread = (id) => { mutate(id, (x) => ({ ...x, unread: true })); ppFlash({ msg: <><b>Marked unread</b> — bumped to the top of your list</> }); };

  // ---- Verdict gate: the ONE post-meeting human decision (closed set) ----
  const verdictDecide = (id, opt) => {
    if (!window.canDo("approve")) return;
    const t = threads.find((x) => x.id === id);
    if (!t || !t.verdict) return;
    const prev = { id, state: t.state, timeline: t.timeline, resolution: t.resolution, unread: t.unread };
    const lead = (window.LEADS || []).find((l) => l.id === t.verdict.leadId);
    const prevStage = lead && lead.stage;
    if (lead) lead.stage = opt.verb === "interested" ? "nurture" : "converted";
    if (window.IX_STORE) window.IX_STORE.set(id, { action: opt.label, at: IX_NOW, kind: "decided" });
    mutate(id, (x) => ({
      ...x, state: "done", unread: false,
      resolution: { action: opt.label, at: IX_NOW },
      timeline: [...x.timeline, { type: "event", kind: "decision", at: IX_NOW, body: `Verdict: ${opt.label} — ${opt.verb === "interested" ? "AI stands down; any inbound reopens with context" : opt.verb === "deal" ? `tracked in Pipeline · $${(t.verdict.est || 0).toLocaleString()} est. — AI handles admin only` : "client record live; service comms resume"}` }],
    }));
    let dealAdded = false;
    if (opt.verb === "deal" && window.PIPELINE_DATA && window.PIPELINE_DATA.PIPELINE_DEALS && !window.PIPELINE_DATA.PIPELINE_DEALS.some((x) => x.id === "d-gabby")) {
      window.PIPELINE_DATA.PIPELINE_DEALS.unshift({
        id: "d-gabby", stage: "qualified", who: t.who, initials: "GM", clientId: null,
        label: "Consult follow-on", value: t.verdict.est || 0, inStage: "now",
        agent: { glyph: "Q", name: "Qualifier" }, next: "Yours — agents do admin only",
        threadId: t.id, source: "IG reel · verdict",
      });
      dealAdded = true;
    }
    window.dispatchEvent(new CustomEvent("leads:verdict", { detail: { leadId: t.verdict.leadId, verdict: opt.verb } }));
    if (opt.verb === "client") window.dispatchEvent(new CustomEvent("leads:converted", { detail: { leadId: t.verdict.leadId, name: t.who, clientId: null } }));
    ppFlash({
      msg: <><b>{opt.label}</b> — {t.who}</>,
      links: [{ label: opt.verb === "deal" ? "Pipeline" : opt.verb === "client" ? "Clients" : "Leads", to: opt.verb === "deal" ? "pipeline" : opt.verb === "client" ? "clients" : "clients/leads" }],
      undo: () => {
        if (window.IX_STORE) window.IX_STORE.clear(id);
        if (lead) lead.stage = prevStage;
        if (dealAdded) { const P = window.PIPELINE_DATA.PIPELINE_DEALS; const i = P.findIndex((x) => x.id === "d-gabby"); if (i >= 0) P.splice(i, 1); }
        mutate(id, (x) => ({ ...x, state: prev.state, timeline: prev.timeline, resolution: prev.resolution, unread: prev.unread }));
      },
    });
    // Same advance behavior as decide(): the queue moves on after a verdict
    if (prev.state === "needs") {
      const nxt = nextNeedsAfter(id);
      if (nxt && activeBucket === "needs") setActiveThreadId(nxt);
    }
  };

  // ---- Veto window: third autonomy mode — safe drafts auto-send unless held ----
  const VW = window.VW_STORE = window.VW_STORE || { state: {} };
  const [vetoTick, setVetoTick] = React.useState(0);
  // Only animate while there is actually a countdown. This tree has no
  // memoisation, so an unconditional 1Hz timer re-rendered the entire Inbox
  // once a second, forever, to move a number that isn't there. Real threads
  // carry a veto draft only while one is genuinely held server-side — gated on
  // the DATA rather than on __DEMO_MODE, because the presence listener below
  // is the Away->Available unfreeze path and must keep working either way.
  const hasLiveVeto = threads.some((t) => t.veto);
  React.useEffect(() => {
    window.VW_UTIL.seed(threads);
    const onPres = () => setVetoTick((n) => n + 1);
    window.addEventListener("presence:changed", onPres);
    const iv = hasLiveVeto ? window.setInterval(() => setVetoTick((n) => n + 1), 1000) : null;
    return () => {
      if (iv) window.clearInterval(iv);
      window.removeEventListener("presence:changed", onPres);
    };
  }, [hasLiveVeto]);
  // Real threads count down to the SERVER's deadline. VW_UTIL owns a simulated
  // timer for the mockup; borrowing it here would mean the number on screen and
  // the moment the job actually fires were two different clocks.
  // Hold, edit or type on a real draft: server-side, by the one thread's hold (threadVerbs); the countdown here is
  // drawn again as it changes.
  const realVetoAct = (t, act) => realHold(t, act, () => setVetoTick((n) => n + 1));

  const vetoRemaining = (id) => {
    const t = threads.find((x) => x.id === id);
    if (t && t.real) {
      if (!t.veto) return null;
      if (ixHeld(VW.state, t)) return null;              // withdrawn, by the draft's own record — no countdown
      return Math.max(0, Math.ceil((t.veto.endsAtMs - Date.now()) / 1000));
    }
    return window.VW_UTIL.remaining(id);
  };
  const vetoAct = (id, act) => {
    const tv = threads.find((x) => x.id === id);
    if (tv && tv.real) return realVetoAct(tv, act);
    if (!window.canDo("approve")) return;
    const s = VW.state[id] || (VW.state[id] = {});
    if (s.sent) return;
    s.held = true;
    if (act === "edit") window.setTimeout(() => window.dispatchEvent(new CustomEvent("inbox:focus-composer")), 60);
    if (act === "hold") ppFlash({ msg: <>Held — the draft won't send until you act</> });
    setVetoTick((n) => n + 1);
  };
  React.useEffect(() => {
    threads.forEach((t) => {
      // A real draft is fired by a job, not by this browser. Inventing the
      // sent bubble here would put words in the thread that may never have
      // reached the customer — the exact fabrication this project forbids.
      // At zero the only honest move is to re-read what actually happened.
      if (t.real) {
        if (!t.veto || Date.now() < t.veto.endsAtMs) return;
        const readKey = ixDraftKey(t);
        const st = VW.state[readKey] || (VW.state[readKey] = {});
        if (st.held || !ixReadAgain(st, Date.now())) return;
        if (window.__refreshInbox) window.__refreshInbox();
        return;
      }
      if (!t.veto) return;
      const s = VW.state[t.id];
      if (!s || s.held || s.sent || !s.endsAt || Date.now() < s.endsAt) return;
      s.sent = true;
      const prev = { id: t.id, state: t.state, timeline: t.timeline, resolution: t.resolution, unread: t.unread };
      if (window.IX_STORE) window.IX_STORE.set(t.id, { action: "Auto-sent", at: IX_NOW, kind: "decided" });
      mutate(t.id, (x) => ({
        ...x, state: "done", unread: false,
        resolution: { action: "Auto-sent", at: IX_NOW },
        timeline: [...x.timeline,
          { type: "msg", from: "agent", channel: x.primaryChannel, at: IX_NOW, body: t.veto.draft },
          { type: "event", kind: "decision", at: IX_NOW, body: `Auto-sent after the ${t.veto.window || 30}s veto window — no action taken · logged` }],
      }));
      ppFlash({
        msg: <>Auto-sent to <b>{t.who}</b> — veto window passed</>,
        undo: () => {
          if (window.IX_STORE) window.IX_STORE.clear(t.id);
          mutate(t.id, (x) => ({ ...x, state: prev.state, timeline: prev.timeline, resolution: prev.resolution, unread: prev.unread }));
        },
      });
    });
  }, [vetoTick]);

  const decide = (id, action, meta = {}) => {
    // The role first, for a real thread too: its hand-back used to skip this check and reach the server.
    if (!window.canDo("approve")) return;
    const tReal = threads.find((x) => x.id === id);
    if (tReal && tReal.real) {
      if (action === "__HANDBACK__") realVerb(tReal, "hand-back", undefined, "cleared — the receptionist is answering again");
      return;
    }
    const t = threads.find((x) => x.id === id);
    if (!t) return;
    const prev = { id, state: t.state, timeline: t.timeline, resolution: t.resolution, unread: t.unread };
    const declined = /decline/i.test(action);
    if (window.IX_STORE) window.IX_STORE.set(id, { action, at: IX_NOW, declined, kind: "decided", param: meta.param || null });
    mutate(id, (x) => ({
      ...x,
      state: "done",
      unread: false,
      resolution: { action, at: IX_NOW, declined, param: meta.param || null },
      timeline: [...x.timeline, { type: "event", kind: "decision", at: IX_NOW, body: `You chose \u201c${action}\u201d${meta.param ? ` \u00b7 ${meta.param}` : ""} \u2014 ${declined ? `${x.agent.name} is handling the fallback${(x.approval && x.approval.fallback) ? `: ${x.approval.fallback}` : ""}` : `${x.agent.name} is executing`}` }],
    }));
    flash(`${action}${meta.param ? ` \u00b7 ${meta.param}` : ""} \u2014 ${t.who}`, prev);
    if (t.state === "needs") {
      const nxt = nextNeedsAfter(id);
      if (nxt && activeBucket === "needs") setActiveThreadId(nxt);
    }
  };

  const snooze = (id, wake = "tomorrow 10:00", opts = {}) => {
    if (!window.canDo("approve")) return null;
    const t = threads.find((x) => x.id === id);
    if (!t || t.state === "snoozed") return null;
    if (t.real) { realVerb(t, "snooze", {}, "snoozed until tomorrow 10:00"); return null; }
    const prev = { id, state: t.state, timeline: t.timeline, resolution: t.resolution, unread: t.unread };
    if (window.IX_STORE) window.IX_STORE.set(id, { action: "Snoozed", at: IX_NOW, kind: "snoozed", wake });
    mutate(id, (x) => ({ ...x, state: "snoozed", wake, unread: false }));
    if (!opts.silent) flash(`Snoozed until ${wake} \u2014 ${t.who}`, prev);
    if (!opts.silent && activeBucket === "needs") {
      const nxt = nextNeedsAfter(id);
      if (nxt) setActiveThreadId(nxt);
    }
    return prev;
  };

  const wake = (id) => {
    if (!window.canDo("approve")) return;
    const t = threads.find((x) => x.id === id);
    if (!t || t.state !== "snoozed") return;
    if (t.real) { realVerb(t, "wake", {}, "awake — back in the queue"); return; }
    const wakeAt = t.wake;
    if (window.IX_STORE) window.IX_STORE.clear(id);
    mutate(id, (x) => ({ ...x, state: "needs", wake: undefined, unread: true }));
    setActiveBucket("needs");
    setActiveThreadId(id);
    ppFlash({
      msg: <>Woke <b>{t.who}</b> — back in Needs you</>,
      undo: () => {
        if (window.IX_STORE) window.IX_STORE.set(id, { action: "Snoozed", at: IX_NOW, kind: "snoozed", wake: wakeAt });
        mutate(id, (x) => ({ ...x, state: "snoozed", wake: wakeAt, unread: false }));
      },
    });
  };

  const archiveThread = (id, opts = {}) => {
    if (!window.canDo("approve")) return null;
    const t = threads.find((x) => x.id === id);
    if (!t) return null;
    if (t.real) { realVerb(t, "archive", {}, "archived"); return null; }
    const prev = { id, state: t.state, timeline: t.timeline, resolution: t.resolution, unread: t.unread };
    if (window.IX_STORE) window.IX_STORE.set(id, { action: "Archived", at: IX_NOW, kind: "decided" });
    mutate(id, (x) => ({ ...x, state: "done", unread: false, resolution: { action: "Archived", at: IX_NOW } }));
    if (!opts.silent) flash(`Archived \u2014 ${t.who}`, prev);
    return prev;
  };

  const sendReply = (id, text, viaApproval) => {
    if (!window.canDo("approve")) return;
    if (VW.state[id] && !VW.state[id].sent) VW.state[id].held = true; // your reply replaces the queued draft
    const t = threads.find((x) => x.id === id);
    if (!t) return;
    if (t.real) {
      return text && typeof text === "object" && text.template
        // Forward the CHOSEN template. This passed undefined, so the courier
        // fell back to a hardcoded booking_link_v1/en_US — right for one
        // workspace, a guaranteed server rejection for every other.
        ? realVerb(
            t,
            "reply-template",
            typeof text.template === "object" ? { template: text.template } : undefined,
            typeof text.template === "object" ? `${text.template.name} on its way` : "booking link on its way",
            true,
          )
        : realVerb(t, "reply", { text: String(text || "") }, "reply on its way", true);
    }
    if (window.IX_STORE && (viaApproval || t.state === "drafts")) {
      window.IX_STORE.set(id, { action: viaApproval ? "Approved & sent" : "Sent", at: IX_NOW, kind: "decided" });
    }
    mutate(id, (x) => ({
      ...x,
      unread: false,
      state: viaApproval || x.state === "drafts" ? "done" : x.state,
      resolution: viaApproval || x.state === "drafts" ? { action: viaApproval ? "Approved & sent" : "Sent", at: IX_NOW } : x.resolution,
      timeline: [
        ...x.timeline,
        { type: "msg", from: "agent", channel: x.primaryChannel, at: IX_NOW, body: text, byYou: true },
      ],
    }));
    // Honest claim: cite the channel; link the conversation only when one exists
    const convo = t.clientId && (((window.CONVERSATIONS_DATA || {}).CONVERSATIONS) || []).find(v => v.clientId === t.clientId);
    ppFlash({
      msg: <>Sent to <b>{t.who}</b> via {((window.INBOX_DATA || {}).CHANNEL_LABELS || {})[t.primaryChannel] || t.primaryChannel}</>,
      links: convo ? [{ label: "View conversation", to: `conversations/${convo.id}` }] : [],
    });
  };

  const takeOver = (id) => {
    if (!window.canDo("approve")) return;
    const tReal = threads.find((x) => x.id === id);
    if (tReal && tReal.real) { realVerb(tReal, "take-over", undefined, "you have it — the receptionist is paused"); return; }
    if (VW.state[id] && !VW.state[id].sent) VW.state[id].held = true; // one voice — agent timer dies
    mutate(id, (x) => ({
      ...x,
      takenOver: true,
      timeline: [...x.timeline, { type: "event", kind: "takeover", at: IX_NOW, body: "You took this thread \u2014 agents stand down" }],
    }));
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("inbox:focus-composer")), 60);
  };

  const handBack = (id) => {
    if (!window.canDo("approve")) return;
    const t = threads.find((x) => x.id === id);
    if (!t || !t.takenOver) return;
    if (t.real) { realVerb(t, "hand-back", undefined, "handed back — the receptionist resumes"); return; }
    mutate(id, (x) => ({
      ...x,
      takenOver: false,
      timeline: [...x.timeline, { type: "event", kind: "takeover", at: IX_NOW, body: `Handed back \u2014 ${x.agent.name} resumes with your replies as context` }],
    }));
    ppFlash({
      msg: <>Handed back to <b>{t.agent.name}</b> — it resumes with your replies as context</>,
      undo: () => mutate(id, (x) => ({ ...x, takenOver: true, timeline: x.timeline.slice(0, -1) })),
    });
  };


  // Bulk actions
  const bulkApproveSafe = () => {
    const picks = selected.map((id) => threads.find((t) => t.id === id)).filter(Boolean);
    if (!window.canDo("approve")) return;
    const safe = picks.filter((t) => t.approval && t.confidence >= window.CHANLY.CONF.SAFE && t.state !== "done");
    safe.forEach((t) => {
      if (window.IX_STORE) window.IX_STORE.set(t.id, { action: t.approval.recommended, at: IX_NOW, kind: "decided" });
      mutate(t.id, (x) => ({
        ...x, state: "done", unread: false,
        resolution: { action: x.approval.recommended, at: IX_NOW },
        timeline: [...x.timeline, { type: "event", kind: "decision", at: IX_NOW, body: `You approved \u201c${(x.approval.plan || {}).label || x.approval.recommended}\u201d (bulk) \u2014 ${x.agent.name} is executing` }],
      }));
    });
    flash(safe.length === 0
      ? "None are safe to bulk-approve \u2014 all below 80% confidence"
      : `${safe.length} approved \u00b7 ${picks.length - safe.length} need${picks.length - safe.length === 1 ? "s" : ""} individual review`);
    setSelected([]);
  };
  // A bulk act on real threads is one act. Each thread went through the single verb: a toast apiece on a
  // stack that keeps three, a re-read of three surfaces apiece, no count, no busy state and no Undo (the
  // wiring audit's A19). Now one ask per thread through the bulk courier and one re-read at its end, one
  // toast with the count and each refusal named, and the refused left selected to try again.
  const runBulk = async (picks, verb) => {
    if (bulkRunRef.current || !window.__inboxBulk) return null;
    bulkRunRef.current = true;
    setBulkBusy(verb);
    // One of your own acts: its re-read is not news for the open pane (thread-pane.jsx counts these).
    const own = window.__threadOwnVerbs || (window.__threadOwnVerbs = { n: 0 });
    own.n += 1;
    try {
      return await window.__inboxBulk(picks, verb);
    } finally {
      own.n -= 1;
      bulkRunRef.current = false;
      setBulkBusy(null);
    }
  };
  const wakeAgain = async (snoozed) => {
    const r = await runBulk(snoozed, "wake");
    if (!r) return;
    ppFlash(r.refused.length
      ? { tone: "danger", msg: <><b>{r.done.length} of {snoozed.length}</b> woken — {ixRefusedWords(r.refused)}</> }
      // A snooze lets go of whoever had the thread (core snooze clears the claim and the pause), so waking it
      // brings it back to the Inbox, not back where it was (I2).
      : { msg: <>Snooze undone — <b>{r.done.length}</b> back in the Inbox</> });
  };
  const bulkReal = async (verb) => {
    if (!window.canDo("approve")) return;
    const picks = selected.map((id) => threads.find((t) => t.id === id)).filter((t) => t && t.real);
    const todo = picks.filter((t) => (verb === "snooze" ? t.state !== "snoozed" : !t.archived));
    if (!todo.length) {
      ppFlash({ tone: "info", msg: <>{verb === "snooze" ? "Those are snoozed already" : "Those are archived already"}</> });
      return;
    }
    const r = await runBulk(todo, verb);
    if (!r) return;
    setSelected(r.refused.map((x) => x.thread.id));
    const past = verb === "snooze" ? "snoozed" : "archived";
    const undo = verb === "snooze" && r.done.length ? () => wakeAgain(r.done) : null;
    if (r.refused.length) {
      ppFlash({ tone: "danger", msg: <>{r.done.length ? <><b>{r.done.length} of {todo.length}</b> {past}</> : <>Nothing was {past}</>} — {ixRefusedWords(r.refused)}</>, undo });
    } else {
      ppFlash({ msg: verb === "snooze" ? <><b>{r.done.length}</b> snoozed until tomorrow 10:00</> : <><b>{r.done.length}</b> archived — if they write again, they come back</>, undo });
    }
  };
  const isRealPick = () => selected.some((id) => (threads.find((t) => t.id === id) || {}).real);
  const bulkSnooze = () => {
    if (isRealPick()) return bulkReal("snooze");
    const prevs = selected.map((id) => snooze(id, "tomorrow 10:00", { silent: true })).filter(Boolean);
    if (prevs.length) ppFlash({
      msg: <><b>{prevs.length}</b> snoozed · wake tomorrow 10:00</>,
      undo: () => prevs.forEach((p) => {
        if (window.IX_STORE) window.IX_STORE.clear(p.id);
        mutate(p.id, (x) => ({ ...x, state: p.state, timeline: p.timeline, resolution: p.resolution, unread: p.unread, wake: undefined }));
      }),
    });
    setSelected([]);
  };
  const bulkArchive = () => {
    if (isRealPick()) return bulkReal("archive");
    const prevs = selected.map((id) => archiveThread(id, { silent: true })).filter(Boolean);
    if (prevs.length) ppFlash({
      msg: <><b>{prevs.length}</b> archived</>,
      undo: () => prevs.forEach((p) => {
        if (window.IX_STORE) window.IX_STORE.clear(p.id);
        mutate(p.id, (x) => ({ ...x, state: p.state, timeline: p.timeline, resolution: p.resolution, unread: p.unread }));
      }),
    });
    setSelected([]);
  };

  // The bucket's rows, in the one order (ixRank): a reply about to send, then what needs you, then the threads you
  // have, then a teammate's. A thread whose own reply is on its way out stands in Needs you while it counts down.
  const visible = threads.filter(listedHere).sort((a, b) => ixRank(a) - ixRank(b));
  // Scoped to the VISIBLE list: an id left over from another bucket used to
  // keep a customer (with a live Snooze button) on screen beside a list that
  // said "0 threads".
  // A thread a re-read moved out of this bucket stays on screen (keepOpenId): the pane used to fall
  // to the first thread in the list, another customer's, and a half-written reply went with it.
  const activeThread = visible.find((t) => t.id === activeThreadId)
    || (keepOpenId && keepOpenId === activeThreadId ? threads.find((t) => t.id === keepOpenId) : null)
    || visible[0];
  // A deep link (People → "Open thread") to a thread outside the newest
  // hundred must not open someone else's thread in silence. Loaded is the test,
  // not listed: a thread the Inbox holds in another bucket is not missing.
  const requestedMissing = !!initialThreadId && activeThreadId === initialThreadId && visible.length > 0 && !threads.some((t) => t.id === initialThreadId);
  // The thread on screen, for the next re-read to compare with; none while a link's notice stands.
  shownRef.current = requestedMissing ? null : activeThread || null;

  // Keyboard: A approve recommended · D decline · E focus composer
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;
      const k = e.key.toLowerCase();
      if (k === "j" || k === "k" || e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!visible.length) return;
        e.preventDefault();
        const dir = (k === "j" || e.key === "ArrowDown") ? 1 : -1;
        const idx = visible.findIndex((t) => t.id === activeThreadId);
        const next = visible[Math.min(visible.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + dir))];
        if (next) selectThread(next.id);
        return;
      }
      const t = threads.find((x) => x.id === activeThreadId);
      if (!t || !t.approval || t.state === "done") return;
      if (k === "a") { e.preventDefault(); const p = t.approval.plan && t.approval.plan.param; const idx = planParams[t.id] || 0; decide(t.id, t.approval.recommended, p ? { param: (p.options[idx] || {}).label } : {}); }
      else if (k === "d") { e.preventDefault(); decide(t.id, "Decline"); }
      else if (k === "e") { e.preventDefault(); window.dispatchEvent(new CustomEvent("inbox:focus-composer")); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [threads, activeThreadId, visible, planParams]);

  const handleBucket = (id) => {
    setActiveBucket(id);
    window.ixKeepPlace({ bucket: id });
    setActiveView(null);
    setSelected([]);
    setKeepOpenId(null);
    // By the list's own rule (ixBucketOf): a reply counting down stands in Needs you whatever its state says.
    const stillVisible = activeThread && (id === "all" || ixBucketOf(activeThread) === id);
    if (!stillVisible) {
      const next = [...threads].sort((a, b) => ixRank(a) - ixRank(b)).find((t) => id === "all" || ixBucketOf(t) === id);
      // An empty bucket clears the pane. Leaving the id stranded a customer —
      // with a live Snooze button — beside a list reading "0 threads".
      setActiveThreadId(next ? next.id : null);
      if (window.appNavigate) window.appNavigate(next ? `inbox/${next.id}` : "inbox", { replace: true });
    }
  };

  const toggleSelect = (id) => {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  };

  // Live bucket counts (done keeps its archive baseline of 48 resolved this week)
  // The Needs you chip counts what needs you, the badge's number (needsCount): it counted every flagged thread, yours
  // and a teammate's too, and a thread you have just answered stays flagged for the whole pause (I2). A reply about
  // to send counts here and sits in this bucket, by that same rule, and leaves Handled while it counts down.
  const bucketsWithCounts = INBOX_BUCKETS.map((b) => ({
    ...b,
    count: threads.filter((t) => (t.real && b.id === "escalated" ? ixWaitsOnYou(t) : ixBucketOf(t) === b.id)).length + (b.id === "done" ? ((INBOX_BASELINE || {}).doneThisWeek ?? 48) : 0),
  }));
  const viewsWithCounts = INBOX_VIEWS.map((v) => ({
    ...v,
    count: IX_VIEW_FILTERS[v.id] ? threads.filter(IX_VIEW_FILTERS[v.id]).length : v.count,
  }));

  // Needs-bucket stake summary
  const needsThreads = threads.filter((t) => t.state === "needs");
  const stake = {
    count: needsThreads.length,
    dollars: needsThreads.reduce((a, t) => a + (t.value || 0), 0),
    oldest: needsThreads.reduce((a, t) => Math.max(a, t.waitingMin || 0), 0),
  };

  // The agent rail is the mockup's, drawn for a seeded thread only. On a real one it invented the
  // receptionist -- an autonomy line and a voice nobody set, an Ask box answering with canned text, a
  // menu to a page this release hides (D11; the wiring audit's A3 and A17) -- and with no thread to show
  // it kept an empty column.
  const railThread = showAgentRail && !requestedMissing && activeThread && !activeThread.real ? activeThread : null;

  return (
    <div className={`inbox ${railThread ? "with-rail" : ""} ${phoneThreadOpen ? "phone-thread" : ""}`}>
      <InboxList
        threads={visible}
        allThreads={threads}
        buckets={bucketsWithCounts}
        views={viewsWithCounts}
        activeView={activeView}
        onViewChange={(id) => { setActiveView((v) => (v === id ? null : id)); setSelected([]); }}
        activeBucket={activeBucket}
        onBucketChange={handleBucket}
        activeThreadId={activeThread?.id}
        onSelectThread={selectThread}
        selected={selected}
        onToggleSelect={toggleSelect}
        onClearSelection={() => setSelected([])}
        onBulkApprove={bulkApproveSafe}
        onBulkSnooze={bulkSnooze}
        onBulkArchive={bulkArchive}
        bulkBusy={bulkBusy}
        stake={stake}
        density={density}
        sendingIn={vetoRemaining}
      />
      {requestedMissing ? (
        // A link to a thread outside the loaded list: say so in the pane, and
        // open nobody else's conversation in its place.
        <EmptyState
          kind="page"
          glyph="inbox"
          title="That conversation isn't among the newest shown here"
          body="The Inbox loads the newest threads first. Open the person in People to find this one — no other conversation opens in its place."
          action={{ label: "Open People", to: "clients" }}
          also={{ label: "Show the Inbox", onClick: () => { setActiveThreadId(null); setPhoneThreadOpen(false); } }}
          testid="inbox-missing-thread"
        />
      ) : (
        // The one thread (thread-pane.jsx): a real thread's verbs are the pane's own, the same in Conversations. A
        // seeded thread is the mockup's, and keeps this page's handlers.
        <ThreadPane
          key={activeThread?.id}
          thread={activeThread}
          onBack={() => setPhoneThreadOpen(false)}
          onOpenClient={onOpenClient}
          flash={ppFlash}
          mock={{
            stale: stale && activeThread && stale.threadId === activeThread.id ? stale : null,
            onReconcile: reconcile,
            onDismissStale: () => setStale(null),
            onDecide: decide,
            onVerdict: verdictDecide,
            veto: activeThread ? vetoRemaining(activeThread.id) : null,
            vetoPaused: !!(window.PR_STORE && window.PR_STORE.away),
            onVetoAct: vetoAct,
            onSnooze: snooze,
            onSend: sendReply,
            onTakeOver: takeOver,
            onWake: wake,
            onHandBack: handBack,
            onMarkUnread: markUnread,
            onArchive: archiveThread,
            planParam: planParams[activeThread?.id] || 0,
            onPlanParam: (i) => activeThread && setPlanParams((m) => ({ ...m, [activeThread.id]: i })),
          }}
        />
      )}
      {railThread && <InboxAgentRail thread={railThread} />}

      {(() => {
        const vetoLive = threads.filter((t) => t.veto && vetoRemaining(t.id) != null);
        if (vetoLive.length < 2) return null;

        // The same withdraw the single Hold makes, per draft (ixHoldAll): the
        // countdowns stop at once, and a draft the server refused is named.
        const holdAll = async () => {
          if (!window.canDo("approve")) return;
          const pending = window.ixHoldAll(vetoLive, { state: VW.state, cancelSend: window.__cancelSend });
          setVetoTick((n) => n + 1);
          const r = await pending;
          setVetoTick((n) => n + 1);
          ppFlash(r.refused.length
            ? { tone: "danger", msg: <><b>{r.held} of {vetoLive.length} drafts</b> held — {r.refused.map((x) => x.who).join(", ")} may already have gone out</> }
            : { msg: <><b>{r.held} drafts</b> held — nothing sends until you act</> });
        };
        return (
          <div className="ix-sending-strip">
            <span className="ix-veto-dot"></span>
            {/* Which threads they are, and how long each has, is on their own rows now, at the top of Needs you: this
                strip is here for the one act that spans them. It said the soonest seconds and offered a Review that
                opened the row above it. */}
            {window.PR_STORE && window.PR_STORE.away ? <span><b>{vetoLive.length} drafts</b> paused — you're away</span> : <span><b>{vetoLive.length} drafts</b> about to send</span>}
            <button className="btn btn-sm" onClick={holdAll} {...window.gate("approve")}>Hold all</button>
          </div>
        );
      })()}

      {toastNode}
    </div>
  );
};

window.Inbox = Inbox;
