/**
 * What is left to set up, as one card above the queue in its column (moved from pages/dashboard-a-brief.jsx,
 * decision 0015, step 4; the first run's Today card, canvas R10 and P9): the card itself, a chunk of its own, which
 * Today draws through setup-card.tsx once Setup's read and this code are in.
 *
 * The rows are Setup's own (surfaces/setup/rows: `SetupCardRow`, `SetupRows`), imported; each row's Skip is this
 * card's (SkipMenu), so the first run's own page never loads the kit's Menu.
 */
import { useState, type MouseEvent, type ReactNode } from "react";
import { restEndsDay, type SetupPutOffWhy } from "@chanlytics/contracts";
import { FIRST_RUN_HELPERS } from "@/surfaces/setup/first-run/model/first-run-helpers";
import {
  SETUP_CARD_WORDS,
  type SetupCardPutOff,
  type SetupCardVM,
  type SetupCardWho,
} from "@/surfaces/setup/first-run/model/card";
import { pageClock } from "@/bridge/zone";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { surfaceValue } from "../../surface-values";
import { SetupCardRow } from "../../setup/rows/card-row";
import { SetupRows } from "../../setup/rows/rows";
import { setupVerbs, type SetupSurface } from "../../setup/surface";
import { appNavigate, refusalFlash, useToast, type Flash } from "../shell";
import { useTodayOnPhone } from "../phone";

/**
 * While a step is open: the one row that opens the first run. Its act is the page's coral while nobody waits on the
 * owner; while someone does, the queue's first act is (today/arrangement.ts) and this one is the quiet kind, since the
 * coral is for what is now (Today stood with Continue setting up and Answer both in it).
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
 * which only in the toast after. On a phone it is the caret of the row's one pill, its word left to its name (the phone
 * pass, 3 Nov 2026), in the act's coral where the act leads (`lead`).
 */
