/**
 * What the kit's toast takes, proved where the compiler reads it (toast.tsx): `useToast` takes the glyphs a toast
 * draws, one for each of the house's four tones and its ×, and answers the stack to draw and the flash that raises a
 * toast; a flash takes its words, its tone, an Undo or one act, how long it stays and a name. A glyph missing for a
 * tone, a tone the house does not have, a toast with no words and an act with no words stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls. The hook is not called here, where no component
 * is: its flash is taken as it answers it.
 */
import type { ReactElement, ReactNode } from "react";
import type { Exactly, Holds, ToastTone } from "@chanlytics/contracts";
import type { ToastFlash, ToastGlyphs } from "../index";
import type { useToast } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _toastTakes(glyph: ReactElement, flash: ReturnType<typeof useToast>[1], window: { ms: number }): void {
  type _Its = [
    Holds<Exactly<Parameters<typeof useToast>, [glyphs: ToastGlyphs]>>,
    Holds<Exactly<ReturnType<typeof useToast>, [ReactNode, (flash: ToastFlash) => void]>>,
    Holds<Exactly<ToastFlash["tone"], ToastTone | undefined>>,
    Holds<Exactly<keyof ToastGlyphs, ToastTone | "dismiss">>,
  ];
  const _every: ToastGlyphs = { ok: glyph, info: glyph, warn: glyph, danger: glyph, dismiss: glyph };
  flash({ msg: "Saved." });
  flash({ msg: "Not sent.", tone: "danger", action: { label: "Try again", onPress: () => undefined }, once: "send" });
  // An Undo as long as the window the page knows.
  flash({ msg: "Taken off Regulars.", undo: () => undefined, ms: window.ms });

  // @ts-expect-error a glyph for each of the four tones, and the ×
  const _short: ToastGlyphs = { ok: glyph, info: glyph, warn: glyph, dismiss: glyph };
  // @ts-expect-error its tones are the house's four
  flash({ msg: "Saved.", tone: "accent" });
  // @ts-expect-error a toast says something
  flash({ tone: "ok" });
  // @ts-expect-error an act says what it does
  flash({ msg: "Not sent.", action: { onPress: () => undefined } });
}
