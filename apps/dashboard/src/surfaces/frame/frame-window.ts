/**
 * The names the frame's parts read off the window that no module of the bridge declares: the person the workspace read
 * wrote (`__ME`) and the bell (`__notifs`, bridge/notifications.ts), among others. Typed once here, as the frame's JSX
 * read them, so each part reads `window.<name>` and the window ratchets count it (step 9 ends the reads). With them, the
 * reads every part makes: the glyph and the portal by their global names.
 */
import type { ComponentType, ReactNode } from "react";
import type { IdentityApi } from "@/bridge/identity";
import type { BellApi } from "@/bridge/notifications";
import type { LiveSurface } from "../live/surface";
import type { SwipeOptions } from "../kit/motion/swipe";
import { Icon } from "../kit/icon/icon";
import { RecordSwitch } from "../kit/record/field";

declare global {
  interface Window {
    /** The person signed in, as the workspace read wrote it (bridge/surface-data.ts). */
    __ME?: Parameters<IdentityApi["words"]>[0];
    /** The bell: its rows, its read state and this device's alerts (bridge/notifications.ts). */
    __notifs?: BellApi;
    /** The session's decisions on seeded threads (surfaces/inbox/store.ts), published by seed-globals.ts. */
    /** Calls going on and the last few, with the heartbeat rule (surfaces/live/surface.ts), for the Live tab's pulse. */
    __LIVE?: LiveSurface;
    /** What needs you, the one count (surfaces/needs-you.ts), published by seed-globals.ts for the frame's parts. */
    useNeedsYou?: () => number | null;
    /** People's scopes and each one's route (surfaces/people/people-globals.ts), for where a route stands on its strip. */
    plScopes?: () => ReadonlyArray<{ id: string }>;
    plScopeRoute?: (id: string) => string;
    /** The page a swipe walks (kit/view-tabs/pager.ts), published by kit-globals.ts. */
    viewPager?: NonNullable<SwipeOptions["pages"]>;
    /** The route gate (bridge/surface-registry.ts installRouteGate): whether a route's surfaces are in. */
    __surfaceGate?: (page: string, param: string | null, own?: boolean) => boolean;
    /** What the registry says of a page: real, demo, or nothing it knows. */
    __surfaceState?: (page: string, param?: string | null) => string | undefined;
    /** Where an address lands now, if it moved (a retired page, a pane that left). */
    __surfaceRetired?: (page: string, param: string | null, demo: boolean) => string | null | undefined;
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

/** The shell's words (bridge/shell.ts `__chrome`), read where a part draws: the frame reads them here alone. */
export const frameChrome = () => window.__chrome;
/** The shell's bridge (bridge/shell.ts `__shell`: sign-out, the workspace, the address), read here alone. */
export const frameShell = () => window.__shell;
/** The bell (bridge/notifications.ts `__notifs`), where the workspace has one: the frame reads it here alone. */
export const frameBell = () => window.__notifs;
/** The registry's word for a surface (surface-registry.ts `__surfaceState`): the frame's gate and its soon landing ask it. */
export const frameSurfaceState = () => window.__surfaceState;

/** The page's portal and glyph, by the global names the frame's JSX drew them by (a test's stand-in), else the kit's. */
type FrameGlobals = typeof globalThis & {
  ReactDOM?: { createPortal?: (node: ReactNode, into: Element) => ReactNode };
  Icon?: ComponentType<{ name: string; size?: number; className?: string; style?: object }>;
};
export const frameGlyph = () => (globalThis as FrameGlobals).Icon ?? Icon;
export const framePortal = () => (globalThis as FrameGlobals).ReactDOM?.createPortal ?? null;

/** The kit's parts by the global names the frame's JSX drew them by (a test's stand-in), else the kit's own. */
type KitGlobals = typeof globalThis & {
  RecordSwitch?: typeof RecordSwitch;
};

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
