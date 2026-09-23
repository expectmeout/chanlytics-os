/* global React, Icon, Confirm */
// AskReal: Ask as the Line (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 6). One line over the
// page with the three standing in it; under it the rows (home, typing, Earlier), the trace while Ask reads, or the
// answer, Say · Show · Do (ask-turn.jsx); a conversation folds above it. Reopening resumes the conversation until Clear.
// This file is the shell: the state of one open Line, its keys and the turn runner. The rows are ask-home.jsx's, the
// words ask-text.jsx's and the hooks ask-hooks.jsx's; everything that talks to the workspace goes through window.__ask.
// No key symbol is drawn (D17): the Keyboard shortcuts sheet in the user menu lists the keys (contracts SHORTCUTS).

const useArState = React.useState;
const useArEffect = React.useEffect;
const useArRef = React.useRef;

/** Folded turns shown above the line before "+N earlier in this conversation". */
const AR_FOLDED = 3;

const arRoute = () => {
  const h = (window.location.hash || "").replace(/^#\/?/, "");
  const [page, ...rest] = h.split("/");
  return { page: page || "today", param: rest.length ? rest.join("/") : null };
};

const arScopeLabel = (page, param) => {
  if (!param) return null;
  const T = (window.INBOX_DATA || {}).THREADS || [];
  if (page === "inbox") { const t = T.find((x) => x.id === param); return t ? t.who : null; }
  if (page === "clients") { const p = ((window.__PEOPLE || {}).rows || []).find((x) => x.id === param); return p ? p.name : null; }
  if (page === "conversations" && param.startsWith("cv-")) {
    const L = window.__LIVE || {};
    const c = [...(L.now || []), ...(L.recent || [])].find((x) => x.callId === param.slice(3));
    return c ? c.who : null;
  }
  return null;
};

const arScopeIcon = (s) => (s.kind === "call" ? "phone" : s.kind === "person" ? "users" : s.kind === "page" ? "arrow-right" : "chat");

const arFailed = (id, text) => ({ id, role: "assistant", text, failed: true, citations: [], followups: [], proposals: [], atMs: Date.now() });

/** A conversation as its questions and the turns that answered them, in order. */
const arTurns = (messages) => {
  const out = [];
  for (const m of messages) {
    if (m.role === "user") out.push({ q: m, a: null });
    else if (out.length && !out[out.length - 1].a) out[out.length - 1].a = m;
    else out.push({ q: null, a: m });
  }
  return out;
};

const arPhone = () => !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);
const arStill = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

// Where the three come from as the Line opens: the top bar's button, where it is drawn. On a phone the ✦ is gone
// before the sheet rises (app-shell.jsx draws it only while Ask is closed), so the sheet's own rise is the motion.
const arFaceFrom = () => {
  if (typeof document === "undefined" || !document.querySelector) return null;
  const el = document.querySelector('[data-testid="tb-ask-face"]');
  return el && el.getBoundingClientRect().width ? el : null;
};

