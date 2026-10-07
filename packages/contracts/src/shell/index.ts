/**
 * The dashboard's chrome: its words and hotkeys, the tone vocabulary, a refusal in the owner's words, who is signed
 * in, and how fast its pages are.
 */
export { refusalOf, roleGate, waitWords, NEEDS_TITLE, PERM_DOING } from "./refusal";
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
  LOOK_OPTIONS,
  isLookPref,
  DEFAULT_LOOK_PREF,
  lookPrefOf,
  LOOK_OFFERED,
  DEVICE_PREFS_STORAGE,
  THEME_COLORS,
  THEME_INK,
  THEME_COLOR_META,
  IN_APP_UA_RE,
  IN_APP_CLASS,
  APP_KEYS_RESIZE_CLASS,
  PREFETCH_SLOT,
  PREFETCH_READS,
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
  LookPref,
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
export { routeOfPath, routeOfHash, routeOfAddress, movedAddress, workspacePath, doorOf, ROUTE_WORDS } from "./address";
export type { AddressParts } from "./address";
export {
  CAMPAIGN_ROOMS,
  PLAYBOOK_DELETE_WORDS,
  NO_TEMPLATE_WORDS,
  noMessageWords,
  LIBRARY_WORDS,
  LIBRARY_STARTER_WORDS,
  OFFERS_IN_WRITING_WORDS,
} from "./campaign-rooms";
export type { NoMessageWords } from "./campaign-rooms";
export { stateTone, stateLabel, stateOf, leadPinTone, leadMapLegend, TONES } from "./tone";
export type { Tone, StateKind, LeadPinnable } from "./tone";
export {
  PAGE_VITALS,
  PAGE_VITAL_BANDS,
  PAGE_VITAL_WORDS,
  PAGE_VITALS_READ,
  PAGE_VITALS_MIN_LOADS,
  PageVitalReport,
  vitalsPageOf,
  vitalValueWords,
  vitalVerdict,
  pageVitalsWords,
} from "./vitals";
export { PageVitalsInput } from "./vitals-schema";
export type {
  PageVital,
  PageVitalsRowDto,
  PageVitalVerdict,
  PageVitalLineVM,
  PageVitalsPageVM,
  PageVitalsVM,
} from "./vitals";
export type { PageVitalsInputDto } from "./vitals-schema";
export { CLIENT_ERROR_BOUNDARIES, CLIENT_ERROR_LIMITS, clientErrorOf } from "./client-error";
export { ClientErrorInput } from "./client-error-schema";
export type { ClientErrorBoundary } from "./client-error";
export type { ClientErrorInputDto } from "./client-error-schema";
