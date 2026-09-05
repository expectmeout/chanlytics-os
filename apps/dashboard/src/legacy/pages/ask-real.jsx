/* global React, Icon */
// AskReal — the palette on a real workspace (⌘K, the topbar button, New
// Chat, the phone's ✦). At rest it is a page of the workspace: what needs
// you now (the bell's rows), questions the data can answer, a jump to any
// page, person, thread or call, and the threads you have already had. Typed
// words become a jump, a quick answer that needs no model (who needs me, did
// anyone call, what's open), or a turn of the assistant, which reads the
// workspace as you and answers with the rows it read as citations.
//
// Everything comes through window.__ask (legacy-bridge/ask.ts). Nothing here
// is seeded: an empty workspace shows empty sections, never invented ones.

const useArState = React.useState;
const useArEffect = React.useEffect;
const useArRef = React.useRef;

const AR_TEXT = {
  en: {
    placeholder: "Ask, or jump to a page, person or thread…",
    follow: "Follow up…",
    now: "Right now",
    ask: "Ask",
    jump: "Jump to",
    recent: "Recent",
    askRow: (q) => `Ask: “${q}”`,
    askSub: "Reads your workspace as you",
    empty: "Nothing matches. Press ↵ to ask it.",
    thinking: "Thinking…",
    clear: "Clear",
    unverified: "Not from your data — check before you rely on it",
    read: "Read it",
    stop: "Stop",
    footNote: "Reads your workspace as you · nothing sends without you",
    open: "Open",
    deleted: "Thread deleted",
    noCalendar: "No calendar is connected, so I can't see openings. The hours are in Settings.",
    unavailable: "The calendar couldn't be read right now.",
    openings: "Open times",
    from: "From",
    talk: "Hold to talk",
    listening: "Listening…",
    micDenied: "The browser needs microphone permission to talk to Ask.",
    micFailed: "Couldn't hear you — try again or type it.",
    approve: "Approve",
    send: "Send",
    notNow: "Not now",
    working: "Working…",
    editComposer: "Edit in the composer",
    openIt: "Open it",
    tryAgain: "Try again",
    priceNote: "This looks like a price. The receptionist never quotes one; you may.",
    windowNote: "Their 24-hour window is closed — only an approved template can be sent. Open the thread to pick one.",
    kReply: "reply", kSteer: "rewrite", kInbox: "inbox", kPerson: "receptionist", kAutonomy: "autonomy", kSettings: "settings", kWhisper: "whisper", kTeam: "team",
  },
  es: {
    placeholder: "Pregunta, o salta a una página, persona o hilo…",
    follow: "Sigue preguntando…",
    now: "Ahora mismo",
    ask: "Pregunta",
    jump: "Ir a",
    recent: "Recientes",
    askRow: (q) => `Preguntar: “${q}”`,
    askSub: "Lee tu espacio de trabajo como tú",
    empty: "Nada coincide. Pulsa ↵ para preguntarlo.",
    thinking: "Pensando…",
    clear: "Borrar",
    unverified: "No viene de tus datos — compruébalo antes de fiarte",
    read: "Léelo",
    stop: "Parar",
    footNote: "Lee tu espacio de trabajo como tú · nada se envía sin ti",
    open: "Abrir",
    deleted: "Hilo borrado",
    noCalendar: "No hay calendario conectado, así que no veo huecos. El horario está en Ajustes.",
    unavailable: "No se pudo leer el calendario ahora.",
    openings: "Horas libres",
    from: "De",
    talk: "Mantén para hablar",
    listening: "Escuchando…",
    micDenied: "El navegador necesita permiso del micrófono para hablar con Ask.",
    micFailed: "No te oí — inténtalo de nuevo o escríbelo.",
    approve: "Aprobar",
    send: "Enviar",
    notNow: "Ahora no",
    working: "Un momento…",
    editComposer: "Editar en el redactor",
    openIt: "Abrirlo",
    tryAgain: "Reintentar",
    priceNote: "Parece un precio. La recepcionista nunca los da; tú sí puedes.",
    windowNote: "Su ventana de 24 horas está cerrada: solo se puede enviar una plantilla aprobada. Abre el hilo para elegir una.",
    kReply: "respuesta", kSteer: "reescritura", kInbox: "inbox", kPerson: "recepcionista", kAutonomy: "autonomía", kSettings: "ajustes", kWhisper: "susurro", kTeam: "equipo",
  },
};

