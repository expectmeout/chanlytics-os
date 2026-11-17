/**
 * Content's card on Today (the content canvas, PhDoors "today"; stage 3 drew one line here), from its own small read (GET
 * content/note, contracts content/note.ts): "Content", how many of the week's pieces are ready to post, All, the newest post
 * that did not go out with why and Try again, and the week's pieces in a strip at their own shape, newest first, then what is
 * being made, dim, Ask's three at work on it, as the canvas's strip ends. Only where there is something to show: a business
 * with nothing made this week and nothing waiting is not told about Content each morning. Its read is its own module
 * (content-note-read.ts), which Today's first draw waits for where the tab opens on Today holding none; kept in the tab by
 * workspace, so a return draws it at once and reads again behind it, at most once a minute as the day moves. A read that
 * fails or is refused takes the card away: it claims nothing it could not read, and a count the read could not finish is
 * not said.
 *
 * Each piece, and the post that did not go out, is a link to the piece open in Content (a door is a link: a long press or a
 * new tab opens it too); a video being made, which is no piece yet, opens Being made. Its own parts and zones.css's
 * `.tz-content-*` alone: Files' tile and its styles are Content's chunk, which Today does not load. A piece's picture keeps
 * Files' tile's rules all the same (files/photo.tsx VideoFrame): a video is played a few seconds before its poster is cut, so
 * one not ready says it is getting ready and asks for nothing, one whose poster did not come says the same and asks again once
 * Ask has looked at it, and any picture that did not come is asked for again by the card's next read. Its own drawing had
 * none of them, so a video Ask made while Today was open stood a black tile for as long as the page did (Ruben's phone,
 * 17 Nov 2026), where the same video showed its picture in Content.
 *
 * Where the canvas puts a post that did not go out among Need you's rows, it stands here at the card's top: Need you is a walk
 * of people and their to-dos (zones/need-you.tsx), which holds no piece.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CONTENT_ROUTE,
  CONTENT_TODAY_WORDS as W,
  FILE_WORDS,
  MIN_MS,
  clockOf,
  contentMakingSaid,
  contentRouteOf,
  fileSaidOf,
  fileViewOf,
  postStoppedWhyOf,
  type ContentLineDto,
  type ContentMadeDto,
  type ContentMakingDto,
  type ContentTodayDto,
} from "@chanlytics/contracts";
import { routeDoor } from "../frame-verbs";
import { Icon } from "../kit/icon/icon";
import { Press } from "../kit/press";
import { tileShapeOf } from "../campaigns/content/model/tiles";
import { useSurface } from "../use-surface";
import { keptContentToday, readContentToday } from "./content-note-read";
import { sectionDoor } from "./zones/section-door";

/**
 * A piece, open in Content (over the page on a phone, beside the grid on a desk); where it did not post, in Needs you and
 * straight to its sheet (Post it), as the page's amber line and the bell open it.
 */
const pieceRouteOf = (fileId: string, needs = false): string =>
  contentRouteOf({ list: "made", view: needs ? "needs" : "all", open: fileId, post: needs });

/** Videos being made, which are no piece yet: Being made. */
const MAKING_ROUTE = contentRouteOf({ list: "made", view: "making", open: null });

/**
 * A piece's small picture, Files' own small view, loaded as it nears the screen. One that does not come stands as `unseen`
 * (the tile's ground, the press saying the piece's name, where none is given) until the card's next read, `asked`, which asks
 * for it again: the card stays on Today for hours, read again as the day moves, and a picture asked for a moment too soon
 * was never asked again. Its own, not Files' Picture, which brings Files' sending into Today's chunk.
 */
function WeekPicture({ fileId, asked, unseen = null }: { fileId: string; asked: number; unseen?: ReactNode }) {
  // The read a picture did not come under: the next one asks for it again.
  const [missedAt, setMissedAt] = useState<number | null>(null);
  if (missedAt === asked) return unseen ?? <span className="tz-content-unseen" />;
  return (
    <img
      src={`${fileViewOf(fileId)}?w=320`}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setMissedAt(asked)}
      data-testid="today-content-picture"
    />
  );
}

/** What a video says while its picture is not there, in Files' words: being made ready, or not to be. */
const videoWaitsOf = (failed: boolean): string =>
  failed ? FILE_WORDS.video.notPrepared : FILE_WORDS.video.gettingReady;

