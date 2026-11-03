/**
 * How a thumb's pull is read, the same for a sheet with two rests (rests.ts) and a foot docked with two (dock.ts): how
 * far a touch goes before it is a pull and not a tap, and what is a flick. One module of numbers alone, so a page that
 * takes the docked foot takes nothing of the sheet's.
 */

/** How far a touch goes before it is a pull and not a tap. */
export const GRAB_PX = 6;
/** A flick: fast enough (px a millisecond) over at least this far. */
export const FLICK_SPEED = 0.5;
export const FLICK_PX = 24;
