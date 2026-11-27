/**
 * What a surface asks of the frame around it (decision 0015).
 *
 * What the frame's parts are, a surface imports from here: the frame's own (the role gate, the toast, a thumb's gestures,
 * a link to a route) by their modules, and what the bridge installs (the role store, the charter, the address, a sheet of
 * People's) from the bridge's store (bridge/provided.ts), where a test hands in its stand-in. Nothing is read off the
 * window (decision 0151). The doors to a route and to Ask (`navigate`, `askAbout`, `openAsk`) are the bridge's own
 * (surfaces/frame-doors.ts), named here for the surfaces that import them from this file.
 */
import type { MouseEvent, ReactNode, KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import type { AskApi } from "../bridge/ask";
import { askAbout, backFrom, navigate, openAsk, tellAskHeld } from "./frame-doors";
import { canDo } from "./frame/gate";
import { CHANLY } from "./frame/constants";
import { provided } from "@/bridge/provided";
import { whoIsLooking, type Me } from "@/bridge/who";
import type { Params, RouteKey } from "@/client/api";

/** What a toast says, as the shell's one flash takes it (frame/flash.tsx `usePPToast`). */
export interface FrameFlash {
  tone?: string;
  msg: ReactNode;
  /** One act beside the words (an Undo that is not the toast's own, a way on): pressing it closes the toast. */
  action?: { label: string; onClick: () => unknown } | null;
  /** Doors to a route, each a button that closes the toast and goes there. */
  links?: { label: string; to: string }[];
  undo?: (() => unknown) | null;
  ms?: number;
  /** A send's cancel window: a tap besides does not take it (contracts `toastShape`). */
  stays?: boolean;
  icon?: string;
  once?: string;
}

/*
 * Go to a route, open Ask, open Ask about something: the doors every page uses are the bridge's (bridge/workspace.ts), which
 * the frame fills as it renders. They are named here too, with the verbs a surface already imports from this file.
 */
export { askAbout, backFrom, navigate, openAsk };

/*
 * The frame's own parts a surface's controls take: the role gate (frame/gate.ts), a thumb's gestures and a change that
 * holds the control still (kit/motion), an overlay played out as it goes, Enter and Space as a press (kit/focus), a link
 * to a route (frame-doors.ts) and the toast a refusal raises (frame/flash.tsx). Imported, as every page loads them.
 */
export { canDo, gate, gatedProps, gateTitle, mayAtLeast } from "./frame/gate";
export { touchSwipe } from "./kit/motion/swipe";
export { holdStill } from "./kit/motion/hold-still";
export { leaving } from "./kit/motion/leaving";
export { keyPress } from "./kit/focus/keys";
export { routeDoor } from "./frame-doors";
export { refusalToast } from "./frame/refusal";

/** The role the member is acting as, View-as included (the role store's `myRole`); a role nobody can read is a viewer's. */
export function actingRole(): string {
  const store = provided("roles");
  return store && store.myRole ? store.myRole() : "viewer";
}

/** The lower role an owner is previewing (the role store's View-as), or null to act as who they are. */
export function viewAsRole(): string | null {
  return provided("roles")?.viewAsRole || null;
}

/** Hear the role store change (View-as, the mockup's roster): what a page that draws by the acting role redraws on. */
export function onRolesChanged(fn: () => void): () => void {
  window.addEventListener("team:changed", fn);
  return () => window.removeEventListener("team:changed", fn);
}

/** Sign out of every session (the shell's `signOut`, provided.ts); false where there is no frame to do it. */
export function shellSignOut(): boolean {
  const shell = provided("shell");
  if (!shell || !shell.signOut) return false;
  shell.signOut();
  return true;
}

/**
 * Whether a pointer that reaches a row or a door warms what it opens: a mouse or a pen resting on it, never a finger. A touch
 * starts a scroll, or a swipe across a strip, far more often than a tap, and each warm read a person or a view whole on the
 * way (18 Oct 2026: a swipe from People to Leads read the person under the thumb, 110 KB). A tap opens it and reads it then.
 */
export const warmsOnReach = (e: { pointerType?: string } | null | undefined): boolean =>
  !e || e.pointerType !== "touch";

/**
 * A change drawn at once (React's flushSync), so what follows it in the same press finds the page as it now stands: the
 * folded reply box opened before its field takes the caret.
 */
export function drawnNow(change: () => void): void {
  flushSync(change);
}

/**
 * Hear the route on screen move (the bridge's address, the provided `shell`'s `hear`: a page's own move, which no popstate says,
 * and a Back): what a part over the page follows, the lead sheet's `?lead=` among them. Nothing where the frame hears none.
 */
export function hearPageMoves(fn: () => void): () => void {
  const shell = provided("shell");
  return shell?.hear ? shell.hear(fn) : () => undefined;
}

/** Ask's own calls, as installAsk made them (bridge/ask.ts): a turn sent, a card committed, the page as context. */
let askHeld: AskApi | undefined;

/** The calls a page reads by import from here on: the bridge's, or a test's stand-in. */
export function holdAsk(calls: AskApi | undefined): void {
  askHeld = calls;
  tellAskHeld();
}

/** Ask's calls; none before the bridge installs them, and none where there is no bridge. */
export function askCalls(): AskApi | undefined {
  return askHeld;
}

/*
 * The Booking tool's sheet, on the page a door to it was pressed on (settings/booking-tool/, Ruben, 9 October 2026).
 * The door's verb stands here, with the verbs every page already loads, and not beside the sheet: a module of its own
 * imported by pages with chunks of their own (Reports, the first run) made the build hand each a second copy of a
 * chunk the route shares (Reports +9.9 KB gzipped, measured against the budget main banked).
 */
let bookingToolHost: (() => void) | null = null;

/** The frame's host says how the sheet is opened; what it answers takes that back. */
export function hostBookingTool(open: () => void): () => void {
  bookingToolHost = open;
  return () => {
    if (bookingToolHost === open) bookingToolHost = null;
  };
}

/**
 * Open what the business books with, where the person is. At `orAt`, the row's own address in Settings, where there
 * is no host to draw the sheet or the role may not change the business and so only reads the row.
 */
export function openBookingTool(orAt: string): void {
  if (bookingToolHost && canDo("settings")) bookingToolHost();
  else navigate(orAt);
}

/** Read one surface again by its key (a failed read's Retry): the runner's own, which the cache, the status and the pill follow. */
export function refreshSurface(key: string): Promise<void> | undefined {
  return provided("refreshSurface")?.(key);
}

/** Whether a retry can be pressed at all: the runner provided its verb. */
export function canRefreshSurfaces(): boolean {
  return !!provided("refreshSurface");
}

/**
 * The shell's toast (frame/flash.tsx usePPToast, provided as `toast` by the boot): its node, to be drawn by the page, and
 * the flash that raises one. Read from the bridge as it is called, never imported, so a page does not carry the toast's
 * code (and the swipe that takes one away) beside the frame's copy. Nothing where no toast is held (a page drawn alone).
 */
export function useFrameToast(): [ReactNode, (flash: FrameFlash) => void] {
  const toast = provided("toast");
  return toast ? toast() : [null, () => undefined];
}

/* ------------------------------ what the kit's shared components ask of the shell ------------------------------ */

/* ------------------------------ what the kit's shared components ask of the frame ------------------------------ */

/** Whether the bridge can build a link to a route at all (the provided `href`): a page drawn alone cannot. */
export function hasHref(): boolean {
  return !!provided("href");
}

/** A link the browser follows to a route (the provided `href`: a download, a photo), or null where the bridge builds none. */
export function hrefOf<K extends RouteKey>(key: K, params?: Params<K>): string | null {
  const href = provided("href");
  return href ? href(key, params) : null;
}

/** One class of the workspace's policy charter, as the chip names it (the store's `row`). */
interface PolicyRow {
  id: string;
  chip: string;
  locked?: boolean;
}

/** The workspace's policy store (the provided `policy`), on the mockup's own interface: the app answers it from the workspace's rows. */
interface PolicyStore {
  row(id: string): PolicyRow | null;
  modeOf(id: string): string | null;
  WORDS?: Record<string, { chip?: string }>;
}

/** The policy store, or nothing where the shell has none. */
export function policyStore(): PolicyStore | undefined {
  return provided("policy");
}

/** Go to Settings > Autonomy, as the policy chip does. */
export function openAutonomy(): void {
  navigate(CHANLY.R.admin("autonomy"));
}

/**
 * The frame's tip, which a control's mark shows on a press (the provided `tip`, as the attention row's "what else is known"
 * mark does): read when it is asked, and nothing where the shell has no tip.
 */
export function showTip(target: Element | null): void {
  const tip = provided("tip");
  if (tip && target) tip.show(target);
}

/* ------------------------- the shell's helpers a surface's controls take (surfaces/frame) -------------------------- */

/**
 * What a role gate spreads onto a control, AFTER its handlers (frame/gate.ts `gate`): nothing where the role may act; where
 * it may not, the control stays in the tab order, says why on hover, on focus and when pressed, and does nothing.
 */
export type GateProps = {
  disabled?: boolean;
  title?: string;
  "aria-disabled"?: boolean;
  "aria-description"?: string;
  "data-tip"?: string;
  "data-gated"?: string;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  onKeyUp?: undefined;
  onPointerDown?: undefined;
  onPointerUp?: undefined;
  onPointerLeave?: undefined;
  onPointerCancel?: undefined;
};

/** What the deal sheet is asked for, from anywhere (`openDealSheet` below, People's sheet). */
export interface DealSheetAsk {
  personId: string;
  mode: string;
  service?: string;
  dealId?: string | null;
}

/*
 * What the app knows of a finger (Ruben, 8 October 2026: on a phone nothing that opens puts a person in a field by
 * itself, and everything that rises from the bottom edge goes back down by a pull). These are the app's own and no
 * page's. They stand here, with the verbs every page already loads, and not in a file of their own: a small module
 * shared by the frame's kit and by the pages' own sheets made the build regroup its chunks, and People and Templates
 * were handed a second copy of the record kit (13 KB each, measured against main's own build).
 */

/** Whether the window's media answers a query; none does where the window has none (a test's stand-in). */
export function mediaSays(query: string): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(query).matches;
}

