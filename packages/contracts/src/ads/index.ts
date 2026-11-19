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
export { ADS_ACCOUNT_DOOR } from "./edge-doors";
export { minorPerUnit } from "./money";
export type { AdSaid } from "./said";
export { adAccountStateOf, adStateOf } from "./states";
