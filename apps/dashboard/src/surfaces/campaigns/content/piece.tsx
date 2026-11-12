/**
 * A made piece, opened (the content canvas, "Opening a piece"): Campaigns' own pane (parts/split.tsx CmPane), which stands
 * beside the grid on a desk and takes the screen on a phone, as a sequence's record does. In it the picture on its stage, then
 * where it is posted and what it was made from, and in the foot its one next step. It is drawn at once from what the page
 * already holds (the file and its posts); its record (GET files/[id]: how it was made, what can take it now) is read behind
 * it, as Files' sheet reads it, and nothing on screen waits on that read.
 *
 * A post is changed (a new version), posted to both places (post-both.tsx) or asked about from here. Each act is Files' own
 * verb, and each one that changes something reads the page again, so the tile says what the pane says.
 */
import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import {
  CONTENT_WORDS as W,
  FILE_WORDS,
  MAKE_POST_ASK,
  clockOf,
  fileSaidOf,
  issuesSaidOf,
  type ContentMadeDto,
  type FileMade,
  type FileSound,
  type PostShapeName,
} from "@chanlytics/contracts";
import { pageClock } from "@/bridge/zone";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { heldAlong, heldUnder } from "../../kit/motion/held-list";
import { touchSwipe } from "../../kit/motion/swipe";
import { Notice } from "../../kit/notice/notice";
import type { ViewPage } from "../../kit/view-tabs/pager";
import { askAbout, canDo, type FrameFlash } from "../../frame-verbs";
import { FileChoices, FileFrom, FileWho, NameField, lookSaysOf } from "../../files/file-fields";
import { PostOnGoogle } from "../../files/places/post-google";
import { PostOnInstagram } from "../../files/places/post-instagram";
import { usePostRecord } from "../../files/post-record";
import type { FileChange } from "../../files/verbs";
import { VideoHeard } from "../../files/video-player";
import { CmPane, cmGoing } from "../parts/split";
import { PieceFoot, type PieceClock, type PieceFootActs } from "./piece-foot";
import { PieceMore, type PieceMoreActs } from "./piece-more";
import { PieceStage } from "./piece-stage";
import {
  draftBody,
  draftFoot,
  removeAskOf,
  usePieceDrafts,
  usePiecePosts,
  usePiecePresses,
  type PieceHands,
  type PiecePresses,
} from "./piece-presses";
import { readAhead } from "./read-ahead";
import { pieceNextOf, type PieceNext, type PieceTakes } from "./model/piece-open";

type PieceDrafts = ReturnType<typeof usePieceDrafts>;

/** Where a piece stands among those the page holds, and who is before and after it. */
type PieceBeside = { at: number; of: number; before: string | null; after: string | null } | null;

/** The line under a piece's name: a video and its length, or a picture post; for the library, a photo, or a clip and its length. */
function pieceLineOf(file: ContentMadeDto["file"]): string {
  const clock = file.seconds !== null ? clockOf(file.seconds) : null;
  if (file.source !== "made") return file.kind === "video" && clock ? W.piece.clip(clock) : W.piece.photo;
  return file.kind === "video" && clock ? W.piece.video(clock) : W.piece.picture;
}

/** What Make a post asks Ask: a photo's own sentence, or a video's, whose post is drawn from the moment Ask chooses (as Files'). */
const postAskOf = (file: ContentMadeDto["file"]) =>
  file.kind === "video" ? FILE_WORDS.video.makePostAsk : MAKE_POST_ASK;

/** Everything a press in the pane does. */
interface PieceActs extends PieceFootActs, PieceMoreActs {
  onClose: () => void;
  /** The piece before and after this one; null at either end. */
  onBefore: (() => void) | null;
  onAfter: (() => void) | null;
}

/** What the pane draws: handed everything, holding nothing (the test draws it so). */
interface PieceShownProps {
  made: ContentMadeDto;
  takes: PieceTakes | null;
  may: boolean;
  busy: boolean;
  beside: PieceBeside;
  phone: boolean;
  shape: PostShapeName;
  /** The choice of shape, null while a composer or a new version is open under the picture. */
  choose: ((shape: PostShapeName) => void) | null;
  clock: PieceClock;
  /** What stands under the picture: the piece's details, or a composer while one is open. */
  body?: ReactNode;
  /** The foot, where a composer or a question stands in for the piece's own. */
  foot?: ReactNode;
  problem: string | null;
  swipe?: HTMLAttributes<HTMLElement>;
  over?: boolean;
  acts: PieceActs;
}

