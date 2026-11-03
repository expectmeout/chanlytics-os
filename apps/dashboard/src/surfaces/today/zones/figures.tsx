/**
 * The day's four figures (Today in three zones, 2 Nov 2026; decision 0076): booked, answered by the receptionist out of
 * the customer messages ("31 of 34", which holds what the messages figure said), calls and new people, always the four.
 * Each with its receipt on a press, its clause and its door. On a desk they stand in the head's right (TodayHeadFigures);
 * on a phone in Today so far, near the page's end (foot.tsx). A count that could not be read is a dash, never a zero.
 * Every sentence is contracts' (today-figures.ts); this file draws them.
 */
import { useEffect, useState } from "react";
import { TODAY_PHONE_WORDS, type TodayFigureId, type TodayFigureVM } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { surfaceValue } from "../../surface-values";
import { appNavigate, doorGlyph, useMoved } from "../shell";

/** A door to a route: the frame's move. */
type Nav = (to: string) => void;

/** A figure whose receipt is there to open. */
type ReceiptFigure = TodayFigureVM & { receipt: NonNullable<TodayFigureVM["receipt"]> };

const hasReceipt = (f: TodayFigureVM): f is ReceiptFigure => !!f.receipt;

/** What a count that could not be read says in its place: a dash, never a zero. */
const UNREAD = "–";

interface FigureProps {
  f: TodayFigureVM;
  i: number;
  open: TodayFigureId | null;
  setOpen: (id: TodayFigureId | null) => void;
}

/**
 * One figure: the number, what it is out of where it has that ("31 of 34"), its word, and the clause under it. With a
 * receipt it is a button: hover opens the receipt, Enter or Space and a tap toggle it, Escape closes it. Focus alone opens
 * nothing: a tap focuses the button before it clicks. A figure with nothing to add is not a button.
 */
const TodayFigure = ({ f, i, open, setOpen }: FigureProps) => {
  const has = !!f.receipt;
  const on = has && open === f.id;
  const body = (
    <>
      <span className="tc-fig-n tabular">
        {f.value ?? UNREAD}
        {f.of ? <small className="tc-fig-of"> of {f.of}</small> : null}
      </span>
      <span className="tc-fig-w">{TODAY_PHONE_WORDS.figure[f.id]}</span>
      <span className="tc-fig-m">{f.meta}</span>
    </>
  );
  return (
    <div
      className={`tc-fig${on ? " open" : ""}`}
      onMouseEnter={has ? () => setOpen(f.id) : undefined}
      title={f.label}
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

/**
 * The open figure's receipt: its why and one door. Under its figure on a desk (placed by its place in the row,
 * `data-i`), under the row on a phone. It adds to the figure and never repeats its number.
 */
const TodayReceipt = ({ f, i, last, nav }: { f: ReceiptFigure; i: number; last: boolean; nav: Nav }) => {
  const { door } = f.receipt;
  return (
    <div
      className="tc-receipt panel panel-pop"
      role="dialog"
      id={`today-receipt-${f.id}`}
      aria-label={`Why ${f.value ?? UNREAD} ${f.label}`}
      data-i={i}
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
 * The open figure's receipt and the key that closes it: an open receipt closes on Escape wherever the focus is, as every
 * other dialog does (the phone app's Back hands the page an Escape).
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
 * The row of figures owns the open receipt: leaving the row closes it (the receipt is inside the row, so moving onto it
 * does not), and so does focus leaving the row.
 */
export function TodayFigures({ className }: { className?: string }) {
  useMoved(["today"]);
  const { open, setOpen } = useReceiptOpen();
  const figures = surfaceValue("today")?.figures ?? null;
  if (!figures?.length) return null;
  const nav: Nav = (to) => appNavigate(to);
  return (
    <div className={className}>
      <div
        className="tc-figs"
        data-testid="today-figures"
        onMouseLeave={() => setOpen(null)}
        onBlur={(e) => {
          if (e.relatedTarget && e.currentTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(null);
        }}
      >
        {figures.map((f, i) => (
          <TodayFigure key={f.id} f={f} i={i} open={open} setOpen={setOpen} />
        ))}
        {figures.map((f, i) =>
          open === f.id && hasReceipt(f) ? (
            <TodayReceipt key={`r-${f.id}`} f={f} i={i} last={i === figures.length - 1} nav={nav} />
          ) : null,
        )}
      </div>
    </div>
  );
}

/** The four in the head's right on a desk, beside the greeting: their receipts open under each figure over the page. */
export const TodayHeadFigures = () => <TodayFigures className="today-head-figs" />;