/** A video's ground while its picture is not there, saying so. */
function VideoWaits({ failed }: { failed: boolean }) {
  return (
    <span className="tz-content-unseen tz-content-waits" data-testid="today-content-waits">
      {videoWaitsOf(failed)}
    </span>
  );
}

/** The newest post that did not go out: its piece, Try again, and why, in amber. */
function StoppedRow({ line }: { line: ContentLineDto }) {
  const reason = postStoppedWhyOf(line.post);
  return (
    <Press
      className="tz-content-stopped"
      {...routeDoor(pieceRouteOf(line.file.id, true))}
      data-testid="today-content-stopped"
    >
      <span className="tz-content-stopped-head">
        <b>{fileSaidOf(line.file.name)}</b>
        <span className="tz-content-verb">{W.postAgain}</span>
      </span>
      <span className="tz-content-why">{W.didntPost(line.post.place, reason)}</span>
    </Press>
  );
}

/**
 * One of the week's pieces, small, at its own shape; a video says its length. A video's picture is its poster, by Files'
 * tile's rules: none is asked for until the video is ready, and one asked for before the poster was cut is asked for again
 * once Ask has looked at it (its look cuts the poster at the frame it chose), the tile saying it is getting ready meanwhile.
 */
function WeekPiece({ made, asked }: { made: ContentMadeDto; asked: number }) {
  const { file } = made;
  const name = fileSaidOf(file.name);
  const video = file.kind === "video";
  const ready = !video || file.media_status === "ready";
  const failed = file.media_status === "failed";
  const waits = video ? <VideoWaits failed={failed} /> : null;
  return (
    <Press
      className="tz-content-piece"
      {...routeDoor(pieceRouteOf(file.id))}
      data-shape={tileShapeOf(file)}
      aria-label={ready ? name : `${name}: ${videoWaitsOf(failed)}`}
      data-testid="today-content-piece"
    >
      {ready ? <WeekPicture key={file.look_status} fileId={file.id} asked={asked} unseen={waits} /> : waits}
      {video && file.seconds ? (
        <span className="tz-content-length">
          <Icon name="play" size={9} />
          {clockOf(file.seconds)}
        </span>
      ) : null}
    </Press>
  );
}

/** A video being made: its first picture dim, Ask's three at work on it; it opens Being made, where it stands. */
function MakingPiece({ making, asked }: { making: ContentMakingDto; asked: number }) {
  const words = contentMakingSaid(making);
  return (
    <Press
      className="tz-content-piece tz-content-making"
      {...routeDoor(MAKING_ROUTE)}
      data-shape="tall"
      aria-label={`${words.title}: ${words.state}`}
      data-testid="today-content-making"
    >
      {making.first_picture ? <WeekPicture fileId={making.first_picture} asked={asked} /> : null}
      <span className="tz-content-work" aria-hidden="true">
        <Icon name="three" size={26} />
      </span>
    </Press>
  );
}

export function TodayContentNote() {
  // Asked as it is drawn, and again as the day moves: its read is its own, so it never waits for the day's.
  const day = useSurface("today");
  const [today, setToday] = useState<ContentTodayDto | null>(keptContentToday);
  // How many of the card's reads have landed: a picture that did not come is asked for again by the next (WeekPicture).
  const [asked, setAsked] = useState(0);
  const askedAt = useRef<number | null>(null);
  useEffect(() => {
    const now = Date.now();
    if (askedAt.current !== null && now - askedAt.current < MIN_MS) return;
    askedAt.current = now;
    void readContentToday().then((read) => {
      setToday(read);
      setAsked((n) => n + 1);
    });
  }, [day]);
  if (!today || (today.week.length === 0 && today.making.length === 0 && !today.stopped)) return null;
  return (
    <section className="tz-pane tz-content" data-testid="today-content" aria-labelledby="today-content-title">
      <div className="tz-head">
        <h2 className="tz-name" id="today-content-title">
          {W.title}
        </h2>
        {today.ready ? <span className="tz-fact">{W.ready(today.ready)}</span> : null}
        {sectionDoor(CONTENT_ROUTE, W.all, "today-content-open")}
      </div>
      {today.stopped ? <StoppedRow line={today.stopped} /> : null}
      {today.week.length + today.making.length > 0 ? (
        <div className="tz-content-strip">
          {today.week.map((made) => (
            <WeekPiece key={made.file.id} made={made} asked={asked} />
          ))}
          {today.making.map((making) => (
            <MakingPiece key={making.id} making={making} asked={asked} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
