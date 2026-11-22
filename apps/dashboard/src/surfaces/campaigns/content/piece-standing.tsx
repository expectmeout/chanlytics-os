/**
 * Where an open piece stands beyond its composer (the journey canvas, board Piece; the content loop PRD's 8.2, 8.3 and
 * 21.3): its placements' lines and the one status they come to, who is in it, the ask a person is sent, and its
 * take-down. One hook the phone's viewer and the desk's pane both read (piece.tsx), so the two say the same thing and do
 * the same thing. What each line says is contracts' (content/goes.ts, piece-people.ts, take-down.ts); the presses are
 * Files' own verbs, and each one that changes something reads the piece and the page again.
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  PERSON_ASK_WORDS,
  PIECE_PEOPLE_WORDS,
  SECOND_MS,
  TAKE_DOWN_WORDS,
  fileSaidOf,
  personToAskOf,
  type PiecePersonDto,
  type PieceTakeDownDto,
  type PostDto,
  type PostPlace,
} from "@chanlytics/contracts";
import { goesLinesOf, goesPillOf, type GoesAct, type GoesLine } from "./model/goes";
import { askAbout, canDo } from "../../frame-verbs";
import { keepPersonAnswer, markDeletedByHand, sayWhoIsIn, type PersonAnswer } from "@/bridge/verbs/pieces";
import type { PieceStanding } from "./model/standing";
import type { PieceHands, PiecePresses, usePieceDrafts } from "./piece-presses";
import { AskPerson } from "./viewer/ask-person";
import { viewerClockOf } from "./viewer/clock";
import type { GoesPresses } from "./viewer/goes";
import type { PersonSaid, WhoPresses } from "./viewer/people";
import { TakeDownAsk, takeDownOffered } from "./viewer/take-down";

type PieceDrafts = ReturnType<typeof usePieceDrafts>;

/** How often a piece is read again while one of its lines is moving (a send, a take-down the place has not answered). */
const MOVING_READ_MS = 5 * SECOND_MS;

/** The coral act a line that needs the owner leads with, in place of the piece's usual next step. */
interface StandingLead {
  words: string;
  press: () => void;
}

/** What a made piece is called in an ask: "the 15-second video", "the picture". */
const pieceWhatOf = (file: { kind: string; seconds: number | null }): string =>
  file.kind === "video" ? (file.seconds ? `the ${Math.round(file.seconds)}-second video` : "the video") : "the picture";

/** The caption's box, where the piece's words are typed: Change the words takes the keys there. */
const focusCaption = (): void => {
  requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="cnv-caption-box"]')?.focus());
};

