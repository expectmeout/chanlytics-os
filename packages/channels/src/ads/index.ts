/**
 * The ads domain: `@chanlytics/channels/ads`. Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 */
export {
  isMetaId,
  metaAccountId,
  metaAdAccountRequest,
  metaAssignedAdAccountsRequest,
  metaAssignedPagesRequest,
  metaPageRequest,
  metaPromotedPagesRequest,
  metaReachOf,
  parseMetaAdAccount,
  parseMetaAssignedAdAccounts,
  parseMetaPage,
  parseMetaPageIds,
  parseMetaTokenUser,
} from "./meta-account";
export type { MetaAdAccount, MetaPage } from "./meta-account";
export { callMetaAds, metaConfirmed } from "./meta-call";
export type { MetaAdsAnswer, MetaAdsDeps, MetaAdsFault, MetaUsage } from "./meta-call";
export { metaAdStandingRequest, metaAdSwitchRequest, parseMetaAdStanding } from "./meta-change";
export {
  metaAccountInstagramRequest,
  metaAdImageRemoveRequest,
  metaAdImageRequest,
  metaMinimumBudgetsRequest,
  parseMetaAccountInstagram,
  parseMetaImageHash,
  parseMetaLeastADay,
} from "./meta-library";
export {
  metaAdReadBackRequest,
  metaCampaignReadBackRequest,
  metaCampaignRemoveRequest,
  metaCreativeRemoveRequest,
  metaFoundByNameRequest,
  parseMetaAdHeld,
  parseMetaCampaignHeld,
  parseMetaFoundByName,
  parseMetaMadeId,
  parseMetaRefusal,
  parseMetaRemoved,
} from "./meta-made";
export type { MetaAdHeld, MetaAdSetHeld, MetaCampaignHeld, MetaPartEdge, MetaRefusal } from "./meta-made";
export {
  META_MILES,
  META_OWN_CHANGES,
  metaAdRequest,
  metaAdSetRequest,
  metaCampaignRequest,
  metaCreativeRequest,
  metaCreativeSpec,
} from "./meta-make";
export type {
  MetaAdAsk,
  MetaAdSetAsk,
  MetaAreaCentre,
  MetaCampaignAsk,
  MetaCreativeAsk,
  MetaCreativePicture,
  MetaMakeHow,
} from "./meta-make";
export { META_CITY_MILES, metaAreaSent, metaPlacesRequest, parseMetaPlaces } from "./meta-place";
export type { MetaPlace, MetaPlaceKind } from "./meta-place";
export {
  META_ADS_PAGE,
  META_DAYS_PAGE,
  META_IDS_MAX,
  metaAdDaysRequest,
  metaAdsByIdRequest,
  metaAdsRequest,
  metaSubscribeNoticesRequest,
  parseMetaAdDays,
  parseMetaAds,
  parseMetaAdsById,
  parseMetaAdsNotice,
} from "./meta-read";
export type { MetaAd, MetaAdBudget, MetaAdDay, MetaAdsNotice } from "./meta-read";
export { readMetaSignedRequest } from "./meta-signed";
export type { MetaSignedRequest } from "./meta-signed";
