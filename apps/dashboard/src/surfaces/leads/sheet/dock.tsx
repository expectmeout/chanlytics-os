/**
 * The lead sheet's dock (the canvas "Lead sheet, redesigned", 1 Nov 2026): only what to press, at the sheet's foot, held
 * still while the card turns, each press saying what it does; the card above it says why. For a lead to decide on, Not a
 * fit and Later as round glyphs, then Add to the pick with ▾ beside it (the picker); while a sequence has them, what needs
 * you there, the way out of it quiet beside the one primary, and the other answers under its caret. No dock at all where
 * nothing needs you (contracts leadDockOf): the sheet draws no foot. On a desk the keys are said under it: N, L, A, ⇧A, J
 * and K, and Z in a pile; C calls, never A. On a phone, with no keys to say, each glyph carries its word under it, and
 * the primary takes the room left, its words cut short before ▾ is ever pushed off.
 *
 * Hookless.
 */
import type { ReactNode } from "react";
import {
  LEAD_DOCK_WORDS as D,
  LEAD_PILE_UNDO_KEY,
  dockSlotsOf,
  type LeadSheetDockVM,
  type LeadSheetSlotVM,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { gate } from "../../legacy-verbs";

/** The right a press's door checks: Keep, Leave out and Put back are a partner's doors (find's); the rest an operator's. */
const rightOf = (s: LeadSheetSlotVM) =>
  s.act === "keep" || s.act === "exclude" || s.act === "put_back" ? "find" : "approve";

/** What the gate's sentence says a role may not do, where the press's own word would not read as one. */
const DOING: Partial<Record<LeadSheetSlotVM["act"], string>> = {
  keep: "keep this lead",
  exclude: "leave this lead out",
  put_back: "put this lead back",
  return: "put this lead back",
  add: "add this lead to a sequence",
  pick: "add this lead to a sequence",
  move: "move this lead",
  later: "save this lead for later",
  approve: "approve a batch",
  decide: "decide a held email",
  take_out: "take this lead out",
};

/** What a press says at the control: why it is off, else the gate's sentence for a role that may not press it. */
const saysOf = (s: LeadSheetSlotVM) =>
  s.off ? { title: s.off } : gate(rightOf(s), DOING[s.act] ?? s.label.toLowerCase());

interface DockProps {
  dock: LeadSheetDockVM;
  busy: boolean;
  onRun: (s: LeadSheetSlotVM) => void;
  /** ▾ beside Add: the picker. */
  onPick: () => void;
  /** The keys a desk says under the dock: a pile's, the rows' (J and K), or none on a phone. */
  keys: "pile" | "rows" | null;
  /** On a phone: the glyphs say their words under them. */
  phone: boolean;
  /** Their email handed over: the row every To send draws, drawn by the sheet. */
  toSend?: ReactNode;
}

/** The testid a press wears: an answer by its door, every other by its act. */
const testidOf = (s: LeadSheetSlotVM) => `lead-sheet-${s.door ?? s.act}`;

/** A press beside the primary. */
const otherOf = (s: LeadSheetSlotVM, wide: boolean, p: DockProps) => (
  <Button
    key={`${s.act}-${s.door ?? ""}`}
    variant="secondary"
    className={wide ? "lw-dock-b is-wide" : "lw-dock-b"}
    disabled={p.busy || !!s.off}
    onClick={() => p.onRun(s)}
    aria-keyshortcuts={s.key ? s.key.toUpperCase() : undefined}
    data-testid={testidOf(s)}
    {...saysOf(s)}
  >
    <span className="lw-dock-w">{s.label}</span>
  </Button>
);

/** ▾ beside the primary: the picker for Add, the other answers for an email. */
function caretOf(s: LeadSheetSlotVM, p: DockProps) {
  const more = p.dock.more;
  if (more.length)
    return (
      <Menu
        label={D.otherWays}
        trigger={
          <Button
            variant="primary"
            iconOnly
            className="lw-split-more"
            disabled={p.busy}
            aria-label={D.otherWays}
            data-testid="lead-sheet-other-ways"
          >
            <Icon name="chevron-down" size={13} />
          </Button>
        }
        groups={[
          {
            items: more.map((m) => ({
              label: m.label,
              onSelect: () => p.onRun(m),
            })),
          },
        ]}
      />
    );
  return s.split ? (
    <Button
      variant="primary"
      iconOnly
      className="lw-split-more"
      disabled={p.busy}
      onClick={p.onPick}
      aria-label={D.choose}
      aria-keyshortcuts="Shift+A"
      data-tip={D.choose}
      data-testid="lead-sheet-pick"
      {...gate("approve", "add this lead to a sequence")}
    >
      <Icon name="chevron-down" size={13} />
    </Button>
  ) : null;
}

/** The one primary, its caret joined to it where it has one. */
function primaryOf(s: LeadSheetSlotVM, p: DockProps) {
  const caret = caretOf(s, p);
  return (
    <span className={caret ? "lw-split" : "lw-dock-go"}>
      <Button
        variant="primary"
        className="lw-dock-b"
        disabled={p.busy || !!s.off}
        onClick={() => p.onRun(s)}
        aria-keyshortcuts={s.key ? s.key.toUpperCase() : undefined}
        data-testid={testidOf(s)}
        {...saysOf(s)}
      >
        <span className="lw-dock-w">{s.label}</span>
      </Button>
      {caret}
    </span>
  );
}

/**
 * A glyph before the acts (Not a fit, Later): on a desk a round one named by its words, which its hover says, its key
 * named; on a phone its word under it.
 */
const glyphOf = (p: DockProps, act: "not_a_fit" | "later") => {
  const label = act === "later" ? D.later : D.notFit;
  return (
    <Button
      key={act}
      variant={p.phone ? "quiet" : "secondary"}
      iconOnly={!p.phone}
      className={p.phone ? "lw-x lw-x-said" : "lw-x"}
      disabled={p.busy}
      onClick={() =>
        p.onRun({ act, label, icon: act === "later" ? "clock" : "x", key: act === "later" ? "l" : "n", off: null })
      }
      aria-label={label}
      aria-keyshortcuts={act === "later" ? "L" : "N"}
      data-tip={label}
      data-testid={`lead-sheet-${act}`}
      {...gate("approve", act === "later" ? "save this lead for later" : "set this lead aside")}
    >
      <Icon name={act === "later" ? "clock" : "x"} size={p.phone ? 15 : 17} />
      {p.phone ? <span className="lw-x-w">{label}</span> : null}
    </Button>
  );
};

/** The keys under the dock on a desk: in a pile, each act's key, ⇧A, J and K, and Undo; out of one, J and K. */
const keysOf = (p: DockProps) => {
  if (!p.keys) return null;
  const K = D.keys;
  const said =
    p.keys === "pile"
      ? [
          ...(p.dock.x ? [{ keys: ["n"], words: K.notFit }] : []),
          ...(p.dock.later ? [{ keys: ["l"], words: K.later }] : []),
          ...dockSlotsOf(p.dock)
            .filter((s) => s.key)
            .map((s) => ({ keys: [s.key ?? ""], words: s.act === "add" ? K.add : s.label.toLowerCase() })),
          ...(p.dock.primary && p.dock.primary.split ? [{ keys: ["⇧a"], words: K.choose }] : []),
          { keys: ["j", "k"], words: K.move },
          { keys: [LEAD_PILE_UNDO_KEY], words: K.undo },
        ]
      : [{ keys: ["j", "k"], words: K.move }];
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

/** The dock: the round glyphs where the lead is to decide on, its quieter presses, and the one primary. */
export const SheetDock = (p: DockProps) => {
  const d = p.dock;
  // A single way back and nothing else takes the dock's width.
  const wide = !d.primary && !d.x && d.others.length === 1;
  return (
    <>
      <div
        className={`lw-dock${d.x ? " x" : ""}`}
        data-busy={p.busy ? "true" : undefined}
        data-testid="lead-sheet-dock"
      >
        {d.x ? glyphOf(p, "not_a_fit") : null}
        {d.later ? glyphOf(p, "later") : null}
        {d.toSend ? p.toSend : null}
        {d.others.map((s) => otherOf(s, wide, p))}
        {d.primary ? primaryOf(d.primary, p) : null}
      </div>
      {keysOf(p)}
    </>
  );
};
