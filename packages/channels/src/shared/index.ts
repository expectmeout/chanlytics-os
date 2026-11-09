/**
 * What every repository stands on: `@chanlytics/channels/shared`. Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 */
export { answerObject, breakerOf, breakerStates, fetchFromProvider, resetBreakers } from "./provider-fetch";
export type { Provider, ProviderCall, ProviderReply, SendOutcome } from "./provider-fetch";
export { RESPONSE_MAX_BYTES } from "./public-fetch";
export {
  isPublicAddress,
  NotPublicError,
  publicFetch,
  publicFetcher,
  publicLookup,
  setPublicFetch,
} from "./public-fetch";
export type { PublicFetchDeps, Resolve, Resolved } from "./public-fetch";
