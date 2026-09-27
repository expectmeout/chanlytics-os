/** The dashboard's chrome: its words and hotkeys, the tone vocabulary, a refusal in the owner's words, who is signed in. */
export { refusalOf, roleGate, NEEDS_TITLE, PERM_DOING } from "./refusal";
export type { RefusalInput, Refusal, RolePerm } from "./refusal";
export {
  personInitials,
  identityWords,
  memberWords,
  cleanDisplayName,
  providerNameOf,
  inviteState,
  ROLE_WORDS,
  DISPLAY_NAME_MAX,
} from "./identity";
export type { IdentityInput, IdentityWords } from "./identity";
export {
  nextThemePref,
  themeButtonWords,
  resolveTheme,
  themeColorOf,
  themeBootScript,
  inAppFrom,
  inAppBootScript,
  routePrefetchScript,
  workspaceHotkey,
  isTypingTarget,
  pageTitle,
  notFoundPageMetadata,
  shellStatusLine,
  shortcutGroups,
  toastShape,
  THEME_OPTIONS,
  isThemePref,
  DEFAULT_THEME_PREF,
  themePrefOf,
  DEVICE_PREFS_STORAGE,
  THEME_COLORS,
  THEME_COLOR_META,
  IN_APP_UA_RE,
  IN_APP_CLASS,
  PREFETCH_SLOT,
  isSidebarPref,
  SHORTCUTS,
  TOAST_TONES,
  TOAST_MS,
  TOAST_UNDO_MS,
  TOAST_MIN_MS,
  TOAST_ICONS,
} from "./chrome";
export type {
  ThemePref,
  Theme,
  InAppPlatform,
  InApp,
  SidebarPref,
  Crumb,
  PublicPageMetadata,
  ShellStatus,
  ShellStatusLine,
  Shortcut,
  ToastTone,
  ToastShape,
} from "./chrome";
export { stateTone, stateLabel, stateOf, leadPinTone, leadMapLegend, TONES } from "./tone";
export type { Tone, StateKind, LeadPinnable } from "./tone";
