/**
 * What the Business tab still asks of the shell (decision 0015, step 11).
 *
 * A TSX surface reads nothing off `window`, so each thing the tab reads that a page of the shell, the bridge or the seam
 * publishes reaches it through one function here, read when it is called: a test's stand-in, set on the window, is the
 * one read. Each is a line to delete on the day its owner gives the tab an import or a seam value instead; nothing here
 * is new behaviour.
 */
import type { PoliciesSurface } from "@/bridge/policy-store";
import type { calendar } from "../../calendar/verbs";
import { surfaceValue } from "../../surface-values";

declare global {
  interface Window {
    /** Whether a page's read failed (surface-registry.ts installRouteGate). */
    __surfaceFailed?: (page: string, param?: string | null) => boolean;
    /** The calendar's verbs, as calendar/verbs.ts installCalendar publishes them. */
    __calendar?: typeof calendar;
  }
}

/* ------------------------------------------------------------- the settings read ------------------------------------------------------------- */

/**
 * The workspace's settings record (its config, its version, the prompt the receptionist reads), from the settings surface:
 * undefined before the read. It was a global beside that value, `__SETTINGS`, holding the same, until 12 Nov 2026.
 */
export const settingsNow = () => surfaceValue("settings")?.settings ?? undefined;
/**
 * What the workspace's facts resolve to, from the settings surface (the seam's value, surface-values.ts): undefined before
 * the read, null on a config that would not parse. It was a global beside that value, `__FACTS`, holding the same.
 */
export const factsNow = () => surfaceValue("settings")?.facts;
/**
 * The workspace's policy rows, from the settings surface: undefined before the read, null where it failed, else the rows.
 * Every policy chip asks them here too (the store FrameApp.tsx installs, and frame-verbs.ts policiesRead). A window global,
 * `__POLICIES`, until 12 Nov 2026.
 */
export const policiesNow = (): PoliciesSurface | null | undefined => surfaceValue("settings")?.policies;
/** WhatsApp's rows, from the settings surface: undefined before the read, null where the templates read failed. */
export const templatesAllNow = () => surfaceValue("settings")?.templatesAll;
/** Setup's read, from its surface: undefined before it, null where it failed (a window mirror, `__SETUP`, until 12 Nov 2026). */
export const setupNow = () => surfaceValue("setup");

/* --------------------------------------------------------------- the workspace --------------------------------------------------------------- */

export const workspacesNow = () => window.__WORKSPACES;
export const activeWorkspaceNow = () => window.__ACTIVE_WORKSPACE;
export const workspaceApi = () => window.__workspace;
export const tzApi = () => window.__tz;

/* ---------------------------------------------------------------- the calendar --------------------------------------------------------------- */

/** The Calendar's read, from its surface: undefined before it (a window mirror, `__CALENDAR`, until 12 Nov 2026). */
export const calendarNow = () => surfaceValue("calendar");
export const calendarApi = () => window.__calendar;

/* -------------------------------------------------------- the frame's status and words -------------------------------------------------------- */

export const surfaceFailedFn = () => window.__surfaceFailed;
export const chromeWords = () => window.__chrome;

/* ------------------------------------------- the save the bridge publishes ------------------------------------------- */

export const saveSettingsFn = () => window.__saveSettings;

/* ------------------------------------------------------------------ the log ------------------------------------------------------------------ */

/** The page's console, as the JSX reached it (`window.console`): a stand-in window may have none. */
export const pageConsole = () => window.console;
