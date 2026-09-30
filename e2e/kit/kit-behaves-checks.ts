/**
 * What e2e/kit/kit-behaves.spec.ts asks of the page, as it runs there: each is one function, whole, because
 * page.evaluate sends a function's source and nothing it closes over.
 *
 *   kitSkeleton   the kit's markup of a gallery entry (its static HTML, kit-gallery.mjs) or of the running page's
 *                 entry (kit-behaves.tsx) with what Base UI portaled to the body for it, spelled one way for both: each
 *                 element's tag, its classes and the attributes a stylesheet or a screen reader reads (MARKUP_READ), and the
 *                 elements it holds, in order. An element with no class, or with the gallery's own (gx-*), gives way to
 *                 what it holds: Base UI's own parts that the kit does not style (its focus guards, the hidden input
 *                 beside a switch or a radio, a portal, the backdrop inside a modal that takes the outside's presses) and
 *                 a page's wrapper. A glyph (an <svg class="icon">) is the Icon's, drawn without its attributes or paths.
 *                 The words are not read, nor the ids that wire a label or a description to its control (the spec
 *                 checks the wiring itself), nor a style, which Base UI writes as it places a popup.
 *   trappedUnder  of the element that roots a popup (a positioner, a sheet, the toasts' region): each of its ancestors
 *                 that would hold it in place of the window, as a containing block for what is fixed or absolute (a
 *                 transform, a filter, a backdrop filter, a perspective, a contain or a will-change that makes one), and
 *                 whether the body holds its portal.
 */

/**
 * The static HTML of a gallery entry; or the running page's entry (if any) and the portals Base UI drew for it. With the
 * attributes read (tooling/scripts/e2e-harness/kit-shared.mjs, MARKUP_READ), those read as there or not among them.
 */
export type SkeletonAsk = ({ html: string } | { entry?: string; portals: string[] }) & {
  read: string[];
  present: string[];
};

export function kitSkeleton(ask: SkeletonAsk): string {
  type Node = { tag: string; classes: string[]; attributes: string[]; children: Node[] };
  const READ = ask.read;
  const PRESENT = new Set(ask.present);

  const roots: ChildNode[] = [];
  if ("html" in ask) {
    const template = document.createElement("template");
    template.innerHTML = ask.html;
    roots.push(...Array.from(template.content.childNodes));
  } else {
    if (ask.entry !== undefined) {
      const stage = document.querySelector(`[data-entry="${ask.entry}"] .gx-stage`);
      if (!stage) return `no entry ${ask.entry} on the page`;
      roots.push(...Array.from(stage.childNodes));
    }
    for (const id of ask.portals) {
      const portal = document.getElementById(id);
      if (portal) roots.push(...Array.from(portal.childNodes));
    }
  }

  const skeleton = (nodes: ChildNode[]): Node[] =>
    nodes.flatMap((n) => {
      if (!(n instanceof Element)) return [];
      const classes = [...new Set(Array.from(n.classList))].sort();
      if (classes.length === 0 || classes.every((c) => c.startsWith("gx-"))) return skeleton(Array.from(n.childNodes));
      const tag = n.tagName.toLowerCase();
      if (tag === "svg") return [{ tag, classes, attributes: [], children: [] }];
      const attributes = READ.filter((a) => n.hasAttribute(a))
        .map((a) => (PRESENT.has(a) ? a : `${a}=${n.getAttribute(a)}`))
        .sort();
      return [{ tag, classes, attributes, children: skeleton(Array.from(n.childNodes)) }];
    });

  const spell = (nodes: Node[]): string =>
    nodes
      .map(
        (n) =>
          `${n.tag}${n.classes.map((c) => `.${c}`).join("")}` +
          `${n.attributes.length > 0 ? `[${n.attributes.join(" ")}]` : ""}` +
          `${n.children.length > 0 ? `(${spell(n.children)})` : ""}`,
      )
      .join(" ");

  return spell(skeleton(roots));
}

type TrapAnswer = { found: boolean; underBody: boolean; holders: string[] };

export function trappedUnder(selector: string): TrapAnswer {
  const el = document.querySelector(selector);
  if (!el) return { found: false, underBody: false, holders: [] };
  // A popup opened from inside another (a menu in a sheet) is portaled into that one's portal: the outermost holds it.
  let portal = el.closest("[data-base-ui-portal]");
  while (portal?.parentElement?.closest("[data-base-ui-portal]"))
    portal = portal.parentElement.closest("[data-base-ui-portal]");
  const holders: string[] = [];
  const makesABlock = (cs: CSSStyleDeclaration) =>
    [
      cs.transform !== "none" && `transform ${cs.transform}`,
      cs.filter !== "none" && `filter ${cs.filter}`,
      cs.backdropFilter !== "none" && `backdrop-filter ${cs.backdropFilter}`,
      cs.perspective !== "none" && `perspective ${cs.perspective}`,
      /paint|layout|strict|content/.test(cs.contain) && `contain ${cs.contain}`,
      /transform|filter|perspective/.test(cs.willChange) && `will-change ${cs.willChange}`,
    ].filter((why): why is string => typeof why === "string");
  for (let at = el.parentElement; at && at !== document.documentElement; at = at.parentElement) {
    const whys = makesABlock(getComputedStyle(at));
    if (whys.length > 0)
      holders.push(
        `${at.tagName.toLowerCase()}${at.className ? `.${String(at.className).split(/\s+/).join(".")}` : ""}: ${whys.join(", ")}`,
      );
  }
  return { found: true, underBody: !!portal && portal.parentElement === document.body, holders };
}
