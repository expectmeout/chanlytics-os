/**
 * A video's card (decision 0122; the content canvas's "Asking for it" and "Every state a piece can be in").
 *
 * Before the press it shows the video's stills: the first frame of each moment with the opening words where the video will show
 * them, drawn by the server from the same plan the press sends, each a still of its own on a strip moved along sideways. One
 * press, Make it. A plan the server refuses says why in the stills' place, and cannot be pressed.
 *
 * Once pressed it follows the video's own row (GET files/video/[id]) and says where it stands, in the canvas's states: the first
 * still dim under Ask's three in coral while it is made, the video itself coming to full strength when it lands, Ask looking at
 * it before the owner does, ready with Open, or not made and why with Try again. Coral is the one sign of work; what needs the
 * owner is amber and still. Only opacity moves, on the app's own durations, and nothing moves under reduced motion (ask.css).
 */
import { useEffect, useState } from "react";
import {
  SECOND_MS,
  fileViewOf,
  piecePlanOf,
  pieceStandsOf,
  pieceStillMoving,
  pieceWordsIn,
  type AskProposal,
  type PieceFollowedDto,
  type PieceStands,
} from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Icon } from "../kit/icon/icon";
import { StatePill } from "../kit/pill/state-pill";
import { openFile } from "../files/file-asked";
import { fileVerbs } from "../files/verbs";
import type { LineWords } from "./words";

/** What the stills' read came to, and the plan it was the answer to: a card reused for another plan never shows the last one's. */
type Stills = { key: string; picture: string | null; refused: string | null };

/** A video's row is read again every two seconds while it is drawn, slower once that has gone on, and slower still while it waits on a clip. */
const FOLLOW_EVERY_MS = 2 * SECOND_MS;
const FOLLOW_SLOWER_MS = 8 * SECOND_MS;
const FOLLOW_WAITING_MS = 20 * SECOND_MS;
const READS_QUICK = 60;
/** Then it stops asking: the bell says when the video lands, and the card reads it again when it is next drawn. */
const READS_AT_MOST = 240;

/**
 * What was read of a video asked for: its row, null where it is gone (a 404: its row goes with its file), or undefined where no
 * read has come yet (a line that dropped is no answer). `of` names the press it was read for.
 */
type Followed = { of: string; read: PieceFollowedDto | null | undefined; times: number };

/** What was read for this press, and what it says: where the video stands, and whether and how soon it is read again. */
function followedNow(followed: Followed | null, of: string | null) {
  const mine = followed !== null && followed.of === of ? followed : null;
  // Nothing read yet says nothing of the video: the card's own receipt stands until a read comes.
  const stands = mine !== null && mine.read !== undefined ? pieceStandsOf(mine.read) : null;
  return {
    stands,
    moving: stands === null || pieceStillMoving(stands),
    times: mine?.times ?? 0,
    waitingOnClip: stands?.is === "making" && stands.stage === "waiting_clip",
  };
}

/** How long until the next read: at once the first time, then every two seconds, slower once that has gone on or while it waits on a clip. */
const followWaitOf = (times: number, waitingOnClip: boolean): number => {
  if (times === 0) return 0;
  if (waitingOnClip) return FOLLOW_WAITING_MS;
  return times < READS_QUICK ? FOLLOW_EVERY_MS : FOLLOW_SLOWER_MS;
};

/** A read's answer, kept: gone with its file is an answer; a line that dropped is none, and what was last read stands until the next. */
function followedAfter(
  was: Followed | null,
  of: string,
  answer: Awaited<ReturnType<typeof fileVerbs.piece>>,
  times: number,
): Followed {
  const last = was !== null && was.of === of ? was.read : undefined;
  if (answer.ok) return { of, read: answer.data, times: times + 1 };
  return { of, read: answer.status === 404 ? null : last, times: times + 1 };
}

/**
 * The video's own row, read while it is still moving (being made, or made and being looked at). `pressed` is when its card was
 * last pressed: a second try of the same video is read afresh.
 */
