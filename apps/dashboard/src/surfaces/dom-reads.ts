/**
 * What a page reads of the DOM it is handed (an event's target, the element with focus, a node a press came from), by
 * what its code then uses of it, never by `instanceof`: the node suite draws the pages in a world with no DOM classes,
 * where a test's stand-in has the members and no prototype, and a page asked `instanceof Element` there throws.
 */
import { valueAt } from "@chanlytics/contracts";

/** Whether a value is an element: a node of the DOM's own element type (`nodeType` 1). */
export const isElementNode = (value: unknown): value is Element => valueAt(value, "nodeType") === 1;

/** Whether a value answers `closest`: what a press asks of the element it came from. */
export const answersClosest = (value: unknown): value is Pick<Element, "closest"> =>
  typeof valueAt(value, "closest") === "function";

/** Whether a value is a node of the DOM, of any type: what `contains` is asked of. */
export const isDomNode = (value: unknown): value is Node => typeof valueAt(value, "nodeType") === "number";

/** Whether an element is one of the page's HTML ones: it takes focus and has a style. */
export const isHtmlElement = (value: unknown): value is HTMLElement =>
  isElementNode(value) && typeof valueAt(value, "focus") === "function" && typeof valueAt(value, "style") === "object";

/** Whether a value is media that plays and pauses: what one call playing asks of the one that was. */
export const isMediaElement = (value: unknown): value is HTMLMediaElement =>
  typeof valueAt(value, "pause") === "function";
