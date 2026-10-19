/**
 * The dashboard's chrome: its words and hotkeys, the tone vocabulary, a refusal in the owner's words, who is signed
 * in, and how fast its pages are.
 */
export {
  refusalOf,
  roleGate,
  waitWords,
  NEEDS_TITLE,
  PERM_DOING,
  SESSION_ENDED,
  sessionEnded,
  combinedInto,
} from "./refusal";
export type { RefusalInput, Refusal, RolePerm } from "./refusal";
export {
  personInitials,
  identityWords,
  memberWords,
  cleanDisplayName,
  providerNameOf,
  invitationWords,
  joinedWords,
  youJoinedWords,
  TEAM_INVITE_DAYS,
  ROLE_WORDS,
  DISPLAY_NAME_MAX,
} from "./identity";
export type { IdentityInput, IdentityWords, InvitationsAcceptedDto, JoinedWorkspaceDto } from "./identity";
export {
  nextThemePref,
  themeButtonWords,
  resolveTheme,
  themeColorOf,
  themeBootScript,
  inAppFrom,
  inAppBootScript,
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
  isSidebarPref,
  SHORTCUTS,
  TOAST_TONES,
  TOAST_MS,
  TOAST_UNDO_MS,
  TOAST_MAX_MS,
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
export {
  routePrefetchScript,
  PREFETCH_SLOT,
  PREFETCH_READS,
  PREFETCH_BESIDE,
  PREFETCH_OPEN,
  openReads,
} from "./route-prefetch";
export {
  routeOfPath,
  routeOfHash,
  routeOfAddress,
  movedAddress,
  workspacePath,
  appLink,
  doorOf,
  canonicalRoute,
  ROUTE_WORDS,
  MESSAGES_ROUTE,
  isMessagesParam,
} from "./address";
export type { AddressParts } from "./address";
export {
  CAMPAIGN_ROOMS,
  NO_TEMPLATE_WORDS,
  LIBRARY_WORDS,
  NEW_MESSAGE_WORDS,
  LIBRARY_STARTER_WORDS,
  BROADCAST_WORDS,
  runStoppedWords,
  runApprovedTail,
  RUN_WAITING_WORDS,
  RUN_WAITING_SHORT,
  RUN_OPEN_WORDS,
  runStopDoorWords,
  RUN_UNNAMED_WORDS,
  runApproveWords,
  runsWaitingSentence,
  heldEmailsWords,
  runStopWords,
  OFFERS_IN_WRITING_WORDS,
} from "./campaign-rooms";
export type { NoMessageWords, RunStopWords } from "./campaign-rooms";
export { stateTone, stateLabel, stateOf, stateWordList, leadPinTone, leadMapLegend, TONES } from "./tone";
export type { Tone, StateKind, LeadPinnable } from "./tone";
export {
  PAGE_VITALS,
  PAGE_METRICS,
  PAGE_DEVICES,
  PAGE_PHONE_QUERY,
  PAGE_BUILD,
  PAGE_VITALS_PER_BEACON,
  PAGE_VITAL_BANDS,
  PAGE_VITAL_WORDS,
  PAGE_VITALS_READ,
  PAGE_VITALS_MIN_LOADS,
  PRIMARY_PART,
  PageVitalReport,
  vitalsPageOf,
  vitalValueWords,
  vitalVerdict,
  pageVitalsWords,
} from "./vitals";
export { PageVitalsInput } from "./vitals-schema";
export type {
  PageVital,
  PageSpeedMetric,
  PageMetric,
  PageDevice,
  PageVitalDetailDto,
  PageVitalReportDto,
  PageVitalsRowDto,
  PageVitalVerdict,
  PageVitalLineVM,
  PageVitalsPageVM,
  PageVitalsVM,
} from "./vitals";
export type { PageVitalsInputDto } from "./vitals-schema";
export { PAGE_SPEED_READ, PAGE_SPEED_MIN, pageSpeedWords } from "./page-speed";
export type {
  PageSpeedHow,
  PageSpeedRowDto,
  PageSpotRowDto,
  PageSpeedPageVM,
  PageSpeedPartVM,
  PageSpeedSpotVM,
  PageSpeedVM,
} from "./page-speed";
export { CLIENT_ERROR_BOUNDARIES, CLIENT_ERROR_LIMITS, clientErrorOf } from "./client-error";
export { ClientErrorInput } from "./client-error-schema";
export type { ClientErrorBoundary } from "./client-error";
export type { ClientErrorInputDto } from "./client-error-schema";
