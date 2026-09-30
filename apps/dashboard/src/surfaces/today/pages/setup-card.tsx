/**
 * What is left to set up, as one card above the queue in its column (moved from pages/dashboard-a-brief.jsx,
 * decision 0015, step 4; the first run's Today card, canvas R10 and P9).
 *
 * The rows are Setup's own (setup.jsx `SetupCardRow`, `SetupRows`), drawn by what the shell published under those names:
 * where the shell has not published one, drawing it fails at the point of use, as `<window.SetupRows />` of nothing did.
 */
import type { ComponentType } from "react";
import type { SetupCardVM } from "@chanlytics/contracts";
import type { SetupApi, SetupSurface } from "@/legacy-bridge/setup";
import {
  appNavigate,
  firstRun,
  refusalFlash,
  setupCardRow,
  setupRead,
  setupRows,
  setupVerbs,
  useMoved,
  useToast,
  type Flash,
} from "../shell";

/** What Setup's compact row takes as the card draws it. */
interface SetupCardRowProps {
  tone: string;
  stateWords: string;
  name: string;
  sentence: string;
  left: string;
  cta: { label: string; short: string; kind: string; onClick: () => void };
  testid: string;
  ctaTestid: string;
}

/** What Setup's list of rows takes as the card draws it. */
interface SetupRowsProps {
  S: SetupSurface | null | undefined;
  rows: SetupCardVM["rows"];
  look: string;
  primary: string;
  left: string;
  later: SetupCardVM["skip"];
  flash: (flash: Flash) => void;
  testid: string;
}

/** While a step is open: the one row that opens the first run. */
function startRow(start: NonNullable<SetupCardVM["start"]>, left: string, nav: (to: string) => void) {
  // Read where the card draws it, as the JSX did: a shell without it fails here.
  const SetupCardRow = setupCardRow<SetupCardRowProps>() as ComponentType<SetupCardRowProps>;
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

/** After: Setup's own optional rows, each with its Skip. */
function optionalRows(S: SetupSurface | null | undefined, card: SetupCardVM, flash: (flash: Flash) => void) {
  const SetupRows = setupRows<SetupRowsProps>() as ComponentType<SetupRowsProps>;
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
// Every word is contracts' (first-run.ts setupCardOf, through window.__firstRun); the rows are Setup's own, drawn as the
// card's compact rows (setup.jsx SetupRows look="card", SetupCardRow). On a phone the card is that one row, the
// next thing with its button beside it and the count under its name (canvas P9, mobile.css).
export const TodaySetup = () => {
  useMoved("setup");
  // The card's toast, lent to its rows: a Skip or a Hide can take the card away while its Undo is still up.
  const [toastNode, flash] = useToast();
  const S = setupRead();
  const F = firstRun();
  const card = S && F ? F.todayCard(S.vm) : null;
  if (!card) return toastNode;
  const nav = (to: string) => appNavigate(to);
  // The JSX did not ask whether Setup's verbs were there: without them a put fails as it did.
  const put = (ids: string[], on: boolean) => (setupVerbs() as SetupApi).later(ids, on);
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
      {toastNode}
    </section>
  );
};
