/**
 * The names the frame's parts still read off the window, as the app publishes them (seed-globals.ts, frame-globals.ts),
 * typed once here; and the parts the bridge installs (bridge/provided.ts), each read here alone. With them, the reads
 * every part makes: the glyph and the portal by their global names.
 */
import type { ComponentType, ReactNode } from "react";
import { provided } from "@/bridge/provided";
import type { SwipeOptions } from "../kit/motion/swipe";
import { Icon } from "../kit/icon/icon";

declare global {
  interface Window {
    /** What needs you, the one count (surfaces/needs-you.ts), published by seed-globals.ts for the frame's parts. */
    useNeedsYou?: () => number | null;
    /** People's scopes and each one's route (surfaces/people/people-globals.ts), for where a route stands on its strip. */
    plScopes?: () => ReadonlyArray<{ id: string }>;
    plScopeRoute?: (id: string) => string;
    /** The page a swipe walks (kit/view-tabs/pager.ts), published by kit-globals.ts. */
    viewPager?: NonNullable<SwipeOptions["pages"]>;
    /** The keyboard shortcuts sheet's opener (shortcuts.tsx), published by frame-globals.ts while the sheet is there. */
    openShortcuts?: () => void;
    /** Focus held in a dialog for its life (kit/focus/trap.ts), published by frame-globals.ts. */
    dialogRef?: (key: string) => (el: HTMLElement | null) => void;
  }
}

/** The shell's words (bridge/shell.ts, provided as `chrome`), read where a part draws: the frame reads them here alone. */
export const frameChrome = () => provided("chrome");
/** The shell's verbs (bridge/shell.ts, provided as `shell`: sign-out, the workspace, the address), read here alone. */
export const frameShell = () => provided("shell");
/** The bell (bridge/notifications.ts, provided as `bell`), where the workspace has one: the frame reads it here alone. */
export const frameBell = () => provided("bell");

/** The page's portal and glyph, by the global names the frame's JSX drew them by (a test's stand-in), else the kit's. */
type FrameGlobals = typeof globalThis & {
  ReactDOM?: { createPortal?: (node: ReactNode, into: Element) => ReactNode };
  Icon?: ComponentType<{ name: string; size?: number; className?: string; style?: object }>;
};
export const frameGlyph = () => (globalThis as FrameGlobals).Icon ?? Icon;
export const framePortal = () => (globalThis as FrameGlobals).ReactDOM?.createPortal ?? null;

/** The frame's toast and the seam's redraw hook by the global names the top bar's JSX called them by, else the window's. */
type ShellGlobals = typeof globalThis & {
  usePPToast?: Window["usePPToast"];
  useSurface?: Window["useSurface"];
};
export const frameToastHook = () => (globalThis as ShellGlobals).usePPToast ?? window.usePPToast;
export const frameSurfaceHook = () => (globalThis as ShellGlobals).useSurface ?? window.useSurface;

/** A part by the bare global name the frame's JSX drew it by (a test's stand-in), else the frame's own. */
export const fromGlobal = <T>(name: string, own: T): T => (Reflect.get(globalThis, name) as T | undefined) ?? own;
/** A part by the window name the frame's JSX read it by (a test's stand-in), else the frame's own. */
export const fromWindow = <T>(name: string, own: T): T => (Reflect.get(window, name) as T | undefined) ?? own;
