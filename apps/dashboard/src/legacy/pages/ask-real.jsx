/* global React, Icon, Confirm */
// AskReal: Ask as the Line (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 6, and the Stage's,
// docs/superpowers/specs/2026-09-23-ask-the-stage-design.md, section 5), one layout everywhere: a head, the three large in
// a hero that a held press talks to, the rows (home, typing, Earlier) or a conversation as one thread (the spec
// 2026-09-27-ask-chat-on-a-phone), each answer Say · Show · Do (ask-turn.jsx), and the field at the foot. Reopening
// resumes the conversation and the words typed until New; the tab keeps both across a reload (S9).
// On a phone it is the whole screen, and ×, Esc, a pull down and Back close it. On a desk it is a panel of glass docked
// at the right, the sidebar's twin, over a page that keeps its layout and stays the member's (Ruben, 16 Oct 2026): ×, Esc
// and a press outside close it, that press going on to what it was on; an answer that opens a place moves the page there
// with Ask still open; and the keys pressed in either are that one's own.
// This file is the shell: the state of one open Line, its keys and the turn runner. The rows are ask-home.jsx's, the
// words ask-text.jsx's and the hooks ask-hooks.jsx's; everything that talks to the workspace goes through window.__ask.
// No key symbol is drawn (D17): the shortcuts sheet lists the keys (contracts SHORTCUTS), opened by ? or the account menu.

const useArState = React.useState;
const useArEffect = React.useEffect;
const useArLayout = React.useLayoutEffect || React.useEffect;
const useArRef = React.useRef;

// A hold's lift that makes no click on the button (the finger let go elsewhere) is forgotten after this.
const AR_LIFT_MS = 400;

const arRoute = () => {
  const [page, ...rest] = window.CHANLY.address.route().split("/");
  return { page: page || "today", param: rest.length ? rest.join("/") : null };
};

const arScopeLabel = (page, param) => {
  if (!param) return null;
  const T = (window.INBOX_DATA || {}).THREADS || [];
  if (page === "inbox") { const t = T.find((x) => x.id === param); return t ? t.who : null; }
  // A person is named by the palette's scopeFor (personLabelOf), on any of their tabs: the address is read once, there.
  if (page === "conversations" && param.startsWith("cv-")) {
    const L = window.__LIVE || {};
    const c = [...(L.now || []), ...(L.recent || [])].find((x) => x.callId === param.slice(3));
    return c ? c.who : null;
  }
  return null;
};

const arScopeIcon = (s) => window.AskAnswerKit.askKindGlyph(s.kind);

const arFailed = (id, text) => ({ id, role: "assistant", text, failed: true, citations: [], followups: [], proposals: [], atMs: Date.now() });

/** The newest question's key: the thread stands it at the top once each (the spec 2026-09-27-ask-chat-on-a-phone, D5). */
const arNowKey = (active, quick) => {
  const q = active ? [...active.messages].reverse().find((m) => m.role === "user") : null;
  return q ? q.id : quick ? `quick:${quick.q}` : "";
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

// ---- The Line's hooks: one concern each, called in the order AskReal always called them -----------------------------

/** The state of one Line: the words, the conversations, the turn in flight, where the keys stand, and the refs its effects and handlers share. */
const useArLine = (A, H) => {
  const [query, setQuery] = useArState("");
  const [threads, setThreads] = useArState([]);
  const [active, setActive] = useArState(null); // { id, title, messages, scope }
  const [live, setLive] = useArState(null); // the turn in flight: { q, text, traces }
  const [quick, setQuick] = useArState(null); // a quick question being read, no model: { q, pending: true }; its answer opens `active`
  const [scope, setScope] = useArState(null);
  const [sel, setSel] = useArState(0); // the row the keys stand on
  const [move, setMove] = useArState(-1); // the answer's move they stand on, none at first
  const [lang, setLang] = useArState(() => (A ? A.language() : "en"));
  const [tick, setTick] = useArState(0);
  const [view, setView] = useArState("rows"); // "rows", or "earlier": every conversation
  // The conversation a × or the Delete key asked to delete, waiting for a yes (N5).
  const [doomed, setDoomed] = useArState(null);
  // A phone's field in use (focused, so its keyboard is up): the takeover composes. The rows (Right now, Brief me, the
  // page's questions, and the words' own rows once typed) go as the field slides up over their place; the three keep
  // their size, centred in what is left with the standing pills under them, and listen, each key heard lifting them
  // (spec 5.9, "Composing").
  const [composing, setComposing] = useArState(false);
  // Where the field and the three stood as the field was focused (H.slideFrom), until the slide has run.
  const slideFrom = useArRef(null);
  const speech = H.useAskSpeech(A);
  const [toastNode, flash] = window.usePPToast("ask-flash");
  const inputRef = useArRef(null);
  const faceRef = useArRef(null);
  const heroRef = useArRef(null);
  const stageRef = useArRef(null);
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
  // When the Line opened: the question says how long it waited (the turn's shape, opened_ms).
  const openedAt = useArRef(0);
  // Whether the takeover's Back entry is in the history (useArClose pushes it on a phone, nav takes it for a place).
  const pushed = useArRef(false);
  // On a desk, whether the member has gone to work in the page beside the panel (focus left it): the field stops taking
  // focus back as answers land until they come back to the panel (useArFocus).
  const away = useArRef(false);
  return {
    query, setQuery, threads, setThreads, active, setActive, live, setLive, quick, setQuick, scope, setScope, sel, setSel,
    move, setMove, lang, setLang, tick, setTick, view, setView, doomed, setDoomed, composing, setComposing, slideFrom, speech, toastNode, flash, inputRef, faceRef, heroRef, stageRef, bodyRef,
    dialogRef, typing, threadsReady, turnSeq, asked, held, openedAt, pushed, away,
  };
};

/** Talking: held on the mic, a Space held on an empty line, a phone's three held a beat; said where the browser cannot listen. The hold is the one mic, and its words go the typed way (the spec's §3.5 as amended 5 Oct, evening): their reads drawn as they run, the answer read aloud in Ask's voice as it lands (arSubmitter). */
const useArVoice = (ln) => {
  const { A, H, M, lang, live, query, setQuery, typing, flash, t, submit, speech } = ln;
  const talk = H.useAskTalk({
    lang,
    disabled: !!live,
    onWords: (words) => { setQuery(words); if (M) M.mood.hear(0.8); },
    onHeard: (heard, error) => {
      if (heard) { if (!typing.current) submit(heard, undefined, { spoken: true }); return; }
      // Each said once: a second press refreshes the toast that says it (`once`), never a second beneath it.
      if (error === "blocked") flash({ once: "ask-mic", msg: <>{t.micBlocked}</> });
      else if (error === "not-allowed") flash({ once: "ask-mic", msg: <>{t.micDenied}</> });
      else if (error && error !== "aborted" && error !== "no-speech") flash({ once: "ask-mic", msg: <>{t.micFailed}</> });
    },
  });
  // Every hold is one: the recogniser starts, what Ask's voice was reading stops, its element is readied inside the press
  // so the answer can be read once it lands (a phone plays audio only from a gesture; the lift readies it too, a press
  // going down being none to some), and the model's cache is warmed for the words on their way. Not while a turn runs:
  // the recogniser is off then (`disabled`), and the one line Ask's voice says while it works goes on (ask/aloud.ts).
  const begin = (e) => {
    if (!talk.canTalk) { flash({ once: "ask-mic", msg: <>{t.noVoice}</> }); return; }
    if (!live) { speech.stop(); speech.ready(); if (A.warmModel) A.warmModel(); }
    talk.start(e);
  };
  const end = () => { talk.stop(); speech.ready(); };
  // A Space held on an empty line talks (6.6); where the browser cannot listen, it says so.
  const hold = H.useHoldSpace({ empty: () => !query && !live, talk: { start: begin, stop: end } });
  // A phone's three listen to a press held a beat, with a buzz where the browser has one (S11, S16); where the browser
  // cannot listen, they say so (the field's button is Send alone there).
  const buzz = (ms) => { try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms); } catch { /* none here */ } };
  const holdThree = H.useHoldPress({ talk: { start: begin, stop: end }, onHold: () => buzz(8) });
  return { talk, hold, buzz, holdThree, begin, end };
};

