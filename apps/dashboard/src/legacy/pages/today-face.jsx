/* global React, Icon */
// The three, above the queue: the mark's squares as the face of the app, asking through the Ask that exists.
// The character, its canvas driver and the turn reducer live in the bridge (window.__mascot, mascot/index.ts);
// this file draws the band and wires the palette's hooks (window.AskHooks) and its client (window.__ask) to
// them. Every word here is the palette's (window.askText) or the stream's. With no client (the mockup, the
// harness) the field seeds the palette through askAbout and the band rests.
//
// At rest it is the mark, small, at the top of the queue's column: nothing else, no field, no box. A click
// (or Enter on it) wakes it: the stage grows, the field slides in under it and takes focus. A press held on it
// listens straight away. Escape, a click outside, or Clear folds it back; a question in flight goes on behind
// the small mark, and opening it again shows where it got to.
// Spec: docs/superpowers/specs/2026-09-23-the-three-on-today-design.md (4.6).
const useTfState = React.useState;
const useTfReducer = React.useReducer;
const useTfRef = React.useRef;
const useTfEffect = React.useEffect;
const useTfLayout = React.useLayoutEffect;

// One square, in CSS px: open, the squares are sized for a 200px band on a 232px stage; at rest, the mark.
const TF_SIDE = 200 / 3.8;
const TF_SIDE_SMALL = 18;
// A press held this long is a hold, which listens; a shorter one is a click, which opens.
const TF_HOLD_MS = 320;
// What the character does in each phase of a turn. Read aloud counts as answering (below).
const TF_STATE = {
  rest: "idle",
  listening: "listening",
  reading: "thinking",
  answering: "speaking",
  settled: "idle",
  failed: "idle",
};
const tfNav = (to) => window.appNavigate && window.appNavigate(to);
const tfNoTurn = {
  phase: "rest",
  question: "",
  heard: "",
  trace: null,
  text: "",
  message: null,
  links: [],
  threadId: null,
  language: "en",
  seq: 0,
  before: "rest",
};
const tfReduce = (turn, ev) => (window.__mascot ? window.__mascot.turn.reduce(turn, ev) : turn);
const tfInitial = () => (window.__mascot ? window.__mascot.turn.initial() : tfNoTurn);

