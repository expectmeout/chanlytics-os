/**
 * The kit's sheet (kit.css, "Sheet"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4 and step 2.5):
 * a side pane on a desk, and from the bottom edge under the kit's 900px, over the page's wash. It holds one of two
 * shapes. A record's composer: a head with its title, the line under it and its Close; the tools, where a list has
 * them; the rows, which scroll; and a foot that holds still. Or a phone's small job (`shape="job"`: Add a person, a
 * list's name, what a selection can become): a short head with a way back where the job is a step of another, its
 * title, and its Close, then the job itself. What it lists and what its foot acts on are the page's. Every sheet has
 * the one round Close in its corner, a record's and a job's alike (kit.css, "One Close for every sheet"; Ruben, 25 Nov
 * 2026: "one design"), and a record that is a step of another has the same way back a job does (`back`).
 * A record's title may be a kicker (`kicker`): a quiet line over a pane that draws its own head, as Campaigns' drawers do.
 * A kicker may be said to a screen reader alone (`unsaid`), where the pane's head says all there is: no line of its own,
 * its Close at the head's corner over what it holds.
 *
 * Its behaviour is Base UI's Dialog (`@base-ui/react/dialog`, the plan's decision 15): modal, so focus is held inside
 * it and the page behind is inert to a pointer and a screen reader and does not scroll; Escape and a press on the
 * wash ask the page to close it (`onClose`), as its Close does; as it closes, focus goes back to what held it when
 * it opened. It opens with the sheet itself focused, so a screen reader names it (kit.css draws no ring there), or
 * keeps a field inside it that took focus as it was drawn (a job's `autoFocus`, as the house's dialogs keep one), or
 * focuses the element `initialFocus` names. It stays drawn while it leaves: Base UI's closing state is the kit's
 * `data-leaving`, which plays the sheet's and its wash's leaving (kit.css), and Base UI lets it go when that ends.
 * It leaves as it was: what it held as it closed, not what the page holds after (a step gone, a draft cleared). A page
 * that lets go of it while it is open (one that draws it only while it is open) sees it leave the same way, from a still
 * copy (useLeavesWhenLetGo).
 * On a phone a pull down from its top asks to close it as its Close does (kit/motion/swipe.ts touchSwipe, the house's one
 * reader of a thumb), following the finger, and its handle says so; it is as tall as what it holds, up to its cap, and
 * its height glides as what it holds changes (motion/use-height-glide). A record's sheet may instead have two rests on a
 * phone (`rest`, rests.ts: the lead workbench's pile): one height, standing down at half and whole at full, its handle a
 * button between them and a pull moving it, from half down to close, and its half may fit what it holds (use-fit-rest.ts).
 * The kit writes none of the rest by hand.
 *
 * Open is the page's (`open`), and so is closed: `onClose` asks, and the page answers by setting `open`, so a page
 * that asks first about what was typed, or holds a save that is out (`busy`), keeps it open. It is drawn in a portal on
 * the document's body, where no pane's blur or transform can hold it. The house's record kit draws its sheets through
 * it (record/sheet.tsx RecordSheet, record/fold.tsx a fold's sheet), handing it its keys and its focus hold
 * (`onKeyDown`, `onFocus`) and a question in its foot's place (`asking`).
 *
 * It draws what the gallery's Sheet family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser, entry for entry. `className` is for the page's layout (a
 * wider sheet), and comes last; the ref reaches the sheet; `testid` names it, its Close and its way back.
 */
import { Dialog } from "@base-ui/react/dialog";
import type { FocusEvent, KeyboardEvent, ReactElement, ReactNode, Ref, RefObject } from "react";
import { useCallback, useLayoutEffect, useRef } from "react";
import { onAPhone, touchSwipe } from "../../frame-verbs";
import { Icon } from "../icon/icon";
import { SEEN_MS, leaveOverlay } from "../motion/leaving";
import { useHeightGlide } from "../motion/use-height-glide";
import { useRootFlag } from "../motion/root-flags";
import { cx } from "../variants";
import { useBackCloses } from "./back";
import { SheetHandle, type SheetRestControl } from "./handle";
import { restSwipe } from "./rests";
import { useFitRest } from "./use-fit-rest";

