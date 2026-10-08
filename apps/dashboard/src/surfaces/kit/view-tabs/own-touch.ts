/**
 * What keeps its own touch, and is never a page's: a dialog, a sheet, a menu, a toast, and anything that says it drags
 * (a map's streets, hold-to-talk). The strips' pager refuses this list (pager.ts), and the Calendar's days refuse the
 * same one. It stands alone because the Calendar reads it and nothing else here: beside the pager it brought the deck
 * and the highlight's glide onto a page that moves by neither (3,584 bytes gzipped, measured 8 Oct 2026).
 */
export const OWN_TOUCH = '[role="dialog"], [aria-modal="true"], [role="menu"], .sb-sheet, .pp-toast, [data-own-drag]';
