/**
 * The ads domain: `@chanlytics/channels/ads`. Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 */
export {
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
export { metaCampaignReadBackRequest, parseMetaCampaignHeld, parseMetaMadeId, parseMetaRefusal } from "./meta-made";
export type { MetaAdHeld, MetaAdSetHeld, MetaCampaignHeld, MetaRefusal } from "./meta-made";
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
