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
  goesLinesOf,
  goesPillOf,
  personToAskOf,
  type GoesAct,
  type GoesLine,
  type PiecePersonDto,
  type PostDto,
  type PostPlace,
  type TakeDownActionDto,
} from "@chanlytics/contracts";
import { askAbout, canDo } from "../../frame-verbs";
import { fileVerbs } from "../../files/verbs";
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
export interface StandingLead {
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

export function usePieceStanding(
  hands: PieceHands,
  posts: readonly PostDto[],
  presses: Pick<PiecePresses, "busy" | "pull">,
  drafts: PieceDrafts,
) {
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
  // While a line moves by itself, the piece is read again every few seconds: its line says each step as it is reached.
  const moving = lines.some((line) => line.moving);
  const rereadRecord = record.reread;
  useEffect(() => {
    if (!moving) return undefined;
    const timer = setInterval(() => {
      rereadRecord();
      reread();
    }, MOVING_READ_MS);
    return () => clearInterval(timer);
  }, [moving, rereadRecord, reread]);
  /** A press through one of Files' verbs: refused, it says why; either way the piece is read again. */
  const run = async (press: Promise<{ ok: true } | { ok: false; message: string }>, said?: string) => {
    setOut(true);
    const answer = await press;
    setOut(false);
    if (!answer.ok) flash({ tone: "danger", msg: <>{answer.message}</> });
    else if (said) flash({ msg: <>{said}</> });
    again();
  };
  const busy = out || presses.busy;
  const about = drafts.about;
  const both = drafts.both;
  const openList = () => {
    if (!both.open) both.begin();
  };
  const goes: GoesPresses = {
    busy,
    about,
    move: (postId) => {
      openList();
      both.moveTime(postId);
    },
    pull: presses.pull,
    askPerson: (person) => setAsking({ person, ads: false }),
    approve: openList,
    words: () => {
      openList();
      focusCaption();
    },
    deleted: (postId) => void run(fileVerbs.deletedByHand(file.id, postId)),
  };
  const said = (person: PiecePersonDto, answer: PersonSaid) => {
    const body =
      answer.said === "yes"
        ? {
            subject_id: person.id,
            uses: person.asked?.uses.length ? person.asked.uses : (["post"] as const).slice(),
            said_in: answer.saidIn,
            ...(answer.messageId ? { message_id: answer.messageId } : {}),
          }
        : { subject_id: person.id, said: answer.said };
    void run(fileVerbs.personSaid(file.id, body));
  };
  const who: WhoPresses = {
    busy,
    may,
    mayName,
    about,
    piece: fileSaidOf(file.name),
    askPerson: (person) => setAsking({ person, ads: false }),
    said,
    noOne: () => void run(fileVerbs.sayWhoIsIn(file.id, "none")),
  };
  const places: PostPlace[] = [
    ...(record.instagram !== null ? (["instagram"] as const) : []),
    ...(record.connected ? (["google"] as const) : []),
  ];
  const adActions: TakeDownActionDto[] = record.takeDown?.actions.filter((a) => a.target === "ad") ?? [];
  // A take-down a place has not answered yet: the press is not offered twice.
  const asksDown = record.takeDown?.actions.some((a) => a.act === "take_down" && a.outcome === "pending") ?? false;
  const sheets: ReactNode = aiMade ? (
    <>
      <AskPerson
        person={asking?.person ?? null}
        adsFirst={asking?.ads ?? false}
        piece={{ id: file.id, name: fileSaidOf(file.name), what: pieceWhatOf(file), places }}
        onClose={() => setAsking(null)}
        onAsked={(person) => {
          flash({ msg: <>{PERSON_ASK_WORDS.sent(person.name)}</> });
          again();
        }}
      />
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
    </>
  ) : null;
  return {
    lines,
    /** The piece's one status from its lines; null where it has no placement yet, and its usual status says it. */
    pill: goesPillOf(lines),
    lead: may ? standingLeadOf(lines, goes) : null,
    goes,
    who,
    people: aiMade ? record.people : null,
    /** How many people the look counted in the file, where it counted any. */
    seen: file.people?.count ?? null,
    clock,
    /** The ads a take-down paused, for its receipt. */
    adActions,
    /** Take down, where something of it is up and this person may: opens its card. Null where it is not offered. */
    takeDown: may && aiMade && takeDownOffered(posts) && !asksDown ? () => setTakingDown(true) : null,
    /** The person an ad waits for, and the ask that names ads too (Run as an ad's reason). */
    askForAds: (): PiecePersonDto | null => personToAskOf(record.people, "ad"),
    askPersonForAds: (person: PiecePersonDto) => setAsking({ person, ads: true }),
    sheets,
  };
}

export type PieceStanding = ReturnType<typeof usePieceStanding>;
