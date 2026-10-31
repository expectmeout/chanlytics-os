/**
 * What is left to set up, as one card above the queue in its column (moved from pages/dashboard-a-brief.jsx,
 * decision 0015, step 4; the first run's Today card, canvas R10 and P9): the card itself, a chunk of its own, which
 * Today draws through setup-card.tsx once Setup's read and this code are in.
 *
 * The rows are Setup's own (surfaces/setup/rows: `SetupCardRow`, `SetupRows`), imported; each row's Skip is this
 * card's (SkipMenu), so the first run's own page never loads the kit's Menu.
 */
import { useState, type ReactNode } from "react";
import {
  FIRST_RUN_HELPERS,
  SETUP_CARD_WORDS,
  restEndsDay,
  type SetupCardPutOff,
  type SetupCardVM,
  type SetupCardWho,
  type SetupPutOffWhy,
} from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
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
 * Where the card's fold is kept: this device's, as a pane left open or closed is. Never the member's saved view, which
 * holds what they put off: folding is no put-off, and nothing comes back after a week. A browser that keeps nothing
 * (a private window) keeps it for the visit.
 */
const FOLD_KEY = "today-setup-folded";

/** The card folded or open, as this device last left it: open until it is folded. */
function useFold(): [boolean, () => void] {
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(FOLD_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setFolded((was) => {
      try {
        if (was) localStorage.removeItem(FOLD_KEY);
        else localStorage.setItem(FOLD_KEY, "1");
      } catch {
        // Kept for the visit alone.
      }
      return !was;
    });
  return [folded, toggle];
}

/**
 * A row's Skip (the refined canvas, 31 Oct 2026): a menu that says both choices before either is pressed: for a week,
 * back on its day; or "I don't need this", with where it is set up from then; and what waiting costs, where it costs
 * (the kept number's forwarding). It was one press that put a row off for a week and the next time for good, and said
 * which only in the toast after.
 */
function SkipMenu(p: {
  name: string;
  put: SetupCardPutOff;
  word: string;
  day: string;
  testid: string;
  onPut: (why: SetupPutOffWhy, said: string) => void;
}) {
  const W = SETUP_CARD_WORDS.skip;
  return (
    <Menu
      align="end"
      label={W.menu(p.name)}
      trigger={
        <Button variant="quiet" size="sm" data-testid={p.testid}>
          {p.word}
          <Icon name="chevron-down" size={12} />
        </Button>
      }
      groups={[
        {
          items: [
            { label: W.week, meta: W.backOn(p.day), onSelect: () => p.onPut("week", p.put.week) },
            { label: W.good, meta: p.put.home, onSelect: () => p.onPut("answer", p.put.good) },
          ],
          ...(p.put.cost ? { caption: p.put.cost } : {}),
        },
      ]}
    />
  );
}

/**
 * After the first run, with the calendar in: the one door to the appointment reminder (decision 22), as the card's last
 * row in Setup's list, drawn as Setup's are: its dot, its name over its sentence, its button and its Skip.
 */
function remindRow(
  remind: NonNullable<SetupCardVM["remind"]>,
  skip: NonNullable<SetupCardVM["skip"]>,
  nav: (to: string) => void,
  menu: ReactNode,
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
        menu={menu}
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
  { tail, quiet, skip }: { tail: ReactNode; quiet: boolean; skip: (id: string) => ReactNode },
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
      skip={card.skip ? skip : null}
      testid="today-setup-rows"
    />
  );
}

// What is left to set up, as one card above the queue in its column (the first run's Today card, canvas R10 and P9):
// while a step is open, the one row that opens the first run; after, Setup's own optional rows in the order they help
// most, each with its act and its Skip, and the reminder's row last. Two presses that do two things (the refined canvas,
// 31 Oct 2026): the chevron folds the card and opens it, as often as wanted, kept on this device; "Hide for a week" puts
// every row off for a week, and a week is always a week. Skip says its choices before either is pressed: a week, back
// on its day, or for good, with where it is set up from then (contracts setupPutOffNext, `week` and `answer`). Each put-
// off is said in the card's toast with its Undo, which puts the rows back as they stood. Gone once nothing is left. Every
// word is contracts' (first-run-card.ts setupCardOf); the rows are Setup's own, drawn as the card's compact rows. A phone
// draws the same rows and acts as a desk, each row without its sentence (mobile.css).
export const TodaySetupCard = ({ S }: { S: SetupSurface }) => {
  // The card's toast, lent to its rows: a Skip or a Hide can take the card away while its Undo is still up.
  const [toastNode, flash] = useToast();
  // Anyone waiting on the owner (surfaces/needs-you.ts), or any row the queue drew with its coral (a step due, a visit to
  // mark: queue-coral.ts): the queue then holds the page's coral, and the card's acts are quiet.
  const needs = useWaitsOnToday();
  const queued = useQueueHoldsCoral();
  const waiting = needs || queued;
  const [folded, toggle] = useFold();
  const card = FIRST_RUN_HELPERS.todayCard(S.vm, setupWhoOf(S));
  if (!card) return toastNode;
  const nav = (to: string) => appNavigate(to);
  // The day a week put off now ends, on the business's clock: said in Skip's menu before the press, and after Hide.
  const day = restEndsDay(pageClock().zone(), Date.now());
  // Put off, said in the card's toast with its Undo, which puts every row back as it stood.
  const putAway = async (ids: string[], why: SetupPutOffWhy, said: string) => {
    const r = await setupVerbs.later(ids, { on: true, why });
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
  const hide = card.hide;
  const hideAll = () =>
    hide &&
    putAway(
      [...card.rows.map((r) => r.id), ...(remind ? [remind.id] : [])],
      "week",
      hide.cost ? `${SETUP_CARD_WORDS.hidden(day)} ${hide.cost}` : SETUP_CARD_WORDS.hidden(day),
    );
  // A row's Skip, by its id: a menu of a week or for good, its words the row's own (SetupCardRowVM.put).
  const skipMenu = (id: string, name: string, put: SetupCardPutOff | null) =>
    put && card.skip ? (
      <SkipMenu
        name={name}
        put={put}
        word={card.skip.put}
        day={day}
        testid={`setup-later-${id}`}
        onPut={(why, said) => void putAway([id], why, said)}
      />
    ) : null;
  const skipRow = (id: string) => {
    const row = card.rows.find((r) => r.id === id);
    return row ? skipMenu(id, row.title, row.put) : null;
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
        {!folded && hide ? (
          <Button variant="quiet" size="sm" onClick={() => void hideAll()} data-testid="today-setup-hide">
            {hide.put}
          </Button>
        ) : null}
        <Button
          variant="quiet"
          size="sm"
          iconOnly
          aria-label={folded ? SETUP_CARD_WORDS.open : SETUP_CARD_WORDS.fold}
          aria-expanded={!folded}
          onClick={toggle}
          data-folded={folded || undefined}
          data-testid="today-setup-fold"
        >
          <Icon name="chevron-down" size={14} />
        </Button>
      </div>
      {folded ? null : (
        <>
          {card.start ? startRow(card.start, card.left, nav, waiting) : null}
          {card.start
            ? ticks(SETUP_CARD_WORDS.keptTitle, card.kept, "today-setup-kept")
            : optionalRows(S, card, flash, {
                tail:
                  remind && card.skip
                    ? remindRow(remind, card.skip, nav, skipMenu(remind.id, remind.name, remind.put))
                    : null,
                quiet: waiting,
                skip: skipRow,
              })}
          {ticks(SETUP_CARD_WORDS.doneTitle, card.done, "today-setup-done")}
        </>
      )}
      {toastNode}
    </section>
  );
};
