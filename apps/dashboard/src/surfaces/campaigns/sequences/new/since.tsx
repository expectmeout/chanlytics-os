/**
 * What changed while the owner was away from New (the canvas "New: start from what's ready", N11): New keeps, in the tab,
 * what it last saw of the workspace (who said yes, the leads ready, the calendar) and the line that stood in its field.
 * Opened again, it says what went from nothing to something ("38 people said yes to messages") and offers the kept line
 * back, to draft in one press. The line is offered, never put back in the field by itself, and it is let go as it is
 * drafted, so an old line does not come back for something it was not about. It is kept as the page's place in the tab
 * (bridge/tab-memory.ts), never as a draft: a line alone is not work, and the tab closes over it without asking.
 */
import { useEffect, useState } from "react";
import { NEW_WORDS as W } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { tabMemory } from "../../../kit/record/shell-verbs";
import { gate } from "../../../frame-verbs";
import { NEW_LINE_MIN } from "./line";
import { CaseNote } from "./new-parts";
import type { StartReads } from "./ready";
import { NEW_READY_WORDS as R, newSinceWords, type NewSeen } from "./ready-rules";

/** Where the tab keeps it: New's page, the view as it was left. */
const NEW_PAGE = "new";
const LEFT_VIEW = "left";

/** What the tab holds of New as it was left. */
interface Left {
  line: string | null;
  seen: NewSeen;
}

/** What the tab kept, read as what this keeps: a place of another shape is nothing. */
function leftFromPlace(place: Record<string, unknown> | null | undefined): Left | null {
  if (!place || place.seen !== true) return null;
  return {
    line: typeof place.line === "string" ? place.line : null,
    seen: {
      everyone: Number(place.everyone) || 0,
      leads: Number(place.leads) || 0,
      calendar: place.calendar === true,
    },
  };
}

/** `seen` marks it kept: a workspace with nobody, no leads and no calendar is still a place to come back to. */
const keepLeft = (left: Left): void => {
  tabMemory()?.keepPlace(NEW_PAGE, LEFT_VIEW, { seen: true, line: left.line, ...left.seen });
};

/** A line as it is drafted is done with: what the tab kept of it is let go. */
export function forgetLeftLine(): void {
  const left = leftFromPlace(tabMemory()?.place(NEW_PAGE, LEFT_VIEW));
  if (left) keepLeft({ ...left, line: null });
}

export function Since(props: { reads: StartReads; line: string; may: boolean; onDraft: (words: string) => void }) {
  const [left] = useState(() => leftFromPlace(tabMemory()?.place(NEW_PAGE, LEFT_VIEW)));
  const everyone = props.reads.everyone ?? 0;
  const leads = (props.reads.sources ?? []).reduce((sum, source) => sum + source.ready, 0);
  const calendar = props.reads.calendarOn;
  const line = props.line.trim();
  useEffect(() => {
    keepLeft({ line: line || null, seen: { everyone, leads, calendar } });
  }, [line, everyone, leads, calendar]);
  const since = newSinceWords(left?.seen ?? null, { everyone, leads, calendar });
  if (since.length === 0) return null;
  const kept = !line && left?.line && left.line.length >= NEW_LINE_MIN ? left.line : null;
  return (
    <CaseNote
      tone="plain"
      glyph="check"
      title={R.since.cap}
      words={
        <>
          {since.join(" · ")}
          {kept && props.may ? <span className="sq-nw-since-line">{R.since.kept(kept)}</span> : null}
        </>
      }
      acts={
        kept && props.may ? (
          // Quiet: the page's one coral act is the open start's.
          <Button size="sm" onClick={() => props.onDraft(kept)} data-testid="sq-nw-since-go" {...gate("approve")}>
            {W.say.draft}
          </Button>
        ) : undefined
      }
      testid="sq-nw-since"
    />
  );
}
