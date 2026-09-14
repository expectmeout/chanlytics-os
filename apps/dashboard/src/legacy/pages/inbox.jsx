/* global React, InboxList, InboxThread, InboxAgentRail, EmptyState */
// Inbox — composition layer + decide engine.
// Three columns: list rail (320px) | thread pane (flex) | agent context rail (300px).
// Decisions are REAL here: approve/decline/snooze move threads, append timeline
// events, update counts (sidebar badge syncs via "inbox:counts"), offer undo,
// and auto-advance to the next decision. Keyboard: A approve · D decline · E edit.

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
const ixHoldAll = async (drafts, { state, cancelSend }) => {
  for (const t of drafts) state[t.id] = { ...(state[t.id] || {}), held: true };
  const real = drafts.filter((t) => t.real && t.veto && t.veto.messageId);
  const answers = await Promise.all(real.map((t) => (cancelSend
    ? cancelSend(t.veto.messageId)
    : Promise.resolve({ ok: false, message: "The Inbox could not reach the server." }))));
  const refused = [];
  answers.forEach((r, i) => {
    if (r && r.ok) return;
    const t = real[i];
    state[t.id] = { ...(state[t.id] || {}), held: false };
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

Object.assign(window, { ixHoldAll, ixRouteThread });

const Inbox = ({ density = "medium", showAgentRail = true, onOpenClient = () => {}, initialThreadId = null }) => {
  const { INBOX_BUCKETS, INBOX_VIEWS, THREADS, CHANNEL_LABELS, INBOX_BASELINE } = window.INBOX_DATA;

  const [threads, setThreads] = React.useState(() => THREADS.map((t) => {
    // Overlay session decisions (made here or from Tasks) so state survives navigation
    const d = window.IX_STORE ? window.IX_STORE.get(t.id) : null;
    if (!d) return { ...t };
    if (d.kind === "snoozed") return { ...t, state: "snoozed", wake: d.wake, unread: false };
    return { ...t, state: "done", unread: false, resolution: d };
  }));
  const firstBucketWithThreads = (list) => {
    for (const s of ["escalated", "needs", "snoozed", "done"]) {
      if (list.some((x) => x.state === s)) return s;
    }
    return "escalated";
  };
  const [activeBucket, setActiveBucket] = React.useState(() => {
    const t = initialThreadId && THREADS.find((x) => x.id === initialThreadId);
    return t ? t.state : firstBucketWithThreads(THREADS);
  });
  const [activeThreadId, setActiveThreadId] = React.useState(
    initialThreadId || (THREADS.find((x) => x.state === "needs") || THREADS[0] || {}).id || null,
  );
  const [selected, setSelected] = React.useState([]);
  // On a phone the list and the thread take turns on the screen: a tap opens
  // the thread, Back returns to the list. A deep link opens straight onto the
  // thread. Desktop ignores the flag (mobile.css owns the breakpoint).
  const [phoneThreadOpen, setPhoneThreadOpen] = React.useState(!!initialThreadId);
  const [activeView, setActiveView] = React.useState(null);
  const [stale, setStale] = React.useState(null); // { threadId, update } — concurrent change waiting to merge
  const firedRef = React.useRef({});
  const [toastNode, ppFlash] = window.usePPToast();
  const [planParams, setPlanParams] = React.useState({}); // per-thread plan-param pick — lifted so hotkey A and the button write the same record

  // Deep-link follows later navigations too
  React.useEffect(() => {
    if (!initialThreadId) return;
    const t = threads.find((x) => x.id === initialThreadId);
    if (t) { setActiveThreadId(initialThreadId); setActiveBucket(t.state); setPhoneThreadOpen(true); }
  }, [initialThreadId]);

  // Real threads carry the answer (viewmodel `needsYou`) rather than having it
  // re-derived here — this count drives the sidebar badge, and Today used to
  // dispatch a DIFFERENT number over the top of it. Seeded mockup threads keep
  // the demo rule, since "needs" is a state real threads can never hold.
  const needsCount = threads.filter(
    (t) => (t.real ? t.needsYou : t.state === "needs" || (t.state === "escalated" && !t.takenOver)),
  ).length;

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
      reseed();
      if (!list.length) return;
      setActiveBucket((b) => (list.some((x) => x.state === b) ? b : firstBucketWithThreads(list)));
      setActiveThreadId((id) => (list.some((x) => x.id === id) ? id : null));
    };
    window.addEventListener("surface:inbox", onSwap);
    return () => window.removeEventListener("surface:inbox", onSwap);
  }, []);

  // Real-thread verbs commit through the API; the override re-applies and the
  // reseed repaints. No local mutation, no IX_STORE — the server owns state.
  const realVerb = (t, verb, payload, okMsg, undoable) => {
    if (!window.__inboxVerb) return Promise.resolve(false);
    return window.__inboxVerb(t, verb, payload).then((r) => {
      if (!r.ok) { ppFlash({ tone: "danger", msg: <>{r.message}</> }); return false; }
      const mid = undoable && r.data && r.data.message_id;
      // The receipt says exactly how long the send can still be stopped; the
      // toast, and its Undo, live that long -- not the six seconds a plain
      // confirmation gets, which used to take the Undo away with nine to spare.
      const untilMs = mid && r.data.cancelable_until ? Date.parse(r.data.cancelable_until) - Date.now() : null;
      const secs = untilMs && untilMs > 0 ? Math.round(untilMs / 1000) : null;
      ppFlash({
        msg: <><b>{t.who}</b> — {okMsg}{secs ? <> · sends in {secs} s unless you undo</> : null}</>,
        ms: untilMs && untilMs > 0 ? untilMs : undefined,
        undo: mid ? () => window.__cancelSend(mid).then((c) => ppFlash({
          tone: c.ok ? "ok" : "danger",
          msg: c.ok ? <>Send canceled — nothing was delivered</> : <>{c.message}</>,
        })) : null,
      });
      return true;
    });
  };

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
  const selectThread = (id) => { setActiveThreadId(id); setPhoneThreadOpen(true); mutate(id, (x) => (x.unread ? { ...x, unread: false } : x)); };
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
      links: [{ label: opt.verb === "deal" ? "Pipeline" : opt.verb === "client" ? "Clients" : "Leads", to: opt.verb === "deal" ? "pipeline" : opt.verb === "client" ? "clients" : "leads" }],
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
  /**
   * Veto controls on a REAL thread. Every one of these commits server-side —
   * the timer belongs to a scheduled job, and a button that only changed local
   * state would leave the operator believing they had stopped something that
   * was still on its way.
   *
   *   hold  — withdraw the draft outright; nothing is sent
   *   edit  — focus the composer, which is already pre-filled with the draft;
   *           the send REPLACES it (the reply route withdraws it server-side)
   *   type  — the first keystroke means the operator is taking this one, so
   *           the draft is withdrawn ONCE rather than racing the timer
   */
  const realVetoAct = (t, act) => {
    if (!window.canDo("approve")) return;
    const st = VW.state[t.id] || (VW.state[t.id] = {});
    if (act === "edit") {
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("inbox:focus-composer")), 60);
      return;
    }
    if (act !== "hold" && act !== "type") return;
    if (st.held || !t.veto || !window.__cancelSend) return;
    st.held = true;                       // optimistic: stops the countdown now
    setVetoTick((n) => n + 1);
    window.__cancelSend(t.veto.messageId).then((r) => {
      if (r.ok) {
        ppFlash({ msg: <>Held — <b>{t.who}</b> was not sent the draft</> });
      } else {
        // It may already have gone out. Say so rather than leaving the UI
        // claiming a hold that never happened.
        st.held = false;
        setVetoTick((n) => n + 1);
        ppFlash({ tone: "danger", msg: <>{r.message}</> });
      }
    });
  };

  const vetoRemaining = (id) => {
    const t = threads.find((x) => x.id === id);
    if (t && t.real) {
      if (!t.veto) return null;
      const st = VW.state[id];
      if (st && st.held) return null;                    // withdrawn — no countdown
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
        const st = VW.state[t.id] || (VW.state[t.id] = {});
        if (st.reconciled) return;
        st.reconciled = true;
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
    const tReal = threads.find((x) => x.id === id);
    if (tReal && tReal.real) {
      if (action === "__HANDBACK__") realVerb(tReal, "hand-back", undefined, "cleared — the receptionist is answering again");
      return;
    }
    if (!window.canDo("approve")) return;
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
  const bulkSnooze = () => {
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

  const viewFilter = activeView ? IX_VIEW_FILTERS[activeView] : null;
  const visible = viewFilter
    ? threads.filter(viewFilter)
    : threads.filter((t) => activeBucket === "all" || t.state === activeBucket);
  // Scoped to the VISIBLE list: an id left over from another bucket used to
  // keep a customer (with a live Snooze button) on screen beside a list that
  // said "0 threads".
  const activeThread = visible.find((t) => t.id === activeThreadId) || visible[0];
  // A deep link (People → "Open thread") to a thread outside the newest
  // hundred must not open someone else's thread in silence.
  const requestedMissing = !!initialThreadId && activeThreadId === initialThreadId && visible.length > 0 && !visible.some((t) => t.id === initialThreadId);

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
    setActiveView(null);
    setSelected([]);
    const stillVisible = activeThread && activeThread.state === id;
    if (!stillVisible) {
      const next = threads.find((t) => t.state === id);
      // An empty bucket clears the pane. Leaving the id stranded a customer —
      // with a live Snooze button — beside a list reading "0 threads".
      setActiveThreadId(next ? next.id : null);
    }
  };

  const toggleSelect = (id) => {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  };

  // Live bucket counts (done keeps its archive baseline of 48 resolved this week)
  const bucketsWithCounts = INBOX_BUCKETS.map((b) => ({
    ...b,
    count: threads.filter((t) => t.state === b.id).length + (b.id === "done" ? ((INBOX_BASELINE || {}).doneThisWeek ?? 48) : 0),
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

  return (
    <div className={`inbox ${showAgentRail ? "with-rail" : ""} ${phoneThreadOpen ? "phone-thread" : ""}`}>
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
        stake={stake}
        density={density}
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
        <InboxThread
          key={activeThread?.id}
          thread={activeThread}
          onBack={() => setPhoneThreadOpen(false)}
          channelLabels={CHANNEL_LABELS}
          stale={stale && activeThread && stale.threadId === activeThread.id ? stale : null}
          onReconcile={reconcile}
          onDismissStale={() => setStale(null)}
          onOpenClient={onOpenClient}
          onDecide={decide}
          onVerdict={verdictDecide}
          veto={activeThread ? vetoRemaining(activeThread.id) : null}
          vetoPaused={!!(window.PR_STORE && window.PR_STORE.away)}
          onVetoAct={vetoAct}
          onSnooze={snooze}
          onSend={sendReply}
          onTakeOver={takeOver}
          onWake={wake}
          onHandBack={handBack}
          onMarkUnread={markUnread}
          planParam={planParams[activeThread?.id] || 0}
          onPlanParam={(i) => activeThread && setPlanParams((m) => ({ ...m, [activeThread.id]: i }))}
        />
      )}
      {showAgentRail && !requestedMissing && <InboxAgentRail thread={activeThread} />}

      {(() => {
        const vetoLive = threads.filter((t) => t.veto && vetoRemaining(t.id) != null);
        if (vetoLive.length < 2) return null;
        const soonest = [...vetoLive].sort((a, b) => vetoRemaining(a.id) - vetoRemaining(b.id))[0];
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
            {window.PR_STORE && window.PR_STORE.away ? <span><b>{vetoLive.length} drafts</b> paused — you're away</span> : <span><b>{vetoLive.length} drafts</b> sending — soonest {vetoRemaining(soonest.id)}s</span>}
            <button className="btn btn-ghost btn-sm" onClick={() => selectThread(soonest.id)}>Review</button>
            <button className="btn btn-sm" onClick={holdAll} {...window.gate("approve")}>Hold all</button>
          </div>
        );
      })()}

      {toastNode}
    </div>
  );
};

window.Inbox = Inbox;
