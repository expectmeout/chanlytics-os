/* global React */
// The three, following Ask's mood (legacy-bridge/mascot mood.ts, window.__mascot.mood). The top bar's Ask button, the
// Line and the phone's ✦ draw it; whoever runs a turn says the mood, so there is one AI with one face wherever it is.
// The squares are the largest that keep everything the three do inside the canvas (fitSide).
// `tone="accent"` draws them on a coral ground in that ground's own foreground (colour.ts `Tone`); `ground="raised"`
// draws them on the cards' surface (--bg-raised), so the fades down the stack are toward the surface they sit on, not
// the page behind it (the phone's ✦). With no bridge (a test, a harness without its bundle) it is an empty canvas.
const useAfRef = React.useRef;
const useAfEffect = React.useEffect;
const useAfState = React.useState;

/** The page's tokens as the driver reads them, with the ground the three sit on in place of the page. */
const groundTokens = (ground) => () => {
  const cs = window.getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim() || null;
  return { bg: v(ground === "raised" ? "--bg-raised" : "--bg"), ink: v("--ink"), accent: v("--accent"), accentFg: v("--accent-fg") };
};

// `side` sets one tile in CSS px instead of fitting the whole of what the three do into the canvas (driver.ts
// MountOptions.side): the phone's ✦ draws them larger than the fit would, its ring just reaching the rim.
const AskFace = ({ className, tone = "page", ground = "page", side, testId }) => {
  const ref = useAfRef(null);
  useAfEffect(() => {
    const M = window.__mascot;
    const canvas = ref.current;
    if (!M || !canvas) return undefined;
    const opts = { tone };
    if (side) opts.side = side;
    if (ground === "raised") opts.env = { tokens: groundTokens(ground) };
    const m = M.mount(canvas, opts);
    if (!m) return undefined;
    const stop = M.follow(m, M.mood);
    return () => {
      stop();
      m.destroy();
    };
  }, []);
  return <canvas ref={ref} className={className} aria-hidden="true" data-testid={testId} />;
};

// The disc and its dot: the phone's ✦ is the cards' surface with the three on it, and its dot says what needs you, the
// way this app says every state (styles/ask.css, `.ask-disc`; the spec
// docs/superpowers/specs/2026-09-25-the-ask-button-on-a-phone-design.md, B9). Nothing while nothing does. Something
// waiting on you (Ask's own standing: people waiting, runs and searches waiting; ask/palette.ts rightNowParts;
// `data-needs`) is the amber dot "needs you" wears everywhere here; the usage from 80% amber too, at 100% red
// (`data-usage`, the usage surface's standing: `window.__USAGE`, `{ standing }`; the usage spec, a surface that does
// not exist yet). Read again as the surfaces it is built from land.
const standingOf = () => {
  const u = window.__USAGE;
  return u && (u.standing === "warned" || u.standing === "over") ? u.standing : "ok";
};
const needsOf = () => {
  const A = window.__ask;
  if (!A || typeof A.rightNowParts !== "function") return false;
  const p = A.rightNowParts();
  return !!(p.people || p.runs || p.searches);
};
const DISC_EVENTS = ["surface:usage", "surface:today", "surface:inbox", "surface:leads", "inbox:counts"];
const AskDisc = ({ testId }) => {
  const [usage, setUsage] = useAfState(standingOf);
  const [needs, setNeeds] = useAfState(needsOf);
  useAfEffect(() => {
    const again = () => {
      setUsage(standingOf());
      setNeeds(needsOf());
    };
    for (const ev of DISC_EVENTS) window.addEventListener(ev, again);
    return () => {
      for (const ev of DISC_EVENTS) window.removeEventListener(ev, again);
    };
  }, []);
  return <span className="ask-disc" data-usage={usage} data-needs={needs ? "1" : "0"} aria-hidden="true" data-testid={testId} />;
};

Object.assign(window, { AskFace, AskDisc });
