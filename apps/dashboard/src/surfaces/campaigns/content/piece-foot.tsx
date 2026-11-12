/**
 * An open piece's foot: where it stands at each place (a state pill each: amber where it needs the owner, the accent while
 * it moves, plain at rest), then its acts, the one that leads last and filled (model/piece-open.ts pieceNextOf).
 * A video says plainly what Instagram takes, and leads with saving it.
 *
 * Save is the device's own share sheet where it has one, as Files' post sheet hands a post over (files/post-share.ts): that is
 * how a picture reaches Photos on a phone. Safari opens the sheet only inside the tap, so the picture is fetched as the piece
 * opens, and the tap asks for nothing. Anywhere else Save is the download.
 */
import { useEffect, useState } from "react";
import {
  CONTENT_WORDS as W,
  ON_INSTAGRAM,
  POST_PLACES,
  POST_PULLABLE,
  POST_WORDS,
  fileViewOf,
  type FileDto,
  type PostDto,
  type PostShapeName,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { postFileOf, sharePostFile, sharesPictures } from "../../files/post-share";
import { pieceStandsAt, pieceTimedOf, type PieceNext, type PieceStandsAt } from "./model/piece-open";

/** The kit's tones (contracts shell/tone.ts): the accent while it moves, amber where it needs the owner, plain at rest. */
const TONE = { none: "plain", going: "accent", timed: "plain", up: "ok", stuck: "warn" } as const;

/** How the foot says a time, by the business's own clock: one that has been ("Nov 9 · 3:10 PM"), one ahead ("tomorrow 9:00 PM"). */
export interface PieceClock {
  stamp: (at: string) => string;
  ahead: (at: string) => string;
}

/** What a place's pill says. */
function standsSaid(stands: PieceStandsAt, clock: PieceClock): string {
  if (stands.is === "up") return W.piece.stands.up(stands.at ? clock.stamp(stands.at) : null);
  if (stands.is === "timed") return W.piece.stands.timed(clock.ahead(stands.at));
  return W.piece.stands[stands.is];
}

/** "A story on Instagram": what a post is, and where. */
const postSaid = (post: PostDto): string => {
  const kind = ON_INSTAGRAM.kind[post.kind];
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)} on ${W.piece.place[post.place]}`;
};

/** The words of the act that leads, or null where nothing leads. */
function nextSaid(next: PieceNext): string | null {
  if (next.is === "post") return W.piece.step.post;
  if (next.is === "post_to") return W.piece.step.postTo(next.place);
  if (next.is === "again") return W.piece.step.again;
  if (next.is === "save") return W.piece.step.save;
  if (next.is === "keep") return W.piece.step.keep;
  if (next.is === "make") return W.piece.step.make;
  return null;
}

/** Save: the share sheet's press where the device has one and the picture has come, the download's address everywhere. */
function useSave(file: FileDto, shape: PostShapeName) {
  const video = file.kind === "video";
  // A made post's shape is handed to the share sheet; the library's own photo downloads as it is.
  const [canShare] = useState(
    () => !video && file.source === "made" && typeof navigator !== "undefined" && sharesPictures(),
  );
  const [ready, setReady] = useState<{ shape: PostShapeName; file: File | null } | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    if (!canShare) return undefined;
    let live = true;
    void postFileOf(file.id, file.name, shape).then((picture) => {
      if (live) setReady({ shape, file: picture });
    });
    return () => {
      live = false;
    };
  }, [canShare, file.id, file.name, shape]);
  const shared = ready?.shape === shape ? ready.file : null;
  const share = shared
    ? () => void sharePostFile(shared).then((outcome) => setSaid(outcome === "failed" ? POST_WORDS.shareFailed : null))
    : null;
  const href =
    video || file.source !== "made"
      ? `${fileViewOf(file.id)}?download`
      : `${fileViewOf(file.id)}?download&shape=${shape}`;
  return { href, share, said };
}

/**
 * Save: a press where the device's sheet is ready, a link to the download otherwise (the kit's Button is one or the other).
 * Filled with its words where it leads; a glyph alone beside the others.
 */
function SaveButton({ save, leads }: { save: ReturnType<typeof useSave>; leads: string | null }) {
  const words = leads ? (
    <>
      <Icon name="download" size={15} />
      {leads}
    </>
  ) : (
    <Icon name="download" size={15} />
  );
  const look = leads
    ? ({ variant: "primary", className: "cnv-lead" } as const)
    : ({ variant: "secondary", iconOnly: true, "aria-label": W.piece.save } as const);
  return save.share ? (
    <Button {...look} onClick={save.share} data-testid="cnv-save">
      {words}
    </Button>
  ) : (
    <Button {...look} href={save.href} data-testid="cnv-save">
      {words}
    </Button>
  );
}

export interface PieceFootActs {
  onNext: (next: PieceNext) => void;
  onPull: (postId: string) => void;
  onAsk: () => void;
  onMakePost: () => void;
}

export function PieceFoot({
  file,
  posts,
  next,
  may,
  busy,
  shape,
  clock,
  acts,
}: {
  file: FileDto;
  posts: readonly PostDto[];
  next: PieceNext;
  /** Whether this person may post and change it: a reader sees where it stands, and may save it, and nothing more. */
  may: boolean;
  busy: boolean;
  shape: PostShapeName;
  clock: PieceClock;
  acts: PieceFootActs;
}) {
  const save = useSave(file, shape);
  const leads = nextSaid(next);
  const library = file.source !== "made";
  const now = Date.now();
  const timed = pieceTimedOf(posts, now);
  // Why a post stopped, said where the eye is, once: the first place that says.
  const stopped = POST_PLACES.map((place) => pieceStandsAt(posts, place, now)).find((s) => s.is === "stuck" && s.why);
  const stopReason = stopped?.is === "stuck" ? stopped.why : null;
  const video = file.kind === "video";
  return (
    <div className="cnv-foot">
      {library ? null : video ? (
        <p className="cnv-note" data-testid="cnv-video-note">
          {W.piece.videoNote}
        </p>
      ) : (
        <div className="cnv-stands">
          {POST_PLACES.map((place) => {
            const stands = pieceStandsAt(posts, place, now);
            return (
              <span key={place} className="cnv-stand" data-stands={stands.is} data-testid="cnv-stand">
                <span className="cnv-stand-place">{W.piece.place[place]}</span>
                <StatePill kind="tone" value={TONE[stands.is]} label={standsSaid(stands, clock)} />
              </span>
            );
          })}
        </div>
      )}
      {stopReason && file.kind !== "video" ? (
        <p className="cnv-note cnv-refused" data-testid="cnv-why">
          {stopReason}
        </p>
      ) : null}
      {timed ? (
        <div className="cnv-timed" data-testid="cnv-timed">
          <span className="cnv-note">
            <Icon name="clock" size={13} />
            {W.piece.step.timed(postSaid(timed), clock.ahead(timed.scheduled_for))}
          </span>
          {may && POST_PULLABLE.includes(timed.status) ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => acts.onPull(timed.id)}
              disabled={busy}
              data-testid="cnv-pull"
            >
              {W.piece.step.dontPost}
            </Button>
          ) : null}
        </div>
      ) : null}
      {save.said ? (
        <p className="cnv-note" role="alert">
          {save.said}
        </p>
      ) : null}
      <div className="cnv-acts" data-foot-acts="">
        <Button iconOnly variant="secondary" onClick={acts.onAsk} aria-label={W.piece.ask} data-testid="cnv-ask">
          <Icon name="three" size={15} />
        </Button>
        {/* The one picture is saved; a clip sent here stays with whoever sent it, as Files kept it. */}
        {video ? null : <SaveButton save={save} leads={null} />}
        {video && !library && may ? (
          <Button variant="secondary" onClick={acts.onMakePost} data-testid="cnv-make-post">
            {W.piece.makePost}
          </Button>
        ) : null}
        {may && next.is === "going" && next.pull ? (
          <Button
            variant="secondary"
            onClick={() => acts.onPull(next.pull ?? "")}
            disabled={busy}
            data-testid="cnv-pull"
          >
            {W.piece.step.dontPost}
          </Button>
        ) : null}
        {next.is === "save" ? (
          <SaveButton save={save} leads={leads} />
        ) : leads && may ? (
          <Button
            variant="primary"
            className="cnv-lead"
            onClick={() => acts.onNext(next)}
            disabled={busy}
            data-testid="cnv-next"
          >
            {leads}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
