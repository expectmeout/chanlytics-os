/**
 * The names the frame's parts read off the window that no module of the bridge declares: the person the workspace read
 * wrote (`__ME`), the bell (`__notifs`, legacy-bridge/notifications.ts), and the demo's stores, which a real workspace
 * never fills (the Agents strip's pauses and its store's templates, the seeded leads). Typed once here, as the frame's
 * JSX read them, so each part reads `window.<name>` and the window ratchets count it (step 9 ends the reads). With them,
 * the three reads every part makes: the demo's flag, and the glyph and the portal by their global names.
 */
import type { ComponentType, ReactNode } from "react";
import type { IdentityApi } from "@/legacy-bridge/identity";
import type { BellApi } from "@/legacy-bridge/notifications";
import type { LiveSurface } from "../live/surface";
import type { SwipeOptions } from "../kit/motion/swipe";
import type { IX_STORE } from "../inbox/store";
import type { SurfaceValues } from "../surface-values";
import { Icon } from "../kit/icon/icon";
import { MoreMenu } from "../kit/more-menu/more-menu";
import { RecordSwitch } from "../kit/record/field";

declare global {
  interface Window {
    /** The person signed in, as the workspace read wrote it (legacy-bridge/surface-data.ts). */
    __ME?: Parameters<IdentityApi["words"]>[0];
    /** The bell: its rows, its read state and this device's alerts (legacy-bridge/notifications.ts). */
    __notifs?: BellApi;
    /** The demo's Agents pages' pauses (the mockup's; nothing in the app fills it). */
    FL_STORE?: { statuses?: Record<string, string> };
    /** The demo's Agents store (the mockup's; nothing in the app fills it). */
    STORE_DATA?: {
      STORE_TEMPLATES?: ReadonlyArray<{ installed?: boolean }>;
      STORE_LISTINGS?: ReadonlyArray<{ id: string; name: string; status: string; rejectReason?: string }>;
    };
    /** The demo's scripted lead arrival (the mockup's; nothing in the app fills it). */
    LD_STORE?: { arrive?: () => void };
    /** The session's decisions on seeded threads (surfaces/inbox/store.ts), published by seed-globals.ts. */
    IX_STORE?: typeof IX_STORE;
    /** The workspace's billing, the surface's mirror (surfaces/settings/billing/surface.ts), for the paused line. */
    __BILLING_ACCOUNT?: SurfaceValues["billing"];
    /** Ask, wired to the workspace (legacy-bridge/ask.ts): the follow-ups that came due, which the top bar marks. */
    __ask?: { followUpsDue?: () => readonly unknown[] };
    /** Ask's face, the three (components/ask-face.jsx), which the top bar's Ask button draws. */
    AskFace?: ComponentType<{ className?: string; testId?: string }>;
    /** The demo's seeded leads (the mockup's; nothing in the app fills it). */
    LEADS?: ReadonlyArray<{ stage?: string }>;
    /** Calls going on and the last few, with the heartbeat rule (surfaces/live/surface.ts), for the Live tab's pulse. */
    __LIVE?: LiveSurface;
    /** What needs you, the one count (surfaces/needs-you.ts), published by seed-globals.ts for the frame's parts. */
    useNeedsYou?: () => number | null;
    /** People's scopes and each one's route (surfaces/people/people-globals.ts), for where a route stands on its strip. */
    plScopes?: () => ReadonlyArray<{ id: string }>;
    plScopeRoute?: (id: string) => string;
    /** The page a swipe walks (kit/view-tabs/pager.ts), published by kit-globals.ts. */
    viewPager?: NonNullable<SwipeOptions["pages"]>;
    /** The route gate (legacy-bridge/surface-registry.ts installRouteGate): whether a route's surfaces are in. */
    __surfaceGate?: (page: string, param: string | null, own?: boolean) => boolean;
    /** What the registry says of a page: real, demo, or nothing it knows. */
    __surfaceState?: (page: string, param?: string | null) => string | undefined;
    /** Where an address lands now, if it moved (a retired page, a pane that left). */
    __surfaceRetired?: (page: string, param: string | null, demo: boolean) => string | null;
    /** Told when any surface's readiness moves; returns the stop. */
    __onSurfaceReady?: (fn: () => void) => () => void;
    /** How long a page whose own surface is in waits for a band beside it (surface-registry.ts ROUTE_WAIT_MS). */
    __routeWaitMs?: number;
    /** People's rows, once read (surfaces/people/surface.ts): a person's crumb is drawn again when they land. */
    __PEOPLE?: unknown;
    /** Inside the native app, stamped before paint: the app's own tab bar stands where the frame's would. */
    __IN_APP?: boolean;
    /** The keyboard shortcuts sheet's opener (shortcuts.tsx), published by frame-globals.ts while the sheet is there. */
    openShortcuts?: () => void;
    /** Focus held in a dialog for its life (kit/focus/trap.ts), published by frame-globals.ts. */
    dialogRef?: (key: string) => (el: HTMLElement | null) => void;
  }
}

