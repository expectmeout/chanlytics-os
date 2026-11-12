/**
 * Where a made post goes and where it stands, in one list (the content canvas, "Making and posting", PhAct "post"; Ruben, 12
 * Nov 2026: one list, where the canvas drew the places twice, as chips on the piece and as rows in the composer). In a sheet
 * over the piece on a phone and in the open piece's pane on a desk: a row for each place the workspace is offered (Instagram
 * only where its Meta link is on: model/places.ts placesOf). One that can take the post now has its switch, and on Instagram
 * a post or a story; one where it is up, going up or set for its time says so, with its door (see it, take it down, Don't
 * post); one that can take none says why. Then, once a place is switched on, the caption that goes with it, said once: it is
 * typed in Details alone (viewer/caption.tsx), and here it is read (Ruben, 12 Nov 2026: one place to type it). No time: it
 * goes as it is sent, and a time is asked of Ask. One press sends to each place through its own door (POST
 * files/[id]/instagram, POST files/[id]/google). A place that went is switched off, so a second press never sends it twice;
 * one that was refused stays on, its reason under it.
 */
import { useState, type ReactNode } from "react";
import {
  CONNECTIONS_PAGE,
  CONTENT_SHEET_WORDS,
  CONTENT_WORDS,
  INSTAGRAM_POST_KINDS,
  POST_AHEAD_DAYS_MAX,
  POST_PLACES,
  type InstagramPostKind,
  type PostDto,
  type PostPlace,
  type PostPlan,
} from "@chanlytics/contracts";
import { pageClock } from "@/bridge/zone";
import { routeDoor } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Switch } from "../../kit/switch/switch";
import type { FrameFlash } from "../../frame-verbs";
import { fileVerbs } from "../../files/verbs";
import { WhenDayTime, firstSlot } from "../broadcasts/when";
import { postBothBegins, postBothProblemOf, type PostBothDraft } from "./model/post-both";
import { pieceStandsAt, type PieceTakes } from "./model/piece-open";
import { placesOf, type PieceOffers, type PieceWont, type PlaceStanding } from "./model/places";
import { viewerStandsSaid, type ViewerClock } from "./model/viewer-line";
import { viewerClockOf } from "./viewer/clock";

const COMPOSER_SAYS = CONTENT_WORDS.post;
const SHEET = CONTENT_SHEET_WORDS.post;
const PLACES = CONTENT_SHEET_WORDS.places;
const PLACE_GLYPH = { instagram: "instagram", google: "place" } as const satisfies Record<PostPlace, string>;

type Refusals = Partial<Record<PostPlace, string>>;

/** The doors to a post that is up at a place (see it there, take it down), drawn under that place's row. */
export type PlaceDoors = Partial<Record<PostPlace, ReactNode>>;

/**
 * One press, through each place's own door at once, now: the places that took it, and why each other one did not. `words` is
 * the caption as Details says it.
 */
async function sendToEach(
  id: string,
  sending: PostBothDraft,
  words: string,
  when?: string,
): Promise<{ sent: PostPlace[]; refused: Refusals }> {
  const sends: [PostPlace, Promise<{ ok: boolean; message?: string }>][] = [];
  if (sending.instagram) sends.push(["instagram", fileVerbs.postToInstagram(id, sending.as, words, when)]);
  if (sending.google) sends.push(["google", fileVerbs.postToGoogle(id, words, when)]);
  const answers = await Promise.all(sends.map(([, answer]) => answer));
  const sent: PostPlace[] = [];
  const refused: Refusals = {};
  sends.forEach(([place], i) => {
    const answer = answers[i];
    if (answer?.ok) sent.push(place);
    else if (answer) refused[place] = answer.message ?? "";
  });
  return { sent, refused };
}

/** What the list reads of the piece: its posts, where it can go now, why a place can take none, and who is looking. */
interface PostBothPiece {
  id: string;
  plan: PostPlan | null;
  /** The caption that goes with it, as Details says it (model/viewer-line.ts postCaptionOf); null where it has none. */
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
}

