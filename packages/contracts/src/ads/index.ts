/** Ads: an owner's own ad accounts and the ads they run (Campaigns › Ads), and the models and words their page draws. */
export {
  adRoute,
  ADS_ROUTE,
  ADS_SCOPE_ALL,
  ADS_WORDS,
  adsPreviewOf,
  adsResultsRoute,
  adsScopeKey,
  adsScopeOfKey,
  isAdsParam,
  newAdFromRoute,
  newAdRoute,
  parseAds,
} from "./address";
export type { AdsAddress, AdsScope, AdStart } from "./address";
export { aboutADayAfter, addDays, adWith, daysBetween, MINOR_PER_UNIT, patchRestarts, sameArea } from "./ads";
export type {
  AdAccountRead,
  AdAccountStatus,
  AdArea,
  AdBudget,
  AdCheck,
  AdCheckId,
  AdCopy,
  AdDay,
  AdDoor,
  AdMedia,
  AdNeeds,
  AdNeedsCode,
  AdPatch,
  AdPersonRead,
  AdPlatform,
  AdRead,
  AdSchedule,
  AdsConfig,
  AdShownAs,
  AdsRead,
  AdState,
  AdTheirs,
} from "./ads";
export { adModel } from "./drawer";
export type { AdDrawerVM, CalloutActId, CalloutVM, FootAct, ReachVM } from "./drawer";
export { areaOfValue, areaValueOf, editFootOf, editOf, raiseOf, zipIssue } from "./drawer-edit";
export type { AmountOption, AreaOption, EditFootVM, EditVM, EndOption, OwnAmount } from "./drawer-edit";
export { adBarsOf, adPeopleOf, adPreviewOf, quietOf, resultsOf } from "./drawer-parts";
export type {
  AdPersonRowVM,
  BarsVM,
  DayVM,
  JudgeVM,
  PeopleVM,
  PreviewVM,
  QuietVM,
  ResultsVM,
  TheirsRowVM,
  TheirsVM,
  ThreadVM,
  TypedVM,
} from "./drawer-parts";
export {
  ADS_DEFAULT_CURRENCY,
  currencySymbol,
  leftOfMoney,
  minorOfUnits,
  moneyOf,
  perDayOf,
  sumMoney,
  sumsOf,
} from "./money";
export type { MoneyItem } from "./money";
export { draftAd, newAdDefaults, newAdFrom, newAdModel, newestPostFor, starterCopy } from "./new-ad";
export type { AdDraft, NewAdVM, PresetVM } from "./new-ad";
export { adFollowOn } from "./new-ad-parts";
export type { CheckRowVM } from "./new-ad-parts";
export { adsModel, earlierCost } from "./page";
export type {
  AdRowVM,
  AdsGroupBy,
  AdsVM,
  AskApply,
  AskVM,
  CountedVM,
  FailedVM,
  GroupByVM,
  GroupGlyph,
  GroupVM,
  HeadVM,
} from "./page";
export { eachInTouch, noAdsOf, pageTotals, phoneOf, tilesOf, v0Of } from "./page-parts";
export type {
  AdWaitingRowVM,
  BlockedVM,
  ChooseVM,
  ComingRowVM,
  NoAdsVM,
  PageTotals,
  PhoneVM,
  TilesVM,
  V0VM,
} from "./page-parts";
export { adsFactOf, adsResultsOf } from "./results/results";
export type {
  AdsResultsVM,
  ResultsAt,
  ResultsDaysVM,
  ResultsDayVM,
  ResultsRowVM,
  ResultsScopeVM,
  ResultsStepVM,
  ResultsTheirsVM,
} from "./results/results";
export { RESULTS } from "./results/words-results";
export {
  ADS_ASK_MIN,
  ADS_ASK_MIN_CALLS,
  ADS_ASK_SOON_DAYS,
  ADS_CHANCE_Z,
  ADS_COPY_LIMITS,
  ADS_DAILY_CHOICES_MINOR,
  ADS_DEFAULT_MILES,
  ADS_DISPLAY_NAME_MAX,
  ADS_END_SHIFTS,
  ADS_EXTEND_MAX_DAYS,
  ADS_FRESH_DAYS,
  ADS_GROUP_FROM,
  ADS_MOVE_DAYS,
  ADS_MOVE_STEP_MINOR,
  ADS_OWN_DAYS,
  ADS_OWN_START_MINOR,
  ADS_PERMISSION_WARN_DAYS,
  ADS_SETTLE_DAYS,
  ADS_SOFT_NEEDS,
  ADS_SPECIAL_MILES,
  ADS_TOTAL_STEPS,
  ADS_WINDOW_DAYS,
  ADS_ZIP_DIGITS,
  BUDGET_RULES,
  countedDoor,
  DOOR_NEEDS,
  SCHEDULE_NEEDS_TOTAL,
  STANDING_CHECKS,
  TOO_EARLY_DAYS,
} from "./rules";
export type { BudgetRule } from "./rules";
export {
  accountRows,
  adAccountOf,
  adPersonWho,
  adQuotes,
  adServiceOf,
  adStateOf,
  areaWord,
  checkOk,
  costEach,
  countCtx,
  counted,
  DASH,
  dayOfIso,
  doorNeeds,
  endsWhenOf,
  firstMissing,
  firstReadyDoor,
  isConnected,
  leadOf,
  leftOfAd,
  needsSecond,
  PLATFORMS,
  platformsFor,
  quotesPrice,
  reachNoteOf,
  readTime,
  sentenceParts,
  settling,
  smallestPreset,
  started,
  sum,
  timeOf,
  totalOf,
  totalsOf,
  viewState,
} from "./vm-base";
export type {
  AdTone,
  CellVM,
  ChipId,
  DoorVM,
  FigureVM,
  SentenceInput,
  SentencePart,
  StandingVM,
  StandRowVM,
  StateVM,
  Totals,
} from "./vm-base";
export {
  adPersonInitials,
  ADS_DOORS,
  ADS_EXAMPLES,
  allWord,
  checkFix,
  checkWords,
  dayLines,
  dayShort,
  daysWord,
  dayWord,
  DOOR,
  DOOR_ORDER,
  EXAMPLE,
  GATE,
  peopleWord,
  PLATFORM_OWNER,
  PLATFORM_SURFACE,
  PLATFORM_WORD,
  REACH_NOTE,
  REFUSED,
  REVIEW_WITHIN,
  SENTENCE,
  SETTINGS_DOOR,
  STATE,
  STATE_WORD,
} from "./words";
export type { AdsExample, Glyph } from "./words";
export { CONNECT, connectModel } from "./words-connect";
export type { ConnectChoiceVM, ConnectRowVM, ReadyRowVM } from "./words-connect";
export { CHANGED, CHIPS, DRAWER, EDIT, LIST, NO_AD, PEOPLE_TAB, PREVIEW, SHOWN, ZIPS } from "./words-drawer";
export type { ReachSaid } from "./words-drawer";
export { BOOK_ONLINE, CHECKS, NEW_AD, ratingLine } from "./words-new";
export {
  ADS_READ,
  ASK,
  askWhy,
  CHOOSE,
  COUNTED,
  FIGURES,
  figureWords,
  GROUP,
  groupMeta,
  HEAD,
  LEDGER,
  NO_ADS,
  PHONE,
  platformMeta,
  STANDING,
  TILES,
  V0,
} from "./words-page";
export type { CountCtx } from "./words-page";
