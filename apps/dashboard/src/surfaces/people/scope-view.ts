/**
 * What a scope of People is to the deck (the strips review, 18 Oct 2026). The page keeps People, Leads and the Pipeline
 * mounted and shows the one asked for (people-route.tsx); each scope's root is a view of the deck (kit/motion/view-deck.ts),
 * so the scope arriving comes in from its tab's side and the one leaving goes by a copy of itself, as the frame's pages do.
 * The page hands it to each scope as `scopeView`, and each scope's component puts it on the root it draws: People's list
 * (page/people-real.tsx, `asScopeView`), Leads' (leads/scope/scope.tsx) and the Pipeline's (pipeline/scope.tsx).
 */
import { cloneElement, type ReactElement } from "react";

export interface ScopeView {
  /** The deck's seat for People's scopes: the root as React shows it, and null as it hides it. */
  ref?: (el: HTMLElement | null) => void;
  /** The side the scope comes in from, on the draw it is shown after another. */
  slide?: "next" | "prev";
}

/** A scope's root with the deck's seat and its side on it; as it was where no page hands it one. */
export function asScopeView(root: ReactElement, view: ScopeView | undefined): ReactElement {
  return view?.ref ? cloneElement(root, { ref: view.ref, "data-slide": view.slide } as Record<string, unknown>) : root;
}