/**
 * Whether the pointer a person mostly uses is a finger: the house's one test for a touch screen, the one
 * app/globals.css sizes every field by (`pointer: coarse`). It is not a width: a narrow window on a desk still has its
 * keys, and a tablet held wide still has a keyboard that rises.
 */
function onTouchScreen(): boolean {
  return mediaSays("(pointer: coarse)");
}

/**
 * Whether a text field may take focus as it is drawn. Not on a touch screen: a field that took focus by itself raised
 * the keyboard over a sheet the person had not read yet, and the phone moved the page to it. There a sheet opens with
 * itself in focus (the kit's Sheet, RecordSheet), and a tap on a field begins the typing. A mouse and keys keep the
 * field ready. An editor a press opened in place (a rename, a Change row's field) asks it too, and its box
 * takes the focus there (`editorBox`).
 */
export function focusAsDrawn(): boolean {
  return !onTouchScreen();
}

/** On a touch screen, focus on an editor's own box as it is drawn, unless focus is already inside it. */
function focusBoxOnTouch(el: HTMLElement | null): void {
  if (!el || !onTouchScreen() || el.contains(document.activeElement)) return;
  el.focus({ preventScroll: true });
}

/**
 * What the box of an editor a press opened in place spreads: a rename, a name asked in
 * the row (Ruben, 9 October 2026: these open as a sheet does, with no keyboard until the field is tapped; its field
 * asks `focusAsDrawn`). On a touch screen the box takes focus as it is drawn, since its field does not: the control
 * that was pressed is gone by then, and focus left on the page's body sends the next Tab, and a screen reader, back
 * to the top of the page. Under a mouse the field has focus and this does nothing.
 */
