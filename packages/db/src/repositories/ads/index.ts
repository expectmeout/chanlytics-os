/**
 * The ads domain: `@chanlytics/db/ads`. Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 */
export {
  connectAdAccount,
  disconnectAdAccount,
  dropAdSecret,
  findAdAccount,
  findAdAccountForPage,
  findLiveAdAccount,
  keepAdAccountRead,
  listAdAccountsOfPlatformUser,
  markAdAccountRevoked,
  mayRunAds,
  readAdSecret,
} from "./accounts";
export type { AdAccountReadKept, AdAccountRow, AdAccountToConnect, AdConnectOutcome, AdDisconnected } from "./accounts";
export { keepAdChange, listAdChanges, markAdChangeTold } from "./changes";
export type { AdChangeKept, AdChangeRow } from "./changes";
export { endAdDraftWriting, findAdDraft, keepAdDraft, keepAdMost, markAdDraftWriting } from "./drafts";
export type { AdDraftKept, AdDraftRow, AdDraftWriter, AdDraftWriting } from "./drafts";
export { keepAdEntry, readAdNamed, readAdSaid } from "./entries";
export type { AdEntryKept, AdNamed } from "./entries";
export { keepAdLaunch, keepTurnOn, listAdLaunches, listAdsLeftParts, listAdsMadeHere } from "./launches";
export type { AdLaunchAfter, AdLaunchRow, AdLaunchStep, AdMadeHereRow, AdPartKept, AdTurnOnKept } from "./launches";
export { findAd, listAdPeople, listAdsByIds, listAdsOfAccount, readAdsPageCounts } from "./page";
export type { AdPersonRow, AdRow, AdsPageCounts } from "./page";
export {
  adSwitchIdOf,
  askAdTell,
  findAdSwitchId,
  listMadeAds,
  listPendingAds,
  markAdTold,
  pauseAdsKept,
  setAdIntent,
} from "./presses";
export type { AdIntent, AdMadeRow, AdPendingRow, AdPressKept } from "./presses";
export { askAdRead, handOutAdReads, keepAdsRead, listHeldAdIds } from "./reads";
export type { AdDayReadRow, AdReadRow, AdsReadKept, AdsReadOutcome } from "./reads";
