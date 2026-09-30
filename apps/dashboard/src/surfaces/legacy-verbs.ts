/**
 * The few verbs a surface that has left the shell still asks of a page that has not (decision 0015).
 *
 * A TSX surface reads no `window.*` name, so a verb a legacy page owns reaches it through the bridge: one function
 * here, which calls the window's own where it is, and does what the legacy page did where it is not (the standalone
 * mockup, a test's stand-in window). Each is a line to delete on the day its owner moves: the role gate with the role
 * store (the frame's step), `holdStill` and `askAbout` with the pages that publish them, `listRoute` with People,
 * `refreshSurface` and the toast with the frame, `navigate` with the frame's address. A surface never imports a legacy file, and
 * never reads the window itself; it imports this.
 *
 * Nothing here is new behaviour: each reads what the pages it stands in for read, in the same words.
 */
import type { KeyboardEvent, MouseEvent, ReactNode, RefCallback, TouchEvent } from "react";
import type { SetupSurface } from "../legacy-bridge/setup";
import type { ApiResult } from "../client/api";

/** What a toast says, as the shell's one flash takes it (data-bits `usePPToast`). */
interface LegacyFlash {
  tone?: string;
  msg: ReactNode;
  /** One act beside the words (an Undo that is not the toast's own, a way on): pressing it closes the toast. */
  action?: { label: string; onClick: () => unknown } | null;
  /** Doors to a route, each a button that closes the toast and goes there. */
  links?: { label: string; to: string }[];
  undo?: () => void;
  ms?: number;
  icon?: string;
  once?: string;
}

declare global {
  interface Window {
    CHANLY?: { nav?: (route: string) => void };
    canDo?: (action: string) => boolean;
    holdStill?: (el: Element | null | undefined, change: () => void) => void;
    askAbout?: (about: { prompt?: string; mode?: string; thread?: string }) => void;
    __listRoute?: (id: string) => string;
    __refreshSurface?: (key: string) => Promise<void>;
    usePPToast?: () => [ReactNode, (flash: LegacyFlash) => void];
  }
}

/** Go to a route, the way a legacy page does (`CHANLY.nav`): the frame's own move, which keeps its Back and its address. */
export function navigate(route: string): void {
  window.CHANLY?.nav?.(route);
}

/** Whether the person acting may do what a role gate names (data-bits `canDo`): with no role store, they may. */
export function canDo(action: string): boolean {
  return window.canDo ? window.canDo(action) : false;
}

/** Whether the session declared itself a demo (`window.__DEMO_MODE`, which the seeds set false wherever nothing set it). */
export function demoSession(): boolean {
  return !!window.__DEMO_MODE;
}

/**
 * A change that moves what is drawn beside the control that made it, run so the control stays where it was (data-bits
 * `holdStill`); where the page has no such verb, just the change.
 */
export function holdStill(control: Element | null | undefined, change: () => void): void {
  if (window.holdStill) window.holdStill(control, change);
  else change();
}

/** Open Ask on a question (the Line asks it, or opens on the scope). Nothing where Ask is not drawn. */
export function askAbout(about: { prompt?: string; mode?: string; thread?: string }): void {
  window.askAbout?.(about);
}

/** Where a People list is, by its id: the list picked (People's own rule), or People itself before its lists are read. */
export function listRoute(id: string): string {
  return window.__listRoute ? window.__listRoute(id) : "clients";
}

/** Read one surface again by its key (a failed read's Retry): the runner's own, which the cache, the status and the pill follow. */
export function refreshSurface(key: string): Promise<void> | undefined {
  return window.__refreshSurface?.(key);
}

/** Whether a retry can be pressed at all: the runner published its verb. */
export function canRefreshSurfaces(): boolean {
  return !!window.__refreshSurface;
}

/** The shell's toast: its node, to be drawn by the page, and the flash that raises one. Nothing to draw where the shell has none. */
export function useLegacyToast(): [ReactNode, (flash: LegacyFlash) => void] {
  return window.usePPToast ? window.usePPToast() : [null, () => undefined];
}

/* ------------------------------ what the kit's shared components ask of the shell ------------------------------ */

