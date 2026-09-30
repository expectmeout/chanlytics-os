/* global React, InboxThread, EmptyState, useSurface */
// ThreadPane — the conversation, wherever it opens (docs/plans/2026-09-21-one-thread.md).
//
// The Inbox drew a conversation with InboxThread and Conversations drew the same one with CvViewer: two headers, two
// sets of bubbles, two sets of actions. Every fix landed once -- #746 split an email's quoted chain in one of them and
// the other printed it in full -- and the second screen could not act: "View thread in Inbox" opened the first. This
// is the one. Given a thread it draws InboxThread and owns the verbs a real thread has. There are two, and both go to
// the server: the verb, and the hold on a draft counting down. A real thread keeps no state in the page -- the verb
// goes out and the surface:inbox re-read repaints -- so the pane moves no state; it is code both tabs run. The
// mockup's seeded threads keep the Inbox's own handlers, which the Inbox passes in as `mock`.

// ---- A draft counting down, by its own record ----

// A draft's own record in the veto store: a hold belongs to the draft it held. Kept against the thread, the next
// draft on that thread read "Held — manual send" while the server sent it (I3). A seeded draft keeps the thread's.
const ixDraftKey = (t) => (t.real && t.veto && t.veto.messageId ? `draft:${t.veto.messageId}` : t.id);
const ixHeld = (state, t) => !!(state[ixDraftKey(t)] || {}).held;

// Past a real draft's deadline the only honest move is to go and look -- and to look again while the draft is still
// there: the job fires on a ten-second tick, and one read at zero left "Auto-sends in 0s" until something else moved (I3).
const IX_READ_AGAIN_MS = 5000;
const IX_READ_AGAIN_TRIES = 6;
const ixReadAgain = (st, nowMs) => {
  if ((st.tries || 0) >= IX_READ_AGAIN_TRIES || (st.lastTry != null && nowMs - st.lastTry < IX_READ_AGAIN_MS)) return false;
  st.tries = (st.tries || 0) + 1;
  st.lastTry = nowMs;
  return true;
};

// Seconds left on a real draft's countdown, to the server's own deadline; none when there is no draft or it is held.
const tpVetoLeft = (t, nowMs = Date.now()) => {
  if (!t || !t.real || !t.veto) return null;
  if (ixHeld(((window.VW_STORE || {}).state) || {}, t)) return null;
  return Math.max(0, Math.ceil((t.veto.endsAtMs - nowMs) / 1000));
};

// ---- What changed on the open thread between two reads ----

// What changed on the open thread between two reads, in the words the pane shows. The Inbox is
// read again whenever anything moves, and each read used to repaint the open thread in silence.
const IX_BUCKET_WORDS = { escalated: "Needs you", done: "Handled", snoozed: "Snoozed" };
const ixRepaintNotice = (before, after, answerer = null) => {
  if (!before || !after || before.id !== after.id) return null;
  if (!before.claimedByOther && after.claimedByOther) return `${answerer || "A teammate"} took this conversation`;
  if (before.state !== after.state || !!before.archived !== !!after.archived) {
    if (after.archived) return "Archived";
    if (after.state === "snoozed") return after.wake ? `Snoozed until ${after.wake}` : "Snoozed";
    if (before.state === "snoozed" && after.state === "escalated") return "Back in Needs you";
    return `Moved to ${IX_BUCKET_WORDS[after.state] || after.state}`;
  }
  const was = (before.timeline || []).length;
  const now = (after.timeline || []).length;
  if (now > was && (after.lastAtMs || 0) > (before.lastAtMs || 0)) {
    const last = after.timeline[now - 1];
    if (last && last.from === "client") return `${after.who} wrote again`;
    return last && last.byYou ? "Someone on the team replied" : "The receptionist replied";
  }
  return null;
};

// Your own verbs in flight, counted across every pane and the Inbox's bulk acts: the re-read each one makes is not
// news for the pane -- its toast has already said what happened.
const TP_OWN = (window.__threadOwnVerbs = window.__threadOwnVerbs || { n: 0 });

// ---- The two verbs of a real thread ----

