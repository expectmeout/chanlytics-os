/**
 * Where a made post goes and where it stands, in one list (the content canvas, "Making and posting", PhAct "post"; Ruben, 12
 * Nov 2026: one list, where the canvas drew the places twice, as chips on the piece and as rows in the composer). In a sheet
 * over the piece on a phone and in the open piece's pane on a desk: a row for each place the workspace is offered (Instagram
 * only where its Meta link is on: model/places.ts placesOf). One that can take the post now has its switch, and on Instagram
 * a post or a story; one where it is up, going up or set for its time says so, with its door (see it, take it down, Don't
 * post); one that can take none says why. The caption that goes with it is typed under the places, in the same sheet
 * (viewer/details.tsx ViewerFacts), and Post sends the words on screen: each place's door keeps them on the piece in the same
 * step (server posts/caption.ts keepPostWords), so the words that go and the words kept are never two. Post asks first;
 * Schedule picks a day and a time; Change time moves a post set for one, itself, in one step (00621). Each press goes through
 * its place's own doors (files/verbs.ts postDoors); what its presses do is post-both-sends.tsx, and a place's row is
 * post-both-places.tsx. A place that went is switched off, so a second press never sends it twice;
 * one that was refused stays on, its reason under it.
 */
import { useState, type ReactNode } from "react";
import {
  CONTENT_SHEET_WORDS,
  CONTENT_WORDS,
  ON_INSTAGRAM,
  POST_AHEAD_DAYS_MAX,
  POST_PLACES,
  type InstagramPostKind,
  type PostDto,
  type PostPlace,
  type PostPlan,
} from "@chanlytics/contracts";
import { pageClock } from "@/bridge/zone";
import { gateTitle } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import type { FrameFlash } from "../../frame-verbs";
import { WhenDayTime, firstSlot } from "../broadcasts/when";
import { postBothProblemOf, type PostBothDraft } from "./model/post-both";
import { instagramAsOf, instagramKindsFree, type PieceTakes } from "./model/piece-open";
import { placesOf, type PieceOffers, type PieceWont, type PlaceStanding } from "./model/places";
import { PlaceRow } from "./post-both-places";
import { postBothOpening, sendToEach, usePostMove, type Refusals } from "./post-both-sends";
import { viewerClockOf } from "./viewer/clock";

const COMPOSER_SAYS = CONTENT_WORDS.post;
const SHEET = CONTENT_SHEET_WORDS.post;
const PLACES = CONTENT_SHEET_WORDS.places;
/** The doors to a post that is up at a place (see it there, take it down), drawn under that place's row. */
export type PlaceDoors = Partial<Record<PostPlace, ReactNode>>;

/** What the list reads of the piece: its posts, where it can go now, why a place can take none, and who is looking. */
interface PostBothPiece {
  id: string;
  plan: PostPlan | null;
  /** The caption that goes with it: the words on screen in its box, else as kept (postCaptionOf); null where it has none. */
  caption: string | null;
  posts: readonly PostDto[];
  takes: PieceTakes | null;
  wont: PieceWont | null;
  offers: PieceOffers | null;
  /** Whether this person may post: a reader sees where it stands, and nothing to switch or send. */
  may: boolean;
}

/** How the list tells the pane what happened, and stops a post through the pane's own press (piece-presses.tsx). */
interface PostBothTells {
  done: (places: readonly PostPlace[]) => void;
  flash: (f: FrameFlash) => void;
  pull: (postId: string) => void;
  /** A press of the pane's is out (Don't post among them): the list's Don't post waits for it. */
  pulling: boolean;
  /** Why the pane's last press was refused (a Don't post pressed here): said in the list, which stands over the pane's own line. */
  pullProblem: string | null;
  /** Told the words a place's door kept on the piece as it posted (none, for a story alone), so the caption's box does not keep them a second time. */
  wordsKept?: (words: string | null) => void;
}

