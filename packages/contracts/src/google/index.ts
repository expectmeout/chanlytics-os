/** A business on Google: its listing, the receptionist under its reviews, and the booking page its website names. */
export { googleAudienceWords } from "./audience";
export {
  BOOKING_PLATFORM_HOSTS,
  BOOKING_PLATFORM_TOOLS,
  bookingPageOf,
  bookingToolOfLink,
  onDomain,
} from "./booking-page";
export { GOOGLE_DOOR } from "./edge-doors";
export { gainedOver, reviewIsNew, reviewNoticeIsAbout, reviewSnippet, toGoogleReviewVM, toGoogleVM } from "./google";
export type { GoogleGainedPointVM, GoogleReviewVM, GoogleVM } from "./google";
export {
  bookingPageOffered,
  checkedWords,
  connectionWords,
  GOOGLE_SHOWN_REVIEWS,
  hoursFromGoogle,
  listingFactsOf,
  listingLine,
  NEW_REVIEW_NEWS,
  placesQueryOf,
  ratingWords,
  REVIEW_NEWS_MAX_AGE_MS,
  REVIEW_NEWS_MS,
  reviewsWords,
  starsOf,
} from "./listing";
export type {
  GoogleAudience,
  GoogleCandidateDto,
  GoogleConnectionDto,
  GoogleDayDto,
  GoogleDto,
  GoogleListingDto,
  GoogleListingFacts,
  GoogleLocationDto,
  GooglePeriod,
  GooglePoint,
  GoogleReadDto,
  GoogleReviewDto,
  SetupGoogleFacts,
} from "./listing";
export {
  autoReplyBell,
  autoReplyCandidates,
  autoReplyHold,
  cleanDraft,
  heldReviewReplyOf,
  REVIEW_AUTO_REPLIES_PER_SYNC,
  REVIEW_AUTO_REPLY_MAX_AGE_MS,
  REVIEW_HOLD_MS,
  REVIEW_REPLY_HELD_TITLE,
  REVIEW_REPLY_MAX_CHARS,
  REVIEW_REPLY_MAX_WORDS,
  reviewDraftsBell,
  reviewHeldReplyWords,
  reviewHeldWords,
  reviewReplyModeOf,
  reviewReplyPrompt,
  reviewReplyWords,
} from "./review-reply";
export type { HeldReviewReply } from "./review-reply";
export type { ReviewOnRecord, ReviewReplyFacts, ReviewReplyMode, ReviewToAnswer } from "./review-reply";
