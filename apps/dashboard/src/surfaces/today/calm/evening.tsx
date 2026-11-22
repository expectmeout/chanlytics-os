/**
 * Today once the day is over (Working for you, 21 Nov 2026, W5 and W16). By the business's own hours, as Settings keep
 * them, the day has closed: the day's line has turned to tomorrow (contracts todayZoneDay), and the page rests. Who truly
 * needs you still stands; what AI sends tonight is one line, its Stop for each in AI's sheet; the to-dos, what AI found,
 * setting up, Content and the pinned lists fold into one line that waits for morning; and the page warms a little
 * (evening.css), never a colour that means something. A business with no hours set keeps the day's page as it is: the day
 * it turns after its last visit is not an evening anyone told it about.
 */
import type { ReactNode } from "react";
import { useState } from "react";
import { DEFAULT_TIMEZONE, dayInZone, runTitleOf, tzClock, type BroadcastVM } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { SAYS_WHEN } from "../../kit/says-when";
import { routeDoor } from "../../frame-verbs";
import { useSurface } from "../../use-surface";
import { nextRuns } from "../ai/runs";
import { openAiSheet } from "../ai/open";
import { AI_WORDS } from "../model/ai";
import { TODAY_LINE_WORDS } from "../model/lines";
import { workspaceClock } from "../shell";
import { CalmList, CalmOpen, CalmRow } from "./lines";

const EVENING = TODAY_LINE_WORDS.evening;

/** What waits for morning, counted where the page already counts it (arrangement.ts): none of it is read again here. */
export interface TodayMorning {
  /** The to-dos, the visits to mark and the reviews to answer, as To do counts them. */
  toDo: number;
  /** Where the to-dos open: the first step's page, the first visit to mark, else none. */
  toDoDoor: string | null;
  /** What AI found, every row of it. */
  found: number;
  /** Setting up has a step left. */
  setup: boolean;
}

const businessZoneOf = (): string => workspaceClock()?.zone() ?? DEFAULT_TIMEZONE;

/** The runs set to go before the day is out, as the business's zone counts the day: tomorrow's are not tonight's. */
function tonightRuns(rows: readonly BroadcastVM[] | undefined, nowMs: number): BroadcastVM[] {
  const tz = businessZoneOf();
  const today = dayInZone(tz, nowMs).key;
  return nextRuns(rows, nowMs).filter((r) => dayInZone(tz, Date.parse(r.scheduled_for ?? "")).key === today);
}

/**
 * What AI sends tonight, one line (W3 in the evening): how many it goes to, the first by its name and time, and a press
 * that opens AI's sheet, whose Next has a Stop for each. Nothing where nothing goes tonight.
 */
export function TonightLine() {
  const runs = tonightRuns(useSurface("broadcasts")?.rows, Date.now());
  const [first] = runs;
  if (!first) return null;
  const people = runs.reduce((n, r) => n + r.recipient_count, 0);
  const at = tzClock(first.scheduled_for ?? "", businessZoneOf(), new Date()) ?? first.when;
  return (
    <CalmList label={AI_WORDS.tonight(people)} testid="today-tonight">
      <CalmRow
        first={{ mark: <Icon name="send" size={14} /> }}
        name={AI_WORDS.tonight(people)}
        said={<span {...SAYS_WHEN}>{AI_WORDS.tonightSaid(runTitleOf(first), at, runs.length - 1)}</span>}
        press={openAiSheet}
        testid="today-tonight-line"
      />
    </CalmList>
  );
}

/** What the morning line says it holds, in the page's order; empty where nothing waits for morning. */
function morningSaid(m: TodayMorning): string[] {
  return [
    m.toDo > 0 ? TODAY_LINE_WORDS.toDo(m.toDo) : null,
    m.found > 0 ? EVENING.found(m.found) : null,
    m.setup ? EVENING.setup : null,
  ].filter((part): part is string => part !== null);
}

/** Whether anything waits for morning: the one line has something to hold (the head says so only then). */
export const morningWaits = (morning: TodayMorning): boolean => morningSaid(morning).length > 0;

/**
 * What can wait, folded into one line that waits for morning (W5): it says what it holds, and opens under itself on a
 * press, as the page's other folds do (CalmOpen). Where nothing counted waits, the lines stand as they would by day.
 */
export function MorningFold({ morning, children }: { morning: TodayMorning; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const parts = morningSaid(morning);
  if (!parts.length) return <>{children}</>;
  return (
    <CalmList label={EVENING.morning} testid="today-morning">
      <CalmRow
        first={{ mark: <Icon name="moon" size={14} /> }}
        name={EVENING.morning}
        said={open ? undefined : parts.join(" · ")}
        press={() => setOpen(!open)}
        open={open}
        under={
          <CalmOpen open={open}>
            <div className="calm-morning" data-testid={open ? "today-morning-open" : undefined}>
              {morning.toDo > 0 ? (
                <CalmList label={EVENING.morning} testid="today-morning-todo">
                  <CalmRow
                    quiet
                    name={TODAY_LINE_WORDS.toDo(morning.toDo)}
                    door={morning.toDoDoor ? routeDoor(morning.toDoDoor) : null}
                    testid="today-morning-todo-line"
                  />
                </CalmList>
              ) : null}
              {children}
            </div>
          </CalmOpen>
        }
        testid="today-morning-line"
      />
    </CalmList>
  );
}
