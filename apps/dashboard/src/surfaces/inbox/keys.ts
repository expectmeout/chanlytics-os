/**
 * Which keys the Inbox's pages leave alone (moved whole from pages/inbox-state.tsx, so the Inbox's page and the act that
 * stands over its three tabs ask one rule): a chord, a key another listener took, one pressed in a dialog over the page,
 * and one typed in a field.
 */

/** A target that can say what is over it: an element, and anything a test stands in for one. */
interface Closer {
  closest: (selector: string) => unknown;
}
const isCloser = (v: unknown): v is Closer =>
  typeof v === "object" && v !== null && "closest" in v && typeof v.closest === "function";

/** The tag of an event's target, when it is an element: nothing for a target that has none. */
const tagOf = (target: EventTarget | null): string =>
  target && "tagName" in target && typeof target.tagName === "string" ? target.tagName : "";

/** Whether an event's target is a field of free text the member is writing in. */
const isEditable = (target: EventTarget | null): boolean =>
  !!(target && "isContentEditable" in target && target.isContentEditable);

/**
 * What stands over the page and keeps its own keys. The record kit's sheet and the shell's own say aria-modal; the
 * kit's Sheet and its pops (Base UI) say role="dialog" and hold the page inert without it, so a rule that asked for
 * aria-modal alone let a key pressed on a button of the New conversation sheet walk the list behind it, and would
 * have let A approve a draft there and Ctrl with Enter send the reply box. An open menu keeps its keys the same way,
 * and so does whatever the kit stands on a pop (`.pop-place`: its select's list, its picker's, its popover): a letter typed
 * there finds one of its own rows. Never a listbox by its role alone: the Inbox's own rows are options in a listbox at
 * rest, and A, D, E and N pressed on a row someone clicked are the page's.
 */
const OVER_THE_PAGE = '[aria-modal="true"], [role="dialog"], [role="alertdialog"], [role="menu"], .pop-place';

/** Whether a key was pressed inside a dialog over the page. THE one statement of it for the Inbox's listeners. */
export const ixInDialog = (target: unknown): boolean => isCloser(target) && !!target.closest(OVER_THE_PAGE);

// A key the page leaves alone: a chord, one another listener took or one pressed in a dialog, or one typed in a field.
export const ixKeyLeft = (e: KeyboardEvent): boolean => {
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  // Not a key something else took, and not one pressed inside a dialog over the page: an arrow on its select moved
  // the thread behind it, and A on its buttons approved.
  if (e.defaultPrevented || ixInDialog(e.target)) return true;
  const tag = tagOf(e.target).toLowerCase();
  if (tag === "input" || tag === "textarea" || isEditable(e.target)) return true;
  return false;
};
