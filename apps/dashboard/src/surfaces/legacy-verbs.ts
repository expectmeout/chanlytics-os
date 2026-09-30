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
import type { ReactNode } from "react";

/** What a toast says, as the shell's one flash takes it (data-bits `usePPToast`). */
interface LegacyFlash {
  tone?: string;
  msg: ReactNode;
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
