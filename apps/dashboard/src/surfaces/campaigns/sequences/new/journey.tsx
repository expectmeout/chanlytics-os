/**
 * The customers' journey on New (the canvas "New: start from what's ready", N10): a strip of dots, one a moment, filled
 * where a sequence stands on it, and the map it opens: each moment in the order a customer passes it, with the sequence
 * on it and its door, or the press that drafts one, or what it needs first. It takes the place of the sentence "Runs
 * already: … and 3 more". Which moments, and in what order, is ready-rules.ts's (newJourneyOf).
 */
import { useState } from "react";
import { NEW_WORDS as W, sequenceRoute } from "@chanlytics/contracts";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Panel } from "../../../kit/panel/panel";
import { Choice } from "./choice";
import { PickSheet } from "./new-sheets";
import {
  NEW_READY_WORDS as R,
  journeyCovered,
  newJourneyOf,
  type JourneyMoment,
  type ReadyReads,
  type ReadyStart,
} from "./ready-rules";

/** What a moment's row says under its name: the sequence on it, what it needs, who it would reach, or when it comes. */
function momentSaid(moment: JourneyMoment): string {
  if (moment.on) return moment.on.name;
  if (moment.needs) return R.needsCalendar;
  return moment.people ? R.reach(moment.people) : moment.hint;
}

/** A moment on the map: the sequence on it and its door, or the press that drafts one, or what it needs first. */
function MapRow({ moment, onDraft }: { moment: JourneyMoment; onDraft: ((start: ReadyStart) => void) | null }) {
  const start = onDraft ? moment.start : null;
  return (
    <Choice
      glyph={moment.on ? "check" : "clock"}
      name={moment.label}
      said={momentSaid(moment)}
      full
      // Only what cannot run here yet steps back: a moment a sequence stands on is as present as an open one.
      off={!!moment.needs}
      door={moment.on ? { label: W.sheets.open, to: sequenceRoute(moment.on.id) } : null}
      tag={start ? R.draft : null}
      onPick={start && onDraft ? () => onDraft(start) : null}
      testid={`sq-nw-map-${moment.id}`}
    />
  );
}

export function Journey(props: { reads: ReadyReads; may: boolean; onStart: (start: ReadyStart) => void }) {
  const [open, setOpen] = useState(false);
  const journey = newJourneyOf(props.reads);
  if (journey.length === 0) return null;
  const covered = journeyCovered(journey);
  // A draft pressed on the map closes it first: the draft is drawn where the map stood.
  const draft = (start: ReadyStart) => {
    setOpen(false);
    props.onStart(start);
  };
  return (
    <>
      <Panel variant="inset" size="sm" className="sq-nw-jr" data-testid="sq-nw-journey">
        <b>{R.journey}</b>
        <LinkButton onClick={() => setOpen(true)} data-testid="sq-nw-map-open">
          {R.map}
        </LinkButton>
        <span className="sq-nw-jr-dots" aria-hidden="true">
          {journey.map((moment) => (
            <i key={moment.id} data-on={moment.on ? "" : undefined} />
          ))}
        </span>
        <small>{R.covered(covered, journey.length)}</small>
      </Panel>
      <PickSheet
        open={open}
        title={R.journey}
        sub={R.mapSub(covered, journey.length)}
        onClose={() => setOpen(false)}
        testid="sq-nw-map"
      >
        <div className="sq-nw-rows">
          {journey.map((moment) => (
            <MapRow key={moment.id} moment={moment} onDraft={props.may ? draft : null} />
          ))}
        </div>
        <p className="sq-nw-note">{R.anyTime}</p>
      </PickSheet>
    </>
  );
}
