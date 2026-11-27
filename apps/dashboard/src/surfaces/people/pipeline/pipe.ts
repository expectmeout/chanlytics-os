/**
 * What every part of People › Pipeline reads: the Pipeline's words and rules as one object (pipeline-helpers.ts), made
 * once.
 */
import type { PipelineGroupKey, PipelineRowVM } from "@chanlytics/contracts";
import { provided } from "@/bridge/provided";
import { pipelineHelpers } from "../pipeline-helpers";

export const P = pipelineHelpers();

/**
 * Whether the shell has a deal sheet to open (People's, which its courier hands every page at boot): the row menu lists
 * the deal's acts only where there is one, as it always did. The ask itself is frame-verbs.ts `openDealSheet`.
 */
export function dealSheetOffered(): boolean {
  return !!provided("sheets");
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