// Spoken through the host's toast (usePPToast), so one page keeps one stack.
const threadVerbs = (flash) => {
  // Real-thread verbs commit through the API; the re-read repaints. No local mutation, no IX_STORE -- the server owns
  // state. reply, reply-template, take-over, hand-back, snooze, wake, archive; resolves true when the server took it.
  const verb = (t, name, payload, okMsg, undoable) => {
    if (!window.__inboxVerb) return Promise.resolve(false);
    // An act on the thread's state is said the moment the server takes it (onAccepted), not once the Inbox, the
    // threads and Today have been read again behind it; the pane still repaints from that re-read, and the act is
    // counted as yours until it lands, so it is never announced to you. A reply is said with its receipt (the Undo
    // window), which only the server's answer carries.
    let saidEarly = false;
    const early = name === "reply" || name === "reply-template"
      ? undefined
      : () => { saidEarly = true; flash({ msg: <><b>{t.who}</b> — {okMsg}</> }); };
    TP_OWN.n += 1;
    return window.__inboxVerb(t, name, payload, early ? { onAccepted: early } : undefined).finally(() => { TP_OWN.n -= 1; }).then((r) => {
      // An email reply whose address is not the one they wrote from waits on a yes: the server says where it will
      // go, and the yes is the same words sent again naming that address. The composer keeps the words meanwhile.
      if (!r.ok && r.confirmEmailTo && name === "reply") {
        flash({ tone: "warn", msg: <>{r.message}</>, ms: 20000, action: { label: `Send to ${r.confirmEmailTo}`, onClick: () => verb(t, name, { ...payload, emailTo: r.confirmEmailTo }, okMsg, undoable).then((ok) => { if (ok) window.dispatchEvent(new CustomEvent("inbox:reply-sent", { detail: { threadId: t.id } })); }) } });
        return false;
      }
      if (!r.ok) { flash({ tone: "danger", msg: <>{r.message}</> }); return false; }
      if (saidEarly) return true;
      const mid = undoable && r.data && r.data.message_id;
      // The receipt says exactly how long the send can still be stopped; the
      // toast, and its Undo, live that long -- not the six seconds a plain
      // confirmation gets, which used to take the Undo away with nine to spare.
      const untilMs = mid && r.data.cancelable_until ? Date.parse(r.data.cancelable_until) - Date.now() : null;
      const secs = untilMs && untilMs > 0 ? Math.round(untilMs / 1000) : null;
      flash({
        msg: <><b>{t.who}</b> — {okMsg}{secs ? <> · sends in {secs} s unless you undo</> : null}</>,
        ms: untilMs && untilMs > 0 ? untilMs : undefined,
        undo: mid ? () => window.__cancelSend(mid).then((c) => flash({
          tone: c.ok ? "ok" : "danger",
          msg: c.ok ? <>Send canceled — nothing was delivered</> : <>{c.message}</>,
        })) : null,
      });
      return true;
    });
  };

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
   *
   * `bump` draws the countdown again, wherever it is shown.
   */
  const hold = (t, act, bump = () => {}) => {
    if (!window.canDo("approve")) return;
    const VW = (window.VW_STORE = window.VW_STORE || { state: {} });
    const heldKey = ixDraftKey(t);
    const st = VW.state[heldKey] || (VW.state[heldKey] = {});
    if (act === "edit") {
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("inbox:focus-composer")), 60);
      return;
    }
    if (act !== "hold" && act !== "type") return;
    if (st.held || !t.veto || !window.__cancelSend) return;
    st.held = true;                       // optimistic: stops the countdown now
    bump();
    window.__cancelSend(t.veto.messageId).then((r) => {
      if (r.ok) {
        flash({ msg: <>Held — <b>{t.who}</b> was not sent the draft</> });
      } else {
        // It may already have gone out. Say so rather than leaving the UI
        // claiming a hold that never happened.
        st.held = false;
        bump();
        flash({ tone: "danger", msg: <>{r.message}</> });
      }
    });
  };

  return { verb, hold };
};

// ---- The pane ----

