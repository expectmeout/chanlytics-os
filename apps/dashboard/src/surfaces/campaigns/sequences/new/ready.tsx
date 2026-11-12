/**
 * What New opens on (the canvas "New: start from what's ready", N1 to N3, N11): the starts the workspace can begin now,
 * the first standing open with the message it would send, the rest a row each; then the one thing each other start
 * needs, always there. Which starts, and in what order, is ready-rules.ts's: counted by code from what Campaigns already
 * reads, so nothing here waits on Ask. A viewer reads what is happening, where someone waits, as a fact with nothing to
 * press. Hookless.
 */
import {
  NEW_WORDS as W,
  exampleParams,
  leadsRoute,
  startersForTrigger,
  visitWhenExample,
  type AppointmentWord,
  type NewMessage,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { Panel } from "../../../kit/panel/panel";
import { gate } from "../../../frame-verbs";
import { MessagePreview } from "../../parts/message-preview";
import { Choice } from "./choice";
import type { LibraryReads } from "./new-message-sheets";
import * as M from "./new-model";
import type { WhoReads } from "./new-sheets";
import { NEW_READY_MAX, NEW_READY_WORDS as R, readyStartsOf, type ReadyReads, type ReadyStart } from "./ready-rules";

/** What the first screen reads: who it could be for (the who sheet's), the calendar, the Library, and the business. */
export interface StartReads extends WhoReads {
  calendarOn: boolean;
  word: AppointmentWord;
  /** How many messages the Library holds; null where it was not read. */
  messages: number | null;
  /** The Library, where a start's own message is looked up; null where it was not read. */
  library: LibraryReads | null;
  /** The business's name, which a message's preview is filled with. */
  business: string;
  /** Whether a deal was ever recorded here: a proposal's moment is offered only then. */
  hasDeals: boolean;
}

/** What the rules count the starts from, of what New reads. */
export const readyReadsOf = (reads: StartReads): ReadyReads => ({
  moments: reads.moments,
  lists: reads.lists,
  everyone: reads.everyone,
  sources: reads.sources
    ? reads.sources.map((source) => ({ id: source.id, name: source.name, ready: source.ready }))
    : null,
  running: reads.running,
  hasDeals: reads.hasDeals,
  word: reads.word,
});

/** The message a start on a moment would send: the first of the moment's starters the workspace holds, or none. */
function heldMessageFor(start: ReadyStart, library: LibraryReads | null): NewMessage | null {
  if (!start.trigger || !library) return null;
  for (const starter of startersForTrigger(start.trigger)) {
    const message = library.messages.find((held) => held.name === starter.name);
    const held = message ? M.heldMessageOf(message, library.rows) : null;
    if (held) return held;
  }
  return null;
}

/** The start that stands open: who it reaches, the message it would send or that Ask writes it, and its one act. */
function OpenStart({
  start,
  held,
  business,
  onStart,
}: {
  start: ReadyStart;
  held: NewMessage | null;
  business: string;
  onStart: () => void;
}) {
  return (
    <Panel variant="inset" className="sq-nw-open" data-testid={`sq-nw-open-${start.id}`}>
      <div className="sq-nw-open-head">
        <span className="sq-nw-open-glyph" aria-hidden="true">
          <Icon name={start.glyph} size={16} />
        </span>
        <p>
          <b>{start.title}</b>
          <span>{start.said}</span>
        </p>
      </div>
      <p className="sq-nw-open-by">
        {held ? (
          R.yours(held.title)
        ) : (
          <>
            <Icon name="three" size={13} />
            {R.askWrites}
          </>
        )}
      </p>
      {held ? (
        <MessagePreview
          plain
          body={held.body}
          values={exampleParams(held.params, business, visitWhenExample(start.trigger))}
        />
      ) : null}
      <div className="sq-nw-open-foot">
        <p className="sq-nw-open-meta">{R.firstWaits}</p>
        <Button variant="primary" onClick={onStart} data-testid={`sq-nw-start-${start.id}`} {...gate("approve")}>
          {R.open}
        </Button>
      </div>
    </Panel>
  );
}

/** A start as a row: what an owner presses, or the fact a viewer reads. */
function ReadyRow({ start, may, onStart }: { start: ReadyStart; may: boolean; onStart: (start: ReadyStart) => void }) {
  return (
    <Choice
      glyph={start.glyph}
      name={may ? start.title : start.fact.title}
      said={may ? start.said : start.fact.said}
      full
      // New makes a sequence unless it says otherwise: only the one sent once wears its kind.
      tag={may && start.kind === "once" ? W.starts.kind.once : null}
      onPick={may ? () => onStart(start) : null}
      testid={`sq-nw-start-${start.id}`}
    />
  );
}

interface ReadyProps {
  reads: StartReads;
  may: boolean;
  onStart: (start: ReadyStart) => void;
}

/** What's ready: the first start standing open, the rest a row each. A viewer reads only where someone waits. */
function Starts({ reads, may, onStart }: ReadyProps) {
  const all = readyStartsOf(readyReadsOf(reads));
  const shown = (may ? all : all.filter((start) => (start.people ?? 0) > 0)).slice(0, NEW_READY_MAX);
  if (shown.length === 0) return null;
  const top = may ? shown[0] : undefined;
  const rows = top ? shown.slice(1) : shown;
  return (
    <>
      <p className="sq-nw-cap sq-nw-cap-pair">
        <span>{may ? R.cap : W.starts.happening}</span>
        {may && shown.length > 1 ? <small>{R.order}</small> : null}
      </p>
      <div className="sq-nw-ready" data-testid="sq-nw-starts">
        {top ? (
          <OpenStart
            start={top}
            held={heldMessageFor(top, reads.library)}
            business={reads.business}
            onStart={() => onStart(top)}
          />
        ) : null}
        {rows.length ? (
          <div className="sq-nw-rows">
            {rows.map((start) => (
              <ReadyRow key={start.id} start={start} may={may} onStart={onStart} />
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

/** What each other start needs first: the calendar, someone who said yes, a search with leads. */
function setupOf(
  reads: StartReads,
): { id: string; title: string; said: string; door: { label: string; to: string } }[] {
  const out = [];
  if (!reads.calendarOn)
    out.push({
      id: "calendar",
      title: W.starts.remind,
      said: W.starts.needsCalendar,
      door: { label: W.starts.connect, to: "settings" },
    });
  if (reads.everyone === 0)
    out.push({
      id: "everyone",
      title: W.starts.toEveryone,
      said: W.starts.noOneYet,
      door: { label: W.starts.import, to: "people" },
    });
  if (reads.sources && reads.sources.length === 0)
    out.push({
      id: "leads",
      title: W.starts.nearYou,
      said: W.starts.findFirst,
      door: { label: W.starts.find, to: leadsRoute({ list: "all" }) },
    });
  return out;
}

/** One step away: each thing a start still needs, with the door that sets it up. */
function OneStepAway({ reads }: { reads: StartReads }) {
  const setup = setupOf(reads);
  if (setup.length === 0) return null;
  return (
    <>
      <p className="sq-nw-cap">{R.oneStep}</p>
      <div className="sq-nw-rows" data-testid="sq-nw-setup">
        {setup.map((step) => (
          <Choice
            key={step.id}
            glyph="plus"
            name={step.title}
            said={step.said}
            door={step.door}
            testid={`sq-nw-setup-${step.id}`}
          />
        ))}
      </div>
    </>
  );
}

/** What's ready, then One step away. */
export function Ready(props: ReadyProps) {
  return (
    <>
      <Starts {...props} />
      <OneStepAway reads={props.reads} />
    </>
  );
}
