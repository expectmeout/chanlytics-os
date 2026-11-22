/**
 * Content on Today, one line (Today, calm, 19 Nov 2026, D2; it was a card with the week's pieces in a strip): how many
 * pieces the week made, the newest by its name under it, and the newest one's picture at the line's start; the whole line
 * opens Content, where the strip of them stands. From its own small read (GET content/note, contracts content/note.ts),
 * and only where there is something to say: a business with nothing made this week and nothing being made is not told
 * about Content each morning. Its read is its own module (content-note-read.ts), which Today's first draw waits for where
 * the tab opens on Today holding none; kept in the tab by workspace, so a return draws it at once and reads again behind
 * it, at most once a minute as the day moves. A read that fails or is refused takes the line away: it claims nothing it
 * could not read.
 *
 * The newest post that did not go out is a line of its own over it, with why, and opens the piece's sheet, where it is
 * posted again (Need you is people and their to-dos, zones/need-you.tsx, and holds no piece). A take-down still open
 * is a line too (the content loop's pass 1b): a post its place left to the owner to delete, in amber, or one its place
 * has not answered about in a day, which asks nothing of them. Each opens the piece at its lines.
 *
 * A picture is the kit's face, as a tile: one that does not load stands aside (a video whose poster is not cut yet), and
 * the line's words say the rest.
 */
import { useEffect, useRef, useState } from "react";
import {
  CONTENT_ROUTE,
  CONTENT_TODAY_WORDS as W,
  MIN_MS,
  contentRouteOf,
  fileSaidOf,
  fileViewOf,
  postStoppedWhyOf,
  type ContentDownDto,
  type ContentLineDto,
  type ContentTodayDto,
} from "@chanlytics/contracts";
import { routeDoor } from "../frame-verbs";
import { TODAY_LINE_WORDS, contentWords } from "./model/lines";
import { Icon } from "../kit/icon/icon";
import { useSurface } from "../use-surface";
import { todayAskOf, useTodayAsks } from "./calm/asks";
import { CalmList, CalmRow } from "./calm/lines";
import { keptContentToday, readContentToday } from "./content-note-read";

/** A piece where it did not post: in Needs you and straight to its sheet (Post it), as the page's amber line opens it. */
const stoppedRouteOf = (fileId: string): string =>
  contentRouteOf({ list: "made", view: "needs", open: fileId, post: true });

/** The newest post that did not go out: the piece by its name, and why under it; it opens the piece's sheet. */
function StoppedLine({ line }: { line: ContentLineDto }) {
  return (
    <CalmRow
      first={{ mark: <Icon name="alert" size={14} /> }}
      name={fileSaidOf(line.file.name)}
      said={<span data-tone="warn">{W.didntPost(line.post.place, postStoppedWhyOf(line.post))}</span>}
      door={routeDoor(stoppedRouteOf(line.file.id))}
      testid="today-content-stopped"
    />
  );
}

/** A take-down still open: the piece by its name and picture, and what its place left undone; it opens the piece's lines. */
function DownLine({ down }: { down: ContentDownDto }) {
  return (
    <CalmRow
      first={{
        face: { glyph: <Icon name="image" size={14} />, photo: `${fileViewOf(down.file.id)}?w=320`, tile: true },
      }}
      name={fileSaidOf(down.file.name)}
      said={<span data-tone={down.is === "by_hand" ? "warn" : undefined}>{W.down(down)}</span>}
      door={routeDoor(contentRouteOf({ list: "made", view: "all", open: down.file.id, post: true }))}
      testid={`today-content-down-${down.is}`}
    />
  );
}

/**
 * The newest piece's face: its picture where there is one to ask for, over the mark of what it is, which stands where the
 * picture does not come. A video is asked for its picture only once the platform has made it ready, never one it could
 * not read (17 Nov 2026: four videos Ask made stood black tiles on Today while Content showed them).
 */
function newestFace(newest: ContentTodayDto["week"][number] | undefined) {
  if (!newest) return { mark: <Icon name="video" size={14} /> };
  const video = newest.file.kind === "video";
  const ready = !video || newest.file.media_status === "ready";
  return {
    face: {
      glyph: <Icon name={video ? "video" : "image"} size={14} />,
      ...(ready ? { photo: `${fileViewOf(newest.file.id)}?w=320` } : {}),
      tile: true,
    },
  };
}

function WeekLine({ today }: { today: ContentTodayDto }) {
  const [newest] = today.week;
  const words = contentWords({
    count: today.week.length,
    allVideos: today.week.every((piece) => piece.file.kind === "video"),
    newest: newest ? fileSaidOf(newest.file.name) : null,
    making: today.making.length,
  });
  if (!words) return null;
  return (
    <CalmRow
      first={newestFace(newest)}
      name={words.title}
      said={words.sub ?? undefined}
      door={routeDoor(CONTENT_ROUTE)}
      testid="today-content-line"
    />
  );
}

export function TodayContentLine() {
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
  // AI is handed the week's question where the week made something to post (D10).
  const week = today?.week ?? [];
  useTodayAsks("content", [
    week.length
      ? todayAskOf(
          week.every((piece) => piece.file.kind === "video")
            ? TODAY_LINE_WORDS.asks.videos
            : TODAY_LINE_WORDS.asks.pieces,
        )
      : null,
  ]);
  if (!today) return null;
  const downs = today.down ?? [];
  if (today.week.length === 0 && today.making.length === 0 && !today.stopped && downs.length === 0) return null;
  return (
    <CalmList label={W.title} testid="today-content">
      {today.stopped ? <StoppedLine line={today.stopped} /> : null}
      {downs.map((down) => (
        <DownLine key={`${down.file.id}:${down.is}`} down={down} />
      ))}
      {/* Drawn afresh as the newest piece moves: a poster the look cut since is asked for again (a picture that did not
          come stands aside for good where it was drawn). */}
      <WeekLine
        key={`${today.week[0]?.file.id}:${today.week[0]?.file.media_status}:${today.week[0]?.file.look_status}`}
        today={today}
      />
    </CalmList>
  );
}