/** A step inside a job: the way back to the one it came from, named for a screen reader, its glyph drawn. */
export type SheetBack = { label: string; glyph: ReactElement; onBack: () => void };

/**
 * A record's composer (the default): its Close a glyph with its name, and room for the line under the title, the
 * tools and the foot. A phone's small job: its Close named by the job's word ("Cancel", "Done"), and a way back where
 * it is a step; its body is the job.
 */
type SheetShape =
  | {
      shape?: "record";
      /** The head's Close: its name, and its glyph (the Icon's `x`, at 13px, as the record sheet draws it). */
      close: { label: string; glyph: ReactElement };
      /** The line under the title, which describes it to a screen reader. */
      sub?: ReactNode;
      /** What it is of, drawn before its title: a business's tile (canvas A, the business sheet). */
      mark?: ReactNode;
      /**
       * The mark and the title open what the sheet is of (the Pipeline's deal sheet: their page), drawn as they are, a
       * press each: the title's words the button, named by `label`; the mark the same press, out of the tab order.
       */
      opens?: SheetOpensTo;
      /** A strip of tools over the rows: a search, an Add. */
      tools?: ReactNode;
      /** The foot, which holds still under the rows: the page's acts. */
      foot?: ReactNode;
      /**
       * The title said as a quiet line over what the sheet holds, its Close a small circle at that line's end, where
       * what it holds draws its own head (a name, its state, its acts): one head, never two stacked.
       */
      kicker?: boolean;
      /**
       * The tools of a kicker stand on its line, between the title and the Close, where they were a strip under it: a
       * door out of what the sheet is over (Open in Campaigns).
       */
      toolsInLine?: boolean;
      /**
       * The foot holds a question in its acts' place (the page's Confirm: "Leave what you wrote?"), so kit.css gives its
       * words their room.
       */
      asking?: boolean;
      /**
       * On a phone it keeps the height it opened at, whatever comes and goes in it (Add people: a way switched, a note
       * written, a list read): its head never moves under the thumb, and what it holds past that height scrolls in its
       * body. The keyboard still takes from it (kit.css, "A steady sheet").
       */
      steady?: boolean;
      /**
       * Two rests on a phone (kit.css "Two rests", rests.ts): at half it stands down by the rule's length, or with `fit`
       * as tall as what it holds, what it holds first over the page and its foot held still at the screen's foot; at full
       * it stands whole. Where it stands is the page's (`at`), and `onRest` asks to move it: the handle is a button that
       * turns it, named by `turn`, and a pull moves it, from half down to close. On a desk it is the side pane, and has none.
       */
      rest?: SheetRestControl;
      /** The foot is its presses alone on the sheet's ground, no pill round them (kit.css "A flat foot"). */
      flatFoot?: boolean;
      /**
       * Its ground is solid and its head runs into what it holds, no rule between them (kit.css, "A solid sheet"): one that
       * is read and answered on, as a sheet whose first rest fits already is (the Calendar's visit, beside Today's walk).
       */
      solid?: boolean;
      /**
       * A kicker said to a screen reader alone (a message's sheet, whose pane's head says its name, where it stands and
       * what it is: the message sheet's canvas, 12 Nov 2026): no line of its own, the Close at the head's corner over what
       * it holds, which keeps its head clear of it (kit.css, "An unsaid kicker").
       */
      unsaid?: boolean;
      /**
       * Where it is a step of another (Add people's lists: "Put them on"), the way back to it, before the title, as a
       * job's: the kit's own back (the change list's A5, 25 Nov 2026).
       */
      back?: SheetBack | null;
    }
  | {
      shape: "job";
      /** Its Close, the round one every sheet has, named by the job's word ("Cancel", "Done"). */
      close: { word: string };
      back?: SheetBack | null;
      sub?: undefined;
      mark?: undefined;
      opens?: undefined;
      tools?: undefined;
      foot?: undefined;
      kicker?: undefined;
      toolsInLine?: undefined;
      asking?: undefined;
      steady?: undefined;
      rest?: undefined;
      flatFoot?: undefined;
      solid?: undefined;
      unsaid?: undefined;
    };

