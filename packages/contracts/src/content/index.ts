/**
 * Content: what a business's Instagram account lets Chanlytics do once it is connected through Meta (decision 0117), and
 * a post on its way to a place (decision 0121), and a video made from its clips (decision 0122). Every public name, named: a new
 * export is a line here, never an export *.
 */
export { CONTENT_ROUTE, contentPreviewOf, isContentParam } from "./address";
export { META_LINE_OFF_WHY, META_LINE_WORDS, META_LINES, metaLinesOf } from "./lines";
export type { MetaLines } from "./lines";
export {
  CONTENT_FAILED_DAYS,
  CONTENT_MAKING_MAX,
  CONTENT_MAX,
  CONTENT_PAGE,
  CONTENT_WORDS,
  contentHeadOf,
  contentMakingSaid,
  contentMarkOf,
  contentMarkSaid,
  contentMoving,
} from "./page";
export type { ContentMadeDto, ContentMakingDto, ContentMark, ContentPageDto, ContentTally } from "./page";
export { pieceStandsOf, pieceStillMoving, pieceWantsStills } from "./piece-card";
export type { PieceFollowedDto, PieceStands } from "./piece-card";
export { PIECE_FRAME, pieceLineWidthOf, pieceWordsBoxOf } from "./piece-frame";
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
export { pieceSpec } from "./piece-spec";
export { compilePiece, pieceWordsOnCuts } from "./piece-timeline";
export type {
  PieceCompiled,
  PieceLook,
  PieceMaterial,
  PieceRefused,
  PieceSource,
  PieceTimeline,
} from "./piece-timeline";
export { PIECE_WORDS, pieceWordsIn } from "./piece-words";
export type { PieceWords } from "./piece-words";
export { PIECE_LIMITS, PIECE_SHAPES, PIECE_WORDS_HOLDS, PIECE_WORDS_PLACES, piecePlanOf } from "./pieces";
export type {
  PieceCut,
  PieceLanguage,
  PiecePlan,
  PieceShape,
  PieceWont,
  PieceWordsHold,
  PieceWordsPlace,
} from "./pieces";
export {
  INSTAGRAM_POST_KINDS,
  ON_INSTAGRAM,
  POST_AHEAD_DAYS_MAX,
  POST_CAPTION_MAX,
  POST_KINDS,
  POST_ON_ITS_WAY,
  POST_PLACES,
  POST_PULLABLE,
  POST_STATUSES,
  POST_VIAS,
  postCaptionProblem,
} from "./posts";
export type { InstagramPostable, InstagramPostKind, PostDto, PostKind, PostPlace, PostStatus } from "./posts";