// Ask's mood, said once for every face: listening while held, or while a phone's field is in use, reading until the
// first words, answering while they stream or are read aloud, at rest otherwise. Said while the Line is closed too,
// so a turn left running still shows.
const useArMood = ({ M, talk, live, quick, speech, composing }) => {
  const moodState = talk.listening
    ? "listening"
    : live
      ? live.say || live.text ? "speaking" : "thinking"
      : quick && quick.pending
        ? "thinking"
        : speech.speakingId ? "speaking" : speech.loading ? "thinking" : composing ? "listening" : "idle";
  // Said as it changes, never the same word twice: at mount, and at a strict mode's second mount, the Line has nothing
  // to say, and the three may be reading the page in for a face that mounted a moment before (legacy-bridge/arrival.ts);
  // a first word of "idle" ended that read on nothing.
  const moodSaid = useArRef("idle");
  useArEffect(() => {
    if (!M || moodState === moodSaid.current) return;
    moodSaid.current = moodState;
    M.mood.set(moodState);
  }, [moodState]);
};

/** A phone's field in use: the slide to where the screen made room, and no composing once the Line closes. */
const useArSlide = ({ H, open, composing, setComposing, slideFrom, stageRef, heroRef }) => {
  // The slide runs once the screen has made room (watchKeyboard hears the focus after this page does, so the room is
  // there by the next frame, before anything is painted).
  useArLayout(() => {
    if (!composing || !slideFrom.current || typeof requestAnimationFrame !== "function") return undefined;
    const from = slideFrom.current;
    slideFrom.current = null;
    const id = requestAnimationFrame(() => H.slide(from, stageRef.current, heroRef.current));
    return () => cancelAnimationFrame(id);
  }, [composing]);
  useArEffect(() => { if (!open) setComposing(false); }, [open, setComposing]);
};

/** What opening does: the route's scope, the threads and the surfaces the rows read, and the three coming in from the button. */
const useArOpen = ({ open, A, route, openedAt, setScope, threadsReady, setThreads, setTick, faceRef }) => {
  // Open: the route's scope, the threads, and the surfaces the rows read (Right now reads Today's and Broadcasts').
  useArEffect(() => {
    if (!open || !A) return;
    openedAt.current = Date.now();
    const r = arRoute();
    setScope(A.scopeFor(r.page, r.param, arScopeLabel(r.page, r.param)));
    threadsReady.current = A.threads().then((list) => { setThreads(list); return list; });
    const bump = () => setTick((n) => n + 1);
    const evs = ["surface:inbox", "surface:live", "surface:clients", "surface:settings", "surface:today", "surface:broadcasts"];
    evs.forEach((e) => window.addEventListener(e, bump));
    return () => evs.forEach((e) => window.removeEventListener(e, bump));
  }, [open]);

  // Open, and the page under the Line changing while it is open: the page is warmed (POST ask/warm; legacy-bridge/ask/api.ts),
  // so the server has read the rows on screen before the question comes. Never waited on; a page that cannot say what it
  // holds, or a warm that fails, costs nothing.
  useArEffect(() => {
    if (!open || !A || !A.warm || !A.context) return;
    // A tick later, so a page that has just come under the Line has said what it drew (legacy-bridge/ask/context.ts).
    const id = setTimeout(() => {
      try { Promise.resolve(A.warm(A.context(arRoute()))).catch(() => {}); } catch (e) { /* the question still goes */ }
    }, 0);
    return () => clearTimeout(id);
  }, [open, route.page, route.param]);

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
      // Centre to centre, since a box scales about its centre, less the way a desk's panel has still to slide in; and
      // scaled by the three's own size in each box (the mascot's fitSide), since the hero's stage is far wider than they
      // are, and its width alone started them smaller than the button's and popped them up.
      const box = to.closest ? to.closest(".ask-line") : null;
      const slid = box && window.getComputedStyle ? parseFloat(String(window.getComputedStyle(box).translate || "0").split(" ")[0]) || 0 : 0;
      const fit = (window.__mascot && window.__mascot.fitSide) || ((w, h) => Math.min(w / 3.8, h / 3.2));
      const dx = a.left + a.width / 2 - (b.left - slid + b.width / 2);
      const dy = a.top + a.height / 2 - (b.top + b.height / 2);
      const k = b.width && b.height ? fit(a.width, a.height) / fit(b.width, b.height) : 0;
      if (k)
        to.animate(
          [{ translate: `${dx}px ${dy}px`, scale: `${k}` }, { translate: "0 0", scale: "1" }],
          { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
    }
    return () => { if (body && body.classList) body.classList.remove("ask-open"); };
  }, [open]);

  // On a desk the page beside the panel is live: as it moves (a press there, or an answer's Open), the scope follows it,
  // so the next question is about what is on screen. A phone's takeover covers the page, which does not move under it.
  useArEffect(() => {
    if (!open || !A || arPhone()) return;
    setScope(A.scopeFor(route.page, route.param, arScopeLabel(route.page, route.param)));
  }, [route.page, route.param]);
};

/** What Ask puts over the page itself, whose presses are not a press outside a desk's panel: its toasts, a card's menu, pop or sheet, and the top bar's Ask, which toggles it. */
const AR_OVER_ASK = '[role="dialog"], [role="alertdialog"], [role="menu"], .pop-place, .pp-toast-stack, .tb-ask';

