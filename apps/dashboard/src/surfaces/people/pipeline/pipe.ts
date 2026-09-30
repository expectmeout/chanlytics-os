/**
 * What every part of People › Pipeline reads: the Pipeline's words and rules as one object (pipeline-helpers.ts, which
 * seed-globals publishes as `window.__pipeline` for the pages that still read it). Made once, as the app publishes it
 * once.
 */
import type { PipelineGroupKey, PipelineRowVM } from "@chanlytics/contracts";
import { pipelineHelpers } from "../pipeline-helpers";

export const P = pipelineHelpers();

/**
 * Whether the shell has a deal sheet to open (`window.openDealSheet`, components/deal-sheet.jsx): the row menu lists the
 * deal's acts only where there is one, as it always did. The ask itself is legacy-verbs.ts `openDealSheet`.
 */
export function dealSheetOffered(): boolean {
  return typeof Reflect.get(window, "openDealSheet") === "function";
}

/** One group of the Pipeline as the table and the board draw it: its rows, and whether (and how) it folds. */
export interface PipelineSection {
  key: PipelineGroupKey;
  label: string;
  meta: string | null;
  rows: PipelineRowVM[];
  collapsed: boolean;
  onToggle: (() => void) | null;
  toggle: string | null;
}
