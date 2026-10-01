/**
 * People › Pipeline (0008), as the scope's page reads it off window.__pipeline: the rows People already holds, grouped
 * by where each deal stands, what a card dropped in another column asks for, what the peek says of a row, and every
 * word the scope says. The page composes them; it decides nothing (pipeline-scope.jsx).
 *
 * One spelling, because three places hand the page these: seed-globals.ts in the app, the e2e harness's fixture over
 * its own record (tooling/scripts/e2e-harness), and the page's own test. A copy in each is a helper one of them lacks
 * the day the Pipeline gains one.
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
  pipelineBoardMore,
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
  viewLabel: pipelineViewLabel,
  // The row carries the deal: its order by the member's heading, a selection's pass and what it came to, what the
  // peek says once the person is read, and how many cards a board column shows.
  sorted: pipelineSorted,
  passMany: pipelinePassMany,
  passDone: pipelinePassDone,
  detail: pipelinePeekDetail,
  boardCap: PIPELINE_BOARD_CAP,
  boardMore: pipelineBoardMore,
  words: PIPELINE_WORDS,
});

export type PipelineHelpers = ReturnType<typeof pipelineHelpers>;
