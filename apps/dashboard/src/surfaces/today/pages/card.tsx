/**
 * Today's day card, under the work (moved from pages/dashboard-a-brief.jsx, decision 0015, step 4).
 *
 * The card is about the day: four figures from the view model, each with the clause under it and the why behind it
 * on hover, focus or a tap, with one door; then the lines that are not numbers (a reply that never reached anyone,
 * a review that landed, what ran, the receipts); then the last seven days in one line with the
 * one door to Reports on the page. Every sentence with a number is contracts' (toTodayVM, todayPeriodLine,
 * todayRunWords); this file draws them. A borrowed read that failed says so where its line would be (FailedRead).
 * A surface the bridge published is read by its global's name (`borrowed`, shell.ts): what it answers is what the
 * bridge published, and nothing before its first read.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  TODAY_PHONE_WORDS,
  runTitleOf,
  type BroadcastVM,
  type TodayFigureId,
  type TodayFigureVM,
  type TodayVM,
  runRoute,
} from "@chanlytics/contracts";
import type { BroadcastsSurface } from "@/surfaces/campaigns/broadcasts/surface";
import type { PageClock } from "@/legacy-bridge/zone";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { surfaceValue } from "../../surface-values";
import { usePartShown, useSurface, useSurfaceFailed } from "../../use-surface";
import { TODAY_HELPERS } from "../helpers";
import { appNavigate, doorGlyph, borrowed, workspaceClock, useMoved } from "../shell";
import { reviewLineOf } from "./review-line";
import { Button } from "../../kit/button/button";
import { useTodayOnPhone } from "../phone";
import { LeakLines } from "./leaks";

/** A door to a route: the frame's move. */
type Nav = (to: string) => void;

/** A run that started, the one the card says went out today. */
type StartedRun = BroadcastVM & { started_at: string };

/** A figure whose receipt is there to open. */
type ReceiptFigure = TodayFigureVM & { receipt: NonNullable<TodayFigureVM["receipt"]> };

const hasReceipt = (f: TodayFigureVM): f is ReceiptFigure => !!f.receipt;

// A playbook's run or a broadcast that went out today, with what it has earned so far. The runs that wait for a word,
// and the ones under a Stop, are rows of the queue (dashboard-a-command.jsx). Today, and the time it went, are the
// business's (window.__clock), not the browser's; the counts are contracts' words (todayRunWords).
/**
 * The runs that went out today, the first two, with the time each went on the business's clock: what the brief's lines say
 * on a desk and a phone's day card says in the rest of the day (phone/day.tsx).
 */
export function runsDoneToday(): Array<{ run: StartedRun; at: string }> {
  const B = borrowed<BroadcastsSurface>("__BROADCASTS");
  const all = (B && B.rows) || [];
  // The JSX did not ask whether the clock was there: without one, the first run that started fails at `dayKey`, as it did.
  const C = workspaceClock() as PageClock;
  return all
    .filter(
      (r): r is StartedRun =>
        (r.state === "sent" || r.state === "sending") &&
        !!r.started_at &&
        C.dayKey(Date.parse(r.started_at)) === C.dayKey(Date.now()),
    )
    .slice(0, 2)
    .map((run) => ({ run, at: C.time(Date.parse(run.started_at)) }));
}

const RunsDone = ({ nav }: { nav: Nav }) => {
  useMoved("broadcasts");
  return runsDoneToday().map(({ run: r, at }) => {
    const w = TODAY_HELPERS.runs(r).done;
    return (
      <div key={`run-${r.id}`} className="brief-beat" data-testid="brief-run-done">
        <span className="mark brief-beat-glyph">
          <Icon name="bolt" size={13} />
        </span>
        <span className="brief-beat-text">
          <b>{runTitleOf(r)}</b> {r.playbook_id ? "ran" : "went out"}
          {" at "}
          {at}: {w.counts}
          {w.still ? " · still sending" : ""}
        </span>
        <button className="brief-chip brief-door" onClick={() => nav(runRoute(r.id, r.sequence_id))}>
          Open <Icon name={doorGlyph()} size={10} />
        </button>
      </div>
    );
  });
};

// A review on Google, the morning it lands: first seen in the last day and a half, written recently, not part of the
// first read (contracts/google.ts reviewIsNew). From the Google surface, read where Today is drawn (ROUTE_DRAWS). Gone
// once it is old news.
const ReviewLine = ({ nav }: { nav: Nav }) => {
  // The line opens that review with its reply box (reports/reviews:<id>), and goes once it is answered; the bell's notice of the same
  // review is not said again under While you were away (review-line.ts, away.tsx).
  const line = reviewLineOf(useSurface("google"));
  if (!line) return null;
  return (
    <div className="brief-beat" data-testid="brief-review">
      <span className="mark brief-beat-glyph">
        <Icon name="star" size={13} />
      </span>
      <span className="brief-beat-text">{line.text}</span>
      <button className="brief-chip brief-door" onClick={() => nav(line.to)}>
        Open Reports <Icon name={doorGlyph()} size={10} />
      </button>
    </div>
  );
};

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
 * The lines that are not numbers, under the brief's summary (brief-pane.tsx): only what a summary cannot carry as a
 * sentence, which is a line with a door (a reply that failed, a review that landed, a run that went out) or a read
 * that failed. thread.spec reads a failed reply here by this testid and .brief-beat. The quiet day's list of lines
 * and their numbers and the receipts of what was replied stood here too: under a summary they were three more blocks
 * of text in three sizes (Ruben, 7 Oct 2026), the summary says "all caught up" itself, and the follow-up is there for
 * the rest.
 */
