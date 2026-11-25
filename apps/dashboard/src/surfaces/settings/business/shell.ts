/**
 * What the Business tab still asks of the shell (decision 0015, step 11).
 *
 * A TSX surface reads nothing off `window`, so each thing the tab reads that the bridge or the seam holds reaches it through
 * one function here, read when it is called: the seam's value, who.ts, or the bridge's store (provided.ts), where a test's
 * stand-in is the one read. Each is a line to delete on the day the tab imports what it reads; nothing here is new
 * behaviour.
 */
import type { PoliciesSurface } from "@/bridge/policy-store";
import { provided } from "@/bridge/provided";
import { whoIsLooking } from "@/bridge/who";
import { surfaceValue } from "../../surface-values";

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

export const workspacesNow = () => whoIsLooking().workspaces;
export const activeWorkspaceNow = () => whoIsLooking().activeWorkspaceId;
export const workspaceApi = () => provided("workspace");
/** A zone's words and this device's zone (identity.ts installIdentity, provided as `tz`): the tab's hours and its picker. */
export const tzApi = () => provided("tz");

/* ---------------------------------------------------------------- the calendar --------------------------------------------------------------- */

/** The Calendar's read, from its surface: undefined before it (a window mirror, `__CALENDAR`, until 12 Nov 2026). */
export const calendarNow = () => surfaceValue("calendar");
export const calendarApi = () => provided("calendar");

/* -------------------------------------------------------- the frame's status and words -------------------------------------------------------- */

export const surfaceFailedFn = () => provided("surfaceFailed");
export const chromeWords = () => provided("chrome");

/* -------------------------------------------- the save the bridge provides -------------------------------------------- */

export const saveSettingsFn = () => provided("saveSettings");