const AskReal = ({ open, onClose }) => {
  const A = window.__ask;
  const H = window.AskHooks;
  const { buildLineRows, AskRows, flatRows } = window.AskHome;
  const { AskTurn, answerMoves } = window.AskAnswerKit;
  // Ask's face: the one mood every face follows (legacy-bridge/mascot mood.ts), standing in the line.
  const M = window.__mascot || null;
  const AskFace = window.AskFace || null;

  const [query, setQuery] = useArState("");
  const [threads, setThreads] = useArState([]);
  const [active, setActive] = useArState(null); // { id, title, messages, scope }
  const [live, setLive] = useArState(null); // the turn in flight: { q, text, traces }
  const [quick, setQuick] = useArState(null); // a quick answer, no model: { q, answer } or { q, pending: true }
  const [scope, setScope] = useArState(null);
  const [sel, setSel] = useArState(0); // the row the keys stand on
  const [move, setMove] = useArState(-1); // the answer's move they stand on, none at first
  const [lang, setLang] = useArState(() => (A ? A.language() : "en"));
  const [tick, setTick] = useArState(0);
  const [view, setView] = useArState("rows"); // "rows", or "earlier": every conversation
  const [unfolded, setUnfolded] = useArState(-1);
  const [foldAll, setFoldAll] = useArState(false);
  // The conversation a × or the Delete key asked to delete, waiting for a yes (N5).
  const [doomed, setDoomed] = useArState(null);
  const speech = H.useAskSpeech(A);
  const [toastNode, flash] = window.usePPToast();
  const inputRef = useArRef(null);
  const faceRef = useArRef(null);
  const bodyRef = useArRef(null);
  // The thread list as it is being fetched on open: a question typed before it lands still finds its twin.
  const threadsReady = useArRef(null);
  // The current turn: a turn left behind (stopped, cleared, another opened, a later question) writes nothing.
  const turnSeq = useArRef(0);
  // What the shell asked for as it opened the Line, kept until the Line is open (the wiring audit's N3).
  const asked = useArRef(null);
  const t = window.askText(lang);
  const route = arRoute();
  const surface = A ? A.surfaceFor(route.page) : "other";

  const talk = H.useAskTalk({
    lang,
    disabled: !!live,
    onWords: (words) => { setQuery(words); if (M) M.mood.hear(0.8); },
    onHeard: (heard, error) => {
      if (heard) { submit(heard); return; }
      if (error === "blocked") flash({ msg: <>{t.micBlocked}</> });
      else if (error === "not-allowed") flash({ msg: <>{t.micDenied}</> });
      else if (error && error !== "aborted" && error !== "no-speech") flash({ msg: <>{t.micFailed}</> });
    },
  });
  // A Space held on an empty line talks (6.6); where the browser cannot listen, it says so.
  const hold = H.useHoldSpace({
    empty: () => !query && !live,
    talk: { start: () => (talk.canTalk ? talk.start() : flash({ msg: <>{t.noVoice}</> })), stop: talk.stop },
  });

  // Ask's mood, said once for every face: listening while held, reading until the first words, answering while they
  // stream or are read aloud, at rest otherwise. Said while the Line is closed too, so a turn left running still shows.
  const moodState = talk.listening
    ? "listening"
    : live
      ? live.text ? "speaking" : "thinking"
      : quick && quick.pending
        ? "thinking"
        : speech.speakingId ? "speaking" : "idle";
  useArEffect(() => { if (M) M.mood.set(moodState); }, [moodState]);

  // Open: the route's scope, the threads, and the surfaces the rows read (Right now reads Today's and Broadcasts').
  useArEffect(() => {
    if (!open || !A) return;
    const r = arRoute();
    setScope(A.scopeFor(r.page, r.param, arScopeLabel(r.page, r.param)));
    threadsReady.current = A.threads().then((list) => { setThreads(list); return list; });
    const bump = () => setTick((n) => n + 1);
    const evs = ["surface:inbox", "surface:live", "surface:clients", "surface:settings", "surface:today", "surface:broadcasts"];
    evs.forEach((e) => window.addEventListener(e, bump));
    return () => evs.forEach((e) => window.removeEventListener(e, bump));
  }, [open]);

  // Open: the three move from the button into the line (a FLIP), and the button's own face hides while they stand here
  // (ask.css, body.ask-open), so there is one character. With reduced motion they are simply here.
  useArEffect(() => {
    if (!open || typeof document === "undefined") return;
    const body = document.body;
    if (body && body.classList) body.classList.add("ask-open");
    const from = arFaceFrom();
    const to = faceRef.current;
    if (from && to && to.animate && !arStill()) {
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      // Centre to centre, since a box scales about its centre.
      const dx = a.left + a.width / 2 - (b.left + b.width / 2);
      const dy = a.top + a.height / 2 - (b.top + b.height / 2);
      if (b.width)
        to.animate(
          [{ translate: `${dx}px ${dy}px`, scale: `${a.width / b.width}` }, { translate: "0 0", scale: "1" }],
          { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
    }
    return () => { if (body && body.classList) body.classList.remove("ask-open"); };
  }, [open]);

  // On a phone the line rides the keyboard: what the keyboard covers is said as --ask-kb (ask.css).
  useArEffect(() => {
    const vv = open && typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv || !vv.addEventListener || typeof document === "undefined") return;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--ask-kb", `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
    set();
    vv.addEventListener("resize", set);
    vv.addEventListener("scroll", set);
    return () => {
      vv.removeEventListener("resize", set);
      vv.removeEventListener("scroll", set);
      root.style.removeProperty("--ask-kb");
    };
  }, [open]);

  // Closed: nothing typed survives and nothing keeps reading; an open conversation comes back until Clear (D14).
  useArEffect(() => {
    if (!open) { setQuery(""); setQuick(null); setDoomed(null); setView("rows"); speech.stop(); }
  }, [open]);

  H.useAskFocus(inputRef, open && !doomed, [open, live, active, doomed, view, quick]);

  // What the shell sends as it opens the Line: a question to ask or to finish, or a thread to open (Today's band). The
  // shell opens and sends in the same moment, so the Line listens while closed too and keeps the last request.
  useArEffect(() => {
    const onSeed = (e) => { asked.current = (e && e.detail) || {}; setTick((n) => n + 1); };
    window.addEventListener("ask:seed", onSeed);
    return () => window.removeEventListener("ask:seed", onSeed);
  }, []);

  useArEffect(() => {
    if (!open || !A) return;
    // Anywhere in the Line, not only on the line: ⌘J (or Ctrl J) opens Earlier, before the browser's Downloads can;
    // Esc stops a turn in flight, else closes (the line takes Esc first when it has focus, onKey).
    const onKeys = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setView((v) => (v === "earlier" ? "rows" : "earlier"));
        return;
      }
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (live) stop();
      else onClose();
    };
    window.addEventListener("keydown", onKeys);
    // Taken once open, after the route's own scope, so a request's scope wins.
    const d = asked.current;
    if (d) {
      asked.current = null;
      if (d.about) setScope(typeof d.about === "object" ? d.about : null);
      if (d.thread) openThread({ id: d.thread });
      else if (d.mode === "compose" || !d.prompt) { setActive(null); setQuick(null); setQuery(d.prompt || ""); }
      else submit(d.prompt);
    }
    return () => window.removeEventListener("keydown", onKeys);
  });

  // A new place to stand whenever what is under the line changes; not on every piece of a streaming answer.
  useArEffect(() => { setSel(0); setMove(-1); }, [query, active, open, view, quick, !!live]);
  // A new answer starts at its top; the row or move the keys stand on stays in sight.
  useArEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [active && active.messages.length, quick, view]);
  useArEffect(() => {
    const b = bodyRef.current;
    if (!b || !b.querySelector) return;
    const el = b.querySelector(".ask-row.sel, .ask-item.sel, .ask-move.sel");
    if (!el) return;
    const top = el.offsetTop, h = el.offsetHeight;
    if (top < b.scrollTop) b.scrollTop = Math.max(0, top - 8);
    else if (top + h > b.scrollTop + b.clientHeight) b.scrollTop = top + h - b.clientHeight + 8;
  }, [sel, move]);

  if (!open || !A) return null;

  // Going somewhere closes the Line; ⌘K brings the conversation back.
  const nav = (to) => { onClose(); window.CHANLY.nav(to); };
  // Leaving the turn in flight, if any: whatever its stream sends after changes nothing on the line (its thread keeps
  // the answer). Every turn checks it is still the current one (turnSeq) before it writes.
  const moveOn = () => {
    turnSeq.current += 1;
    if (live) { setLive(null); if (M) M.mood.set("idle"); }
  };
  // Clear: the conversation ends and the Line is home again; the thread stays in Earlier.
  const clearLine = () => {
    moveOn();
    setActive(null); setQuery(""); setQuick(null); setView("rows"); setUnfolded(-1); setFoldAll(false);
    speech.stop();
  };
  // What became of a card, kept on the conversation the Line holds, so the card drawn again (a fold, the answer back
  // under the line) says "Sent" and never offers Send twice. The route keeps it too (AskCard `record`).
  const noteOutcome = (messageId, pid, o) =>
    setActive((prev) =>
      prev
        ? { ...prev, messages: prev.messages.map((m) => (m.id === messageId ? { ...m, proposals: (m.proposals || []).map((p) => (p.id === pid ? { ...p, outcome: o } : p)) } : m)) }
        : prev,
    );

  const openThread = async (th) => {
    moveOn();
    const full = await A.thread(th.id);
    // A read that failed keeps the thread on the list and says so; only a thread that is gone is dropped as deleted.
    if (!full) { flash({ tone: "danger", msg: <>{t.threadUnreadable}</> }); return null; }
    if (full.missing) { flash({ msg: <>{t.deleted}</> }); setThreads((prev) => prev.filter((x) => x.id !== th.id)); return null; }
    const opened = { id: full.thread.id, title: full.thread.title, messages: full.messages, scope: full.thread.scope };
    setActive(opened);
    if (full.thread.scope) setScope(full.thread.scope);
    setQuery(""); setQuick(null); setView("rows"); setUnfolded(-1); setFoldAll(false);
    return opened;
  };

  // Deleting asks first, wherever it is pressed: a row's × or the Delete key (N5).
  const askDelete = (th) => setDoomed(th);
  const removeThread = async (th) => {
    setDoomed(null);
    const ok = await A.deleteThread(th.id);
    if (!ok) { flash({ tone: "danger", msg: <>{t.deleteFailed}</> }); return; }
    setThreads((prev) => prev.filter((x) => x.id !== th.id));
    if (active && active.id === th.id) setActive(null);
    flash({ msg: <>{t.deleted}</> });
  };

  // Stop: the Line stops waiting for the turn in flight and says so; what the stream sends after changes nothing.
  const stop = () => {
    if (!live) return;
    moveOn();
    setActive((prev) => (prev ? { ...prev, messages: [...prev.messages, arFailed("s-" + Date.now(), t.stopped)] } : prev));
  };

  // One turn: the question goes in, the words stream back, the answer lands. A quick question needs no model and no
  // thread. A question that repeats a thread's first question resumes that thread rather than opening a twin.
  const submit = async (qArg) => {
    const q = (typeof qArg === "string" ? qArg : query).trim();
    if (!q || live) return;
    setQuery("");
    setView("rows");
    setUnfolded(-1);
    setLang(A.language(q));
    if (!active) {
      const pending = A.quick(q);
      if (pending) {
        const mine = ++turnSeq.current;
        setQuick({ q, pending: true });
        const answer = await pending;
        // A later question, a conversation opened or Clear took the line meanwhile: this answer is not drawn.
        if (mine !== turnSeq.current) return;
        setQuick({ q, answer });
        if (M) { M.mood.set("idle"); M.mood.react("nod"); }
        return;
      }
    }
    setQuick(null);
    let base = active;
    if (!base) {
      const list = await (threadsReady.current || Promise.resolve(threads));
      const twin = list.find((th) => A.sameQuestion(th.title, q));
      if (twin) base = await openThread(twin);
    }
    const userMsg = { id: "u-" + Date.now(), role: "user", text: q, atMs: Date.now(), citations: [], followups: [], proposals: [] };
    const thread = base ? { ...base, messages: [...base.messages, userMsg] } : { id: null, title: q, messages: [userMsg], scope };
    setActive(thread);
    const mine = ++turnSeq.current;
    setLive({ q, text: "", traces: [] });
    let threadId = thread.id;
    let final = null;
    let spoke = false;
    await A.send({ text: q, threadId, scope: thread.scope || scope, surface }, (ev) => {
      if (mine !== turnSeq.current) return;
      if (ev.t === "thread") { threadId = ev.id; setActive((prev) => (prev ? { ...prev, id: ev.id, title: prev.title || ev.title } : prev)); }
      else if (ev.t === "trace") setLive((prev) => (prev ? { ...prev, traces: [...prev.traces, ev.text].slice(-3) } : prev));
      else if (ev.t === "delta") {
        setLive((prev) => (prev ? { ...prev, text: prev.text + ev.text } : prev));
        spoke = true;
        if (M) M.mood.beat(Math.min(1, ev.text.length / 6));
      }
      else if (ev.t === "final") final = ev.message;
      else if (ev.t === "error") final = arFailed("e-" + Date.now(), ev.text);
    });
    if (mine !== turnSeq.current) return;
    if (!final) final = arFailed("e-" + Date.now(), t.cutOff);
    setLive(null);
    // Done: a failure shakes; an answer that streamed nods on its own as the row settles, one that did not nods here.
    if (M) {
      M.mood.set("idle");
      if (final.failed) M.mood.react("shake");
      else if (!spoke) M.mood.react("nod");
    }
    setActive((prev) => (prev ? { ...prev, id: threadId || prev.id, messages: [...prev.messages, final] } : prev));
    if (threadId) A.threads().then((list) => {
      setThreads(list);
      const now = list.find((x) => x.id === threadId);
      if (now) setActive((prev) => (prev && prev.id === threadId ? { ...prev, title: now.title } : prev));
    });
    // "Open the 3:34 AM call": the app goes there as the answer lands (the answer's `now`, section 5.1).
    const o = final.failed ? null : final.answer ? final.answer.do.open : final.navigate && final.navigate.to ? final.navigate : null;
    if (o && o.now) setTimeout(() => nav(o.to), 250);
  };

  // ---- what is under the line, and the keys that walk it ----
  const turns = active ? arTurns(active.messages) : [];
  const latest = turns.length ? turns[turns.length - 1] : null;
  const folded = turns.slice(0, -1).filter((tn) => tn.q && tn.a);
  const shownFolds = foldAll ? folded : folded.slice(-AR_FOLDED);
  const answerMsg = latest && latest.a ? latest.a : null;
  const showRows = !talk.listening && (view === "earlier" || !!query || (!live && !quick && !answerMsg));
  const sections = showRows ? buildLineRows({ A, t, lang, query, surface, scope, threads, view }) : [];
  const rows = flatRows(sections);
  const drawn = showRows || talk.listening || live
    ? null
    : quick
      ? quick.answer ? { answer: quick.answer, cardOpen: {} } : null
      : answerMsg ? A.answer(answerMsg) : null;
  const moves = drawn ? answerMoves(drawn.answer) : [];
  const words = drawn ? A.answerText(drawn.answer) : "";

  const activate = (it) => {
    if (!it) return;
    if (it.type === "thread") { openThread(it.th); return; }
    if (it.type === "all") { setView("earlier"); return; }
    if (it.type === "jump" || it.type === "item" || it.type === "open") { nav(it.to); return; }
    if (it.compose) { setQuery(it.q); setTimeout(() => inputRef.current && inputRef.current.focus(), 20); return; }
    submit(it.q);
  };

  const onKey = (e) => {
    if (hold.onKeyDown(e)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (live) stop();
      else onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      if (showRows && rows.length) { e.preventDefault(); setSel((s) => Math.min(rows.length - 1, s + 1)); }
      else if (moves.length) { e.preventDefault(); setMove((m) => Math.min(moves.length - 1, m + 1)); }
      return;
    }
    if (e.key === "ArrowUp") {
      if (showRows && sel > 0) { e.preventDefault(); setSel((s) => s - 1); return; }
      if (!showRows && move >= 0) { e.preventDefault(); setMove((m) => m - 1); return; }
      // Nothing to walk back to: an empty line in a conversation takes the last question again.
      if (active && !query) {
        const last = [...active.messages].reverse().find((m) => m.role === "user");
        if (last) { e.preventDefault(); setQuery(last.text); }
      }
      return;
    }
    // Delete asks to delete the conversation the keys stand on, from an empty line; with words it edits them.
    if (e.key === "Delete" && !query && showRows && rows[sel] && rows[sel].type === "thread") { e.preventDefault(); askDelete(rows[sel].th); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      const q = query.trim();
      // Typed words are asked, unless the keys moved to a row; in Earlier they only find a conversation to open.
      if (showRows && rows[sel] && (!q || sel > 0 || view === "earlier")) activate(rows[sel]);
      else if (q) submit(q);
      else if (moves[move]) activate(moves[move]);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(words);
      flash({ msg: <>{t.copied}</> });
    } catch {
      flash({ tone: "danger", msg: <>{t.copyFailed}</> });
    }
  };

  const talkButton = talk.canTalk ? (
    <button
      type="button"
      className={`ask-line-btn ask-talk${talk.listening ? " on" : ""}`}
      data-testid="ask-talk"
      aria-pressed={talk.listening}
      aria-label={t.talk}
      title={t.talk}
      onPointerDown={talk.start}
      onPointerUp={talk.stop}
      onPointerLeave={talk.stop}
      onPointerCancel={talk.stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Icon name="wave" size={14} />
    </button>
  ) : (
    <button type="button" className="ask-line-btn ask-talk off" data-testid="ask-talk-off" aria-label={t.noVoice} title={t.noVoice} onClick={() => flash({ msg: <>{t.noVoice}</> })}>
      <Icon name="wave" size={14} />
    </button>
  );
  const reading = speech.speakingId === "line";
  const right = live ? (
    <button type="button" className="ask-line-btn" onClick={stop} aria-label={t.stopAnswer} title={t.stopAnswer} data-testid="ask-stop">
      <Icon name="stop" size={14} />
    </button>
  ) : drawn ? (
    <>
      <button type="button" className="ask-line-btn quiet" onClick={copy} aria-label={t.copy} title={t.copy} data-testid="ask-copy">
        <Icon name="content" size={14} />
      </button>
      {speech.canSpeak ? (
        <button
          type="button"
          className={`ask-line-btn quiet${reading ? " on" : ""}`}
          onClick={() => { if (!speech.toggle("line", words, lang)) flash({ msg: <>{t.noSpeech}</> }); }}
          aria-label={reading ? t.stop : t.read}
          aria-pressed={reading}
          title={reading ? t.stop : t.read}
          data-testid="ask-read"
        >
          <Icon name={reading ? "pause" : "headphones"} size={14} />
        </button>
      ) : null}
      <button type="button" className="ask-line-btn quiet" onClick={clearLine} aria-label={t.clear} title={t.clear} data-testid="ask-clear">
        <Icon name="x" size={14} />
      </button>
    </>
  ) : talkButton;

  let body = null;
  if (showRows)
    body = (
      <AskRows
        sections={sections}
        sel={sel}
        setSel={setSel}
        onActivate={activate}
        onDelete={askDelete}
        t={t}
        empty={view === "earlier" && !threads.length ? t.noEarlier : null}
      />
    );
  else if (live && live.text)
    body = <AskTurn m={{ id: "live", role: "assistant", text: live.text, citations: [], followups: [], proposals: [] }} q={live.q} streaming t={t} lang={lang} onNav={nav} onFollow={submit} />;
  else if (live || (quick && quick.pending)) {
    const lines = live && live.traces.length ? live.traces : [t.thinking];
    body = (
      <div className="ask-trace" data-testid="ask-trace" aria-live="polite">
        <p className="ask-turn-q">{live ? live.q : quick.q}</p>
        {lines.map((line, k) => (
          <div key={k} className={`ask-trace-row${k < lines.length - 1 ? " done" : ""}`}>
            {k < lines.length - 1 ? <Icon name="check" size={12} className="ask-trace-check" /> : <span className="ask-trace-dot" />}
            <span>{line}</span>
          </div>
        ))}
      </div>
    );
  } else if (quick && quick.answer) body = <AskTurn quick={quick.answer} q={quick.q} latest walk sel={move} t={t} lang={lang} onNav={nav} onFollow={submit} />;
  else if (answerMsg)
    body = (
      <AskTurn
        m={answerMsg}
        q={latest.q ? latest.q.text : ""}
        latest
        walk
        sel={move}
        t={t}
        lang={lang}
        onNav={nav}
        onFollow={submit}
        onOutcome={noteOutcome}
        onRetry={answerMsg.failed && latest.q ? () => submit(latest.q.text) : undefined}
      />
    );

  const activeId = showRows ? (rows.length ? `ask-row-${sel}` : undefined) : move >= 0 ? `ask-move-${move}` : undefined;
  // What a screen reader hears: the answer's headline (or a prose answer's words) once it is whole (spec 6.10).
  const said = drawn ? drawn.answer.say.headline || drawn.answer.say.detail : "";

  return (
    // It goes the way it came as it closes (data-bits leaving), and on a phone, where it is a sheet at the bottom
    // (ask.css), a thumb pulls it down (touchSwipe). ask-overlay and ask-modal carry the motion (components.css, #922).
    <div className="ask-overlay ask-line-scrim" onClick={onClose} data-tick={tick} ref={window.leaving ? window.leaving("ask") : undefined}>
      <div
        className="ask-modal ask-real ask-line"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Ask Chanlytics"
        data-testid="ask-real"
        {...(window.touchSwipe ? window.touchSwipe({ onDown: onClose, when: arPhone }) : {})}
      >
        <p className="ask-said" role="status" aria-live="polite" data-testid="ask-said">{said}</p>
        {/* A phone's sheet head: the grabber, Earlier, and a close within the thumb's reach. A desktop draws none. */}
        <div className="ask-line-head">
          <span className="ask-grabber" aria-hidden="true" />
          <button type="button" className="ask-line-head-btn" aria-pressed={view === "earlier"} onClick={() => setView((v) => (v === "earlier" ? "rows" : "earlier"))} data-testid="ask-earlier">
            {t.earlier}
          </button>
          <button type="button" className="ask-line-btn quiet" onClick={onClose} aria-label={t.close} title={t.close} data-testid="ask-close">
            <Icon name="x" size={14} />
          </button>
        </div>
        {view === "rows" && folded.length ? (
          <div className="ask-folds" data-testid="ask-folds">
            {folded.length > shownFolds.length ? (
              <button type="button" className="ask-fold-more" onClick={() => setFoldAll(true)}>{t.earlierFolded(folded.length - shownFolds.length)}</button>
            ) : null}
            {shownFolds.map((tn) => {
              const k = folded.indexOf(tn);
              const isOpen = unfolded === k;
              return (
                <div key={tn.q.id || k} className={`ask-fold${isOpen ? " open" : ""}`}>
                  <button type="button" className="ask-fold-row" aria-expanded={isOpen} onClick={() => setUnfolded(isOpen ? -1 : k)} data-testid="ask-fold">
                    <span className="ask-mark m1" aria-hidden="true" />
                    <span className="ask-fold-q">{tn.q.text}</span>
                    <span className="ask-fold-a">{A.answerText(A.answer(tn.a).answer)}</span>
                    <Icon name="chevron" size={12} className="ask-fold-chev" />
                  </button>
                  {isOpen ? <AskTurn m={tn.a} t={t} lang={lang} onNav={nav} onFollow={submit} onOutcome={noteOutcome} /> : null}
                </div>
              );
            })}
          </div>
        ) : null}
        <div className={`ask-line-bar${talk.listening ? " listening" : ""}`} data-testid="ask-line">
          <span className="ask-line-face" ref={faceRef}>
            {AskFace ? <AskFace className="ask-line-face-canvas" testId="ask-line-face" /> : null}
          </span>
          {scope ? (
            <span className="ask-scope" title={`${scope.kind}: ${scope.label}`} data-testid="ask-scope">
              <Icon name={arScopeIcon(scope)} size={10} />
              <span>{scope.label}</span>
              <button type="button" onClick={() => setScope(null)} aria-label={t.clearScope}><Icon name="x" size={9} /></button>
            </span>
          ) : null}
          <input
            ref={inputRef}
            className="ask-line-input"
            placeholder={talk.listening ? t.listening : active ? t.follow : t.placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            onKeyUp={(e) => hold.onKeyUp(e)}
            role="combobox"
            aria-expanded={showRows && rows.length > 0}
            aria-controls={showRows ? "ask-rows" : undefined}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label="Ask Chanlytics"
            data-testid="ask-input"
            maxLength={1000}
          />
          <span className="ask-line-right">{right}</span>
        </div>
        {doomed ? (
          <Confirm question={t.deleteAsk} detail={doomed.title} yes={t.deleteYes} no={t.deleteKeep} danger block className="ask-confirm" onYes={() => removeThread(doomed)} onNo={() => setDoomed(null)} testid="ask-delete" />
        ) : null}
        {body ? <div className="ask-line-body" ref={bodyRef}>{body}</div> : null}
      </div>
      {toastNode}
    </div>
  );
};

window.AskReal = AskReal;
