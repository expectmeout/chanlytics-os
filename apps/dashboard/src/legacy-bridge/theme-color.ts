/**
 * The browser's own bars, kept on the app's theme.
 *
 * The bars above and below a page -- a phone's address bar, the tab strip, the
 * status bar of the installed shell -- are painted from `meta[name=theme-color]`,
 * and the app declared it against `(prefers-color-scheme)`. That is the DEVICE's
 * setting, and the app's theme is not: it is `data-theme`, resolved from the
 * member's stored preference. A member running the app light on a dark phone got
 * a black strip over a white page, permanently, because nothing ever re-read it.
 *
 * So the meta follows the resolved theme. The boot script stamps it before first
 * paint (contracts `themeBootScript`), and this re-stamps it whenever the theme
 * changes after that -- the toggle in the top bar and the three options in the
 * user menu, and the device flipping to dark while "System" is chosen. Both read
 * the one colour per theme from contracts, and theme-boot.test.mjs runs the two
 * against each other so they cannot drift apart.
 */
import { THEME_COLOR_META, themeColorOf, type Theme } from "@chanlytics/contracts";

/**
 * Every meta the bars could be read from, or one new one when the head has none.
 * Every, because React plants a second copy during hydration whenever the boot
 * script has already changed the one the markup shipped -- so by the time this
 * first runs there are usually two, and the one left alone still says dark.
 */
function themeColorMetas(doc: Document): Element[] {
  const found = Array.from(doc.querySelectorAll(THEME_COLOR_META));
  if (found.length) return found;
  const made = doc.createElement("meta");
  made.setAttribute("name", "theme-color");
  doc.head.appendChild(made);
  return [made];
}

/** Paint the browser's bars in this theme's paper, in the look the page wears. */
export function paintThemeColor(doc: Document, theme: Theme, look: string = "classic"): void {
  try {
    const color = themeColorOf(theme, look);
    for (const meta of themeColorMetas(doc)) meta.setAttribute("content", color);
  } catch {
    /* no head to write to: the page still paints, the bars keep what they had */
  }
}