export function ContentPieceShown(props: PieceShownProps) {
  const { made, beside, phone, acts } = props;
  const heading = fileSaidOf(made.file.name);
  const next = pieceNextOf(made.file, made.posts, props.takes, Date.now());
  return (
    <CmPane
      title={heading}
      sub={beside ? `${pieceLineOf(made.file)} · ${W.piece.of(beside.at, beside.of)}` : pieceLineOf(made.file)}
      tools={
        <>
          {phone || !beside ? null : (
            <>
              <Button
                iconOnly
                variant="quiet"
                size="sm"
                onClick={acts.onBefore ?? undefined}
                disabled={!acts.onBefore}
                aria-label={W.piece.before}
                data-testid="cnv-before"
              >
                <Icon name="chevron-up" size={14} />
              </Button>
              <Button
                iconOnly
                variant="quiet"
                size="sm"
                onClick={acts.onAfter ?? undefined}
                disabled={!acts.onAfter}
                aria-label={W.piece.after}
                data-testid="cnv-after"
              >
                <Icon name="chevron-down" size={14} />
              </Button>
            </>
          )}
          {props.may ? <PieceMore file={made.file} phone={phone} acts={acts} /> : null}
        </>
      }
      foot={
        props.foot ?? (
          <PieceFoot
            file={made.file}
            posts={made.posts}
            next={next}
            may={props.may}
            busy={props.busy}
            shape={props.shape}
            clock={props.clock}
            acts={acts}
          />
        )
      }
      onClose={acts.onClose}
      swipe={props.swipe}
      over={props.over}
      className="cnv-open"
      testid="cnv-piece"
    >
      <PieceStage file={made.file} said={heading} shape={props.shape} choose={props.choose} />
      {props.body}
      {props.problem ? (
        <div role="alert">
          <Notice label={props.problem} fact={props.problem} line testid="cnv-problem" />
        </div>
      ) : null}
    </CmPane>
  );
}

/** What the record adds under the picture: what the look saw, what was heard, where it is up, where it came from, its fields. */
function PieceDetails({
  made,
  record,
  may,
  busy,
  change,
  say,
  open,
}: {
  made: ContentMadeDto;
  record: { made: FileMade | null; sound: FileSound | null };
  may: boolean;
  busy: boolean;
  change: (body: FileChange) => Promise<string | null>;
  say: (body: FileChange) => void;
  open: (id: string) => void;
}) {
  const { file } = made;
  const says = lookSaysOf(file);
  const library = file.source !== "made";
  return (
    <div className="cnv-details" data-testid="cnv-details">
      {says ? <p className="files-says">{says}</p> : null}
      {file.kind === "video" ? <VideoHeard sound={record.sound} /> : null}
      {library && file.looks_like_stock && file.status === "inbox" ? (
        <Notice label={FILE_WORDS.stock} fact={FILE_WORDS.stock} line />
      ) : null}
      {file.issues.length > 0 ? <p className="files-says files-issues">{issuesSaidOf(file.issues)}</p> : null}
      <div className="files-fields">
        {may ? (
          <>
            <NameField file={file} change={change} />
            {/* The library's shelf: what a photo shows, which a post Ask made has none of. */}
            {library ? <FileChoices file={file} busy={busy} say={say} /> : null}
            <FileWho file={file} busy={busy} say={say} />
          </>
        ) : null}
        <FileFrom file={file} made={record.made} open={open} />
      </div>
    </div>
  );
}

/** A swipe across walks to the piece beside; the stage follows the finger while it is carried, and lets go where it was. */
function piecePages(
  beside: PieceBeside,
  open: (id: string) => void,
): (el: Element, from: EventTarget | null) => ViewPage | null {
  return (el) => {
    const stage = el.querySelector<HTMLElement>(".cnv-stage");
    const put = (dx: number) => {
      if (stage) stage.style.translate = dx ? `${dx}px 0` : "";
    };
    return {
      prev: !!beside?.before,
      next: !!beside?.after,
      drag: (dx, _step, has) => put(has ? dx : dx / 4),
      settle: () => put(0),
      go: (step) => {
        put(0);
        const to = step < 0 ? beside?.before : beside?.after;
        if (to) open(to);
      },
    };
  };
}

/** Left and Up walk to the one before, Right and Down to the next, on a desk, never while a field, a menu or a player has the keys. */
function useWalkKeys(on: boolean, before: (() => void) | null, after: (() => void) | null): void {
  const keys = useRef({ before, after });
  keys.current = { before, after };
  useEffect(() => {
    if (!on) return undefined;
    const press = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable], [role='menu'], [role='dialog'], iframe")) return;
      const go =
        event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? keys.current.before
          : event.key === "ArrowRight" || event.key === "ArrowDown"
            ? keys.current.after
            : null;
      if (!go) return;
      event.preventDefault();
      go();
    };
    window.addEventListener("keydown", press);
    return () => window.removeEventListener("keydown", press);
  }, [on]);
}

