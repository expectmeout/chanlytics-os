/**
 * The look this page is drawn in, for the few things a look draws that its stylesheet cannot: markup that exists in one
 * look and not in the other (the plan's step 5.4: a canvas's title with its standing sentence). Where a look changes
 * only how a thing looks, that is a `[data-look]` rule and no code; where it adds a thing, the thing is drawn by
 * `<Glass>` and is not in the page at all in Classic (never drawn and hidden: the recorder that holds Classic to what
 * it drew, by value and by computed style, sees nothing new).
 *
 * The look is on the document as `data-look` (legacy-bridge/LegacyApp.tsx stamps it, and again when a member chooses
 * another). A page draws Classic until it has read it, so a server's HTML and a first client draw agree.
 */
import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";

type Look = "classic" | "glass";

function watch(onChange: () => void): () => void {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") return () => undefined;
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-look"] });
  return () => observer.disconnect();
}

const lookNow = (): Look =>
  typeof document !== "undefined" && document.documentElement.getAttribute("data-look") === "glass"
    ? "glass"
    : "classic";

const lookOnAServer = (): Look => "classic";

/** The look on the document now, drawn again when it changes. */
export function useLook(): Look {
  return useSyncExternalStore(watch, lookNow, lookOnAServer);
}

/** What only Glass draws: its children in Glass, and nothing in Classic. */
export function Glass({ children }: { children: ReactNode }): ReactNode {
  return useLook() === "glass" ? children : null;
}