/** A sheet: whether it is open, what asks it to close, its head, what it holds, and its shape's parts. */
export type SheetProps = SheetShape & {
  open: boolean;
  /** Asked by Escape, a press on the wash, a pull down and the head's Close; the page closes it by setting `open`. */
  onClose: () => void;
  /** Its title, which names it to a screen reader. */
  title: ReactNode;
  /** The rows, or the job. */
  children?: ReactNode;
  /**
   * What is focused as it opens, where it is not the sheet itself: a field the page wants typed in at once, or what a
   * rule of the page's finds as it opens (a fold's first field: record/fold.tsx).
   */
  initialFocus?: RefObject<HTMLElement | null> | (() => HTMLElement | null);
  className?: string;
  ref?: Ref<HTMLElement>;
  /** Its test id; its Close and its way back are `<testid>-close` and `<testid>-back`. */
  testid?: string;
  /**
   * Back closes it (back.ts): an entry in the tab's history while it is open, named in the address where it is a name
   * (`note:<person>`, so a reload opens it again). Left off where the page's own address already holds the sheet.
   */
  backCloses?: boolean | string;
  /**
   * On a desk it is as tall as what it holds, never past the window's height: a short read (the Calendar's Hours and
   * rules) stood in a pane as tall as the window, 700px of it empty (kit.css, "A fitted sheet").
   */
  fit?: boolean;
  /**
   * Dark whatever the page's light (its wash too): a sheet over a picture opened dark, as Content's piece is on a phone
   * (the content canvas's viewer), stands in the dark it opened from.
   */
  dark?: boolean;
  /**
   * A save of what it holds is out: it says so to a screen reader (`aria-busy`), and its Close says it does nothing
   * now (`aria-disabled`). The page keeps it open meanwhile: its `onClose` asks nothing of it until the save is back.
   */
  busy?: boolean;
  /** Keys heard anywhere in it, before Base UI's: a composer's Ctrl or Cmd with Enter, which saves (record/focus.ts recKeys). */
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  /**
   * Focus coming to anything in it: the record kit's hold (record/focus.ts useRecFocusHold), which gives focus back to the
   * field a person was in when what held it went (an Undo, an ask's button).
   */
  onFocus?: (e: FocusEvent<HTMLElement>) => void;
};

/** Base UI's closing state, in the kit's word for it: a sheet on its way out (kit.css, `[data-leaving]`). */
const closingWord = (state: { transitionStatus: "starting" | "ending" | "idle" | undefined }) =>
  state.transitionStatus === "ending" ? "true" : undefined;

/**
 * A sheet let go of while it is open (a page that draws it only while it is open, as most do) leaves the way it came all
 * the same: a still copy of it and its wash plays its leaving over the document's body (kit/motion/leaving.ts), as Base
 * UI's closing does when the page closes it by `open`. On the body, since Base UI's portal goes in the same commit. Read
 * as React lets go of it, before the frame is painted, so nothing flickers between the two.
 */
function useLeavesWhenLetGo(open: boolean, self: RefObject<HTMLElement | null>) {
  const openNow = useRef(open);
  openNow.current = open;
  const shownSince = useRef(0);
  useLayoutEffect(
    () => () => {
      const was = self.current;
      if (!was || !openNow.current || Date.now() - shownSince.current < SEEN_MS) return;
      leaveOverlay(was, was.parentElement?.querySelector(".sheet-backdrop") ?? null, document.body);
    },
    [self],
  );
  return shownSince;
}

/** A test id of one of its parts, where the sheet has one. */
const partId = (testid: string | undefined, part: string) => (testid ? `${testid}-${part}` : undefined);

/** Where a sheet's mark and title go when pressed (`opens`): its name for a screen reader, and the press. */
export interface SheetOpensTo {
  label: string;
  press: () => void;
}

/**
 * A sheet's title, or its mark, as a press to what the sheet is of, drawn as it is (kit.css `.rec-sheet-opens`): the
 * title's words named by where they go; the mark (`mark`) the same press out of the tab order and hidden from a screen
 * reader, since the title already is one. A pane that draws its own head (the Pipeline's desk peek) uses it as is.
 */