/** The pane's presses, from the piece, its record, its drafts and its presses: the foot's, More's and the walk's. */
function pieceActsOf(
  hands: PieceHands & { phone: boolean; beside: PieceBeside },
  at: { drafts: PieceDrafts; presses: PiecePresses },
): PieceActs {
  const { made, record, open, onClose, phone, beside } = hands;
  const { drafts, presses } = at;
  const { file } = made;
  const about = { kind: "file", id: file.id, label: fileSaidOf(file.name) } as const;
  const plan = record.made?.plan ?? null;
  const from = record.made?.from ?? null;
  const video = record.video;
  return {
    onClose,
    onBefore: beside?.before ? () => open(beside.before ?? "") : null,
    onAfter: beside?.after ? () => open(beside.after ?? "") : null,
    onNext: (next: PieceNext) => {
      presses.clear();
      if (next.is === "post") drafts.both.begin();
      else if (next.is === "post_to" || next.is === "again") drafts.both.begin(next.place);
      else if (next.is === "keep") presses.say({ status: "filed" });
      // A conversation of its own, so a post costs only what a post reads, whatever Ask was last asked (as Files').
      else if (next.is === "make") askAbout({ about, prompts: postAskOf(file), fresh: true });
    },
    onPull: presses.pull,
    onAsk: () => askAbout({ about }),
    onMakePost: () => askAbout({ about, prompts: FILE_WORDS.video.makePostAsk, fresh: true }),
    // A video from the plan it was drawn by; a post from the photo it came from: with that gone, there is nothing to draw it
    // again from.
    onChange: video ? () => drafts.again.begin(video) : from && plan ? () => drafts.version.begin(plan) : null,
    onStill: drafts.still.offered && canDo("add_files") ? drafts.still.begin : null,
    // The name's field is in the details: brought into view, and on a desk given the keys (no field takes them by itself on a phone).
    onRename: () => {
      const field = document.querySelector<HTMLInputElement>(".cnv-open .cnv-details input");
      field?.scrollIntoView({ block: "center", behavior: "smooth" });
      if (!phone) field?.focus({ preventScroll: true });
    },
    onAside: () => presses.say({ status: file.status === "set_aside" ? "filed" : "set_aside" }),
    onDelete: () => presses.ask(true),
  };
}

/** What the pane shows at rest: the details, and where it is up on Google and Instagram, with each one's door. */
function PieceAtRest({ hands, presses }: { hands: PieceHands; presses: PiecePresses }) {
  const { made, record, open, reread, flash } = hands;
  const { file } = made;
  const may = canDo("settings");
  // Files' own line for a post that is up on Instagram, for its door to the post: one on its way, or stopped, the foot says.
  const upOnInstagram = record.instagram?.posts[0]?.status === "published" ? record.instagram.posts[0] : null;
  return (
    <>
      <PieceDetails
        made={made}
        record={record}
        may={may}
        busy={presses.busy}
        change={presses.change}
        say={presses.say}
        open={open}
      />
      <div className="cnv-posted">
        {record.posted ? (
          <PostOnGoogle
            id={file.id}
            posted={record.posted}
            may={may}
            saidDown={() => {
              record.setPosted(null);
              reread();
            }}
            flash={flash}
          />
        ) : null}
        {upOnInstagram ? (
          <PostOnInstagram id={file.id} post={upOnInstagram} may={may} pulled={presses.moved} flash={flash} />
        ) : null}
      </div>
    </>
  );
}

/** The open piece, holding its record, its presses and its drafts (piece-presses.tsx). */
export function ContentPiece({
  made,
  held,
  beside,
  phone,
  over,
  onClose,
  open,
  reread,
  flash,
}: {
  made: ContentMadeDto;
  /** The made pieces the page holds, in its order: the next two are read ahead. */
  held: readonly ContentMadeDto[];
  beside: PieceBeside;
  phone: boolean;
  over: boolean;
  onClose: () => void;
  /** Open another piece, by its file. */
  open: (id: string) => void;
  /** Read again what the page shows, after a change: Made, and the Library where the piece was opened from it. */
  reread: () => void;
  flash: (f: FrameFlash) => void;
}) {
  const { file } = made;
  const record = usePostRecord(file);
  const hands: PieceHands = { made, record, reread, open, onClose, flash };
  const { posts, takes } = usePiecePosts(made, record);
  const presses = usePiecePresses(hands, posts);
  const drafts = usePieceDrafts(hands, takes, presses.moved);
  const [shape, setShape] = useState<PostShapeName>("portrait");
  const page = pageClock();
  const clock: PieceClock = {
    stamp: (at) => page.stamp(Date.parse(at)),
    ahead: (at) => page.when(Date.parse(at)),
  };
  useEffect(() => readAhead(held, file.id), [held, file.id]);
  const acts = pieceActsOf({ ...hands, phone, beside }, { drafts, presses });
  // A draft open in the pane holds the keys for its own boxes.
  useWalkKeys(!phone && !drafts.open && !presses.asking, acts.onBefore, acts.onAfter);
  const swipe = phone
    ? touchSwipe({
        onBack: onClose,
        pages: piecePages(beside, open),
        when: () => phone,
        onGrab: cmGoing,
        under: heldUnder,
        along: heldAlong,
        backNavigates: true,
      })
    : undefined;
  return (
    <ContentPieceShown
      made={{ file, posts }}
      takes={takes}
      may={canDo("settings")}
      busy={presses.busy}
      beside={beside}
      phone={phone}
      shape={shape}
      choose={drafts.open ? null : setShape}
      clock={clock}
      body={draftBody(drafts, <PieceAtRest hands={hands} presses={presses} />)}
      foot={removeAskOf(file, presses) ?? draftFoot(drafts)}
      problem={presses.problem}
      swipe={swipe}
      over={over}
      acts={acts}
    />
  );
}