function usePieceFollowed(pieceId: string | null, pressed: number): PieceStands | null {
  const of = pieceId === null ? null : `${pieceId}:${pressed}`;
  const [followed, setFollowed] = useState<Followed | null>(null);
  const { stands, moving, times, waitingOnClip } = followedNow(followed, of);
  useEffect(() => {
    if (pieceId === null || of === null || !moving || times >= READS_AT_MOST) return undefined;
    let live = true;
    const timer = setTimeout(
      () => {
        void fileVerbs.piece(pieceId).then((answer) => {
          if (live) setFollowed((was) => followedAfter(was, of, answer, times));
        });
      },
      followWaitOf(times, waitingOnClip),
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [pieceId, of, moving, times, waitingOnClip]);
  return stands;
}

/** The plan's stills, drawn by the server: asked for while the card is still to be pressed, and while a video being made or not made needs its first one. */
function usePieceStills(key: string | null, wanted: boolean, proposal: AskProposal): Stills | null {
  const [stills, setStills] = useState<Stills | null>(null);
  const held = stills !== null && stills.key === key;
  useEffect(() => {
    if (key === null || !wanted || held) return undefined;
    const stop = new AbortController();
    void fileVerbs.pieceBoard(piecePlanOf(proposal.payload), stop.signal).then((board) => {
      if (stop.signal.aborted) return;
      setStills(
        board.ok
          ? { key, picture: URL.createObjectURL(board.picture), refused: null }
          : { key, picture: null, refused: board.refused },
      );
    });
    return () => stop.abort();
    // What is asked is the key's: the payload is read only as it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wanted, held]);
  return held ? stills : null;
}

/**
 * What a video's card holds for its AskCard: its stills, where its video stands once pressed, and whether its press may go.
 * Null for any other kind of card. `madeId` is the video the card's press began, and `pressed` when.
 */
export function usePieceCard(proposal: AskProposal, words: LineWords, madeId: string | null, pressed: number) {
  const isPiece = proposal.kind === "piece";
  const plan = piecePlanOf(proposal.payload);
  const key = isPiece ? JSON.stringify(plan) : null;
  const stands = usePieceFollowed(isPiece ? madeId : null, pressed);
  // A video that landed shows itself; one still to be pressed, being made or not made shows the plan's first still.
  const wantsStills = madeId === null || (stands !== null && (stands.is === "making" || stands.is === "failed"));
  const stills = usePieceStills(key, wantsStills, proposal);
  if (!isPiece) return null;
  return {
    says: pieceWordsIn(plan.language),
    moments: plan.cuts.length,
    picture: stills?.picture ?? null,
    refused: stills?.refused ?? null,
    waiting: stills === null,
    stands,
    press: { label: words.press("make", null), disabled: !!stills?.refused },
  };
}

type PieceCard = NonNullable<ReturnType<typeof usePieceCard>>;

/** One still: the plan's own picture, shown at its place in the strip (ask.css slices it by the still's number). */
const Still = ({ picture }: { picture: string }) => (
  <span className="ask-piece-still">
    <img className="ask-piece-slice" src={picture} alt="" />
  </span>
);

/** Ask's three in coral over a still: the one sign that something is being worked on. */
const Working = () => (
  <span className="ask-piece-working" aria-hidden="true">
    <Icon name="three" size={26} />
  </span>
);

/** The stills before the press: the strip, Ask drawing it, or why the plan can't be drawn. */
function PieceStills({ card, t }: { card: PieceCard; t: LineWords }) {
  if (card.picture) {
    const picture = card.picture;
    return (
      // The stills run wider than the card, each large enough to judge where the words sit: the strip is moved along sideways.
      <div
        className="ask-piece-stills"
        role="group"
        aria-label={card.says.boardSaid}
        // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a focus stop, so a keyboard can move along stills that run wider than the card
        tabIndex={0}
        data-testid="ask-piece-stills"
      >
        {Array.from({ length: card.moments }, (_, i) => (
          <Still key={i} picture={picture} />
        ))}
      </div>
    );
  }
  if (card.waiting)
    return (
      <div className="ask-piece-stills" role="img" aria-label={t.postDrawing} data-testid="ask-piece-drawing">
        <span className="ask-piece-still" data-dim="">
          <Working />
        </span>
      </div>
    );
  return (
    <p className="ask-card-note" role="alert" data-testid="ask-piece-undrawn">
      {card.refused ?? card.says.notDrawn}
    </p>
  );
}

/** The video's poster over its first still, shown once it has loaded: one that is not cut yet leaves the still in place. */
function Poster({ fileId, lookStatus }: { fileId: string; lookStatus: string }) {
  // Asked for again as the look ends: the poster is cut a moment after the video lands.
  const src = `${fileViewOf(fileId)}?w=320&look=${lookStatus}`;
  const [shown, setShown] = useState<string | null>(null);
  return (
    <img
      className="ask-piece-poster"
      src={src}
      alt=""
      data-shown={shown === src ? "" : undefined}
      onLoad={() => setShown(src)}
      data-testid="ask-piece-poster"
    />
  );
}

/** Where the video stands, once pressed: its picture and what is said beside it. */
function PieceNow({
  card,
  stands,
  busy,
  onOpen,
  onRetry,
  t,
}: {
  card: PieceCard;
  stands: Exclude<PieceStands, { is: "gone" }>;
  busy: boolean;
  onOpen: (fileId: string) => void;
  onRetry: (() => void) | null;
  t: LineWords;
}) {
  const { says } = card;
  const file = stands.is === "checking" || stands.is === "ready" ? stands.file : null;
  return (
    <div className="ask-piece-now" data-is={stands.is} data-testid="ask-piece-now">
      <span className="ask-piece-still" data-dim={stands.is === "ready" ? undefined : ""}>
        {/* The two pictures dim as one, so the plan's frame never shows through the video's own. */}
        <span className="ask-piece-frames">
          {card.picture ? <img className="ask-piece-slice" src={card.picture} alt="" /> : null}
          {file ? <Poster fileId={file.id} lookStatus={file.look_status} /> : null}
        </span>
        {stands.is === "making" ? <Working /> : null}
      </span>
      <div className="ask-piece-says" role="status">
        {stands.is === "making" ? (
          <>
            <p className="ask-piece-state">{says.follows.making}</p>
            {/* Keyed by its words, so a new line comes in as one (ask.css). */}
            <p className="ask-card-foot ask-piece-line" key={stands.stage} data-testid="ask-piece-stage">
              {says.follows.stage[stands.stage](card.moments)}
            </p>
          </>
        ) : null}
        {stands.is === "checking" ? (
          <>
            <p className="ask-piece-state">{says.follows.checkingMark}</p>
            <p className="ask-card-foot ask-piece-line">{says.follows.checking}</p>
          </>
        ) : null}
        {stands.is === "ready" ? (
          <>
            <p className="ask-piece-state">{says.follows.ready}</p>
            <p className="ask-card-foot ask-piece-line">{says.follows.readyWhere}</p>
            {stands.file.issues.length > 0 ? <p className="ask-card-note">{stands.file.issues.join(" ")}</p> : null}
            <Button size="sm" onClick={() => onOpen(stands.file.id)} data-testid="ask-piece-open">
              {says.follows.open}
            </Button>
          </>
        ) : null}
        {stands.is === "failed" ? (
          <>
            <StatePill kind="tone" value="warn" label={says.follows.failedMark} testid="ask-piece-failed" />
            <p className="ask-card-foot ask-piece-line">{says.failed[stands.why]}</p>
            {onRetry ? (
              <Button size="sm" onClick={onRetry} disabled={busy} aria-busy={busy} data-testid="ask-piece-retry">
                {t.tryAgain}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

/** The card's body: the stills and what they will make, or where the video stands once pressed. */
export function AskPieceCard({
  p,
  card,
  t,
  busy,
  onNav,
  onRetry,
}: {
  p: AskProposal;
  card: PieceCard;
  t: LineWords;
  busy: boolean;
  onNav: (to: string) => void;
  /** Press it again: a video that was not made is tried anew by its own card. Null where this person may not press. */
  onRetry: (() => void) | null;
}) {
  const { stands } = card;
  if (stands?.is === "gone")
    return (
      <div className="ask-piece" data-testid="ask-piece">
        <p className="ask-card-foot" role="status" data-testid="ask-piece-gone">
          {card.says.follows.gone}
        </p>
      </div>
    );
  return (
    <div className="ask-piece" data-stills={card.moments} data-testid="ask-piece">
      {stands ? (
        <PieceNow
          card={card}
          stands={stands}
          busy={busy}
          onOpen={(fileId) => openFile(fileId, onNav)}
          onRetry={onRetry}
          t={t}
        />
      ) : (
        <PieceStills card={card} t={t} />
      )}
      <p className="ask-card-summary">{p.summary}</p>
      {/* While it is made, that they may leave and where it lands: the press's own receipt, said here beside what it is doing. */}
      {stands?.is === "making" ? <p className="ask-card-foot">{card.says.making}</p> : null}
    </div>
  );
}
