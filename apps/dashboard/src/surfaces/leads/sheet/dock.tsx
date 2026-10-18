/**
 * The lead sheet's dock (the refined canvas, 17 Oct 2026: as a sequence's record has it): only what needs you, at the
 * sheet's foot. A round ✕ where Not a fit is one and Later as a round glyph beside it, then one line and one fact, then
 * the acts, the last the primary; nothing at all when nothing needs you (contracts leadSheetDockOf). On a desk the keys
 * are said under it: the dock's own and Undo in a pile, J and K out of one. It holds still while the card turns, and a press
 * that would come to nothing is off and says why at the control. In its place: Not a fit's five reasons, the last one
 * given marked; and a held email's choices, decided here with the same verb as the sequence's Leads tab.
 *
 * Hookless. On a desk its keys are named to a screen reader and in the ? sheet (A, L, N; Z undoes in a pile).
 */
import {
  HOLD_DOOR_WORDS,
  LEAD_DOCK_WORDS as D,
  LEAD_NOT_A_FIT_TITLE,
  LEAD_NOT_A_FIT_WHYS,
  LEAD_NOT_A_FIT_WORDS,
  LEAD_PILE_UNDO_KEY,
  LEAD_SHEET_WORDS as W,
  LEAD_SUPPRESSING_WHY,
  holdDoors,
  type HoldDoor,
  type LeadNotAFitWhy,
  type LeadSheetDockVM,
  type LeadSheetSlotVM,
  type ReachOutHold,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { gate } from "../../legacy-verbs";

/** The right a press's door checks: Keep, Leave out and Put back are a partner's doors (find's); the rest an operator's. */
const rightOf = (s: LeadSheetSlotVM) =>
  s.act === "keep" || s.act === "exclude" || s.act === "put_back" ? "find" : "approve";

/** What the gate's sentence says a role may not do, where the press's own word would not read as one. */
const DOING: Partial<Record<LeadSheetSlotVM["act"], string>> = {
  keep: "keep this lead",
  exclude: "leave this lead out",
  put_back: "put this lead back",
  add: "add this lead to a sequence",
  later: "save this lead for later",
  approve: "approve a batch",
  decide: "decide a held email",
  new_sequence: "start a sequence",
};

/** What a press says at the control: why it is off, else the gate's sentence for a role that may not press it. */
const saysOf = (s: LeadSheetSlotVM) =>
  s.off ? { title: s.off } : gate(rightOf(s), DOING[s.act] ?? s.label.toLowerCase());

interface DockProps {
  dock: LeadSheetDockVM;
  busy: boolean;
  onRun: (s: LeadSheetSlotVM) => void;
  /** The keys a desk says under the dock: a pile's (its acts' and Undo), the rows' (J and K), or none on a phone. */
  keys: "pile" | "rows" | null;
}

/** An act drawn as a round glyph before the line (Later), as the canvas's dock draws it: its words its name and hover. */
const glyphOf = (s: LeadSheetSlotVM) => s.act === "later";

/** One act of the dock: its glyph and words, its key named, off where it would fail; the last one is the primary. */
const dockActOf = (s: LeadSheetSlotVM, last: boolean, p: DockProps) => (
  <Button
    key={s.act}
    variant={last ? "primary" : "secondary"}
    className="lw-dock-b"
    disabled={p.busy || !!s.off}
    onClick={() => p.onRun(s)}
    aria-keyshortcuts={s.key ? s.key.toUpperCase() : undefined}
    data-testid={`lead-sheet-${s.act}`}
    {...saysOf(s)}
  >
    {s.icon === "chevron" ? null : <Icon name={s.icon} size={14} />}
    {s.label}
    {s.icon === "chevron" ? <Icon name="chevron" size={11} /> : null}
    {last && p.keys === "pile" && s.key ? <kbd className="lw-kbd">{s.key.toUpperCase()}</kbd> : null}
  </Button>
);

/** A quiet act as a round glyph (Later): named by its words, which its hover says, its key named. */
const glyphActOf = (s: LeadSheetSlotVM, p: DockProps) => (
  <Button
    key={s.act}
    variant="secondary"
    iconOnly
    className="lw-x"
    disabled={p.busy || !!s.off}
    onClick={() => p.onRun(s)}
    aria-label={s.label}
    aria-keyshortcuts={s.key ? s.key.toUpperCase() : undefined}
    data-tip={s.label}
    data-testid={`lead-sheet-${s.act}`}
    {...saysOf(s)}
  >
    <Icon name={s.icon} size={17} />
  </Button>
);

/** The keys under the dock on a desk: in a pile, each act's key and Undo; out of one, J and K walk the rows. */
const keysOf = (p: DockProps, acts: LeadSheetSlotVM[]) => {
  if (!p.keys) return null;
  const said =
    p.keys === "pile"
      ? [
          ...acts.filter((s) => s.key).map((s) => ({ keys: [s.key ?? ""], words: s.label.toLowerCase() })),
          { keys: [LEAD_PILE_UNDO_KEY], words: D.undoKey },
        ]
      : [{ keys: ["j", "k"], words: D.moveKeys }];
  return (
    <p className="lw-keys" aria-hidden="true" data-testid="lead-sheet-keys">
      {said.map((k) => (
        <span key={k.words}>
          {k.keys.map((key) => (
            <kbd key={key} className="lw-kbd">
              {key.toUpperCase()}
            </kbd>
          ))}
          {k.words}
        </span>
      ))}
    </p>
  );
};

/** The dock: the round ✕ where it is one, the line and its fact, and its acts. */
export const SheetDock = (p: DockProps) => {
  const [first, ...rest] = p.dock.acts;
  const others = p.dock.x ? rest : p.dock.acts;
  const glyphs = others.filter(glyphOf);
  const acts = others.filter((s) => !glyphOf(s));
  return (
    <>
      <div
        className={`lw-dock${p.dock.x ? " x" : ""}`}
        data-busy={p.busy ? "true" : undefined}
        data-testid="lead-sheet-dock"
      >
        {p.dock.x && first ? (
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
            <Icon name="x" size={17} />
          </Button>
        ) : null}
        {glyphs.map((s) => glyphActOf(s, p))}
        <span className="lw-dock-t">
          <span className="lw-dock-l" title={p.dock.line} data-testid="lead-sheet-dock-line">
            {p.dock.waiting ? <span className="lw-spin" aria-hidden="true" /> : null}
            {p.dock.line}
          </span>
          <span className="lw-dock-f">{p.dock.fact}</span>
        </span>
        {acts.map((s, i) => dockActOf(s, i === acts.length - 1, p))}
      </div>
      {keysOf(p, p.dock.acts)}
    </>
  );
};

/**
 * Not a fit's five reasons, in the dock's own place: one tap decides; the one last given is marked; Back writes nothing.
 * In a pile on a desk each wears its key, 1 to 5, which picks it.
 */
export const SheetWhy = (p: {
  last: LeadNotAFitWhy | null;
  busy: boolean;
  keys: boolean;
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
      {LEAD_NOT_A_FIT_WHYS.map((w, i) => (
        <Button
          key={w}
          className={`lw-why-b${p.last === w ? " last" : ""}`}
          disabled={p.busy}
          onClick={() => p.onPick(w)}
          aria-keyshortcuts={p.keys ? String(i + 1) : undefined}
          data-testid={`peek-why-${w}`}
          {...(p.last === w ? { title: W.lastWhy } : {})}
        >
          <span>{LEAD_NOT_A_FIT_WORDS[w]}</span>
          {w === LEAD_SUPPRESSING_WHY ? <small>{W.hides}</small> : null}
          {p.keys ? <kbd className="lw-kbd lw-why-k">{i + 1}</kbd> : null}
        </Button>
      ))}
    </div>
  </div>
);

/**
 * A held email, decided in the dock's place (the canvas's HeldDecide): only this lead's, so the sheet offers the choices
 * the sequence's Leads tab offers for it (contracts holdDoors), each the same verb; a batch to approve stays the record's.
 */
export const SheetDecide = (p: {
  hold: ReachOutHold;
  /**
   * What the check flagged (the opening's words, a chain's count), said here where the card's box is not on screen to
   * say it; null where it is.
   */
  flag: string | null;
  sequence: string;
  busy: boolean;
  onDecide: (door: HoldDoor) => void;
  onBack: () => void;
}) => (
  <div className="lw-why" role="group" aria-label={D.decideAsk} data-testid="lead-sheet-decide">
    <div className="lw-why-h">
      <span>{D.decideAsk}</span>
      <Button size="sm" variant="quiet" onClick={p.onBack} data-testid="lead-sheet-decide-back">
        {D.back}
      </Button>
    </div>
    {p.flag ? (
      <p className="lw-decide-f" data-testid="lead-sheet-decide-flag">
        {p.flag}
      </p>
    ) : null}
    <p className="lw-decide-s">{D.decideOnly(p.sequence)}</p>
    <div className="lw-why-g">
      {holdDoors(p.hold).map((door) => (
        <Button
          key={door}
          className="lw-why-b"
          disabled={p.busy}
          onClick={() => p.onDecide(door)}
          data-testid={`lead-sheet-decide-${door}`}
          {...gate("approve", "decide a held email")}
        >
          <span>{HOLD_DOOR_WORDS[door]}</span>
        </Button>
      ))}
    </div>
  </div>
);
