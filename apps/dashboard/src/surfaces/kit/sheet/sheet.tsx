/**
 * The kit's sheet (kit.css, "Sheet"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4 and step 2.5):
 * a side pane on a desk, and from the bottom edge under the kit's 900px, over the page's wash. It holds one of two
 * shapes. A record's composer: a head with its title, the line under it and its Close; the tools, where a list has
 * them; the rows, which scroll; and a foot that holds still. Or a phone's small job (`shape="job"`: Add a person, a
 * list's name, what a selection can become): a short head with a way back where the job is a step of another, its
 * title, and a word to close it or none, then the job itself. What it lists and what its foot acts on are the page's.
 * A record's title may be a kicker (`kicker`): a quiet line over a pane that draws its own head, as Campaigns' drawers do.
 *
 * Its behaviour is Base UI's Dialog (`@base-ui/react/dialog`, the plan's decision 15): modal, so focus is held inside
 * it and the page behind is inert to a pointer and a screen reader and does not scroll; Escape and a press on the
 * wash ask the page to close it (`onClose`), as its Close does; as it closes, focus goes back to what held it when
 * it opened. It opens with the sheet itself focused, so a screen reader names it (kit.css draws no ring there), or
 * keeps a field inside it that took focus as it was drawn (a job's `autoFocus`, as the house's dialogs keep one), or
 * focuses the element `initialFocus` names. It stays drawn while it leaves: Base UI's closing state is the kit's
 * `data-leaving`, which plays the sheet's and its wash's leaving (kit.css), and Base UI lets it go when that ends.
 * It leaves as it was: what it held as it closed, not what the page holds after (a step gone, a draft cleared).
 * On a phone a pull down from its top asks to close it as its Close does (kit/motion/swipe.ts touchSwipe, the house's one
 * reader of a thumb), following the finger, and its handle says so; it is as tall as what it holds, up to its cap, and
 * its height glides as what it holds changes (motion/use-height-glide). A record's sheet may instead have two rests on a
 * phone (`rest`, rests.ts: the lead workbench's pile): one height, standing down at half and whole at full, its handle a
 * button between them and a pull moving it, from half down to close. The kit writes none of the rest by hand.
 *
 * Open is the page's (`open`), and so is closed: `onClose` asks, and the page answers by setting `open`, so a page
 * that asks first about what was typed, or holds a save that is out, keeps it open. It is drawn in a portal on the
 * document's body, where no pane's blur or transform can hold it.
 *
 * It draws what the gallery's Sheet family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser, entry for entry. `className` is for the page's layout (a
 * wider sheet), and comes last; the ref reaches the sheet; `testid` names it, its Close and its way back.
 */
import { Dialog } from "@base-ui/react/dialog";
import type { ReactElement, ReactNode, Ref, RefObject } from "react";
import { useCallback, useRef } from "react";
import { onAPhone, touchSwipe } from "../../legacy-verbs";
import { useHeightGlide } from "../motion/use-height-glide";
import { cx } from "../variants";
import { useBackCloses } from "./back";
import { restSwipe, type SheetRest } from "./rests";

/** A step inside a job: the way back to the one it came from, named for a screen reader, its glyph drawn. */
export type SheetBack = { label: string; glyph: ReactElement; onBack: () => void };

/**
 * A record's composer (the default): its Close a glyph with its name, and room for the line under the title, the
 * tools and the foot. A phone's small job: a word to close it ("Cancel") or none, where the job's own button is its
 * way out (Escape, the wash and a pull still close it), and a way back where it is a step; its body is the job.
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
       * What it holds closes it from its own foot (a composer's Cancel): on a phone the head's Close steps out of sight
       * there, as a record sheet's does over its Cancel, and comes back for a keyboard.
       */
      footCloses?: boolean;
      /**
       * Two rests on a phone (kit.css "Two rests", rests.ts): at half it stands down by the rule's length, what it holds
       * first over the page and its foot held still at the screen's foot; at full it stands whole. Where it stands is the
       * page's (`at`), and `onRest` asks to move it: the handle is a button that turns it, named by `turn`, and a pull
       * moves it, from half down to close. On a desk it is the side pane, and has none.
       */
      rest?: { at: SheetRest; onRest: (at: SheetRest) => void; turn: { up: string; down: string } };
      back?: undefined;
    }
  | {
      shape: "job";
      close: { word: string } | null;
      back?: SheetBack | null;
      sub?: undefined;
      mark?: undefined;
      tools?: undefined;
      foot?: undefined;
      kicker?: undefined;
      footCloses?: undefined;
      rest?: undefined;
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
  /** What is focused as it opens, where it is not the sheet itself: a field the page wants typed in at once. */
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
  ref?: Ref<HTMLElement>;
  /** Its test id; its Close and its way back are `<testid>-close` and `<testid>-back`. */
  testid?: string;
  /**
   * Back closes it (back.ts): an entry in the tab's history while it is open, named in the address where it is a name
   * (`note:<person>`, so a reload opens it again). Left off where the page's own address already holds the sheet.
   */
  backCloses?: boolean | string;
};