/** Closing: Back on a phone, a press outside a desk's panel, and what the Line forgets once closed. */
const useArClose = ({ H, open, onClose, setQuick, setDoomed, setView, speech, pushed, dialogRef }) => {
  // Back closes the takeover (S8); whether the entry is ours is `pushed` (useArLine), and going somewhere takes it for
  // the place (nav). A desk's panel closes on a press outside it, which goes on to what it was on (Ruben, 16 Oct 2026:
  // "users can click away and it closes"). Both are ask-hooks.jsx's.
  H.useAskBack(open && arPhone(), pushed, onClose);
  H.useAskPressAway(open && !arPhone(), dialogRef, AR_OVER_ASK, onClose);

  // Closed: nothing keeps reading or talking and the rows are home again; the words typed and an open conversation
  // come back until Clear (D14, S9).
  useArEffect(() => {
    if (!open) { setQuick(null); setDoomed(null); setView("rows"); speech.stop(); }
  }, [open]);
};

// The draft and the conversation's id, kept in the tab (legacy-bridge/tab-memory.ts) so a reload keeps them too (S9):
// the words as typed, never on a timer (record-fold.jsx useUnsavedWork), forgotten when the field empties while open;
// the Line is made closed, so being made forgets nothing. The id whenever a thread is opened or made, forgotten when
// the conversation ends (Clear, or deleted), never by the Line being made, or when the kept one cannot be read, so a
// thread that will not read does not flash on every open.
const useArMemory = ({ open, A, query, setQuery, active, asked, openThread }) => {
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
};

/** Where focus goes: the field on a desktop, the dialog on a phone or any touch screen, the field again after "Type instead"; a phone's dialog holds it (trapFocus), a desk's panel shares it with the page beside it. */
const useArFocus = ({ A, H, open, doomed, live, active, view, quick, inputRef, dialogRef, talk, typing, away }) => {
  const phone = arPhone();
  // The field with a mouse and keys; else the dialog, so no keyboard rises until a tap asks (S10; focusAsDrawn).
  const field = !phone && (!A || !A.focusAsDrawn || A.focusAsDrawn());
  // On a desk, once the member works in the page (focus left the panel) the field leaves them there as answers land,
  // until they come back to the panel (ask-hooks.jsx useAskAway).
  H.useAskAway(open && !phone, dialogRef, away);
  H.useAskFocus(inputRef, open && !doomed && field, [open, live, active, doomed, view, quick], () => !away.current);
  H.useAskFocus(dialogRef, open && !field, [open]);
  // A phone's takeover keeps Tab inside it; a desk's panel lets Tab go on to the page, and as it closes gives focus back
  // to what had it before it opened, unless the member has put it somewhere since (ask-hooks.jsx useAskGiveBack).
  useArEffect(() => (open && phone && window.trapFocus ? window.trapFocus(dialogRef.current) : undefined), [open, phone, dialogRef]);
  H.useAskGiveBack(open && !phone, dialogRef);
  // Listening ended after "Type instead": the words heard are in the field, and the field takes focus to finish them.
  useArEffect(() => {
    if (talk.listening || !typing.current) return;
    typing.current = false;
    if (inputRef.current) inputRef.current.focus();
  }, [talk.listening]);
};

/** Esc, wherever it is the Line's: a turn in flight stops, else Earlier steps back to the rows, else Ask closes. */
const arEscape = ({ live, stop, view, setView, onClose }) => {
  if (live) stop();
  else if (view === "earlier") setView("rows");
  else onClose();
};

/** What the shell sends as it opens the Line, and the keys anywhere in it. */
const useArSeedKeys = ({ open, A, onClose, live, view, asked, setTick, setView, setScope, setActive, setQuick, setQuery, stop, openThread, submit }) => {
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
    // Esc stops a turn in flight, else steps back out of Earlier, else closes (the line takes Esc first when it has
    // focus, onKey). On a desk an Esc pressed in the page beside the panel is the page's: the panel takes its own
    // (ask-hooks.jsx panelKeys).
    const onKeys = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setView((v) => (v === "earlier" ? "rows" : "earlier"));
        return;
      }
      if (e.key === "Escape" && !e.defaultPrevented && arPhone()) arEscape({ live, stop, view, setView, onClose });
    };
    window.addEventListener("keydown", onKeys);
    // Taken once open, after the route's own scope, so a request's scope wins.
    const d = asked.current;
    if (d) {
      asked.current = null; const r = arRoute(), chip = d.about ? (typeof d.about === "object" ? d.about : null) : A.scopeFor(r.page, r.param, arScopeLabel(r.page, r.param));
      if (d.about) setScope(chip);
      if (d.thread) openThread({ id: d.thread });
      else if (d.mode === "compose" || !d.prompt) { setActive(null); setQuick(null); setQuery(d.prompt || ""); }
      else submit(d.prompt, chip); // the chip this opening shows: `scope` is still the last opening's until the next draw
    }
    return () => window.removeEventListener("keydown", onKeys);
  });
};

/** Where the keys stand: back to the top whenever what is under the line changes, and kept in sight as they move. */
const useArWalk = ({ H, query, active, open, view, quick, live, setSel, setMove, bodyRef, sel, move }) => {
  // A new place to stand whenever what is under the line changes; not on every piece of a streaming answer.
  useArEffect(() => { setSel(0); setMove(-1); }, [query, active, open, view, quick, !!live]);
  // Earlier and the home start at their top; in a thread the newest question stands at its top, once per question or
  // conversation, never again as its answer lands (D5, D10). The row or move the keys stand on stays in sight.
  const fromTop = view !== "rows" || !(active || quick);
  useArEffect(() => { if (bodyRef.current && fromTop) bodyRef.current.scrollTop = 0; }, [active && active.messages.length, quick, view, fromTop]);
  H.useAskPin(bodyRef, arNowKey(active, quick), open && view === "rows" && !!(active || quick));
  useArEffect(() => {
    const b = bodyRef.current;
    if (!b || !b.querySelector) return;
    const el = b.querySelector(".ask-row.sel, .ask-chip.sel, .ask-item.sel, .ask-open.sel");
    if (!el || !el.getBoundingClientRect) return;
    const top = el.getBoundingClientRect().top - b.getBoundingClientRect().top - b.clientTop + b.scrollTop, h = el.offsetHeight;
    if (top < b.scrollTop) b.scrollTop = Math.max(0, top - 8);
    else if (top + h > b.scrollTop + b.clientHeight) b.scrollTop = top + h - b.clientHeight + 8;
  }, [sel, move]);
  H.useAskScrollCues(bodyRef, open); // its bar while it scrolls, its top edge faded once scrolled (ask-hooks.jsx)
};

// ---- The Line's acts and the turn, made before the hooks that call them ---------------------------------------------

