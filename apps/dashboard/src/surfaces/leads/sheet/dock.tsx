/**
 * The lead sheet's dock (the canvas's States board, 18 Oct 2026: "one line, at most two acts, never a pointer
 * elsewhere"): only what to press, at the sheet's foot, held still while the card turns. For a lead to decide on, Not a
 * fit and Later as round glyphs, then Add to the pick with ▾ beside it (the picker), or Add to a sequence where nothing is
 * picked; while a sequence has them, what needs you there, a held email's choices in the acts' place (the record's own
 * verb, place/parts.tsx HeldChoices). Nothing at all where nothing needs you (contracts leadDockOf). On a desk the keys are
 * said under it: N, L, A, ⇧A, J and K, and Z in a pile; C calls, never A. On a phone, with no keys to say, each glyph
 * carries its word under it, and the primary act takes the room left, its words cut short before ▾ is ever pushed off.
 *
 * Hookless, but for the held email's choices.
 */
import {
  LEAD_DOCK_WORDS as D,
  LEAD_PILE_UNDO_KEY,
  type LeadSheetDockVM,
  type LeadSheetSlotVM,
} from "@chanlytics/contracts";
import { HeldChoices } from "../../campaigns/sequences/place/parts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { gate } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";

/** The right a press's door checks: Keep, Leave out and Put back are a partner's doors (find's); the rest an operator's. */
const rightOf = (s: LeadSheetSlotVM) =>
  s.act === "keep" || s.act === "exclude" || s.act === "put_back" ? "find" : "approve";

/** What the gate's sentence says a role may not do, where the press's own word would not read as one. */
const DOING: Partial<Record<LeadSheetSlotVM["act"], string>> = {
  keep: "keep this lead",
  exclude: "leave this lead out",
  put_back: "put this lead back",
  add: "add this lead to a sequence",
  pick: "add this lead to a sequence",
  move: "move this lead",
  later: "save this lead for later",
  approve: "approve a batch",
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
  /** The lead's name and the sequence its held email is in, for its choices' receipt. */
  name: string;
  flash: (f: LegacyFlash) => void;
  onDecided: () => void;
}

/** One act of the dock: its glyph and words, its key named, off where it would fail; the last one is the primary. */
const dockActOf = (s: LeadSheetSlotVM, last: boolean, p: DockProps) => (
  <span key={s.act} className={s.split ? "lw-split" : undefined}>
    <Button
      variant={last ? "primary" : "secondary"}
      className="lw-dock-b"
      disabled={p.busy || !!s.off}
      onClick={() => p.onRun(s)}
      aria-keyshortcuts={s.key ? s.key.toUpperCase() : undefined}
      data-testid={`lead-sheet-${s.act}`}
      {...saysOf(s)}
    >
      {s.icon === "chevron" ? null : <Icon name={s.icon} size={14} />}
      <span className="lw-dock-w">{s.label}</span>
      {s.icon === "chevron" ? <Icon name="chevron" size={11} /> : null}
    </Button>
    {s.split ? (
      <Button
        variant={last ? "primary" : "secondary"}
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
    ) : null}
  </span>
);

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
          ...p.dock.acts
            .filter((s) => s.key)
            .map((s) => ({ keys: [s.key ?? ""], words: s.act === "add" ? K.add : s.label.toLowerCase() })),
          ...(p.dock.acts.some((s) => s.split) ? [{ keys: ["⇧a"], words: K.choose }] : []),
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

/** The dock: the round glyphs where the lead is to decide on, its line and fact where it has them, and its acts. */
export const SheetDock = (p: DockProps) => {
  const d = p.dock;
  return (
    <>
      <div
        className={`lw-dock${d.x ? " x" : ""}`}
        data-busy={p.busy ? "true" : undefined}
        data-testid="lead-sheet-dock"
      >
        {d.x ? glyphOf(p, "not_a_fit") : null}
        {d.later ? glyphOf(p, "later") : null}
        {d.line || d.fact || d.waiting ? (
          <span className="lw-dock-t">
            {d.line || d.waiting ? (
              <span className="lw-dock-l" title={d.line ?? undefined} data-testid="lead-sheet-dock-line">
                {d.waiting ? <span className="lw-spin" aria-hidden="true" /> : null}
                {d.line}
              </span>
            ) : null}
            {d.fact ? <span className="lw-dock-f">{d.fact}</span> : null}
          </span>
        ) : (
          <span className="lw-dock-t" />
        )}
        {d.held ? (
          <HeldChoices
            held={{ ...d.held, name: p.name }}
            flash={p.flash}
            onDecided={p.onDecided}
            busy={p.busy}
            dock
            testid="lead-sheet-held"
          />
        ) : (
          d.acts.map((s, i) => dockActOf(s, i === d.acts.length - 1, p))
        )}
      </div>
      {keysOf(p)}
    </>
  );
};
