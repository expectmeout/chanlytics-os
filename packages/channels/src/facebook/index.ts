/**
 * The facebook domain: `@chanlytics/channels/facebook`. Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 */
export {
  pagePostSentBy,
  pageRefusalLosesConnection,
  pageRefusalOf,
  parsePageIds,
  parsePageListedPage,
  parsePageMade,
  parsePagePost,
  parsePagePosts,
  parsePageReel,
  parsePageStories,
  parsePageSuccess,
  parsePageToken,
} from "./answers";
export type { PageListedPage, PagePost, PageReel, PageStory, ReelState } from "./answers";
export { postablePageIdsOf, readLinkedPage } from "./linked";
export {
  callFacebook,
  pageDeleteRequest,
  pagePhotoReadRequest,
  pagePhotoRequest,
  pagePostReadRequest,
  pagePostRequest,
  pagePostsRequest,
  pagePostsSinceRequest,
  pageReelFetchRequest,
  pageReelFinishRequest,
  pageReelsRequest,
  pageReelStartRequest,
  pageStoriesRequest,
  pageStoryRequest,
  pageTokenRequest,
  pageVideoStatusRequest,
} from "./page";
export type { FacebookAnswer, FacebookDeps, PageHand, PagePoster } from "./page";
