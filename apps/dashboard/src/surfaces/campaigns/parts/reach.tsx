/**
 * Who a run reaches (moved from legacy/components/campaign-bits.jsx, decision 0015):
 * `CmReach` says the number that gets a message with the subtractions named. The
 * playbook composer's To row draws the same number on one line instead (`CmWho`: the count, who it reaches on which
 * channel, and the subtractions behind "Who's held back"), with the split as a bar where it goes by more than WhatsApp.
 */
import type { ReactNode } from "react";
import type { ReachSplit } from "@chanlytics/contracts";
import { LinkButton } from "../../kit/link-button/link-button";
import { Meter } from "../../kit/meter/meter";
import { navigate } from "../../legacy-verbs";
import { CmHeldBack } from "./held-back";
import { CmSplitBar } from "./split-bar";

/** The one reason an owner can act on: where they act on it. */
interface CmReachDoor {
  words: string;
  to: string;
}

/** One line of why anybody is held back: "12 heard from a campaign this week". */
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
  /** Who it reaches on which channel, in a line, where it goes by more than WhatsApp alone (parts/channels.ts cmSplitWords). */
  split?: string | null;
  size?: string;
  progress?: number | null;
  label?: string | null;
  testid?: string | null;
}

/** A reason's door, the button that goes to where it is fixed. */
function reasonDoor(door: CmReachDoor, testid: string | null) {
  return (
    <LinkButton
      className="cm-reach-door"
      onClick={() => navigate(door.to)}
      data-testid={testid ? `${testid}-door` : undefined}
    >
      {door.words}
    </LinkButton>
  );
}

/** The reasons anybody is held back, a line each, the one an owner can act on with its door: the card's, and the fold's. */
function CmReachWhy({ reasons, testid }: { reasons: readonly CmReachReason[]; testid: string | null }) {
  return (
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
 *   reasons  [{ t, tone, door? }]: "12 heard from a campaign this week"; a door is { words, to }
 *   split    "Reaches 84: 52 on WhatsApp, 32 by email", under the number, for a run that goes by more than WhatsApp
 */
export function CmReach({
  will,
  pool,
  of = null,
  held = 0,
  reasons = [],
  split = null,
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
      {split && (
        <p className="cm-reach-by" data-testid={testid ? `${testid}-by` : undefined}>
          {split}
        </p>
      )}
      {reasons.length > 0 && <CmReachWhy reasons={reasons} testid={testid} />}
    </div>
  );
}

interface CmWhoProps {
  will: number;
  pool: number;
  of?: string | null;
  held?: number;
  reasons?: CmReachReason[];
  /** The clause for who it reaches on which channel (parts/channels.ts cmReachBy), where it goes by more than WhatsApp alone. */
  by?: string | null;
  /** The split by channel, drawn as a bar where `by` is said; otherwise the bar is who it reaches against who is held. */
  split?: ReachSplit | null;
  /** The month's emails or texts running out for this run (contracts allowanceBeforeSend), said under the bar; null while there is room. */
  allowance?: string | null;
  testid: string;
}

/**
 * The To row's count on one line, where the card's stood on four: "12 of 40 who said yes · 10 on WhatsApp, 2 by email", the
 * reasons anybody is held back behind one quiet "Who's held back" (each with its door), and under them one thin bar --
 * who it reaches on which channel where it goes by more than WhatsApp, else who it reaches against who is held.
 */
export function CmWho({
  will,
  pool,
  of = null,
  held = 0,
  reasons = [],
  by = null,
  split = null,
  allowance = null,
  testid,
}: CmWhoProps) {
  const total = Math.max(pool, will + held, 1);
  const rest = Math.max(0, total - will - held);
  return (
    <div className="cm-who" data-testid={testid}>
      <p className="cm-who-line">
        <span className="cm-reach-n">
          <span className="cm-reach-will tabular">{will}</span>
          <span className="cm-reach-of">
            of <span className="tabular">{pool}</span>
            {of ? ` ${of}` : ""}
          </span>
        </span>
        {by ? (
          <span className="cm-who-by">
            <span aria-hidden="true">·</span>
            <span data-testid={`${testid}-by`}>{by}</span>
          </span>
        ) : null}
        {reasons.length > 0 && (
          <CmHeldBack testid={`${testid}-held`}>
            <CmReachWhy reasons={reasons} testid={testid} />
          </CmHeldBack>
        )}
      </p>
      {by && split ? (
        <CmSplitBar split={split} className="cm-who-bar" testid={`${testid}-bar`} />
      ) : (
        <Meter
          size="sm"
          className="cm-who-bar"
          parts={[
            { share: will, tone: "ok" },
            { share: held, tone: "warn" },
            { share: rest, color: "var(--line-strong)" },
          ]}
          aria-label={`${will} of ${pool} reached${held > 0 ? `; ${held} wait` : ""}`}
        />
      )}
      {allowance && (
        <p className="cm-who-allowance" data-testid={`${testid}-allowance`}>
          {allowance}
        </p>
      )}
    </div>
  );
}
