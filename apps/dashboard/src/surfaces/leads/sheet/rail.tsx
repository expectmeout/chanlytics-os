/**
 * The lead sheet's rail (canvas B v2, "the rail, a sibling of the card"): three places, what they hold being what can
 * honestly be done for the lead's state (contracts leadSheetRailOf). A round ✕ for Not a fit where it is one, then two
 * more; the third is always the primary. It holds still while the card turns, and a press that would come to nothing is
 * off and says why at the control. Not a fit asks its five reasons in the rail's own place, the last one given marked;
 * Back puts the rail back with nothing written.
 *
 * Hookless. On a desk its keys are named to a screen reader and listed in the ? sheet, never drawn (canvas B: "keys,
 * drawn nowhere").
 */
import {
  LEAD_NOT_A_FIT_TITLE,
  LEAD_NOT_A_FIT_WHYS,
  LEAD_NOT_A_FIT_WORDS,
  LEAD_SHEET_WORDS as W,
  LEAD_SUPPRESSING_WHY,
  type LeadNotAFitWhy,
  type LeadSheetRailVM,
  type LeadSheetSlotVM,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { gate } from "../../legacy-verbs";

/** The right a place's door checks: Keep, Leave out and Put back are a partner's doors (find's); the rest an operator's. */
const rightOf = (s: LeadSheetSlotVM) =>
  s.act === "keep" || s.act === "exclude" || s.act === "put_back" ? "find" : "approve";

/** What the gate's sentence says a role may not do, where the place's own word would not read as one. */
const DOING: Partial<Record<LeadSheetSlotVM["act"], string>> = {
  keep: "keep this lead",
  exclude: "leave this lead out",
  put_back: "put this lead back",
  add: "add this lead to a sequence",
  later: "save this lead for later",
};

/** What a place says at the control: why it is off, else the gate's sentence for a role that may not press it. */
const saysOf = (s: LeadSheetSlotVM) =>
  s.off ? { title: s.off } : gate(rightOf(s), DOING[s.act] ?? s.label.toLowerCase());

/** One place of the rail: its glyph and words, a second line where it has one, its key named, off where it would fail. */
const railPlaceOf = (s: LeadSheetSlotVM, i: number, last: boolean, p: RailProps) => (
  <Button
    key={`${s.act}-${i}`}
    variant={last ? "primary" : "secondary"}
    className={`lw-rail-b${s.sub ? " two" : ""}`}
    disabled={p.busy || !!s.off}
    onClick={() => p.onRun(s)}
    aria-keyshortcuts={s.key ? s.key.toUpperCase() : undefined}
    data-testid={`lead-sheet-${s.act}`}
    {...saysOf(s)}
  >
    <span className="lw-rail-w">
      <Icon name={s.icon} size={15} />
      {s.label}
    </span>
    {s.sub ? <small>{s.sub}</small> : null}
  </Button>
);

interface RailProps {
  rail: LeadSheetRailVM;
  busy: boolean;
  onRun: (s: LeadSheetSlotVM) => void;
}

/** The rail: the round ✕ and two more, or three words. */
export const SheetRail = (p: RailProps) => {
  const [first, ...rest] = p.rail.slots;
  const n = p.rail.slots.length;
  return (
    <div
      className={`lw-rail${p.rail.x ? " x" : ""}`}
      data-n={n}
      data-busy={p.busy ? "true" : undefined}
      data-testid="lead-pile-rail"
    >
      {p.rail.x && first ? (
        <Button
          variant="secondary"
          iconOnly
          className="lw-x"
          disabled={p.busy}
          onClick={() => p.onRun(first)}
          aria-label={W.notFit}
          aria-keyshortcuts="N"
          data-tip={W.notFit}
          data-testid="lead-sheet-not_a_fit"
          {...gate("approve", "set this lead aside")}
        >
          <Icon name="x" size={18} />
        </Button>
      ) : null}
      {(p.rail.x ? rest : p.rail.slots).map((s, i, all) => railPlaceOf(s, i, i === all.length - 1, p))}
    </div>
  );
};

/** Not a fit's five reasons, in the rail's own place: one tap decides; the one last given is marked; Back writes nothing. */
export const SheetWhy = (p: {
  last: LeadNotAFitWhy | null;
  busy: boolean;
  onPick: (why: LeadNotAFitWhy) => void;
  onBack: () => void;
}) => (
  <div className="lw-why" role="group" aria-label={LEAD_NOT_A_FIT_TITLE} data-testid="peek-why">
    <div className="lw-why-h">
      <span>{LEAD_NOT_A_FIT_TITLE}</span>
      <Button size="sm" variant="quiet" onClick={p.onBack} data-testid="peek-why-back">
        {W.back}
      </Button>
    </div>
    <div className="lw-why-g">
      {LEAD_NOT_A_FIT_WHYS.map((w) => (
        <Button
          key={w}
          className={`lw-why-b${p.last === w ? " last" : ""}`}
          disabled={p.busy}
          onClick={() => p.onPick(w)}
          data-testid={`peek-why-${w}`}
          {...(p.last === w ? { title: W.lastWhy } : {})}
        >
          <span>{LEAD_NOT_A_FIT_WORDS[w]}</span>
          {w === LEAD_SUPPRESSING_WHY ? <small>{W.hides}</small> : null}
        </Button>
      ))}
    </div>
  </div>
);
