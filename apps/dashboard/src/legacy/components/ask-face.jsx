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

// The beam: the phone's ✦ is the cards' surface with a short arc travelling its rim (styles/ask.css, `.ask-beam`; spec
// docs/superpowers/specs/2026-09-25-the-ask-button-on-a-phone-design.md). At rest the arc is the ink, faint and slow.
// While Ask works (`data-work`, from the mood) it brightens and quickens in the usage's colour (`data-usage`): the
// AI's own blue, violet and gold under 80%, amber from 80%, red at 100%. The usage is the usage surface's standing
// (`window.__USAGE`, `{ standing }`, repainted on `surface:usage`; the usage spec); until that surface ships there is
// none, and the beam stays in the AI's colours.
const standingOf = () => {
  const u = window.__USAGE;
  return u && (u.standing === "warned" || u.standing === "over") ? u.standing : "ok";
};
const AskBeam = ({ testId }) => {
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
  return <span className="ask-beam" data-usage={usage} data-work={work ? "1" : "0"} aria-hidden="true" data-testid={testId} />;
};

Object.assign(window, { AskFace, AskBeam });
