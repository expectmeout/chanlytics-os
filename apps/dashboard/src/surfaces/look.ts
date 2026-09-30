/**
 * The look the document wears, for the few pieces of markup a look draws that another does not (the interface kit's
 * step 5.4: a canvas's title with its standing sentence, a composer's rows as a sentence of tokens). Everything else a
 * look changes is a token, and a page never asks: a rule reads the role.
 *
 * `data-look` is stamped on the document's root by the head's script before first paint, and again by the shell when a
 * member chooses one (LegacyApp `useDocumentStamps`), so the answer follows it. Classic, the look every member sees, is
 * also the answer wherever there is no document to ask (a server render, a test on a stub React), so a piece of markup
 * only Glass draws is never in the tree of a page that has not been told it is Glass.
 */
import { useSyncExternalStore } from "react";

export type Look = "classic" | "glass";

const root = (): HTMLElement | null => (typeof document === "undefined" ? null : document.documentElement);

/** The look now on the document: Glass only when it says so. */
export function currentLook(): Look {
  return root()?.getAttribute("data-look") === "glass" ? "glass" : "classic";
}

function subscribe(onChange: () => void): () => void {
  const el = root();
  if (!el || typeof MutationObserver === "undefined") return () => undefined;
  const watch = new MutationObserver(onChange);
  watch.observe(el, { attributes: true, attributeFilter: ["data-look"] });
  return () => watch.disconnect();
}

/** The look, drawn again when the member changes it. */
export function useLook(): Look {
  return useSyncExternalStore(subscribe, currentLook, () => "classic");
}