const arRecognizer = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;

// Hold to talk, as the live whisper does it: press starts the browser's own
// recogniser, release stops it, and what was heard is submitted on its own.
// Interim words show in the input as they come. Nothing is recorded or
// uploaded; the words are typed for the person, then sent like typed ones.
const useArTalk = ({ lang, onWords, onHeard, disabled }) => {
  const [listening, setListening] = useArState(false);
  const recRef = useArRef(null);
  const heardRef = useArRef("");
  const canTalk = !!arRecognizer();
  const start = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const SR = arRecognizer();
    if (!SR || listening || disabled) return;
    const rec = new SR();
    rec.lang = lang === "es" ? "es-ES" : (navigator.language || "en-US");
    rec.interimResults = true;
    rec.continuous = true;
    heardRef.current = "";
    rec.onresult = (ev) => {
      let finals = "";
      let interim = "";
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finals += r[0].transcript;
        else interim += r[0].transcript;
      }
      heardRef.current = finals.trim();
      onWords((finals + interim).trim());
    };
    rec.onerror = (ev) => {
      setListening(false);
      recRef.current = null;
      onHeard(null, ev && ev.error ? ev.error : "error");
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      const heard = heardRef.current;
      heardRef.current = "";
      if (heard) onHeard(heard, null);
    };
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); recRef.current = null; }
  };
  const stop = () => {
    const rec = recRef.current;
    if (rec) { try { rec.stop(); } catch { /* already stopped */ } }
  };
  return { canTalk, listening, start, stop };
};

const arAgo = (ms) => {
  if (!ms) return "";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return Math.round(s / 60) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  return Math.round(s / 86400) + "d ago";
};

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

