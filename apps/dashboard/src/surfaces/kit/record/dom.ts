/**
 * The record kit's DOM lookups (decision 0015): `querySelector` and `querySelectorAll` with the element type a caller
 * means, and whether an element has a method at all (a test's stand-in element may not). lib.dom marks a bare read of
 * `querySelector` deprecated, so a guard reads it here, by name, and the kit's files call these.
 */

/** The first element under `root` that `selector` names, as the type the caller expects. */
export function pick<E extends Element = HTMLElement>(root: ParentNode, selector: string): E | null {
  return root.querySelector<E>(selector);
}

/** Every element under `root` that `selector` names, as the type the caller expects. */
export function pickAll<E extends Element = HTMLElement>(root: ParentNode, selector: string): NodeListOf<E> {
  return root.querySelectorAll<E>(selector);
}

/** Whether `el` has a method by that name: the shell's tests draw against stand-in elements that have only some. */
export function can(el: object, method: string): boolean {
  return typeof (el as Record<string, unknown>)[method] === "function";
}
