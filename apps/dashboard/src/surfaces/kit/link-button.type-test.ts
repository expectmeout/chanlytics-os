/**
 * What the kit's LinkButton takes, proved where the compiler reads it (link-button.tsx): its one tone, left out or
 * chosen as the page runs, and a button's attributes and ref, or a link's with an address. A kind or a size of a
 * button's, another tone, a door that is disabled and a ref of the other element stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, ReactElement, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { LinkButtonProps } from "./index";
import { LinkButton } from "./index";

/** Never called: the compiler reads it, and nothing runs it. */
function _linkButtonTakes(
  glyph: ReactElement,
  button: RefObject<HTMLButtonElement | null>,
  link: RefObject<HTMLAnchorElement | null>,
  now: { flag: boolean; href: string | undefined },
): void {
  type _Its = [
    Holds<Exactly<ComponentProps<typeof LinkButton>, LinkButtonProps>>,
    Holds<Exactly<LinkButtonProps["tone"], "danger" | undefined>>,
  ];
  LinkButton({ children: ["Write one", glyph] });
  LinkButton({ tone: "danger", children: "Delete the list" });
  LinkButton({ tone: now.flag ? "danger" : undefined, children: "Remove" });
  LinkButton({ type: "submit", ref: button, onClick: () => undefined, children: "Send" });
  // A door: a link, with a link's ref.
  LinkButton({ href: "https://example.com/listing", target: "_blank", rel: "noreferrer", ref: link, children: "Open" });
  // An address known only as the page runs: a link where there is one, a button where not.
  LinkButton({ href: now.href, children: "Open the listing" });

  // @ts-expect-error danger is its one tone
  LinkButton({ tone: "warn", children: "Delete the list" });
  // @ts-expect-error it is one look: a kind of its own is a Button's
  LinkButton({ variant: "primary", children: "Save" });
  // @ts-expect-error it is the line's size, and has no other
  LinkButton({ size: "sm", children: "Save" });
  // @ts-expect-error a door is never disabled: a link that goes nowhere is no door
  LinkButton({ href: "/w/studio/#/clients", disabled: true, children: "Open People" });
  // @ts-expect-error a door's ref holds a link
  LinkButton({ href: "/w/studio/#/clients", ref: button, children: "Open People" });
}
