/**
 * A piece, opened on a phone (the content canvas, "Open a piece", board PhView; plan Part A): the screen, dark whatever the
 * page's light, the way a phone shows a photo. The picture full bleed; over it a glass top (×, "2 of 8", a video's sound, More
 * as a caret pill) and the foot (the name and one line, where it stands in one row, the one coral next step, Save and Ask,
 * Details). Details, More, Rename and every draft open as the kit's sheets over it. Swipe sideways for the piece beside, pull
 * down from the top or press × to close.
 *
 * It stands in the split's open slot where the desk draws Campaigns' pane (parts/split.tsx CmSplit): the split keeps the
 * address (`campaigns/content:<id>`), the takeover of the screen, the list held behind it and Back. The piece's record, its
 * presses and its drafts are the pane's own (piece.tsx ContentPiece, piece-presses.tsx), handed in.
 */
import { useRef, useState } from "react";
import { CONTENT_WORDS as W, FILE_WORDS, fileSaidOf, type ContentMadeDto } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Confirm } from "../../../kit/confirm/confirm";
import { Icon } from "../../../kit/icon/icon";
import { heldAlong, heldUnder } from "../../../kit/motion/held-list";
import { touchSwipe } from "../../../kit/motion/swipe";
import { useRecSheetEscape } from "../../../kit/record/focus";
import type { ViewPage } from "../../../kit/view-tabs/pager";
import { cmGoing } from "../../parts/split";
import { useSave } from "../piece-foot";
import type { PieceFootActs } from "../piece-foot";
import type { PiecePresses, usePieceDrafts } from "../piece-presses";
import { pieceNextOf, type PieceTakes } from "../model/piece-open";
import { viewerSaidOf, type ViewerRecord } from "../model/viewer-line";
import type { PlaceDoors } from "../post-both";
import { viewerClockOf } from "./clock";
import { ViewerDetails, ViewerFacts } from "./details";
import { ViewerFoot, statusOpensOf } from "./foot";
import { shrinkIntoTile } from "./into-tile";
import { ViewerMore, type PieceMoreActs } from "./more";
import { ViewerPicture } from "./picture";
import { ViewerAskChange, ViewerDrafts, ViewerRename } from "./sheets";

/** Every press the viewer hands on: the pane's own (piece.tsx), the walk to the piece beside, and close. */
interface ViewerActs extends PieceFootActs, PieceMoreActs {
  onClose: () => void;
  onBefore: (() => void) | null;
  onAfter: (() => void) | null;
}

/**
 * What the viewer is handed, and the desk's pane too (desk.tsx): the piece with every post it has, its record, its presses and
 * drafts, and where it stands.
 */
export interface ViewerHands {
  made: ContentMadeDto;
  record: ViewerRecord;
  takes: PieceTakes | null;
  may: boolean;
  /** "2 of 8": where it stands among the pieces the page holds; null where it is not among them. */
  beside: { at: number; of: number } | null;
  presses: PiecePresses;
  drafts: ReturnType<typeof usePieceDrafts>;
  acts: ViewerActs;
  /** The doors to a post that is up at a place (piece.tsx postedDoorsOf), drawn under that place in the list of places. */
  doors: PlaceDoors;
}

/** Which of the viewer's own sheets is open. */
type ViewerSheet = "details" | "rename" | "change" | null;

/** A swipe across walks to the piece beside: the picture and its foot follow the finger, and let go where they were. */
function viewerPages(acts: Pick<ViewerActs, "onBefore" | "onAfter">): (el: Element) => ViewPage {
  return (el) => {
    const slide = el.querySelector<HTMLElement>(".cnv-viewer-slide");
    const put = (dx: number) => {
      if (slide) slide.style.translate = dx ? `${dx}px 0` : "";
    };
    return {
      prev: !!acts.onBefore,
      next: !!acts.onAfter,
      // The swipe hands over the drag already held back toward no piece (kit/motion/swipe.ts RESIST): drawn as it is.
      drag: (dx) => put(dx),
      settle: () => put(0),
      go: (step) => {
        put(0);
        (step < 0 ? acts.onBefore : acts.onAfter)?.();
      },
    };
  };
}

/** The glass top: ×, "n of N", a video's sound, and More. */
function ViewerTop(props: {
  hands: ViewerHands;
  sound: { on: boolean; flip: () => void } | null;
  onRename: () => void;
  /** ×: the piece shrinks back into its tile, then closes (into-tile.ts). */
  onClose: () => void;
}) {
  const { hands, sound } = props;
  const { made, beside, acts } = hands;
  return (
    <div className="cnv-viewer-top">
      <Button
        variant="glass"
        size="lg"
        iconOnly
        onClick={props.onClose}
        aria-label={W.viewer.close}
        data-testid="cnv-close"
      >
        <Icon name="x" size={16} />
      </Button>
      {beside ? (
        <span className="cnv-viewer-of" data-testid="cnv-of">
          {W.piece.of(beside.at, beside.of)}
        </span>
      ) : null}
      <div className="cnv-viewer-right">
        {sound ? (
          <Button
            variant="glass"
            size="lg"
            iconOnly
            onClick={sound.flip}
            aria-label={sound.on ? W.viewer.soundOff : W.viewer.soundOn}
            data-testid="cnv-sound"
          >
            <Icon name={sound.on ? "sound-on" : "sound-off"} size={16} />
          </Button>
        ) : null}
        {hands.may ? <ViewerMore file={made.file} acts={{ ...acts, onRename: props.onRename }} /> : null}
      </div>
    </div>
  );
}

