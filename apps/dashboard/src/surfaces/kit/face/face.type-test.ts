/**
 * What the kit's Face takes, proved where the compiler reads it (face.tsx): who it stands for, their initials or a
 * glyph, one or the other, written so or chosen as the page runs, and a picture over them or none. A face of nobody,
 * of both, with words of its own, one a screen reader is told of, and a size the kit does not draw stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, ReactElement, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { FaceProps } from "../index";
import { Face } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _faceTakes(
  glyph: ReactElement,
  span: RefObject<HTMLSpanElement | null>,
  now: { glyph: ReactElement | undefined; photo: string | undefined },
): void {
  type _Its = [
    Holds<Exactly<ComponentProps<typeof Face>, FaceProps>>,
    // A glyph is an element (the Icon), never words or nothing; a picture is its address.
    Holds<Exactly<FaceProps["glyph"], ReactElement | undefined>>,
    Holds<Exactly<FaceProps["photo"], string | undefined>>,
  ];
  Face({ initials: "AR" });
  Face({ initials: "AR", photo: "https://example.com/aisha.jpg", ref: span, className: "pl-face" });
  Face({ glyph });
  Face({ glyph, photo: "https://example.com/logo.png" });
  // Chosen as the page runs, as People's row chooses it: a glyph for a number, else the initials, and a picture or not.
  Face({ ...(now.glyph ? { glyph: now.glyph } : { initials: "AR" }), photo: now.photo });

  // @ts-expect-error a face stands for someone: their initials, or a glyph
  Face({ photo: "https://example.com/aisha.jpg" });
  // @ts-expect-error one or the other: initials under a glyph say neither
  Face({ initials: "AR", glyph });
  // @ts-expect-error its words are the initials: it takes no children
  Face({ initials: "AR", children: "Aisha Rahman" });
  // @ts-expect-error it is decoration, always: the name beside it says who
  Face({ initials: "AR", "aria-hidden": false });
  // @ts-expect-error the kit draws the row's one size: another comes with its first reader
  Face({ initials: "AR", size: "lg" });
}