const TodayFace = () => {
  const A = window.__ask || null;
  const M = window.__mascot || null;
  const H = window.AskHooks;
  const [turn, dispatch] = useTfReducer(tfReduce, tfInitial());
  const [open, setOpen] = useTfState(false);
  const [query, setQuery] = useTfState("");
  const [toastNode, flash] = window.usePPToast();
  const speech = H.useAskSpeech(A);
  const rootRef = useTfRef(null);
  const canvasRef = useTfRef(null);
  const inputRef = useTfRef(null);
  const mounted = useTfRef(null);
  const turnRef = useTfRef(turn);
  const phaseRef = useTfRef("rest");
  const heardLen = useTfRef(0);
  const alive = useTfRef(true);
  const wantFocus = useTfRef(false);
  const press = useTfRef({ timer: 0, held: false });
  turnRef.current = turn;
  const t = window.askText(turn.language);
  const busy = turn.phase === "reading" || turn.phase === "answering";

  // The character on its canvas, for the band's life. On the tests' stub React the ref is never attached (an
  // effect runs before any ref is), so the driver is tested on its own.
  useTfEffect(() => {
    alive.current = true;
    const canvas = canvasRef.current;
    if (M && canvas) mounted.current = M.mount(canvas, { side: TF_SIDE_SMALL });
    return () => {
      alive.current = false;
      if (mounted.current) mounted.current.destroy();
      mounted.current = null;
    };
  }, [M]);

  // Open, the squares grow with the stage; closed, back to the mark.
  useTfEffect(() => {
    if (mounted.current) mounted.current.setSide(open ? TF_SIDE : TF_SIDE_SMALL);
  }, [open]);

  // The field takes focus as the band opens on a click, inside the click's own task, so a phone shows its
  // keyboard. A hold opens it to listen, and leaves the focus alone.
  useTfLayout(() => {
    if (open && wantFocus.current && inputRef.current) inputRef.current.focus();
    wantFocus.current = false;
  }, [open]);

  // While open: Escape folds it (unless the palette is open over the page, whose Escape it is), and so does a
  // press anywhere outside the band. A question in flight carries on behind the mark.
  useTfEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector?.(".ask-overlay")) setOpen(false);
    };
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // The phase drives the character: read aloud counts as answering; a quick answer nods (a streamed one nods on
  // its own as the row settles); a failure shakes.
  useTfEffect(() => {
    const m = mounted.current;
    const was = phaseRef.current;
    phaseRef.current = turn.phase;
    if (!m) return;
    m.set(speech.speakingId === "face" ? "speaking" : TF_STATE[turn.phase]);
    if (turn.phase === "settled" && was !== "answering") m.react("nod");
    if (turn.phase === "failed") m.react("shake");
  }, [turn.phase, turn.seq, speech.speakingId]);

  const ask = async (raw) => {
    const q = String(raw || "").trim();
    const cur = turnRef.current;
    if (!q || cur.phase === "reading" || cur.phase === "answering") return;
    if (!A) {
      if (window.askAbout) window.askAbout({ prompt: q });
      return;
    }
    const language = A.language(q);
    const seq = cur.seq + 1;
    dispatch({ t: "asked", text: q, language, seq });
    // The palette's quick answers first (contracts fastPath): no model, no thread.
    const fp = A.fast(q);
    if (fp) {
      if (fp.kind !== "openings") {
        dispatch({ t: "fast", text: fp.answer, links: fp.links || [], seq });
        return;
      }
      const words = window.askText(language);
      let text = words.unavailable;
      let links = [{ label: words.openings, to: "admin/integrations" }];
      try {
        const o = await A.openings(fp.day, fp.service);
        text = o.state === "no_calendar" ? words.noCalendar : o.state === "unavailable" ? words.unavailable : o.text;
        if (o.state === "ok") links = [];
      } catch {
        /* the calendar could not be read: said so above */
      }
      if (alive.current) dispatch({ t: "fast", text, links, seq });
      return;
    }
    let ended = false;
    try {
      await A.send({ text: q, threadId: cur.threadId, scope: null, surface: "today" }, (ev) => {
        if (!alive.current) return;
        if (ev.t === "thread") dispatch({ t: "thread", id: ev.id, seq });
        else if (ev.t === "trace") dispatch({ t: "trace", text: ev.text, seq });
        else if (ev.t === "delta") {
          dispatch({ t: "delta", text: ev.text, seq });
          if (mounted.current) mounted.current.beat(Math.min(1, ev.text.length / 6));
        } else if (ev.t === "final") {
          ended = true;
          dispatch({ t: "final", message: ev.message, seq });
        } else if (ev.t === "error") {
          ended = true;
          dispatch({ t: "error", text: ev.text, seq });
        }
      });
    } catch {
      /* a broken stream ends as a cut-off, below */
    }
    if (!ended && alive.current) dispatch({ t: "cut-off", text: window.askText(language).cutOff, seq });
  };

  // The hook says nothing when a press ends with no words, so the turn follows its `listening` flag: pressed as it
  // turns on, released as it turns off (a release after the words were asked changes nothing).
  const talk = H.useAskTalk({
    lang: turn.language,
    disabled: busy,
    onWords: (words) => {
      dispatch({ t: "heard", words });
      if (words.length > heardLen.current && mounted.current) mounted.current.hear(0.8);
      heardLen.current = words.length;
    },
    onHeard: (heard, error) => {
      heardLen.current = 0;
      if (heard) {
        ask(heard);
        return;
      }
      if (error === "blocked") flash({ msg: <>{t.micBlocked}</> });
      else if (error === "not-allowed") flash({ msg: <>{t.micDenied}</> });
      else if (error && error !== "aborted" && error !== "no-speech") flash({ msg: <>{t.micFailed}</> });
    },
  });
  useTfEffect(() => {
    dispatch({ t: talk.listening ? "pressed" : "released" });
  }, [talk.listening]);

  // The stage: a click opens (or brings the field back into focus); a press held on it listens, opening the
  // band to show it. The pointer sequence handles both; `onClick` takes only the keyboard's press (detail 0).
  const wake = () => {
    wantFocus.current = true;
    if (!open) setOpen(true);
    else if (inputRef.current) inputRef.current.focus();
  };
  const onStageDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    press.current.held = false;
    clearTimeout(press.current.timer);
    press.current.timer = setTimeout(() => {
      press.current.held = true;
      if (!talk.canTalk) {
        flash({ msg: <>{t.noVoice}</> });
        return;
      }
      wantFocus.current = false;
      if (!open) setOpen(true);
      talk.start();
    }, TF_HOLD_MS);
  };
  const onStageUp = () => {
    clearTimeout(press.current.timer);
    if (press.current.held) {
      press.current.held = false;
      talk.stop();
      return;
    }
    wake();
  };
  const onStageCancel = () => {
    clearTimeout(press.current.timer);
    if (press.current.held) {
      press.current.held = false;
      talk.stop();
    }
  };
  const onStageClick = (e) => {
    if (e.detail === 0) wake();
  };

  const submit = (e) => {
    e.preventDefault();
    const q = query;
    setQuery("");
    ask(q);
  };
  // Enter on the field, as the palette takes it (ask-real.jsx onKey): not left to the form's implicit submission,
  // which a key event without its character never triggers.
  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) submit(e);
  };
  const clear = () => {
    dispatch({ t: "cleared" });
    setOpen(false);
  };
  const shape =
    turn.message && A && !turn.message.failed ? A.shape(turn.message, turn.language) : { open: null, followups: [] };
  const done = turn.phase === "settled" || turn.phase === "failed";
  // An answer that proposes something is reviewed where the cards are: the palette, on the same thread.
  const handsOff = turn.phase === "settled" && !!turn.message && turn.message.proposals.length > 0;
  const talkProps = talk.canTalk
    ? {
        onPointerDown: talk.start,
        onPointerUp: talk.stop,
        onPointerLeave: talk.stop,
        onPointerCancel: talk.stop,
        onContextMenu: (e) => e.preventDefault(),
      }
    : { onClick: () => flash({ msg: <>{t.noVoice}</> }) };

  return (
    <section
      ref={rootRef}
      className="today-face"
      data-testid="today-face"
      data-phase={turn.phase}
      data-open={open ? "true" : "false"}
    >
      <button
        type="button"
        className={`tf-stage${talk.listening ? " listening" : ""}`}
        aria-label={t.todayPlaceholder}
        aria-expanded={open}
        title={talk.canTalk ? t.talk : t.todayPlaceholder}
        data-testid="today-face-stage"
        onPointerDown={onStageDown}
        onPointerUp={onStageUp}
        onPointerLeave={onStageCancel}
        onPointerCancel={onStageCancel}
        onClick={onStageClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
      </button>
      {open ? (
        <div className="tf-exchange" data-testid="today-face-exchange" aria-live="polite">
          {turn.question ? <p className="tf-question">{turn.question}</p> : null}
          {turn.text ? (
            <p className={`tf-answer${turn.phase === "failed" ? " failed" : ""}`}>
              {turn.text}
              {turn.phase === "answering" ? <span className="ask-cursor" /> : null}
            </p>
          ) : null}
          {turn.phase === "listening" ? <p className="tf-caption">{turn.heard || t.listening}</p> : null}
          {turn.phase === "reading" ? <p className="tf-caption">{turn.trace || t.thinking}</p> : null}
          {turn.phase === "settled" && shape.followups.length ? (
            <div className="ask-follow">
              <span className="ask-follow-label">{t.next}</span>
              {shape.followups.map((f) => (
                <button key={f} type="button" className="ask-follow-chip" onClick={() => ask(f)}>
                  {f}
                </button>
              ))}
            </div>
          ) : null}
          {done ? (
            <div className="tf-doors">
              {turn.phase === "failed" ? (
                <button
                  type="button"
                  className="ask-action-chip"
                  onClick={() => ask(turn.question)}
                  data-testid="today-face-retry"
                >
                  <Icon name="refresh" size={11} /> {t.tryAgain}
                </button>
              ) : null}
              {shape.open ? (
                <button type="button" className="ask-link-chip" onClick={() => tfNav(shape.open.to)}>
                  {shape.open.label} <Icon name="arrow-right" size={10} />
                </button>
              ) : null}
              {turn.links.map((l) => (
                <button key={l.to} type="button" className="ask-link-chip" onClick={() => tfNav(l.to)}>
                  {l.label} <Icon name="arrow-right" size={10} />
                </button>
              ))}
              {turn.threadId ? (
                <button
                  type="button"
                  className="ask-link-chip"
                  onClick={() => window.askAbout && window.askAbout({ thread: turn.threadId })}
                  data-testid="today-face-continue"
                >
                  {handsOff ? t.reviewInAsk : t.continueInAsk}
                </button>
              ) : null}
              {turn.phase === "settled" && turn.text && speech.canSpeak ? (
                <button
                  type="button"
                  className={`ask-tool${speech.speakingId === "face" ? " on" : ""}`}
                  onClick={() => speech.toggle("face", turn.text, turn.language)}
                  title={speech.speakingId === "face" ? t.stop : t.read}
                  aria-label={speech.speakingId === "face" ? t.stop : t.read}
                >
                  <Icon name={speech.speakingId === "face" ? "pause" : "headphones"} size={12} />
                </button>
              ) : null}
              <button type="button" className="ask-link-chip" onClick={clear} data-testid="today-face-clear">
                {t.clear}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {open ? (
        <form className="tf-field" onSubmit={submit} data-testid="today-face-form">
          <input
            ref={inputRef}
            className="tf-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder={busy ? t.thinking : turn.threadId ? t.follow : t.todayPlaceholder}
            disabled={busy}
            maxLength={1000}
            aria-label={t.todayPlaceholder}
            data-testid="today-face-input"
          />
          <button
            type="button"
            className={`ask-talk${talk.listening ? " on" : ""}${talk.canTalk ? "" : " off"}`}
            aria-pressed={talk.listening}
            aria-label={talk.canTalk ? t.talk : t.noVoice}
            title={talk.canTalk ? t.talk : t.noVoice}
            disabled={busy}
            data-testid="today-face-talk"
            {...talkProps}
          >
            <Icon name="wave" size={14} />
          </button>
        </form>
      ) : null}
      {toastNode}
    </section>
  );
};

Object.assign(window, { TodayFace });
