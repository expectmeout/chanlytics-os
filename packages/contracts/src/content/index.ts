/**
 * Content: what a business's Instagram account lets Chanlytics do once it is connected through Meta (decision 0117), and
 * a post on its way to a place (decision 0121), and a video made from its clips (decision 0122). Every public name, named: a new
 * export is a line here, never an export *.
 */
export {
  CONTENT_LIBRARY_ROUTE,
  CONTENT_ROUTE,
  CONTENT_VIEWS,
  contentPlaceOf,
  contentPreviewOf,
  contentRouteOf,
  isContentParam,
} from "./address";
export type { ContentList, ContentPlace, ContentView } from "./address";
export { OwnersFactSchema, PostAboutSchema } from "./approval-schemas";
export {
  APPROVAL_SUBJECTS,
  APPROVAL_VOID_WHYS,
  EMPTY_INTENT,
  goodUntilOf,
  intentDates,
  intentOfAbout,
  ownersFactsOf,
  pieceIntentOf,
  postAboutOf,
  RENDITION_SHAPES,
  renditionShapeOf,
  REVISION_CHANGES,
  REVISION_MADE_BY,
  rightsGapOf,
} from "./approvals";
export type {
  ApprovalVoidWhy,
  AsApproved,
  OwnersFact,
  PieceApprovalSnapshot,
  PieceIntent,
  PostAbout,
  RenditionShape,
  RevisionChange,
  RevisionMadeBy,
  RightsGap,
  SnapshotPlacement,
  SnapshotRendition,
} from "./approvals";
export { BRING_IN_WORDS, bringInOf, bringInSpec } from "./bring-in";
export type { BringIn, BringInRefusal } from "./bring-in";
export { CHECK_WORDS, CONTENT_CHECKS } from "./check-words";
export type { ContentCheck } from "./check-words";
export { GOES_WORDS, goesLinesOf, goesPillOf } from "./goes";
export type { GoesAct, GoesKnown, GoesLine, GoesTone } from "./goes";
export {
  CONTENT_IDEAS,
  contentIdeaAsk,
  contentIdeaFilesOf,
  contentIdeasFor,
  contentIdeasReady,
  reviewIdeaTitleOf,
} from "./ideas";
export type { ContentIdea, ContentIdeaFiles } from "./ideas";
export { META_LINE_OFF_WHY, META_LINE_WORDS, META_LINES, metaLinesOf } from "./lines";
export type { MetaLines } from "./lines";
export { CONTENT_TODAY_PIECES, CONTENT_TODAY_WORDS } from "./note";
export type { ContentTodayDto } from "./note";
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
  contentMarkOf,
  contentMarkSaid,
  contentMarkToneOf,
  contentMoving,
  contentPieceMarkOf,
  contentViewCountOf,
  contentViewDrawsLines,
  contentWakesAt,
  newestAtEachPlace,
  stopSuperseded,
} from "./page";
export type {
  ContentLineDto,
  ContentMadeDto,
  ContentMakingDto,
  ContentMark,
  ContentMarkTone,
  ContentPageDto,
  ContentTally,
} from "./page";
export { pieceStandsOf, pieceStillMoving, pieceWantsStills } from "./piece-card";
export type { PieceFollowedDto, PieceStands } from "./piece-card";
export { PIECE_CARD, PIECE_FRAME, PIECE_SIDE, pieceLineWidthOf, pieceWordsBoxOf } from "./piece-frame";
export type { PieceWordsBox } from "./piece-frame";
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
export {
  PERSON_ASK_WORDS,
  personInitialsOf,
  personSaidOf,
  personStandsOf,
  personToAskOf,
  PIECE_PEOPLE_WORDS,
} from "./piece-people";
export type { PersonStands, PersonYesDto, PiecePeopleDto, PiecePersonDto } from "./piece-people";
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
export { capabilityStands, PLACE_CAPABILITIES, placeTakes } from "./places";
export type {
  CapabilityProof,
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
} from "./places";
export { fileYesSpec } from "./post-spec";
export {
  HAND_LINK_MAX,
  INSTAGRAM_POST_KINDS,
  instagramKindsFor,
  ON_INSTAGRAM,
  POST_AHEAD_DAYS_MAX,
  POST_CAPTION_MAX,
  POST_HELD_WHYS,
  POST_KINDS,
  POST_ON_ITS_WAY,
  POST_PLACE_SAID,
  POST_PLACES,
  POST_PULLABLE,
  POST_SOON_MS,
  POST_STATUSES,
  POST_VIAS,
  postCaptionProblem,
  postPlaceTakenOf,
  postStandsSaid,
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
export { filePeopleSpec, personYesSpec } from "./rights-spec";
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
export {
  placementSaid,
  postCameDownAt,
  postComingDownOf,
  REMEDIATION_ACTS,
  REMEDIATION_OUTCOMES,
  REMEDIATION_TARGETS,
  TAKE_DOWN_UNCONFIRMED_MS,
  TAKE_DOWN_WORDS,
  takeDownSpec,
  takeDownWillOf,
} from "./take-down";
export type {
  PieceTakeDownDto,
  PostComingDown,
  RemediationAct,
  RemediationOutcome,
  RemediationTarget,
  TakeDownActionDto,
  TakeDownSettled,
  TakeDownWill,
} from "./take-down";
