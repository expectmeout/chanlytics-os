/* global React, Icon, Confirm */
// AskReal — the palette on a real workspace (⌘K, the topbar button, New
// chat, the phone's ✦). This file is the shell: the state of one open
// palette (what is typed, which thread is open, the turn in flight, the
// scope, the language), the keyboard, the composer, the rail, and the turn
// runner. What the rows are (ask-home.jsx), what a turn shows (ask-turn.jsx),
// the words (ask-text.jsx) and the hooks (ask-hooks.jsx) live beside it, and
// everything that talks to the workspace goes through window.__ask.

const useArState = React.useState;
const useArEffect = React.useEffect;
const useArRef = React.useRef;

const AR_RAIL_CAP = 10;

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

// The threads rail beside a desktop conversation: New chat, the recent
// threads by result (ten, then "earlier"), the open one highlighted, delete
// on hover.
const AskRail = ({ threads, active, more, t, onNew, onOpen, onDelete, onMore }) => {
  const shown = more ? threads.slice(0, 40) : threads.slice(0, AR_RAIL_CAP);
  return (
    <aside className="ask-rail" data-testid="ask-rail">
      <button className="ask-new-btn" onClick={onNew}><Icon name="plus" size={12} /> {t.newChat}</button>
      <div className="ask-rail-label"><span>{t.threads}</span></div>
      <div className="ask-rail-list">
        {shown.map((th) => (
          <div key={th.id} className={`ask-thread ${active && active.id === th.id ? "active" : ""}`} role="button" tabIndex={0} onClick={() => onOpen(th)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(th); }}>
            <span className="ask-thread-title">{th.title}</span>
            <span className="ask-thread-at">{window.AskHome.ahAgo(th.lastAtMs)}</span>
            <button className="ask-thread-x" aria-label={t.deleteThread} title={t.deleteThread} onClick={(e) => { e.stopPropagation(); onDelete(th); }}><Icon name="x" size={10} /></button>
          </div>
        ))}
        {!more && threads.length > AR_RAIL_CAP && (
          <button className="ask-thread ask-thread-more" onClick={onMore}><span className="ask-thread-at">{t.earlier}</span></button>
        )}
      </div>
    </aside>
  );
};

