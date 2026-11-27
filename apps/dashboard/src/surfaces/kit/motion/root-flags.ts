/**
 * What a rule asks of the whole page, said on the document's root (`<html>`) by the part that sets it, as it sets it.
 *
 * A rule whose `:has()` stood on the document's root (`:root:has(.sheet:not([data-leaving])) .pp-toast-stack`,
 * `body:has([data-takeover]) .phone-ask`, `html:has(.app-root) body`) had the browser look at that `:has()` again on
 * every change anywhere in the page, and style what it styles again each time: 135 to 260 elements, several times a press
 * on a slow phone (25 Nov 2026). Forty-five selectors asked sixteen things; each is a flag here, stamped on `<html>` while
 * it holds, and the rule asks the flag (`:root[data-sheet-open] .pp-toast-stack`), which the browser looks at only when
 * the flag itself changes. styles/has-subjects.test.mjs holds that no `:has()` stands on the root again.
 *
 * A flag is counted: two sheets open hold `data-sheet-open` until both have gone. A part of React's holds it while its
 * state is on (`useRootFlag`), stamped as React commits the part and before any layout effect of the commit reads the
 * page (an insertion effect): a measure taken in the same commit finds the page as it will be drawn, and no stamp written
 * after a read has the browser lay the page out again. Nothing here reads the page's layout.
 *
 * What the old rules also saw, and these keep seeing: a page or an overlay that leaves by a picture of itself (the node
 * React took away put back while it slides out, kit/motion/view-deck.ts; a still copy playing an overlay out,
 * kit/motion/leaving.ts) holds what it pictures until it is gone (`holdPictured`), read once by the
 * very selector the rule's `:has()` held; and a page marked outside React (a thumb's carry, `data-going`) holds what the
 * mark makes it while the mark stands (`holdWhileMarked`). The frame's own flag is the document's before any code runs
 * (contracts outlineBootScript, held to this word by theme-boot.test.mjs), as the outline it stands for is drawn first.
 */
import { useInsertionEffect } from "react";

/**
 * Each flag: its attribute on `<html>`, what of the page the rule's `:has()` asked (`picture`, the argument as it was
 * written), and where it asked it (`within`: the app's root, `.app-root`, or the document's body; `document` for a
 * `:has()` on `html`).
 */
export const ROOT_FLAGS = {
  /** The app's frame is drawn, or its outline (was `html:has(.app-root)`): the page's ground is the document's. */
  frame: { attr: "data-frame", picture: ".app-root", within: "document" },
  /** A page takes the screen over (a thread, a call, a person: `data-takeover` on its root): the frame's chrome leaves. */
  takenOver: { attr: "data-taken-over", picture: "[data-takeover]", within: "body" },
  /** A conversation or a Campaigns pane takes it over: the frame's top gives way to its own head. */
  threadOpen: {
    attr: "data-thread-open",
    picture: ":is(.inbox, .conversations, .cm-split)[data-takeover]",
    within: "frame",
  },
  /** The Inbox's or Conversations' page, taken over: the window holds still under the conversation. */
  threadPane: {
    attr: "data-thread-pane",
    picture: ".main-scroll.pane > :is(.inbox, .conversations)[data-takeover]",
    within: "document",
  },
  /** A bar docked at the foot in the frame (People's selection, a thread's reply): the tab bar stands down. */
  dockInFrame: { attr: "data-dock-frame", picture: "[data-dock]:not([data-leaving])", within: "frame" },
  /** A bar docked at the foot anywhere on the page, a sheet's or a person's too: AI's circle stands down. */
  dockUp: { attr: "data-dock-up", picture: "[data-dock]:not([data-leaving])", within: "body" },
  /** A sheet open over another page (a run, a message, a visit, Today's AI): the tab bar stands down. */
  overPage: { attr: "data-over-page", picture: ":is(.cmh-host-over, .over-page):not([data-leaving])", within: "body" },
  /** The kit's sheet is open, not on its way out: a toast clears its foot. */
  sheetOpen: { attr: "data-sheet-open", picture: ".sheet:not([data-leaving])", within: "document" },
  /** The bell's list is open, not on its way out: a toast stands at the screen's foot. */
  bellOpen: { attr: "data-bell-open", picture: ".tbn-place:not([data-leaving])", within: "document" },
  /** A dialog holds the page (`aria-modal`): the page holds still under it. */
  modalOpen: { attr: "data-modal-open", picture: '[aria-modal="true"]', within: "document" },
  /** The phone's drawer is open: the page holds still under it. */
  drawerOpen: { attr: "data-drawer-open", picture: ".side-wrap.open", within: "document" },
  /** Settings is drawn: the screen does not band under a pull. */
  settingsPage: { attr: "data-settings-page", picture: ".settings", within: "document" },
  /** Leads' first day: the page is the screen as the browser shows it, and no taller. */
  leadsFirstDay: { attr: "data-leads-first-day", picture: ".leads-scope[data-first-day]", within: "frame" },
  /** A person's page is carried over People by a thumb or pushed in over it: its dock steps aside. */
  personGoing: { attr: "data-person-going", picture: ".cl-profile[data-going]", within: "body" },
  /** People's or Leads' selection bar is up: a toast rises over it. */
  bulkDocked: { attr: "data-bulk-docked", picture: ".cl-bulk.pp-bulk", within: "body" },
} as const;

