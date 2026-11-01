/**
 * Today so far, on a phone (the redesign of 1 Nov 2026): the day's four figures in one row, each with its receipt on a
 * press (its clause and its door), then Worth a look under them, as what the numbers mean (leaks.tsx LeakLines), then the
 * week in one line with the one door to Reports (leaks.tsx WeekLine). On a desk the four stand in the head
 * (TodayHeadFigures, below) and the week is Worth a look's foot, so the card that stood there with a title and one line is
 * no more. Every sentence with a number is contracts' (toTodayVM, todayPeriodLine); this file draws them.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { TODAY_PHONE_WORDS, type TodayFigureId, type TodayFigureVM, type TodayVM } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { surfaceValue } from "../../surface-values";
import { usePartShown } from "../../use-surface";
import { appNavigate, doorGlyph, useMoved } from "../shell";
import { LeakLines, WeekLine } from "./leaks";

/** A door to a route: the frame's move. */
type Nav = (to: string) => void;

/** A figure whose receipt is there to open. */
type ReceiptFigure = TodayFigureVM & { receipt: NonNullable<TodayFigureVM["receipt"]> };

const hasReceipt = (f: TodayFigureVM): f is ReceiptFigure => !!f.receipt;

// One figure: the number, its word and the clause under it. With a receipt it is a button: hover opens the receipt,
// Enter or Space and a tap toggle it, Escape closes it. Focus alone opens nothing: a tap focuses the button before it
// clicks, and a receipt that focus opened and the click then closed never showed on a phone. The receipt itself is drawn by the card as the last child of
// the row of figures (TodayReceipt), so a desktop anchors it under this figure by index and a phone lays it under the
// row. A figure with nothing to add is not a button.
interface FigureProps {
  f: TodayFigureVM;
  i: number;
  open: TodayFigureId | null;
  setOpen: (id: TodayFigureId | null) => void;
  /** On a phone, the figure's short name in one row of four (decision 0076); its clause is under the press. */
  phone: boolean;
}

const TodayFigure = ({ f, i, open, setOpen, phone }: FigureProps) => {
  const has = !!f.receipt;
  const on = has && open === f.id;
  const body = (
    <>
      <span className="tc-fig-n tabular">{f.value}</span>
      <span className="tc-fig-w">{phone ? TODAY_PHONE_WORDS.figure[f.id] : f.label}</span>
      <span className="tc-fig-m">{f.meta}</span>
    </>
  );
  return (
    <div
      className={`tc-fig${on ? " open" : ""}`}
      onMouseEnter={has ? () => setOpen(f.id) : undefined}
      data-testid={`today-figure-${f.id}`}
      data-i={i}
    >
      {has ? (
        <button
          type="button"
          className="tc-fig-btn"
          aria-expanded={on}
          aria-controls={on ? `today-receipt-${f.id}` : undefined}
          onClick={() => setOpen(on ? null : f.id)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(null);
          }}
        >
          {body}
        </button>
      ) : (
        <div className="tc-fig-btn">{body}</div>
      )}
    </div>
  );
};

// The open figure's receipt: its why and one door. Under its figure on a desktop (`--i` places it), under the row on
// a phone (dashboard-a-v2.css .tc-receipt). It adds to the figure and never repeats its number: contracts proves that,
// so nothing an owner needs lives only behind a hover.
interface ReceiptProps {
  f: ReceiptFigure;
  i: number;
  last: boolean;
  nav: Nav;
}

const TodayReceipt = ({ f, i, last, nav }: ReceiptProps) => {
  const { door } = f.receipt;
  return (
    <div
      className="tc-receipt panel panel-pop"
      role="dialog"
      id={`today-receipt-${f.id}`}
      aria-label={`Why ${f.value} ${f.label}`}
      style={{ "--i": i } as CSSProperties}
      data-last={last ? "true" : undefined}
      data-testid={`today-receipt-${f.id}`}
    >
      <p className="tc-receipt-t">{f.receipt.text}</p>
      {door && (
        <button type="button" className="tc-receipt-door" onClick={() => nav(door.to)}>
          {door.label} <Icon name={doorGlyph()} size={10} />
        </button>
      )}
    </div>
  );
};

