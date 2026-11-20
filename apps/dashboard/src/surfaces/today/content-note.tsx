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
 * posted again (Need you is people and their to-dos, zones/need-you.tsx, and holds no piece).
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
  contentWords,
  TODAY_LINE_WORDS,
  fileSaidOf,
  fileViewOf,
  postStoppedWhyOf,
  type ContentLineDto,
  type ContentTodayDto,
} from "@chanlytics/contracts";
import { routeDoor } from "../frame-verbs";
import { Icon } from "../kit/icon/icon";
import { useSurface } from "../use-surface";
import { askOf, useTodayAsks } from "./calm/asks";
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

/** The week's pieces as one line: how many, the newest by name, its picture; nothing where the week made none. */
function WeekLine({ today }: { today: ContentTodayDto }) {
  const [newest] = today.week;
  const words = contentWords({
    count: today.week.length,
    allVideos: today.week.every((made) => made.file.kind === "video"),
    newest: newest ? fileSaidOf(newest.file.name) : null,
    making: today.making.length,
  });
  if (!words) return null;
  return (
    <CalmRow
      first={
        newest
          ? { face: { initials: "", photo: `${fileViewOf(newest.file.id)}?w=320`, tile: true } }
          : { mark: <Icon name="video" size={14} /> }
      }
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
      ? askOf(
          week.every((made) => made.file.kind === "video")
            ? TODAY_LINE_WORDS.asks.videos
            : TODAY_LINE_WORDS.asks.pieces,
        )
      : null,
  ]);
  if (!today || (today.week.length === 0 && today.making.length === 0 && !today.stopped)) return null;
  return (
    <CalmList label={W.title} testid="today-content">
      {today.stopped ? <StoppedLine line={today.stopped} /> : null}
      <WeekLine today={today} />
    </CalmList>
  );
}
