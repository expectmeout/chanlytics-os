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

// The disc and its dot: the phone's ✦ is the cards' surface with the three on it, and its state is said the way the
// app says every state, a dot on the disc's rim (styles/ask.css, `.ask-disc`; the spec
// docs/superpowers/specs/2026-09-25-the-ask-button-on-a-phone-design.md, B9). Nothing at rest. While Ask works
// (`data-work`, from the mood) the coral dot every live thing wears, breathing; from 80% of the usage an amber dot
// that stays, at 100% red (`data-usage`, the usage surface's standing: `window.__USAGE`, `{ standing }`, repainted on
// `surface:usage`; the usage spec). Until that surface ships there is none, and the dot is the mood's alone.
const standingOf = () => {
  const u = window.__USAGE;
  return u && (u.standing === "warned" || u.standing === "over") ? u.standing : "ok";
};
const AskDisc = ({ testId }) => {
  const [usage, setUsage] = useAfState(standingOf);
  const [work, setWork] = useAfState(() => {
    const M = window.__mascot;
    return M && M.mood.state !== "idle";
  });
  useAfEffect(() => {
    const again = () => setUsage(standingOf());
    window.addEventListener("surface:usage", again);
    const M = window.__mascot;
    const stop = M ? M.mood.subscribe((ev) => ev.t === "state" && setWork(ev.state !== "idle")) : null;
    return () => {
      window.removeEventListener("surface:usage", again);
      if (stop) stop();
    };
  }, []);
  return <span className="ask-disc" data-usage={usage} data-work={work ? "1" : "0"} aria-hidden="true" data-testid={testId} />;
};

Object.assign(window, { AskFace, AskDisc });
