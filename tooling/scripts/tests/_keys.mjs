/**
 * What a drawn tree shows of a keyboard key, for the tests that hold the app to one list of keys: the ? sheet
 * (components/shortcuts.jsx, over contracts' SHORTCUTS). Ruben, 23 Sep 2026: "remove all display of these keyboard
 * symbols throughout the site while keeping functionality we built ... we already have the keyboard shortcuts on the
 * user nav sidebar that is enough." Every key still works; only the sheet says so.
 *
 * A key is drawn by a <kbd>, by anything wearing `.kbd`, by a key's glyph in the words, a title or a data-tip
 * (⌘ ⌥ ⇧ ⌃ ↵ ⏎ ⌫), by a key named in brackets after a label ("Close (esc)", "Today (T)", "Previous (←)"), and by
 * "press /". An aria-keyshortcuts is not drawn, and is not looked at. Arrows alone are not keys here: "Fri → Sat" is
 * a sentence the pages say.
 *
 * It walks a stub-React tree either way the tests' stubs build one: children as an array or not, and what a function
 * component rendered. Not named *.test.mjs on purpose: the runner globs that pattern.
 */
const GLYPH = /[⌘⌥⇧⌃↵⏎⌫]/;
const BRACKETED = /\((?:[Ee]sc|[A-Z]|[←→↑↓/?])\)/;
const PRESS = /\b[Pp]ress (?:[/?↵]|[A-Z]\b|[Ee]sc\b)/;
const saysAKey = (s) => typeof s === "string" && (GLYPH.test(s) || BRACKETED.test(s) || PRESS.test(s));

/** Every place in `tree` that draws a key, as a short description of it; none is `[]`. */
export function keysDrawn(tree) {
  const out = [];
  const seen = new Set();
  const visit = (n) => {
    if (n == null || typeof n === "boolean") return;
    if (typeof n === "string" || typeof n === "number") {
      if (saysAKey(String(n))) out.push(`"${n}"`);
      return;
    }
    if (Array.isArray(n)) {
      for (const k of n) visit(k);
      return;
    }
    if (typeof n !== "object" || seen.has(n)) return;
    seen.add(n);
    const p = n.props || {};
    const cls = typeof p.className === "string" ? p.className.split(/\s+/) : [];
    if (n.type === "kbd" || cls.includes("kbd")) out.push(`<${n.type} class="${p.className || ""}">`);
    for (const attr of ["title", "data-tip", "placeholder"]) if (saysAKey(p[attr])) out.push(`${attr}="${p[attr]}"`);
    visit(p.children);
    if (n.rendered !== undefined) visit(n.rendered);
  };
  visit(tree);
  return out;
}
