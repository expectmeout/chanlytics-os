/* global React */
// Ask's hooks: hold to talk, a held Space that talks, a held press that
// talks, focus that returns to the line, and reading aloud. Each does one thing and knows nothing about
// the Line's state. Published as window.AskHooks.

const useAhState = React.useState;
const useAhEffect = React.useEffect;
const useAhRef = React.useRef;

const ahRecognizer = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;

// A browser told No once never asks again: it blocks in silence. Where the Permissions API says so (Chrome, Android),
// the press is told before the recogniser is started, so the toast can say where to allow it. Browsers without the
// API (Safari, Firefox) answer "not blocked" and prompt on their own.
const ahMicBlocked = async () => {
  try {
    if (!navigator.permissions || typeof navigator.permissions.query !== "function") return false;
    const status = await navigator.permissions.query({ name: "microphone" });
    return status.state === "denied";
  } catch {
    return false;
  }
};

// Hold to talk, as the live whisper does it: press starts the browser's own
// recogniser, release stops it, and what was heard is handed back on its own.
// Interim words are handed back as they come, so the input shows them.
// Nothing is recorded or uploaded. Where the browser can say whether the
// microphone is blocked, the press waits for that answer first, and a press
// released before it starts nothing (`wantRef`); elsewhere it starts at once.
// What the words are for is the Line on screen as listening began: the element that had focus then (the field, the
// mic). Closing Ask takes the Line off the page (AskReal draws nothing closed) and stopped only the reading aloud, so
// the recogniser went on and its end asked what it had heard in a Line that was gone (G:0). Words heard for a Line
// that is gone are dropped, and a word arriving after it stops the recogniser.
const ahLineGone = (el) => !!el && el.isConnected === false;
const useAskTalk = ({ lang, onWords, onHeard, disabled }) => {
  const [listening, setListening] = useAhState(false);
  const recRef = useAhRef(null);
  const heardRef = useAhRef("");
  const wantRef = useAhRef(false);
  const forRef = useAhRef(null);
  const canTalk = !!ahRecognizer();
  const begin = (SR) => {
    if (!wantRef.current || recRef.current) return;
    wantRef.current = false;
    const rec = new SR();
    rec.lang = lang === "es" ? "es-ES" : (navigator.language || "en-US");
    rec.interimResults = true;
    rec.continuous = true;
    heardRef.current = "";
    forRef.current = typeof document !== "undefined" ? document.activeElement || null : null;
    rec.onresult = (ev) => {
      if (ahLineGone(forRef.current)) { heardRef.current = ""; try { rec.stop(); } catch { /* already stopped */ } return; }
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
      if (heard && !ahLineGone(forRef.current)) onHeard(heard, null);
    };
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); recRef.current = null; }
  };
  const start = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const SR = ahRecognizer();
    if (!SR || listening || disabled) return;
    wantRef.current = true;
    const perms = typeof navigator !== "undefined" ? navigator.permissions : null;
    if (perms && typeof perms.query === "function") {
      ahMicBlocked().then((blocked) => {
        if (blocked) { wantRef.current = false; onHeard(null, "blocked"); }
        else begin(SR);
      });
    } else begin(SR);
  };
  const stop = () => {
    wantRef.current = false;
    const rec = recRef.current;
    if (rec) { try { rec.stop(); } catch { /* already stopped */ } }
  };
  return { canTalk, listening, start, stop };
};

// A Space held on an empty line talks (the Line, 6.6): held 300ms it starts
// listening, and letting go asks. A tap does nothing, because an empty line
// takes no leading space; once there are words, Space is a space. The key's
// repeats while held are swallowed. Two cells.
const AH_HOLD_MS = 300;
const useHoldSpace = ({ empty, talk }) => {
  const timer = useAhRef(null);
  const held = useAhRef(false);
  const onKeyDown = (e) => {
    if (e.key !== " ") return false;
    if (held.current || timer.current) { e.preventDefault(); return true; }
    if (!empty()) return false;
    e.preventDefault();
    timer.current = setTimeout(() => { timer.current = null; held.current = true; talk.start(); }, AH_HOLD_MS);
    return true;
  };
  const onKeyUp = (e) => {
    if (e.key !== " ") return false;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; return true; }
    if (held.current) { held.current = false; talk.stop(); return true; }
    return false;
  };
  return { onKeyDown, onKeyUp };
};

