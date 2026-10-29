/**
 * The dashboard's chrome: its words and hotkeys, the tone vocabulary, a refusal in the owner's words, who is signed
 * in, and how fast its pages are.
 */
export {
  appLink,
  canonicalRoute,
  isMessagesParam,
  MESSAGES_ROUTE,
  movedAddress,
  retiredRouteOf,
  ROUTE_WORDS,
  routeOfAddress,
  routeOfHash,
  routeOfPath,
  workspacePath,
} from "./address";
export type { AddressParts } from "./address";
export {
  BROADCAST_WORDS,
  CAMPAIGN_ROOMS,
  heldEmailsWords,
  LIBRARY_STARTER_WORDS,
  LIBRARY_WORDS,
  NEW_MESSAGE_WORDS,
  OFFERS_IN_WRITING_WORDS,
  RUN_OPEN_WORDS,
  RUN_UNNAMED_WORDS,
  RUN_WAITING_SHORT,
  RUN_WAITING_WORDS,
  runApprovedTail,
  runApproveWords,
  runStopDoorWords,
  runStoppedWords,
  runStopWords,
  runsWaitingSentence,
  WHO_GETS_IT_WORDS,
} from "./campaign-rooms";
export type { RunStopWords } from "./campaign-rooms";
export {
  APP_KEYS_RESIZE_CLASS,
  DEFAULT_LOOK_PREF,
  DEFAULT_SIDEBAR_PREF,
  DEFAULT_THEME_PREF,
  DEVICE_PREFS_STORAGE,
  IN_APP_CLASS,
  IN_APP_UA_RE,
  inAppBootScript,
  inAppFrom,
  isLookPref,
  isSidebarPref,
  isThemePref,
  isTypingTarget,
  LOOK_OFFERED,
  LOOK_OPTIONS,
  lookPrefOf,
  nextThemePref,
  notFoundPageMetadata,
  outlineBootScript,
  pageTitle,
  resolveTheme,
  shellStatusLine,
  shortcutGroups,
  SHORTCUTS,
  THEME_COLOR_META,
  THEME_COLORS,
  THEME_INK,
  THEME_OPTIONS,
  themeBootScript,
  themeButtonWords,
  themeColorOf,
  themePrefOf,
  TOAST_ICONS,
  TOAST_MAX_MS,
  TOAST_MIN_MS,
  TOAST_MS,
  TOAST_TONES,
  TOAST_UNDO_MS,
  toastShape,
} from "./chrome";
export type {
  Crumb,
  InApp,
  InAppPlatform,
  LookPref,
  PublicPageMetadata,
  ShellStatus,
  ShellStatusLine,
  Shortcut,
  SidebarPref,
  Theme,
  ThemePref,
  ToastShape,
  ToastTone,
} from "./chrome";
export { CLIENT_ERROR_BOUNDARIES, CLIENT_ERROR_LIMITS, clientErrorOf, errorIdOf } from "./client-error";
export type { ClientErrorBoundary } from "./client-error";
export { ClientErrorInput } from "./client-error-schema";
export type { ClientErrorInputDto } from "./client-error-schema";
export {
  cleanDisplayName,
  DISPLAY_NAME_MAX,
  identityWords,
  invitationWords,
  joinedWords,
  memberWords,
  personInitials,
  providerNameOf,
  ROLE_WORDS,
  TEAM_INVITE_DAYS,
  youJoinedWords,
} from "./identity";
export type { IdentityInput, IdentityWords, InvitationsAcceptedDto, JoinedWorkspaceDto } from "./identity";
export { PAGE_SPEED_MIN, PAGE_SPEED_READ, pageSpeedWords } from "./page-speed";
export type {
  PageSpeedHow,
  PageSpeedPageVM,
  PageSpeedPartVM,
  PageSpeedRowDto,
  PageSpeedSpotVM,
  PageSpeedVM,
  PageSpotRowDto,
} from "./page-speed";
export {
  combinedInto,
  NEEDS_TITLE,
  PERM_DOING,
  refusalOf,
  roleGate,
  SESSION_ENDED,
  sessionEnded,
  waitWords,
} from "./refusal";
export type { Refusal, RefusalInput, RolePerm } from "./refusal";
export {
  REPORT_KIND_WORDS,
  REPORT_KINDS,
  REPORT_LIMITS,
  REPORT_WORDS,
  reportKindOf,
  reportProblemOf,
} from "./report-problem";
export type { ReportedError, ReportKind } from "./report-problem";
export { ReportProblemInput } from "./report-problem-schema";
export type { ReportProblemInputDto } from "./report-problem-schema";
export {
  openReads,
  PREFETCH_BESIDE,
  PREFETCH_OPEN,
  PREFETCH_READS,
  PREFETCH_SLOT,
  routePrefetchScript,
} from "./route-prefetch";
export { SEE_PARAM, SEE_WORDS, seeHomeOf, seeRefOf, seeRefOfRoute, seeValueOf } from "./see-over";
export type { SeeRef } from "./see-over";
export { leadMapLegend, leadPinTone, stateLabel, stateOf, stateTone, stateWordList, TONES } from "./tone";
export type { LeadPinnable, StateKind, Tone } from "./tone";
export {
  PAGE_BUILD,
  PAGE_VITAL_BANDS,
  PAGE_VITAL_WORDS,
  PAGE_VITALS_MIN_LOADS,
  PAGE_VITALS_READ,
  PageVitalReport,
  pageVitalsWords,
  vitalValueWords,
  vitalVerdict,
} from "./vitals";
export type {
  PageVitalDetailDto,
  PageVitalLineVM,
  PageVitalReportDto,
  PageVitalsPageVM,
  PageVitalsRowDto,
  PageVitalsVM,
  PageVitalVerdict,
} from "./vitals";
export {
  PAGE_DEVICES,
  PAGE_METRICS,
  PAGE_PHONE_QUERY,
  PAGE_VITALS,
  PAGE_VITALS_PER_BEACON,
  PRIMARY_PART,
  vitalsPageOf,
} from "./vitals-pages";
export type { PageDevice, PageMetric, PageSpeedMetric, PageVital } from "./vitals-pages";
export { PageVitalsInput } from "./vitals-schema";
export type { PageVitalsInputDto } from "./vitals-schema";