export const editorBox = { tabIndex: -1, ref: focusBoxOnTouch } as const;

/** The kit's one phone width (kit.css, 900px), where its Sheet and its Menu rise from the bottom edge. */
export function onAPhone(): boolean {
  return mediaSays("(max-width: 900px)");
}

/** What a touch handler is handed, as far as keeping it needs to know. */
interface Touched {
  stopPropagation?: () => void;
}

/**
 * A gesture's handlers, keeping each touch to themselves. What is drawn on the document's body is still the child, to
 * React, of whatever drew it, so its touch reaches that one's handlers too: a pull on a menu opened from inside a
 * sheet, a drawer or an open thread was read by the sheet, the drawer or the thread as well.
 */
export function keepTouch<H extends object>(handlers: H): H {
  const kept: Record<string, unknown> = {};
  for (const [name, handle] of Object.entries(handlers)) {
    kept[name] =
      typeof handle === "function"
        ? (e: Touched) => {
            e.stopPropagation?.();
            (handle as (e: Touched) => void)(e);
          }
        : handle;
  }
  return kept as H;
}

/*
 * What Ask is told is on screen (what Ask reads when it opens) is one ledger with one writer and one reader
 * (bridge/ask/on-screen.ts): a page says what it drew as it draws, and takes it back, only if it is its own, as it
 * goes. Named here for the surfaces that import every door from this file.
 */
export { askOnScreenKey, setAskOnScreen } from "../bridge/ask/on-screen";

/** Ask for the one deal sheet (People's, the provided `sheets`); nothing where People's courier is not installed. */
export function openDealSheet(ask: DealSheetAsk): void {
  provided("sheets")?.openDeal(ask);
}

/**
 * Say where the page stands without a new entry in the history (`appNavigate(route, { replace: true })`): the address is
 * replaced by the route, and Back leaves the page rather than replaying every item it opened.
 */
export function replaceRoute(route: string): void {
  navigate(route, { replace: true });
}

/** Who is acting, as the workspace read said (bridge/who.ts); null before it lands. */
export function meNow(): Me | null {
  return whoIsLooking().me;
}

/** Whether the surface a route draws from failed to read (the route gate's, provided.ts): where there is no gate, no. */
export function surfaceFailed(page: string, param?: string | null): boolean {
  return !!provided("surfaceFailed")?.(page, param);
}
