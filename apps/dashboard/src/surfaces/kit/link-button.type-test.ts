/**
 * What the kit's LinkButton takes, proved where the compiler reads it (link-button.tsx): its one tone, and a button's
 * attributes and ref. A kind or a size of a button's, another tone, and an address stop compiling: words that open a
 * page wait for a link's look, in kit.css with its gallery entry.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, ReactElement, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import { LinkButton } from "./index";

type Takes = ComponentProps<typeof LinkButton>;

/** Never called: the compiler reads it, and nothing runs it. */
function _linkButtonTakes(glyph: ReactElement, button: RefObject<HTMLButtonElement | null>): void {
  type _Its = [Holds<Exactly<Takes["tone"], "danger" | undefined>>];
  LinkButton({ children: ["Write one", glyph] });
  LinkButton({ tone: "danger", children: "Delete the list" });
  LinkButton({ type: "submit", ref: button, onClick: () => undefined, children: "Send" });

  // @ts-expect-error danger is its one tone
  LinkButton({ tone: "warn", children: "Delete the list" });
  // @ts-expect-error it is one look: a kind of its own is a Button's
  LinkButton({ variant: "primary", children: "Save" });
  // @ts-expect-error it is the line's size, and has no other
  LinkButton({ size: "sm", children: "Save" });
  // @ts-expect-error words that open a page wait for a link's look, in kit.css with its gallery entry
  LinkButton({ href: "/w/studio/#/clients", children: "Open People" });
}
