/**
 * The ads domain: `@chanlytics/db/ads`. Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 */
export {
  connectAdAccount,
  findAdAccount,
  findAdAccountForPage,
  findLiveAdAccount,
  keepAdAccountRead,
  listAdAccountsOfPlatformUser,
  markAdAccountRevoked,
  mayRunAds,
  readAdSecret,
} from "./accounts";
export type { AdAccountReadKept, AdAccountRow, AdAccountToConnect, AdConnectOutcome } from "./accounts";
export { keepAdEntry, readAdNamed } from "./entries";
export type { AdEntryKept, AdNamed } from "./entries";
export { askAdRead, handOutAdReads, keepAdsRead, listHeldAdIds } from "./reads";
export type { AdDayReadRow, AdReadRow, AdsReadKept, AdsReadOutcome } from "./reads";
