/**
 * What the Inbox and Conversations still ask of the shell (decision 0015, step 3).
 *
 * A TSX surface reads nothing off `window`, so each thing a page of the shell owns that these two draw reaches them
 * through one function here, which calls the window's own where it is and does what the page did where it is not
 * (the standalone harness, a test's stand-in window). Each is a line to delete on the day its owner moves: the role
 * gate with the role store, the toast, the swipe and the door with the frame, the deal and step sheets with People, the
 * presence model with Settings, the seeded stores with the demo surfaces. Nothing here is new behaviour.
 *
 * Reads are made when the page asks, never when this loads: a stand-in window a test builds later is the one read.
 */
import type { HTMLAttributes } from "react";
import {
  canDo,
  keyPress as framePress,
  navigate,
  openDealSheet as askDealSheet,
  refusalToast as frameRefusal,
  routeDoor as frameDoor,
  touchSwipe as frameSwipe,
} from "../frame-verbs";
import type { Flash } from "../shell-doors";
import { CHANLY } from "../frame/constants";
import { presence } from "./store";
import { provided } from "@/bridge/provided";
import type { TabMemory } from "@/bridge/tab-memory";

/* The role gate and the toast are the doors every surface shares (shell-doors.ts). */
export { canDo, navigate };
export { gate, useToast } from "../shell-doors";
export type { Flash } from "../shell-doors";

/* ------------------------------- the address ------------------------------- */

/** Move to a route, replacing the entry where the page says where it stands (frame-doors.ts `navigate`). */
export function appNavigate(route: string, opts?: { replace?: boolean }): void {
  navigate(route, opts);
}

/** Whether the frame's move is there at all: the frame's doors are filled as it draws. */
export function canNavigate(): boolean {
  return true;
}

/** The route on screen, as the frame's address says it (frame/constants.ts `CHANLY.address`). */
export function currentRoute(): string {
  return CHANLY.address.route();
}

/**
 * A door as a link (frame-doors.ts `routeDoor`): its address in the href, the app's own way there on a plain press. Nothing
 * where the shell has none, and the caller then draws no link.
 */
export function routeDoor(to: string, go?: ((to: string) => void) | null): HTMLAttributes<HTMLAnchorElement> | null {
  return frameDoor(to, go);
}

/** Whether the shell can make a door at all: it always can. */
export function hasRouteDoor(): boolean {
  return true;
}

/** A key handler that runs `run` on Enter and Space (kit/focus/keys.ts `keyPress`). */
export function keyPress(run: () => void): HTMLAttributes<HTMLElement>["onKeyDown"] {
  return framePress(run);
}

/** A thumb carries a pane away (kit/motion/swipe.ts `touchSwipe`): the props to spread on it, none without the shell. */
export function touchSwipe(opts: {
  onBack: () => void;
  when: () => boolean;
  onGrab: (el: Element | null, on: boolean) => void;
  under?: () => readonly HTMLElement[];
  along?: () => readonly HTMLElement[];
  backNavigates?: boolean;
}): HTMLAttributes<HTMLDivElement> | null {
  return frameSwipe(opts);
}

/** A refusal as a toast (frame/refusal.tsx `refusalToast`). */
export function refusalToast(r: Parameters<typeof frameRefusal>[0], what?: string | null): Flash {
  return frameRefusal(r, what);
}

/* ---------------------------- what the tab remembers ---------------------------- */

/** The tab's memory (tab-memory.ts, provided as `tabMemory`), or nothing where the shell has none: the standalone harness. */
export function tabMemory(): TabMemory | undefined {
  return provided("tabMemory");
}

/* -------------------------------- the session -------------------------------- */

/** What the registry says of a surface: real, demo, seeded (provided as `surfaceState`); nothing without it. */
export function surfaceState(page: string): string | undefined {
  return provided("surfaceState")?.(page);
}

/** Whether the member is Away, which freezes every countdown and forces the holding line (inbox/store.ts `presence`). */
export function presenceAway(): boolean {
  return presence.away;
}

/** The business's zone, as the page clock holds it. */
export function clockZone(): string {
  return provided("clock")?.zone() ?? "UTC";
}

/* --------------------------------- people --------------------------------- */

/** A person's own sheet: the one deal sheet, asked for by the person and the move (People's, frame-verbs `openDealSheet`). */
export function ixOpenDealSheet(ask: { personId: string; mode: string; dealId?: string | null }): void {
  askDealSheet(ask);
}

/** Whether the shell has the deal sheet at all: People's courier hands it over at boot. */
export function hasDealSheet(): boolean {
  return !!provided("sheets");
}

/* ----------------------------------- Ask ----------------------------------- */

/* What Ask is told is on screen is one ledger with one writer (bridge/ask/on-screen.ts), as every page says it. */
export { askAbout, askOnScreenKey, setAskOnScreen } from "../frame-verbs";

/* ----------------------------- the mockup's seeds ----------------------------- */

/** A seeded lead the verdict flow moves: its stage is what the flow changes. */
export interface SeededLead {
  id: string;
  stage: string;
}

/** The demo's leads, whose stage a verdict changes: none, since the mockup's seeds went with demo mode (16 Nov 2026). */
export function seededLeads(): SeededLead[] {
  return [];
}

/** A deal on the demo's board. */
interface SeededDeal {
  id: string;
  stage: string;
  who: string;
  initials: string;
  clientId: string | null;
  label: string;
  value: number;
  inStage: string;
  agent: { glyph: string; name: string };
  next: string;
  threadId: string;
  source: string;
}

/** The demo's deals, which a verdict may add one to: none, since the mockup's board went with demo mode. */
export function seededDeals(): SeededDeal[] | null {
  return null;
}
