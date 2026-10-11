/**
 * What the Ads page draws with that no other page does (11 Oct 2026): a page-only entry, `@chanlytics/contracts/ads-page`,
 * which only Campaigns › Ads imports. A value a page imports from the package root is in the route chunk every page loads,
 * so the Ads page's models and words would be paid for by every page; here they load with Ads and nowhere else. The
 * browser's generator leaves these modules out of its entry (PAGE_ONLY in tooling/scripts/gen/contracts-browser-entry.mjs)
 * while the barrel keeps naming them, so the server and the tests read them from the index as before.
 *
 * The data (`AdsRead`, `AdsConfig` and the types around them), the addresses and the day arithmetic are the root's: small,
 * and read by Reports, People and Campaigns' routes too. Everything else of Ads is here: the rules, the money, the words,
 * and the models of the page, an ad's drawer and New ad.
 */
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
  DOOR_NEEDS,
  SCHEDULE_NEEDS_TOTAL,
  STANDING_CHECKS,
  TOO_EARLY_DAYS,
  countedDoor,
} from "./rules";
export type { BudgetRule } from "./rules";
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
export {
  ADS_DOORS,
  ADS_EXAMPLES,
  DOOR,
  DOOR_ORDER,
  EXAMPLE,
  GATE,
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
  adPersonInitials,
  allWord,
  checkFix,
  checkWords,
  dayLines,
  dayShort,
  dayWord,
  daysWord,
  peopleWord,
} from "./words";
export type { AdsExample, Glyph } from "./words";
export {
  ASK,
  CHOOSE,
  COUNTED,
  FIGURES,
  GROUP,
  HEAD,
  LEDGER,
  NO_ADS,
  PHONE,
  READ,
  STANDING,
  TILES,
  V0,
  askWhy,
  figureWords,
  groupMeta,
  platformMeta,
} from "./words-page";
export type { CountCtx } from "./words-page";
export { CHANGED, CHIPS, DRAWER, EDIT, LIST, NO_AD, PEOPLE_TAB, PREVIEW, SHOWN, ZIPS } from "./words-drawer";
export type { ReachSaid } from "./words-drawer";
export { BOOK_ONLINE, CHECKS, NEW_AD, ratingLine } from "./words-new";
export { CONNECT, connectModel } from "./words-connect";
export type { ConnectChoiceVM, ConnectRowVM, ReadyRowVM } from "./words-connect";
export {
  DASH,
  PLATFORMS,
  adAccountOf,
  adPersonWho,
  adQuotes,
  adStateOf,
  areaWord,
  checkOk,
  costEach,
  countCtx,
  counted,
  dayOfIso,
  doorNeeds,
  endsWhenOf,
  firstMissing,
  firstReadyDoor,
  isConnected,
  leadOf,
  leftOfAd,
  needsSecond,
  accountRows,
  platformsFor,
  quotesPrice,
  reachNoteOf,
  readTime,
  sentenceParts,
  adServiceOf,
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
  StandRowVM,
  StandingVM,
  StateVM,
  Totals,
} from "./vm-base";
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
  BlockedVM,
  ChooseVM,
  ComingRowVM,
  NoAdsVM,
  PageTotals,
  PhoneVM,
  TilesVM,
  V0VM,
  AdWaitingRowVM,
} from "./page-parts";
export { adModel } from "./drawer";
export type { AdDrawerVM, CalloutActId, CalloutVM, FootAct, ReachVM } from "./drawer";
export { adBarsOf, adPeopleOf, adPreviewOf, quietOf, resultsOf } from "./drawer-parts";
export type {
  BarsVM,
  DayVM,
  JudgeVM,
  PeopleVM,
  AdPersonRowVM,
  PreviewVM,
  QuietVM,
  ResultsVM,
  TheirsRowVM,
  TheirsVM,
  ThreadVM,
  TypedVM,
} from "./drawer-parts";
export { areaOfValue, areaValueOf, editFootOf, editOf, raiseOf, zipIssue } from "./drawer-edit";
export type { AmountOption, AreaOption, EditFootVM, EditVM, EndOption, OwnAmount } from "./drawer-edit";
export { draftAd, newAdDefaults, newAdFrom, newAdModel, newestPostFor, starterCopy } from "./new-ad";
export type { AdDraft, NewAdVM, PresetVM } from "./new-ad";
export { adFollowOn } from "./new-ad-parts";
export type { CheckRowVM } from "./new-ad-parts";
export { adsFactOf, adsResultsOf } from "./results/results";
export type {
  AdsResultsVM,
  ResultsAt,
  ResultsDayVM,
  ResultsDaysVM,
  ResultsRowVM,
  ResultsScopeVM,
  ResultsStepVM,
  ResultsTheirsVM,
} from "./results/results";
export { RESULTS } from "./results/words-results";
