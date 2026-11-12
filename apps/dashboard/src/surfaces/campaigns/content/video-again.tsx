/**
 * A made video's words, made again (the content redesign's stage 2): More › Change it on a video Ask made opens its opening
 * lines, its end card's line and its language, as the plan it was drawn by holds them (GET files/[id] `video`). Make it again
 * asks for a new video from the same moments of the same clips (POST files/video), as the card's Make it did; the one it came
 * from stays, as a post's new version leaves the post. Its press stands in the pane's foot, which holds still under what
 * scrolls. Pressed twice, it is one video: the key is the draft's, taken as it opens.
 */
import { useState } from "react";
import { CONTENT_WORDS, PIECE_LIMITS, type PieceLanguage, type PiecePlan } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { PostChoice } from "../../files/post-choice";
import { PostSay } from "../../files/post-edit";
import { fileVerbs } from "../../files/verbs";

const AGAIN_SAYS = CONTENT_WORDS.again;
const AGAIN_LANGUAGES: readonly PieceLanguage[] = ["en", "es"];
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

/** What the pane's body draws: each opening line, the end card's line, the language, and what making it again does. */
export function VideoAgain({ again }: { again: VideoAgainDraft }) {
  const { plan, note, change } = again;
  if (!plan) return null;
  return (
    <div className="post-version cnv-again" data-testid="cnv-again">
      <p className="cnv-again-says">{AGAIN_SAYS.says}</p>
      <div className="post-edit">
        {LINES_AT.map((at) => (
          <PostSay
            key={at}
            label={AGAIN_SAYS.line(at + 1)}
            value={plan.lines[at] ?? ""}
            limit={PIECE_LIMITS.line}
            change={(words) => change({ lines: plan.lines.map((l, i) => (i === at ? words : l)) })}
            testid={`cnv-again-line-${at + 1}`}
          />
        ))}
        <PostSay
          label={AGAIN_SAYS.endLine}
          value={plan.end_line ?? ""}
          limit={PIECE_LIMITS.endLine}
          change={(words) => change({ end_line: words })}
          testid="cnv-again-end"
        />
        <PostChoice
          label={AGAIN_SAYS.language}
          options={AGAIN_LANGUAGES}
          words={AGAIN_SAYS.languages}
          value={plan.language}
          choose={(language) => change({ language })}
          testid="cnv-again-language"
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

/** What the pane's foot draws. */
export function VideoAgainActs({ again }: { again: VideoAgainDraft }) {
  const { busy, canMake, make, cancel } = again;
  return (
    <div className="files-acts" data-foot-acts="">
      <Button onClick={make} disabled={!canMake} data-testid="cnv-again-make">
        {AGAIN_SAYS.make}
      </Button>
      <Button variant="quiet" onClick={cancel} disabled={busy} data-testid="cnv-again-cancel">
        {AGAIN_SAYS.cancel}
      </Button>
    </div>
  );
}