// `thread`: the one the Inbox holds (a seeded one carries the mockup's overlays). `threadId`: the one a Conversations
// row carries, found in the Inbox's store -- every workspace surface boots together, and the Inbox reads the same
// GET conversations page Conversations lists. `flash`: the host's toast; alone, the pane keeps its own stack.
// `mock`: the Inbox's own handlers for a seeded thread, which only the mockup reaches. `focusMessageId`: the message
// it opens at instead of its newest -- a call, opened from Conversations.
const ThreadPane = ({ thread: given = null, threadId = null, onBack = null, onOpenClient = () => {}, notice = null, flash = null, mock = null, focusMessageId = null }) => {
  const [ownToast, ownFlash] = window.usePPToast();
  const say = flash || ownFlash;
  const [, redraw] = React.useReducer((n) => n + 1, 0);
  // What a re-read did to the open thread, said on it -- kept against its id, so it never shows over another one.
  const [repaint, setRepaint] = React.useState(null); // { threadId, words }
  const shownRef = React.useRef(null);
  const store = () => ((window.INBOX_DATA || {}).THREADS) || [];
  const t = given || (threadId ? store().find((x) => x.id === threadId) : null) || null;
  shownRef.current = t;
  const standalone = !given;

  // A re-read: draw the thread as it now is, and say what happened to it -- unless it was your own act.
  React.useEffect(() => {
    const onSwap = () => {
      const shown = shownRef.current;
      const next = shown && shown.real ? store().find((x) => x.id === shown.id) : null;
      if (next && TP_OWN.n === 0) {
        const words = ixRepaintNotice(shown, next, window.ixAnswerer ? window.ixAnswerer(next) : null);
        if (words) setRepaint({ threadId: shown.id, words });
      }
      redraw();
    };
    window.addEventListener("surface:inbox", onSwap);
    return () => window.removeEventListener("surface:inbox", onSwap);
  }, []);
  // A call's card reads the calls Conversations holds (inbox-thread.jsx tlCallFor): drawn again when they are read.
  useSurface("conversations");

  // Alone, the pane keeps its own draft's countdown and looks again at zero. Inside the Inbox, the list's tick draws
  // it and the list looks again for every thread it holds.
  const live = !!(standalone && t && t.real && t.veto);
  const liveId = live ? t.id : null;
  React.useEffect(() => {
    if (!live) return undefined;
    const tick = () => {
      const cur = shownRef.current;
      if (cur && cur.real && cur.veto && Date.now() >= cur.veto.endsAtMs) {
        const VW = (window.VW_STORE = window.VW_STORE || { state: {} });
        const st = VW.state[ixDraftKey(cur)] || (VW.state[ixDraftKey(cur)] = {});
        if (!st.held && ixReadAgain(st, Date.now()) && window.__refreshInbox) window.__refreshInbox();
      }
      redraw();
    };
    const iv = window.setInterval(tick, 1000);
    window.addEventListener("presence:changed", redraw);
    return () => { window.clearInterval(iv); window.removeEventListener("presence:changed", redraw); };
  }, [live, liveId]);

  const labels = ((window.INBOX_DATA || {}).CHANNEL_LABELS) || {};
  if (!t) {
    // An empty bucket in the Inbox: the thread's own empty state.
    if (!threadId) return <InboxThread thread={null} onBack={onBack} channelLabels={labels} {...(mock || {})} />;
    // Asked for by id before the Inbox's read has it: say it is on its way, and open nobody else's in its place.
    return (
      <div className="ix-thread-pane tp-opening" data-testid="tp-opening">
        <EmptyState
          kind="page"
          glyph="chat"
          title="Opening this conversation…"
          body="It shows here as soon as it has been read."
          action={window.__refreshInbox ? { label: "Read it again", onClick: () => window.__refreshInbox() } : null}
        />
      </div>
    );
  }

  // Your notice first (a link's "isn't among the newest"), then what a re-read did to this thread.
  const words = notice || (repaint && repaint.threadId === t.id ? repaint.words : null);
  if (!t.real) {
    // The mockup's seeded thread, drawn as the Inbox always drew it.
    return <InboxThread thread={t} onBack={onBack} channelLabels={labels} onOpenClient={onOpenClient} notice={words} {...(mock || {})} />;
  }

  const { verb, hold } = threadVerbs(say);
  const can = () => window.canDo("approve");
  return (
    <>
      {!flash && ownToast}
      <InboxThread
        thread={t}
        onBack={onBack}
        channelLabels={labels}
        onOpenClient={onOpenClient}
        notice={words}
        focusMessageId={focusMessageId}
        veto={tpVetoLeft(t)}
        vetoPaused={!!(window.PR_STORE && window.PR_STORE.away)}
        onVetoAct={(_id, act) => hold(t, act, redraw)}
        // The role first, for every verb: a real thread's hand-back used to skip the check and reach the server.
        onDecide={(_id, action) => { if (can() && action === "__HANDBACK__") verb(t, "hand-back", undefined, "cleared — the receptionist is answering again"); }}
        onSnooze={() => { if (can() && t.state !== "snoozed") verb(t, "snooze", {}, "snoozed until tomorrow 10:00"); }}
        onWake={() => { if (can() && t.state === "snoozed") verb(t, "wake", {}, "awake — back in the queue"); }}
        onTakeOver={() => { if (can()) verb(t, "take-over", undefined, "you have it — the receptionist is paused"); }}
        onHandBack={() => { if (can() && t.takenOver) verb(t, "hand-back", undefined, "handed back — the receptionist resumes"); }}
        onArchive={() => { if (can()) verb(t, "archive", {}, "archived"); }}
        onSend={(_id, text) => {
          if (!can()) return undefined;
          return text && typeof text === "object" && text.template
            // Forward the CHOSEN template: a hardcoded booking_link_v1/en_US was right for one workspace and a
            // guaranteed server rejection for every other.
            ? verb(
              t,
              "reply-template",
              typeof text.template === "object" ? { template: text.template } : undefined,
              typeof text.template === "object" ? `${text.template.name} on its way` : "booking link on its way",
              true,
            )
            : verb(t, "reply", { text: String(text || "") }, "reply on its way", true);
        }}
      />
    </>
  );
};

Object.assign(window, { ThreadPane, threadVerbs, tpVetoLeft, ixDraftKey, ixHeld, ixReadAgain, ixRepaintNotice });