function SkipMenu(p: {
  name: string;
  put: SetupCardPutOff;
  word: string;
  day: string;
  lead: boolean;
  testid: string;
  onPut: (why: SetupPutOffWhy, said: string) => void;
}) {
  const W = SETUP_CARD_WORDS.skip;
  return (
    <Menu
      align="end"
      label={W.menu(p.name)}
      trigger={
        <Button
          variant="quiet"
          size="sm"
          aria-label={W.menu(p.name)}
          data-lead={p.lead || undefined}
          data-testid={p.testid}
        >
          <span className="setup-card-long">{p.word}</span>
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
        nameShort={remind.nameShort}
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

/**
 * Whether folding hides anything. Folded, the card keeps saying what is next, its one row (8 Nov 2026: "1 step left" named
 * no step, and folded away "Calls aren't answered yet" under a head that said nothing needs you): what folds is everything
 * after it, and where nothing is, there is no chevron to press.
 */
/**
 * Whether the card draws an act that may be the page's coral: a step still open, or a row of Setup's left. A folded card
 * still draws its next step, so it counts; a card gone for the week, or with nothing left, draws none (today/arrangement.ts
 * hands the coral on).
 */
export function setupCardActs(setup: SetupSurface): boolean {
  const card = FIRST_RUN_HELPERS.todayCard(setup.vm, setupWhoOf(setup));
  return !!card && (!!card.start || card.rows.length > 0);
}

const foldsAnything = (card: SetupCardVM): boolean =>
  (card.start
    ? card.kept.length + card.done.length
    : card.rows.length + (card.remind ? 1 : 0) - 1 + card.done.length + (card.hide ? 1 : 0)) > 0;

/** What Hide says: the day it comes back, and what waiting costs where the kept number is among the rows. */
const hiddenSaid = (day: string, cost: string | null): string =>
  cost ? `${SETUP_CARD_WORDS.hidden(day)} ${cost}` : SETUP_CARD_WORDS.hidden(day);

/**
 * A press anywhere on the head's line folds the card; one on its own buttons is theirs, the chevron folding it itself. (8 Nov
 * 2026: the chevron's press stretched over the line with CSS reached a mouse, and a finger's click fell through to the words.)
 */
const foldFromHead = (toggle: () => void) => (e: MouseEvent) => {
  if (e.target instanceof Element && !e.target.closest("button")) toggle();
};

/** The chevron that folds the card and opens it, the press a key reaches. Called, not drawn. */
function foldChevron(short: boolean, toggle: () => void) {
  return (
    <Button
      variant="quiet"
      size="sm"
      iconOnly
      aria-label={short ? SETUP_CARD_WORDS.open : SETUP_CARD_WORDS.fold}
      aria-expanded={!short}
      onClick={toggle}
      data-folded={short || undefined}
      data-testid="today-setup-fold"
    >
      <Icon name="chevron-down" size={14} />
    </Button>
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
// draws the same rows and acts, each row one line (the phone pass, 3 Nov 2026): its short name and one pill, the act and
// Skip's caret (mobile.css), with no sentence; the head its title on one line, and Hide for a week the card's last row.
// `coral`: whether its first act is the page's coral, as Today's arrangement gave it (today/arrangement.ts): nobody waits
// on the owner and nothing the queue drew holds it. Else the card's acts are quiet.
export const TodaySetupCard = ({ S, coral }: { S: SetupSurface; coral: boolean }) => {
  // The card's toast, lent to its rows: a Skip or a Hide can take the card away while its Undo is still up.
  const [toastNode, flash] = useToast();
  const waiting = !coral;
  const [folded, toggle] = useFold();
  // On a phone the head is the card's title on one line with its chevron, and Hide for a week the open card's last row
  // (the phone pass, 3 Nov 2026: beside Hide the title broke onto two lines).
  const phone = useTodayOnPhone();
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
    putAway([...card.rows.map((r) => r.id), ...(remind ? [remind.id] : [])], "week", hiddenSaid(day, hide.cost));
  // The row whose act is the page's coral (optionalRows' `primary`): its Skip's caret wears the coral with it on a phone.
  const leadId = waiting ? null : (card.rows[0]?.id ?? null);
  // A row's Skip, by its id: a menu of a week or for good, its words the row's own (SetupCardRowVM.put).
  const skipMenu = (id: string, name: string, put: SetupCardPutOff | null) =>
    put && card.skip ? (
      <SkipMenu
        name={name}
        put={put}
        word={card.skip.put}
        day={day}
        lead={id === leadId}
        testid={`setup-later-${id}`}
        onPut={(why, said) => void putAway([id], why, said)}
      />
    ) : null;
  const skipRow = (id: string) => {
    const row = card.rows.find((r) => r.id === id);
    return row ? skipMenu(id, row.title, row.put) : null;
  };
  const hideButton = hide ? (
    <Button variant="quiet" size="sm" onClick={() => void hideAll()} data-testid="today-setup-hide">
      {hide.put}
    </Button>
  ) : null;
  const foldable = foldsAnything(card);
  const short = folded && foldable;
  const shownCard = short ? { ...card, rows: card.rows.slice(0, 1) } : card;
  const remindDrawn =
    remind && card.skip && (!short || card.rows.length === 0)
      ? remindRow(remind, card.skip, nav, skipMenu(remind.id, remind.name, remind.put))
      : null;
  return (
    <section className="tq today-setup" data-testid="today-setup">
      {/* The head's whole line folds it, as Your history's does; the chevron is the press a key and a reader reach. */}
      <div
        className="setup-card-head tz-head"
        role="presentation"
        onClick={foldable ? foldFromHead(toggle) : undefined}
        data-foldable={foldable || undefined}
      >
        <span className="setup-card-title tz-name">
          {card.title}
          <span className="setup-card-left tz-fact" data-testid="today-setup-left">
            {card.left}
          </span>
        </span>
        {!short && !phone ? hideButton : null}
        {foldable ? foldChevron(short, toggle) : null}
      </div>
      {card.start ? startRow(card.start, card.left, nav, waiting) : null}
      {card.start
        ? short
          ? null
          : ticks(SETUP_CARD_WORDS.keptTitle, card.kept, "today-setup-kept")
        : optionalRows(S, shownCard, flash, {
            tail: remindDrawn,
            quiet: waiting,
            skip: skipRow,
          })}
      {short ? null : ticks(SETUP_CARD_WORDS.doneTitle, card.done, "today-setup-done")}
      {!short && phone ? hideButton : null}
      {toastNode}
    </section>
  );
};
