/**
 * Where an open piece stands beyond its composer (the journey canvas, board Piece; the content loop PRD's 8.2, 8.3 and
 * 21.3): its placements' lines and the one status they come to, and its take-down. One hook the phone's viewer and the
 * desk's pane both read (piece.tsx), so the two say the same thing and do the same thing. What each line says is the
 * model's and contracts' (model/goes.ts, contracts take-down.ts); the presses are Files' own verbs, and each one that
 * changes something reads the piece and the page again.
 */
import { useEffect, useState, type ReactNode } from "react";
import { SECOND_MS, TAKE_DOWN_WORDS, fileSaidOf, type PostDto } from "@chanlytics/contracts";
import { goesLinesOf, goesPillOf, takeDownOffered, takeDownStandsOf, type GoesAct, type GoesLine } from "./model/goes";
import { askAbout, canDo } from "../../frame-verbs";
import { keepPostUp, markDeletedByHand, pressPieceVersion } from "@/bridge/verbs/pieces";
import { versionStandingOf, type VersionStanding } from "./model/version";
import type { PieceStanding } from "./model/standing";
import type { PieceHands, PiecePresses, usePieceDrafts } from "./piece-presses";
import { viewerClockOf } from "./viewer/clock";
import type { GoesPresses } from "./viewer/goes";
import { TakeDownAsk } from "./viewer/take-down";

type PieceDrafts = ReturnType<typeof usePieceDrafts>;

/** How often a piece is read again while one of its lines is moving (a send, a take-down the place has not answered). */
const MOVING_READ_MS = 5 * SECOND_MS;

/** The coral act a line that needs the owner leads with, in place of the piece's usual next step. */
interface StandingLead {
  words: string;
  press: () => void;
}

/** The caption's box, where the piece's words are typed: Change the words takes the keys there. */
const focusCaption = (): void => {
  requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="cnv-caption-box"]')?.focus());
};

/** What an act does when it leads: the same press its line offers. */
function leadPressOf(act: GoesAct, on: GoesPresses): StandingLead | null {
  if (act.is === "approve") return { words: act.says, press: on.approve };
  if (act.is === "words") return { words: act.says, press: on.words };
  if (act.is === "tell_ai")
    return { words: act.says, press: () => askAbout({ about: on.about, prompt: act.prompt, fresh: true }) };
  return null;
}

/** The act that leads: the first fix of the first line that needs the owner. */
function standingLeadOf(lines: readonly GoesLine[], on: GoesPresses): StandingLead | null {
  const needs = lines.find((line) => line.tone === "you");
  const first = needs?.acts[0];
  return first ? leadPressOf(first, on) : null;
}

/** While a line moves by itself, the piece is read again every few seconds: its line says each step as it is reached. */
function useRereadWhileMoving(moving: boolean, rereadRecord: () => void, rereadPage: () => void): void {
  useEffect(() => {
    if (!moving) return undefined;
    const timer = setInterval(() => {
      rereadRecord();
      rereadPage();
    }, MOVING_READ_MS);
    return () => clearInterval(timer);
  }, [moving, rereadRecord, rereadPage]);
}