// A proposal the assistant made, as a card: the exact change, the door it
// goes through, Approve (or Edit in the composer), Not now, and the undo the
// verb has. The commit runs through the verb's own route, which checks the
// role and the state again; what happened is kept on the turn, so a thread
// reads back with "Sent" rather than a fresh Approve.
const AskCard = ({ p, messageId, t, onNav }) => {
  const A = window.__ask;
  const [state, setState] = useArState(p.outcome ? p.outcome.state : "idle");
  const [receipt, setReceipt] = useArState(p.outcome ? p.outcome.receipt : "");
  const [undoData, setUndoData] = useArState(p.outcome ? p.outcome.undo || null : null);
  const [busy, setBusy] = useArState(false);
  const [err, setErr] = useArState("");
  const gateKey = (window.PROPOSAL_GATE || {})[p.kind] || "approve";
  const gated = window.canDo ? !window.canDo(gateKey) : false;
  const pl = p.payload || {};
  const record = (o) => { if (A && messageId && /^[0-9a-f-]{36}$/.test(messageId)) A.outcome(messageId, p.id, o); };
  const approve = async () => {
    if (busy || !A) return;
    setBusy(true); setErr("");
    const r = await A.commit(p);
    setBusy(false);
    if (r.ok) {
      setState("done"); setReceipt(r.receipt); setUndoData(r.undo || null);
      record({ state: "done", receipt: r.receipt, atMs: Date.now(), undo: r.undo || null });
    } else {
      setState("failed"); setErr(r.message);
      record({ state: "failed", receipt: r.message, atMs: Date.now(), undo: null });
    }
  };
  const dismiss = () => { setState("dismissed"); record({ state: "dismissed", receipt: t.notNow, atMs: Date.now(), undo: null }); };
  const undo = async () => {
    if (busy || !A) return;
    setBusy(true);
    const r = await A.undo(p, { state: "done", receipt, atMs: 0, undo: undoData });
    setBusy(false);
    if (r.ok) { setState("undone"); setReceipt(r.receipt); setUndoData(null); record({ state: "undone", receipt: r.receipt, atMs: Date.now(), undo: null }); }
    else setErr(r.message);
  };
  const KIND = { reply: t.kReply, steer: t.kSteer, thread_verb: t.kInbox, person_mode: t.kPerson, policy: t.kAutonomy, settings: t.kSettings, whisper: t.kWhisper, invite: t.kTeam };
  return (
    <div className={`ask-card ${state}`} data-testid="ask-card" data-kind={p.kind}>
      <div className="ask-card-head"><Icon name={p.kind === "reply" || p.kind === "steer" ? "chat" : p.kind === "whisper" ? "phone" : p.kind === "invite" ? "users" : p.kind === "policy" ? "shield" : p.kind === "settings" || p.kind === "person_mode" ? "settings" : "inbox"} size={12} />{p.title}<span className="ask-card-kind">{KIND[p.kind] || p.kind}</span></div>
      <div className="ask-card-summary">{p.summary}</div>
      {p.kind === "reply" && pl.price_warning && state === "idle" && <div className="ask-card-note">{t.priceNote}</div>}
      {p.kind === "reply" && pl.window_open === false && state === "idle" && <div className="ask-card-note">{t.windowNote}</div>}
      {state === "idle" && (
        <div className="ask-card-actions">
          <button className="btn btn-primary btn-sm" onClick={approve} disabled={busy || gated} title={gated ? window.gateTitle(gateKey) : undefined} data-testid="ask-card-approve">
            {busy ? t.working : p.kind === "reply" ? t.send : t.approve}
          </button>
          {p.kind === "reply" && pl.conversation_id && <button className="btn btn-ghost btn-sm" onClick={() => { onNav(`inbox/th-${pl.conversation_id}`); if (A) A.editReply(p); }}>{t.editComposer}</button>}
          {p.kind !== "reply" && p.kind !== "steer" && p.kind !== "whisper" && p.kind !== "invite" && (
            <button className="btn btn-ghost btn-sm" onClick={() => onNav(p.kind === "settings" ? "admin/memory" : p.kind === "policy" ? "admin/autonomy" : p.kind === "person_mode" ? `clients/${pl.contact_id}` : `inbox/th-${pl.conversation_id}`)}>{t.openIt}</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={dismiss} disabled={busy}>{t.notNow}</button>
          {gated && <span className="ask-card-note">{window.gateTitle(gateKey)}</span>}
        </div>
      )}
      {state !== "idle" && (
        <div className="ask-card-receipt">
          <Icon name={state === "done" ? "check" : state === "failed" ? "alert" : "x"} size={11} className={state === "done" ? "ok" : ""} />
          <span>{state === "failed" ? err || receipt : state === "dismissed" ? t.notNow : receipt}</span>
          {state === "done" && undoData && p.undo && <button className="btn btn-ghost btn-sm ask-card-undo" onClick={undo} disabled={busy}>{p.undo}</button>}
          {state === "failed" && <button className="btn btn-ghost btn-sm ask-card-undo" onClick={() => { setState("idle"); setErr(""); }}>{t.tryAgain}</button>}
        </div>
      )}
      {err && state === "done" && <div className="ask-card-note">{err}</div>}
    </div>
  );
};

// One assistant turn as the palette draws it: the words, then the rows it
// read, then what to ask next. A failed turn says why in the same bubble.
const AskTurn = ({ m, streaming, t, onFollow, onNav, canSpeak, onSpeak }) => (
  <div className={`ask-msg ai ${m.failed ? "failed" : ""}`} data-testid="ask-turn">
    <span className="ask-msg-avatar"><Icon name="sparkle" size={11} /></span>
    <div className="ask-msg-body">
      <p className="ask-msg-text" aria-live="polite">{m.text}{streaming ? <span className="ask-cursor" /> : null}</p>
      {!streaming && m.ungrounded && <div className="ask-unverified"><Icon name="alert" size={11} /> {t.unverified}</div>}
      {!streaming && m.proposals && m.proposals.length ? m.proposals.map((p) => <AskCard key={p.id} p={p} messageId={m.id} t={t} onNav={onNav} />) : null}
      {!streaming && ((m.citations && m.citations.length) || m.navigate) ? (
        <div className="ask-msg-links">
          {m.navigate && (
            <button className="ask-action-chip" onClick={() => onNav(m.navigate.to)}>
              <Icon name="arrow-right" size={11} /> {m.navigate.label || t.open}
            </button>
          )}
          {m.citations && m.citations.length ? <span className="ask-from">{t.from}</span> : null}
          {(m.citations || []).map((c, i) => (
            <button key={i} className="ask-link-chip" onClick={() => onNav(c.to)} title={c.kind}>
              <Icon name={c.kind === "call" ? "phone" : c.kind === "person" ? "users" : c.kind === "page" ? "arrow-right" : "chat"} size={10} /> {c.label}
            </button>
          ))}
        </div>
      ) : null}
      {!streaming && m.followups && m.followups.length ? (
        <div className="ask-follow">
          {m.followups.map((f, i) => (
            <button key={i} className="ask-follow-chip" onClick={() => onFollow(f)}>{f}</button>
          ))}
        </div>
      ) : null}
      {!streaming && canSpeak && m.text && !m.failed ? (
        <button className="ask-speak" onClick={() => onSpeak(m)} title={t.read} aria-label={t.read}><Icon name="headphones" size={11} /> {t.read}</button>
      ) : null}
    </div>
  </div>
);

const AskReal = ({ open, onClose }) => {
  const A = window.__ask;
  const [query, setQuery] = useArState("");
  const [threads, setThreads] = useArState([]);
  const [active, setActive] = useArState(null); // { id, title, messages }
  const [live, setLive] = useArState(null); // the turn in flight: { text, trace }
  const [fast, setFast] = useArState(null); // a quick answer shown above the input
  const [scope, setScope] = useArState(null);
  const [sel, setSel] = useArState(0);
  const [lang, setLang] = useArState(() => (A ? A.language() : "en"));
  const [tick, setTick] = useArState(0);
  const [toastNode, flash] = window.usePPToast();
  const inputRef = useArRef(null);
  const bodyRef = useArRef(null);
  const scrollRef = useArRef(null);
  const t = AR_TEXT[lang === "es" ? "es" : "en"];
  const route = arRoute();
  const surface = A ? A.surfaceFor(route.page) : "other";
  const talk = useArTalk({
    lang,
    disabled: !!live,
    onWords: (words) => setQuery(words),
    onHeard: (heard, error) => {
      if (heard) { submit(heard); return; }
      if (error === "not-allowed") flash({ msg: <>{t.micDenied}</> });
      else if (error && error !== "aborted" && error !== "no-speech") flash({ msg: <>{t.micFailed}</> });
    },
  });

  // Open: focus, take the route's scope, load the threads, follow the feed.
  useArEffect(() => {
    if (!open || !A) return;
    setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
    const r = arRoute();
    setScope(A.scopeFor(r.page, r.param, arScopeLabel(r.page, r.param)));
    A.threads().then(setThreads);
    const bump = () => setTick((n) => n + 1);
    const evs = ["surface:inbox", "surface:live", "surface:clients", "surface:settings"];
    evs.forEach((e) => window.addEventListener(e, bump));
    return () => evs.forEach((e) => window.removeEventListener(e, bump));
  }, [open]);

  // Closed: nothing typed survives; an open conversation resumes next time.
  useArEffect(() => { if (!open) { setQuery(""); setFast(null); if (A) A.stopSpeaking(); } }, [open]);

  useArEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    const onNew = () => { setActive(null); setQuery(""); setFast(null); };
    const onSeed = (e) => {
      const d = (e && e.detail) || {};
      if (d.about) setScope(typeof d.about === "object" ? d.about : null);
      if (d.mode === "compose" || !d.prompt) { setActive(null); setQuery(d.prompt || ""); return; }
      submit(d.prompt);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("ask:new", onNew);
    window.addEventListener("ask:seed", onSeed);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("ask:new", onNew); window.removeEventListener("ask:seed", onSeed); };
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

  const nav = (to) => { onClose(); window.CHANLY.nav(to); };

  const openThread = async (th) => {
    const full = await A.thread(th.id);
    if (!full) { flash({ msg: <>{t.deleted}</> }); setThreads((prev) => prev.filter((x) => x.id !== th.id)); return; }
    setActive({ id: full.thread.id, title: full.thread.title, messages: full.messages, scope: full.thread.scope });
    if (full.thread.scope) setScope(full.thread.scope);
    setQuery("");
  };

  const removeThread = async (th) => {
    const ok = await A.deleteThread(th.id);
    if (!ok) { flash({ msg: <>Couldn&rsquo;t delete that thread.</> }); return; }
    setThreads((prev) => prev.filter((x) => x.id !== th.id));
    if (active && active.id === th.id) setActive(null);
    flash({ msg: <>{t.deleted}</> });
  };

  // A quick answer: no model, no thread. The openings one asks the calendar.
  const answerFast = async (q, fp) => {
    if (fp.kind === "openings") {
      setFast({ q, text: t.thinking, links: [], pending: true });
      try {
        const o = await A.openings(fp.day, fp.service);
        const text = o.state === "no_calendar" ? t.noCalendar : o.state === "unavailable" ? t.unavailable : o.text;
        const days = o.state === "ok" ? o.days : [];
        setFast({ q, text, days, links: [{ label: t.openings, to: "admin/integrations" }].filter(() => o.state !== "ok") });
      } catch {
        setFast({ q, text: t.unavailable, links: [] });
      }
      return;
    }
    setFast({ q, text: fp.answer, links: fp.links || [] });
  };

  const submit = async (qArg) => {
    const q = (typeof qArg === "string" ? qArg : query).trim();
    if (!q || live) return;
    setQuery("");
    const l = A.language(q);
    setLang(l);
    if (!active) {
      const fp = A.fast(q);
      if (fp) { answerFast(q, fp); return; }
    }
    setFast(null);
    const userMsg = { id: "u-" + Date.now(), role: "user", text: q, atMs: Date.now(), citations: [], followups: [], proposals: [] };
    const base = active ? { ...active, messages: [...active.messages, userMsg] } : { id: null, title: q, messages: [userMsg], scope };
    setActive(base);
    setLive({ text: "", trace: null });
    let threadId = base.id;
    let final = null;
    await A.send({ text: q, threadId, scope: base.scope || scope, surface }, (ev) => {
      if (ev.t === "thread") { threadId = ev.id; setActive((prev) => (prev ? { ...prev, id: ev.id, title: prev.title || ev.title } : prev)); }
      else if (ev.t === "trace") setLive((prev) => ({ ...(prev || { text: "" }), trace: ev.text }));
      else if (ev.t === "delta") setLive((prev) => ({ text: ((prev && prev.text) || "") + ev.text, trace: null }));
      else if (ev.t === "final") final = ev.message;
      else if (ev.t === "error") final = { id: "e-" + Date.now(), role: "assistant", text: ev.text, failed: true, citations: [], followups: [], proposals: [], atMs: Date.now() };
    });
    if (!final) final = { id: "e-" + Date.now(), role: "assistant", text: lang === "es" ? "Se cortó la respuesta. Inténtalo de nuevo." : "The answer was cut off. Try again.", failed: true, citations: [], followups: [], proposals: [], atMs: Date.now() };
    setLive(null);
    setActive((prev) => (prev ? { ...prev, id: threadId || prev.id, messages: [...prev.messages, final] } : prev));
    if (threadId) A.threads().then(setThreads);
  };

  const speak = (m) => {
    if (!A.speak(m.text, m.language)) flash({ msg: <>This browser can&rsquo;t read aloud.</> });
  };

  // ---- Rows at rest and while typing ----
  const qStr = query.trim();
  const sections = [];
  if (!active) {
    if (qStr) {
      const fp = A.fast(qStr);
      sections.push({ key: "fb", items: [{ type: "ask", icon: "sparkle", label: t.askRow(qStr), sub: fp ? (lang === "es" ? "Respuesta al instante" : "Instant answer") : t.askSub, q: qStr }] });
      const jumps = A.jump(qStr);
      if (jumps.length) sections.push({ key: "jump", label: t.jump, items: jumps.map((j) => ({ type: "jump", icon: j.kind === "person" ? "users" : j.kind === "thread" ? "inbox" : j.kind === "call" ? "phone" : "arrow-right", label: j.label, sub: j.sub, meta: j.kind, to: j.to })) });
      const hits = A.suggestions(surface, scope, lang).filter((s) => s.q.toLowerCase().includes(qStr.toLowerCase()));
      if (hits.length) sections.push({ key: "sug", label: t.ask, items: hits.map((s) => ({ type: "ask", icon: s.icon, label: s.q, q: s.q })) });
    } else {
      const now = A.rightNow().slice(0, 4);
      if (now.length) sections.push({ key: "now", label: t.now, items: now.map((n) => ({ type: "now", icon: n.icon || "inbox", label: n.title, sub: n.message, to: n.to })) });
      sections.push({ key: "ask", label: t.ask, items: A.suggestions(surface, scope, lang).map((s) => ({ type: "ask", icon: s.icon, label: s.q, q: s.q, fast: s.fast })) });
      if (threads.length) sections.push({ key: "recent", label: t.recent, items: threads.slice(0, 6).map((th) => ({ type: "thread", icon: "sparkle", label: th.title, sub: arAgo(th.lastAtMs), th })) });
    }
  }
  const flat = [];
  sections.forEach((sec) => sec.items.forEach((it) => { it._i = flat.length; flat.push(it); }));
  const selMax = flat.length - 1;

  const activate = (it) => {
    if (!it) return;
    if (it.type === "thread") { openThread(it.th); return; }
    if (it.type === "jump" || it.type === "now") { nav(it.to); return; }
    submit(it.q);
  };

  const onKey = (e) => {
    if (active) {
      if (e.key === "Escape") { e.stopPropagation(); setActive(null); setQuery(""); }
      else if (e.key === "Enter") { e.preventDefault(); submit(); }
      else if (e.key === "ArrowUp" && !query) { const last = [...active.messages].reverse().find((m) => m.role === "user"); if (last) { e.preventDefault(); setQuery(last.text); } }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(selMax, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (flat[sel] && (qStr === "" || flat[sel].type !== "ask" || flat[sel].q !== qStr)) activate(flat[sel]); else if (qStr) submit(); }
  };

  const chipFor = (s) => s ? (s.kind === "call" ? "phone" : s.kind === "person" ? "users" : s.kind === "page" ? "arrow-right" : "chat") : null;

  return (
    <div className="ask-overlay" onClick={onClose} data-tick={tick}>
      <div className="ask-modal cmd-modal ask-real" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ask Chanlytics" data-testid="ask-real">
        <div className="cmd-input-bar">
          {active
            ? <button className="cmd-back" onClick={() => { setActive(null); setQuery(""); }} aria-label="Back to the palette"><Icon name="chevron" size={13} style={{ transform: "rotate(180deg)" }} /></button>
            : <Icon name="sparkle" size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />}
          {scope && (
            <span className="cmd-ctx ask-scope" title={`${scope.kind}: ${scope.label}`} data-testid="ask-scope">
              <Icon name={chipFor(scope)} size={10} /> {scope.label}
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
            disabled={!!live}
            aria-label="Ask Chanlytics"
            data-testid="ask-input"
            maxLength={1000}
          />
          {talk.canTalk && (
            <button
              type="button"
              className={`btn btn-sm ask-talk ${talk.listening ? "on" : ""}`}
              data-testid="ask-talk"
              aria-pressed={talk.listening}
              title={t.talk}
              disabled={!!live}
              onPointerDown={talk.start}
              onPointerUp={talk.stop}
              onPointerLeave={talk.stop}
              onPointerCancel={talk.stop}
              onContextMenu={(e) => e.preventDefault()}
            >
              <Icon name="wave" size={13} /> <span className="ask-talk-label">{talk.listening ? t.listening : t.talk}</span>
            </button>
          )}
          <span className="kbd">↵</span>
        </div>

        <div className="cmd-body" ref={bodyRef}>
          {active ? (
            <div className="ask-msgs" ref={scrollRef}>
              {active.messages.map((m, i) => m.role === "user"
                ? <div key={m.id || i} className="ask-msg user"><p className="ask-msg-text">{m.text}</p></div>
                : <AskTurn key={m.id || i} m={m} t={t} onFollow={submit} onNav={nav} canSpeak={A.canSpeak()} onSpeak={speak} />)}
              {live && (
                live.text
                  ? <AskTurn m={{ text: live.text, citations: [], followups: [] }} streaming t={t} onFollow={submit} onNav={nav} canSpeak={false} onSpeak={() => {}} />
                  : <div className="ask-trace" data-testid="ask-trace"><span className="ask-trace-dot" />{live.trace || t.thinking}</div>
              )}
            </div>
          ) : (
            <>
              {fast && (
                <div className="ask-fast" data-testid="ask-fast">
                  <div className="ask-fast-q">{fast.q}</div>
                  <div className="ask-fast-a">{fast.text}</div>
                  {fast.days && fast.days.length ? (
                    <div className="ask-fast-days">
                      {fast.days.map((d) => <div key={d.key}><b>{d.label}</b> {d.windows.join(" · ")}</div>)}
                    </div>
                  ) : null}
                  {(fast.links || []).length ? (
                    <div className="ask-msg-links">
                      {fast.links.map((l, i) => <button key={i} className="ask-link-chip" onClick={() => nav(l.to)}>{l.label} <Icon name="arrow-right" size={10} /></button>)}
                    </div>
                  ) : null}
                  {A.canSpeak() && !fast.pending && <button className="ask-speak" onClick={() => A.speak(fast.text, lang)}><Icon name="headphones" size={11} /> {t.read}</button>}
                </div>
              )}
              {flat.length === 0 ? (
                <div className="cmd-empty">{t.empty}</div>
              ) : (
                sections.map((sec) => (
                  <React.Fragment key={sec.key}>
                    {sec.label && <div className="cmd-sec-label">{sec.label}</div>}
                    {sec.items.map((it) => (
                      <button key={it._i} className={`cmd-row ${it.type} ${it._i === sel ? "sel" : ""}`} onMouseMove={() => setSel(it._i)} onClick={() => activate(it)} data-testid={`ask-row-${it.type}`}>
                        <span className="cmd-row-ic"><Icon name={it.icon} size={12} /></span>
                        <span className="cmd-row-main">
                          <span className="cmd-row-label">{it.label}</span>
                          {it.sub && <span className="cmd-row-sub">{it.sub}</span>}
                        </span>
                        {it.fast && <span className="cmd-row-kind">instant</span>}
                        {it.meta && <span className="cmd-row-kind">{it.meta}</span>}
                        {it.type === "thread" && <span className="cmd-row-del" role="button" tabIndex={-1} aria-label="Delete thread" onClick={(e) => { e.stopPropagation(); removeThread(it.th); }}><Icon name="x" size={10} /></span>}
                        <Icon name="arrow-right" size={12} className="cmd-row-arrow" />
                      </button>
                    ))}
                  </React.Fragment>
                ))
              )}
            </>
          )}
        </div>

        <footer className="cmd-foot">
          {active
            ? <><span><span className="kbd">↵</span> send</span><span><span className="kbd">esc</span> back</span><span className="cmd-foot-note">{t.footNote}</span></>
            : <><span><span className="kbd">↑↓</span> move</span><span><span className="kbd">↵</span> select</span><span><span className="kbd">esc</span> close</span><span className="cmd-foot-note">{t.footNote}</span></>}
        </footer>
      </div>
      {toastNode}
    </div>
  );
};

window.AskReal = AskReal;
