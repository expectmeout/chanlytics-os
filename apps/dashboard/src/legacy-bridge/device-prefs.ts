/**
 * This device's preferences: the theme, the look, the sidebar's rail and the Inbox's density, kept in this browser
 * under one name (contracts DEVICE_PREFS_STORAGE) and read by the document's head before first paint (contracts
 * themeBootScript). They are the browser's, not the member's (settings.jsx), so no table, route or migration holds
 * them.
 *
 * Everything LegacyApp decides about them is here: the read, a press that changes one, and what the document wears.
 * LegacyApp holds the state and stamps the document; theme-boot.test.mjs runs this against the head's script for
 * everything a device could hold. Pure but for the storage it is handed, which it looks up inside its own try: where a
 * site's storage is blocked, the getter itself throws.
 */
import {
  resolveTheme,
  themePrefOf,
  lookPrefOf,
  isLookPref,
  isSidebarPref,
  DEFAULT_THEME_PREF,
  DEVICE_PREFS_STORAGE,
  type LookPref,
  type SidebarPref,
  type Theme,
  type ThemePref,
} from "@chanlytics/contracts";

export interface Prefs {
  theme: ThemePref;
  /**
   * The look this device chose, and none until it has. A device that never chose follows DEFAULT_LOOK_PREF wherever
   * the default goes (the interface kit's step 5.6 moves it to Glass), so a save of the theme or the rail must not
   * write today's default down as if it had been picked.
   */
  look?: LookPref;
  sidebar: SidebarPref;
  inboxDensity: "compact" | "medium" | "rich";
  showInboxAgentRail: boolean;
}

/** What the shell's chrome changes: the theme and the look from the account menu, the rail from ⌘B and its button. */
export type ChosenPref = "theme" | "look" | "sidebar";

/** Where the preferences are kept, looked up at each read and write: LegacyApp hands in the browser's. */
type PrefStorage = () => Pick<Storage, "getItem" | "setItem">;

const PREF_DEFAULTS: Prefs = {
  theme: DEFAULT_THEME_PREF,
  sidebar: "open",
  inboxDensity: "medium",
  showInboxAgentRail: false,
};

/** This device's preferences, with anything unknown or stale replaced by the default, and a look only as chosen. */
export function loadPrefs(storage: PrefStorage): Prefs {
  try {
    const stored = JSON.parse(storage().getItem(DEVICE_PREFS_STORAGE) || "{}") as Partial<Prefs>;
    const p = { ...PREF_DEFAULTS, ...stored };
    return {
      ...p,
      theme: themePrefOf(p.theme),
      look: isLookPref(p.look) ? p.look : undefined,
      sidebar: isSidebarPref(p.sidebar) ? p.sidebar : PREF_DEFAULTS.sidebar,
    };
  } catch {
    return PREF_DEFAULTS;
  }
}

/**
 * A press on one of the chrome's preferences, as the shell hands it back: checked, and the whole set written back
 * under the one name. An unknown theme or rail is the default, as it always was; an unknown look changes nothing, so
 * the only look a device ever keeps is one it chose.
 */
export function choosePref(storage: PrefStorage, prefs: Prefs, key: ChosenPref, raw: unknown): Prefs {
  if (key === "look") return isLookPref(raw) ? keepPrefs(storage, { ...prefs, look: raw }) : prefs;
  if (key === "theme") return keepPrefs(storage, { ...prefs, theme: themePrefOf(raw) });
  return keepPrefs(storage, { ...prefs, sidebar: isSidebarPref(raw) ? raw : PREF_DEFAULTS.sidebar });
}

/** The set written back whole. A look never chosen stays out of it: JSON leaves out a key whose value is undefined. */
function keepPrefs(storage: PrefStorage, next: Prefs): Prefs {
  try {
    storage().setItem(DEVICE_PREFS_STORAGE, JSON.stringify(next));
  } catch {
    /* private mode etc. — prefs just don't persist */
  }
  return next;
}

/**
 * What the document wears for these preferences: the theme resolved against the device's own setting, and the look
 * in force, which is the default until one is chosen. The head's script stamps the same two before first paint.
 */
export function documentStamps(prefs: Prefs, systemDark: boolean): { theme: Theme; look: LookPref } {
  return { theme: resolveTheme(prefs.theme, systemDark), look: lookPrefOf(prefs.look) };
}
