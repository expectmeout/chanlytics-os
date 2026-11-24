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
  CONTENT_WEEK_ROUTE,
  WEEK_WORDS,
  CONTENT_WORDS,
  REVIEW_ASK_WORDS,
  reviewAskLineOf,
  MIN_MS,
  clockNear,
  clockTime,
  contentRouteOf,
  fileSaidOf,
  fileViewOf,
  postStoppedWhyOf,
  type ContentDownDto,
  type ContentLineDto,
  type ContentTodayDto,
} from "@chanlytics/contracts";
import { pageClock } from "@/bridge/zone";
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
 * A post set to go that waits for a new version's approval (the version board, cell 5): the piece by its name and its new
 * version's picture, "Approve version 2 · goes up Tue, 6:00 PM" in amber; it opens the piece, where that press leads.
 */
function VersionLine({ version }: { version: NonNullable<ContentTodayDto["version"]> }) {
  const zone = pageClock().zone();
  const atMs = Date.parse(version.at);
  const at = CONTENT_WORDS.viewer.at(clockNear(atMs, zone, Date.now()), clockTime(atMs, zone));
  return (
    <CalmRow
      first={{
        face: { glyph: <Icon name="video" size={14} />, photo: `${fileViewOf(version.file.id)}?w=320`, tile: true },
      }}
      name={fileSaidOf(version.file.name)}
      said={<span data-tone="warn">{W.versionWaits(version.n, at)}</span>}
      door={routeDoor(contentRouteOf({ list: "made", view: "all", open: version.file.id }))}
      testid="today-content-version"
    />
  );
}

/**
 * The week's points (00706; the approved boards, Today 1 and the pass 3 rows): the week ready to approve, its size and
 * days under it, what AI asks to be filmed, and the plan's proposal to ask every client for a review (pass 6; the canvas's
 * Loop4). Each opens the Week, where it is approved, added or opened; Today approves nothing.
 */
function PlanLines({ plan }: { plan: NonNullable<ContentTodayDto["plan"]> }) {
  return (
    <>
      {plan.ready ? (
        <CalmRow
          first={{ mark: <Icon name="video" size={14} /> }}
          // Held to its time (00712, board B5): the week goes up by itself unless the owner stops it on the Week.
          name={plan.ready.held ? WEEK_WORDS.todayHeld(plan.ready.held) : WEEK_WORDS.todayReady}
          said={`${plan.ready.size} · ${plan.ready.days}`}
          door={routeDoor(CONTENT_WEEK_ROUTE)}
          testid="today-week-ready"
        />
      ) : null}
      {plan.film.length ? (
        <CalmRow
          first={{ mark: <Icon name="video" size={14} /> }}
          name={WEEK_WORDS.todayFilm(plan.film.length)}
          said={plan.film.join(" · ")}
          door={routeDoor(CONTENT_WEEK_ROUTE)}
          testid="today-week-film"
        />
      ) : null}
      {plan.review_ask ? (
        <CalmRow
          first={{ mark: <Icon name="star" size={14} /> }}
          name={REVIEW_ASK_WORDS.title}
          said={reviewAskLineOf(plan.review_ask)}
          door={routeDoor(CONTENT_WEEK_ROUTE)}
          testid="today-week-review-ask"
        />
      ) : null}
    </>
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
  const plan = today.plan ?? null;
  const version = today.version ?? null;
  // A post held as changed while a new version waits is said once, as that version (its file is the older version's).
  const stopped = version && today.stopped?.post.held_why === "changed" ? null : today.stopped;
  if (today.week.length === 0 && today.making.length === 0 && !stopped && downs.length === 0 && !plan && !version)
    return null;
  return (
    <CalmList label={W.title} testid="today-content">
      {plan ? <PlanLines plan={plan} /> : null}
      {version ? <VersionLine version={version} /> : null}
      {stopped ? <StoppedLine line={stopped} /> : null}
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
