/**
 * A made piece's caption, changed where it stands (Ruben, 12 Nov 2026: tap the caption and type, in place): its words as
 * Details says them are the box itself, the kit's sentences said in place (Field `shape="words"`), so a tap puts the caret
 * where the finger was and a long press still selects and copies, as anywhere on a phone. Leaving it keeps what changed (server
 * posts/caption.ts), and a quiet word beside its label says so; Escape puts back what was kept, and ⌘ or Ctrl with Return
 * keeps it without leaving the keys behind. Nothing is asked first: a caption is the owner's to write.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CONTENT_WORDS as W, PIECE_LIMITS, POST_CAPTION_MAX, SECOND_MS } from "@chanlytics/contracts";
import { Field, fieldProblem } from "../../../kit/field/field";
import { useGrowAsTyped } from "../../../kit/field/grow-as-typed";
import { Icon } from "../../../kit/icon/icon";

const FACTS = W.viewer.facts;

/** How long Saved stays beside the label once the caption is kept. */
const SAVED_SHOWN_MS = 2 * SECOND_MS;

/** Where the caption stands: as it is, on its way, or just kept. */
type CaptionStands = "still" | "saving" | "saved";

/** What the label's end says: a pencil at rest, so the words read as theirs to change; Saving; Saved. */
function CaptionSaid({ stands, typing }: { stands: CaptionStands; typing: boolean }) {
  if (stands === "saving") return <>{FACTS.captionSaving}</>;
  if (stands === "saved")
    return (
      <>
        <Icon name="check" size={11} />
        {FACTS.captionSaved}
      </>
    );
  return typing ? null : <Icon name="pencil" size={11} />;
}

export function CaptionInPlace(props: {
  /** The caption as it is kept; null where the piece has none yet. */
  words: string | null;
  video: boolean;
  /** Keeps it, and answers why it could not be, in words, or null. */
  keep: (caption: string) => Promise<string | null>;
  /**
   * Told what the box holds as it changes, and null once it is gone: a post's sheet sends the words on screen, and its door
   * keeps them in the same step (piece-presses.tsx useCaptionShown), however the box was left.
   */
  onText?: (text: string | null) => void;
}) {
  const kept = props.words ?? "";
  const [text, setText] = useState(kept);
  const [typing, setTyping] = useState(false);
  const [stands, setStands] = useState<CaptionStands>("still");
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const held = useRef(false);
  useGrowAsTyped(box, text);
  const heardBy = useRef(props.onText);
  heardBy.current = props.onText;
  useEffect(() => heardBy.current?.(text), [text]);
  useEffect(() => {
    const hears = heardBy;
    return () => hears.current?.(null);
  }, []);
  // Words still being typed as the box goes (its sheet closed with the keys in it: a phone's tap on × or on Post takes no
  // focus from it) are kept as it goes, as leaving it any other way keeps them. A story alone sends no words, so nothing
  // else would have kept them.
  const last = useRef({ text, kept, keep: props.keep });
  last.current = { text, kept, keep: props.keep };
  useEffect(() => {
    const at = last;
    const typed = held;
    return () => {
      if (typed.current && at.current.text.trim() !== at.current.kept.trim()) void at.current.keep(at.current.text);
    };
  }, []);
  // What is kept changed under it (its record read again once it was kept, another device): the box follows, unless it is
  // being typed in.
  useEffect(() => {
    if (!held.current) setText(kept);
  }, [kept]);
  useEffect(() => {
    if (stands !== "saved") return undefined;
    const shown = window.setTimeout(() => setStands("still"), SAVED_SHOWN_MS);
    return () => window.clearTimeout(shown);
  }, [stands]);
  const leave = async () => {
    held.current = false;
    setTyping(false);
    if (text.trim() === kept.trim()) return;
    setStands("saving");
    const refused = await props.keep(text);
    setProblem(refused);
    setStands(refused ? "still" : "saved");
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      // Put back first, so leaving finds nothing changed.
      setText(kept);
      setProblem(null);
      held.current = false;
      window.setTimeout(() => box.current?.blur(), 0);
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      box.current?.blur();
    }
  };
  return (
    <div
      className="cnv-fact"
      onFocus={() => {
        held.current = true;
        setTyping(true);
      }}
      onBlur={() => void leave()}
      data-testid="cnv-caption"
    >
      <span className="cnv-caption-head">
        {FACTS.words}
        <em className="cnv-caption-said" aria-live="polite">
          <CaptionSaid stands={stands} typing={typing} />
        </em>
      </span>
      <Field
        ref={box}
        className="cnv-caption-words"
        aria-label={FACTS.words}
        rows={1}
        shape="words"
        value={text}
        onValueChange={(next) => {
          setText(next);
          if (problem) setProblem(null);
        }}
        onKeyDown={onKey}
        placeholder={FACTS.captionAdd}
        maxLength={props.video ? PIECE_LIMITS.caption : POST_CAPTION_MAX}
        readOnly={stands === "saving"}
        data-testid="cnv-caption-box"
        {...fieldProblem(problem)}
      />
    </div>
  );
}
