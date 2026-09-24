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
// Four cells: a page drawn without these hooks mirrors them (clients-a.jsx usePlNoTalk).
const useAskTalk = ({ lang, onWords, onHeard, disabled }) => {
  const [listening, setListening] = useAhState(false);
  const recRef = useAhRef(null);
  const heardRef = useAhRef("");
  const wantRef = useAhRef(false);
  const canTalk = !!ahRecognizer();
  const begin = (SR) => {
    if (!wantRef.current || recRef.current) return;
    wantRef.current = false;
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

window.AskHooks = { useAskTalk, useHoldSpace, useHoldPress, useAskFocus, useAskSpeech };
