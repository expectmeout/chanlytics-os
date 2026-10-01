/**
 * Who a run reaches, and the shape of its last runs (moved from legacy/components/campaign-bits.jsx, decision 0015):
 * `CmReach` says the number that gets a message with the subtractions named, `CmSpark` draws the last few runs as bars.
 */
import type { ReactNode } from "react";
import { navigate } from "../../legacy-verbs";

/** The one reason an owner can act on: where they act on it. */
interface CmReachDoor {
  words: string;
  to: string;
}

/** One line of why anybody is held back: "12 heard from a playbook this week". */
interface CmReachReason {
  t: ReactNode;
  tone?: string;
  door?: CmReachDoor | null;
}

interface CmReachProps {
  will: number;
  pool: number;
  of?: string | null;
  held?: number;
  reasons?: CmReachReason[];
  size?: string;
  progress?: number | null;
  label?: string | null;
  testid?: string | null;
}

/** A reason's door, the button that goes to where it is fixed. */
function reasonDoor(door: CmReachDoor, testid: string | null) {
  return (
    <button
      type="button"
      className="cm-reach-door"
      onClick={() => navigate(door.to)}
      data-testid={testid ? `${testid}-door` : undefined}
    >
      {door.words}
    </button>
  );
}

/** What the bar says of itself: a send in flight is a progress bar a screen reader can hear, else it is aria-hidden. */
function barSaid(progress: number | null, label: string | null) {
  return progress === null
    ? { "aria-hidden": "true" as const }
    : {
        role: "progressbar",
        "aria-label": label || "Sent so far",
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": Math.round(progress * 100),
      };
}

/**
 * Who a run will actually reach, with the subtractions named: the number that
 * gets it, out of how many, a bar of the two -- those it reaches, those held
 * back -- and one line per reason anybody is held back.
 *
 *   will     how many get it
 *   pool     out of how many
 *   of       what the pool is, after "of 36": "who said yes"
 *   held     how many of the pool are held back (the amber part of the bar)
 *   reasons  [{ t, tone, door? }]: "12 heard from a playbook this week"; a door is { words, to }
 */
export function CmReach({
  will,
  pool,
  of = null,
  held = 0,
  reasons = [],
  size = "md",
  progress = null,
  label = null,
  testid = null,
}: CmReachProps) {
  const total = Math.max(pool, will + held, 1);
  const w = Math.round((Math.min(will, total) / total) * 100);
  const h = Math.round((Math.min(held, total - will) / total) * 100);
  return (
    <div className={`cm-reach cm-reach-${size}`} data-testid={testid || undefined}>
      <div className="cm-reach-n">
        <span className="cm-reach-will tabular">{will}</span>
        <span className="cm-reach-of">
          of <span className="tabular">{pool}</span>
          {of ? ` ${of}` : ""}
        </span>
      </div>
      {/* A send in flight is a progress bar a screen reader can hear; otherwise the bar is a picture of the numbers above it. */}
      <div className="cm-reach-bar" {...barSaid(progress, label)}>
        {w > 0 && <span className="cm-reach-bar-will" style={{ width: `${w}%` }} />}
        {h > 0 && <span className="cm-reach-bar-held" style={{ width: `${h}%` }} />}
        <span className="cm-reach-bar-rest" />
      </div>
      {reasons.length > 0 && (
        <ul className="cm-reach-why">
          {reasons.map((r, i) => (
            <li key={i}>
              <span className="cm-reach-dot" data-tone={r.tone || "plain"} aria-hidden="true" />
              {r.t}
              {/* The one reason an owner can act on opens where they act on it. */}
              {r.door && reasonDoor(r.door, testid)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface CmSparkProps {
  values?: readonly number[];
  label?: string | null;
}

/** The last few runs as bars of what each sent, oldest first: a shape, not a chart. */
export function CmSpark({ values = [], label = null }: CmSparkProps) {
  if (!values.length) return null;
  const top = Math.max(...values, 1);
  return (
    <span className="cm-spark" aria-label={label || undefined} role={label ? "img" : undefined}>
      {values.map((v, i) => (
        <span
          key={i}
          className="cm-spark-bar"
          style={{ height: `${Math.max(v > 0 ? 3 : 1, Math.round((v / top) * 15))}px` }}
        />
      ))}
    </span>
  );
}