// A press held AH_HOLD_MS listens; a shorter one does nothing. Pointer events, so no keyboard opens and a touch's
// mouse twin is not a second press. The phone's three take it (spec S11); the mic keeps its own down/up. A press that
// travels AH_DRAG_PX before the beat is a drag -- the pull down that closes the takeover (S7) -- and never listens.
const AH_DRAG_PX = 10;
const useHoldPress = ({ talk, onHold }) => {
  const timer = useAhRef(null);
  const held = useAhRef(false);
  const from = useAhRef(null);
  const end = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (held.current) { held.current = false; talk.stop(); }
  };
  return {
    onPointerDown: (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (timer.current || held.current) return;
      // The press keeps its pointer, as a touch does anyway: a mouse's hold outlasts the three hiding under it as they
      // start to listen (a thread dims), which otherwise read as the pointer leaving and ended the hold at once.
      const el = e && e.currentTarget;
      if (el && el.setPointerCapture && e.pointerId != null) {
        try { el.setPointerCapture(e.pointerId); } catch { /* not a live pointer */ }
      }
      from.current = e && typeof e.clientX === "number" ? { x: e.clientX, y: e.clientY } : null;
      timer.current = setTimeout(() => { timer.current = null; held.current = true; if (onHold) onHold(); talk.start(); }, AH_HOLD_MS);
    },
    onPointerMove: (e) => {
      if (!timer.current || !from.current || !e || typeof e.clientX !== "number") return;
      if (Math.hypot(e.clientX - from.current.x, e.clientY - from.current.y) > AH_DRAG_PX) { clearTimeout(timer.current); timer.current = null; }
    },
    onPointerUp: end,
    onPointerLeave: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
    onContextMenu: (e) => { if (e && e.preventDefault) e.preventDefault(); },
  };
};

// The input is the way on: focus comes back to it whenever `when` is true
// and any of `deps` changes, so typing never lands on a chip just clicked.
const useAskFocus = (ref, when, deps) => {
  useAhEffect(() => {
    if (!when) return;
    const id = setTimeout(() => { if (ref.current) ref.current.focus(); }, 30);
    return () => clearTimeout(id);
  }, deps);
};

// Reading an answer aloud: one at a time, a toggle per answer, stopped when
// the palette closes. The browser's own synthesis; nothing leaves the device.
const useAskSpeech = (A) => {
  const [speakingId, setSpeakingId] = useAhState(null);
  const stop = () => { if (A) A.stopSpeaking(); setSpeakingId(null); };
  const toggle = (id, text, lang) => {
    if (!A) return false;
    if (speakingId === id) { stop(); return true; }
    const ok = A.speak(text, lang, () => setSpeakingId((cur) => (cur === id ? null : cur)));
    setSpeakingId(ok ? id : null);
    return ok;
  };
  return { canSpeak: !!(A && A.canSpeak()), speakingId, toggle, stop };
};

// A phone's thread (docs/superpowers/specs/2026-09-27-ask-chat-on-a-phone-design.md): the newest question stands at
// the top as a question is asked or a conversation opened (D5), and Latest is offered once it is out of sight below
// (D7). The arithmetic is pure, so it is proved without a layout; the thread is the question's offsetParent (ask.css).
const ahStill = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
/** The scroll that stands the newest question a breath under the thread's top edge; the first stands at the top. */
const ahPinTop = (qTop, gap = 14) => Math.max(0, qTop - gap);
/** Whether the newest question's first line is below what the thread shows: Latest is offered then. */
const ahLatestShown = ({ qTop, scrollTop, clientHeight }) => qTop > scrollTop + clientHeight - 24;
/** How long a glide may take before Latest looks again, where the browser says no `scrollend`. */
const AH_GLIDE_MS = 900;
/**
 * The thread is gliding to its newest question (`data-pinning`): Latest holds back meanwhile (useAskLatest), since the
 * question is on its way up, not out of sight; it flashed on every follow-up in a thread longer than the screen. The
 * glide's end (`scrollend`, or AH_GLIDE_MS where the browser has none) lets it look again.
 */
