/**
 * The times a drawn tree says, and which of them have a mark over them (kit/says-when.ts): one with none is what a copy some
 * minutes old would go on saying. A tree of the stub React (_stub-react.mjs), walked as it is drawn: a component as what it
 * rendered, an element as its children. Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { NOT_A_TIME, SAYS_A_TIME } from "../../../e2e/shell/says-a-time.ts";

const TAGS = new Set(NOT_A_TIME.tags);
const CLASSES = new Set(NOT_A_TIME.classes);

/** A name, an act or a person's own words, by the element that holds them: nothing under it is a time the app claims. */
const notATime = (n) =>
  TAGS.has(n.type) ||
  String(n.props?.className ?? "")
    .split(/\s+/)
    .some((c) => CLASSES.has(c));

/** Every time the tree says, each by its words and whether it stands under a mark. */
export function timesSaid(tree) {
  const out = [];
  const walk = (n, marked) => {
    if (n == null || typeof n === "boolean") return;
    if (typeof n === "string" || typeof n === "number") {
      if (SAYS_A_TIME.test(String(n))) out.push({ words: String(n), marked });
      return;
    }
    if (Array.isArray(n)) {
      for (const k of n) walk(k, marked);
      return;
    }
    if (notATime(n)) return;
    const under = marked || n.props?.["data-when"] !== undefined;
    walk(n.rendered !== undefined ? n.rendered : n.props?.children, under);
  };
  walk(tree, false);
  return out;
}

/** The times the tree says with no mark over them. */
export const unmarkedTimes = (tree) =>
  timesSaid(tree)
    .filter((t) => !t.marked)
    .map((t) => t.words);
