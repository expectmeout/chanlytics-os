/* global React */
// The three, following Ask's mood (legacy-bridge/mascot mood.ts, window.__mascot.mood). The top bar's Ask button, the
// Line and the phone's ✦ draw it; whoever runs a turn says the mood, so there is one AI with one face wherever it is.
// The squares are the largest that keep everything the three do inside the canvas (fitSide).
// `tone="accent"` draws them on a coral button (the phone's ✦) in the button's own foreground (colour.ts `Tone`). With
// no bridge (a test, a harness without its bundle) it is an empty canvas.
const useAfRef = React.useRef;
const useAfEffect = React.useEffect;

const AskFace = ({ className, tone = "page", testId }) => {
  const ref = useAfRef(null);
  useAfEffect(() => {
    const M = window.__mascot;
    const canvas = ref.current;
    if (!M || !canvas) return undefined;
    const m = M.mount(canvas, { tone });
    if (!m) return undefined;
    const stop = M.follow(m, M.mood);
    return () => {
      stop();
      m.destroy();
    };
  }, []);
  return <canvas ref={ref} className={className} aria-hidden="true" data-testid={testId} />;
};

window.AskFace = AskFace;