/** The draft, its send, and what each place said back. */
export function usePostBoth(piece: PostBothPiece, tell: PostBothTells) {
  const { id, plan, caption, takes, wont, offers, may } = piece;
  const { done, flash } = tell;
  const [held, setHeld] = useState<PostBothDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<Refusals>({});
  const mover = usePostMove({ id, posts: piece.posts }, { done, flash, refused: setRefused });
  const change = (to: Partial<PostBothDraft>) => setHeld((d) => (d ? { ...d, ...to } : d));
  // What a person who may post can send to now: a reader's list switches nothing.
  const open: PieceTakes | null = takes ? { instagram: may && takes.instagram, google: may && takes.google } : null;
  // What Instagram can take now: one of each kind at a time (00620), so a story while a post waits, and the other way round.
  const kinds = instagramKindsFree(piece.posts);
  // The draft as it stands now: a place is on only while it can take the post, Instagram as a kind it can take. One that
  // stopped taking it since it was switched on (a post went on its way there, the place was disconnected) has no switch to
  // turn off, so it is off.
  const draft: PostBothDraft | null =
    held && open
      ? {
          as: instagramAsOf(kinds, held.as),
          instagram: held.instagram && open.instagram,
          google: held.google && open.google,
        }
      : held;
  const words = (caption ?? "").trim();
  // The words on screen are what goes, and each door keeps them on the piece in the same step (Ruben, 12 Nov 2026: words typed
  // just before Post went out as they were before).
  const send = async (sending: PostBothDraft, at?: number) => {
    setBusy(true);
    const when = at ? new Date(at).toISOString() : undefined;
    const { sent, refused: no, kept } = await sendToEach(id, sending, words, when);
    tell.wordsKept?.(kept);
    setBusy(false);
    setRefused(no);
    if (sent.length > 0)
      flash({ msg: <>{at ? COMPOSER_SAYS.later.set(sent, pageClock().when(at)) : COMPOSER_SAYS.sent(sent)}</> });
    if (Object.keys(no).length === 0) {
      setHeld(null);
      done(sent);
      return;
    }
    // What was sent is off now: a second press sends only what was refused.
    setHeld((now) => (now ? { ...now, instagram: !!no.instagram, google: !!no.google } : now));
    if (sent.length > 0) done(sent);
  };
  // Something is switched on to send: only then does the list draw its caption and its send.
  const sending = !!draft && (draft.instagram || draft.google);
  const problem = draft && sending ? postBothProblemOf(draft, words) : null;
  return {
    open: draft !== null,
    draft,
    words,
    posts: piece.posts,
    takes: open,
    /** What could take the post for whoever may post, as the record says: a reader's own `takes` is none of them. */
    could: takes,
    wont,
    offers,
    /** The kinds Instagram can take now: the track draws the other one off. */
    kinds,
    /** Whether the list can be opened yet: the piece's record has been read. */
    ready: !!plan && !!takes,
    sending,
    may,
    busy: busy || mover.busy,
    pulling: tell.pulling,
    pullProblem: tell.pullProblem,
    refused,
    problem,
    canSend: sending && !busy && !mover.busy && problem === null,
    /**
     * Begun the same however it is opened, from the coral act or where it stands (Ruben, 12 Nov 2026: Post again opened one
     * place and the status row both): where a post stopped, that place alone, as what stopped there was; else every place that
     * can take it where it is not up already. A second post to a place it is on is switched on by hand, never by opening it.
     */
    begin: () => {
      if (!plan || !open) return;
      setRefused({});
      setHeld(postBothOpening(open, piece.posts, Date.now()));
    },
    cancel: () => {
      setRefused({});
      mover.stop();
      setHeld(null);
    },
    /** A post set for its time being moved to another, in the foot; null while none is (usePostMove). */
    moving: mover.moving,
    moveTime: mover.begin,
    moveTo: mover.to,
    stopMoving: mover.stop,
    move: mover.move,
    toggle: (place: PostPlace) => setHeld((d) => (d ? { ...d, [place]: !d[place] } : d)),
    choose: (as: InstagramPostKind) => change({ as: instagramAsOf(kinds, as) }),
    /** Don't post: the post is stopped or let go, and its place is switched off, so Post never sends what was let go. */
    pull: (postId: string) => {
      const place = piece.posts.find((p) => p.id === postId)?.place;
      if (place) setHeld((d) => (d ? { ...d, [place]: false } : d));
      tell.pull(postId);
    },
    /** Sends it, now or at `at` (an instant picked in the foot); answers once each place has. */
    send: (at?: number): Promise<void> => (draft && sending && problem === null ? send(draft, at) : Promise.resolve()),
  };
}

