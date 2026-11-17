/**
 * The skeleton a gallery family and a kit component are held equal by (kit-components.test.mjs, and a family's own file
 * beside this one): each element's tag, its classes, the attributes a stylesheet or a screen reader reads, and the
 * elements it holds, in order, spelled one way from the gallery's markup and from what the stub React drew. Moved out
 * of kit-components.test.mjs whole, which had reached the suite's limit for a test file, so a new family's drawing can
 * stand in a file of its own (person-pick.test.mjs). The tests of the skeleton itself stay there.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { fresh } from "../../_stub-react.mjs";

/* ---- the skeleton: each element's tag, its classes, the attributes read, and the elements it holds ---- */

/**
 * The attributes a stylesheet or a screen reader reads, which the skeleton holds, each spelled one way whichever side
 * wrote it: for those in PRESENT, that the element has it; for the others, its value; a style as its declarations,
 * each property with its value, in order of property. The rest (a picture's address, a tip's words, a test id) are
 * words, which the skeleton leaves to each component's own test.
 */
const READ = ["type", "disabled", "hidden", "href", "role", "aria-hidden", "aria-label", "aria-disabled", "data-gated"];
const PRESENT = new Set(["disabled", "hidden", "href", "aria-label", "data-gated"]);
const VALUED = [...READ, "alt"];

/** A style's declarations, spelled `property:value` and sorted: from a style attribute's text. */
const declarationsOfText = (text) =>
  text
    .split(";")
    .map((d) => d.split(/:(.*)/s).map((part) => part?.trim() ?? ""))
    .filter(([property, value]) => property && value)
    .map(([property, value]) => `${property.toLowerCase()}:${value}`)
    .sort();

/** The properties React writes a number into as it is; any other number takes px, as React writes it. */
const UNITLESS = new Set([
  "flex",
  "flex-grow",
  "flex-shrink",
  "opacity",
  "order",
  "z-index",
  "font-weight",
  "line-height",
]);
/** A style's declarations, spelled as above: from a style prop, as React writes it into the attribute. */
const declarationsOfProp = (style) =>
  Object.entries(style ?? {})
    .filter(([, value]) => value !== undefined && value !== null && value !== false && value !== "")
    .map(([key, value]) => {
      const property = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      return `${property}:${typeof value === "number" && !UNITLESS.has(property) ? `${value}px` : value}`;
    })
    .sort();

/** The attributes read, spelled: `has(name)` says whether the element carries it, `value(name)` its value. */
function spelledAttributes(has, value, declarations) {
  const out = [];
  for (const name of VALUED) {
    if (!has(name)) continue;
    out.push(PRESENT.has(name) ? name : `${name}=${value(name)}`);
  }
  if (declarations.length > 0) out.push(`style=${declarations.join(";")}`);
  return out.sort();
}

/** A class attribute's names, as a set: their order draws nothing. */
const classSet = (value) =>
  [
    ...new Set(
      String(value ?? "")
        .split(/\s+/)
        .filter(Boolean),
    ),
  ].sort();

/**
 * The elements a component draws, of a list of elements: the gallery's own layout (an element whose classes are all
 * gx-*) gives way to what it holds, and a glyph (an <svg>, the Icon's) is drawn without its attributes and its paths,
 * which are the Icon's and not the kit's.
 */
export const settle = (nodes) =>
  nodes.flatMap((n) =>
    n.classes.length > 0 && n.classes.every((c) => c.startsWith("gx-"))
      ? settle(n.children)
      : [n.tag === "svg" ? { ...n, attributes: [], children: [] } : { ...n, children: settle(n.children) }],
  );

