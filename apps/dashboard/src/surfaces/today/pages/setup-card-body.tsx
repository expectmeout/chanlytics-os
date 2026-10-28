/**
 * What is left to set up, as one card above the queue in its column (moved from pages/dashboard-a-brief.jsx,
 * decision 0015, step 4; the first run's Today card, canvas R10 and P9): the card itself, a chunk of its own, which
 * Today draws through setup-card.tsx once Setup's read and this code are in.
 *
 * The rows are Setup's own (surfaces/setup/rows: `SetupCardRow`, `SetupRows`), imported.
 */
import { useState, type ReactNode } from "react";
import { FIRST_RUN_HELPERS, SETUP_CARD_WORDS, type SetupCardVM, type SetupCardWho } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { surfaceValue } from "../../surface-values";
import { SetupCardRow } from "../../setup/rows/card-row";
import { SetupRows } from "../../setup/rows/rows";
import { setupVerbs, type SetupSurface } from "../../setup/surface";
import { appNavigate, refusalFlash, useToast, type Flash } from "../shell";
import { useWaitsOnToday } from "../../needs-you";
import { useQueueHoldsCoral } from "../queue-coral";

/**
 * While a step is open: the one row that opens the first run. Its act is the page's coral while nobody waits on the
 * owner; while someone does, the queue's first act is (need-you/people-rows.tsx actKindOf) and this one is the quiet
 * kind, since the coral is for what is now (Today stood with Continue setting up and Answer both in it).
 */
function startRow(start: NonNullable<SetupCardVM["start"]>, left: string, nav: (to: string) => void, quiet: boolean) {
  return (
    <div className="tq-list">
      <SetupCardRow
        tone="warn"
        stateWords={start.status}
        name={start.name}
        sentence={start.sentence}
        left={left}
        cta={{
          label: start.cta,
          short: start.ctaShort,
          kind: quiet ? "ghost" : "primary",
          onClick: () => nav(start.to),
        }}
        testid="today-setup-start"
        ctaTestid="today-setup-go"
      />
    </div>
  );
}

/** A line each, under a quiet title: what the first run kept (canvas T·a), or what is already done going live (T·c). */
function ticks(title: string, lines: readonly string[], testid: string): ReactNode {
  if (!lines.length) return null;
  return (
    <div className="today-setup-ticks" data-testid={testid}>
      <span className="setup-card-title">{title}</span>
      <ul className="today-setup-tick-list">
        {lines.map((l) => (
          <li key={l}>
            <Icon name="check" size={12} />
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What the card knows beyond Setup: the business's name, and how the receptionist sounds where the settings read is
 * already in (never read for the card alone: Today does not draw Settings).
 */
function setupWhoOf(S: SetupSurface): SetupCardWho {
  const read = surfaceValue("settings");
  const cfg = read && read.settings ? read.settings.config : null;
  const profile = cfg && cfg.brain ? cfg.brain.profile : null;
  return { business: S.dto.business.name, sounds: profile ? FIRST_RUN_HELPERS.sounds(profile) : null };
}

/**
 * After the first run, with the calendar in: the one door to the appointment reminder (decision 22), as the card's last
 * row in Setup's list, drawn as Setup's are: its dot, its name over its sentence, its button and its Skip.
 */
function remindRow(
  remind: NonNullable<SetupCardVM["remind"]>,
  skip: NonNullable<SetupCardVM["skip"]>,
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
function optionalRows(
  S: SetupSurface,
  card: SetupCardVM,
  flash: (flash: Flash) => void,
  { tail, quiet }: { tail: ReactNode; quiet: boolean },
) {
  return (
    <SetupRows
      S={S}
      rows={card.rows}
      look="card"
      // The first row's act is the coral while nobody waits, as the first run's row is (startRow).
      primary={quiet ? null : (card.rows[0]?.id ?? null)}
      left={card.left}
      // Going live, the rows that need the owner can't be skipped: they are Go live's (the code, WhatsApp).
      later={card.skip ?? { put: "" }}
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
  // Anyone waiting on the owner (surfaces/needs-you.ts), or any row the queue drew with its coral (a step due, a visit to
  // mark: queue-coral.ts): the queue then holds the page's coral. The count alone is known before the queue draws.
  const needs = useWaitsOnToday();
  const queued = useQueueHoldsCoral();
  const waiting = needs || queued;
  // While someone waits the card is its head alone, under the queue, and Show opens its rows (the live walk, 27 Oct 2026).
  const [shown, setShown] = useState(false);
  const folded = waiting && !shown;
  const card = FIRST_RUN_HELPERS.todayCard(S.vm, setupWhoOf(S));
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
        {folded ? (
          <button
            type="button"
            className="setup-card-skip today-setup-show"
            onClick={() => setShown(true)}
            data-testid="today-setup-show"
          >
            {SETUP_CARD_WORDS.show}
          </button>
        ) : card.hide ? (
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
      {folded ? null : (
        <>
          {card.start ? startRow(card.start, card.left, nav, waiting) : null}
          {card.start
            ? ticks(SETUP_CARD_WORDS.keptTitle, card.kept, "today-setup-kept")
            : optionalRows(S, card, flash, {
                tail:
                  remind && card.skip
                    ? remindRow(remind, card.skip, nav, () => void putAway([remind.id], remind.said))
                    : null,
                quiet: waiting,
              })}
          {ticks(SETUP_CARD_WORDS.doneTitle, card.done, "today-setup-done")}
        </>
      )}
      {toastNode}
    </section>
  );
};
