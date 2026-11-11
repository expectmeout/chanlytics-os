/**
 * The customers' journey on New (the canvas "New: start from what's ready", N10): a strip of dots, one a moment, filled
 * where a sequence stands on it, and the map it opens: each moment in the order a customer passes it, with the sequence
 * on it and its door, or the press that drafts one, or what it needs first. It takes the place of the sentence "Runs
 * already: … and 3 more". Which moments, and in what order, is contracts' (new-ready.ts newJourneyOf).
 */
import { useState } from "react";
import {
  NEW_READY_WORDS as R,
  NEW_WORDS as W,
  journeyCovered,
  newJourneyOf,
  sequenceRoute,
  type JourneyMoment,
  type ReadyReads,
  type ReadyStart,
} from "@chanlytics/contracts";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Panel } from "../../../kit/panel/panel";
import { Choice, PickSheet } from "./new-sheets";

/** What a moment's row says under its name: the sequence on it, what it needs, who it would reach, or when it comes. */
const saidOf = (m: JourneyMoment): string =>
  m.on ? m.on.name : m.needs ? R.needsCalendar : m.people ? R.reach(m.people) : m.hint;

export function Journey(p: { reads: ReadyReads; may: boolean; onStart: (s: ReadyStart) => void }) {
  const [open, setOpen] = useState(false);
  const journey = newJourneyOf(p.reads);
  if (journey.length === 0) return null;
  const covered = journeyCovered(journey);
  return (
    <>
      <Panel variant="inset" size="sm" className="sq-nw-jr" data-testid="sq-nw-journey">
        <b>{R.journey}</b>
        <LinkButton onClick={() => setOpen(true)} data-testid="sq-nw-map-open">
          {R.map}
        </LinkButton>
        <span className="sq-nw-jr-dots" aria-hidden="true">
          {journey.map((m) => (
            <i key={m.id} data-on={m.on ? "" : undefined} />
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
          {journey.map((m) => {
            const start = p.may ? m.start : null;
            return (
              <Choice
                key={m.id}
                glyph={m.on ? "check" : "clock"}
                name={m.label}
                said={saidOf(m)}
                full
                // Only what cannot run here yet steps back: a moment a sequence stands on is as present as an open one.
                off={!!m.needs}
                door={m.on ? { label: W.sheets.open, to: sequenceRoute(m.on.id) } : null}
                tag={start ? R.draft : null}
                onPick={
                  start
                    ? () => {
                        setOpen(false);
                        p.onStart(start);
                      }
                    : null
                }
                testid={`sq-nw-map-${m.id}`}
              />
            );
          })}
        </div>
        <p className="sq-nw-note">{R.anyTime}</p>
      </PickSheet>
    </>
  );
}