/*
 * StatePill, Confirm, MoreMenu, PolicyChip and TlMedia moved from data-bits.jsx into the kit (decision 0015, "what is
 * shared moves once"): the pages that have not moved still draw them by name off `window`, and a surface that has moved
 * imports them, so there is one component. What each still asks of the shell goes through the accessors below, which
 * read the window when they are asked (never when this loads) and do what the JSX did where the shell has none. Each is
 * a line to delete with its owner: the honesty gate with the role store, the charter and the trust digest with the
 * policy store and the Reports data, the media link with the frame's client, the route with the frame.
 */

/** A name off the window, whatever it holds. */
const shellNamed = (name: string): unknown => Reflect.get(window, name);

/** A function the shell published, or nothing where it has not. */
function shellFn<A extends unknown[], R>(name: string): ((...args: A) => R) | undefined {
  const v = shellNamed(name);
  return typeof v === "function" ? (v as (...args: A) => R) : undefined;
}

/** An object the shell published, or nothing where it has not. */
function shellObject<T extends object>(name: string): T | undefined {
  const v = shellNamed(name);
  return typeof v === "object" && v !== null ? (v as T) : undefined;
}

/**
 * The props of a control that refuses, with the sentence that says why (data-bits `gatedProps`): focusable, described,
 * inert, and pressing it shows the reason at the control (`window.__tip`). None where the shell has no role gate.
 */
export function gatedProps(reason: string): Record<string, unknown> {
  const g = shellFn<[string], Record<string, unknown>>("gatedProps");
  return g ? g(reason) : {};
}

/** Whether the shell can build a link to a route at all (`__href`): the standalone mockup cannot. */
export function hasHref(): boolean {
  return !!shellFn("__href");
}

/** A link the browser follows to a route (`__href`: a download, a photo), or null where the shell builds none. */
export function hrefOf(key: string, params?: Record<string, string>): string | null {
  const href = shellFn<[string, Record<string, string> | undefined], string>("__href");
  return href ? href(key, params) : null;
}

/** One class of the workspace's policy charter, as the chip names it (`POLICY.row`). */
export interface PolicyRow {
  id: string;
  chip: string;
  locked?: boolean;
}

/** The workspace's policy store (`window.POLICY`), on the mockup's own interface: the app answers it from the workspace's rows. */
interface PolicyStore {
  row(id: string): PolicyRow | null;
  modeOf(id: string): string | null;
  WORDS?: Record<string, { chip?: string }>;
}

/** The policy store, or nothing where the shell has none. */
export function policyStore(): PolicyStore | undefined {
  return shellObject<PolicyStore>("POLICY");
}

/** One class's figures in the trust digest: what it sent on its own. */
interface TrustRow {
  sent: number;
}

/** The trust digest (`window.TRUST`), the mockup's seeded table. */
interface TrustTable {
  cls(id: string): TrustRow | null | undefined;
  rate(t: TrustRow): number;
}

/** The trust digest, or nothing where the shell has none. */
export function trustTable(): TrustTable | undefined {
  return shellObject<TrustTable>("TRUST");
}

/**
 * Whether the app has read the workspace's policies (`window.__POLICIES`: an object, or null where the read failed).
 * Undefined is the standalone mockup, whose seeded trust table is what its chips quote.
 */
export function policiesRead(): boolean {
  return shellNamed("__POLICIES") !== undefined;
}

/** Go to Settings > Autonomy, as the policy chip does (`CHANLY.nav(CHANLY.R.admin("autonomy"))`); nowhere without the frame. */
export function openAutonomy(): void {
  const routes = shellObject<{ R?: { admin?: (pane: string) => string } }>("CHANLY")?.R;
  if (routes?.admin) navigate(routes.admin("autonomy"));
}

/**
 * The frame's tip, which a control's mark shows on a press (`window.__tip.show`, as the attention row's "what else is
 * known" mark does): read when it is asked, and nothing where the shell has no tip.
 */
export function showTip(target: Element | null): void {
  const tip = shellObject<{ show?: (el: Element) => void }>("__tip");
  if (tip && tip.show && target) tip.show(target);
}

/* ------------------------- the shell's helpers a surface's controls take (data-bits.jsx) ------------------------- */

/**
 * What a role gate spreads onto a control, AFTER its handlers (data-bits `gate`): nothing where the role may act; where
 * it may not, the control stays in the tab order, says why on hover, on focus and when pressed, and does nothing.
 */
export interface GateProps {
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
}

/** A page under a strip, walked across by a swipe (data-bits `touchSwipe`, `pages`): the page each side, and how it follows. */
interface SwipePage {
  prev: boolean;
  next: boolean;
  moving?: Element | null;
  follow: (progress: number, step: number, how: "move" | "leave" | "settle") => void;
  go: (step: number) => void;
}

