/**
 * Details, a sheet over the viewer (the content canvas, board PhView "details"): the words that go with it, what it was made
 * from with their pictures, and rows saying when Ask made it and a video's sound; no foot, since Change it is More's. A photo
 * of the Library keeps here the shelf it is on. Who is in it is never asked: footage a business provides is taken as
 * cleared (Ruben, 22 Nov 2026). Where a piece stands at each place, and the doors to a post that is up (see it on
 * Instagram, see it on Google or take it down), are the status row's list alone (foot.tsx ViewerStatus, post-both.tsx):
 * said once. Every line is the records': a video's words come
 * with Ask's caption (Part D), and none is made up meanwhile.
 */
import {
  AD_STATE_WORDS,
  AD_WARN_STATES,
  CONTENT_WORDS as W,
  adRoute,
  fileViewOf,
  type PieceAdUseDto,
} from "@chanlytics/contracts";
import { navigate } from "../../../frame-verbs";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Sheet } from "../../../kit/sheet/sheet";
import { FileChoices } from "../../../files/file-fields";
import type { FileChange } from "../../../files/verbs";
import type { ViewerDetailsShown } from "../model/viewer-line";
import { CaptionInPlace } from "./caption";

/** What Details holds, in the phone's sheet and under the acts in the desk's pane (desk.tsx). */
interface ViewerFactsProps {
  shown: ViewerDetailsShown;
  /** Whether this person may change it: a photo's shelf is theirs to say, and its words theirs to edit. */
  may: boolean;
  busy: boolean;
  say: (body: FileChange) => void;
  /** Keeps a made piece's caption, written where it stands; answers why it could not, or null (piece-presses.tsx). */
  caption: (words: string) => Promise<string | null>;
  /** Told what the caption's box holds, under a post's places, where Post sends what is on screen (viewer/caption.tsx). */
  typed?: (text: string | null) => void;
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
  typed,
}: {
  shown: ViewerDetailsShown;
  may: boolean;
  keep: ViewerFactsProps["caption"];
  typed?: ViewerFactsProps["typed"];
}) {
  if (shown.file.source === "made" && may)
    return <CaptionInPlace words={shown.words} video={shown.file.kind === "video"} keep={keep} onText={typed} />;
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
          <span>{fact.label}</span> {fact.inLine ?? fact.said}
        </span>
      ))}
    </div>
  );
}

/** An ad's tone where a piece names it, as its Ads row is drawn: amber where it needs the owner, green while it is on. */
const adToneOf = (state: PieceAdUseDto["state"]): "warn" | "ok" | undefined =>
  AD_WARN_STATES.includes(state) ? "warn" : state === "on" ? "ok" : undefined;

/**
 * The ads it is shown in (Campaigns in three tabs), every one, running or not, each opening the ad itself, and the one rule an
 * owner may wonder about: a change to the piece never changes an ad that runs.
 */
function UsedIn({ ads }: { ads: readonly PieceAdUseDto[] }) {
  const facts = W.viewer.facts;
  return (
    <div className="cnv-fact" data-testid="cnv-used-in">
      <span>{facts.usedIn(ads.length)}</span>
      <ul className="cnv-used-in">
        {ads.map((ad) => (
          <li key={ad.id}>
            <LinkButton onClick={() => navigate(adRoute(ad.id))} data-testid="cnv-used-in-ad">
              {ad.name}
            </LinkButton>
            {/* Where it stands, in the words its row on Ads says it (contracts AD_STATE_WORDS). */}
            <span data-tone={adToneOf(ad.state)}>{AD_STATE_WORDS[ad.state]}</span>
          </li>
        ))}
      </ul>
      <p className="cnv-used-note">{facts.usedNote}</p>
    </div>
  );
}

/**
 * The words, what it was made from, a photo's shelf, and its rows. A made piece's caption is the owner's to change where it
 * stands (caption.tsx); a reader's is words to read. Where it stands at each place, and the doors to a post that is up, are
 * the status row's and its list's alone (foot.tsx ViewerStatus, post-both.tsx), said once.
 */
export function ViewerFacts(props: ViewerFactsProps) {
  const { shown, may } = props;
  const { file, from } = shown;
  if (props.compact)
    return (
      <div className="cnv-facts" data-testid="cnv-facts">
        <FactWords shown={shown} may={may} keep={props.caption} typed={props.typed} />
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
      {/* The shelf a photo of the Library is on, the owner's to say. */}
      {file.source !== "made" && may ? <FileChoices file={file} busy={props.busy} say={props.say} /> : null}
      <dl className="cnv-fact-rows">
        {shown.facts.map((fact) => (
          <div key={fact.label} className="cnv-fact-row">
            <dt>{fact.label}</dt>
            <dd>{fact.said}</dd>
          </div>
        ))}
      </dl>
      {shown.usedIn.length > 0 ? <UsedIn ads={shown.usedIn} /> : null}
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
