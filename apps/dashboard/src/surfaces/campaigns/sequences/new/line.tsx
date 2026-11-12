/**
 * New's line (the canvas "New: start from what's ready", N4): Ask's mark, one row that grows with what is written, the
 * mic while the line is empty, and the arrow that drafts it, faint until the line says enough. Hold the mic and say it:
 * the words land in the line as they are heard, and letting go drafts it, as Today's sheets do (kit/talk/held-mic.tsx).
 * The field is still the kit's Field under the id the browser tests fill (`sq-nw-line`), and the arrow is still
 * `sq-nw-draft`, always drawn. The same line stands under a draft, where what is said changes it (N7, change.ts): each
 * says what it is (`says`): its words, how little it may say, and the ids its parts answer to.
 */
import { useRef } from "react";
import { NEED_YOU_WORDS, NEW_WORDS as W, NEW_WORDS_MAX } from "@chanlytics/contracts";
import { Field } from "../../../kit/field/field";
import { useGrowAsTyped } from "../../../kit/field/grow-as-typed";
import { Icon } from "../../../kit/icon/icon";
import { LinePress } from "../../../kit/line/line";
import { TalkPress, useHeldMic, type MicWords } from "../../../kit/talk/held-mic";
import { gate } from "../../../frame-verbs";
import { CHANGE_LINE_MIN, CHANGE_WORDS } from "./change";
import { NEW_READY_WORDS as R } from "./ready-rules";

/** How much a line must say before Ask is asked: what Draft it has always waited for. */
export const NEW_LINE_MIN = 8;

/** What a line says of itself: its words, how little it may say before its arrow wakes, and its parts' ids. */
interface LineSays {
  label: string;
  placeholder: string;
  letGo: string;
  send: string;
  min: number;
  ids: { line: string; talk: string; send: string };
}

/** The line New opens on: what it should do, drafted. */
export const DRAFT_LINE: LineSays = {
  label: W.say.label,
  placeholder: R.line.placeholder,
  letGo: R.line.letGo,
  send: W.say.draft,
  min: NEW_LINE_MIN,
  ids: { line: "sq-nw-line", talk: "sq-nw-talk", send: "sq-nw-draft" },
};

/** The line under a draft: what should change. */
export const CHANGE_LINE: LineSays = {
  label: CHANGE_WORDS.label,
  placeholder: CHANGE_WORDS.placeholder,
  letGo: CHANGE_WORDS.letGo,
  send: CHANGE_WORDS.send,
  min: CHANGE_LINE_MIN,
  ids: { line: "sq-nw-change", talk: "sq-nw-change-talk", send: "sq-nw-change-send" },
};

export function NewLine(props: {
  line: string;
  onLine: (words: string) => void;
  onDraft: (words: string) => void;
  /** The quiet line under it: what Ask does with it, or that the line was kept. */
  hint: string;
  says: LineSays;
  /** Ask is at work on what it last took: it takes no other until that comes back or is stopped. */
  busy: boolean;
}) {
  const { says, busy } = props;
  const box = useRef<HTMLTextAreaElement>(null);
  useGrowAsTyped(box, props.line);
  const enough = !busy && props.line.trim().length >= says.min;
  const words: MicWords = {
    hold: NEED_YOU_WORDS.say.hold,
    letGo: says.letGo,
    blocked: NEED_YOU_WORDS.say.micBlocked,
    failed: NEED_YOU_WORDS.say.micFailed,
  };
  const mic = useHeldMic({
    // What was said is the line, and where it says enough it is drafted as it is let go.
    say: (heard) => {
      props.onLine(heard);
      if (heard.trim().length >= says.min) props.onDraft(heard.trim());
    },
    onWords: props.onLine,
    busy,
    words,
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
          aria-label={says.label}
          rows={1}
          value={props.line}
          onValueChange={props.onLine}
          placeholder={says.placeholder}
          maxLength={NEW_WORDS_MAX}
          readOnly={listening || busy}
          onKeyDown={(event) => {
            // Enter says it, as Today's line does (ask-line.tsx); Shift and Enter is a new line in it.
            if (event.key !== "Enter" || event.shiftKey) return;
            event.preventDefault();
            if (enough) props.onDraft(props.line.trim());
          }}
          data-testid={says.ids.line}
          className="sq-nw-line-words"
        />
        {props.line.trim() ? null : <TalkPress mic={mic} busy={busy} words={words} testid={says.ids.talk} />}
        <LinePress
          kind="send"
          on={enough}
          aria-label={says.send}
          disabled={!enough}
          onClick={() => props.onDraft(props.line.trim())}
          data-testid={says.ids.send}
          {...gate("approve")}
        >
          <Icon name="arrow-up" size={14} />
        </LinePress>
      </div>
      <small className="sq-nw-line-hint" data-live={listening || undefined}>
        {listening ? says.letGo : (mic.trouble ?? props.hint)}
      </small>
    </div>
  );
}