/** What a swipe answers to (data-bits `touchSwipe`): each is the page's own to do, called once the thumb has let go. */
export interface SwipeOptions {
  onLeft?: (() => void) | null;
  onRight?: (() => void) | null;
  onDown?: (() => void) | null;
  onBack?: (() => void) | null;
  onAway?: (() => void) | null;
  pages?: ((el: Element, from: EventTarget | null) => SwipePage | null) | null;
  min?: number;
  when?: (() => boolean) | null;
  onGrab?: ((el: Element, on: boolean) => void) | null;
}

/** The handlers a swipe spreads onto the element it is on. */
export interface SwipeHandlers {
  onTouchStart?: (e: TouchEvent<HTMLElement>) => void;
  onTouchMove?: (e: TouchEvent<HTMLElement>) => void;
  onTouchEnd?: (e: TouchEvent<HTMLElement>) => void;
  onTouchCancel?: (e: TouchEvent<HTMLElement>) => void;
}

/** What a link to a route spreads (data-bits `routeDoor`): the address in its href, the app's own way there on a plain press. */
export interface RouteDoor {
  href: string;
  onClick: (e?: MouseEvent<HTMLElement>) => void;
  onPointerEnter?: () => void;
  onFocus?: () => void;
}

/** A refusal, as the toast raises it (contracts `refusalOf`): a title for the kind of no, and the sentence in the owner's words. */
interface Refusal {
  title?: string | null;
  message?: string | null;
}

/** What Ask is told is on screen (Ask reads it when it opens); a page says it as it draws, and takes it back as it goes. */
export interface AskOnScreen {
  key: string;
  ids: readonly string[];
  labels: readonly (string | undefined)[];
  view: string | null;
}

/** What the deal sheet is asked for, from anywhere (`window.openDealSheet`, components/deal-sheet.jsx). */
export interface DealSheetAsk {
  personId: string;
  mode: string;
  service?: string;
  dealId?: string;
}

declare global {
  interface Window {
    gate?: (action: string, doing?: string) => GateProps;
    gateTitle?: (action: string, doing?: string) => string;
    mayAtLeast?: (rung: string) => boolean;
    touchSwipe?: (options: SwipeOptions) => SwipeHandlers;
    leaving?: (key: string) => RefCallback<HTMLElement>;
    trapFocus?: (box: HTMLElement | null) => () => void;
    dialogRef?: (key: string) => RefCallback<HTMLElement>;
    keyPress?: (fn: (e: KeyboardEvent<HTMLElement>) => void) => (e: KeyboardEvent<HTMLElement>) => void;
    routeDoor?: (to: string, go?: ((to: string) => void) | null) => RouteDoor;
    refusalToast?: (r: Refusal | null | undefined, what?: string | null) => LegacyFlash;
    useHotkey?: (matcher: (e: KeyboardEvent, typing: boolean) => boolean, handler: (e: KeyboardEvent) => void) => void;
    __tip?: { show: (el: Element) => void };
    __askOnScreen?: AskOnScreen | null;
    openDealSheet?: (ask: DealSheetAsk) => void;
  }
}

/** A role gate's props for a control (data-bits `gate`); where the shell has no role store, the control is not gated. */
export function gate(action: string, doing?: string): GateProps {
  return window.gate ? window.gate(action, doing) : {};
}

/** The sentence a role's refusal says (data-bits `gateTitle`), for a control that explains itself its own way. */
export function gateTitle(action: string, doing?: string): string {
  return window.gateTitle ? window.gateTitle(action, doing) : "Your role can't do this.";
}

/** Whether the member, as they are acting (View-as included), stands on this rung or above (data-bits `mayAtLeast`). */
export function mayAtLeast(rung: string): boolean {
  return window.mayAtLeast ? window.mayAtLeast(rung) : false;
}

/** A thumb's gestures for an element (data-bits `touchSwipe`); none where the shell has none. */
export function touchSwipe(options: SwipeOptions): SwipeHandlers {
  return window.touchSwipe ? window.touchSwipe(options) : {};
}

/** The ref that plays an overlay out as React lets go of it (data-bits `leaving`), one per key. */
export function leaving(key: string): RefCallback<HTMLElement> | undefined {
  return window.leaving ? window.leaving(key) : undefined;
}

