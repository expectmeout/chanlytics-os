/**
 * Details, a sheet over the viewer (the content canvas, board PhView "details"): the words that go with it, what it was made
 * from with their pictures, and rows saying when Ask made it and a video's sound; no foot, since Change it is More's. A photo
 * of the Library keeps here its question of who is in it, which a post made from it needs answered first. Where a piece
 * stands at each place, and the doors to a post that is up (see it on Instagram, see it on Google or take it down), are the
 * status row's list alone (foot.tsx ViewerStatus, post-both.tsx): said once. Every line is the records': a video's words come
 * with Ask's caption (Part D), and none is made up meanwhile.
 */
import { CONTENT_WORDS as W, fileViewOf } from "@chanlytics/contracts";
import { Icon } from "../../../kit/icon/icon";
import { Sheet } from "../../../kit/sheet/sheet";
import { FileChoices, FileWho } from "../../../files/file-fields";
import type { FileChange } from "../../../files/verbs";
import type { ViewerDetailsShown } from "../model/viewer-line";
import { CaptionInPlace } from "./caption";

/** What Details holds, in the phone's sheet and under the acts in the desk's pane (desk.tsx). */
interface ViewerFactsProps {
  shown: ViewerDetailsShown;
  /** Whether this person may change it: who is in a photo is theirs to say, and its words theirs to edit. */
  may: boolean;
  busy: boolean;
  say: (body: FileChange) => void;
  /** Keeps a made piece's caption, written where it stands; answers why it could not, or null (piece-presses.tsx). */
  caption: (words: string) => Promise<string | null>;
  /**
   * Under a post's places, in its one sheet (viewer/sheets.tsx): the caption, then what it was made from and when on one quiet
   * line, its pictures small beside the words, where Details gives each its own block.
   */
  compact?: boolean;
}

/** The caption: the owner's to change where it stands, a reader's to read. */
function FactWords({
  shown,
  may,
  keep,
}: {
  shown: ViewerDetailsShown;
  may: boolean;
  keep: ViewerFactsProps["caption"];
}) {
  if (shown.file.source === "made" && may)
    return <CaptionInPlace words={shown.words} video={shown.file.kind === "video"} keep={keep} />;
  if (!shown.words) return null;
  return (
    <div className="cnv-fact">
      <span>{W.viewer.facts.words}</span>
      <p data-testid="cnv-words">{shown.words}</p>
    </div>
  );
}

/** What it was made from, its pictures small, and when, said once on one line. */
function MadeLine({ shown }: { shown: ViewerDetailsShown }) {
  return (
    <div className="cnv-made-line" data-testid="cnv-made-line">
      {shown.from ? (
        <span className="cnv-from-pictures" role="img" aria-label={W.viewer.facts.madeFrom}>
          {shown.from.ids.map((id) => (
            <img key={id} src={`${fileViewOf(id)}?w=96`} alt="" loading="lazy" />
          ))}
        </span>
      ) : null}
      {shown.facts.map((fact) => (
        <span key={fact.label} className="cnv-made-fact">
          <span>{fact.label}</span> {fact.said}
        </span>
      ))}
    </div>
  );
}

/**
 * The words, what it was made from, who is in a photo, and its rows. A made piece's caption is the owner's to change where it
 * stands (caption.tsx); a reader's is words to read. Where it stands at each place, and the doors to a post that is up, are
 * the status row's and its list's alone (foot.tsx ViewerStatus, post-both.tsx), said once.
 */
export function ViewerFacts(props: ViewerFactsProps) {
  const { shown, may } = props;
  const { file, from } = shown;
  if (props.compact)
    return (
      <div className="cnv-facts" data-testid="cnv-facts">
        <FactWords shown={shown} may={may} keep={props.caption} />
        <MadeLine shown={shown} />
      </div>
    );
  return (
    <div className="cnv-facts" data-testid="cnv-facts">
      <FactWords shown={shown} may={may} keep={props.caption} />
      {from ? (
        <div className="cnv-fact">
          <span>{W.viewer.facts.madeFrom}</span>
          <div className="cnv-from-pictures">
            {from.ids.map((id) => (
              <img key={id} src={`${fileViewOf(id)}?w=160`} alt="" loading="lazy" />
            ))}
          </div>
        </div>
      ) : null}
      {/* Who is in a photo of the Library, asked before a post is made from it: the one question the canvas does not draw. */}
      {file.source !== "made" && may ? (
        <>
          <FileChoices file={file} busy={props.busy} say={props.say} />
          <FileWho file={file} busy={props.busy} say={props.say} />
        </>
      ) : null}
      <dl className="cnv-fact-rows">
        {shown.facts.map((fact) => (
          <div key={fact.label} className="cnv-fact-row">
            <dt>{fact.label}</dt>
            <dd>{fact.said}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ViewerDetails(props: ViewerFactsProps & { open: boolean; onClose: () => void }) {
  const { shown, may } = props;
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={shown.name}
      sub={shown.sub}
      close={{ label: W.viewer.close, glyph: <Icon name="x" size={13} /> }}
      dark
      fit
      testid="cnv-details"
    >
      <div className="cnv-over">
        <ViewerFacts shown={shown} may={may} busy={props.busy} say={props.say} caption={props.caption} />
      </div>
    </Sheet>
  );
}
