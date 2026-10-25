/**
 * What is left to set up, as one card above the queue in its column (moved from pages/dashboard-a-brief.jsx,
 * decision 0015, step 4; the first run's Today card, canvas R10 and P9): the card itself, a chunk of its own, which
 * Today draws through setup-card.tsx once Setup's read and this code are in.
 *
 * The rows are Setup's own (surfaces/setup/rows: `SetupCardRow`, `SetupRows`), imported.
 */
import type { ReactNode } from "react";
import { FIRST_RUN_HELPERS, type SetupCardVM } from "@chanlytics/contracts";
import { SetupCardRow } from "../../setup/rows/card-row";
import { SetupRows } from "../../setup/rows/rows";
import { setupVerbs, type SetupSurface } from "../../setup/surface";
import { appNavigate, refusalFlash, useToast, type Flash } from "../shell";

/** While a step is open: the one row that opens the first run. */
function startRow(start: NonNullable<SetupCardVM["start"]>, left: string, nav: (to: string) => void) {
  return (
    <div className="tq-list">
      <SetupCardRow
        tone="warn"
        stateWords={start.status}
        name={start.name}
        sentence={start.sentence}
        left={left}
        cta={{ label: start.cta, short: start.ctaShort, kind: "primary", onClick: () => nav(start.to) }}
        testid="today-setup-start"
        ctaTestid="today-setup-go"
      />
    </div>
  );
}

/**
 * After the first run, with the calendar in: the one door to the appointment reminder (decision 22), as the card's last
 * row in Setup's list, drawn as Setup's are: its dot, its name over its sentence, its button and its Skip.
 */
function remindRow(
  remind: NonNullable<SetupCardVM["remind"]>,
  skip: SetupCardVM["skip"],
  nav: (to: string) => void,
  putOff: () => void,
) {
  return (
    <div>
      <SetupCardRow
        tone=""
        stateWords={remind.stateWords}
        name={remind.name}
        note={remind.back ? { long: skip.back, short: skip.backShort } : null}
        sentence={remind.words}
        cta={{ label: remind.label, onClick: () => nav(remind.to) }}
        also={{ label: skip.put, onClick: putOff, testid: "today-setup-remind-skip" }}
        testid="today-setup-remind"
        ctaTestid="today-setup-remind-go"
      />
    </div>
  );
}

/** After: Setup's own optional rows, each with its Skip, and the reminder's row under them. */
function optionalRows(S: SetupSurface, card: SetupCardVM, flash: (flash: Flash) => void, tail: ReactNode) {
  return (
    <SetupRows
      S={S}
      rows={card.rows}
      look="card"
      primary={card.rows[0]?.id ?? null}
      left={card.left}
      later={card.skip}
      flash={flash}
      tail={tail}
      testid="today-setup-rows"
    />
  );
}

// What is left to set up, as one card above the queue in its column (the first run's Today card, canvas R10 and P9):
// while a step is open, the one row that opens the first run; after, Setup's own optional rows in the order they help
// most, each with its act and a Skip this person keeps on every device (their saved view), and the reminder's row last.
// A Skip puts a row off for a week, and once it is back, for good (contracts setupPutOffNext); Hide does the same to
// every row at once. Gone once nothing is left. Every word is contracts' (first-run.ts setupCardOf); the rows are
// Setup's own, drawn as the card's compact rows (setup/rows SetupRows look="card", SetupCardRow). A phone draws the same
// rows and acts as a desk, each row without its sentence (mobile.css), and a row back from its week says so by its name.
export const TodaySetupCard = ({ S }: { S: SetupSurface }) => {
  // The card's toast, lent to its rows: a Skip or a Hide can take the card away while its Undo is still up.
  const [toastNode, flash] = useToast();
  const card = FIRST_RUN_HELPERS.todayCard(S.vm);
  if (!card) return toastNode;
  const nav = (to: string) => appNavigate(to);
  // Put off as a "not now", said in the card's toast with its Undo, which puts every row back as it stood: every row at
  // once (Hide, the reminder's row with them), or the reminder's alone (its Skip; Setup's rows skip through SetupRows).
  const putAway = async (ids: string[], said: string | undefined) => {
    const r = await setupVerbs.later(ids, { on: true, why: "rest" });
    if (!r.ok) return flash(refusalFlash(r, "Not saved"));
    flash({
      msg: <>{said}</>,
      undo: () =>
        r.undo().then((u) => {
          if (!u.ok) flash(refusalFlash(u, "Not saved"));
        }),
    });
  };
  const remind = card.remind;
  const hide = () => putAway([...card.rows.map((r) => r.id), ...(remind ? [remind.id] : [])], card.hide?.said);
  return (
    <section className="tq today-setup" data-testid="today-setup">
      <div className="setup-card-head">
        <span className="setup-card-title">
          {card.title}
          <span className="setup-card-left" data-testid="today-setup-left">
            {card.left}
          </span>
        </span>
        {card.hide ? (
          <button
            type="button"
            className="setup-card-skip today-setup-hide"
            onClick={hide}
            data-testid="today-setup-hide"
          >
            {card.hide.put}
          </button>
        ) : null}
      </div>
      {card.start
        ? startRow(card.start, card.left, nav)
        : optionalRows(
            S,
            card,
            flash,
            remind ? remindRow(remind, card.skip, nav, () => void putAway([remind.id], remind.said)) : null,
          )}
      {toastNode}
    </section>
  );
};
