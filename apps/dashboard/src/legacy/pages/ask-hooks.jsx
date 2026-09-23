/* global React */
// The palette's hooks: hold to talk, the desktop/phone split, focus that
// returns to the input, and reading aloud. Each does one thing and knows
// nothing about the palette's state. Published as window.AskHooks.

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

// A desktop has room for the rail beside a conversation; a phone keeps the
// single-column sheet. A media query, not a device guess.
const useAskWide = () => {
  const mq = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(min-width: 721px)") : null);
  const [wide, setWide] = useAhState(() => { const m = mq(); return !!(m && m.matches); });
  useAhEffect(() => {
    const m = mq();
    if (!m) return;
    const on = () => setWide(m.matches);
    if (m.addEventListener) m.addEventListener("change", on); else m.addListener(on);
    return () => { if (m.removeEventListener) m.removeEventListener("change", on); else m.removeListener(on); };
  }, []);
  return wide;
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

window.AskHooks = { useAskTalk, useAskWide, useAskFocus, useAskSpeech };
