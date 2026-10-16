/**
 * Who a run reaches (moved from legacy/components/campaign-bits.jsx, decision 0015): a send's sentence draws the number
 * that gets a message on one quiet line under it (`CmReachLine`), the subtractions named behind it. The card that said it
 * as a bar on Sent's runs went with Sent's list (decision 0060, D3).
 */
import type { ReactNode } from "react";
import { LIFECYCLE_WORDS, PREVIEW_WORDS } from "@chanlytics/contracts";
import type { ReachSplit } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Popover } from "../../kit/popover/popover";
import { navigate } from "../../legacy-verbs";
import { CmSplitBar } from "./split-bar";

/** The one reason an owner can act on: where they act on it. */
interface CmReachDoor {
  words: string;
  to: string;
}

/** One line of why anybody is held back: "12 hear from you within a week of it" (a message sent or due). */
interface CmReachReason {
  t: ReactNode;
  tone?: string;
  door?: CmReachDoor | null;
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

interface CmReachLineProps {
  will: number;
  /** Out of how many, or null where nobody counted them (a send's list read before its people were): the count alone. */
  pool: number | null;
  /** What the pool is, where nobody is in it: "Nobody with an appointment tomorrow right now". */
  of?: string | null;
  held?: number;
  reasons?: CmReachReason[];
  /** Who it reaches on which channel (parts/channels.ts cmReachBy), where it goes by more than WhatsApp alone. */
  by?: string | null;
  split?: ReachSplit | null;
  /** The month's emails or texts running out for this run, said with the reasons; null while there is room. */
  allowance?: string | null;
  /** The rules every run keeps (who it reaches first, the week's breath), said last in what the line opens. */
  guard?: string | null;
  /** The first reason anybody waits, where the reasons are not a list of lines (a send by hand counts them its own way). */
  first?: string | null;
  /** What the line opens, where the page draws it (a send names the people it holds back): in place of the reasons. */
  box?: ReactNode;
  testid: string;
}

/** The dot before the line: green where everyone it names can hear it, amber where someone is held back, quiet where nobody is named. */
const reachTone = (will: number, pool: number, reasons: number): "ok" | "warn" | "plain" =>
  pool === 0 ? "plain" : will < pool || reasons > 0 ? "warn" : "ok";

/** What the line opens: who it reaches on which channel and its bar, every reason (or the page's own list), the month's allowance, and the rules every run keeps. */
function CmReachBox(p: CmReachLineProps) {
  const { by = null, split = null, reasons = [], box = null, allowance = null, guard = null, testid } = p;
  return (
    <>
      {by ? (
        <p className="cm-reach-by" data-testid={`${testid}-by`}>
          {by}
        </p>
      ) : null}
      {by && split ? <CmSplitBar split={split} className="cm-who-bar" testid={`${testid}-bar`} /> : null}
      {box ?? (reasons.length > 0 && <CmReachWhy reasons={reasons} testid={testid} />)}
      {allowance ? (
        <p className="cm-who-allowance" data-testid={`${testid}-allowance`}>
          {allowance}
        </p>
      ) : null}
      {guard ? (
        <p className="cm-reach-guard" data-testid={`${testid}-guard`}>
          <Icon name="shield" size={11} />
          <span>{guard}</span>
        </p>
      ) : null}
    </>
  );
}

/** The line's own words: its dot, "2 of 6 can hear it", and the first reason anybody waits. */
function reachSaid(p: CmReachLineProps) {
  const { will, pool, of = null, held = 0, reasons = [], first = null } = p;
  const S = LIFECYCLE_WORDS.compose.sentence;
  const total = pool === null ? null : Math.max(pool, will + held);
  const lead = first ?? reasons[0]?.t ?? null;
  return {
    tone: reachTone(will, total ?? will, lead ? 1 : 0),
    said: total === 0 ? S.nobody(of ?? "") : S.hear(will, total),
    lead,
  };
}

/**
 * Who it reaches now, as one quiet line under a campaign's sentence (Ruben, 11 Oct 2026, "Option B"): a dot, "2 of 6 can
 * hear it", and the first reason anybody is held back ("4 never said yes to offers"); the line is the press that opens the
 * rest in the kit's popover -- every reason with its door, who it reaches on which channel and its bar, and the month's
 * allowance. It stood as a count, a clause by channel, a link and a bar on two lines, between the sentence and the message.
 * The count it says is on the line as `data-count` too, so a browser test reads the number rather than the sentence.
 */
export function CmReachLine(props: CmReachLineProps) {
  const { will, reasons = [], by, allowance, guard, box, testid } = props;
  const { tone, said, lead } = reachSaid(props);
  const more = reasons.length > 0 || !!by || !!allowance || !!guard || !!box;
  const line = (
    <>
      <span className="cm-reach-dot" data-tone={tone} aria-hidden="true" />
      <span className="cm-reach-said">
        <span className="cm-reach-count">{said}</span>
        {lead ? <span className="cm-reach-first"> · {lead}</span> : null}
      </span>
      {more ? <Icon name="chevron" size={11} /> : null}
    </>
  );
  return (
    <div className="cm-reach-line" data-testid={testid} data-tone={tone} data-count={will}>
      {more ? (
        <Popover
          label={PREVIEW_WORDS.heldBack}
          align="start"
          className="bc-held-box cm-reach-box"
          trigger={
            <LinkButton className="cm-reach-press" data-testid={`${testid}-held`}>
              {line}
            </LinkButton>
          }
        >
          <CmReachBox {...props} />
        </Popover>
      ) : (
        <span className="cm-reach-press">{line}</span>
      )}
    </div>
  );
}
