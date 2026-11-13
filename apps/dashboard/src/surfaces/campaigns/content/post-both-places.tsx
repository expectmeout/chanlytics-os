/**
 * A place's row in the list of where a made post goes (post-both.tsx draws the list and holds its draft): its glyph and its
 * name; under it where the piece stands there, with the doors to a post that is up, Change time and Don't post for one that
 * waits, and a line of its own for a second post that waits beside it (00620: on Instagram a picture post and a story wait
 * apart) and for one that is up under a newer one; at its end its switch, with Instagram's Post or Story, or Don't post.
 */
import type { ReactNode } from "react";
import {
  CONNECTIONS_PAGE,
  CONTENT_SHEET_WORDS,
  CONTENT_WORDS,
  INSTAGRAM_POST_KINDS,
  type InstagramPostKind,
  type PostPlace,
} from "@chanlytics/contracts";
import { routeDoor } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Switch } from "../../kit/switch/switch";
import type { PostBothDraft } from "./model/post-both";
import type { PlaceStanding } from "./model/places";
import { viewerStandsSaid, type ViewerClock } from "./model/viewer-line";

const PLACE_GLYPH = { instagram: "instagram", google: "place" } as const satisfies Record<PostPlace, string>;

/** What a row reads of the list (post-both.tsx usePostBoth): who may post, what is out, and the list's own presses. */
interface PlaceRowHands {
  may: boolean;
  busy: boolean;
  pulling: boolean;
  /** The kinds Instagram can take now. */
  kinds: readonly InstagramPostKind[];
  /** Why each place that refused a post did. */
  refused: Partial<Record<PostPlace, string>>;
  pull: (postId: string) => void;
  moveTime: (postId: string) => void;
  toggle: (place: PostPlace) => void;
  choose: (as: InstagramPostKind) => void;
}

/**
 * What a place's row says under its name, or nothing: where the piece stands there (a post that stopped, with why; up; going
 * up; set for its time), else why it can take none. A place that can take the post and holds none says nothing: its name and
 * its switch say it all, on one line.
 */
function placeSaidOf(at: PlaceStanding, clock: ViewerClock): string | null {
  // Why it stopped, where its post says: with no reason kept it says it stopped, never the place's name as the reason.
  if (at.stands.is === "stuck" && at.stands.why) return CONTENT_WORDS.views.didntPost(at.stands.why);
  // On Instagram, what waits is named, as the status row names it: a post up beside a story set for later is two things.
  if (at.stands.is === "timed" && at.kind && at.place === "instagram")
    return CONTENT_WORDS.piece.step.timed(CONTENT_WORDS.viewer.kinds[at.kind], clock.ahead(at.stands.at));
  if (at.stands.is === "timed") return CONTENT_SHEET_WORDS.places.timed(clock.ahead(at.stands.at));
  if (at.stands.is !== "none") return viewerStandsSaid(at.stands, clock);
  return at.takes ? null : at.wont;
}

/**
 * A place as its row draws it: as the piece's posts say, and up where its record alone says so. A post on Google from before
 * each post was kept has no post row (server posts/record.ts onGoogle), and its door (see it, take it down) is handed in all
 * the same: the row says it is up, and keeps the door.
 */
const placeDrawnOf = (at: PlaceStanding, door: ReactNode): PlaceStanding =>
  at.stands.is === "none" && door && !at.upToo ? { ...at, stands: { is: "up", at: null } } : at;

/**
 * Instagram's Post or Story, on one small track with the one chosen raised: Made and Library's track (views.tsx ContentLists)
 * at the size of a row's end, as the canvas draws it (PhAct, .ct-mini), where two loose presses drew the chosen one a round.
 */
