/**
 * The viewer's foot, over the bottom of the picture (the content canvas, board PhView): the name and one line, where it stands
 * in one row, then the acts (the one coral next step, Save and Ask's three) and Details. A post that stopped says so in the
 * row, why in the row's list, and its coral act is Try again: once each (Ruben, 12 Nov 2026). A video has no row: Save video
 * is its coral act.
 *
 * Where it stands is said once (Ruben, 12 Nov 2026), where the canvas drew a chip per place, a row for a post that waits and
 * a greyed "Posting to Instagram" in the coral act's place, all for one fact: one row with the tile's own dot and sentence
 * (model/places.ts pieceStatusOf), Don't post at its end while a post can still be stopped, and a press that opens the list
 * of every place (post-both.tsx), which is the one Post opens too.
 */
import type { ReactNode } from "react";
import {
  CONTENT_SHEET_WORDS as SHEET,
  CONTENT_WORDS as W,
  type FileDto,
  type PostDto,
  type PostPlace,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { useCopied } from "../../../kit/copy-button/copy-button";
import { Icon } from "../../../kit/icon/icon";
import { Press } from "../../../kit/press";
import { SaveButton, type useSave } from "../piece-foot";
import type { PieceNext } from "../model/piece-open";
import { pieceStatusOf } from "../model/places";
import type { ViewerClock } from "../model/viewer-line";

const VIDEO = SHEET.video;

/** Each place's glyph, as the canvas draws it on the act that posts there. */
const PLACE_GLYPH = { instagram: "instagram", google: "place" } as const satisfies Record<PostPlace, string>;

/** The coral act: its words and its glyph. */
interface ViewerLead {
  words: string;
  /** None for posting (Post, Try again): a word alone, as every app that posts says it (Ruben, 12 Nov 2026). */
  glyph: string | null;
}

/**
 * The coral act for the piece's next step. A video Ask made leads with Post, which opens what a video can do today (save it,
 * or a post from it): Instagram takes no reel from here yet (decision 0121).
 */
export function viewerLeadOf(file: Pick<FileDto, "kind" | "source">, next: PieceNext): ViewerLead | null {
  const step = W.piece.step;
  // A video: nothing posts one from here (decision 0121), so it is saved, and Save video leads (ViewerActs).
  if (next.is === "save") return null;
  if (next.is === "post") return { words: step.post, glyph: null };
  if (next.is === "post_to") return { words: step.postTo(next.place), glyph: PLACE_GLYPH[next.place] };
  if (next.is === "again") return { words: step.again, glyph: null };
  if (next.is === "keep") return { words: step.keep, glyph: "check" };
  if (next.is === "make") return { words: step.make, glyph: "three" };
  return null;
}

/** What the status row opens, where it is a press: what that is called (its own title), and the press. */
interface StatusOpens {
  says: string;
  press: () => void;
}

/**
 * What the status row opens: a post's list of places, once its record has been read. Null where there is nothing to open:
 * the row then says where it stands, and is not a press. A video has no row (viewerHasStatus).
 */
export function statusOpensOf(at: { ready: boolean }, places: () => void): StatusOpens | null {
  return at.ready ? { says: SHEET.places.title, press: places } : null;
}

/**
 * Whether the piece has a status row: a post Ask made. Not a video: nothing posts one from here, so a row saying it is ready
 * to post promised what no press keeps (Ruben, 12 Nov 2026); its one act, Save video, says what it can do.
 */
export const viewerHasStatus = (file: Pick<FileDto, "kind" | "source">): boolean =>
  file.source === "made" && file.kind !== "video";

/**
 * A made video's one act, coral: Save video, its caption copied as it is saved, to paste under it in Instagram, which takes
 * no video from here. The press says Caption copied for a moment as it does; a refused clipboard leaves the caption in
 * Details, where a long press copies it.
 */
function VideoSaveLead(props: { save: ReturnType<typeof useSave>; caption: string | null; size: "touch" | "lg" }) {
  const { save, caption, size } = props;
  const [copied, copy] = useCopied();
  const said = copied && !!caption;
  const copyCaption = () => {
    if (caption) copy(caption);
  };
  const drawn = (
    <>
      <Icon name={said ? "check" : "download"} size={15} />
      {said ? VIDEO.copied : VIDEO.save}
    </>
  );
  const look = { variant: "primary", size, className: "cnv-viewer-lead", "data-testid": "cnv-video-save" } as const;
  return save.share ? (
    <Button
      {...look}
      onClick={() => {
        copyCaption();
        save.share?.();
      }}
    >
      {drawn}
    </Button>
  ) : (
    <Button {...look} href={save.href} onClick={copyCaption}>
      {drawn}
    </Button>
  );
}

/**
 * Where a made piece stands, in one row: its dot and sentence, a press where the list of places can be opened (a caret says
 * so), and Don't post at its end for whoever may stop a post that still can be. The press is named for a screen reader by
 * where the piece stands and then what it opens ("Ready to post. Where it's posted"): the caret says the second to an eye
 * alone. On a phone what it opens is a sheet, and the press says so; on a desk it opens in the pane's own body.
 */
export function ViewerStatus(props: {
  posts: readonly PostDto[];
  next: PieceNext;
  clock: ViewerClock;
  /** What the row opens; null where it opens nothing (the piece's record has not been read; a reader's video). */
  opens: StatusOpens | null;
  /** On a desk's pane rather than the glass over the picture. */
  desk?: boolean;
}) {
  const { opens } = props;
  const status = pieceStatusOf(props.posts, props.next, props.clock, Date.now());
  const said = (
    <>
      <span className="cnv-status-dot" aria-hidden="true" />
      <span className="cnv-status-said">{status.said}</span>
    </>
  );
  return (
    <div className="cnv-status" data-tone={status.tone} data-testid="cnv-status">
      {opens ? (
        <Press
          className="cnv-status-open"
          onClick={opens.press}
          aria-label={`${status.said}. ${opens.says}`}
          aria-haspopup={props.desk ? undefined : "dialog"}
          data-testid="cnv-status-open"
        >
          {said}
          <Icon name="chevron-down" size={11} />
        </Press>
      ) : (
        <span className="cnv-status-open">{said}</span>
      )}
    </div>
  );
}

interface ViewerFootActs {
  /** The coral act; null where nothing leads. */
  onLead: (() => void) | null;
  /** What the status row opens (statusOpensOf); null where it opens nothing. */
  onStatus: StatusOpens | null;
  onAsk: () => void;
  /**
   * Change it, on a piece Ask made: its words by hand with the line to Ask under them, or that line alone (Ruben, 12 Nov 2026:
   * an Ask press and a Change it press read as two ways to change one thing). Null on a Library file, whose press is Ask.
   */
  onChange: (() => void) | null;
  onDetails: () => void;
}

/**
 * The acts: the coral next step, Save and Ask's three. Where nothing leads (a post going up, one that is up everywhere), Save
 * takes the room with its word, so the row never stands as two small presses alone. On the glass over the picture on a
 * phone; on a desk the pane's own presses, with More after them (the content canvas, board Desk: desk.tsx).
 */
export function ViewerActs(props: {
  file: FileDto;
  next: PieceNext;
  may: boolean;
  busy: boolean;
  save: ReturnType<typeof useSave>;
  /** A made video's caption, copied as Save video saves it; null on anything else, and on a video with none. */
  caption: string | null;
  acts: Pick<ViewerFootActs, "onLead" | "onAsk" | "onChange">;
  /** On a desk: More, at the end of the row. */
  desk?: { more: ReactNode };
}) {
  const { file, next, may, busy, save, acts, desk } = props;
  const lead = may && acts.onLead ? viewerLeadOf(file, next) : null;
  // A clip sent to the Library stays with whoever sent it: the one picture is saved, never a clip (as Files kept it).
  const saves = !(file.kind === "video" && file.source !== "made");
  const madeVideo = file.kind === "video" && file.source === "made";
  const quiet = desk ? "secondary" : "glass";
  // A phone's thumb; a desk's large step, the height of where it stands over them (content.css .cnv-desk .cnv-status).
  const size = desk ? "lg" : "touch";
  return (
    <div className="cnv-viewer-acts" data-foot-acts="">
      {madeVideo ? <VideoSaveLead save={save} caption={props.caption} size={size} /> : null}
      {lead ? (
        <Button
          variant="primary"
          size={size}
          className="cnv-viewer-lead"
          onClick={acts.onLead ?? undefined}
          disabled={busy}
          data-testid="cnv-next"
        >
          {lead.glyph ? <Icon name={lead.glyph} size={15} /> : null}
          {lead.words}
        </Button>
      ) : null}
      {saves && !madeVideo ? <SaveButton save={save} glass={!desk} wide={!lead} /> : null}
      {/* One round press beside the lead: Change it where Ask made the piece (the line to Ask is in it), Ask on a Library file. */}
      {acts.onChange ? (
        <Button
          variant={quiet}
          size={size}
          iconOnly
          onClick={acts.onChange}
          aria-label={W.piece.changeIt}
          data-testid="cnv-change"
        >
          <Icon name="pencil" size={desk ? 15 : 17} />
        </Button>
      ) : (
        <Button
          variant={quiet}
          size={size}
          iconOnly
          onClick={acts.onAsk}
          aria-label={W.piece.ask}
          data-testid="cnv-ask"
        >
          <Icon name="three" size={desk ? 16 : 18} />
        </Button>
      )}
      {desk?.more}
    </div>
  );
}

export function ViewerFoot(props: {
  file: FileDto;
  posts: readonly PostDto[];
  next: PieceNext;
  name: string;
  /** The line under the name: what it is and what it was made from, or why a post stopped. */
  line: string;
  may: boolean;
  busy: boolean;
  clock: ViewerClock;
  save: ReturnType<typeof useSave>;
  /** A made video's caption, which Save video copies (ViewerActs). */
  caption: string | null;
  /** A question asked in place of the acts (Delete's), or none. */
  asking: ReactNode | null;
  /** What went wrong with the last press, or the share sheet's refusal. */
  problem: string | null;
  acts: ViewerFootActs;
}) {
  const { file, posts, clock, acts } = props;
  return (
    <div className="cnv-viewer-foot">
      <div>
        <h2 className="cnv-viewer-name">{props.name}</h2>
        <p className="cnv-viewer-line" data-testid="cnv-line">
          {props.line}
        </p>
      </div>
      {viewerHasStatus(file) ? (
        <ViewerStatus posts={posts} next={props.next} clock={clock} opens={acts.onStatus} />
      ) : null}
      {props.problem ? (
        <p className="cnv-viewer-line" role="alert" data-testid="cnv-problem">
          {props.problem}
        </p>
      ) : null}
      {props.asking ?? (
        <ViewerActs
          file={file}
          next={props.next}
          may={props.may}
          busy={props.busy}
          save={props.save}
          caption={props.caption}
          acts={acts}
        />
      )}
      {/* One door to the piece's sheet (Ruben, 12 Nov 2026: two sheets told one piece in halves): a post's is where it
          stands, above; Details stands only where there is no such row, a video or a photo of the Library. */}
      {viewerHasStatus(file) ? null : (
        <Button
          variant="quiet"
          size="sm"
          className="cnv-viewer-up"
          onClick={acts.onDetails}
          data-testid="cnv-details-open"
        >
          {W.viewer.details}
          <Icon name="chevron-up" size={11} />
        </Button>
      )}
    </div>
  );
}
