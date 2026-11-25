/**
 * What the kit's Sheet takes, proved where the compiler reads it (sheet.tsx): whether it is open, which is the page's,
 * and what asks it to close; its title, which names it; its Close, with its name and its glyph; and what it holds.
 * What would draw a sheet no one can name, close or leave stops compiling: no `open`, no `onClose`, no title, a Close
 * with no name, and a variant the kit's one frame does not have. Every sheet has its Close (Ruben, 25 Nov 2026: "one
 * design"): a record's is its glyph with its name, a phone's job's is named by the job's word, and neither may be left
 * out. A way back is a step's, a record's or a job's, and a job has no tools or foot.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, ReactElement, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { SheetBack, SheetProps } from "../index";
import { Sheet } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _sheetTakes(
  glyph: ReactElement,
  field: RefObject<HTMLInputElement | null>,
  sheet: RefObject<HTMLElement | null>,
  open: boolean,
): void {
  const close = () => undefined;
  type _Its = [
    Holds<Exactly<ComponentProps<typeof Sheet>, SheetProps>>,
    Holds<Exactly<SheetProps["open"], boolean>>,
    Holds<Exactly<SheetProps["onClose"], () => void>>,
    Holds<Exactly<SheetProps["close"], { label: string; glyph: ReactElement } | { word: string }>>,
    Holds<Exactly<SheetBack["onBack"], () => void>>,
  ];
  Sheet({ open, onClose: close, title: "Services", close: { label: "Close", glyph }, children: "Three services" });
  // A phone's small job: a word to close it, a way back where it is a step, a field focused as it opens, its test id.
  Sheet({
    open,
    shape: "job",
    onClose: close,
    title: "Not a fit",
    close: { word: "Cancel" },
    back: { label: "Back", glyph, onBack: close },
    initialFocus: field,
    testid: "bulk-sheet",
    children: "Why",
  });
  // A record that is a step of another (Add people's lists): the kit's own back before its title, and its Close.
  Sheet({
    open,
    onClose: close,
    title: "Put them on",
    close: { label: "Close", glyph },
    back: { label: "Back to their details", glyph, onBack: close },
    children: "The lists",
  });
  // A composer whose save is out, its keys and its focus heard, a question in its foot, a steady height.
  Sheet({
    open,
    onClose: close,
    title: "Add people",
    close: { label: "Close", glyph },
    foot: "Discard what you wrote?",
    asking: true,
    busy: true,
    steady: true,
    onKeyDown: () => undefined,
    onFocus: () => undefined,
    initialFocus: () => null,
    children: "One person",
  });
  // A composer: its line, its tools and its foot; a field focused as it opens; the page's ref and its width.
  Sheet({
    open,
    onClose: close,
    title: "Services",
    sub: "What you offer, and how long each takes.",
    close: { label: "Close", glyph },
    tools: "Find a service",
    foot: "Save",
    initialFocus: field,
    ref: sheet,
    className: "pl-sheet-wide",
    children: "Three services",
  });

  // @ts-expect-error whether it is open is the page's to say, every time
  Sheet({ onClose: close, title: "Services", close: { label: "Close", glyph } });
  // @ts-expect-error Escape, the wash and its Close ask the page to close it, so it takes what they ask
  Sheet({ open, title: "Services", close: { label: "Close", glyph } });
  // @ts-expect-error its title names it to a screen reader
  Sheet({ open, onClose: close, close: { label: "Close", glyph } });
  // @ts-expect-error a Close that is a glyph alone says its name
  Sheet({ open, onClose: close, title: "Services", close: { glyph } });
  // @ts-expect-error the kit draws a sheet in one frame: a side pane on a desk, from the bottom on a phone
  Sheet({ open, onClose: close, title: "Services", close: { label: "Close", glyph }, variant: "centred" });
  // @ts-expect-error a record's Close is its glyph and its name: a word is a job's
  Sheet({ open, onClose: close, title: "Services", close: { word: "Cancel" } });
  // @ts-expect-error every sheet has its Close, a record's among them
  Sheet({ open, onClose: close, title: "Services", close: null });
  // @ts-expect-error and a job's: the round Close is in its head beside its own button (no `close: null`)
  Sheet({ open, shape: "job", onClose: close, title: "Delete the list", close: null, children: "Delete it?" });
  // @ts-expect-error a foot that closes it is gone: the Close is in its corner on a phone too
  Sheet({ open, onClose: close, title: "Services", close: { label: "Close", glyph }, footCloses: true });
  // @ts-expect-error a job's sheet is its job: no tools and no foot
  Sheet({ open, shape: "job", onClose: close, title: "Add a person", close: { word: "Cancel" }, foot: "Add" });
  // @ts-expect-error a job's sheet holds no steady height: a job is as tall as what it holds
  Sheet({ open, shape: "job", onClose: close, title: "Add a person", close: { word: "Cancel" }, steady: true });
}