export function SheetOpens({
  to,
  mark = false,
  testid,
  children,
}: {
  to: SheetOpensTo;
  mark?: boolean;
  testid?: string;
  children: ReactNode;
}) {
  return mark ? (
    <button type="button" className="rec-sheet-opens" tabIndex={-1} aria-hidden="true" onClick={to.press}>
      {children}
    </button>
  ) : (
    <button type="button" className="rec-sheet-opens" aria-label={to.label} onClick={to.press} data-testid={testid}>
      {children}
    </button>
  );
}

/** A step's way back to the sheet it came from, before the title: a record's or a job's. */
function stepBack(back: SheetBack | null | undefined, testid: string | undefined) {
  return back ? (
    <button
      type="button"
      className="sheet-job-back"
      aria-label={back.label}
      onClick={back.onBack}
      data-testid={partId(testid, "back")}
    >
      {back.glyph}
    </button>
  ) : null;
}

/** A record's head, tools, rows and foot. */
function recordParts(p: SheetProps & { shape?: "record" }) {
  const opens = p.opens;
  const mark =
    p.mark && opens ? (
      <SheetOpens to={opens} mark>
        {p.mark}
      </SheetOpens>
    ) : (
      p.mark
    );
  return (
    <>
      <header className="rec-sheet-head" data-marked={p.mark ? "true" : undefined}>
        {stepBack(p.back, p.testid)}
        {p.mark ? <span className="sheet-mark">{mark}</span> : null}
        <div className="rec-sheet-heading">
          <Dialog.Title className="rec-sheet-title">
            {opens ? (
              <SheetOpens to={opens} testid={partId(p.testid, "opens")}>
                {p.title}
              </SheetOpens>
            ) : (
              p.title
            )}
          </Dialog.Title>
          {p.sub ? <Dialog.Description className="rec-sheet-sub">{p.sub}</Dialog.Description> : null}
        </div>
        {p.toolsInLine && p.tools ? <div className="rec-sheet-line">{p.tools}</div> : null}
        <Dialog.Close
          className="rec-sheet-close"
          aria-label={p.close.label}
          aria-disabled={p.busy || undefined}
          onClick={(e) => {
            // The Close asks the page, as Escape and the wash do, in Base UI's press's place (which would ask the same).
            e.preventBaseUIHandler();
            p.onClose();
          }}
          data-testid={partId(p.testid, "close")}
        >
          {p.close.glyph}
        </Dialog.Close>
      </header>
      {p.tools && !p.toolsInLine ? <div className="rec-sheet-tools">{p.tools}</div> : null}
      <div className="rec-sheet-body">{p.children}</div>
      {p.foot ? (
        <footer
          className={cx("rec-sheet-foot", p.flatFoot && "rec-sheet-foot-flat")}
          data-asking={p.asking ? "true" : undefined}
        >
          {p.foot}
        </footer>
      ) : null}
    </>
  );
}

/** A job's short head (its way back, its title, its Close) and the job under it. */
function jobParts(p: SheetProps & { shape: "job" }) {
  return (
    <>
      <header className="sheet-job-head">
        {stepBack(p.back, p.testid)}
        <Dialog.Title className="sheet-job-title">{p.title}</Dialog.Title>
        {/* The one round Close every sheet has (kit.css, "One Close for every sheet"), named by the job's word: a word in its
            place ("Cancel") was a second way to close a sheet, where every other sheet drew the × (Ruben, 25 Nov 2026). */}
        <Dialog.Close
          className="sheet-job-close"
          aria-label={p.close.word}
          aria-disabled={p.busy || undefined}
          onClick={(e) => {
            e.preventBaseUIHandler();
            p.onClose();
          }}
          data-testid={partId(p.testid, "close")}
        >
          <Icon name="x" size={13} />
        </Dialog.Close>
      </header>
      <div className="sheet-job-body">{p.children}</div>
    </>
  );
}

/**
 * What asks the page to close it: Escape, a press on the wash, a pull, its Close. An Escape something in it took first is
 * that one's (a list closing, as the record kit's combobox's does): Base UI hears it on the document after the page's
 * own handlers, so the sheet stays, as the house's sheet did.
 */
const closeAsked =
  (onClose: () => void) => (next: boolean, change: { reason: string; event: Event; cancel: () => void }) => {
    if (next) return;
    if (change.reason === "escape-key" && change.event.defaultPrevented) {
      change.cancel();
      return;
    }
    onClose();
  };