type PostBothState = ReturnType<typeof usePostBoth>;

/** The list's title, which holds still as places are switched: Post it where a place can take the post now, else where it is. */
export const postBothTitleOf = (both: Pick<PostBothState, "takes">): string =>
  both.takes && POST_PLACES.some((place) => both.takes?.[place]) ? SHEET.title : PLACES.title;

/**
 * Whether a reader is missing a press here: a post waits or stopped (Don't post, Change time, Dismiss are a poster's), or
 * opening the list would switch a place on for whoever may post. Where the piece is up everywhere and nothing waits, there
 * is nothing to be told of: saying who can post there read as something still to do.
 */
function readerMisses(both: Pick<PostBothState, "may" | "could" | "posts">, places: readonly PlaceStanding[]): boolean {
  if (both.may) return false;
  if (places.some((at) => at.pull || at.letGo || at.waitsToo?.pull)) return true;
  if (!both.could) return false;
  const armed = postBothOpening(both.could, both.posts, Date.now());
  return armed.instagram || armed.google;
}

/**
 * The list (the content canvas, PhAct "post"): a row per place, and what stops a send. The caption that goes with it follows
 * it, typed in place (viewer/details.tsx ViewerFacts), in the same sheet on a phone and the same body on a desk.
 */
export function PostBoth({ both, doors = {} }: { both: PostBothState; doors?: PlaceDoors }) {
  const { draft, takes, wont, offers } = both;
  if (!draft || !takes || !wont || !offers) return null;
  const clock = viewerClockOf();
  const places = placesOf(both.posts, { takes, wont, offers }, Date.now());
  return (
    <div className="cnv-compose" data-testid="cnv-compose">
      {/* Named as its sheet is. */}
      <div className="cnv-dests" role="group" aria-label={postBothTitleOf(both)}>
        {places.map((at) => (
          <PlaceRow key={at.place} at={at} draft={draft} both={both} clock={clock} door={doors[at.place]} />
        ))}
      </div>
      {/* A reader sees where it stands and nothing to press: who can post is said, as a card says who can approve it. */}
      {readerMisses(both, places) ? (
        <p className="cnv-note" data-testid="cnv-cant-post">
          {gateTitle("settings", "post this")}
        </p>
      ) : null}
      {both.pullProblem ? (
        <p className="cnv-note cnv-refused" role="alert" data-testid="cnv-pull-problem">
          {both.pullProblem}
        </p>
      ) : null}
      {both.sending && both.problem ? (
        <p className="cnv-note" role="alert" data-testid="cnv-compose-problem">
          {both.problem}
        </p>
      ) : null}
      {both.may && places.some((at) => at.making || at.waitsToo?.making) ? (
        <p className="cnv-note" data-testid="cnv-words-held">
          {PLACES.wordsHeld}
        </p>
      ) : null}
      {/* A story alone goes with no words: the caption under it is the piece's, kept for a post, and this one shows none. */}
      {both.sending && !draft.google && draft.as === "story" ? (
        <p className="cnv-note" data-testid="cnv-story-words">
          {ON_INSTAGRAM.storyNoCaption}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A day and a time, asked in the foot as words of a sentence (broadcasts/when.tsx), with what it means, Back and the coral act:
 * Schedule's, and Change time's for a post already set for one.
 */
function WhenStep(props: {
  /** The sentence before the day and the time. */
  says: string;
  at: number;
  onChange: (at: number) => void;
  back: { press: () => void; testid: string };
  yes: { words: string; press: () => void; enabled: boolean; testid: string };
  busy: boolean;
  testid?: string;
}) {
  const { at, back, yes, busy } = props;
  return (
    <div className="cnv-acts cnv-when" data-foot-acts="" data-testid={props.testid}>
      <div className="cnv-when-words">
        <p className="cnv-when-says" data-testid="cnv-when-says">
          {props.says} <WhenDayTime at={at} maxDays={POST_AHEAD_DAYS_MAX} onChange={props.onChange} allDay />
        </p>
        <p className="cnv-note">{COMPOSER_SAYS.later.note(pageClock().when(at), pageClock().city())}</p>
      </div>
      <div className="cnv-when-acts">
        <Button variant="quiet" onClick={back.press} disabled={busy} data-testid={back.testid}>
          {COMPOSER_SAYS.ask.no}
        </Button>
        <Button
          variant="primary"
          onClick={yes.press}
          disabled={!yes.enabled || at <= Date.now()}
          aria-busy={busy}
          data-testid={yes.testid}
        >
          {yes.words}
        </Button>
      </div>
    </div>
  );
}

/**
 * The composer's foot (Ruben, 12 Nov 2026: one press posted, with no question and no time): Post, wide and coral, and
 * Schedule beside it. Post asks first, where it was pressed, as Make it again does (the kit's question in the foot's place):
 * a post is public, and Google shows it at once. Schedule picks the day and the time as words of a sentence, as a send's are
 * (broadcasts/when.tsx), through the same doors, which have taken a time all along (00611, 00616). The sheet's × (a phone)
 * or the desk pane's lets the draft go.
 */
export function PostBothActs({ both }: { both: PostBothState }) {
  const on = both.draft ? POST_PLACES.filter((place) => both.draft?.[place]) : [];
  const [step, setStep] = useState<"rest" | "ask" | "time">("rest");
  const [at, setAt] = useState(0);
  const rest = () => setStep("rest");
  // A post set for its time, being moved: the foot is its time, whatever else is switched on.
  const moving = both.moving;
  if (moving)
    return (
      <WhenStep
        says={PLACES.goesUp(CONTENT_WORDS.viewer.kinds[moving.kind])}
        at={moving.at}
        onChange={both.moveTo}
        back={{ press: both.stopMoving, testid: "cnv-move-back" }}
        yes={{ words: PLACES.move, press: () => void both.move(), enabled: !both.busy, testid: "cnv-move-yes" }}
        busy={both.busy}
        testid="cnv-move"
      />
    );
  // Asked as the time is (the sentence, what it means, Back and the coral act), so Post answers where Post was pressed.
  if (step === "ask")
    return (
      <div className="cnv-acts cnv-when" data-foot-acts="" data-testid="cnv-post-ask">
        <div className="cnv-when-words">
          <p className="cnv-when-says">{COMPOSER_SAYS.ask.question(on)}</p>
          <p className="cnv-note">{COMPOSER_SAYS.ask.detail(on)}</p>
        </div>
        <div className="cnv-when-acts">
          <Button variant="quiet" onClick={rest} disabled={both.busy} data-testid="cnv-post-ask-back">
            {COMPOSER_SAYS.ask.no}
          </Button>
          <Button
            variant="primary"
            onClick={() => void both.send().finally(rest)}
            disabled={!both.canSend}
            aria-busy={both.busy}
            data-testid="cnv-post-ask-yes"
          >
            {COMPOSER_SAYS.go}
          </Button>
        </div>
      </div>
    );
  if (step === "time")
    return (
      <WhenStep
        says={COMPOSER_SAYS.later.says}
        at={at}
        onChange={setAt}
        back={{ press: rest, testid: "cnv-when-back" }}
        yes={{
          words: COMPOSER_SAYS.later.yes,
          press: () => void both.send(at).finally(rest),
          enabled: both.canSend,
          testid: "cnv-compose-schedule",
        }}
        busy={both.busy}
      />
    );
  return (
    <div className="cnv-acts" data-foot-acts="">
      <Button
        onClick={() => {
          setAt(firstSlot(Date.now(), true));
          setStep("time");
        }}
        disabled={!both.canSend}
        data-testid="cnv-compose-later"
      >
        <Icon name="clock" size={14} />
        {COMPOSER_SAYS.later.open}
      </Button>
      <Button
        variant="primary"
        className="cnv-lead"
        onClick={() => setStep("ask")}
        disabled={!both.canSend}
        aria-label={on.length > 0 ? COMPOSER_SAYS.send(on) : undefined}
        data-testid="cnv-compose-send"
      >
        {COMPOSER_SAYS.go}
      </Button>
    </div>
  );
}
