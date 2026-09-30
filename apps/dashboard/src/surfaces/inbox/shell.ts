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
import type { HTMLAttributes, ReactNode } from "react";
import { canDo, navigate } from "../legacy-verbs";
import { useLegacyToast } from "../legacy-verbs";

/** A name off the window, whatever it holds. */
const named = (name: string): unknown => Reflect.get(window, name);

/** A function the shell published, or nothing where it has not. */
function fn<A extends unknown[], R>(name: string): ((...args: A) => R) | undefined {
  const v = named(name);
  return typeof v === "function" ? (v as (...args: A) => R) : undefined;
}

/** An object the shell published, or nothing where it has not. */
function object<T extends object>(name: string): T | undefined {
  const v = named(name);
  return typeof v === "object" && v !== null ? (v as T) : undefined;
}

/* --------------------------------- roles --------------------------------- */

/** A role gate's props, spread after a control's handlers: `{}` where the role may act (data-bits `gate`). */
export function gate(perm: string, doing?: string): Record<string, unknown> {
  const g = fn<[string, string | undefined], Record<string, unknown>>("gate");
  return g ? g(perm, doing) : {};
}

export { canDo, navigate };

/* -------------------------------- the toast -------------------------------- */

/** What the shell's one toast takes (data-bits `usePPToast`): a message, its tone, and what pressing does. */
export interface Flash {
  tone?: string;
  msg: ReactNode;
  undo?: (() => unknown) | null;
  ms?: number;
  links?: Array<{ label: string; to: string }>;
  action?: { label: string; onClick: () => void };
}

/** The toast's node, to be drawn by the page, and the flash that raises one. */
export function useToast(): [ReactNode, (flash: Flash) => void] {
  return useLegacyToast();
}

/* ------------------------------- the address ------------------------------- */

/** Move to a route, replacing the entry where the page says where it stands (`appNavigate`); nothing without the frame. */
export function appNavigate(route: string, opts?: { replace?: boolean }): void {
  fn<[string, { replace?: boolean } | undefined], void>("appNavigate")?.(route, opts);
}

/** Whether the frame's move is there at all. */
export function canNavigate(): boolean {
  return !!fn("appNavigate");
}

interface AddressApi {
  route: () => string;
}

/** The route on screen, as the frame's address says it (`CHANLY.address.route()`). */
export function currentRoute(): string {
  const chanly = object<{ address?: AddressApi }>("CHANLY");
  return chanly?.address ? chanly.address.route() : "";
}

/**
 * A door as a link (data-bits `routeDoor`): its address in the href, the app's own way there on a plain press. Nothing
 * where the shell has none, and the caller then draws no link.
 */
export function routeDoor(to: string, go?: ((to: string) => void) | null): HTMLAttributes<HTMLAnchorElement> | null {
  const door = fn<[string, ((to: string) => void) | null | undefined], HTMLAttributes<HTMLAnchorElement>>("routeDoor");
  return door ? door(to, go) : null;
}

/** Whether the shell can make a door at all. */
export function hasRouteDoor(): boolean {
  return !!fn("routeDoor");
}

/** A key handler that runs `run` on Enter and Space (data-bits `keyPress`). */
export function keyPress(run: () => void): HTMLAttributes<HTMLElement>["onKeyDown"] {
  const k = fn<[() => void], HTMLAttributes<HTMLElement>["onKeyDown"]>("keyPress");
  return k ? k(run) : undefined;
}

/** A thumb carries a pane away (data-bits `touchSwipe`): the props to spread on it, none without the shell. */
export function touchSwipe(opts: {
  onBack: () => void;
  when: () => boolean;
  onGrab: (el: Element | null, on: boolean) => void;
}): HTMLAttributes<HTMLDivElement> | null {
  const t = fn<[typeof opts], HTMLAttributes<HTMLDivElement>>("touchSwipe");
  return t ? t(opts) : null;
}

/** A refusal as a toast (data-bits `refusalToast`). */
export function refusalToast(r: unknown, what?: string | null): Flash {
  const f = fn<[unknown, string | null | undefined], Flash>("refusalToast");
  return f ? f(r, what) : { tone: "danger", msg: "That didn't go through." };
}

/* ---------------------------- what the tab remembers ---------------------------- */

type Place = Record<string, unknown>;

/** The tab's memory (tab-memory.ts), or nothing where the shell has none: the standalone harness. */
export function tabMemory():
  | {
      place: (page: string, view: string) => Place | null;
      keepPlace: (page: string, view: string, place: Place) => void;
      draft: <T = unknown>(kind: string, key?: string) => T | null;
      keepDraft: (kind: string, value: unknown, key?: string) => void;
      dropDraft: (kind: string, key?: string) => void;
    }
  | undefined {
  return window.__tabMemory;
}

/* -------------------------------- the session -------------------------------- */

/** Whether the session declared itself a demo. */
export function demoSession(): boolean {
  return !!window.__DEMO_MODE;
}

/** What the registry says of a surface: real, demo, seeded (`__surfaceState`); nothing without it. */
export function surfaceState(page: string): string | undefined {
  const state = fn<[string], string | undefined>("__surfaceState");
  return state ? state(page) : undefined;
}