/** Elements that hold nothing, and so close themselves. */
const VOID = new Set(["img", "input", "br", "hr", "wbr", "source"]);
/** A tag, opening or closing, with its attributes: each a name alone, or a name and a value in double quotes. */
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'=<>/]+(?:="[^"]*")?)*)\s*(\/?)>/g;
/** One attribute of a tag: its name, and its value, which a name alone does not have. */
const ATTRIBUTE = /\s([^\s"'=<>/]+)(?:="([^"]*)")?/g;

/** The skeleton of an entry's markup, which the gallery writes whole: every element it opens, it closes. */
export function markupSkeleton(html) {
  const top = { tag: "#top", classes: [], attributes: [], children: [] };
  const open = [top];
  for (const [, closing, name, source, closed] of html.matchAll(TAG)) {
    const tag = name.toLowerCase();
    if (closing) {
      if (open.at(-1).tag !== tag) throw new Error(`</${tag}> closes <${open.at(-1).tag}>`);
      open.pop();
      continue;
    }
    const attributes = new Map([...source.matchAll(ATTRIBUTE)].map(([, n, v]) => [n.toLowerCase(), v ?? ""]));
    const node = {
      tag,
      classes: classSet(attributes.get("class")),
      attributes: spelledAttributes(
        (n) => attributes.has(n),
        (n) => attributes.get(n),
        declarationsOfText(attributes.get("style") ?? ""),
      ),
      children: [],
    };
    open.at(-1).children.push(node);
    if (!closed && !VOID.has(tag)) open.push(node);
  }
  if (open.length > 1) throw new Error(`<${open.at(-1).tag}> is never closed`);
  return settle(top.children);
}

/** Whether React writes a prop as an attribute: a boolean one only when true, any other when it has a value. */
const written = (props, name) => {
  const v = props[name];
  if (v === undefined || v === null) return false;
  return !["disabled", "hidden"].includes(name) || v === true;
};

/** The skeleton of what the stub drew: a component is what it rendered, and a fragment what it holds. */
export function drawnSkeleton(node) {
  if (Array.isArray(node)) return node.flatMap(drawnSkeleton);
  if (node === null || typeof node !== "object") return [];
  if (typeof node.type === "function") return drawnSkeleton(node.rendered);
  if (node.type === "Fragment") return drawnSkeleton(node.props.children);
  const props = node.props;
  return [
    {
      tag: node.type,
      classes: classSet(props.className),
      attributes: spelledAttributes(
        (n) => written(props, n),
        (n) => String(props[n]),
        declarationsOfProp(props.style),
      ),
      children: drawnSkeleton(props.children),
    },
  ];
}

/** A skeleton in words, for a failure to show: `div.list-row(span.face.list-row-face[aria-hidden=true] …)`. */
export const spell = (nodes) =>
  nodes
    .map(
      (n) =>
        `${n.tag}${n.classes.map((c) => `.${c}`).join("")}` +
        `${n.attributes.length > 0 ? `[${n.attributes.join(" ")}]` : ""}` +
        `${n.children.length > 0 ? `(${spell(n.children)})` : ""}`,
    )
    .join(" ");

/**
 * Where a family of the gallery and a component's drawings part: an entry of the family that nothing draws, a drawing
 * of an entry the family lacks, and an entry drawn otherwise, with both skeletons. `drawings` maps each kit entry's id
 * to a function that draws it, so each is drawn afresh; a source entry is a page's, which no component draws.
 */
export function parting(families, family, drawings) {
  const entries = (families.find((f) => f.family === family)?.entries ?? []).filter((e) => !e.source);
  const ids = entries.map((e) => e.id);
  const apart = [];
  for (const entry of entries.filter((e) => Object.hasOwn(drawings, e.id))) {
    fresh();
    const gallery = spell(markupSkeleton(entry.html));
    const drawn = spell(settle(drawnSkeleton(drawings[entry.id]())));
    if (gallery !== drawn) apart.push(`${entry.id}: the gallery draws ${gallery}, the component ${drawn}`);
  }
  return {
    undrawn: ids.filter((id) => !Object.hasOwn(drawings, id)),
    unknown: Object.keys(drawings).filter((id) => !ids.includes(id)),
    apart,
  };
}
export const HELD = { undrawn: [], unknown: [], apart: [] };

/** The element a component drew, as the stub holds it: its tag, and its props. */
export function drawn(element) {
  fresh();
  let node = element;
  while (typeof node.type === "function") node = node.rendered;
  return node;
}
/**
 * The props an element was given, which React writes as its attributes or keeps for itself (a key, a ref): all but its
 * children, which the stub gives every element.
 */
export const keysOf = (node) =>
  Object.keys(node.props)
    .filter((k) => k !== "children")
    .sort();
