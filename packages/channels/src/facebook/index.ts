/**
 * The facebook domain: `@chanlytics/channels/facebook`. Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 */
export {
  pagePostSentBy,
  pageRefusalLosesConnection,
  pageRefusalOf,
  parsePageIds,
  parsePageMade,
  parsePagePost,
  parsePagePosts,
  parsePageReel,
  parsePageStories,
  parsePageSuccess,
  parsePageToken,
} from "./answers";
export type { PagePost, PageReel, PageStory, ReelState } from "./answers";
export { linkedPageRequest, parseLinkedPage, postablePageIdsOf, readLinkedPage } from "./linked";
export {
  callFacebook,
  pageDeleteRequest,
  pagePhotoReadRequest,
  pagePhotoRequest,
  pagePostReadRequest,
  pagePostRequest,
  pagePostsRequest,
  pageReelFetchRequest,
  pageReelFinishRequest,
  pageReelStartRequest,
  pageReelsRequest,
  pageStoriesRequest,
  pageStoryRequest,
  pageTokenRequest,
  pageVideoStatusRequest,
} from "./page";
export type { FacebookAnswer, FacebookDeps, PageHand, PagePoster } from "./page";
