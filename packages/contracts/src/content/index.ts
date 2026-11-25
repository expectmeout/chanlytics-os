/**
 * Content: what a business's Instagram account lets Chanlytics do once it is connected through Meta (decision 0117), and
 * a post on its way to a place (decision 0121), and a video made from its clips (decision 0122). Every public name, named: a new
 * export is a line here, never an export *.
 */
export {
  CONTENT_LIBRARY_ROUTE,
  CONTENT_ROUTE,
  CONTENT_VIEWS,
  CONTENT_WEEK_ROUTE,
  contentPlaceOf,
  contentPlanOf,
  contentPreviewOf,
  contentRouteOf,
  isContentParam,
} from "./address";
export type { ContentList, ContentPlace, ContentView } from "./address";
export { BRING_IN_WORDS, bringInOf, bringInSpec } from "./bring-in";
export type { BringIn, BringInRefusal } from "./bring-in";
export { CONTENT_IDEAS, contentIdeaAsk, contentIdeaFilesOf, contentIdeasFor, contentIdeasReady } from "./ideas";
export type { ContentIdea, ContentIdeaFiles } from "./ideas";
export { META_LINE_OFF_WHY, META_LINE_WORDS, META_LINES, metaLinesOf } from "./lines";
export type { MetaLines } from "./lines";
export type { PieceCaption, PieceCue } from "./making/captions";
export { pieceCuesOf } from "./making/cues";
export { brandKitOf, lookSaidOf, neverSaidIn, siteKitOf } from "./making/kit";
export type { BrandKit } from "./making/kit";
export { HOUSE_LOUDNESS, RENDITION_RULES, renditionRefusalOf } from "./making/renditions";
export type { MediaMeasured, RenditionRefusal, RenditionRule, RenditionWhy } from "./making/renditions";
export { PLACE_SAFE_AREAS, unsafeBoxOf, wordBoxesOf } from "./making/safe-areas";
export type { SafeArea, WordBox } from "./making/safe-areas";
export { revisionChangesOf, shapesReachedOf } from "./making/versions";
export { CONTENT_TODAY_DOWN, CONTENT_TODAY_PIECES, CONTENT_TODAY_WORDS, contentDownOf } from "./note";
export type { ContentDownDto, ContentTodayDto } from "./note";
export {
  CONTENT_FAILED_DAYS,
  CONTENT_LINES_PAGE,
  CONTENT_MAKING_MAX,
  CONTENT_MAX,
  CONTENT_PAGE,
  CONTENT_STOPPED_MAX,
  CONTENT_WORDS,
  contentHeadOf,
  contentMakingSaid,
  contentViewCountOf,
  contentViewDrawsLines,
  contentWakesAt,
  stopSuperseded,
} from "./page";
export type { ContentLineDto, ContentMadeDto, ContentMakingDto, ContentPageDto, ContentTally } from "./page";
export { pieceStandsOf, pieceStillMoving, pieceWantsStills } from "./piece-card";
export type { PieceFollowedDto, PieceStands } from "./piece-card";
export { PIECE_CARD, PIECE_FRAME, PIECE_SIDE, pieceLineWidthOf, pieceWordsBoxOf } from "./piece-frame";
export type { PieceFace, PieceWordsBox } from "./piece-frame";
export {
  isPieceStep,
  PIECE_FAILS,
  PIECE_ROUNDS_MAX,
  PIECE_STAGES,
  PIECE_STATUSES,
  PIECE_TEMPLATE,
  pieceCompositionOf,
  pieceLookOf,
  pieceMachineOf,
  pieceRoundsOf,
  PIECES_MAKING_MAX,
} from "./piece-making";
export type { PieceFail, PieceLookKept, PieceMachine, PieceStage, PieceStatus, PieceStep } from "./piece-making";
export { pieceSpec } from "./piece-spec";
export { compilePiece, pieceWordsOnBlocks } from "./piece-timeline";
export type {
  PieceBlockDrawn,
  PieceCompiled,
  PieceLook,
  PieceMaterial,
  PieceRefused,
  PieceShotDrawn,
  PieceSource,
  PieceTimeline,
} from "./piece-timeline";
export { PIECE_WORDS, pieceWordsIn } from "./piece-words";
export type { PieceWords } from "./piece-words";
export {
  PIECE_LIMITS,
  PIECE_SHAPES,
  PIECE_WORDS_HOLDS,
  PIECE_WORDS_PLACES,
  pieceCountOf,
  pieceFileIdsOf,
  pieceOpeningOf,
  piecePlanOf,
} from "./pieces";
export type { PieceLanguage, PiecePlan, PieceShape, PieceWont, PieceWordsHold, PieceWordsPlace } from "./pieces";
export { OwnersFactSchema, PostAboutSchema } from "./placements/approval-schemas";
export {
  goodUntilOf,
  intentOfAbout,
  ownersFactsOf,
  pieceIntentOf,
  postAboutOf,
  renditionShapeOf,
} from "./placements/approvals";
export type {
  AsApproved,
  OwnersFact,
  PieceApprovalSnapshot,
  PieceIntent,
  PostAbout,
  RevisionChange,
  SnapshotPlacement,
  SnapshotRendition,
} from "./placements/approvals";
export { CONTENT_CHECK_WORDS, CONTENT_CHECKS } from "./placements/check-words";
export type { ContentCheck } from "./placements/check-words";
export {
  metaPageOf,
  ON_FACEBOOK,
  PAGE_POSTING_PERMISSIONS,
  pagePostableOf,
  placeSwitchedOn,
} from "./placements/facebook";
export type { FacebookRefusal, MetaPage } from "./placements/facebook";
export {
  contentMarkOf,
  contentMarkSaid,
  contentMarkToneOf,
  contentMoving,
  contentPieceMarkOf,
} from "./placements/piece-mark";
export type { ContentMark, ContentMarkTone } from "./placements/piece-mark";
export { capabilityStands, PLACE_CAPABILITIES, placeDeletes, placeTakes } from "./placements/places";
export type {
  CapabilityProof,
  CommentAnswerSent,
  ObservedPost,
  PlaceAdapter,
  PlaceAnswerKept,
  PlaceCapabilities,
  PlacedMedia,
  PlacementToSend,
  PlaceRefusal,
  Prepared,
  PreparedState,
  RemoteState,
  SendOutcome,
  SentPlacement,
  TakeDownAnswer,
} from "./placements/places";
export {
  APPROVAL_SUBJECTS,
  APPROVAL_VOID_WHYS,
  REMEDIATION_ACTS,
  REMEDIATION_OUTCOMES,
  REMEDIATION_TARGETS,
  RENDITION_SHAPES,
  REVISION_MADE_BY,
} from "./placements/sets";
export type {
  ApprovalVoidWhy,
  RemediationAct,
  RemediationOutcome,
  RemediationTarget,
  RenditionShape,
  RevisionMadeBy,
} from "./placements/sets";
export {
  leadOf,
  pieceStandingOf,
  placementIsOut,
  placementStandingOf,
  postNeverSeen,
  standingIsOut,
  standingOnItsWay,
  videoIsSavedOnly,
} from "./placements/standing";
export type { PieceLead, PlacementStanding, PlacementStands, PostStands } from "./placements/standing";
export { pieceStandsSaid } from "./placements/standing-said";
export type { StandsSaidKnown } from "./placements/standing-said";
export { STANDING_WORDS } from "./placements/standing-words";
export { storyRanItsDay } from "./placements/story-day";
export {
  placementSaid,
  postCameDownAt,
  postComingDownOf,
  TAKE_DOWN_BELL,
  TAKE_DOWN_WORDS,
} from "./placements/take-down";
export type { PieceTakeDownDto, PostComingDown, TakeDownActionDto, TakeDownSettled } from "./placements/take-down";
export { TAKE_DOWN_UNCONFIRMED_MS, takeDownUnconfirmedSaid } from "./placements/take-down-late";
export { takeDownSpec } from "./placements/take-down-spec";
export { takeDownWillOf } from "./placements/take-down-will";
export type { TakeDownWill } from "./placements/take-down-will";
export { CLAIM_TEXT_MAX, claimsStanding, offersOf, ownerClaimOf, statedFactsOf } from "./plan/claims";
export type { OwnerClaim } from "./plan/claims";
export {
  CALLS_A_WEEK_MADE,
  MAKING_CALLS_A_SECOND,
  RUNG_SUGGESTION_USE,
  rungSuggestionOf,
  SECONDS_A_WEEK_MADE,
  WEEK_MAKING_LEASE_S,
  WEEK_MAKING_QUEUE,
  weekGoesAtOf,
  WEEKS_MAKING_AT_ONCE,
} from "./plan/held-week";
export type { RungSuggestion, WeekApprovedRecord } from "./plan/held-week";
export { PATTERN_AT, PATTERN_DAYS, PATTERN_DIMENSIONS, PATTERN_EARLY_AT } from "./plan/patterns";
export type { ContentPattern, PatternDimension, PatternLevel, PostOutcome } from "./plan/patterns";
export {
  REVIEW_ASK_REST_DAYS,
  REVIEW_ASK_START,
  REVIEW_ASK_WORDS,
  reviewAskLineOf,
  reviewAskOf,
  reviewAskWordsOf,
} from "./plan/review-ask";
export type { ReviewAskDto, ReviewAskFacts, ReviewAskWhy } from "./plan/review-ask";
export {
  CLAIM_KINDS,
  CLAIM_SOURCES,
  CONTENT_GOALS,
  PLAN_ASKED_BY,
  PLAN_PLACES,
  PLAN_STATUSES,
  SLOT_STATES,
} from "./plan/sets";
export type {
  ClaimKind,
  ClaimSource,
  ContentGoal,
  OpportunityKind,
  PlanAskedBy,
  PlanPlace,
  PlanStatus,
  SlotState,
} from "./plan/sets";
export { cadenceSaid, contentLinesOf } from "./plan/settings-lines";
export type { ContentLineEdit, ContentLineView } from "./plan/settings-lines";
export {
  cadenceOf,
  creativesOf,
  FOOTAGE_ASKS_MOST,
  planWeekOf,
  SLOT_CAPTION_MAX,
  slotWordsOf,
  weekdayShortOf,
  weekSizeSaid,
} from "./plan/week";
export type {
  FootageAsk,
  Opportunity,
  PlanSlotDto,
  ScorePart,
  SlotHeldWhy,
  SlotScore,
  SlotWords,
  WeekPlanDto,
} from "./plan/week";
export { slotTimePassed, WEEK_MADE_AHEAD_MS, weekEndingOf, weekEndingSaid } from "./plan/week-endings";
export type { WeekEnding } from "./plan/week-endings";
export { WEEK_MADE_DOOR } from "./plan/week-made-door";
export type { WeekMadeBody } from "./plan/week-made-door";
export type { WeekGoalDto, WeekPageDto, WeekPieceDto } from "./plan/week-page";
export { slotWhenSaid, weekMoving, weekRowsOf, weekViewOf } from "./plan/week-view";
export type { WeekFix, WeekGroup, WeekMark, WeekRow, WeekState, WeekView } from "./plan/week-view";
export { WEEK_WORDS, weekDaysSaid } from "./plan/words";
export {
  HAND_LINK_MAX,
  INSTAGRAM_POST_KINDS,
  instagramKindsFor,
  linkPlaceSaid,
  ON_INSTAGRAM,
  POST_AHEAD_DAYS_MAX,
  POST_CAPTION_MAX,
  POST_HELD_WHYS,
  POST_KINDS,
  POST_PLACE_SAID,
  POST_PLACES,
  POST_PULLABLE,
  POST_SOON_MS,
  POST_STATUSES,
  POST_VIAS,
  postCaptionProblem,
  postPlaceTakenOf,
  postStoppedWhyOf,
  postWaitsForItsTime,
} from "./posts";
export type {
  HandPostDto,
  InstagramPostable,
  InstagramPostKind,
  PostDto,
  PostHeldWhy,
  PostKind,
  PostPlace,
  PostStatus,
} from "./posts";
export { postCaptionOf, postPublishOf, publishCardWords, publishSpec } from "./publish";
export type { PostPublish } from "./publish";
export { COMMENT_ANSWER_WORDS } from "./results/answer-words";
export { commentAddress, commentIdOf, COMMENTS_ROUTE, isCommentsParam } from "./results/comment-address";
export { COMMENT_DRAFT_CANNOT, commentAnswerPrompt, commentDraftOf } from "./results/comment-answer";
export type { CommentAnswerFacts, CommentToAnswer } from "./results/comment-answer";
export { COMMENT_POINT_WORDS, commentStageOf, commentWho } from "./results/comment-stage";
export type { CommentStage } from "./results/comment-stage";
export { CREDIT_WINDOW_DAYS, creditFor, creditOf, madeAtOf } from "./results/credit";
export type { Credit, CreditSubject, CreditTouch, CreditVisit } from "./results/credit";
export type { CommentAnswerDto, CommentRowDto, CommentsDto, ContentReportDto, ContentWeekDto } from "./results/dtos";
export { nextObserveStep, observeDueAt } from "./results/observe";
export type { Observation } from "./results/observe";
export { broughtChainOf, pieceResultLineOf, pieceResultsSaid, resultLineText } from "./results/piece-results";
export type {
  BroughtPersonDto,
  BroughtSaid,
  ChainOpens,
  ChainStep,
  PieceResultsDto,
  PieceResultsSaid,
  PostNumbersDto,
  ResultLinePart,
} from "./results/piece-results";
export { postChatLinkOf, postCodeIn } from "./results/post-code";
export type { PostChatPlaces } from "./results/post-code";
export {
  COMMENT_ANSWER_STATES,
  LINK_LANDS,
  LINK_SUBJECTS,
  METRIC_AVAILABILITY,
  OBSERVE_STEPS,
  POST_METRICS,
  TOUCH_KEPT_SUBJECTS,
  TOUCH_KINDS,
  TOUCH_SUBJECTS,
  VISIT_THROUGH_TYPES,
} from "./results/sets";
export type {
  CommentAnswerState,
  CreditClass,
  LinkLands,
  LinkSubject,
  MetricAvailability,
  ObserveStep,
  PostMetric,
  TouchKind,
  TouchSubjectType,
  VisitThroughType,
} from "./results/sets";
export { contentTotalsOf, contentWeekOf, contentWeekSaid } from "./results/totals";
export type { ContentTotals, CountedBooking, PostReach, VisitCounted } from "./results/totals";
export type { RecordedTouch, TouchHome } from "./results/touch";
export { CONTENT_SHEET_WORDS } from "./sheet-words";
export { CONTENT_SOURCE_WORDS, contentSourcesSaid } from "./sources";
export type {
  ContentFolder,
  ContentSourceDto,
  ContentSourceLine,
  ContentSourcePlace,
  ContentSourcesDto,
  ContentSourceSeen,
  ContentSourcesSaid,
  ContentSourcesState,
} from "./sources";