/** Base UI's closing state, in the kit's word for it: a sheet on its way out (kit.css, `[data-leaving]`). */
const closingWord = (state: { transitionStatus: "starting" | "ending" | "idle" | undefined }) =>
  state.transitionStatus === "ending" ? "true" : undefined;

/** A test id of one of its parts, where the sheet has one. */
const partId = (testid: string | undefined, part: string) => (testid ? `${testid}-${part}` : undefined);

/** A record's head, tools, rows and foot. */
function recordParts(p: SheetProps & { shape?: "record" }) {
  return (
    <>
      <header className="rec-sheet-head" data-marked={p.mark ? "true" : undefined}>
        {p.mark ? <span className="sheet-mark">{p.mark}</span> : null}
        <div className="rec-sheet-heading">
          <Dialog.Title className="rec-sheet-title">{p.title}</Dialog.Title>
          {p.sub ? <Dialog.Description className="rec-sheet-sub">{p.sub}</Dialog.Description> : null}
        </div>
        <Dialog.Close className="rec-sheet-close" aria-label={p.close.label} data-testid={partId(p.testid, "close")}>
          {p.close.glyph}
        </Dialog.Close>
      </header>
      {p.tools ? <div className="rec-sheet-tools">{p.tools}</div> : null}
      <div className="rec-sheet-body">{p.children}</div>
      {p.foot ? <footer className="rec-sheet-foot">{p.foot}</footer> : null}
    </>
  );
}

/** A job's short head (its way back, its title, its word) and the job under it. */
function jobParts(p: SheetProps & { shape: "job" }) {
  return (
    <>
      <header className="sheet-job-head">
        {p.back ? (
          <button
            type="button"
            className="sheet-job-back"
            aria-label={p.back.label}
            onClick={p.back.onBack}
            data-testid={partId(p.testid, "back")}
          >
            {p.back.glyph}
          </button>
        ) : null}
        <Dialog.Title className="sheet-job-title">{p.title}</Dialog.Title>
        {p.close ? (
          <Dialog.Close className="sheet-job-close" data-testid={partId(p.testid, "close")}>
            {p.close.word}
          </Dialog.Close>
        ) : null}
      </header>
      <div className="sheet-job-body">{p.children}</div>
    </>
  );
}

/**
 * The handle: a mark of the pull, or, on a sheet with two rests, a button that turns it to the other, said by where it
 * goes.
 */
function handleOf(rest: SheetProps["rest"], testid: string | undefined) {
  if (!rest) return <div className="sheet-handle" aria-hidden="true" />;
  const to: SheetRest = rest.at === "half" ? "full" : "half";
  return (
    <button
      type="button"
      className="sheet-handle"
      aria-label={to === "full" ? rest.turn.up : rest.turn.down}
      aria-expanded={rest.at === "full"}
      onClick={() => rest.onRest(to)}
      data-testid={partId(testid, "handle")}
    />
  );
}

/** A modal sheet, over the page's wash, drawn on the document's body. */
export function Sheet(props: SheetProps) {
  const { open, onClose, initialFocus, className, ref, testid, backCloses } = props;
  useBackCloses(open && !!backCloses, onClose, typeof backCloses === "string" ? backCloses : null);
  const self = useRef<HTMLElement | null>(null);
  // What it held as it was last drawn open: what it shows while it leaves.
  const held = useRef<SheetProps>(props);
  if (open) held.current = props;
  const shown = open ? props : held.current;
  // What takes focus as it opens: a field inside that took it as it was drawn, else the sheet itself.
  const firstFocus = useCallback(() => {
    const at = document.activeElement;
    return self.current && at instanceof HTMLElement && self.current.contains(at) ? at : self.current;
  }, []);
  const glide = useHeightGlide();
  // The sheet as it is on the page, for its own focus, its height's glide, and the page's ref.
  const place = useCallback(
    (el: HTMLElement | null) => {
      self.current = el;
      glide(el);
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref, glide],
  );
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          className="sheet-backdrop"
          render={(p, state) => <div {...p} data-leaving={closingWord(state)} />}
        />
        <Dialog.Popup
          ref={place}
          initialFocus={initialFocus ?? firstFocus}
          className={cx("sheet", shown.kicker && "sheet-kicker", shown.rest && "sheet-rests", className)}
          data-foot-closes={shown.footCloses ? "true" : undefined}
          data-rest={shown.rest ? shown.rest.at : undefined}
          data-testid={testid}
          {...(shown.rest
            ? restSwipe({ rest: shown.rest.at, onRest: shown.rest.onRest, onClose, when: onAPhone })
            : touchSwipe({ onDown: onClose, when: onAPhone }))}
          render={(p, state) => <section {...p} data-leaving={closingWord(state)} />}
        >
          {handleOf(shown.rest, testid)}
          {shown.shape === "job" ? jobParts(shown) : recordParts(shown)}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
