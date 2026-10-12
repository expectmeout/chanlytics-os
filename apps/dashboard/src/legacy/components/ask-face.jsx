/* global React */
// The three, following Ask's mood (legacy-bridge/mascot mood.ts, window.__mascot.mood). The top bar's Ask button, the
// Line and the phone's ✦ draw it; whoever runs a turn says the mood, so there is one AI with one face wherever it is.
// The squares are the largest that keep everything the three do inside the canvas (fitSide).
// `tone="accent"` draws them on a coral ground in that ground's own foreground (colour.ts `Tone`); `ground="raised"`
// draws them on the cards' surface (--bg-raised), so the fades down the stack are toward the surface they sit on, not
// the page behind it (the phone's ✦). With no bridge (a test, a harness without its bundle) it is an empty canvas.
const useAfRef = React.useRef;
const useAfEffect = React.useEffect;

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

// The disc: the phone's ✦ is the cards' surface with the three on it (styles/ask.css, `.ask-disc`; the spec
// docs/superpowers/specs/2026-09-25-the-ask-button-on-a-phone-design.md, B9). Its dot on the rim (nothing under 80% of the
// usage, amber from 80%, red at 100%) has no source today, so nothing is read here and the dot is never drawn: the usage
// surface the spec names does not exist, the one number the app holds, the day's model tokens the receptionist stops at
// (limits.max_llm_tokens_day), is read on the edge alone, and no route a member of every role may ask answers it. A standing
// nothing sets (`window.__USAGE` was set by the standalone mockup's stub and by no part of the app, and `surface:usage` was
// sent by none) is not a fact the database supports. When a member-readable read of the day's budget lands, it feeds
// `data-usage` (ok | warned | over) on this span through the seam; the dot's rules in ask.css wait for it. What needs you is
// the three's own colour (legacy-bridge/arrival.ts).
const AskDisc = ({ testId }) => <span className="ask-disc" aria-hidden="true" data-testid={testId} />;

Object.assign(window, { AskFace, AskDisc });
