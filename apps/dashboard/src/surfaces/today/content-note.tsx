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
 * `.tz-content-*` alone: Files' tile and its styles are Content's chunk, which Today does not load.
 *
 * Where the canvas puts a post that did not go out among Need you's rows, it stands here at the card's top: Need you is a walk
 * of people and their to-dos (zones/need-you.tsx), which holds no piece.
 */
import { useEffect, useRef, useState } from "react";
import {
  CONTENT_ROUTE,
  CONTENT_TODAY_WORDS as W,
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
 * A piece's small picture, Files' own small view, loaded as it nears the screen; one that does not come keeps the tile's
 * ground, and the press says the piece's name. Its own, not Files' Picture, which brings Files' sending into Today's chunk.
 */
function WeekPicture({ fileId }: { fileId: string }) {
  const [missed, setMissed] = useState(false);
  if (missed) return <span className="tz-content-unseen" />;
  return (
    <img src={`${fileViewOf(fileId)}?w=320`} alt="" loading="lazy" decoding="async" onError={() => setMissed(true)} />
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

/** One of the week's pieces, small, at its own shape; a video says its length. */
function WeekPiece({ made }: { made: ContentMadeDto }) {
  const name = fileSaidOf(made.file.name);
  return (
    <Press
      className="tz-content-piece"
      {...routeDoor(pieceRouteOf(made.file.id))}
      data-shape={tileShapeOf(made.file)}
      aria-label={name}
      data-testid="today-content-piece"
    >
      <WeekPicture fileId={made.file.id} />
      {made.file.kind === "video" && made.file.seconds ? (
        <span className="tz-content-length">
          <Icon name="play" size={9} />
          {clockOf(made.file.seconds)}
        </span>
      ) : null}
    </Press>
  );
}

/** A video being made: its first picture dim, Ask's three at work on it; it opens Being made, where it stands. */
function MakingPiece({ making }: { making: ContentMakingDto }) {
  const words = contentMakingSaid(making);
  return (
    <Press
      className="tz-content-piece tz-content-making"
      {...routeDoor(MAKING_ROUTE)}
      data-shape="tall"
      aria-label={`${words.title}: ${words.state}`}
      data-testid="today-content-making"
    >
      {making.first_picture ? <WeekPicture fileId={making.first_picture} /> : null}
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
  const askedAt = useRef<number | null>(null);
  useEffect(() => {
    const now = Date.now();
    if (askedAt.current !== null && now - askedAt.current < MIN_MS) return;
    askedAt.current = now;
    void readContentToday().then(setToday);
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
            <WeekPiece key={made.file.id} made={made} />
          ))}
          {today.making.map((making) => (
            <MakingPiece key={making.id} making={making} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
