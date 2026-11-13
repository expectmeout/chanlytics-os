/**
 * "I posted it" (Ruben, 12 Nov 2026), on a video Ask made: nothing posts a video from here yet (decision 0121), so it is saved
 * and posted from the phone, and the app never heard that it went up; it said "Ready to save" for good, and nothing could
 * ever be learned from it. One press says so. It is the owner's word, kept as theirs ("Posted by you"), never as a post the
 * app sent. Its link is theirs to add after, pasted into one line: the link says where it is ("On TikTok, by you"), and is
 * the door to it. No list of places to pick from: a link names its own.
 *
 * Kept through PATCH files/[id] `posted` (server posts/by-hand.ts), the press that already says a file's name and shelf. The
 * page reads again as it lands, so the tile says what the open piece says.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  CONTENT_WORDS,
  HAND_LINK_MAX,
  contentMarkSaid,
  contentPieceMarkOf,
  type HandPostDto,
} from "@chanlytics/contracts";
import type { FrameFlash } from "../../../frame-verbs";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { LineField } from "../../../kit/line/line";
import type { FileChange } from "../../../files/verbs";
import { handLinkOf } from "../model/hand-link";
import type { ViewerClock } from "../model/viewer-line";

const BY_HAND = CONTENT_WORDS.piece.byHand;

/** What the press does, from the open piece's own change (piece-presses.tsx `change`: it reads the page again). */
export interface ByHandPress {
  /** Where its owner said they posted it, as it is kept, or none. */
  kept: HandPostDto | null;
  /** I posted it: said at once, with Undo while its note shows. */
  say: () => void;
  /** Its link kept; answers why it could not be, in words, or null. */
  keepLink: (link: string) => Promise<string | null>;
  /** Not posted after all. */
  takeBack: () => void;
}

/** The press's three acts over the piece's change, each telling what it did where it was pressed. */
export function byHandPressOf(
  kept: HandPostDto | null,
  change: (body: FileChange) => Promise<string | null>,
  flash: (f: FrameFlash) => void,
): ByHandPress {
  const refused = (problem: string) => flash({ tone: "danger", msg: <>{problem}</> });
  const takeBack = () =>
    void change({ posted: null }).then((problem) =>
      problem ? refused(problem) : flash({ msg: <>{BY_HAND.tookBack}</> }),
    );
  return {
    kept,
    say: () =>
      void change({ posted: {} }).then((problem) =>
        problem ? refused(problem) : flash({ msg: <>{BY_HAND.said}</>, undo: takeBack }),
      ),
    keepLink: (link) => change({ posted: { link } }),
    takeBack,
  };
}

/** The one line a link is pasted into: Return or Save keeps it, Escape lets it go. */
function LinkLine({ press, onDone }: { press: ByHandPress; onDone: () => void }) {
  const [pasted, setPasted] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // It takes the keys as it opens: pasting is all there is to do here (as Ask's line does where it stands alone).
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => field.current?.focus({ preventScroll: true }), []);
  const keep = async () => {
    const link = handLinkOf(pasted);
    if (!link) return setProblem(BY_HAND.linkWrong);
    setBusy(true);
    const refused = await press.keepLink(link);
    setBusy(false);
    if (refused) return setProblem(refused);
    onDone();
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      return onDone();
    }
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void keep();
  };
  return (
    <div className="cnv-byhand-link">
      <div className="cnv-ask-line cnv-byhand-line">
        <LineField
          ref={field}
          className="cnv-ask-words"
          rows={1}
          value={pasted}
          onChange={(event) => {
            setPasted(event.currentTarget.value);
            if (problem) setProblem(null);
          }}
          onKeyDown={onKey}
          placeholder={BY_HAND.linkHint}
          aria-label={BY_HAND.linkLabel}
          inputMode="url"
          enterKeyHint="done"
          maxLength={HAND_LINK_MAX}
          data-testid="cnv-byhand-link"
        />
        <Button size="sm" onClick={() => void keep()} disabled={busy || !pasted.trim()} data-testid="cnv-byhand-keep">
          {BY_HAND.keep}
        </Button>
      </div>
      {problem ? (
        <p className="cnv-byhand-problem" role="alert" data-testid="cnv-byhand-problem">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The press and where it stands, under a made piece's acts: I posted it, where nothing says it is up; once said, "Posted by
 * you · Monday" with the door to it (See it) or the way to give one (Add its link), and Not posted. A reader sees where it
 * stands, and nothing to press but its door.
 */
export function PostedByHand(props: {
  press: ByHandPress;
  /** Whether this person may say so: whoever may save a piece. */
  may: boolean;
  /** Offered at all: a video Ask made, which nothing posts from here. One already said is shown whatever it is. */
  offered: boolean;
  clock: ViewerClock;
  busy: boolean;
}) {
  const { press, may, clock } = props;
  const [adding, setAdding] = useState(false);
  const { kept } = press;
  if (!kept)
    return may && props.offered ? (
      <div className="cnv-byhand">
        <Button variant="quiet" size="sm" onClick={press.say} disabled={props.busy} data-testid="cnv-byhand-say">
          <Icon name="check" size={13} />
          {BY_HAND.say}
        </Button>
      </div>
    ) : null;
  if (adding) return <LinkLine press={press} onDone={() => setAdding(false)} />;
  // The tile's own sentence for it (contracts contentPieceMarkOf), so the open piece and its tile say one fact one way:
  // "Posted by you · Monday", or "On TikTok, by you · Monday" where its link says where.
  const mark = contentPieceMarkOf({ file: { kind: "video" }, posts: [], by_hand: kept }, Date.now());
  const stands = contentMarkSaid(mark, clock.day);
  return (
    <div className="cnv-byhand" data-said="" data-testid="cnv-byhand">
      <span className="cnv-byhand-said">
        <span className="cnv-byhand-dot" aria-hidden="true" />
        {stands}
      </span>
      {kept.link ? (
        <Button
          size="text"
          variant="quiet"
          href={kept.link}
          target="_blank"
          rel="noreferrer"
          data-testid="cnv-byhand-see"
        >
          {BY_HAND.see}
        </Button>
      ) : may ? (
        <Button size="text" variant="quiet" onClick={() => setAdding(true)} data-testid="cnv-byhand-add">
          {BY_HAND.addLink}
        </Button>
      ) : null}
      {may ? (
        <Button
          size="text"
          variant="quiet"
          onClick={press.takeBack}
          disabled={props.busy}
          data-testid="cnv-byhand-back"
        >
          {BY_HAND.takeBack}
        </Button>
      ) : null}
    </div>
  );
}