/** What its popup says of it, as kit.css draws it: its busy save and each part of its shape a rule reads. */
const popupMarks = (shown: SheetProps) => ({
  "aria-busy": shown.busy || undefined,
  "data-fit": shown.fit ? "true" : undefined,
  "data-steady": shown.steady ? "true" : undefined,
  "data-rest": shown.rest ? shown.rest.at : undefined,
  "data-rest-fit": shown.rest?.fit ? "true" : undefined,
  "data-solid": shown.solid ? "true" : undefined,
  "data-unsaid": shown.unsaid ? "true" : undefined,
});

/** A phone's pull: between its two rests where it has them, else down to close. */
const pullOf = (shown: SheetProps, onClose: () => void) =>
  shown.rest
    ? restSwipe({ rest: shown.rest.at, onRest: shown.rest.onRest, onClose, when: onAPhone })
    : touchSwipe({ onDown: onClose, when: onAPhone });

/**
 * The sheet as it is on the page (`self`), and the callback that places it: its height's glide, its first rest, a steady
 * sheet's height read once, when it was shown (for its leaving), and the page's ref.
 */
function usePlaced(shown: SheetProps, open: boolean, ref: Ref<HTMLElement> | undefined) {
  const self = useRef<HTMLElement | null>(null);
  const glide = useHeightGlide();
  const fitRest = useFitRest(!!shown.rest?.fit);
  // Whether it keeps the height it opened at, read as it is placed (a steady sheet's height is read once, there).
  const steady = useRef(false);
  steady.current = !!shown.steady;
  const shownSince = useLeavesWhenLetGo(open, self);
  const place = useCallback(
    (el: HTMLElement | null) => {
      self.current = el;
      glide(el);
      fitRest(el);
      // A steady sheet's height is what it held as it opened, read once, here (kit.css reads it on a phone only).
      if (el && steady.current) el.style.setProperty("--sheet-steady", `${el.offsetHeight}px`);
      if (el) shownSince.current = Date.now();
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref, glide, fitRest, shownSince],
  );
  return { self, place };
}

/** A modal sheet, over the page's wash, drawn on the document's body. */
export function Sheet(props: SheetProps) {
  const { open, onClose, initialFocus, className, ref, testid, backCloses } = props;
  const theme = props.dark ? "dark" : undefined;
  useBackCloses(open && !!backCloses, onClose, typeof backCloses === "string" ? backCloses : null);
  // Open, and not on its way out (data-leaving, as Base UI says it is closing): a toast clears its foot (kit.css), which
  // asks the document's root (motion/root-flags.ts).
  useRootFlag("sheetOpen", open);
  // What it held as it was last drawn open: what it shows while it leaves.
  const held = useRef<SheetProps>(props);
  if (open) held.current = props;
  const shown = open ? props : held.current;
  const { self, place } = usePlaced(shown, open, ref);
  // What takes focus as it opens: a field inside that took it as it was drawn, else the sheet itself.
  const firstFocus = useCallback(() => {
    const at = document.activeElement;
    return self.current && at instanceof HTMLElement && self.current.contains(at) ? at : self.current;
  }, [self]);
  return (
    <Dialog.Root open={open} onOpenChange={closeAsked(onClose)}>
      <Dialog.Portal>
        <Dialog.Backdrop
          className="sheet-backdrop"
          render={(p, state) => <div {...p} data-theme={theme} data-leaving={closingWord(state)} />}
        />
        <Dialog.Popup
          ref={place}
          initialFocus={initialFocus ?? firstFocus}
          className={cx("sheet", shown.kicker && "sheet-kicker", shown.rest && "sheet-rests", className)}
          // What it is, said as Base UI says it, so a page's test finds the sheet by it as a screen reader does.
          role="dialog"
          {...popupMarks(shown)}
          data-testid={testid}
          onKeyDown={props.onKeyDown}
          onFocus={props.onFocus}
          {...pullOf(shown, onClose)}
          render={(p, state) => <section {...p} data-theme={theme} data-leaving={closingWord(state)} />}
        >
          <SheetHandle rest={shown.rest} testid={testid} />
          {shown.shape === "job" ? jobParts(shown) : recordParts(shown)}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
