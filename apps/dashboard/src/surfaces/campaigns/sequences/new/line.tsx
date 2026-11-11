/**
 * New's line (the canvas "New: start from what's ready", N4): Ask's mark, one row that grows with what is written, the
 * mic while the line is empty, and the arrow that drafts it, faint until the line says enough. Hold the mic and say it:
 * the words land in the line as they are heard, and letting go drafts it, as Today's sheets do (kit/talk/held-mic.tsx).
 * The field is still the kit's Field under the id the browser tests fill (`sq-nw-line`), and the arrow is still
 * `sq-nw-draft`, always drawn.
 */
import { useRef } from "react";
import { NEED_YOU_WORDS, NEW_WORDS as W, NEW_WORDS_MAX } from "@chanlytics/contracts";
import { Field } from "../../../kit/field/field";
import { useGrowAsTyped } from "../../../kit/field/grow-as-typed";
import { Icon } from "../../../kit/icon/icon";
import { LinePress } from "../../../kit/line/line";
import { TalkPress, useHeldMic, type MicWords } from "../../../kit/talk/held-mic";
import { gate } from "../../../frame-verbs";
import { NEW_READY_WORDS as R } from "./ready-rules";

/** How much a line must say before Ask is asked: what Draft it has always waited for. */
export const NEW_LINE_MIN = 8;

const MIC: MicWords = {
  hold: NEED_YOU_WORDS.say.hold,
  letGo: R.line.letGo,
  blocked: NEED_YOU_WORDS.say.micBlocked,
  failed: NEED_YOU_WORDS.say.micFailed,
};

export function NewLine(props: {
  line: string;
  onLine: (words: string) => void;
  onDraft: (words: string) => void;
  /** The quiet line under it: what Ask does with it, or that the line was kept. */
  hint: string;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  useGrowAsTyped(box, props.line);
  const enough = props.line.trim().length >= NEW_LINE_MIN;
  const mic = useHeldMic({
    // What was said is the line, and where it says enough it is drafted as it is let go.
    say: (words) => {
      props.onLine(words);
      if (words.trim().length >= NEW_LINE_MIN) props.onDraft(words.trim());
    },
    onWords: props.onLine,
    busy: false,
    words: MIC,
  });
  const { listening } = mic.talk;
  return (
    <div className="sq-nw-say">
      <div className="sq-nw-line" data-state={listening ? "hold" : undefined} data-own-drag>
        <span className="sq-nw-line-ask" data-live={listening || undefined} aria-hidden="true">
          <Icon name="three" size={15} />
        </span>
        <Field
          ref={box}
          shape="words"
          aria-label={W.say.label}
          rows={1}
          value={props.line}
          onValueChange={props.onLine}
          placeholder={R.line.placeholder}
          maxLength={NEW_WORDS_MAX}
          readOnly={listening}
          data-testid="sq-nw-line"
          className="sq-nw-line-words"
        />
        {props.line.trim() ? null : <TalkPress mic={mic} busy={false} words={MIC} testid="sq-nw-talk" />}
        <LinePress
          kind="send"
          on={enough}
          aria-label={W.say.draft}
          disabled={!enough}
          onClick={() => props.onDraft(props.line.trim())}
          data-testid="sq-nw-draft"
          {...gate("approve")}
        >
          <Icon name="arrow-up" size={14} />
        </LinePress>
      </div>
      <small className="sq-nw-line-hint" data-live={listening || undefined}>
        {listening ? R.line.letGo : (mic.trouble ?? props.hint)}
      </small>
    </div>
  );
}