export function usePieceStanding(
  hands: PieceHands,
  posts: readonly PostDto[],
  presses: Pick<PiecePresses, "busy" | "pull">,
  drafts: PieceDrafts,
): PieceStanding {
  const { made, record, reread, flash } = hands;
  const { file } = made;
  const [takingDown, setTakingDown] = useState(false);
  const [out, setOut] = useState(false);
  const clock = viewerClockOf();
  const may = canDo("settings");
  const aiMade = file.source === "made";
  // Its versions (00708): a post that waits on one says so on its line, in place of its time.
  const version = aiMade
    ? versionStandingOf(record.version, posts, file.id, clock.ahead)
    : versionStandingOf(null, [], "", clock.ahead);
  const lines = aiMade
    ? linesWithVersion(
        goesLinesOf(posts, { takeDown: record.takeDown, when: clock.ahead, nowMs: Date.now(), may }),
        version,
      )
    : [];
  const again = () => {
    record.reread();
    reread();
  };
  useRereadWhileMoving(
    // A version being made is read again as a line moving is: its frame says each step, and it asks once it is made.
    lines.some((line) => line.moving) || version.making !== null,
    record.reread,
    reread,
  );
  /** A press through one of Files' verbs: refused, it says why; either way the piece is read again. */
  const run = async (press: Promise<{ ok: true } | { ok: false; message: string }>, flashed?: string) => {
    setOut(true);
    const answer = await press;
    setOut(false);
    if (!answer.ok) flash({ tone: "danger", msg: <>{answer.message}</> });
    else if (flashed) flash({ msg: <>{flashed}</> });
    again();
  };
  const busy = out || presses.busy;
  const about = drafts.about;
  const both = drafts.both;
  const openList = () => {
    if (!both.open) both.begin();
  };
  const openToRead = () => {
    if (!both.open) both.look();
  };
  const goes: GoesPresses = {
    busy,
    about,
    move: (postId) => {
      openToRead();
      both.moveTime(postId);
    },
    pull: presses.pull,
    approve: openList,
    words: () => {
      openToRead();
      focusCaption();
    },
    deleted: (postId) => void run(markDeletedByHand(file.id, postId)),
    // Keep it up acts at once, with no card: nothing changes at the place, and the line says who kept it (Piece 34).
    keep: (postId) => void run(keepPostUp(file.id, postId)),
  };
  // While a take-down is open nothing new is offered to go up; while a place is yet to answer, the press is not offered twice.
  const down = takeDownStandsOf(record.takeDown);
  const sheets: ReactNode = aiMade ? (
    <TakeDownAsk
      open={takingDown}
      piece={{ id: file.id, name: fileSaidOf(file.name) }}
      posts={posts}
      onClose={() => setTakingDown(false)}
      onBegun={() => {
        flash({ msg: <>{TAKE_DOWN_WORDS.begun}</> });
        again();
      }}
    />
  ) : null;
  const versionLead =
    may && version.lead
      ? {
          words: version.lead.words,
          press: () => void run(pressPieceVersion(file.id, version.lead?.is === "again" ? "again" : "approve")),
        }
      : null;
  return {
    lines,
    /** The piece's one status from its lines; null where it has no placement yet, and its usual status says it. */
    pill: version.pill ? { ...version.pill, moving: false } : goesPillOf(lines),
    lead: versionLead ?? (may ? standingLeadOf(lines, goes) : null),
    /**
     * Whether the list opens to be read, with nothing switched on: a line needs the owner for something another post
     * would not mend. Look again and Try again are the ones a post does mend, and they arm its place as before.
     */
    opensToRead:
      lines.some((line) => line.tone === "you" && line.acts[0]?.is !== "approve") ||
      // After a take-down nothing is armed to go up by opening the list.
      down.open ||
      posts.some((p) => p.status === "taken_down"),
    /** A take-down is under way or waits for the owner: nothing leads with a new post meanwhile. */
    holdsLead: down.open,
    goes,
    clock,
    /** Take down, where something of it is up and this person may: opens its card. Null where it is not offered. */
    takeDown: may && aiMade && takeDownOffered(posts, Date.now()) && !down.asking ? () => setTakingDown(true) : null,
    sheets,
    results: { fileId: file.id, upPostId: aiMade ? (posts.find((p) => p.published_at)?.id ?? null) : null },
    version: { ...version, instead: (fileId) => void run(pressPieceVersion(fileId, "approve")) },
  };
}

/** Each line of a post that waits on a version says so (the version board, cells 1 and 4), its tone the version's. */
function linesWithVersion(lines: GoesLine[], version: VersionStanding): GoesLine[] {
  if (version.lines.size === 0) return lines;
  return lines.map((line) => {
    const said = version.lines.get(line.key);
    if (!said) return line;
    return { ...line, said, tone: version.making ? "live" : "you", status: null, moving: false };
  });
}