/** A dialog's ref: it holds focus while it is open and plays out as it goes (data-bits `dialogRef`), one per key. */
export function dialogRef(key: string): RefCallback<HTMLElement> | undefined {
  return window.dialogRef ? window.dialogRef(key) : undefined;
}

/** Focus goes into a box and Tab stays inside it (data-bits `trapFocus`); the answer puts focus back where it was. */
export function trapFocus(box: HTMLElement | null): () => void {
  return window.trapFocus ? window.trapFocus(box) : () => undefined;
}

/** Enter and Space, pressed on the element itself, as a press (data-bits `keyPress`). */
export function keyPress(fn: (e: KeyboardEvent<HTMLElement>) => void): (e: KeyboardEvent<HTMLElement>) => void {
  return window.keyPress ? window.keyPress(fn) : () => undefined;
}

/** A link to a route: its address in the href, and the app's own way there on a plain press (data-bits `routeDoor`). */
export function routeDoor(to: string, go?: ((to: string) => void) | null): RouteDoor {
  return window.routeDoor ? window.routeDoor(to, go) : { href: `#/${to}`, onClick: () => navigate(to) };
}

/** A refusal as the toast raises it: always the danger tone, the page's words first (data-bits `refusalToast`). */
export function refusalToast(r: Refusal | null | undefined, what?: string | null): LegacyFlash {
  return window.refusalToast
    ? window.refusalToast(r, what)
    : { tone: "danger", msg: r?.message ?? "That didn't go through." };
}

/** The shell's hotkey hook (data-bits `useHotkey`): the matcher is asked on every keydown, with whether a field has the keys. */
export function useLegacyHotkey(
  matcher: (e: KeyboardEvent, typing: boolean) => boolean,
  handler: (e: KeyboardEvent) => void,
): void {
  window.useHotkey?.(matcher, handler);
}

/** Say what is on screen to Ask, or take it back (`null`): what Ask reads when it opens. */
export function setAskOnScreen(on: AskOnScreen | null): void {
  window.__askOnScreen = on;
}

/** The page Ask was last told is on screen: a page takes it back only when it is its own. */
export function askOnScreenKey(): string | null {
  return window.__askOnScreen ? window.__askOnScreen.key : null;
}

/** Ask for the one deal sheet (components/deal-sheet.jsx); nothing where the shell has none. */
export function openDealSheet(ask: DealSheetAsk): void {
  window.openDealSheet?.(ask);
}

declare global {
  interface Window {
    appNavigate?: (route: string, opts?: { replace?: boolean }) => void;
  }
}

/**
 * Say where the page stands without a new entry in the history (`appNavigate(route, { replace: true })`): the address is
 * replaced by the route, and Back leaves the page rather than replaying every item it opened.
 */
export function replaceRoute(route: string): void {
  window.appNavigate?.(route, { replace: true });
}

/** Who is acting, as the workspace read said (`window.__ME`); null before it lands. */
export function meNow(): { id?: string | null; role?: string | null; display_name?: string | null } | null {
  type Me = { id?: string | null; role?: string | null; display_name?: string | null };
  return (window as Window & { __ME?: Me | null }).__ME ?? null;
}

/** What Setup read (`window.__SETUP.dto`), or null before it lands and where its read failed. */
export function setupDto(): SetupSurface["dto"] | null {
  return (window.__SETUP && window.__SETUP.dto) || null;
}

/** Whether Setup's read failed (`window.__SETUP` is null, where before its first read it is undefined). */
export function setupFailed(): boolean {
  return window.__SETUP === null;
}

/** Whether the surface a route draws from failed to read (`window.__surfaceFailed`): where the registry has none, no. */
export function surfaceFailed(page: string, param?: string | null): boolean {
  const failed = (window as Window & { __surfaceFailed?: (page: string, param?: string | null) => boolean })
    .__surfaceFailed;
  return !!(failed && failed(page, param));
}

/** People's list verbs (`window.__lists`): whether they are there, and an archived list put back on the rail. */
export function canRestoreList(): boolean {
  return !!window.__lists;
}
export function restoreList(id: string | null): Promise<ApiResult<unknown>> {
  // The card offers it only where canRestoreList() says so; an id of null is the list the playbook lost, which the door refuses.
  if (!window.__lists) return Promise.reject(new Error("People's lists are not read here"));
  return window.__lists.restore(id as string);
}
