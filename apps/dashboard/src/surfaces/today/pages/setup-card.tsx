/**
 * What is left to set up, as one card above the queue in its column (moved from pages/dashboard-a-brief.jsx,
 * decision 0015, step 4; the first run's Today card, canvas R10 and P9).
 *
 * The rows are Setup's own (surfaces/setup/rows: `SetupCardRow`, `SetupRows`), imported, and Setup's value is the
 * seam's (`useSurface("setup")`).
 */
import { FIRST_RUN_HELPERS, type SetupCardVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { routeDoor } from "../../legacy-verbs";
import { SetupCardRow } from "../../setup/rows/card-row";
import { SetupRows } from "../../setup/rows/rows";
import { setupVerbs, type SetupSurface } from "../../setup/surface";
import { usePartShown, useSurface } from "../../use-surface";
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

/** After the first run, with the calendar in: the one door to the appointment reminder (decision 22), under the rows. */
function remindLine(remind: NonNullable<SetupCardVM["remind"]>) {
  return (
    <p className="today-setup-remind" data-testid="today-setup-remind">
      <span>{remind.words}</span>
      <Button size="sm" {...routeDoor(remind.to)} data-testid="today-setup-remind-go">
        {remind.label}
      </Button>
    </p>
  );
}

/** After: Setup's own optional rows, each with its Skip. */
function optionalRows(S: SetupSurface, card: SetupCardVM, flash: (flash: Flash) => void) {
  return (
    <SetupRows
      S={S}
      rows={card.rows}
      look="card"
      primary={card.rows[0].id}
      left={card.left}
      later={card.skip}
      flash={flash}
      testid="today-setup-rows"
    />
  );
}

// What is left to set up, as one card above the queue in its column (the first run's Today card, canvas R10 and P9):
// while a step is open, the one row that opens the first run; after, Setup's own optional rows in the order they help
// most, each with its act and a Skip this person keeps on every device (their saved view). Gone once nothing is left.
// Every word is contracts' (first-run.ts setupCardOf); the rows are Setup's own, drawn as the card's compact rows
// (setup/rows SetupRows look="card", SetupCardRow). On a phone the card is that one row, the
// next thing with its button beside it and the count under its name (canvas P9, mobile.css).
export const TodaySetup = () => {
  const S = useSurface("setup");
  // Drawn once Setup's read is in, the card or nothing (client/page-speed.ts).
  usePartShown("today", "setup", !!S);
  // The card's toast, lent to its rows: a Skip or a Hide can take the card away while its Undo is still up.
  const [toastNode, flash] = useToast();
  const card = S ? FIRST_RUN_HELPERS.todayCard(S.vm) : null;
  if (!S || !card) return toastNode;
  const nav = (to: string) => appNavigate(to);
  const put = (ids: string[], on: boolean) => setupVerbs.later(ids, on);
  const hide = async () => {
    const ids = card.rows.map((r) => r.id);
    const r = await put(ids, true);
    if (!r.ok) return flash(refusalFlash(r, "Not saved"));
    flash({
      msg: <>{card.hide?.said}</>,
      undo: () =>
        put(ids, false).then((u) => {
          if (!u.ok) flash(refusalFlash(u, "Not saved"));
        }),
    });
  };
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
      {card.start ? startRow(card.start, card.left, nav) : optionalRows(S, card, flash)}
      {card.remind ? remindLine(card.remind) : null}
      {toastNode}
    </section>
  );
};