const ahGlide = (body) => {
  if (!body.dataset || !body.addEventListener) return;
  body.dataset.pinning = "1";
  let over = false;
  const done = () => {
    if (over) return;
    over = true;
    body.removeEventListener("scrollend", done);
    delete body.dataset.pinning;
    if (typeof Event === "function" && body.dispatchEvent) body.dispatchEvent(new Event("scroll"));
  };
  body.addEventListener("scrollend", done);
  setTimeout(done, AH_GLIDE_MS);
};
/** Stand the newest question at the top of the thread `body`, gliding unless motion is reduced. */
const ahPinNow = (body) => {
  const q = body && body.querySelector ? body.querySelector("#ask-now-q") : null;
  if (!q) return;
  const top = ahPinTop(q.offsetTop);
  if (typeof body.scrollTo !== "function") {
    body.scrollTop = top;
    return;
  }
  const still = ahStill();
  if (!still) ahGlide(body);
  body.scrollTo({ top, behavior: still ? "auto" : "smooth" });
};
/** D5: each time `key` changes (another question, another conversation), the newest question stands at the top. */
const useAskPin = (bodyRef, key, on) => {
  useAhEffect(() => {
    if (on) ahPinNow(bodyRef.current);
  }, [bodyRef, key, on]);
};
/** D7: whether the newest question is out of sight below, read again as the thread scrolls, once a frame. */
const useAskLatest = (bodyRef, on) => {
  const [shown, setShown] = useAhState(false);
  useAhEffect(() => {
    const body = bodyRef.current;
    if (!on || !body || !body.addEventListener) {
      setShown(false);
      return undefined;
    }
    let frame = 0;
    const look = () => {
      frame = 0;
      const q = body.querySelector("#ask-now-q");
      const gliding = !!(body.dataset && body.dataset.pinning);
      setShown(!gliding && !!q && ahLatestShown({ qTop: q.offsetTop, scrollTop: body.scrollTop, clientHeight: body.clientHeight }));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(look);
    };
    body.addEventListener("scroll", onScroll, { passive: true });
    look();
    return () => {
      body.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [bodyRef, on, setShown]);
  return shown;
};

// A phone's field focused: the field and the three slide to where the screen made room for the keys (moved here
// unchanged from ask-real.jsx, which the Line's hooks call as `slide` and `slideFrom`).
// The keyboard's own beat on iOS: what it takes to rise, and what the field and the three take to reach their places.
const AH_KEYS_MS = 250;
const ahRect = (el) => (el && typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : null);
/** Where the field and the hero stand as the field is focused, to slide them from there once the screen has made room. */
const ahSlideFrom = (stage, hero) => (ahStill() ? null : { stage: ahRect(stage), hero: ahRect(hero) });
// A phone's field just focused: the screen has made room for the keys at once (data-bits watchKeyboard's kb-expected;
// ask.css), so the browser finds the field above them and moves nothing. What the eye sees is the field and the three
// sliding to their places over the keyboard's own beat: a still copy of the field that React never holds goes from
// where the field stood to where it is, over the field itself, held clear meanwhile (the kit's way, as `leaving`), and
// the hero is drawn from where it stood and let go (translate, never transform: the kit's rule). Under reduced motion
// they are simply there (ahSlideFrom gives nothing).
const ahSlide = (from, stage, hero) => {
  if (!from) return;
  const modal = stage && stage.parentElement;
  const now = ahRect(stage);
  const box = ahRect(modal);
  if (from.stage && now && box) {
    const dy = now.top - from.stage.top;
    if (Math.abs(dy) > 1) {
      const ghost = stage.cloneNode(true);
      ghost.setAttribute("aria-hidden", "true");
      ghost.removeAttribute("data-testid");
      ghost.querySelectorAll("[id], [data-testid]").forEach((el) => {
        el.removeAttribute("id");
        el.removeAttribute("data-testid");
      });
      Object.assign(ghost.style, {
        position: "absolute",
        left: `${from.stage.left - box.left}px`,
        top: `${from.stage.top - box.top}px`,
        width: `${from.stage.width}px`,
        margin: "0",
        pointerEvents: "none",
        transition: `translate ${AH_KEYS_MS}ms var(--ease-out)`,
      });
      modal.appendChild(ghost);
      stage.style.opacity = "0";
      requestAnimationFrame(() => {
        ghost.style.translate = `0 ${dy}px`;
      });
      setTimeout(() => {
        ghost.remove();
        stage.style.opacity = "";
      }, AH_KEYS_MS + 30);
    }
  }
  const heroNow = ahRect(hero);
  if (from.hero && heroNow) {
    const dh = from.hero.top - heroNow.top;
    if (Math.abs(dh) > 1) {
      hero.style.transition = "none";
      hero.style.translate = `0 ${dh}px`;
      void hero.offsetHeight;
      hero.style.transition = `translate ${AH_KEYS_MS}ms var(--ease-out)`;
      hero.style.translate = "0 0";
      setTimeout(() => {
        hero.style.transition = "";
        hero.style.translate = "";
      }, AH_KEYS_MS + 30);
    }
  }
};

window.AskHooks = {
  useAskTalk, useHoldSpace, useHoldPress, useAskFocus, useAskSpeech, useAskPin, useAskLatest,
  pinNow: ahPinNow, pinTop: ahPinTop, latestShown: ahLatestShown, slide: ahSlide, slideFrom: ahSlideFrom,
};
