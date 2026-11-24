/** Ads: an owner's own ad accounts and the ads they run (Campaigns › Ads), and the models and words their page draws. */
export { AD_ACCOUNT_STANDINGS, AD_CARD_CHECKS, adCardChecksOf, adStandingOf, metaAdConfigOf } from "./account";
export type {
  AdAccountCard,
  AdAccountChoice,
  AdAccountDto,
  AdAccountStanding,
  AdCardCheckId,
  AdStanding,
  MetaAdConfig,
} from "./account";
export {
  adRoute,
  ADS_ROUTE,
  ADS_WORDS,
  adsScopeKey,
  adsScopeOfKey,
  isAdsParam,
  newAdFromRoute,
  newAdRoute,
  parseAds,
} from "./address";
export type { AdsAddress, AdsScope, AdStart } from "./address";
export { addDays, daysBetween } from "./ads";
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
  AdFilePick,
  AdMedia,
  AdNeeds,
  AdNeedsCode,
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
export { bookedAfterTouch } from "./booked-after-touch";
export {
  adAmountAfter,
  adApprovedMiles,
  adChangeFactsOf,
  adChangeIssue,
  adChangeLeast,
  adChangeMostOf,
  adChangeOnWayOf,
  adChangeSpendsMore,
} from "./change";
export type { AdChangeAsk, AdChangeFacts, AdChangeIssue, AdChangeOnWay, AdChangeWhat } from "./change";
export {
  AD_BEFORE_AFTER,
  AD_BOOKED_TO_FORECAST,
  AD_MILES,
  AD_RUN_DAYS,
  adAmountIssue,
  adDraftOf,
  adEndIssue,
  adLeastTotal,
  adMostOf,
  adPictureIssue,
  adRightsOf,
  adSpecialKinds,
} from "./draft";
export type {
  AdAmountIssue,
  AdDraftInputs,
  AdDraftMissing,
  AdDraftParts,
  AdPicture,
  AdPictureIssue,
  AdServiceFacts,
  AdSpecialKind,
} from "./draft";
export {
  AD_PAUSE_ALL_MAX,
  ADS_ACCOUNT_DOOR,
  ADS_CHECK_DOOR,
  ADS_PRESS_DOOR,
  ADS_PREVIEW_DOOR,
  ADS_TURN_ON_DOOR,
} from "./edge-doors";
export {
  AD_DOORS_COUNTED,
  AD_STATE_WORDS,
  AD_WARN_STATES,
  adLeftOn,
  adPictureFileOf,
  adResumeRule,
  adStateOfRow,
  adWayClosedOf,
} from "./live";
export type {
  AdBudgetLive,
  AdLaunchLive,
  AdLiveDto,
  AdMadeFromLive,
  AdMadeHereLive,
  AdNeedsLive,
  AdOpens,
  AdPartLeft,
  AdPausedBy,
  AdPeopleLiveDto,
  AdPersonLiveDto,
  AdResume,
  AdsLiveDto,
  AdStopped,
  AdWayClosed,
  PieceAdUseDto,
} from "./live";
export { minorPerUnit } from "./money";
export { pieceAdBroughtOf, pieceAdLineOf } from "./on-piece";
export type { PieceAdDto, PieceAdLine, PieceAdTone } from "./on-piece";
export { AD_TOLD_MAX } from "./said";
export type { AdSaid } from "./said";
export { adAccountStateOf, adStateOf } from "./states";
export type { Touch } from "./touch";
export { AD_WAY_IN_SAID, adWayInOf, adWayInRowOf } from "./way-in";
export type { AdWayIn, AdWayInFacts } from "./way-in";
