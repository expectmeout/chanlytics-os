/**
 * What the kit's Panel takes, proved where the compiler reads it (panel.tsx): its three surfaces and three paddings,
 * each left out for its default or chosen as the page runs, and the element it is drawn on, a block, a section of the
 * page or a list or its item, which its ref holds as an HTMLElement. A surface or a padding the map lacks, a tone,
 * another element and a ref that holds no HTML element stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { PanelProps } from "./index";
import { Panel } from "./index";

/** Never called: the compiler reads it, and nothing runs it. */
function _panelTakes(
  div: RefObject<HTMLDivElement | null>,
  list: RefObject<HTMLUListElement | null>,
  glyph: RefObject<SVGSVGElement | null>,
  now: { as: PanelProps["as"]; flag: boolean },
): void {
  type _Its = [
    Holds<Exactly<ComponentProps<typeof Panel>, PanelProps>>,
    Holds<Exactly<PanelProps["variant"], "pane" | "inset" | "pop" | undefined>>,
    Holds<Exactly<PanelProps["size"], "md" | "sm" | "flush" | undefined>>,
    Holds<Exactly<PanelProps["as"], "div" | "section" | "article" | "aside" | "ul" | "ol" | "li" | undefined>>,
  ];
  Panel({ children: "Open today until six." });
  Panel({ variant: "inset", size: "sm", ref: div, children: "Their notes go with them." });
  Panel({ as: "ul", variant: "pop", size: "flush", ref: list, children: "Three services" });
  // Chosen as the page runs: its element, and its padding.
  Panel({ as: now.as, size: now.flag ? "flush" : "md", children: "Hours" });

  // @ts-expect-error its surfaces are a pane, an inset and a pop
  Panel({ variant: "card", children: "Hours" });
  // @ts-expect-error its paddings are md, sm and flush
  Panel({ size: "lg", children: "Hours" });
  // @ts-expect-error it has no tone: what it holds says one
  Panel({ tone: "warn", children: "Hours" });
  // @ts-expect-error it is drawn on a block, a section of the page, or a list or its item: a control is the kit's own
  Panel({ as: "button", children: "Hours" });
  // @ts-expect-error its ref holds an HTML element: an SVG one is the Icon's
  Panel({ ref: glyph, children: "Hours" });
}
