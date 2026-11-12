/**
 * The one line to Ask on a piece (Ruben, 12 Nov 2026: "it should always just be an input that opens to activate the Ask"):
 * the owner's own words about this piece, asked of Ask in a conversation of its own. No preset asks: the canvas drew three
 * (Shorter, Another client, In Spanish), the same on every piece whatever it was, and Ask needs none written for it. Ask is
 * told how the piece was made as it opens it (server posts/made-as.ts), and its words count as the owner's (act/files/post.ts
 * ownersWords), so it answers with a card for a new one made from the same photos and clips with that changed; the one they
 * have stays, as the card says.
 *
 * Drawn as Ask's own line is (the kit's line: the field that grows with its words, and the round send at its end, faint
 * until there are words), with Ask's three before it, so it reads as Ask wherever it stands. No note under it: what asking
 * does is Ask's card's to say, once there is something to say.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CONTENT_SHEET_WORDS, type AskScope } from "@chanlytics/contracts";
import { askAbout } from "../../../frame-verbs";
import { Icon } from "../../../kit/icon/icon";
import { LineField, LinePress } from "../../../kit/line/line";

const SAYS = CONTENT_SHEET_WORDS.ask;

/** What Ask is asked about: the piece, by its file. */
export interface ChangeAbout extends AskScope {
  kind: "file";
}

/**
 * The line. Return asks, as its press does (Shift and Return for a second line); `alone` is the line with nothing of the piece
 * to change by hand above it, which takes the keys as it opens, since typing is all there is to do there. It asks about a
 * piece, or about the page (Make's "Or say what you want", sheets/make.tsx), which says what it waits for (`placeholder`).
 */
export function AskLine({
  about,
  onAsked,
  alone = false,
  placeholder,
}: {
  about: AskScope;
  onAsked: () => void;
  alone?: boolean;
  placeholder?: string;
}) {
  const [words, setWords] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (alone) field.current?.focus({ preventScroll: true });
  }, [alone]);
  const said = words.trim();
  const ask = () => {
    if (!said) return;
    onAsked();
    askAbout({ about, prompt: said, fresh: true });
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    ask();
  };
  return (
    <div className="cnv-ask-line" data-testid="cnv-ask-line">
      <span className="cnv-ask-mark" aria-hidden="true">
        <Icon name="three" size={15} />
      </span>
      <LineField
        ref={field}
        className="cnv-ask-words"
        rows={1}
        value={words}
        onChange={(event) => setWords(event.currentTarget.value)}
        onKeyDown={onKey}
        placeholder={placeholder ?? (alone ? SAYS.alone : SAYS.more)}
        aria-label={SAYS.label}
        enterKeyHint="send"
        maxLength={1000}
        data-testid="cnv-ask-words"
      />
      <LinePress kind="send" onClick={ask} disabled={!said} aria-label={SAYS.send} data-testid="cnv-ask-send">
        <Icon name="arrow-up" size={15} />
      </LinePress>
    </div>
  );
}
