/* global React, Icon, Confirm */
// AskReal: Ask as the Line (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 6). One band over the
// page with the three standing in it beside the field, and while Ask reads, one line under the field saying what it
// reads (docs/superpowers/specs/2026-09-23-ask-the-stage-design.md, 4.1, 4.2); under the band the rows (home, typing,
// Earlier), the question while Ask reads, or the answer, Say · Show · Do (ask-turn.jsx); a conversation folds above it.
// Reopening resumes the conversation and the words typed until Clear; the tab keeps both across a reload (S9).
// On a phone the Line is the whole screen (the Stage's spec, section 5):
// a head, the three large in a hero that a held press talks to, the rows or the answer under them, the field at the
// foot; ×, Esc, a pull down and Back close it.
// This file is the shell: the state of one open Line, its keys and the turn runner. The rows are ask-home.jsx's, the
// words ask-text.jsx's and the hooks ask-hooks.jsx's; everything that talks to the workspace goes through window.__ask.
// No key symbol is drawn (D17): the Keyboard shortcuts sheet in the user menu lists the keys (contracts SHORTCUTS).

const useArState = React.useState;
const useArEffect = React.useEffect;
const useArRef = React.useRef;

/** Folded turns shown above the line before "+N earlier in this conversation". */
const AR_FOLDED = 3;
// A hold's lift that makes no click on the button (the finger let go elsewhere) is forgotten after this.
const AR_LIFT_MS = 400;

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
// before the takeover comes in (app-shell.jsx draws it only while Ask is closed), so the takeover's own fade is it.
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
  // The dialog itself: where a phone's takeover puts focus as it opens (S10).
  const dialogRef = useArRef(null);
  // "Type instead" pressed while listening: what was heard stays in the field to finish, never asked (spec 5.3).
  const typing = useArRef(false);
  // The thread list as it is being fetched on open: a question typed before it lands still finds its twin.
  const threadsReady = useArRef(null);
  // The current turn: a turn left behind (stopped, cleared, another opened, a later question) writes nothing.
  const turnSeq = useArRef(0);
  // What the shell asked for as it opened the Line, kept until the Line is open (the wiring audit's N3).
  const asked = useArRef(null);
  // A hold on the mic in progress, or just lifted: the click its lift makes is not a press (see pressMic).
  const held = useArRef(false);
  const t = window.askText(lang);
  const route = arRoute();
  // With the param: Leads is People's `leads` param, and the Line on it is the finder (spec F2, F3).
  const surface = A ? A.surfaceFor(route.page, route.param) : "other";

  const talk = H.useAskTalk({
    lang,
    disabled: !!live,
    onWords: (words) => { setQuery(words); if (M) M.mood.hear(0.8); },
    onHeard: (heard, error) => {
      if (heard) { if (!typing.current) submit(heard); return; }
      // Each said once: a second press refreshes the toast that says it (`once`), never a second beneath it.
      if (error === "blocked") flash({ once: "ask-mic", msg: <>{t.micBlocked}</> });
      else if (error === "not-allowed") flash({ once: "ask-mic", msg: <>{t.micDenied}</> });
      else if (error && error !== "aborted" && error !== "no-speech") flash({ once: "ask-mic", msg: <>{t.micFailed}</> });
    },
  });
  // A Space held on an empty line talks (6.6); where the browser cannot listen, it says so.
  const hold = H.useHoldSpace({
    empty: () => !query && !live,
    talk: { start: () => (talk.canTalk ? talk.start() : flash({ once: "ask-mic", msg: <>{t.noVoice}</> })), stop: talk.stop },
  });
  // A phone's three listen to a press held a beat, with a buzz where the browser has one (S11, S16); where the browser
  // cannot listen, they say so (the field's button is Send alone there).
  const buzz = (ms) => { try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms); } catch { /* none here */ } };
  const holdThree = H.useHoldPress({ talk: { start: () => (talk.canTalk ? talk.start() : flash({ once: "ask-mic", msg: <>{t.noVoice}</> })), stop: talk.stop }, onHold: () => buzz(8) });

  // Ask's mood, said once for every face: listening while held, reading until the first words, answering while they
  // stream or are read aloud, at rest otherwise. Said while the Line is closed too, so a turn left running still shows.
  const moodState = talk.listening
    ? "listening"
    : live
      ? live.say || live.text ? "speaking" : "thinking"
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

  // Back closes the takeover (S8): one entry with a null state and the same address, so the shell's hash router
  // never hears it and Next's app router, which reloads on a Back to a state it did not write (app-shell.jsx), ignores
  // it. Whether the entry is ours is this ref, not the popped state. Closing any other way goes back over it; going
  // somewhere takes it for the place (nav).
  const pushed = useArRef(false);
  useArEffect(() => {
    const h = typeof window !== "undefined" ? window.history : null;
    if (!open || !arPhone() || !h || !h.pushState) return;
    h.pushState(null, "", window.location.href);
    pushed.current = true;
    const onPop = () => { if (pushed.current) { pushed.current = false; onClose(); } };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (pushed.current) { pushed.current = false; if (h.back) h.back(); }
    };
  }, [open]);

  // Closed: nothing keeps reading and the rows are home again; the words typed and an open conversation come back
  // until Clear (D14, S9).
  useArEffect(() => {
    if (!open) { setQuick(null); setDoomed(null); setView("rows"); speech.stop(); }
  }, [open]);

  // The draft and the conversation's id, kept in the tab (legacy-bridge/tab-memory.ts) so a reload keeps them too (S9):
  // the words as typed, never on a timer (record-fold.jsx useUnsavedWork), forgotten when the field empties while open;
  // the Line is made closed, so being made forgets nothing. The id whenever a thread is opened or made, forgotten when
  // the conversation ends (Clear, or deleted), never by the Line being made, or when the kept one cannot be read, so a
  // thread that will not read does not flash on every open.
  const mem = () => (typeof window !== "undefined" && window.__tabMemory) || null;
  const threadWas = useArRef(null);
  // Open: what the tab kept comes back. A kept conversation is read first and the words go back after it, since
  // opening a thread empties the field; a request the shell sent as it opened (asked) wins over a kept conversation.
  useArEffect(() => {
    const m = mem();
    if (!open || !A || !m) return;
    const kept = m.draft("ask");
    const words = typeof kept === "string" && kept && !query ? kept : null;
    const th = m.draft("ask-thread");
    if (typeof th === "string" && th && !active && !asked.current)
      openThread({ id: th }).then((o) => { if (!o) m.dropDraft("ask-thread"); if (words) setQuery(words); });
    else if (words) setQuery(words);
  }, [open]);
  useArEffect(() => {
    const m = mem();
    if (!m) return;
    if (query.trim()) m.keepDraft("ask", query);
    else if (open) m.dropDraft("ask");
  }, [query]);
  useArEffect(() => {
    const m = mem();
    const id = active ? active.id : null;
    const had = threadWas.current;
    threadWas.current = id;
    if (!m) return;
    if (id) m.keepDraft("ask-thread", id);
    else if (!active && had) m.dropDraft("ask-thread");
  }, [active && active.id]);

  // The field takes focus on a desktop; a phone's takeover opens with focus on the dialog, so no keyboard rises until a
  // tap on the field asks for it (S10).
  H.useAskFocus(inputRef, open && !doomed && !arPhone(), [open, live, active, doomed, view, quick]);
  H.useAskFocus(dialogRef, open && arPhone(), [open]);
  // Listening ended after "Type instead": the words heard are in the field, and the field takes focus to finish them.
  useArEffect(() => {
    if (talk.listening || !typing.current) return;
    typing.current = false;
    if (inputRef.current) inputRef.current.focus();
  }, [talk.listening]);

  // What the shell sends as it opens the Line: a question to ask or to finish, or a thread to open (`askAbout({ thread })`, any caller). The
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
    const el = b.querySelector(".ask-row.sel, .ask-chip.sel, .ask-item.sel, .ask-open.sel");
    if (!el || !el.getBoundingClientRect) return;
    const top = el.getBoundingClientRect().top - b.getBoundingClientRect().top - b.clientTop + b.scrollTop, h = el.offsetHeight;
    if (top < b.scrollTop) b.scrollTop = Math.max(0, top - 8);
    else if (top + h > b.scrollTop + b.clientHeight) b.scrollTop = top + h - b.clientHeight + 8;
  }, [sel, move]);

  if (!open || !A) return null;
  const phone = arPhone();

  // Going somewhere closes the Line; ⌘K brings the conversation back. On a phone the place takes the takeover's entry
  // (replaced, never pushed over it and then gone back from), so Back from there is the page Ask was opened over.
  const nav = (to) => {
    if (pushed.current && window.appNavigate) { pushed.current = false; onClose(); window.appNavigate(to, { replace: true }); return; }
    onClose();
    window.CHANLY.nav(to);
  };
  // "Change what I asked" on a card: the turn's own question back in the field, to change (spec F4). A fold hands
  // its turn's question; the latest turn's card takes the last one asked.
  const editWords = (text) => {
    const last = active ? [...active.messages].reverse().find((m) => m.role === "user") : null;
    setQuery(typeof text === "string" ? text : last ? last.text : "");
    setTimeout(() => inputRef.current && inputRef.current.focus(), 20);
  };
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
    setLive({ q, text: "", say: null, traces: [] });
    let threadId = thread.id;
    let final = null;
    let spoke = false;
    let said = 0;
    await A.send({ text: q, threadId, scope: thread.scope || scope, surface }, (ev) => {
      if (mine !== turnSeq.current) return;
      if (ev.t === "thread") { threadId = ev.id; setActive((prev) => (prev ? { ...prev, id: ev.id, title: prev.title || ev.title } : prev)); }
      else if (ev.t === "trace") {
        setLive((prev) => (prev ? { ...prev, traces: [...prev.traces, ev.text].slice(-3) } : prev));
        // a read that landed: the three's orbit surges and a light runs down them (mascot mood.ts pulse)
        if (M && M.mood.pulse) M.mood.pulse(0.7);
      }
      else if (ev.t === "say") {
        // The answer's Say as written so far: it replaces what was drawn; the final message is the answer. An empty one
        // takes back an answer the server set aside, and the reads show again.
        const back = !ev.headline && !ev.detail;
        setLive((prev) => (prev ? { ...prev, say: back ? null : { headline: ev.headline, detail: ev.detail } } : prev));
        if (!back) spoke = true;
        const len = ev.headline.length + ev.detail.length;
        if (M && len > said) M.mood.beat(Math.min(1, (len - said) / 6));
        said = len;
      }
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
    buzz(8);
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
  const sections = showRows ? buildLineRows({ A, t, lang, query, surface, scope, threads, view, phone }) : [];
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

  // Held to talk. The button keeps the finger (pointer capture), so the lift reaches it even once a phone's foot has
  // turned into "Let go to ask" over it; a phone buzzes as it starts (S16). The recogniser may end on its own before
  // the finger lifts (a pause ends it on Android Chrome and iOS Safari) and the words heard are asked then, so by the
  // lift the same held element is Stop, or Send with words heard and an error: the click a lift makes must not press
  // it. `held` marks the hold; the click that follows its lift is swallowed once, and a lift that makes no click on
  // the button (the finger let go elsewhere, no capture) is forgotten a beat later.
  const pressMic = (e) => {
    const el = e && e.currentTarget;
    if (el && el.setPointerCapture && e.pointerId != null) { try { el.setPointerCapture(e.pointerId); } catch { /* not a live pointer */ } }
    held.current = true;
    if (phone) buzz(8);
    talk.start(e);
  };
  const liftMic = () => {
    talk.stop();
    window.setTimeout(() => { held.current = false; }, AR_LIFT_MS);
  };
  const pressed = (act) => () => {
    if (held.current) { held.current = false; return; }
    if (act) act();
  };
  const reading = speech.speakingId === "line";
  // One button at the field's end (S12): the mic with no words (hold to talk), Send once there are words, Stop while
  // a turn runs. One element in one place, keyed, so the finger a hold captured is still held as the words heard fill
  // the field; where the browser cannot listen there is no mic, only Send, faint until there are words.
  const hasWords = !!query.trim();
  const role = live ? "stop" : talk.listening || (!hasWords && talk.canTalk) ? "talk" : "send";
  const one = role === "stop"
    ? { onClick: pressed(stop), "aria-label": t.stopAnswer, title: t.stopAnswer, "data-testid": "ask-stop", icon: "stop" }
    : role === "talk"
      ? {
          className: `ask-send talk${talk.listening ? " on" : ""}`,
          "aria-pressed": talk.listening,
          "aria-label": t.talk,
          title: t.talk,
          "data-testid": "ask-talk",
          icon: "mic",
          onPointerDown: pressMic,
          onPointerUp: liftMic,
          onPointerLeave: liftMic,
          onPointerCancel: liftMic,
          onClick: pressed(null),
          onContextMenu: (e) => e.preventDefault(),
        }
      : { onClick: pressed(() => submit()), disabled: !hasWords, "aria-label": t.askSend, title: t.askSend, "data-testid": "ask-send", icon: "arrow-up" };
  const { icon, className: oneClass = "ask-send", ...oneProps } = one;
  const oneButton = (
    <button key="one" type="button" className={oneClass} {...oneProps}>
      <Icon key={icon} name={icon} size={icon === "stop" ? 14 : 15} />
    </button>
  );
  // With an answer drawn on a desktop, Copy, Read aloud and Clear stand before it (keyed, so it stays the same
  // element); a phone's foot keeps only the one button beside an answer, its Clear is the head's (spec 5.1, 5.5).
  const right = drawn && !phone ? (
    <>
      <button key="copy" type="button" className="ask-line-btn quiet" onClick={copy} aria-label={t.copy} title={t.copy} data-testid="ask-copy">
        <Icon name="content" size={14} />
      </button>
      {speech.canSpeak ? (
        <button
          key="read"
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
      <button key="clear" type="button" className="ask-line-btn quiet" onClick={clearLine} aria-label={t.clear} title={t.clear} data-testid="ask-clear">
        <Icon name="x" size={14} />
      </button>
      {oneButton}
    </>
  ) : (
    <>{oneButton}</>
  );

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
  else if (live && (live.say || live.text))
    body = <AskTurn m={{ id: "live", role: "assistant", text: live.text, citations: [], followups: [], proposals: [] }} say={live.say} q={live.q} streaming t={t} lang={lang} onNav={nav} onFollow={submit} onEdit={editWords} />;
  else if (live || (quick && quick.pending)) {
    // While Ask reads, only the question is under the band; what it reads is the band's one line (ask-reading).
    body = (
      <div className="ask-trace" data-testid="ask-trace">
        <p className="ask-turn-q">{live ? live.q : quick.q}</p>
      </div>
    );
  } else if (quick && quick.answer) body = <AskTurn quick={quick.answer} q={quick.q} latest walk sel={move} t={t} lang={lang} onNav={nav} onFollow={submit} onEdit={editWords} />;
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
        onEdit={editWords}
        onRetry={answerMsg.failed && latest.q ? () => submit(latest.q.text) : undefined}
      />
    );

  const activeId = showRows ? (rows.length ? `ask-row-${sel}` : undefined) : move >= 0 ? `ask-move-${move}` : undefined;
  // What a screen reader hears: the answer's headline (or a prose answer's words) once it is whole (spec 6.10).
  const said = drawn ? drawn.answer.say.headline || drawn.answer.say.detail : "";

  // A phone's hero (spec 5.2-5.5): the three at 232px (ask.css `.ask-hero-stage`), what they hear while held, the
  // question and what Ask reads until the first words; once an answer is written they shrink to the top with its
  // question under them, said once (ask.css hides the turn's own copy on a phone).
  const heroSmall = !!(live && (live.say || live.text)) || !!answerMsg || !!(quick && quick.answer);
  const heroQ = !heroSmall ? null : live ? live.q : quick && quick.answer ? quick.q : latest && latest.q ? latest.q.text : null;
  const restful = talk.listening || (showRows && view === "rows" && !query);
  const hero = phone ? (
    <div className={`ask-hero${heroSmall ? " small" : ""}`} data-testid="ask-hero">
      <span className="ask-hero-stage" ref={faceRef} {...holdThree} data-testid="ask-hero-stage">
        {AskFace ? <AskFace className="ask-hero-canvas" testId="ask-line-face" /> : null}
      </span>
      {talk.listening ? (
        <p className="ask-heard" aria-live="polite" data-testid="ask-heard">{query || t.listening}</p>
      ) : (live || (quick && quick.pending)) && !heroSmall ? (
        <>
          <p className="ask-turn-q">{live ? live.q : quick.q}</p>
          <p className="ask-reading" aria-live="polite" data-testid="ask-reading"><span className="ask-reading-dot" aria-hidden="true" />{live && live.traces.length ? live.traces[live.traces.length - 1] : t.thinking}</p>
        </>
      ) : heroQ ? (
        <p className="ask-turn-q">{heroQ}</p>
      ) : null}
    </div>
  ) : null;
  // A conversation's earlier turns, folded above the band on a desktop and at the top of a phone's middle.
  const folds = view === "rows" && folded.length ? (
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
            {isOpen ? <AskTurn m={tn.a} t={t} lang={lang} onNav={nav} onFollow={submit} onOutcome={noteOutcome} onEdit={() => editWords(tn.q.text)} /> : null}
          </div>
        );
      })}
    </div>
  ) : null;
  // While a phone listens its foot is the pill to let go of, over the band (still drawn, hidden, so the mic that holds
  // the finger is there for the lift), with a way back to typing that keeps the words heard (spec 5.3).
  const foot = phone && talk.listening ? (
    <div className="ask-letgo-wrap">
      <button type="button" className="btn btn-ghost" onClick={() => { typing.current = true; talk.stop(); }} data-testid="ask-type-instead">{t.typeInstead}</button>
      <button type="button" className="ask-letgo" aria-pressed="true" onPointerUp={liftMic} data-testid="ask-letgo"><Icon name="mic" size={18} />{t.letGo}</button>
    </div>
  ) : null;

  return (
    // It goes the way it came as it closes (data-bits leaving), and on a phone, where it is the whole screen (ask.css),
    // a thumb pulls it down (touchSwipe). ask-overlay and ask-modal carry the motion (components.css, #922).
    <div className="ask-overlay ask-line-scrim" onClick={onClose} data-tick={tick} ref={window.leaving ? window.leaving("ask") : undefined}>
      <div
        ref={dialogRef}
        className="ask-modal ask-real ask-line"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label="Ask Chanlytics"
        data-testid="ask-real"
        {...(window.touchSwipe ? window.touchSwipe({ onDown: onClose, when: arPhone }) : {})}
      >
        <p className="ask-said" role="status" aria-live="polite" data-testid="ask-said">{said}</p>
        {/* A phone's head: Earlier, Clear in a conversation, and a close within the thumb's reach; both wait while a
            turn runs (spec 5.1, 5.4). A desktop draws none. */}
        <div className="ask-line-head">
          <button type="button" className="btn btn-ghost" aria-pressed={view === "earlier"} disabled={!!live} onClick={() => setView((v) => (v === "earlier" ? "rows" : "earlier"))} data-testid="ask-earlier">
            <Icon name="chat" size={13} />
            {t.earlier}
          </button>
          {active ? <button type="button" className="btn btn-ghost" disabled={!!live} onClick={clearLine} data-testid="ask-clear-head">{t.clear}</button> : null}
          <button type="button" className="ask-line-btn quiet" onClick={onClose} aria-label={t.close} title={t.close} data-testid="ask-close">
            <Icon name="x" size={14} />
          </button>
        </div>
        {!phone ? folds : null}
        {/* The band (spec 4.1, 4.2): the three at 84px beside the field, the largest face in the app; under the field,
            while Ask reads, one line in coral ink saying what it reads. On a phone the face and the line are the hero's,
            and the band is the field at the foot (ask.css orders it last), hidden under the pill to let go of while it
            listens. */}
        {foot}
        <div className={`ask-stage${talk.listening ? " listening" : ""}${live ? " live" : ""}`} data-testid="ask-line">
          <div className="ask-stage-row">
            {!phone ? (
              <span className="ask-stage-face" ref={faceRef}>
                {AskFace ? <AskFace className="ask-stage-canvas" testId="ask-line-face" /> : null}
              </span>
            ) : null}
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
              placeholder={talk.listening ? t.listening : phone && live ? live.q : phone && quick && quick.pending ? quick.q : active ? t.follow : surface === "leads" ? t.describeLeads : t.placeholder}
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
              enterKeyHint="send"
              autoCapitalize="sentences"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="ask-line-right">{right}</span>
          </div>
          {live && !phone ? (
            <p className="ask-reading" aria-live="polite" data-testid="ask-reading">
              <span className="ask-reading-dot" aria-hidden="true" />
              {live.traces.length ? live.traces[live.traces.length - 1] : t.thinking}
            </p>
          ) : null}
        </div>
        {doomed ? (
          <Confirm question={t.deleteAsk} detail={doomed.title} yes={t.deleteYes} no={t.deleteKeep} danger block className="ask-confirm" onYes={() => removeThread(doomed)} onNo={() => setDoomed(null)} testid="ask-delete" />
        ) : null}
        {/* A phone's middle is one scroller (spec 5.1, 5.5): the folds, the hero and the rows or the answer scroll as one,
            so a long answer is read with the three out of the way and the field stays at the foot. At rest, and while
            it listens, what it holds stands centred (`rest`, spec 5.2). */}
        {body || phone ? (
          <div className={`ask-line-body${restful ? " rest" : ""}`} ref={bodyRef}>{phone ? folds : null}{hero}{body}</div>
        ) : null}
      </div>
      {toastNode}
    </div>
  );
};

window.AskReal = AskReal;
