/**
 * A made video's words, made again (the content redesign's stage 2): More › Change it on a video Ask made opens its opening
 * lines, its end card's line and its language, as the plan it was drawn by holds them (GET files/[id] `video`). Make it again
 * asks for a new video from the same moments of the same clips (POST files/video), as the card's Make it did; the one it came
 * from stays, as a post's new version leaves the post. Its one coral press stands in the foot, which holds still under what
 * scrolls; the sheet's × (a phone) or the desk pane's lets it go. Pressed twice, it is one video: the key is the draft's,
 * taken as it opens.
 */
import { useState } from "react";
import { CONTENT_SHEET_WORDS, CONTENT_WORDS, PIECE_LIMITS, type PiecePlan } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { PostSay } from "../../files/post-edit";
import { fileVerbs } from "../../files/verbs";
import { cmFootAsk } from "../parts/split";

const AGAIN_SAYS = CONTENT_WORDS.again;
/** The draft's words: the opening lines, the end card, and what Make it again asks first. */
const AGAIN_SHEET = CONTENT_SHEET_WORDS.again;
/** Where each opening line stands, first to last: a video opens on as many as it may. */
const LINES_AT = Array.from({ length: PIECE_LIMITS.lines }, (_, at) => at);

/** The words a video says, as one key: what Make it again waits to see changed. */
const wordsKeyOf = (plan: PiecePlan) =>
  JSON.stringify([plan.lines.map((l) => l.trim()), plan.end_line?.trim() ?? "", plan.language]);

/** The lines a plan says, as many boxes as a video may open on: the ones it has, and empty ones after them. */
const lineBoxesOf = (plan: PiecePlan) => LINES_AT.map((at) => plan.lines[at] ?? "");

/** The plan as it is asked for: lines with words in them, an end card's line or none. */
const tidied = (plan: PiecePlan): PiecePlan => ({
  ...plan,
  lines: plan.lines.map((l) => l.trim()).filter((l) => l !== ""),
  end_line: plan.end_line?.trim() || null,
});

/** The draft of a video made again. `onMade` hands over the words that say it is on its way. */
export function useVideoAgain(onMade: (words: string) => void) {
  const [from, setFrom] = useState<PiecePlan | null>(null);
  const [plan, setPlan] = useState<PiecePlan | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const hasLine = !!plan && plan.lines.some((l) => l.trim() !== "");
  const changed = !!from && !!plan && wordsKeyOf(tidied(plan)) !== wordsKeyOf(tidied(from));
  const make = async () => {
    if (!plan) return;
    setBusy(true);
    setProblem(null);
    const r = await fileVerbs.makeVideo(tidied(plan), key);
    setBusy(false);
    if (!r.ok) return setProblem(r.message);
    setFrom(null);
    onMade(AGAIN_SAYS.making);
  };
  return {
    plan,
    busy,
    open: from !== null && plan !== null,
    canMake: changed && hasLine && !busy,
    note: problem ?? (plan && !hasLine ? AGAIN_SAYS.needsLine : null),
    change: (part: Partial<PiecePlan>) => setPlan((was) => (was ? { ...was, ...part } : was)),
    begin: (drawnBy: PiecePlan) => {
      setProblem(null);
      setFrom(drawnBy);
      setPlan({ ...drawnBy, lines: lineBoxesOf(drawnBy) });
      setKey(crypto.randomUUID());
    },
    cancel: () => {
      setProblem(null);
      setFrom(null);
    },
    make: () => void make(),
  };
}

type VideoAgainDraft = ReturnType<typeof useVideoAgain>;

/**
 * What the draft draws (the content canvas, PhChange "video"): the opening lines and the end card's, changed where they stand.
 * No choice of language (Ruben, 12 Nov 2026: the owner types the words, or asks Ask for any other change, the language among
 * them, in the line under them: propose_piece takes one): words typed here keep the video's own language, which the words it
 * draws itself (Before and After, where a quote was said) are in. What making it again does (a new video, the first one
 * kept) is asked as Make it again is pressed (VideoAgainActs), not said in an inset that stood in the sheet the whole time.
 */
export function VideoAgain({ again }: { again: VideoAgainDraft }) {
  const { plan, note, change } = again;
  if (!plan) return null;
  return (
    <div className="post-version" data-testid="cnv-again">
      <div className="post-edit">
        {LINES_AT.map((at) => (
          <PostSay
            key={at}
            label={AGAIN_SHEET.line(at + 1)}
            value={plan.lines[at] ?? ""}
            limit={PIECE_LIMITS.line}
            change={(words) => change({ lines: plan.lines.map((l, i) => (i === at ? words : l)) })}
            testid={`cnv-again-line-${at + 1}`}
          />
        ))}
        <PostSay
          label={AGAIN_SHEET.endLine}
          value={plan.end_line ?? ""}
          limit={PIECE_LIMITS.endLine}
          change={(words) => change({ end_line: words })}
          testid="cnv-again-end"
        />
      </div>
      {note ? (
        <p className="post-said" role="alert" data-testid="cnv-again-refused">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * What the foot draws: Make it again, wide and coral, once its words have changed; pressed, the kit's question in its place,
 * the one time it is worth asking: a new video is drawn, which takes a minute and a render, and the first one stays. Its No
 * goes back to the press, its words as they were.
 */
export function VideoAgainActs({ again }: { again: VideoAgainDraft }) {
  const { busy, canMake, make } = again;
  const [asking, setAsking] = useState(false);
  const confirm = AGAIN_SHEET.confirm;
  if (asking)
    return cmFootAsk(
      <Confirm
        question={confirm.question}
        detail={confirm.detail}
        yes={confirm.yes}
        no={confirm.no}
        docked
        busy={busy}
        onYes={make}
        onNo={() => setAsking(false)}
        testid="cnv-again-ask"
      />,
    );
  return (
    <div className="cnv-acts" data-foot-acts="">
      <Button
        variant="primary"
        className="cnv-lead"
        onClick={() => setAsking(true)}
        disabled={!canMake}
        aria-busy={busy}
        data-testid="cnv-again-make"
      >
        {AGAIN_SAYS.make}
      </Button>
    </div>
  );
}