function InstagramAs(props: {
  as: InstagramPostKind;
  /** The kinds that can go now: one with a post of its own on its way is drawn off, and its line under the place says why. */
  kinds: readonly InstagramPostKind[];
  choose: (as: InstagramPostKind) => void;
}) {
  const { as, kinds, choose } = props;
  return (
    <span className="cnv-as" role="group" aria-label={CONTENT_WORDS.post.asWhat}>
      {INSTAGRAM_POST_KINDS.map((kind) => (
        <Button
          key={kind}
          size="sm"
          variant={kind === as ? "glass" : "quiet"}
          aria-pressed={kind === as}
          onClick={() => choose(kind)}
          disabled={!kinds.includes(kind)}
          data-testid={`cnv-as-${kind}`}
        >
          {CONTENT_SHEET_WORDS.post.kinds[kind]}
        </Button>
      ))}
    </span>
  );
}

/** What stands at a row's end: a place's switch (Instagram's Post or Story before it), or Don't post for one on its way. */
function PlaceEnd({ at, draft, both }: { at: PlaceStanding; draft: PostBothDraft; both: PlaceRowHands }) {
  const { place } = at;
  if (at.takes)
    return (
      <span className="cnv-dest-end">
        {place === "instagram" && draft.instagram ? (
          <InstagramAs as={draft.as} kinds={both.kinds} choose={both.choose} />
        ) : null}
        <Switch
          label={CONTENT_SHEET_WORDS.post.switchLabel(place)}
          checked={draft[place]}
          onCheckedChange={() => both.toggle(place)}
          data-testid={`cnv-switch-${place}`}
        />
      </span>
    );
  // Where a second post waits beside it, each Don't post stands on its own line (PlaceSaid, PlaceWaitsToo).
  const pull = at.waitsToo ? null : at.pull;
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

/** What the presses beside where a post stands read of the list. */
type LineHands = Pick<PlaceRowHands, "may" | "busy" | "pulling" | "pull" | "moveTime">;

/** A press beside where a post stands (Change time, Don't post, Dismiss): its words, drawn the height of its line. */
function LineAct(props: { words: string; press: () => void; both: LineHands; testid: string }) {
  return (
    <Button
      size="text"
      variant="quiet"
      className="cnv-dest-act"
      onClick={props.press}
      disabled={props.both.busy || props.both.pulling}
      data-testid={props.testid}
    >
      {props.words}
    </Button>
  );
}

/**
 * A post on its way at a place beside the newest there (a story set for Sunday beside a post set for Saturday: 00620), on a
 * line of its own: what it is and when it goes, with its own Change time and Don't post, so neither hides the other.
 */
function PlaceWaitsToo({ at, both, clock }: { at: PlaceStanding; both: LineHands; clock: ViewerClock }) {
  const too = at.waitsToo;
  if (!too) return null;
  const line =
    too.stands.is === "timed"
      ? CONTENT_WORDS.piece.step.timed(CONTENT_WORDS.viewer.kinds[too.kind], clock.ahead(too.stands.at))
      : viewerStandsSaid(too.stands, clock);
  const moves = both.may && too.stands.is === "timed" ? too.movable : null;
  const stops = both.may ? too.pull : null;
  return (
    <span className="cnv-dest-said cnv-dest-too" data-testid={`cnv-place-too-${at.place}`}>
      <span className="cnv-dest-status">{line}</span>
      {moves ? (
        <LineAct
          words={CONTENT_SHEET_WORDS.places.move}
          press={() => both.moveTime(moves)}
          both={both}
          testid={`cnv-move-too-${at.place}`}
        />
      ) : null}
      {stops ? (
        <LineAct
          words={CONTENT_WORDS.piece.step.dontPost}
          press={() => both.pull(stops)}
          both={both}
          testid={`cnv-pull-too-${at.place}`}
        />
      ) : null}
    </span>
  );
}

/**
 * A post that is up at a place while a newer one there waits, goes up or stopped (a story set for tomorrow over a post up since
 * Monday): "Posted Monday" with its door, on a line of its own under the newer one, so neither hides the other.
 */
function PlaceUpToo({ at, door, clock }: { at: PlaceStanding; door: ReactNode; clock: ViewerClock }) {
  if (!at.upToo) return null;
  return (
    <span className="cnv-dest-said cnv-dest-up" data-testid={`cnv-place-up-${at.place}`}>
      <span className="cnv-dest-status">{viewerStandsSaid({ is: "up", at: at.upToo.at }, clock)}</span>
      {door ? <span className="cnv-dest-doors">{door}</span> : null}
    </span>
  );
}

/**
 * What a row says under a place's name, on one line: where it stands there, in its tone; the doors to a post that is up there
 * (see it, take it down) beside it; Connect, where the place takes none until it is put right (a post that stopped there for
 * it too); and Dismiss for a post that stopped, which lets it go (00619), where Don't post, at the row's end, stops one that
 * waits (Ruben, 12 Nov 2026: Don't post under Didn't post read as one more refusal). Where the row's end holds the switch for
 * the kind still free (a story beside a post that waits: 00620), Don't post stands on this line. Nothing where the place has
 * nothing to say.
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
  both: LineHands;
}) {
  const doors = at.stands.is === "up" && door ? door : null;
  const connects = (at.stands.is === "none" || at.stands.is === "stuck") && !at.takes && !!at.wont;
  const letGo = both.may ? at.letGo : null;
  // A post set for its time can be set for another while it waits and no run has taken it (00621).
  const moves = both.may && at.stands.is === "timed" ? at.movable : null;
  // Its Don't post, where the row's end is the switch for the kind still free, or a second post waits on a line under it.
  const stops = both.may && (at.takes || at.waitsToo) ? at.pull : null;
  if (!said && !doors && !connects && !letGo && !moves && !stops) return null;
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
          {CONTENT_SHEET_WORDS.places.connect}
        </Button>
      ) : null}
      {moves ? (
        <LineAct
          words={CONTENT_SHEET_WORDS.places.move}
          press={() => both.moveTime(moves)}
          both={both}
          testid={`cnv-move-${at.place}`}
        />
      ) : null}
      {stops ? (
        <LineAct
          words={CONTENT_WORDS.piece.step.dontPost}
          press={() => both.pull(stops)}
          both={both}
          testid={`cnv-pull-${at.place}`}
        />
      ) : null}
      {letGo ? (
        <LineAct
          words={CONTENT_WORDS.piece.step.dismiss}
          press={() => both.pull(letGo)}
          both={both}
          testid={`cnv-pull-${at.place}`}
        />
      ) : null}
    </span>
  );
}

/**
 * A place's row (the content canvas, PhAct "post"): its glyph, its name, and under it, where there is something to say, where
 * the piece stands there or why it can take none, with its doors; at its end its switch or Don't post.
 */
export function PlaceRow(props: {
  at: PlaceStanding;
  draft: PostBothDraft;
  both: PlaceRowHands;
  clock: ViewerClock;
  door: ReactNode;
}) {
  const { draft, both } = props;
  const at = placeDrawnOf(props.at, props.door);
  const { place } = at;
  // A line that holds its own presses (Don't post beside a switch, a second post that waits) runs across the row, under its end.
  const across = (at.takes && !!at.pull) || !!at.waitsToo;
  return (
    <div
      className="cnv-dest"
      data-stands={at.stands.is}
      data-across={across || undefined}
      data-testid={`cnv-place-${place}`}
    >
      <span className="cnv-dest-glyph" aria-hidden="true">
        <Icon name={PLACE_GLYPH[place]} size={15} />
      </span>
      <span className="cnv-dest-words">
        <b>{CONTENT_WORDS.piece.place[place]}</b>
        <PlaceSaid at={at} said={placeSaidOf(at, props.clock)} door={props.door} both={both} />
        <PlaceWaitsToo at={at} both={both} clock={props.clock} />
        <PlaceUpToo at={at} door={props.door} clock={props.clock} />
      </span>
      <PlaceEnd at={at} draft={draft} both={both} />
      {both.refused[place] ? (
        <p className="cnv-note cnv-refused" role="alert" data-testid={`cnv-refused-${place}`}>
          {CONTENT_WORDS.post.oneFailed(place, both.refused[place] ?? "")}
        </p>
      ) : null}
    </div>
  );
}
