/**
 * The day's four figures (Today in three zones, 2 Nov 2026; decision 0076): booked, answered by the receptionist out of
 * the customer messages ("31 of 34", which holds what the messages figure said), calls and new people, always the four.
 * Each with its receipt on a press, its clause and its door. On a desk they stand in the head's right (TodayHeadFigures);
 * on a phone in Today so far, near the page's end (foot.tsx), where every one of the four opens, its clause first since a
 * phone's row has no room for it, with a chevron that says so (8 Nov 2026: whether a number could be pressed was anyone's
 * guess). A count that could not be read is a dash, never a zero. Every sentence is contracts' (today/figures.ts); this
 * file draws them.
 */
import { useEffect, useState } from "react";
import {
  TODAY_PHONE_WORDS,
  capitalize,
  figureDoorOf,
  type ReportHeadlineVM,
  type TodayFigureId,
  type TodayFigureVM,
} from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { SAYS_WHEN } from "../../kit/says-when";
import { Spark, type SparkColumn } from "../../kit/spark/spark";
import { surfaceValue } from "../../surface-values";
import { useSurface } from "../../use-surface";
import { useTodayOnPhone } from "../phone";
import { appNavigate, doorGlyph, useMoved } from "../shell";

/** A door to a route: the frame's move. */
type Nav = (to: string) => void;

/** What a count that could not be read says in its place: a dash, never a zero. */
const UNREAD = "–";

/** One day of Reports' headline, as the figures' weeks read it. */
type HeadlineDay = ReportHeadlineVM["perDay"][number];

/** The days a figure's week holds: the six before today, and today. */
const WEEK_DAYS = 7;

/**
 * Which of the period's days each figure's week is drawn from (Today with colour, D3, 17 Nov 2026), the same fact on the
 * days before. A day's bookings are counted by the rule today's figure is (decision 0141), and are null for a day the
 * server did not count: a server from before it, a database that keeps no arrival yet, a read that failed.
 */
const WEEK_OF: Record<TodayFigureId, (day: HeadlineDay) => number | null> = {
  booked: (day) => day.booked,
  answered: (day) => day.answered,
  calls: (day) => day.calls,
  new: (day) => day.newPeople,
};

/** A figure's week: the six days before today from Reports' headline, and today as the figure itself says it. */
function weekOf(f: TodayFigureVM, perDay: readonly HeadlineDay[] | null): SparkColumn[] | null {
  if (!perDay || perDay.length < WEEK_DAYS || f.value === null) return null;
  const before = perDay.slice(-WEEK_DAYS, -1).map(WEEK_OF[f.id]);
  const counted = before.filter((value) => value !== null);
  // A day nobody counted leaves no week: a column is a fact or it is not drawn.
  if (counted.length < before.length) return null;
  const week = [...counted.map((value) => ({ value })), { value: f.value }];
  // A week of nothing draws nothing: a row of empty days says no more than the zero beside it.
  return week.some((day) => day.value > 0) ? week : null;
}

interface FigureProps {
  f: TodayFigureVM;
  /** Its week, beside its number, on a desk and a phone. */
  week: SparkColumn[] | null;
  i: number;
  open: TodayFigureId | null;
  setOpen: (id: TodayFigureId | null) => void;
  phone: boolean;
}

/**
 * One figure: the number, what it is out of where it has that ("31 of 34"), its word, and the clause under it. With a
 * receipt, and always on a phone, it is a button: a mouse over it opens the receipt, Enter or Space and a tap toggle it,
 * Escape closes it. Focus alone opens nothing: a tap focuses the button before it clicks. A finger is never a hover: a
 * browser says one before the tap's click, and the click would close what it just opened. On a desk a figure with nothing
 * to add is not a button.
 */
const TodayFigure = ({ f, week, i, open, setOpen, phone }: FigureProps) => {
  const has = phone || !!f.receipt;
  const on = has && open === f.id;
  const body = (
    <>
      <span className="tc-fig-n tabular" data-zero={f.value === 0 || undefined}>
        {f.value ?? UNREAD}
        {f.of ? <small className="tc-fig-of"> of {f.of}</small> : null}
      </span>
      <span className="tc-fig-w">
        {TODAY_PHONE_WORDS.figure[f.id]}
        {phone ? <Icon name="chevron-down" size={10} /> : null}
      </span>
      <span className="tc-fig-m" {...SAYS_WHEN}>
        {f.meta}
      </span>
      {week ? (
        <Spark className="tc-fig-week" size="sm" today columns={week} aria-label={TODAY_PHONE_WORDS.figure[f.id]} />
      ) : null}
    </>
  );
  return (
    <div
      className={`tc-fig${on ? " open" : ""}${week ? " has-week" : ""}`}
      onPointerEnter={
        has
          ? (e) => {
              if (e.pointerType === "mouse") setOpen(f.id);
            }
          : undefined
      }
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
 * `data-i`), under the row on a phone, where its clause leads since the row draws none, and where a figure with no door of
 * its own opens the place that holds it. It adds to the figure and never repeats its number.
 */
const TodayReceipt = ({
  f,
  i,
  last,
  nav,
  phone,
}: {
  f: TodayFigureVM;
  i: number;
  last: boolean;
  nav: Nav;
  phone: boolean;
}) => {
  const door = f.receipt?.door ?? (phone ? figureDoorOf(f.id) : null);
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
      {phone && f.meta ? (
        <p className="tc-receipt-t" {...SAYS_WHEN}>
          {capitalize(f.meta)}.
        </p>
      ) : null}
      {f.receipt ? <p className="tc-receipt-t">{f.receipt.text}</p> : null}
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
  const phone = useTodayOnPhone();
  const figures = surfaceValue("today")?.figures ?? null;
  const perDay = useSurface("reports_headline")?.perDay ?? null;
  if (!figures?.length) return null;
  const nav: Nav = (to) => appNavigate(to);
  // A week beside each number, on a desk and in Today so far on a phone (the canvas draws both).
  const weekFor = (f: TodayFigureVM) => weekOf(f, perDay);
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
          <TodayFigure key={f.id} f={f} week={weekFor(f)} i={i} open={open} setOpen={setOpen} phone={phone} />
        ))}
        {figures.map((f, i) =>
          open === f.id && (phone || f.receipt) ? (
            <TodayReceipt key={`r-${f.id}`} f={f} i={i} last={i === figures.length - 1} nav={nav} phone={phone} />
          ) : null,
        )}
      </div>
    </div>
  );
}

/** The four in the head's right on a desk, beside the greeting: their receipts open under each figure over the page. */
export const TodayHeadFigures = () => <TodayFigures className="today-head-figs" />;