/** The shell's words (legacy-bridge/shell.ts `__chrome`), read where a part draws: the frame reads them here alone. */
export const frameChrome = () => window.__chrome;
/** The shell's bridge (legacy-bridge/shell.ts `__shell`: sign-out, the workspace, the address), read here alone. */
export const frameShell = () => window.__shell;
/** The bell (legacy-bridge/notifications.ts `__notifs`), where the workspace has one: the frame reads it here alone. */
export const frameBell = () => window.__notifs;
/** The registry's word for a surface (surface-registry.ts `__surfaceState`): the frame's gate and its soon landing ask it. */
export const frameSurfaceState = () => window.__surfaceState;

/** Whether the session declared itself a demo, read as the frame's JSX read it (`window.__DEMO_MODE`). */
export const isDemoFrame = (): boolean => !!window.__DEMO_MODE;

/** The page's portal and glyph, by the global names the frame's JSX drew them by (a test's stand-in), else the kit's. */
type FrameGlobals = typeof globalThis & {
  ReactDOM?: { createPortal?: (node: ReactNode, into: Element) => ReactNode };
  Icon?: ComponentType<{ name: string; size?: number; className?: string; style?: object }>;
};
export const frameGlyph = () => (globalThis as FrameGlobals).Icon ?? Icon;
export const framePortal = () => (globalThis as FrameGlobals).ReactDOM?.createPortal ?? null;

/** The kit's parts by the global names the frame's JSX drew them by (a test's stand-in), else the kit's own. */
type KitGlobals = typeof globalThis & {
  MoreMenu?: typeof MoreMenu;
  RecordSwitch?: typeof RecordSwitch;
};
export const frameMoreMenu = () => (globalThis as KitGlobals).MoreMenu ?? MoreMenu;

/** The frame's toast and the seam's redraw hook by the global names the top bar's JSX called them by, else the window's. */
type ShellGlobals = typeof globalThis & {
  usePPToast?: Window["usePPToast"];
  useSurface?: Window["useSurface"];
};
export const frameToastHook = () => (globalThis as ShellGlobals).usePPToast ?? window.usePPToast;
export const frameSurfaceHook = () => (globalThis as ShellGlobals).useSurface ?? window.useSurface;
export const frameRecordSwitch = () => (globalThis as KitGlobals).RecordSwitch ?? RecordSwitch;

/** A part by the bare global name the frame's JSX drew it by (a test's stand-in), else the frame's own. */
export const fromGlobal = <T>(name: string, own: T): T => (Reflect.get(globalThis, name) as T | undefined) ?? own;
/** A part by the window name the frame's JSX read it by (a test's stand-in), else the frame's own. */
export const fromWindow = <T>(name: string, own: T): T => (Reflect.get(window, name) as T | undefined) ?? own;
