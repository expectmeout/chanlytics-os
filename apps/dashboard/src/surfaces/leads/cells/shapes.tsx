/**
 * What a lead's reach looks like (moved from legacy/pages/leads-cells.jsx, decision 0015): the two reach slots of a row,
 * so a state is never colour alone (§6.7).
 */
import type { ReactNode } from "react";
import { LEAD_REACH_NONE_WORDS, formatPhoneLocal, type LeadRowVM } from "@chanlytics/contracts";
import { LeadTip, ldPlacePop } from "./hover";

/** The SVG's own props, the same for every shape. */
const svgProps = (size: number) =>
  ({
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  }) as const;

// One reach slot (D5): five shapes -- a filled circle (checked), a half circle (unconfirmed), a dashed ring (nothing
// found), a ring with a slash (bad), a turning arc (still checking) -- so the column survives greyscale; colour repeats the
// meaning. The word and the value are the control's name; the sentence is its tip. Pressing a phone dials, pressing a
// mailbox copies; a slot with nothing to press is a plain focusable span.
type SlotState = LeadRowVM["slots"]["phone"]["state"];
const LD_SLOT_SHAPES: Record<SlotState, ReactNode> = {
  ok: <circle cx="8" cy="8" r="5.5" fill="currentColor" stroke="none" />,
  part: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none" />
    </>
  ),
  none: <circle cx="8" cy="8" r="5.5" strokeDasharray="2.5 2.5" />,
  bad: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M5 11l6-6" />
    </>
  ),
  checking: <circle cx="8" cy="8" r="5.5" strokeDasharray="17 17" />,
};

export const LeadSlot = ({
  id,
  kind,
  slot,
  values,
  onPress,
  pressLabel,
}: {
  id: string;
  kind: "phone" | "mailbox";
  slot: LeadRowVM["slots"]["phone"];
  values: boolean;
  onPress: (() => void) | null;
  pressLabel: string;
}) => {
  const tipId = `${id}-${kind}-tip`;
  const p = svgProps(14);
  const who = kind === "phone" ? "Phone" : "Email";
  const label = slot.value
    ? `${who}: ${slot.word}, ${slot.value}${onPress ? ` — ${pressLabel}` : ""}`
    : `${who}: ${slot.word}`;
  const body = (
    <>
      <span className={`ld-slot-shape${slot.state === "checking" ? " spin" : ""}`}>
        <svg {...p}>{LD_SLOT_SHAPES[slot.state]}</svg>
      </span>
      {values && slot.value ? <span className="ld-slot-value">{slot.value}</span> : null}
    </>
  );
  return (
    <span
      className={`ld-hover ld-slot ld-slot-${slot.state}`}
      data-testid={`lead-slot-${kind}`}
      onMouseEnter={ldPlacePop}
      onFocus={ldPlacePop}
    >
      {onPress ? (
        <button
          type="button"
          className="ld-slot-btn"
          aria-label={label}
          aria-describedby={tipId}
          onClick={(e) => {
            e.stopPropagation();
            onPress();
          }}
        >
          {body}
        </button>
      ) : (
        <span className="ld-slot-btn" tabIndex={0} aria-label={label} aria-describedby={tipId}>
          {body}
        </span>
      )}
      <LeadTip id={tipId}>{slot.tip}</LeadTip>
    </span>
  );
};

/**
 * One line of a table's Reach (the table review of 5 Nov 2026): the number, or the address, as a person reads it, where
 * a circle stood for it. The value is the signal, and one that is simply fine wears no mark: an address not confirmed
 * wears the half circle, one still being checked the turning arc, a number marked wrong is struck through (leads.css),
 * and nothing found says so in words. So the column still survives greyscale (§6.7). The word and the value are the
 * control's name; the sentence is its tip. Pressing a number dials, pressing an address copies; a line with nothing to
 * press is plain words, in no tab order: what it says ("No email found") is all there is to it.
 */
export const LeadReachLine = ({
  id,
  kind,
  slot,
  onPress,
  pressLabel,
}: {
  id: string;
  kind: "phone" | "mailbox";
  slot: LeadRowVM["slots"]["phone"];
  onPress: (() => void) | null;
  pressLabel: string;
}) => {
  const tipId = `${id}-${kind}-tip`;
  const who = kind === "phone" ? "Phone" : "Email";
  const said = slot.value ? (kind === "phone" ? (formatPhoneLocal(slot.value) ?? slot.value) : slot.value) : null;
  const label = said ? `${who}: ${slot.word}, ${said}${onPress ? ` — ${pressLabel}` : ""}` : `${who}: ${slot.word}`;
  const marked = slot.state === "part" || slot.state === "checking";
  const body = (
    <>
      <span className={kind === "phone" ? "ld-reach-words tabular" : "ld-reach-words"}>
        {said ?? (slot.state === "none" ? LEAD_REACH_NONE_WORDS[kind] : slot.word)}
      </span>
      {marked ? (
        <span className={`ld-slot-shape${slot.state === "checking" ? " spin" : ""}`}>
          <svg {...svgProps(11)}>{LD_SLOT_SHAPES[slot.state]}</svg>
        </span>
      ) : null}
    </>
  );
  return (
    <span
      className={`ld-hover ld-reach ld-reach-${kind} ld-slot-${slot.state}`}
      data-testid={`lead-slot-${kind}`}
      onMouseEnter={ldPlacePop}
      onFocus={ldPlacePop}
    >
      {onPress ? (
        <button
          type="button"
          className="ld-slot-btn ld-reach-press"
          aria-label={label}
          aria-describedby={tipId}
          onClick={(e) => {
            e.stopPropagation();
            onPress();
          }}
        >
          {body}
        </button>
      ) : (
        <span className="ld-slot-btn ld-reach-press" aria-label={label} aria-describedby={tipId}>
          {body}
        </span>
      )}
      <LeadTip id={tipId}>{slot.tip}</LeadTip>
    </span>
  );
};
