/**
 * People › Pipeline (0008), as the scope's page reads it: the rows People already holds, grouped by where each deal
 * stands, what a card dropped in another column asks for, what the peek says of a row, and every word the scope says. The
 * page composes them; it decides nothing (pipeline/pipe.ts imports them). They were once published on `window.__pipeline`
 * for the pages that read them there; the last of those moved to TSX, and the name was taken down (O4b).
 */
import {
  pipelineOf,
  pipelineMove,
  pipelinePeekOf,
  pipelineRail,
  pipelineRoute,
  parsePipelineRoute,
  pipelineViewLabel,
  pipelineSorted,
  pipelinePassMany,
  pipelinePassDone,
  pipelinePeekDetail,
  pipelineSheetOf,
  pipelineBoardMore,
  pipelinePersonOf,
  pipelineRowId,
  pipelineRowNow,
  PIPELINE_BOARD_CAP,
  PIPELINE_WORDS,
} from "@chanlytics/contracts";

export const pipelineHelpers = () => ({
  of: pipelineOf,
  move: pipelineMove,
  peek: pipelinePeekOf,
  // Its own rail, and its address (clients/pipeline:v-<view>:p-<person>): the shell and the page read one spelling.
  rail: pipelineRail,
  route: pipelineRoute,
  parse: parsePipelineRoute,
  // The person a row id names (0029: a further deal of theirs is a row of its own, `<person>_<deal>`).
  personOf: pipelinePersonOf,
  // A row's id from its person and deal, and the row that now holds what an id named (pipelineRowNow).
  rowId: pipelineRowId,
  rowNow: pipelineRowNow,
  viewLabel: pipelineViewLabel,
  // The row carries the deal: its order by the member's heading, a selection's pass and what it came to, what the
  // peek says once the person is read, and how many cards a board column shows.
  sorted: pipelineSorted,
  passMany: pipelinePassMany,
  passDone: pipelinePassDone,
  detail: pipelinePeekDetail,
  // The row's own deal as its sheet says it: its steps, where it stands, its acts and their other deals.
  sheet: pipelineSheetOf,
  boardCap: PIPELINE_BOARD_CAP,
  boardMore: pipelineBoardMore,
  words: PIPELINE_WORDS,
});