/** Going somewhere, a question back in the field, leaving the turn in flight, Clear, a card's outcome, a conversation opened or deleted, and Stop. */
const arActs = (ln) => {
  const { A, M, onClose, pushed, active, setActive, live, setLive, turnSeq, lang, setQuery, setQuick, setView, setScope, setThreads, setDoomed, speech, flash, t, inputRef } = ln;
  // Going somewhere: on a desk the page beside the panel goes there and Ask stays open beside it, the conversation and
  // all (`stay`); a place jumped to from the words typed is a launcher's, and closes it. On a phone, and for a jump,
  // the Line closes; ⌘K brings the conversation back. On a phone the place takes the takeover's entry (replaced, never
  // pushed over it and then gone back from), so Back from there is the page Ask was opened over.
  const nav = (to, how) => {
    if (pushed.current && window.appNavigate) { pushed.current = false; onClose(); window.appNavigate(to, { replace: true }); return; }
    if (!(how && how.leave) && !arPhone()) { window.CHANLY.nav(to); return; }
    onClose();
    window.CHANLY.nav(to);
  };
  // "Change what I asked" on a card: the turn's own question back in the field, to change (spec F4). An earlier turn
  // hands its own question; the latest turn's card takes the last one asked.
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
  // Clear: the conversation ends, spoken or typed, and the Line is home again; the thread stays in Earlier.
  const clearLine = () => {
    moveOn();
    setActive(null); setQuery(""); setQuick(null); setView("rows");
    speech.stop();
  };
  // What became of a card, kept on the conversation the Line holds, so the card drawn again (an earlier turn, the
  // answer back in the thread) says "Sent" and never offers Send twice. The route keeps it too (AskCard `record`).
  const noteOutcome = (messageId, pid, o) =>
    setActive((prev) =>
      prev
        ? { ...prev, messages: prev.messages.map((m) => (m.id === messageId ? { ...m, proposals: (m.proposals || []).map((p) => (p.id === pid ? { ...p, outcome: o } : p)) } : m)) }
        : prev,
    );

  const openThread = async (th) => {
    moveOn(); speech.stop();
    const full = await A.thread(th.id);
    // A read that failed keeps the thread on the list and says so; only a thread that is gone is dropped as deleted.
    if (!full) { flash({ tone: "danger", msg: <>{t.threadUnreadable}</> }); return null; }
    if (full.missing) { flash({ msg: <>{t.deleted}</> }); setThreads((prev) => prev.filter((x) => x.id !== th.id)); return null; }
    const opened = { id: full.thread.id, title: full.thread.title, messages: full.messages, scope: full.thread.scope };
    setActive(opened);
    if (full.thread.scope) setScope(full.thread.scope);
    setQuery(""); setQuick(null); setView("rows");
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

  // Stop: the Line lets go of the turn, whose server keeps it as stopped, and says so with what its Say had written, as the thread will.
  const stop = () => {
    if (!live) return;
    moveOn(); live.turn.ctl.abort();
    setActive((prev) => (prev ? { ...prev, messages: [...prev.messages, A.stoppedTurn(live.say, lang)] } : prev));
  };
  return { nav, editWords, moveOn, clearLine, noteOutcome, openThread, askDelete, removeThread, stop };
};

/** A phone lets go of the field as a question is asked, and its keyboard: the answer lands to be read, never dimmed (D4). */
const arLetGo = (el) => { if (arPhone() && el && typeof el.blur === "function") el.blur(); };

// A quick question (contracts askIntent): answered from what the page holds, with no model, as the first turn of a
// conversation, kept as it is drawn (A.keepQuick: in the thread whose first question it repeats, else a new one), whose
// id the conversation takes as it lands (`kept`). A later question, a conversation opened or Clear meanwhile: not drawn.
const arQuickTurn = async (ln, q, pending, spoken) => {
  const { A, M, turnSeq, threads, threadsReady, setQuick, setActive, setThreads } = ln;
  const mine = ++turnSeq.current; setQuick({ q, pending: true });
  const answer = await pending; if (mine !== turnSeq.current) return;
  const kept = (threadsReady.current || Promise.resolve(threads)).then((list) => A.keepQuick({ text: q, answer, threadId: (list.find((th) => A.sameQuestion(th.title, q)) || {}).id || null })).catch(() => null);
  const m = { atMs: Date.now(), citations: [], followups: [], proposals: [] };
  setQuick(null); setActive({ id: null, title: q, scope: null, kept, messages: [{ ...m, id: "u-" + m.atMs, role: "user", text: q }, { ...m, id: "k-" + m.atMs, role: "assistant", text: A.answerText(answer), answer }] });
  kept.then((th) => { if (th) { setActive((prev) => (prev && prev.kept === kept ? { ...prev, id: th.id, title: th.title } : prev)); A.threads().then(setThreads); } });
  if (M) { M.mood.set("idle"); M.mood.react("nod"); }
  if (spoken) arAnswerAloud(ln, A.answerSpoken(answer));
};
/** A conversation a quick answer opened, once its turn is kept: in the thread it landed in, or in none if it was not. */
const arKept = async (c) => { const th = await c.kept; return { ...c, kept: null, ...(th ? { id: th.id, title: th.title } : {}) }; };

// One turn: the question goes in, the words stream back, the answer lands. A quick question needs no model (arQuickTurn).
// A question that repeats a thread's first question resumes that thread rather than opening a twin. `turn` is what the
// stream writes and the landing reads: its thread's id, the final message, and what it has said. Asking (as opening
// another conversation does) stops an answer read aloud, which went on over the next one (D14).
const arSubmitter = (ln) => {
  const { A, query, live, active, threads, threadsReady, turnSeq, scope, surface, openedAt, inputRef, speech, setQuery, setView, setLang, setQuick, setScope, openThread } = ln;
  const submit = async (qArg, chipArg, how) => {
    const q = (typeof qArg === "string" ? qArg : query).trim(), chip = chipArg !== undefined ? chipArg : scope; // a seed names its opening's chip; `how.spoken` marks a question the recogniser heard
    if (!q || live) return;
    arLetGo(inputRef.current); speech.stop();
    const spoken = !!(how && how.spoken);
    setQuery("");
    setView("rows");
    setLang(A.language(q));
    const pending = active ? null : A.quick(q);
    if (pending) return arQuickTurn(ln, q, pending, spoken);
    setQuick(null);
    let base = active && active.kept ? await arKept(active) : active; // asked once a quick turn is kept, which it reads
    if (!base) {
      const list = await (threadsReady.current || Promise.resolve(threads));
      const twin = list.find((th) => A.sameQuestion(th.title, q));
      if (twin) { base = await openThread(twin); if (chip) setScope(chip); } // the chip it is asked with, not the twin's stored scope
    }
    const { thread, turn } = arBeginTurn(ln, q, chip, base, { spoken });
    // Spoken: Ask's voice says it is working, once, if the answer has not begun by then (ask/aloud.ts).
    if (spoken) speech.wait(A.language(q), () => turn.spoke || !!turn.final || turn.mine !== turnSeq.current);
    // The page, as it is now: the rows on screen and the row the words name, if they name one -- in the thread it joins, by its last answer's items first (legacy-bridge/ask/context.ts). A page that cannot say what it holds sends none: the question still goes.
    let context = null;
    try { context = A.context ? A.context(arRoute(), q, base && base.messages) : null; } catch (e) { context = null; }
    await A.send({ text: q, threadId: turn.threadId, scope: thread.scope, surface, openedMs: openedAt.current ? Date.now() - openedAt.current : null, context, signal: turn.ctl.signal }, (ev) => arTurnHeard(ln, turn, ev));
    arTurnLanded(ln, turn);
  };
  return submit;
};

/** What the stream sends: its thread, named on the conversation it began while that is open (stopped too: the next question carries on in it); then, while the turn is the current one, a read that landed, the Say so far, the words, the end. */
const arTurnHeard = ({ M, turnSeq, setActive, setLive }, turn, ev) => {
  if (ev.t === "thread") { turn.threadId = ev.id; setActive((prev) => (prev && prev.messages.some((m) => m.id === turn.qid) ? { ...prev, id: ev.id, title: prev.title || ev.title } : prev)); return; }
  if (turn.mine !== turnSeq.current) return;
  if (ev.t === "trace") {
    setLive((prev) => (prev ? { ...prev, traces: [...prev.traces, ev.text].slice(-3) } : prev));
    // a read that landed: the three's orbit surges and a light runs down them (mascot mood.ts pulse)
    if (M && M.mood.pulse) M.mood.pulse(0.7);
    return;
  }
  if (ev.t === "say") {
    // The answer's Say as written so far: it replaces what was drawn; the final message is the answer. An empty one takes back an answer the server set aside, and the reads show again.
    const back = !ev.headline && !ev.detail;
    setLive((prev) => (prev ? { ...prev, say: back ? null : { headline: ev.headline, detail: ev.detail, show: ev.show || null } } : prev));
    if (!back) turn.spoke = true;
    const len = ev.headline.length + ev.detail.length;
    if (M && len > turn.said) M.mood.beat(Math.min(1, (len - turn.said) / 6));
    turn.said = len;
    return;
  }
  if (ev.t === "delta") {
    setLive((prev) => (prev ? { ...prev, text: prev.text + ev.text } : prev));
    turn.spoke = true;
    if (M) M.mood.beat(Math.min(1, ev.text.length / 6));
    return;
  }
  if (ev.t === "final") turn.final = ev.message;
  else if (ev.t === "error") turn.final = arFailed("e-" + Date.now(), ev.text);
};

/** The turn done, if still the current one: the answer on the line, the thread's title read again, and the answer's `now` place gone to. */
const arTurnLanded = ({ A, M, t, turnSeq, setLive, setActive, setThreads, buzz, nav, speech, flash }, turn) => {
  if (turn.mine !== turnSeq.current) return;
  if (!turn.final) turn.final = arFailed("e-" + Date.now(), t.cutOff);
  setLive(null);
  buzz(8);
  // Done: a failure shakes; an answer that streamed nods on its own as the row settles, one that did not nods here.
  if (M) {
    M.mood.set("idle");
    if (turn.final.failed) M.mood.react("shake");
    else if (!turn.spoke) M.mood.react("nod");
  }
  setActive((prev) => (prev ? { ...prev, id: turn.threadId || prev.id, messages: [...prev.messages, turn.final] } : prev));
  if (turn.spoken && !turn.final.failed) arAnswerAloud({ speech, flash, t }, A.answerSpoken(A.answer(turn.final).answer));
  if (turn.threadId) A.threads().then((list) => {
    setThreads(list);
    const now = list.find((x) => x.id === turn.threadId);
    if (now) setActive((prev) => (prev && prev.id === turn.threadId ? { ...prev, title: now.title } : prev));
  });
  // "Open the 3:34 AM call": the app goes there as the answer lands (the answer's `now`, section 5.1).
  const o = turn.final.failed ? null : turn.final.answer ? turn.final.answer.do.open : turn.final.navigate && turn.final.navigate.to ? turn.final.navigate : null;
  if (o && o.now) setTimeout(() => nav(o.to), 250);
};
// A question spoken is answered aloud by itself (the spec's §3.5 as amended 4 and 5 Oct): the words Read aloud would
// read, in Ask's voice, after the line it says while it works (ask/aloud.ts); a typed one stays quiet.
const arAnswerAloud = ({ speech, flash, t }, say) => {
  if (say && speech.canSpeak) speech.answer(say).then((why) => { if (why !== null) flash({ tone: "danger", msg: <>{why || t.readFailed}</> }); });
};

// A turn begun on the Line, typed or spoken: the question on its thread (the conversation open, else a new one) and the
// turn's record, which the stream writes and the landing reads.
const arBeginTurn = ({ turnSeq, setActive, setLive }, q, chip, base, how) => {
  const userMsg = { id: "u-" + Date.now(), role: "user", text: q, atMs: Date.now(), citations: [], followups: [], proposals: [] };
  const thread = base ? { ...base, messages: [...base.messages, userMsg], scope: chip || base.scope || null } : { id: null, title: q, messages: [userMsg], scope: chip || null }; // asked with the chip's scope, else the thread's own, which it then holds (the Phase 5 plan, D9)
  setActive(thread);
  const turn = { mine: ++turnSeq.current, threadId: thread.id, qid: userMsg.id, ctl: new AbortController(), final: null, spoke: false, said: 0, spoken: !!how.spoken };
  setLive({ q, text: "", say: null, traces: [], turn, at: Date.now() }); // the turn in flight: Stop lets go of it (ctl), its thread is named on its question's conversation (qid)
  return { thread, turn };
};

// ---- what is under the line, and the keys that walk it ----

/** The conversation's turns, whether the rows show (and are drawn: not while a phone's field is in use), the rows, and the answer drawn with its moves and words. */
const arUnder = ({ A, t, lang, query, surface, scope, threads, view, active, talk, live, quick, composing, buildLineRows, flatRows, answerMoves, freshNext }) => {
  const turns = active ? A.turns(active.messages) : []; // its questions and their answers, in order (palette.ts)
  const latest = turns.length ? turns[turns.length - 1] : null;
  const folded = turns.slice(0, -1).filter((tn) => tn.q && tn.a); // the thread's earlier turns, each drawn in full
  const answerMsg = latest && latest.a ? latest.a : null;
  const showRows = arShowRows({ talk, view, query, active, quick, live, answerMsg });
  // A phone's field in use with rows under the three (the home, or the words' own): the middle composes (spec 5.9).
  const composingRows = composing && showRows;
  // The rows on screen: not while the field is in use (with the keyboard up there is no room for them, the words' own
  // rows and the jumps included, and Enter sends), so nothing is built or walked; nor for words typed that find no place
  // to jump to and no question that matches (buildLineRows draws them none), which the field holds and Enter asks.
  const rowsShown = showRows && !composing;
  const sections = rowsShown ? buildLineRows({ A, t, lang, query, surface, scope, threads, view }) : [];
  const rows = flatRows(sections);
  const rowsDrawn = rowsShown && (view === "earlier" || !query.trim() || rows.length > 0);
  const drawn = showRows || talk.listening || live || quick || !answerMsg ? null : freshNext(A, A.answer(answerMsg), active ? turns : []);
  const moves = drawn ? answerMoves(drawn.answer) : [];
  const [words, spoken] = drawn ? [A.answerCopy(drawn.answer), A.answerSpoken(drawn.answer)] : ["", ""];
  const th = arThreadOf({ view, active, quick, showRows, composing, talk, live, latest });
  return { latest, folded, answerMsg, showRows, composingRows: composingRows && !th.thread, rowsDrawn, sections, rows, drawn, moves, words, spoken, ...th };
};

/** Whether the rows show: Earlier, words typed outside a conversation (a conversation's draft keeps its thread, D1), or nothing to answer yet. */
const arShowRows = ({ talk, view, query, active, quick, live, answerMsg }) =>
  !talk.listening && (view === "earlier" || (!!query && !(active || quick)) || (!live && !quick && !answerMsg));

/** The thread (the spec 2026-09-27-ask-chat-on-a-phone, D1, D4): whether the middle is one, whether the three come forward over the field to listen, and the newest question. */
const arThreadOf = ({ view, active, quick, showRows, composing, talk, live, latest }) => {
  // A conversation or a quick answer, every turn in full, unless Earlier is open; a phone's field in use or a held mic
  // keeps it, dimmed, with the three come forward over the field.
  const thread = view === "rows" && (!!active || !!quick) && (!showRows || composing || talk.listening);
  const listen = thread && (composing || talk.listening) && !live && !(quick && quick.pending);
  const nowQ = live ? live.q : quick ? quick.q : latest && latest.q ? latest.q.text : "";
  return { thread, listen, nowQ };
};

/** A row or a move taken: a conversation opened, Earlier, a place gone to, words to finish, or a question asked. */
const arActivate = ({ openThread, setView, nav, setQuery, inputRef, submit }) => {
  const activate = (it) => {
    if (!it) return;
    if (it.type === "thread") { openThread(it.th); return; }
    if (it.type === "jump") { nav(it.to, { leave: true }); return; }
    if (it.type === "item" || it.type === "open") { nav(it.to); return; }
    if (it.compose) { setQuery(it.q); setTimeout(() => inputRef.current && inputRef.current.focus(), 20); return; }
    submit(it.q);
  };
  return activate;
};

/** A key the field keeps as a field's: Shift with Enter breaks a line, and the arrows move between its lines once it has several. */
const arFieldKey = (e, query) => (e.key === "Enter" && e.shiftKey) || ((e.key === "ArrowDown" || e.key === "ArrowUp") && query.includes("\n"));

/** The line's keys: Esc, the arrows over the rows or the answer's moves, Delete on a conversation, Enter; the field's own first (arFieldKey). */
const arOnKey = ({ hold, live, stop, onClose, showRows, rows, moves, sel, setSel, move, setMove, active, query, setQuery, askDelete, view, setView, activate, submit }) => {
  const onKey = (e) => {
    if (hold.onKeyDown(e) || arFieldKey(e, query)) return;
    if (e.key === "Escape") { e.preventDefault(); arEscape({ live, stop, view, setView, onClose }); return; }
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
  return onKey;
};

/** The field's end: the one button (the mic held to talk, Send, or Stop). */
const arLineEnd = (ln) => {
  const { t, phone, buzz, talk, held, speech, query, live, stop, submit, begin, end } = ln;
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
    begin(e);
  };
  const liftMic = () => {
    end();
    window.setTimeout(() => { held.current = false; }, AR_LIFT_MS);
  };
  const pressed = (act) => () => {
    if (held.current) { held.current = false; return; }
    if (act) act();
  };
  // One button at the field's end (S12): the mic with no words (hold to talk), Send once there are words, Stop while
  // a turn runs. One element in one place, keyed, so the finger a hold captured is still held as the words heard fill
  // the field; where the browser cannot listen there is no mic, only Send, faint until there are words.
  const hasWords = !!query.trim();
  // Stop while a turn runs; else the mic (a ring breathes out of it while Ask's voice reads, data-state, and a hold
  // stops the reading), or Send once there are words.
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
          "data-state": speech.speakingId ? "speaking" : undefined,
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
  // The foot keeps only the one button: an answer's acts are under it in the thread, and New is the head's.
  return { liftMic, right: oneButton };
};

// ---- What the Line draws: plain functions, not components, making its elements in the order AskReal always did ----

/** Under the band: the rows, the question while Ask reads, or the answer. */
const arBody = ({ rowsDrawn, sections, sel, setSel, activate, askDelete, t, view, threads, composingRows, live, lang, nav, submit, editWords, quick, move, answerMsg, latest, noteOutcome, thread, AskRows, AskTurn }) => {
  // The rows sit in a fold (ask.css `.ask-rows-fold`): composing keeps it closed while they are gone (`gone`), and
  // their return opens it again, one element throughout so the return is a motion.
  if (rowsDrawn)
    return (
      <div className="ask-rows-fold" data-testid="ask-rows-fold">
        <AskRows
          sections={sections}
          sel={sel}
          setSel={setSel}
          onActivate={activate}
          onDelete={askDelete}
          t={t}
          empty={view === "earlier" && !threads.length ? t.noEarlier : null}
        />
      </div>
    );
  if (composingRows) return <div className="ask-rows-fold gone" data-testid="ask-rows-fold" />;
  if (live && (live.say || live.text))
    return <AskTurn m={{ id: "live", role: "assistant", text: live.text, citations: [], followups: [], proposals: [] }} say={live.say} q={live.q} streaming t={t} lang={lang} onNav={nav} onFollow={submit} onEdit={editWords} />;
  if (live || (quick && quick.pending)) {
    // While Ask reads, only the question is under the band; what it reads is the band's one line (ask-reading).
    return (
      <div className="ask-trace" data-testid="ask-trace">
        <p className="ask-turn-q">{live ? live.q : quick.q}</p>
      </div>
    );
  }
  if (answerMsg)
    return (
      <AskTurn
        m={answerMsg}
        q={latest.q ? latest.q.text : ""}
        latest
        walk
        sel={move}
        next={!thread}
        t={t}
        lang={lang}
        onNav={nav}
        onFollow={submit}
        onOutcome={noteOutcome}
        onEdit={editWords}
        onRetry={answerMsg.failed && latest.q ? () => submit(latest.q.text) : undefined}
      />
    );
  return null;
};

/** The hero as it stands: shrunk with the question under it, at rest, and the standing pills. */
const arHeroState = ({ live, answerMsg, quick, latest, talk, showRows, view, query, A, lang, composing, composingRows, thread }) => {
  // Small once an answer is written, and while words are typed at home with the field not composing (a desk's, or a
  // phone's left with words once its keyboard went), so their rows stand under the three and not a screen below them.
  const typed = showRows && view === "rows" && !!query.trim() && !composing;
  const heroSmall = !!(live && (live.say || live.text)) || !!answerMsg || typed;
  // In the thread the three lead the newest answer (D3), its question the bubble over them, not a line under.
  const heroMode = arHeroModeOf({ thread, heroSmall, live, quick });
  const heroQ = !heroSmall || thread ? null : live ? live.q : latest && latest.q ? latest.q.text : null;
  const restful = !thread && (talk.listening || (showRows && view === "rows" && !query));
  // The standing pills (who needs you, the runs and searches waiting) are the hero's: under the three at rest, and
  // still there while a phone's field is in use, since they are what a person came to see (spec 5.9).
  const parts = A.rightNowParts ? A.rightNowParts(lang) : null;
  const standing = !!parts && !!(parts.people || parts.runs || parts.searches) && !talk.listening && (composingRows || restful);
  return { heroSmall, heroMode, heroQ, restful, parts, standing };
};

/** The three in the thread (D3, D11): large while Ask reads; at the answer's start, speaking, the moment its words arrive, in one move; still there once it is whole. */
const arHeroModeOf = ({ thread, heroSmall, live, quick }) => {
  if (!thread) return heroSmall ? " small" : "";
  const reading = (!!live && !(live.say || live.text)) || !!(quick && quick.pending);
  return reading ? " thinking" : live ? " sig speaking" : " sig";
};

// The hero (spec 5.2-5.5): the three at 232px (ask.css `.ask-hero-stage`), what they hear while held, the question and
// what Ask reads until the first words; once an answer is written they shrink to the top with its question under them,
// said once (ask.css hides the turn's own copy). In the thread they lead the newest answer under its question's bubble
// (`heroMode`, D3), with what Ask has read under them while it reads (AskReads, D12), and a held mic's words are the
// band's (AskListen).
// In Earlier the three step aside (`away`, drawn but not laid out, so they are not drawn afresh on the way back) and the
// conversations take the middle.
const arHero = ({ heroSmall, heroMode, thread, heroRef, faceRef, holdThree, AskFace, standing, parts, t, AskNowPills, AskReads, talk, query, live, quick, heroQ, view }) => (
    <div className={`ask-hero${heroMode}${view === "earlier" ? " away" : ""}`} ref={heroRef} data-testid="ask-hero">
      <span className="ask-hero-stage" ref={faceRef} {...holdThree} data-testid="ask-hero-stage">
        {AskFace ? <AskFace className="ask-hero-canvas" testId="ask-line-face" /> : null}
      </span>
      {standing ? <AskNowPills people={parts.people} runs={parts.runs} searches={parts.searches} t={t} /> : null}
      {talk.listening && !thread ? (
        <p className="ask-heard" aria-live="polite" data-testid="ask-heard">{query || t.listening}</p>
      ) : (live || (quick && quick.pending)) && !heroSmall ? (
        <>
          {thread ? null : <p className="ask-turn-q">{live ? live.q : quick.q}</p>}
          <AskReads traces={live ? live.traces : []} since={live ? live.at : null} t={t} />
        </>
      ) : heroQ ? (
        <p className="ask-turn-q">{heroQ}</p>
      ) : null}
    </div>
);

// While a phone listens its foot is the pill to let go of, over the band (still drawn, hidden, so the mic that holds
// the finger is there for the lift), with a way back to typing that keeps the words heard (spec 5.3).
const arFoot = ({ phone, talk, typing, t, liftMic }) =>
  phone && talk.listening ? (
    <div className="ask-letgo-wrap">
      <button type="button" className="btn btn-ghost" onClick={() => { typing.current = true; talk.stop(); }} data-testid="ask-type-instead">{t.typeInstead}</button>
      <button type="button" className="ask-letgo" aria-pressed="true" onPointerUp={liftMic} data-testid="ask-letgo"><Icon name="mic" size={18} />{t.letGo}</button>
    </div>
  ) : null;

// The band: the field at the foot (ask.css orders it last), the scope and the one button in it; the three and what Ask
// reads are the hero's. On a phone it is hidden under the pill to let go of while it listens.
const arStage = ({ H, talk, live, stageRef, scope, setScope, setActive, t, inputRef, active, surface, query, setQuery, composing, M, onKey, hold, slideFrom, heroRef, setComposing, rowsDrawn, rows, showRows, sel, move, right }) => {
  const activeId = showRows ? (rows.length ? `ask-row-${sel}` : undefined) : move >= 0 ? `ask-move-${move}` : undefined;
  return (
    <div className={`ask-stage${talk.listening ? " listening" : ""}${live ? " live" : ""}`} ref={stageRef} data-testid="ask-line">
      <div className="ask-stage-row">
        {scope ? (
          <span className="ask-scope" title={`${scope.kind}: ${scope.label}`} data-testid="ask-scope">
            <Icon name={arScopeIcon(scope)} size={10} />
            <span>{scope.label}</span>
            <button type="button" onClick={() => { setScope(null); setActive((a) => (a && a.scope ? { ...a, scope: null } : a)); }} aria-label={t.clearScope}><Icon name="x" size={9} /></button>{/* the open thread's scope too, so its next question goes with none (the Phase 5 plan, D9) */}
          </span>
        ) : null}
        <textarea
          ref={inputRef}
          rows={1}
          className="ask-line-input"
          placeholder={talk.listening ? t.listening : active ? t.follow : surface === "leads" ? t.describeLeads : surface === "campaigns" ? t.describeCampaigns : t.placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (composing && M) M.mood.hear(0.5); }}
          onKeyDown={onKey}
          onKeyUp={(e) => hold.onKeyUp(e)}
          onFocus={() => { if (!arPhone()) return; slideFrom.current = H.slideFrom(stageRef.current, heroRef.current); setComposing(true); }}
          onBlur={() => setComposing(false)}
          role="combobox"
          aria-expanded={rowsDrawn && rows.length > 0}
          aria-controls={rowsDrawn ? "ask-rows" : undefined}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-label={t.dialogName}
          data-testid="ask-input"
          maxLength={1000}
          enterKeyHint="send"
          autoCapitalize="sentences"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="ask-line-right">{right}</span>
      </div>
    </div>
  );
};

