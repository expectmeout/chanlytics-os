/**
 * What the Business tab still asks of the shell (decision 0015, step 11).
 *
 * A TSX surface reads nothing off `window`, so each thing the tab reads that a page of the shell, the bridge or the seam
 * publishes reaches it through one function here, read when it is called: a test's stand-in, set on the window, is the
 * one read. Each is a line to delete on the day its owner gives the tab an import or a seam value instead; nothing here
 * is new behaviour.
 */
import type { PoliciesSurface } from "@/legacy-bridge/policy-store";
import type { SettingsRecord, SettingsSurface } from "@/legacy-bridge/surfaces/settings";
import type { CalendarSurface } from "../../calendar/surface";
import type { calendar } from "../../calendar/verbs";
import type { SetupSurface } from "../../setup/surface";

declare global {
  interface Window {
    /** The settings read's globals (legacy-bridge/surfaces/settings.ts writes them). */
    __SETTINGS?: SettingsRecord;
    __FACTS?: SettingsSurface["facts"];
    __POLICIES?: PoliciesSurface | null;
    /** Whether a page's read failed (surface-registry.ts installRouteGate). */
    __surfaceFailed?: (page: string, param?: string | null) => boolean;
    /** The calendar's read (the seam's mirror, calendar/surface.ts). */
    __CALENDAR?: CalendarSurface | null;
    /** Setup's read (the seam's mirror, setup/surface.ts). */
    __SETUP?: SetupSurface | null;
    /** The calendar's verbs, as calendar/verbs.ts installCalendar publishes them. */
    __calendar?: typeof calendar;
  }
}

/* ------------------------------------------------------------- the settings read ------------------------------------------------------------- */

export const settingsNow = () => window.__SETTINGS;
export const factsNow = () => window.__FACTS;
export const policiesNow = () => window.__POLICIES;
export const templatesAllNow = () => window.__TEMPLATES_ALL;
export const setupNow = () => window.__SETUP;

/* --------------------------------------------------------------- the workspace --------------------------------------------------------------- */

export const workspacesNow = () => window.__WORKSPACES;
export const activeWorkspaceNow = () => window.__ACTIVE_WORKSPACE;
export const workspaceApi = () => window.__workspace;
export const tzApi = () => window.__tz;

/* ---------------------------------------------------------------- the calendar --------------------------------------------------------------- */

export const calendarNow = () => window.__CALENDAR;
export const calendarApi = () => window.__calendar;

/* -------------------------------------------------------- the frame's status and words -------------------------------------------------------- */

export const surfaceFailedFn = () => window.__surfaceFailed;
export const chromeWords = () => window.__chrome;

/* ------------------------------------------- the save the bridge publishes ------------------------------------------- */

export const saveSettingsFn = () => window.__saveSettings;

/* ------------------------------------------------------------------ the log ------------------------------------------------------------------ */

/** The page's console, as the JSX reached it (`window.console`): a stand-in window may have none. */
export const pageConsole = () => window.console;
