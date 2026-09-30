/**
 * People › Pipeline (docs/decisions/0008-a-proposal-is-part-of-the-deal.md), moved from legacy/pages/pipeline-scope.jsx
 * (decision 0015): People's rows by where their deal stands -- consultations, proposals out, clients, and those who
 * passed or ended -- under one line that says what is out and what it comes to. A view of People, never a page of its
 * own: People's switch, People's table in sections (table/table.tsx), People's person cell and phone card, the list
 * page's two hooks (hooks/use-controls.ts and hooks/use-place.ts: the width, the words in the box, the keys, the place
 * kept, the first rows), and the rows the People surface already holds, so nothing is fetched. Every word is contracts'
 * (pipeline.ts, pipeline-helpers.ts); the page composes them and decides nothing. Drawn only where deals are on:
 * anywhere else People's own page draws the address.
 *
 * A workspace, not only a list ("The Pipeline is a workspace", 0008):
 * - its own rail (contracts pipelineRail): its groups, what waits on the owner, and each service; on a phone the same
 *   rows behind the bar's list button, and the standing line's warn parts press to the same views;
 * - its address (contracts pipelineRoute: clients/pipeline:v-<view>:p-<person>), which the page follows, so a refresh
 *   keeps the view and the person open over it, Back closes the peek, and any page can link to a deal;
 * - a row opens its person's deal in a peek beside the rows (peek.tsx), with the card's own acts;
 * - on a desk the rows can be a board (board.tsx), whose drops ask the one sheet for the move; the choice is the
 *   member's saved view, with People's and Leads' (usePlControls extraDefaults);
 * - New proposal (new.tsx) picks or adds a person, then opens the one deal sheet;
 * - a teammate's move arrives on its own: the People surface repaints on the deals table.
 *
 * PipelineScope is its hooks (scope-hook.ts) and the elements it returns, one concern to a function (scope-screen.tsx).
 */
import { usePipelineState } from "./scope-hook";
import type { PipelineScopeProps } from "./scope-state";
import { pipelineScreen } from "./scope-screen";

export const PipelineScope = (props: PipelineScopeProps) => pipelineScreen(usePipelineState(props));