/** Whether the member is Away, which freezes every countdown and forces the holding line (data-bits `PR_STORE`). */
export function presenceAway(): boolean {
  const p = object<{ away?: boolean }>("PR_STORE");
  return !!(p && p.away);
}

/** The business's zone, as the page clock holds it. */
export function clockZone(): string {
  return window.__clock && window.__clock.zone ? window.__clock.zone() : "UTC";
}

/** Whether a call ended in the Live Monitor's session (`LM_STORE.isEnded`): the demo's, and nothing on a real workspace. */
export function liveCallEnded(id: string): boolean {
  const store = object<{ isEnded?: (id: string) => boolean }>("LM_STORE");
  return !!(store && store.isEnded && store.isEnded(id));
}

/* --------------------------------- people --------------------------------- */

/** Who a thread's teammate is, from the team Settings reads: nobody when the roster is unread. */
export function team(): Array<{ userId: string; email: string; displayName?: string | null }> | null {
  const t = named("__TEAM");
  return Array.isArray(t) ? (t as Array<{ userId: string; email: string; displayName?: string | null }>) : null;
}

/** A person's own sheet: the one deal sheet, asked for by the person and the move (data-bits `openDealSheet`). */
export function openDealSheet(ask: { personId: string; mode: string; dealId?: string | null }): void {
  fn<[typeof ask], void>("openDealSheet")?.(ask);
}

/** Whether the shell has the deal sheet at all. */
export function hasDealSheet(): boolean {
  return !!fn("openDealSheet");
}

/** The step sheet (step-sheet.jsx `openStepSheet`), asked for by the person and the deal. */
export function openStepSheet(ask: { personId: string; dealId: string | null }): void {
  fn<[typeof ask], void>("openStepSheet")?.(ask);
}

/** Whether the shell has the step sheet at all. */
export function hasStepSheet(): boolean {
  return !!fn("openStepSheet");
}

/* ----------------------------------- Ask ----------------------------------- */

/** What Ask is told is on screen: the rows a list draws, in its order, and what chose them. */
interface OnScreen {
  key: string;
  ids: string[];
  labels: string[];
  view: string | null;
}

/** Say what is on screen to Ask (`__askOnScreen`), or take it back with null. */
export function setAskOnScreen(value: OnScreen | null): void {
  Reflect.set(window, "__askOnScreen", value);
}

/** The surface whose rows Ask was last told of, when one is. */
export function askOnScreenKey(): string | null {
  const v = named("__askOnScreen");
  return typeof v === "object" && v !== null && "key" in v && typeof v.key === "string" ? v.key : null;
}

/* ----------------------------- the mockup's seeds ----------------------------- */

/** A seeded lead the verdict flow moves: its stage is what the flow changes. */
export interface SeededLead {
  id: string;
  stage: string;
}

/** The demo's leads, whose stage a verdict changes; none where the seed is not loaded. */
export function seededLeads(): SeededLead[] {
  const l = named("LEADS");
  return Array.isArray(l) ? (l as SeededLead[]) : [];
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

/** The demo's deals, which a verdict may add one to; nothing where the board is not loaded. */
export function seededDeals(): SeededDeal[] | null {
  const d = object<{ PIPELINE_DEALS?: SeededDeal[] }>("PIPELINE_DATA");
  return d && Array.isArray(d.PIPELINE_DEALS) ? d.PIPELINE_DEALS : null;
}

/** The demo's agent registry: a name to its id (`CHANLY.agentIdFor`), and to its row. */
export function agentIdFor(name: string): string {
  const c = object<{ agentIdFor?: (n: string) => string }>("CHANLY");
  return c && c.agentIdFor
    ? c.agentIdFor(name)
    : String(name || "")
        .toLowerCase()
        .replace(/\s+/g, "-");
}

/** The demo's agent by name, for its voice. */
export function agentByName(name: string): { tone?: string } | null {
  const c = object<{ agentByName?: (n: string) => { tone?: string } | null }>("CHANLY");
  return c && c.agentByName ? c.agentByName(name) : null;
}

/** A policy row (`POLICY.row`) as the rail reads it. */
export interface PolicyRow {
  id: string;
  chip: string;
  locked?: boolean;
  note?: string;
}

/** The workspace policy the rail edits directly (`POLICY`): its rows, modes and setter. */
export function policy():
  | {
      MODES: readonly string[];
      row: (id: string) => PolicyRow | null;
      modeOf: (id: string) => string | null;
      set: (id: string, mode: string) => void;
    }
  | undefined {
  const p = object<{
    MODES: readonly string[];
    row: (id: string) => PolicyRow | null;
    modeOf: (id: string) => string | null;
    set: (id: string, mode: string) => void;
  }>("POLICY");
  return p;
}

/** A member's name in the words the workspace says it (`__identity.member`); nothing where the shell has no identity. */
export function memberName(m: { email: string | null; display_name?: string | null }): string | undefined {
  return window.__identity ? window.__identity.member(m).name : undefined;
}