// The middle is one scroller (spec 5.1, 5.5): on the home, the hero and the rows; in a conversation, the thread (the
// spec 2026-09-27-ask-chat-on-a-phone, D1): every earlier turn in full, then the newest question, the three and its
// answer (`ask-now`, one element throughout, so the three are never drawn afresh), with Copy and Read aloud under it
// once it is whole (D14). At rest, while it listens at home and while a phone's field is in use there, what it holds
// stands centred (`rest`, `composing`; spec 5.2, 5.9); a thread dims under the three come forward (`dim`, D4).
const arMiddle = ({ thread, listen, restful, composingRows, bodyRef, body, hero, folded, nowQ, drawn, words, spoken, speech, flash, t, lang, nav, submit, noteOutcome, editWords, AskThread, AskQuestion, AskActs }) => (
  <div className={`ask-line-body${restful ? " rest" : ""}${composingRows ? " composing" : ""}${thread ? " thread" : ""}${listen ? " dim" : ""}`} ref={bodyRef}>
    {thread ? <AskThread turns={folded} t={t} lang={lang} onNav={nav} onFollow={submit} onOutcome={noteOutcome} onEdit={editWords} /> : null}
    <div className="ask-now">
      {thread && nowQ ? <AskQuestion text={nowQ} now /> : null}
      {hero}
      {body}
      {thread && drawn ? <AskActs words={words} spoken={spoken} speech={speech} flash={flash} t={t} /> : null}
    </div>
  </div>
);

