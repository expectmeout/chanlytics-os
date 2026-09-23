/* global React */
// The three, following Ask's mood (legacy-bridge/mascot mood.ts, window.__mascot.mood). The top bar's Ask button and
// the palette's stage draw it; whoever runs a turn says the mood, so there is one AI with one face wherever it is.
// Without `grow` the canvas's height holds the whole leap (UNITS squares), which is the button's icon. With it the
// squares start at the button's size and grow to fill the stage they stand on (the driver eases a new size). With
// no bridge (a test, a harness without its bundle) it is an empty canvas.
const useAfRef = React.useRef;
const useAfEffect = React.useEffect;

// One square at the button's size, in CSS px: where a stage's squares grow from.
const AF_BUTTON_SIDE = 6;

const AskFace = ({ className, grow = false, testId }) => {
  const ref = useAfRef(null);
  useAfEffect(() => {
    const M = window.__mascot;
    const canvas = ref.current;
    if (!M || !canvas) return undefined;
    const m = M.mount(canvas, grow ? { side: AF_BUTTON_SIDE } : {});
    if (!m) return undefined;
    if (grow) m.setSide((canvas.clientHeight || 80) / M.UNITS);
    const stop = M.follow(m, M.mood);
    return () => {
      stop();
      m.destroy();
    };
  }, []);
  return <canvas ref={ref} className={className} aria-hidden="true" data-testid={testId} />;
};

window.AskFace = AskFace;
