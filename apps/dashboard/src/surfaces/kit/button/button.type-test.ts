/**
 * What the kit's Button takes, proved where the compiler reads it (button.tsx). Its kinds, sizes and tone are its
 * class map's, each left out for its default or chosen as the page runs, and what would draw a wrong button stops
 * compiling: a kind, size or tone the map lacks, red words on a filled button, a glyph alone with no name, a door that
 * is disabled, a button's ref on a link or a link's on a button, and an address that may be missing, which leaves the
 * element unchosen.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, ReactElement, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { ButtonProps } from "../index";
import { Button } from "../index";

/** What a page knows only as it runs. */
type AsItRuns = { flag: boolean; kind: ButtonProps["variant"]; href: string | undefined };

/** Never called: the compiler reads it, and nothing runs it. */
function _buttonTakes(
  glyph: ReactElement,
  button: RefObject<HTMLButtonElement | null>,
  link: RefObject<HTMLAnchorElement | null>,
  now: AsItRuns,
): void {
  type _Its = [
    // Its props are the type the kit names for them, and its kinds, sizes and tone its map's, each optional.
    Holds<Exactly<ComponentProps<typeof Button>, ButtonProps>>,
    Holds<
      Exactly<ButtonProps["variant"], "primary" | "secondary" | "quiet" | "plain" | "danger" | "glass" | undefined>
    >,
    Holds<Exactly<ButtonProps["size"], "sm" | "md" | "lg" | "text" | "touch" | undefined>>,
    Holds<Exactly<ButtonProps["tone"], "danger" | undefined>>,
  ];
  Button({ children: "Export" });
  Button({ variant: "primary", size: "sm", children: [glyph, "Save"] });
  Button({ variant: "quiet", size: "sm", tone: "danger", children: "Delete" });
  Button({ tone: "danger", children: "Stop" });
  Button({ iconOnly: true, "aria-label": "More", children: glyph });
  Button({ iconOnly: true, size: "touch", variant: "glass", "aria-label": "Call", children: glyph });
  Button({ type: "submit", ref: button, onClick: () => undefined, children: "Save" });
  // A door: a link, with a link's ref, in any kind and either form.
  Button({ href: "/w/studio/#/clients", ref: link, children: "Open People" });
  Button({ href: "/w/studio/#/clients", iconOnly: true, "aria-label": "Open People", children: glyph });
  // Chosen as the page runs: Confirm's Yes is danger or the default, a step's next act primary or secondary, a kind
  // handed down, and a glyph alone at some widths only, named at every one.
  Button({ size: "sm", variant: now.flag ? "danger" : undefined, disabled: !now.flag, children: "Yes" });
  Button({ size: "sm", variant: now.flag ? "primary" : "secondary", children: "Next" });
  Button({ variant: now.kind, children: "Save" });
  Button({ iconOnly: now.flag, "aria-label": "More", variant: "quiet", size: "sm", children: glyph });

  // @ts-expect-error a kind the map lacks draws no class
  Button({ variant: "loud", children: "Save" });
  // The large one is Glass's, a page's head act (a person's thread and More).
  Button({ size: "lg", variant: "primary", children: "Open the thread" });
  // Drawn as text: an area of a page's words that is one press (a moment's card on Campaigns' rail).
  Button({ size: "text", variant: "quiet", "aria-pressed": now.flag, children: [glyph, "Visit reminder"] });
  // @ts-expect-error drawn as text is the quiet kind's alone: a primary as text would take a text's weight, and no page wants one
  Button({ size: "text", variant: "primary", children: "Visit reminder" });
  // @ts-expect-error drawn as text names its kind, the quiet one: the default kind, secondary, is a control's
  Button({ size: "text", children: "Visit reminder" });
  // @ts-expect-error the size of its words is said as text: `fit` is no size the kit names
  Button({ size: "fit", children: "Visit reminder" });
  // @ts-expect-error the kit draws the sizes it names: another comes with its first reader
  Button({ size: "xl", children: "Save" });
  // @ts-expect-error danger is the words' one tone
  Button({ tone: "warn", children: "Save" });
  // @ts-expect-error red words on a filled button: the act that destroys is the danger kind, and primary keeps its ink
  Button({ variant: "primary", tone: "danger", children: "Delete" });
  // @ts-expect-error a glyph alone says nothing, so it takes its name
  Button({ iconOnly: true, children: glyph });
  // @ts-expect-error a glyph alone at some widths only still says its name at every one
  Button({ iconOnly: now.flag, children: glyph });
  // @ts-expect-error a door is never disabled: a link that goes nowhere is no door
  Button({ href: "/w/studio/#/clients", disabled: true, children: "Open People" });
  // @ts-expect-error a button's ref holds a button: a link's comes with its address
  Button({ ref: link, children: "Save" });
  // @ts-expect-error a door's ref holds a link
  Button({ href: "/w/studio/#/clients", ref: button, children: "Open People" });
  // @ts-expect-error an address known only as it runs: a glyph alone needs its name, so the element is not chosen
  Button({ href: now.href, children: "Open People" });
}
