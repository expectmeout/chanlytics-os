/**
 * Where it goes, a line a placement (the journey canvas, board Piece, cells 11 to 24; the content loop PRD's 8.2 and
 * 21.3): each place and kind the piece has a post at, where it stands there, and the one thing to do. What each line says
 * and offers is contracts' (content/goes.ts goesLinesOf), read from the piece's posts and its take-down;
 * this draws it, and hands each press to the pane. A place that can still take a post keeps its switch in the list under
 * these (post-both-places.tsx). One thing moves: the ring of a line that mends itself.
 */
import { useId } from "react";
import { CONNECTIONS_PAGE, TAKE_DOWN_WORDS, type PostPlace } from "@chanlytics/contracts";
import { GOES_WORDS, type GoesAct, type GoesLine } from "../model/goes";
import { askAbout, routeDoor } from "../../../frame-verbs";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { AskLine, type ChangeAbout } from "../sheets/ask-change";

/** Each place's mark, wherever a placement is drawn: the list, its lines and the foot. */
export const PLACE_GLYPH = { instagram: "instagram", google: "place", facebook: "facebook" } as const satisfies Record<
  PostPlace,
  string
>;

/** What a line's presses do, each the pane's own. */
export interface GoesPresses {
  /** A press of the pane's is out: every act waits for it. */
  busy: boolean;
  about: ChangeAbout;
  /** Change time, for a post still waiting. */
  move: (postId: string) => void;
  /** Don't post, Leave it out, Dismiss: the post is let go. */
  pull: (postId: string) => void;
  /** Look again, Try again: the places it can go, to approve it there once more. */
  approve: () => void;
  /** Change the words, Shorten it: the caption, where it is typed. */
  words: () => void;
  /** "I deleted it", of a post Chanlytics could not take down. */
  deleted: (postId: string) => void;
  /** "Keep it up", of the same post: it stays, on the owner's word. */
  keep: (postId: string) => void;
}

/** One press beside a line: quiet words the height of the line, or the small button of the line's one fix. */
function GoesPress(props: {
  words: string;
  press?: () => void;
  href?: string;
  lead?: boolean;
  busy: boolean;
  testid: string;
}) {
  const look = props.lead ? ({ size: "sm" } as const) : ({ size: "text", variant: "quiet" } as const);
  if (props.href)
    return (
      <Button
        {...look}
        className="cnv-goes-act"
        href={props.href}
        target="_blank"
        rel="noreferrer"
        data-testid={props.testid}
      >
        {props.words}
        <Icon name="external" size={11} />
      </Button>
    );
  return (
    <Button {...look} className="cnv-goes-act" onClick={props.press} disabled={props.busy} data-testid={props.testid}>
      {props.words}
    </Button>
  );
}

/** A line's act, as its press. The first of a line that needs the owner is its one fix, and is drawn as one. */
function GoesActPress({ act, lead, on, at }: { act: GoesAct; lead: boolean; on: GoesPresses; at: string }) {
  const press = (words: string, run: () => void, kind: string) => (
    <GoesPress words={words} press={run} lead={lead} busy={on.busy} testid={`cnv-goes-${kind}-${at}`} />
  );
  if (act.is === "see")
    return <GoesPress words={GOES_WORDS.seeIt} href={act.href} busy={false} testid={`cnv-goes-see-${at}`} />;
  if (act.is === "open_place")
    return <GoesPress words={act.says} href={act.href} lead={lead} busy={false} testid={`cnv-goes-open-${at}`} />;
  if (act.is === "move") return press(GOES_WORDS.changeTime, () => on.move(act.postId), "move");
  if (act.is === "pull") return press(act.says, () => on.pull(act.postId), "pull");
  if (act.is === "tell_ai")
    return press(act.says, () => askAbout({ about: on.about, prompt: act.prompt, fresh: true }), "tell");
  if (act.is === "approve") return press(act.says, on.approve, "approve");
  if (act.is === "words") return press(act.says, on.words, "words");
  if (act.is === "deleted") return press(TAKE_DOWN_WORDS.deleted, () => on.deleted(act.postId), "deleted");
  if (act.is === "keep") return press(TAKE_DOWN_WORDS.keep, () => on.keep(act.postId), "keep");
  if (act.is === "connect")
    return (
      <Button
        size="sm"
        className="cnv-goes-act"
        {...routeDoor(CONNECTIONS_PAGE)}
        data-testid={`cnv-goes-connect-${at}`}
      >
        {GOES_WORDS.connect}
      </Button>
    );
  return null;
}

/** Asking AI leaves the sheet as it is: the conversation opens beside it. */
const STAYS = (): void => undefined;

/** One placement: its glyph and name, where it stands with its tone's dot, a quieter note, and its acts. */
function GoesRow({ line, on }: { line: GoesLine; on: GoesPresses }) {
  const at = `${line.place}-${line.kind}`;
  const buttons = line.acts.filter((act) => act.is !== "say_ai");
  const toAi = line.acts.find((act) => act.is === "say_ai");
  return (
    <div className="cnv-goes-line" data-tone={line.tone || undefined} data-testid={`cnv-goes-${at}`}>
      <span className="cnv-goes-glyph" aria-hidden="true">
        <Icon name={PLACE_GLYPH[line.place]} size={15} />
      </span>
      <div className="cnv-goes-words">
        <b>{line.name}</b>
        <span className="cnv-goes-said" data-testid={`cnv-goes-said-${at}`}>
          <span className="cnv-goes-dot" data-moving={line.moving || undefined} aria-hidden="true" />
          {line.said}
        </span>
        {line.note ? <p className="cnv-note">{line.note}</p> : null}
        {buttons.length > 0 ? (
          <span className="cnv-goes-acts">
            {buttons.map((act, i) => (
              <GoesActPress key={`${act.is}-${i}`} act={act} lead={i === 0 && line.tone === "you"} on={on} at={at} />
            ))}
          </span>
        ) : null}
        {toAi?.is === "say_ai" ? (
          <AskLine about={on.about} onAsked={STAYS} placeholder={toAi.hint} begin={toAi.begin} />
        ) : null}
      </div>
    </div>
  );
}

/** The piece's placements, each on its line; nothing where it is nowhere yet (the places it can go say so, under). */
export function WhereItGoes({ lines, on }: { lines: readonly GoesLine[]; on: GoesPresses }) {
  const titleId = useId();
  if (lines.length === 0) return null;
  return (
    <section className="cnv-goes-part" aria-labelledby={titleId} data-testid="cnv-goes">
      <h3 className="cnv-sect" id={titleId}>
        {GOES_WORDS.title}
      </h3>
      <div className="cnv-goes">
        {lines.map((line) => (
          <GoesRow key={line.key} line={line} on={on} />
        ))}
      </div>
    </section>
  );
}