type RootFlag = keyof typeof ROOT_FLAGS;

/** Whether a word names a flag. */
const isRootFlag = (word: string): word is RootFlag => Object.hasOwn(ROOT_FLAGS, word);

/** How many hold each flag now. */
const holdCounts = new Map<RootFlag, number>();

/** The document's root, where there is one to stamp (none on the server, nor where a stand-in document has none). */
const root = (): HTMLElement | null => {
  const html = typeof document === "undefined" ? null : document.documentElement;
  return html && typeof html.setAttribute === "function" ? html : null;
};

/** Hold `flag` on the document until the returned function lets go of it: it stands while anyone holds it. */
export function holdRootFlag(flag: RootFlag): () => void {
  const html = root();
  if (!html) return () => {};
  const count = (holdCounts.get(flag) ?? 0) + 1;
  holdCounts.set(flag, count);
  if (count === 1) html.setAttribute(ROOT_FLAGS[flag].attr, "");
  let gone = false;
  return () => {
    if (gone) return;
    gone = true;
    const left = (holdCounts.get(flag) ?? 1) - 1;
    holdCounts.set(flag, left);
    if (left === 0) html.removeAttribute(ROOT_FLAGS[flag].attr);
  };
}

/** Hold each of `flags` until the returned function lets go of them all. */
const holdEach = (flags: readonly RootFlag[]): (() => void) => {
  const lets = flags.map(holdRootFlag);
  return () => {
    for (const letGo of lets.splice(0)) letGo();
  };
};

/**
 * Hold `flags` (one, or every flag a state stands for) while `on`, from the commit that draws the part so: before any
 * layout effect of that commit reads the page.
 */
export function useRootFlag(flags: RootFlag | readonly RootFlag[], on: boolean): void {
  const named = [flags].flat().join(" ");
  useInsertionEffect(() => (on ? holdEach(named.split(" ").filter(isRootFlag)) : undefined), [named, on]);
}

/** Whether `node`, where it stands, is inside what a flag's rule asked of (the app's root, or the document's body). */
const standsWithin = (node: Element, within: (typeof ROOT_FLAGS)[RootFlag]["within"]): boolean =>
  within === "document" || !!node.closest(within === "frame" ? ".app-root" : "body");

/**
 * Hold each flag whose `:has()` `node` meets where it stands, anywhere in it, or (`mark`) itself by that mark alone;
 * let go of them all at once.
 */
function holdMet(node: Element, mark: string | null): () => void {
  const readable = typeof node.matches === "function" && "querySelector" in node;
  if (!readable || typeof node.closest !== "function" || !node.isConnected) return () => {};
  const met = Object.keys(ROOT_FLAGS)
    .filter(isRootFlag)
    .filter((flag) => {
      const { picture, within } = ROOT_FLAGS[flag];
      const meets = mark
        ? picture.includes(`[${mark}]`) && node.matches(picture)
        : node.matches(picture) || !!node.querySelector(picture);
      return meets && standsWithin(node, within);
    });
  return holdEach(met);
}

/**
 * What a picture put on the page holds while it stands (a page put back as it slides out, an overlay's still copy): each
 * flag whose `:has()` it would have met where it stands, read once by that flag's own selector, as the picture never
 * changes. Asked once it is in the document; the returned function lets go of all of them, as it is taken out.
 */
export const holdPictured = (node: Element): (() => void) => holdMet(node, null);

/** A picture's way out: hold what it pictures now, and the returned function takes it out and lets go of all of it. */
export const takenOutLater = (node: Element): (() => void) => {
  const letGo = holdPictured(node);
  return () => {
    node.remove();
    letGo();
  };
};

const marked = new WeakMap<Element, () => void>();

/**
 * What an element marked outside React holds while the mark stands (a page a thumb carries wears `data-going`,
 * held-list.ts carriedOver): each flag whose selector asks that mark of it and that it now meets, held for it while
 * `on`; an `off` lets go of what it held. A second `on` holds nothing more.
 */
export function holdWhileMarked(el: Element, mark: string, on: boolean): void {
  const had = marked.get(el);
  if (on && !had) marked.set(el, holdMet(el, mark));
  if (!on && had) {
    had();
    marked.delete(el);
  }
}