export function recapBeats(vm: TodayVM, nav: Nav) {
  const { recap } = vm;
  return (
    <div className="brief-beats tc-beats" data-testid="today-recap">
      <ReviewLine nav={nav} />
      {/* Everything the figures do not carry, crucially a reply that failed to deliver: the one line that must never be quiet. */}
      {(recap ? recap.sentences : [])
        .filter((sn) => !sn.traffic)
        .map((sn, i) => (
          <div key={`sn-${i}`} className="brief-beat">
            <span className="mark brief-beat-glyph">
              <Icon name={sn.warn ? "alert" : "info"} size={13} />
            </span>
            <span className="brief-beat-text" style={sn.warn ? { color: "var(--danger-ink)" } : undefined}>
              {sn.text}
            </span>
            {sn.warn && (
              <button className="brief-chip brief-door" onClick={() => nav(sn.to || "inbox")}>
                See the thread <Icon name={doorGlyph()} size={10} />
              </button>
            )}
          </div>
        ))}
      <RunsDone nav={nav} />
      {vm.callsRead === false && (
        <FailedRead
          kind="line"
          what="the phone line's calls"
          body="The day's other numbers are current."
          surface="today"
          testid="brief-calls-failed"
        />
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
const figuresOf = (vm: TodayVM): TodayFigureVM[] | null => vm.figures ?? vm.quiet?.figures ?? vm.zero_figures ?? null;

/**
 * The four figures in the head's right on a desk, beside the greeting (the page heads canvas, H1 and H2, 31 Oct 2026): the
 * day's numbers where the page opens, the card's own row with its receipts, which open under each figure over the page.
 * The day's card keeps the rest of what it says. A phone's are the card's (decision 0076).
 */
export const TodayHeadFigures = () => {
  useMoved(["today"]);
  const { open, setOpen } = useReceiptOpen();
  const vm = surfaceValue("today");
  const figures = vm ? figuresOf(vm) : null;
  if (!figures) return null;
  return (
    <div className="today-head-figs">
      {figuresRow(figures, { open, setOpen, nav: (to) => appNavigate(to), phone: false })}
    </div>
  );
};

export const TodayCard = () => {
  useMoved(["today"]);
  // The period in one small read (the headline), through the seam, and whether its read failed, by the seam's own hook: both hooks, so
  // they stand before the early return below. (`surfaceFailed("reports_headline")` is false for ever: the shell's door maps its
  // argument through the routes' surfaces, which name no headline.)
  const R = useSurface("reports_headline");
  const headlineFailed = useSurfaceFailed("reports_headline");
  const { open, setOpen } = useReceiptOpen();
  // On a phone the four are one row and Worth a look is under them, as what the numbers mean (decision 0076). On a desk
  // they stand in the head (TodayHeadFigures), and the card says the rest.
  const phone = useTodayOnPhone();
  const vm = surfaceValue("today");
  // Drawn with the day and its period line, or with the line's read failed (client/page-speed.ts).
  usePartShown("today", "card", !!vm && (!!R || headlineFailed));
  if (!vm) return null;
  const { recap, quiet } = vm;
  const figures = figuresOf(vm);
  const nav: Nav = (to) => appNavigate(to);
  const period = R ? TODAY_HELPERS.periodLine(R) : null;
  // Not read yet is not failed: the foot is silent while Reports loads and says so when its read failed.
  const reportsFailed = !R && headlineFailed;
  return (
    <section className="today-card" data-testid="today-card" aria-labelledby="today-card-title">
      <div className="tc-head">
        <h2 className="tc-title" id="today-card-title">
          {recap ? recap.label : "Today so far"}
        </h2>
        {/* No figures to hang the proof on (a quiet day, or no traffic while an escalation waits, which is the
            reference workspace's own state): nothing came in, and the proof the lines are listening. On a day with
            traffic the proof is the messages figure's clause. */}
        {!figures && (
          <span className="tc-line" data-testid="today-quiet-line">
            {quiet ? quiet.headline : recap ? recap.line : "Nothing has come in yet today."} {vm.proof}
          </span>
        )}
        {period && (
          <Button variant="quiet" size="sm" aria-label="Open Reports" onClick={() => nav(period.to)}>
            Reports <Icon name={doorGlyph()} size={11} />
          </Button>
        )}
      </div>
      {figures && phone && figuresRow(figures, { open, setOpen, nav, phone })}
      {(period || reportsFailed) && (
        <div className="tc-foot">
          {period ? (
            <>
              <span className="tc-foot-text" data-testid="today-period">
                {period.text}
              </span>
            </>
          ) : (
            <FailedRead
              kind="line"
              what="Reports"
              body="The day's own numbers above are current."
              surface="reports_headline"
              testid="today-period-failed"
            />
          )}
        </div>
      )}
      {phone ? <LeakLines /> : null}
    </section>
  );
};