/** What an act does when it leads: the same press its line offers. */
function leadPressOf(act: GoesAct, on: GoesPresses): StandingLead | null {
  if (act.is === "ask_person")
    return { words: PIECE_PEOPLE_WORDS.ask(act.person.name), press: () => on.askPerson(act.person) };
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

/** What a person answered, as PATCH files/[id]/people takes it: a yes for what they were asked about, a no, or a yes let go. */
function personAnswerOf(person: PiecePersonDto, answer: PersonSaid): PersonAnswer {
  if (answer.said !== "yes") return { subject_id: person.id, said: answer.said };
  return {
    subject_id: person.id,
    uses: person.asked?.uses.length ? person.asked.uses : ["post"],
    said_in: answer.saidIn,
    ...(answer.messageId ? { message_id: answer.messageId } : {}),
  };
}

/** Where a piece's take-down stands: still open (a place asked, or the owner's to finish), and whether a place is yet to answer. */
function takeDownStandsOf(takeDown: PieceTakeDownDto | null): { open: boolean; asking: boolean } {
  const actions = takeDown?.actions.filter((a) => a.act === "take_down") ?? [];
  return {
    open: actions.some((a) => a.outcome !== "done"),
    asking: actions.some((a) => a.outcome === "pending"),
  };
}

/** The two sheets a piece opens over itself: the ask a person is sent, and Take down's card. */
function StandingSheets(props: {
  file: { id: string; name: string; kind: string; seconds: number | null };
  places: readonly PostPlace[];
  posts: readonly PostDto[];
  asking: { person: PiecePersonDto; ads: boolean } | null;
  takingDown: boolean;
  onAskClosed: () => void;
  onAsked: (person: PiecePersonDto) => void;
  onTakeDownClosed: () => void;
  onTakeDownBegun: () => void;
}) {
  const { file, asking } = props;
  const name = fileSaidOf(file.name);
  return (
    <>
      <AskPerson
        person={asking?.person ?? null}
        adsFirst={asking?.ads ?? false}
        piece={{ id: file.id, name, what: pieceWhatOf(file), places: props.places }}
        onClose={props.onAskClosed}
        onAsked={props.onAsked}
      />
      <TakeDownAsk
        open={props.takingDown}
        piece={{ id: file.id, name }}
        posts={props.posts}
        onClose={props.onTakeDownClosed}
        onBegun={props.onTakeDownBegun}
      />
    </>
  );
}

export function usePieceStanding(
  hands: PieceHands,
  posts: readonly PostDto[],
  presses: Pick<PiecePresses, "busy" | "pull">,
  drafts: PieceDrafts,
): PieceStanding {
  const { made, record, reread, flash } = hands;
  const { file } = made;
  const [asking, setAsking] = useState<{ person: PiecePersonDto; ads: boolean } | null>(null);
  const [takingDown, setTakingDown] = useState(false);
  const [out, setOut] = useState(false);
  const clock = viewerClockOf();
  const may = canDo("settings");
  const mayName = canDo("add_files");
  const aiMade = file.source === "made";
  const lines = aiMade
    ? goesLinesOf(posts, {
        people: record.people,
        takeDown: record.takeDown,
        when: clock.ahead,
        nowMs: Date.now(),
        may,
      })
    : [];
  const again = () => {
    record.reread();
    reread();
  };
  useRereadWhileMoving(
    lines.some((line) => line.moving),
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
    askPerson: (person) => setAsking({ person, ads: false }),
    approve: openList,
    words: () => {
      openToRead();
      focusCaption();
    },
    deleted: (postId) => void run(markDeletedByHand(file.id, postId)),
  };
  const answered = (person: PiecePersonDto, answer: PersonSaid) =>
    void run(keepPersonAnswer(file.id, personAnswerOf(person, answer)));
  const whoPresses: WhoPresses = {
    busy,
    may,
    mayName,
    about,
    piece: fileSaidOf(file.name),
    askPerson: (person) => setAsking({ person, ads: false }),
    said: answered,
    noOne: () => void run(sayWhoIsIn(file.id, "none")),
  };
  const places: PostPlace[] = [
    ...(record.instagram !== null ? (["instagram"] as const) : []),
    ...(record.connected ? (["google"] as const) : []),
  ];
  // While a take-down is open nothing new is offered to go up; while a place is yet to answer, the press is not offered twice.
  const down = takeDownStandsOf(record.takeDown);
  const sheets: ReactNode = aiMade ? (
    <StandingSheets
      file={file}
      places={places}
      posts={posts}
      asking={asking}
      takingDown={takingDown}
      onAskClosed={() => setAsking(null)}
      onAsked={(person) => {
        flash({ msg: <>{PERSON_ASK_WORDS.sent(person.name)}</> });
        again();
      }}
      onTakeDownClosed={() => setTakingDown(false)}
      onTakeDownBegun={() => {
        flash({ msg: <>{TAKE_DOWN_WORDS.begun}</> });
        again();
      }}
    />
  ) : null;
  return {
    lines,
    /** The piece's one status from its lines; null where it has no placement yet, and its usual status says it. */
    pill: goesPillOf(lines),
    lead: may ? standingLeadOf(lines, goes) : null,
    /**
     * Whether the list opens to be read, with nothing switched on: a line needs the owner for something another post
     * would not mend. Look again and Try again are the ones a post does mend, and they arm its place as before.
     */
    opensToRead:
      lines.some((line) => line.tone === "you" && line.acts[0]?.is !== "approve") ||
      // After a take-down, or while nobody is sure who is in it, nothing is armed to go up by opening the list.
      down.open ||
      posts.some((p) => p.status === "taken_down") ||
      record.people?.state === "unsure",
    /** A take-down is under way or waits for the owner: nothing leads with a new post meanwhile. */
    holdsLead: down.open,
    goes,
    who: whoPresses,
    people: aiMade ? record.people : null,
    /** How many people the look counted in the file, where it counted any. */
    seen: file.people?.count ?? null,
    clock,
    /** Take down, where something of it is up and this person may: opens its card. Null where it is not offered. */
    takeDown: may && aiMade && takeDownOffered(posts) && !down.asking ? () => setTakingDown(true) : null,
    /** The person an ad waits for, and the ask that names ads too (Run as an ad's reason). */
    askForAds: (): PiecePersonDto | null => personToAskOf(record.people, "ad"),
    askPersonForAds: (person: PiecePersonDto) => setAsking({ person, ads: true }),
    sheets,
  };
}