/**
 * The row of figures owns the open receipt: leaving the row closes it (the receipt is inside the row, so moving
 * onto it does not), and so does focus leaving the row.
 */
function figuresRow(
  figures: TodayFigureVM[],
  {
    open,
    setOpen,
    nav,
    phone,
  }: { open: TodayFigureId | null; setOpen: (id: TodayFigureId | null) => void; nav: Nav; phone: boolean },
) {
  return (
    <div
      className="tc-figs"
      data-testid="today-figures"
      onMouseLeave={() => setOpen(null)}
      onBlur={(e) => {
        if (e.relatedTarget && e.currentTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(null);
      }}
    >
      {figures.map((f, i) => (
        <TodayFigure key={f.id} f={f} i={i} open={open} setOpen={setOpen} phone={phone} />
      ))}
      {figures.map((f, i) =>
        open === f.id && hasReceipt(f) ? (
          <TodayReceipt key={`r-${f.id}`} f={f} i={i} last={i === figures.length - 1} nav={nav} />
        ) : null,
      )}
    </div>
  );
}

/**
 * The open figure's receipt and the key that closes it: an open receipt closes on Escape wherever the focus is, as every
 * other dialog does: the phone app's Back hands the page an Escape (legacy-bridge/app-bridge.ts watchOverlays), and a
 * figure's own key reached it only from the figure.
 */
function useReceiptOpen() {
  const [open, setOpen] = useState<TodayFigureId | null>(null);
  useEffect(() => {
    if (open === null) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return { open, setOpen };
}

/**
 * The tile whole (canvas E3): on a quiet day the four figures are zeros, each with what is true under it (contracts
 * quietFigures), and so is a day with people waiting but nothing counted (vm.zero_figures).
 */
const dayTileFigures = (vm: TodayVM): TodayFigureVM[] | null =>
  vm.figures ?? vm.quiet?.figures ?? vm.zero_figures ?? null;

/**
 * The four figures in the head's right on a desk, beside the greeting (the page heads canvas, H1 and H2, 31 Oct 2026): the
 * day's numbers where the page opens, the card's own row with its receipts, which open under each figure over the page.
 * The day's card keeps the rest of what it says. A phone's are the card's (decision 0076).
 */
export const TodayHeadFigures = () => {
  useMoved(["today"]);
  const { open, setOpen } = useReceiptOpen();
  const vm = surfaceValue("today");
  const figures = vm ? dayTileFigures(vm) : null;
  if (!figures) return null;
  return (
    <div className="today-head-figs">
      {figuresRow(figures, { open, setOpen, nav: (to) => appNavigate(to), phone: false })}
    </div>
  );
};

export const TodayCard = () => {
  useMoved(["today"]);
  const { open, setOpen } = useReceiptOpen();
  const vm = surfaceValue("today");
  // Drawn with the day's figures, or the quiet day's line: Worth a look and the week draw as their reads land.
  usePartShown("today", "card", !!vm);
  if (!vm) return null;
  const { recap, quiet } = vm;
  const figures = dayTileFigures(vm);
  const nav: Nav = (to) => appNavigate(to);
  return (
    <section className="today-card" data-testid="today-card" aria-labelledby="today-card-title">
      <div className="tc-head">
        <h2 className="tc-title" id="today-card-title">
          {TODAY_PHONE_WORDS.soFar}
        </h2>
        {/* No figures to hang the proof on (a quiet day, or no traffic while an escalation waits, which is the
            reference workspace's own state): nothing came in, and the proof the lines are listening. On a day with
            traffic the proof is the messages figure's clause. */}
        {!figures && (
          <span className="tc-line" data-testid="today-quiet-line">
            {quiet ? quiet.headline : recap ? recap.line : "Nothing has come in yet today."} {vm.proof}
          </span>
        )}
      </div>
      {figures && figuresRow(figures, { open, setOpen, nav, phone: true })}
      <LeakLines />
      <WeekLine />
    </section>
  );
};