/** The draft, its send, and what each place said back. */
export function usePostBoth(piece: PostBothPiece, tell: PostBothTells) {
  const { id, plan, caption, takes, wont, offers, may } = piece;
  const { done, flash } = tell;
  const [held, setHeld] = useState<PostBothDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<Refusals>({});
  const change = (to: Partial<PostBothDraft>) => setHeld((d) => (d ? { ...d, ...to } : d));
  // What a person who may post can send to now: a reader's list switches nothing.
  const open: PieceTakes | null = takes ? { instagram: may && takes.instagram, google: may && takes.google } : null;
  // The draft as it stands now: a place is on only while it can take the post. One that stopped taking it since it was
  // switched on (a post went on its way there, the place was disconnected) has no switch to turn off, so it is off.
  const draft: PostBothDraft | null =
    held && open ? { ...held, instagram: held.instagram && open.instagram, google: held.google && open.google } : held;
  const words = (caption ?? "").trim();
  const send = async (sending: PostBothDraft, at?: number) => {
    setBusy(true);
    const { sent, refused: no } = await sendToEach(id, sending, words, at ? new Date(at).toISOString() : undefined);
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
    wont,
    offers,
    /** Whether the list can be opened yet: the piece's record has been read. */
    ready: !!plan && !!takes,
    sending,
    may,
    busy,
    pulling: tell.pulling,
    pullProblem: tell.pullProblem,
    refused,
    problem,
    canSend: sending && !busy && problem === null,
    /**
     * Begun from what the picture says, on at every place that can take it and where it is not up already: a second post to
     * a place it is on is switched on by hand, never by opening the list. `only` keeps one place on alone.
     */
    begin: (only?: PostPlace) => {
      if (!plan || !open) return;
      setRefused({});
      const begun = postBothBegins(open);
      const now = Date.now();
      const fresh = (place: PostPlace) => begun[place] && pieceStandsAt(piece.posts, place, now).is !== "up";
      setHeld(
        only
          ? { ...begun, instagram: only === "instagram", google: only === "google" }
          : { ...begun, instagram: fresh("instagram"), google: fresh("google") },
      );
    },
    cancel: () => {
      setRefused({});
      setHeld(null);
    },
    toggle: (place: PostPlace) => setHeld((d) => (d ? { ...d, [place]: !d[place] } : d)),
    choose: (as: InstagramPostKind) => change({ as }),
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
 * What a place's row says under its name, or nothing: where the piece stands there (a post that stopped, with why; up; going
 * up; set for its time), else why it can take none. A place that can take the post and holds none says nothing: its name and
 * its switch say it all, on one line.
 */
function placeSaidOf(at: PlaceStanding, clock: ViewerClock): string | null {
  // Why it stopped, where its post says: with no reason kept it says it stopped, never the place's name as the reason.
  if (at.stands.is === "stuck" && at.stands.why) return CONTENT_WORDS.views.didntPost(at.stands.why);
  if (at.stands.is === "timed") return PLACES.timed(clock.ahead(at.stands.at));
  if (at.stands.is !== "none") return viewerStandsSaid(at.stands, clock);
  return at.takes ? null : at.wont;
}

/**
 * A place as its row draws it: as the piece's posts say, and up where its record alone says so. A post on Google from before
 * each post was kept has no post row (server posts/record.ts onGoogle), and its door (see it, take it down) is handed in all
 * the same: the row says it is up, and keeps the door.
 */
const placeDrawnOf = (at: PlaceStanding, door: ReactNode): PlaceStanding =>
  at.stands.is === "none" && door ? { ...at, stands: { is: "up", at: null } } : at;

/**
 * Instagram's Post or Story, on one small track with the one chosen raised: Made and Library's track (views.tsx ContentLists)
 * at the size of a row's end, as the canvas draws it (PhAct, .ct-mini), where two loose presses drew the chosen one a round.
 */
function InstagramAs({ as, choose }: { as: InstagramPostKind; choose: (as: InstagramPostKind) => void }) {
  return (
    <span className="cnv-as" role="group" aria-label={COMPOSER_SAYS.asWhat}>
      {INSTAGRAM_POST_KINDS.map((kind) => (
        <Button
          key={kind}
          size="sm"
          variant={kind === as ? "glass" : "quiet"}
          aria-pressed={kind === as}
          onClick={() => choose(kind)}
          data-testid={`cnv-as-${kind}`}
        >
          {SHEET.kinds[kind]}
        </Button>
      ))}
    </span>
  );
}

/** What stands at a row's end: a place's switch (Instagram's Post or Story before it), or Don't post for one on its way. */
function PlaceEnd({ at, draft, both }: { at: PlaceStanding; draft: PostBothDraft; both: PostBothState }) {
  const { place } = at;
  if (at.takes)
    return (
      <span className="cnv-dest-end">
        {place === "instagram" && draft.instagram ? <InstagramAs as={draft.as} choose={both.choose} /> : null}
        <Switch
          label={SHEET.switchLabel(place)}
          checked={draft[place]}
          onCheckedChange={() => both.toggle(place)}
          data-testid={`cnv-switch-${place}`}
        />
      </span>
    );
  const pull = at.pull;
  if (!pull || !both.may) return null;
  return (
    <span className="cnv-dest-end">
      <Button
        size="sm"
        onClick={() => both.pull(pull)}
        disabled={both.busy || both.pulling}
        data-testid={`cnv-pull-${place}`}
      >
        {CONTENT_WORDS.piece.step.dontPost}
      </Button>
    </span>
  );
}

/**
 * What a row says under a place's name, on one line: where it stands there, in its tone; the doors to a post that is up there
 * (see it, take it down) beside it; Connect, where the place takes none until it is put right (a post that stopped there for
 * it too); and Don't post for a post that stopped, which lets it go (the same press that stops one waiting for its time, at
 * the row's end). Nothing where the place has nothing to say.
 */
function PlaceSaid({
  at,
  said,
  door,
  both,
}: {
  at: PlaceStanding;
  said: string | null;
  door: ReactNode;
  both: Pick<PostBothState, "may" | "busy" | "pulling" | "pull">;
}) {
  const doors = at.stands.is === "up" && door ? door : null;
  const connects = (at.stands.is === "none" || at.stands.is === "stuck") && !at.takes && !!at.wont;
  const letGo = both.may ? at.letGo : null;
  if (!said && !doors && !connects && !letGo) return null;
  return (
    <span className="cnv-dest-said">
      {said ? (
        <span className="cnv-dest-status" data-testid={`cnv-place-said-${at.place}`}>
          {said}
        </span>
      ) : null}
      {doors ? <span className="cnv-dest-doors">{doors}</span> : null}
      {connects ? (
        <Button
          size="text"
          variant="quiet"
          className="cnv-dest-act"
          {...routeDoor(CONNECTIONS_PAGE)}
          data-testid={`cnv-connect-${at.place}`}
        >
          {PLACES.connect}
        </Button>
      ) : null}
      {letGo ? (
        <Button
          size="text"
          variant="quiet"
          className="cnv-dest-act"
          onClick={() => both.pull(letGo)}
          disabled={both.busy || both.pulling}
          data-testid={`cnv-pull-${at.place}`}
        >
          {CONTENT_WORDS.piece.step.dontPost}
        </Button>
      ) : null}
    </span>
  );
}

/**
 * A place's row (the content canvas, PhAct "post"): its glyph, its name, and under it, where there is something to say, where
 * the piece stands there or why it can take none, with its doors; at its end its switch or Don't post.
 */
function PlaceRow(props: {
  at: PlaceStanding;
  draft: PostBothDraft;
  both: PostBothState;
  clock: ViewerClock;
  door: ReactNode;
}) {
  const { draft, both } = props;
  const at = placeDrawnOf(props.at, props.door);
  const { place } = at;
  return (
    <div className="cnv-dest" data-stands={at.stands.is} data-testid={`cnv-place-${place}`}>
      <span className="cnv-dest-glyph" aria-hidden="true">
        <Icon name={PLACE_GLYPH[place]} size={15} />
      </span>
      <span className="cnv-dest-words">
        <b>{CONTENT_WORDS.piece.place[place]}</b>
        <PlaceSaid at={at} said={placeSaidOf(at, props.clock)} door={props.door} both={both} />
      </span>
      <PlaceEnd at={at} draft={draft} both={both} />
      {both.refused[place] ? (
        <p className="cnv-note cnv-refused" role="alert" data-testid={`cnv-refused-${place}`}>
          {COMPOSER_SAYS.oneFailed(place, both.refused[place] ?? "")}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The caption that goes with it, said once as words (Ruben, 12 Nov 2026: one place to type it, Details), under the name Details
 * gives it. A story shows none, so where only a story is sent there is nothing to say.
 */
function ComposerCaption({ words }: { words: string }) {
  if (!words) return null;
  return (
    <div className="cnv-fact">
      <span>{CONTENT_WORDS.viewer.facts.words}</span>
      <p className="cnv-compose-caption" data-testid="cnv-words">
        {words}
      </p>
    </div>
  );
}

/**
 * The list (the content canvas, PhAct "post"): a row per place; then, once a place is switched on, the caption that goes with
 * it. In a sheet over the piece on a phone, in the pane's body on a desk.
 */
export function PostBoth({
  both,
  doors = {},
  words = true,
}: {
  both: PostBothState;
  doors?: PlaceDoors;
  /** The caption said here; off where the piece's own facts follow, its caption editable there (viewer/sheets.tsx). */
  words?: boolean;
}) {
  const { draft, takes, wont, offers } = both;
  if (!draft || !takes || !wont || !offers) return null;
  const clock = viewerClockOf();
  const places = placesOf(both.posts, { takes, wont, offers }, Date.now());
  const showsWords = draft.google || draft.as === "picture";
  return (
    <div className="cnv-compose" data-testid="cnv-compose">
      {/* Named as its sheet is. */}
      <div className="cnv-dests" role="group" aria-label={postBothTitleOf(both)}>
        {places.map((at) => (
          <PlaceRow key={at.place} at={at} draft={draft} both={both} clock={clock} door={doors[at.place]} />
        ))}
      </div>
      {both.pullProblem ? (
        <p className="cnv-note cnv-refused" role="alert" data-testid="cnv-pull-problem">
          {both.pullProblem}
        </p>
      ) : null}
      {both.sending ? (
        <>
          {showsWords && words ? <ComposerCaption words={both.words} /> : null}
          {both.problem ? (
            <p className="cnv-note" role="alert" data-testid="cnv-compose-problem">
              {both.problem}
            </p>
          ) : null}
        </>
      ) : null}
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
  if (step === "time") {
    const ahead = at > Date.now();
    return (
      <div className="cnv-acts cnv-when" data-foot-acts="">
        <div className="cnv-when-words">
          <p className="cnv-when-says" data-testid="cnv-when-says">
            {COMPOSER_SAYS.later.says} <WhenDayTime at={at} maxDays={POST_AHEAD_DAYS_MAX} onChange={setAt} allDay />
          </p>
          <p className="cnv-note">{COMPOSER_SAYS.later.note(pageClock().when(at), pageClock().city())}</p>
        </div>
        <div className="cnv-when-acts">
          <Button variant="quiet" onClick={rest} disabled={both.busy} data-testid="cnv-when-back">
            {COMPOSER_SAYS.ask.no}
          </Button>
          <Button
            variant="primary"
            onClick={() => void both.send(at).finally(rest)}
            disabled={!both.canSend || !ahead}
            aria-busy={both.busy}
            data-testid="cnv-compose-schedule"
          >
            {COMPOSER_SAYS.later.yes}
          </Button>
        </div>
      </div>
    );
  }
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
