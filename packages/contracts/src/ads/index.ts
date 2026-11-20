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
export { aboutADayAfter, addDays, adWith, daysBetween, patchRestarts, sameArea } from "./ads";
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
export { bookedAfterTouch } from "./booked-after-touch";
export {
  AD_BEFORE_AFTER,
  AD_BOOKED_TO_FORECAST,
  AD_MILES,
  AD_RUN_DAYS,
  adAmountIssue,
  adDraftOf,
  adEndIssue,
  adLeastTotal,
  adPictureIssue,
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
export { ADS_ACCOUNT_DOOR, ADS_PRESS_DOOR } from "./edge-doors";
export { AD_DOORS_COUNTED, adLeftOn, adResumeRule, adStateOfRow } from "./live";
export type {
  AdBudgetLive,
  AdLiveDto,
  AdNeedsLive,
  AdOpens,
  AdPeopleLiveDto,
  AdPersonLiveDto,
  AdResume,
  AdsLiveDto,
} from "./live";
export { minorPerUnit } from "./money";
export { AD_TOLD_MAX } from "./said";
export type { AdSaid } from "./said";
export { adAccountStateOf, adStateOf } from "./states";