// Over the field in a conversation: the three come forward to listen (D4), the newest answer's next questions
// (D6), and Latest once its question is out of sight, over them (D7).
const arOverField = ({ H, thread, listen, composing, talk, live, drawn, move, query, t, submit, below, bodyRef, AskFace, AskListen, AskNextRow, AskLatest }) => {
  const nextRow = thread && !composing && !talk.listening && !live && drawn && drawn.answer.do.next.length ? <AskNextRow answer={drawn.answer} sel={move} onFollow={submit} /> : null;
  // While an answer is on its way its next questions' room is held, so the thread does not jump up as they arrive.
  const held = thread && !composing && !talk.listening && live ? <div className="ask-next-row hold" aria-hidden="true" /> : null;
  return (
    <>
      {listen ? <AskListen AskFace={AskFace} heard={talk.listening ? query || t.listening : ""} /> : null}
      {nextRow || held}
      {thread && below && !listen ? <AskLatest t={t} overNext={!!nextRow} onPress={() => H.pinNow(bodyRef.current)} /> : null}
    </>
  );
};

/** The Line: the scrim, the dialog, what a screen reader hears, the head, the foot, the band, the question before a delete, what stands over the field, and the middle. */
const arLineView = (ln) => {
  const { H, onClose, tick, dialogRef, drawn, view, live, setView, t, active, quick, clearLine, foot, doomed, removeThread, setDoomed, toastNode, phone } = ln;
  // What a screen reader hears: the answer's headline (or a prose answer's words) once it is whole (spec 6.10).
  const said = drawn ? drawn.answer.say.headline || drawn.answer.say.detail : "";
  return (
    // It goes the way it came as it closes (data-bits leaving): a desk's panel back out to the right, a phone's screen
    // fading, where a thumb also pulls it down or takes it across to either side (touchSwipe). ask-overlay and ask-modal
    // carry the motion.
    <div className="ask-overlay ask-line-scrim" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} data-tick={tick} ref={window.leaving ? window.leaving("ask") : undefined}>
      <div
        ref={dialogRef}
        className="ask-modal ask-real ask-line"
        role={phone ? "dialog" : "complementary"}
        aria-modal={phone ? "true" : undefined}
        tabIndex={-1}
        aria-label={t.dialogName}
        data-testid="ask-real"
        {...(window.touchSwipe ? window.touchSwipe({ onDown: onClose, onBack: onClose, onAway: onClose, when: arPhone }) : {})}
        onKeyDown={phone ? undefined : (e) => H.panelKeys(e, () => arEscape(ln))}
      >
        <p className="ask-said" role="status" aria-live="polite" data-testid="ask-said">{said}</p>
        {/* The head: Earlier, New in a conversation or over a quick answer (a preset question is answered without
            one, and was left with no way home but ×; it ends the conversation as Clear did, D9), and a close within the
            thumb's reach; both wait while a turn runs (spec 5.1, 5.4). */}
        <div className="ask-line-head">
          <button type="button" className="btn btn-ghost" aria-pressed={view === "earlier"} disabled={!!live} onClick={() => setView((v) => (v === "earlier" ? "rows" : "earlier"))} data-testid="ask-earlier">
            <Icon name="chat" size={13} />
            {t.earlier}
          </button>
          {active || quick ? <button type="button" className="btn btn-ghost" disabled={!!live} onClick={clearLine} data-testid="ask-clear-head"><Icon name="plus" size={13} />{t.newChat}</button> : null}
          <button type="button" className="btn btn-ghost btn-icon ask-line-close" onClick={onClose} aria-label={t.close} title={t.close} data-testid="ask-close">
            <Icon name="x" size={14} />
          </button>
        </div>
        {foot}
        {arStage(ln)}
        {doomed ? (
          <Confirm question={t.deleteAsk} detail={doomed.title} yes={t.deleteYes} no={t.deleteKeep} danger block className="ask-confirm" onYes={() => removeThread(doomed)} onNo={() => setDoomed(null)} testid="ask-delete" />
        ) : null}
        {arOverField(ln)}
        {arMiddle(ln)}
      </div>
      {toastNode}
    </div>
  );
};