const AskReal = ({ open, onClose }) => {
  const A = window.__ask;
  const H = window.AskHooks;
  const { buildAskSections, AskFast, AskRows, flatRows } = window.AskHome;
  const AskTurn = window.AskTurn;

  const [query, setQuery] = useArState("");
  const [threads, setThreads] = useArState([]);
  const [active, setActive] = useArState(null); // { id, title, messages, scope }
  const [live, setLive] = useArState(null); // the turn in flight: { text, trace }
  const [fast, setFast] = useArState(null); // a quick answer, no model
  const [scope, setScope] = useArState(null);
  const [sel, setSel] = useArState(0);
  const [lang, setLang] = useArState(() => (A ? A.language() : "en"));
  const [tick, setTick] = useArState(0);
  const [railMore, setRailMore] = useArState(false);
  // The conversation a × or the Delete key asked to delete, waiting for a yes (N5).
  const [doomed, setDoomed] = useArState(null);
  const wide = H.useAskWide();
  const speech = H.useAskSpeech(A);
  const [toastNode, flash] = window.usePPToast();
  const inputRef = useArRef(null);
  const bodyRef = useArRef(null);
  const scrollRef = useArRef(null);
  // The thread list as it is being fetched on open: a question typed before
  // it lands still finds its twin.
  const threadsReady = useArRef(null);
  const t = window.askText(lang);
  const route = arRoute();
  const surface = A ? A.surfaceFor(route.page) : "other";

  const talk = H.useAskTalk({
    lang,
    disabled: !!live,
    onWords: (words) => setQuery(words),
    onHeard: (heard, error) => {
      if (heard) { submit(heard); return; }
      if (error === "not-allowed") flash({ msg: <>{t.micDenied}</> });
      else if (error && error !== "aborted" && error !== "no-speech") flash({ msg: <>{t.micFailed}</> });
    },
  });

  // Open: take the route's scope, load the threads, follow the surfaces.
  useArEffect(() => {
    if (!open || !A) return;
    const r = arRoute();
    setScope(A.scopeFor(r.page, r.param, arScopeLabel(r.page, r.param)));
    threadsReady.current = A.threads().then((list) => { setThreads(list); return list; });
    const bump = () => setTick((n) => n + 1);
    const evs = ["surface:inbox", "surface:live", "surface:clients", "surface:settings"];
    evs.forEach((e) => window.addEventListener(e, bump));
    return () => evs.forEach((e) => window.removeEventListener(e, bump));
  }, [open]);

  // Closed: nothing typed survives, nothing keeps reading; an open
  // conversation resumes next time.
  useArEffect(() => { if (!open) { setQuery(""); setFast(null); setDoomed(null); speech.stop(); } }, [open]);

  H.useAskFocus(inputRef, open && !live && !doomed, [open, live, active, doomed]);

  // What the shell sends: New chat, or a question to ask or to finish. The shell opens the palette and sends in the
  // same moment, so the palette listens while closed too and keeps the last request until it is open (the wiring
  // audit's N3: a listener added on open missed both, and New chat reopened the last conversation).
  const asked = useArRef(null);
  useArEffect(() => {
    const onNew = () => { asked.current = { fresh: true }; setTick((n) => n + 1); };
    const onSeed = (e) => { asked.current = (e && e.detail) || {}; setTick((n) => n + 1); };
    window.addEventListener("ask:new", onNew);
    window.addEventListener("ask:seed", onSeed);
    return () => { window.removeEventListener("ask:new", onNew); window.removeEventListener("ask:seed", onSeed); };
  }, []);

  useArEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    // Taken once open, after the route's own scope, so a request's scope wins.
    const d = asked.current;
    if (d) {
      asked.current = null;
      if (d.fresh) newChat();
      else {
        if (d.about) setScope(typeof d.about === "object" ? d.about : null);
        // Today's band hands its thread over: the same conversation, continued here.
        if (d.thread) openThread({ id: d.thread });
        else if (d.mode === "compose" || !d.prompt) { setActive(null); setQuery(d.prompt || ""); }
        else submit(d.prompt);
      }
    }
    return () => window.removeEventListener("keydown", onKey);
  });

  useArEffect(() => { setSel(0); }, [query, active, open]);
  useArEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [active, live]);
  useArEffect(() => {
    const b = bodyRef.current; if (!b) return;
    const el = b.querySelector(".cmd-row.sel"); if (!el) return;
    const top = el.offsetTop, h = el.offsetHeight, st = b.scrollTop, ch = b.clientHeight;
    if (top < st) b.scrollTop = Math.max(0, top - 8);
    else if (top + h > st + ch) b.scrollTop = top + h - ch + 8;
  }, [sel]);

  if (!open || !A) return null;

  // Going somewhere closes the palette; ⌘K brings the conversation back.
  const nav = (to) => { onClose(); window.CHANLY.nav(to); };
  const newChat = () => { setActive(null); setQuery(""); setFast(null); setRailMore(false); };

  const openThread = async (th) => {
    const full = await A.thread(th.id);
    // A read that failed keeps the thread on the list and says so; only a thread
    // that is gone is dropped as deleted.
    if (!full) { flash({ tone: "danger", msg: <>{t.threadUnreadable}</> }); return null; }
    if (full.missing) { flash({ msg: <>{t.deleted}</> }); setThreads((prev) => prev.filter((x) => x.id !== th.id)); return null; }
    const opened = { id: full.thread.id, title: full.thread.title, messages: full.messages, scope: full.thread.scope };
    setActive(opened);
    if (full.thread.scope) setScope(full.thread.scope);
    setQuery("");
    return opened;
  };

  // Deleting asks first, wherever it is pressed: a row's ×, the rail's × or the Delete key (N5).
  const askDelete = (th) => setDoomed(th);
  const removeThread = async (th) => {
    setDoomed(null);
    const ok = await A.deleteThread(th.id);
    if (!ok) { flash({ tone: "danger", msg: <>{t.deleteFailed}</> }); return; }
    setThreads((prev) => prev.filter((x) => x.id !== th.id));
    if (active && active.id === th.id) setActive(null);
    flash({ msg: <>{t.deleted}</> });
  };

  // A quick answer: no model, no thread. Openings ask the calendar route.
  const answerFast = async (q, fp) => {
    if (fp.kind !== "openings") { setFast({ q, text: fp.answer, links: fp.links || [] }); return; }
    setFast({ q, text: t.thinking, links: [], pending: true });
    try {
      const o = await A.openings(fp.day, fp.service);
      const text = o.state === "no_calendar" ? t.noCalendar : o.state === "unavailable" ? t.unavailable : o.text;
      setFast({ q, text, days: o.state === "ok" ? o.days : [], links: o.state === "ok" ? [] : [{ label: t.openings, to: "admin/integrations" }] });
    } catch {
      setFast({ q, text: t.unavailable, links: [] });
    }
  };

  // One turn: the question goes in, the words stream back, the answer lands.
  // A question that repeats a thread's first question resumes that thread
  // rather than opening a twin beside it.
  const submit = async (qArg) => {
    const q = (typeof qArg === "string" ? qArg : query).trim();
    if (!q || live) return;
    setQuery("");
    setLang(A.language(q));
    if (!active) {
      const fp = A.fast(q);
      if (fp) { answerFast(q, fp); return; }
    }
    setFast(null);
    let base = active;
    if (!base) {
      const list = await (threadsReady.current || Promise.resolve(threads));
      const twin = list.find((th) => A.sameQuestion(th.title, q));
      if (twin) base = await openThread(twin);
    }
    const userMsg = { id: "u-" + Date.now(), role: "user", text: q, atMs: Date.now(), citations: [], followups: [], proposals: [] };
    const thread = base ? { ...base, messages: [...base.messages, userMsg] } : { id: null, title: q, messages: [userMsg], scope };
    setActive(thread);
    setLive({ text: "", trace: null });
    let threadId = thread.id;
    let final = null;
    await A.send({ text: q, threadId, scope: thread.scope || scope, surface }, (ev) => {
      if (ev.t === "thread") { threadId = ev.id; setActive((prev) => (prev ? { ...prev, id: ev.id, title: prev.title || ev.title } : prev)); }
      else if (ev.t === "trace") setLive((prev) => ({ ...(prev || { text: "" }), trace: ev.text }));
      else if (ev.t === "delta") setLive((prev) => ({ text: ((prev && prev.text) || "") + ev.text, trace: null }));
      else if (ev.t === "final") final = ev.message;
      else if (ev.t === "error") final = arFailed("e-" + Date.now(), ev.text);
    });
    if (!final) final = arFailed("e-" + Date.now(), t.cutOff);
    setLive(null);
    setActive((prev) => (prev ? { ...prev, id: threadId || prev.id, messages: [...prev.messages, final] } : prev));
    if (threadId) A.threads().then((list) => {
      setThreads(list);
      const mine = list.find((x) => x.id === threadId);
      if (mine) setActive((prev) => (prev && prev.id === threadId ? { ...prev, title: mine.title } : prev));
    });
    // "Open the 3:34 AM call": the app goes there as the answer lands.
    if (final.navigate && final.navigate.now && final.navigate.to && !final.failed) setTimeout(() => nav(final.navigate.to), 250);
  };

  // ---- rows and keys ----
  const sections = active ? [] : buildAskSections({ A, t, lang, query, surface, scope, threads });
  const flat = flatRows(sections);
  const activate = (it) => {
    if (!it) return;
    if (it.type === "thread") { openThread(it.th); return; }
    if (it.type === "jump" || it.type === "now") { nav(it.to); return; }
    if (it.compose) { setQuery(it.q); setTimeout(() => inputRef.current && inputRef.current.focus(), 20); return; }
    submit(it.q);
  };
  const onKey = (e) => {
    if (active) {
      if (e.key === "Escape") { e.stopPropagation(); newChat(); }
      else if (e.key === "Enter") { e.preventDefault(); submit(); }
      else if (e.key === "ArrowUp" && !query) { const last = [...active.messages].reverse().find((m) => m.role === "user"); if (last) { e.preventDefault(); setQuery(last.text); } }
      return;
    }
    const q = query.trim();
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(flat.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Delete" && flat[sel] && flat[sel].type === "thread") { e.preventDefault(); askDelete(flat[sel].th); }
    else if (e.key === "Enter") { e.preventDefault(); if (flat[sel] && (q === "" || flat[sel].type !== "ask" || flat[sel].q !== q)) activate(flat[sel]); else if (q) submit(); }
  };

  const railOn = wide && !!active;
  const lastAssistant = active ? [...active.messages].reverse().find((m) => m.role === "assistant") : null;

  return (
    <div className="ask-overlay" onClick={onClose} data-tick={tick}>
      <div className={`ask-modal ask-real ${railOn ? "ask-modal-threads" : "cmd-modal"}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ask Chanlytics" data-testid="ask-real">
        {railOn && <AskRail threads={threads} active={active} more={railMore} t={t} onNew={newChat} onOpen={openThread} onDelete={askDelete} onMore={() => setRailMore(true)} />}
        <div className={railOn ? "ask-main" : "ask-single"}>
          <div className={`cmd-input-bar ${talk.listening ? "listening" : ""}`}>
            {active
              ? <button className="cmd-back" onClick={newChat} aria-label="Back to the palette"><Icon name="chevron" size={13} style={{ transform: "rotate(180deg)" }} /></button>
              : <Icon name="sparkle" size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />}
            {scope && (
              <span className="cmd-ctx ask-scope" title={`${scope.kind}: ${scope.label}`} data-testid="ask-scope">
                <Icon name={arScopeIcon(scope)} size={10} /> {scope.label}
                <button onClick={() => setScope(null)} aria-label="Clear the scope"><Icon name="x" size={9} /></button>
              </span>
            )}
            <input
              ref={inputRef}
              className="cmd-input"
              placeholder={talk.listening ? t.listening : active ? t.follow : t.placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              aria-label="Ask Chanlytics"
              data-testid="ask-input"
              maxLength={1000}
            />
            {talk.canTalk ? (
              <button
                type="button"
                className={`ask-talk ${talk.listening ? "on" : ""}`}
                data-testid="ask-talk"
                aria-pressed={talk.listening}
                aria-label={t.talk}
                title={t.talk}
                disabled={!!live}
                onPointerDown={talk.start}
                onPointerUp={talk.stop}
                onPointerLeave={talk.stop}
                onPointerCancel={talk.stop}
                onContextMenu={(e) => e.preventDefault()}
              >
                <Icon name="wave" size={14} />
              </button>
            ) : (
              <button type="button" className="ask-talk off" data-testid="ask-talk-off" aria-label={t.noVoice} title={t.noVoice} onClick={() => flash({ msg: <>{t.noVoice}</> })}>
                <Icon name="wave" size={14} />
              </button>
            )}
            <span className="kbd">↵</span>
          </div>

          {doomed && (
            <Confirm question={t.deleteAsk} detail={doomed.title} yes={t.deleteYes} no={t.deleteKeep} danger block className="ask-confirm" onYes={() => removeThread(doomed)} onNo={() => setDoomed(null)} testid="ask-delete" />
          )}
          <div className="cmd-body" ref={bodyRef}>
            {active ? (
              <div className="ask-msgs" ref={scrollRef}>
                {active.messages.map((m, i) => m.role === "user"
                  ? <div key={m.id || i} className="ask-msg user"><p className="ask-msg-text">{m.text}</p></div>
                  : <AskTurn key={m.id || i} m={m} latest={!live && m === lastAssistant} t={t} lang={lang} onFollow={submit} onNav={nav} speech={speech} flash={flash} onRetry={m.failed ? () => { const asked = active.messages.slice(0, i).reverse().find((x) => x.role === "user"); if (asked) submit(asked.text); } : undefined} />)}
                {live && (
                  live.text
                    ? <AskTurn m={{ id: "live", text: live.text, citations: [], followups: [], proposals: [] }} streaming t={t} lang={lang} onFollow={submit} onNav={nav} speech={speech} flash={flash} />
                    : <div className="ask-trace" data-testid="ask-trace"><span className="ask-trace-dot" />{live.trace || t.thinking}</div>
                )}
              </div>
            ) : (
              <>
                <AskFast fast={fast} t={t} onNav={nav} speech={speech} lang={lang} />
                <AskRows sections={sections} sel={sel} setSel={setSel} onActivate={activate} onDelete={askDelete} t={t} />
              </>
            )}
          </div>

          <footer className="cmd-foot">
            {active
              ? <><span><span className="kbd">↵</span> send</span><span><span className="kbd">↑</span> recall</span><span><span className="kbd">esc</span> back</span><span className="cmd-foot-note">{t.footNote}</span></>
              : <><span><span className="kbd">↑↓</span> move</span><span><span className="kbd">↵</span> select</span>{flat[sel] && flat[sel].type === "thread" && <span><span className="kbd">del</span> delete</span>}<span><span className="kbd">esc</span> close</span><span className="cmd-foot-note">{t.footNote}</span></>}
          </footer>
        </div>
      </div>
      {toastNode}
    </div>
  );
};

window.AskReal = AskReal;