/** Delete, asked in place of the acts: in the viewer's foot, and in the desk pane's body. */
export function removeAsk(hands: Pick<ViewerHands, "made" | "presses">) {
  const { made, presses } = hands;
  if (!presses.asking) return null;
  const video = made.file.kind === "video";
  return (
    <div className="cnv-viewer-ask">
      <Confirm
        question={video ? FILE_WORDS.video.removeAsk : FILE_WORDS.removeAsk}
        detail={FILE_WORDS.removeNote}
        yes={FILE_WORDS.remove}
        no={FILE_WORDS.dontDelete}
        danger
        busy={presses.busy}
        onYes={presses.remove}
        onNo={() => presses.ask(false)}
        testid="cnv-remove-ask"
      />
    </div>
  );
}

export function PieceViewer({ hands, over }: { hands: ViewerHands; over: boolean }) {
  const { made, record, presses, drafts, acts } = hands;
  const { file, posts } = made;
  const [sheet, setSheet] = useState<ViewerSheet>(null);
  const [sound, setSound] = useState(false);
  const save = useSave(file, "portrait");
  const name = fileSaidOf(file.name);
  const clock = viewerClockOf();
  const says = viewerSaidOf({ file, posts, name }, record, clock);
  const next = pieceNextOf(file, posts, hands.takes, Date.now());
  // A sheet or a question open over it takes Escape first; with none, Escape closes the piece.
  // × and Escape close into the piece's tile (the content canvas: "the piece shrinks back into its tile"); a thumb's drag down
  // carries the piece away itself.
  const root = useRef<HTMLElement>(null);
  const closeIntoTile = () => void shrinkIntoTile(root.current, file.id).then(() => acts.onClose());
  useRecSheetEscape(sheet === null && !drafts.open && !presses.asking, closeIntoTile);
  const close = () => setSheet(null);
  const onLead = () => {
    presses.clear();
    acts.onNext(next);
  };
  const swipe = touchSwipe({
    onDown: acts.onClose,
    // Pulled down, it lands in its tile as × does, from where the thumb let it go; with no tile on screen it leaves downward.
    downInto: (el) => shrinkIntoTile(el, file.id),
    pages: viewerPages(acts),
    onGrab: cmGoing,
    under: heldUnder,
    along: heldAlong,
    backNavigates: true,
  });
  const playable = file.kind === "video" && file.media_status === "ready";
  // Where it stands, opened: a post's list of places once its record is read (foot.tsx statusOpensOf).
  const onStatus = statusOpensOf({ ready: drafts.both.ready }, () => {
    presses.clear();
    drafts.both.begin();
  });
  return (
    <section
      ref={root}
      {...swipe}
      className="cnv-viewer"
      data-theme="dark"
      data-over={over || undefined}
      aria-label={name}
      data-testid="cnv-piece"
    >
      <div className="cnv-viewer-slide">
        <ViewerPicture file={file} name={name} sound={sound} />
        <ViewerFoot
          file={file}
          posts={posts}
          next={next}
          name={name}
          line={says.line}
          may={hands.may}
          busy={presses.busy}
          clock={clock}
          save={save}
          caption={file.kind === "video" ? says.words : null}
          asking={removeAsk(hands)}
          problem={presses.problem ?? save.said}
          acts={{
            onLead,
            onStatus,
            onAsk: acts.onAsk,
            onChange: acts.onChange ?? (file.source === "made" ? () => setSheet("change") : null),
            onDetails: () => setSheet("details"),
          }}
        />
      </div>
      <ViewerTop
        hands={hands}
        sound={playable ? { on: sound, flip: () => setSound((on) => !on) } : null}
        onRename={() => setSheet("rename")}
        onClose={closeIntoTile}
      />
      <ViewerDetails
        open={sheet === "details"}
        onClose={close}
        shown={says.details}
        may={hands.may}
        busy={presses.busy}
        say={presses.say}
        caption={presses.caption}
      />
      <ViewerRename open={sheet === "rename"} onClose={close} file={file} change={presses.change} />
      <ViewerAskChange open={sheet === "change"} onClose={close} about={drafts.about} />
      <ViewerDrafts
        drafts={drafts}
        doors={hands.doors}
        piece={{
          name: says.details.name,
          facts: (
            <ViewerFacts
              shown={says.details}
              may={hands.may}
              busy={presses.busy}
              say={presses.say}
              caption={presses.caption}
              typed={presses.captionTyped}
              compact
            />
          ),
        }}
      />
    </section>
  );
}