// ---- The Line -------------------------------------------------------------------------------------------------------
// `ln` is the Line as drawn so far: the props and parts, the state, the acts, then what each hook and builder above
// returns; every hook before the early return, the rest only while the Line is open. The acts call no hook, so they are
// made before the hooks that call them (a heard question, a kept or seeded thread, Esc), closed or open.
const AskReal = ({ open, onClose }) => {
  const A = window.__ask;
  const H = window.AskHooks;
  const { buildLineRows, AskRows, flatRows, AskNowPills } = window.AskHome;
  const { AskTurn, answerMoves, freshNext, AskThread, AskQuestion, AskNextRow, AskListen, AskLatest, AskReads, AskActs } = window.AskAnswerKit;
  // Ask's face: the one mood every face follows (legacy-bridge/mascot mood.ts), standing in the line.
  const M = window.__mascot || null;
  const AskFace = window.AskFace || null;
  const kit = { AskTurn, answerMoves, freshNext, AskThread, AskQuestion, AskNextRow, AskListen, AskLatest, AskReads, AskActs };
  const ln = { open, onClose, A, H, M, AskFace, buildLineRows, AskRows, flatRows, AskNowPills, ...kit, ...useArLine(A, H) };
  ln.t = window.askText(ln.lang);
  const route = arRoute();
  ln.route = route;
  // With the param: Leads is People's `leads` param, and the Line on it is the finder (spec F2, F3).
  ln.surface = A ? A.surfaceFor(route.page, route.param) : "other";
  Object.assign(ln, arActs(ln));
  ln.submit = arSubmitter(ln);
  Object.assign(ln, useArVoice(ln)); H.useAskWarm(ln); // and a question on its way warms the model's cache (ask-hooks.jsx)
  useArMood(ln);
  useArSlide(ln);
  useArOpen(ln);
  useArClose(ln);
  useArMemory(ln);
  useArFocus(ln);
  useArSeedKeys(ln);
  useArWalk(ln); H.useAskGrow(ln.inputRef, ln.query, open); // the field grows with its words, to six lines (ask-hooks.jsx)
  ln.below = H.useAskLatest(ln.bodyRef, open && ln.view === "rows" && !!(ln.active || ln.quick));

  if (!open || !A) return null;
  ln.phone = arPhone();
  Object.assign(ln, arUnder(ln));
  ln.activate = arActivate(ln);
  ln.onKey = arOnKey(ln);
  Object.assign(ln, arLineEnd(ln));
  ln.body = arBody(ln);
  Object.assign(ln, arHeroState(ln));
  ln.hero = arHero(ln);
  ln.foot = arFoot(ln);
  return arLineView(ln);
};

window.AskBar = AskReal; // the Line is what the frame draws; a demo's seeded palette (demo/pages/dashboard-a-ask.jsx) replaces it
