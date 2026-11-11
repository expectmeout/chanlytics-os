/**
 * What New opens on (the canvas "New: start from what's ready", N1 to N3, N11): the starts the workspace can begin now,
 * the one reaching most people standing open with the message it would send, the rest a row each; then the one thing
 * each other start needs, always there. Which starts, and in what order, is contracts' (new-ready.ts): counted by code
 * from what Campaigns already reads, so nothing here waits on Ask. A viewer reads what is happening, where someone
 * waits, as a fact with nothing to press. Hookless.
 */
import {
  NEW_READY_MAX,
  NEW_READY_WORDS as R,
  NEW_WORDS as W,
  exampleParams,
  leadsRoute,
  readyStartsOf,
  startersForTrigger,
  visitWhenExample,
  type AppointmentWord,
  type NewMessage,
  type ReadyReads,
  type ReadyStart,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { Panel } from "../../../kit/panel/panel";
import { gate } from "../../../frame-verbs";
import { MessagePreview } from "../../parts/message-preview";
import type { LibraryReads } from "./new-message-sheets";
import * as M from "./new-model";
import { Choice, type WhoReads } from "./new-sheets";

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

/** What contracts counts the starts from, of what New reads. */
export const readyReadsOf = (reads: StartReads): ReadyReads => ({
  moments: reads.moments,
  lists: reads.lists,
  everyone: reads.everyone,
  sources: reads.sources ? reads.sources.map((s) => ({ id: s.id, name: s.name, ready: s.ready })) : null,
  running: reads.running,
  calendarOn: reads.calendarOn,
  hasDeals: reads.hasDeals,
  word: reads.word,
});

/** The message a start on a moment would send: the first of the moment's starters the workspace holds, or none. */
function heldFor(start: ReadyStart, library: LibraryReads | null): NewMessage | null {
  if (!start.trigger || !library) return null;
  for (const starter of startersForTrigger(start.trigger)) {
    const message = library.messages.find((m) => m.name === starter.name);
    const held = message ? M.heldMessageOf(message, library.rows) : null;
    if (held) return held;
  }
  return null;
}

/** The start that stands open: who it reaches, the message it would send or that Ask writes it, and its one act. */
function OpenStart(p: { start: ReadyStart; held: NewMessage | null; business: string; onStart: () => void }) {
  const { start, held } = p;
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
          values={exampleParams(held.params, p.business, visitWhenExample(start.trigger))}
        />
      ) : null}
      <p className="sq-nw-open-meta">{R.firstWaits}</p>
      <Button variant="primary" onClick={p.onStart} data-testid={`sq-nw-start-${start.id}`} {...gate("approve")}>
        {R.open}
      </Button>
    </Panel>
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

/** What's ready, then One step away. */
export function Ready(p: { reads: StartReads; may: boolean; onStart: (s: ReadyStart) => void }) {
  const all = readyStartsOf(readyReadsOf(p.reads));
  // A viewer reads what is happening: only where someone waits.
  const shown = (p.may ? all : all.filter((s) => (s.people ?? 0) > 0)).slice(0, NEW_READY_MAX);
  const top = p.may ? shown[0] : undefined;
  const rows = top ? shown.slice(1) : shown;
  const setup = setupOf(p.reads);
  return (
    <>
      {shown.length ? (
        <>
          <p className="sq-nw-cap sq-nw-cap-pair">
            <span>{p.may ? R.cap : W.starts.happening}</span>
            {p.may && shown.length > 1 ? <small>{R.order}</small> : null}
          </p>
          <div className="sq-nw-ready" data-testid="sq-nw-starts">
            {top ? (
              <OpenStart
                start={top}
                held={heldFor(top, p.reads.library)}
                business={p.reads.business}
                onStart={() => p.onStart(top)}
              />
            ) : null}
            {rows.length ? (
              <div className="sq-nw-rows">
                {rows.map((s) => (
                  <Choice
                    key={s.id}
                    glyph={s.glyph}
                    name={p.may ? s.title : s.fact.title}
                    said={p.may ? s.said : s.fact.said}
                    tag={p.may ? W.starts.kind[s.kind] : null}
                    onPick={p.may ? () => p.onStart(s) : null}
                    testid={`sq-nw-start-${s.id}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
      {setup.length ? (
        <>
          <p className="sq-nw-cap">{R.oneStep}</p>
          <div className="sq-nw-rows" data-testid="sq-nw-setup">
            {setup.map((s) => (
              <Choice
                key={s.id}
                glyph="plus"
                name={s.title}
                said={s.said}
                door={s.door}
                testid={`sq-nw-setup-${s.id}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
