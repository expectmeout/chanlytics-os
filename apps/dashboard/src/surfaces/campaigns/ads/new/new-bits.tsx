/**
 * What New ad's five steps share (MOCKUP): the props a step takes, a section with its small label, the dot rows of what
 * something stands on, the row of a choice of one (a door, a preset), and the quiet lines under a control. Nothing here is a
 * step; the step files import it, and steps.tsx picks the step in view.
 */
import { useId } from "react";
import type { ReactNode } from "react";
import type { AdsConfig, AdsRead } from "@chanlytics/contracts";
import type { AdDraft, DoorVM, NewAdVM } from "@chanlytics/contracts/ads-page";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Switch } from "../../../kit/switch/switch";
import { cx } from "../../../kit/variants";
import { routeDoor } from "../../../legacy-verbs";
import type { useLegacyToast } from "../../../legacy-verbs";
import type { NewExtras, NewState, Step } from "./new-state";

/** The toast the shell raises: the Ads page's own, handed to New ad. */
export type Flash = ReturnType<typeof useLegacyToast>[1];

/** What every step takes: the model, what is chosen, and the ways to change it. */
export interface StepProps {
  vm: NewAdVM;
  state: NewState;
  read: AdsRead;
  config: AdsConfig;
  phone: boolean;
  patch: (p: Partial<AdDraft>) => void;
  setExtra: (p: Partial<NewExtras>) => void;
  setStep: (step: Step) => void;
}

/** A section of a step, under a small label. */
export function Sec({ label, children, className }: { label?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("ads-new-sec", className)}>
      {label ? <h4 className="ads-new-sec-k">{label}</h4> : null}
      {children}
    </section>
  );
}

/** One quiet line under a control. */
export function Cap({ children }: { children: ReactNode }) {
  return <p className="ads-new-cap">{children}</p>;
}

/** Quiet lines, one each, from the platform: the floor, the stop, the fee. */
export function Lines({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="ads-new-lines">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/** One dot row: green where it stands, amber where it needs a look, red where it stops Turn on, and its door where there is one. */
export interface DotRow {
  text: string;
  tone: "ok" | "warn" | "fail";
  /** A dim line after the words. */
  note?: string | null;
  door?: DoorVM | null;
}

/** The dot rows of what something stands on, an amber or red one with the door that fixes it. */
export function DotRows({ rows, label, className }: { rows: readonly DotRow[]; label?: string; className?: string }) {
  return (
    <ul className={cx("ads-new-rows", className)} aria-label={label}>
      {rows.map((r) => (
        <li key={r.text} className="ads-new-need" data-tone={r.tone}>
          <span className="ads-new-dot" data-tone={r.tone} aria-hidden="true" />
          <span className="ads-new-need-text">
            {r.text}
            {r.note ? <span className="ads-new-need-note"> · {r.note}</span> : null}
          </span>
          {r.door ? (
            <LinkButton className="ads-new-need-door" {...routeDoor(r.door.to)}>
              {r.door.words}
              <Icon name="chevron" size={11} />
            </LinkButton>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

interface PickRowProps {
  chosen: boolean;
  onPick: () => void;
  /** What stands at the row's start: a door's ring. */
  lead?: ReactNode;
  testid?: string;
  children: ReactNode;
}

/** The row of a choice of one, pressed to choose it (a door, a preset): the chosen one is tinted and ticked. */
export function PickRow({ chosen, onPick, lead, testid, children }: PickRowProps) {
  return (
    <LinkButton size="inherit" className="ads-new-pick" aria-pressed={chosen} onClick={onPick} data-testid={testid}>
      {lead}
      <span className="ads-new-pick-words">{children}</span>
      <span className="ads-new-pick-check" aria-hidden="true">
        {chosen ? <Icon name="check" size={13} /> : null}
      </span>
    </LinkButton>
  );
}

interface OnOffRowProps {
  label: string;
  /** The line under the words: what it does, or what it is now. */
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The switch stays where it is, and says so (the platform allows no other at this budget); the hint says why. */
  locked?: boolean;
  testid?: string;
}

/** A quiet row of words and the kit's switch: "Let Meta adjust my photo and wording", off. */
export function OnOffRow({ label, hint, checked, onChange, locked, testid }: OnOffRowProps) {
  const id = useId();
  return (
    <div className="ads-new-onoff">
      <span className="ads-new-onoff-words">
        <span id={`${id}-label`}>{label}</span>
        {hint ? (
          <span className="ads-new-cap" id={`${id}-hint`}>
            {hint}
          </span>
        ) : null}
      </span>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        readOnly={locked}
        labelledBy={`${id}-label`}
        describedBy={hint ? `${id}-hint` : undefined}
        data-testid={testid}
      />
    </div>
  );
}

/** A label with the control it names beside it (a picker), on one line. */
export function Ctl({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ads-new-ctl">
      <span className="ads-new-ctl-k">{label}</span>
      {children}
    </div>
  );
}

/** The 22px ring a door is drawn in, its glyph inside. */
export function DoorRing({ glyph, chosen }: { glyph: string; chosen?: boolean }) {
  return (
    <span className="ads-new-ring" data-chosen={chosen ? "true" : undefined} aria-hidden="true">
      <Icon name={glyph} size={12} />
    </span>
  );
}
