/**
 * Reach-outs on Playbooks and Templates (Reach out, Part 4 PR 8): the reach-outs surface (`__REACH_OUTS`, the chains
 * GET reach-outs lists, without their reports), and `window.__reachOuts`, the verbs a chain's row presses and (`.words`)
 * every sentence the rows say (contracts reach-out-sheet.ts).
 *
 * A chain's report is read when one of its rows opens (R23), here, and only then. Pause and Resume are the playbook's
 * own door on the chain's first step, which a chain's steps follow (run-context: a paused root pauses every step);
 * Remove is the chain's own door, which the database allows only before its first email goes (R16). Every write goes
 * through the typed client, and the refresh map reads the surfaces again behind it.
 */
import {
  REACH_OUT_ROW_WORDS,
  REACH_OUT_SHEET_WORDS,
  chainHintOf,
  chainPaceOf,
  chainPathWords,
  chainReportWordsOf,
  EMAIL_TEMPLATE_LIST_WORDS,
  emailRowWrittenOf,
  emailTemplateRowsOf,
  emailTemplateWords,
  nextRunWords,
  slotParts,
  stepLabel,
  type ReachOutChainDto,
} from "@chanlytics/contracts";
import { api, read } from "../api";
import type { SurfaceOverride } from "../surface-data";

/**
 * The reach-outs surface: the workspace's chains (GET reach-outs, without their reports, R23) as `__REACH_OUTS`, set
 * the moment they are read. Playbooks draws them as rows, and Templates its email rows from them through contracts
 * (emailTemplateRowsOf; R19: `__TEMPLATES_ALL` stays WhatsApp's for its three readers). Null when the chains could not
 * be read: each page says so, never an empty list it did not read. A count of what a chain wrote is its report, read
 * when one of its rows opens, never here: this read, which every page pays, scans no audience. Its own surface, so
 * neither the moments' read nor Settings' waits on it.
 */
export const reachOutsOverride: SurfaceOverride = {
  key: "reach_outs",
  globals: ["__REACH_OUTS"],
  events: ["surface:reach_outs"],
  apply: async () => {
    const w = window as Window & { __REACH_OUTS?: ReachOutChainDto[] | null };
    try {
      w.__REACH_OUTS = (await read("GET reach-outs")).chains;
    } catch (e) {
      // Null, not undefined, and said at once: each page draws what could not be read instead of waiting for it.
      w.__REACH_OUTS = null;
      window.dispatchEvent(new CustomEvent("surface:reach_outs"));
      throw e;
    }
  },
};

export const reachOuts = {
  /** A chain's report and its search's reach, read when one of its rows opens (Playbooks' chain, a Templates email). */
  report: (rootId: string) => api()("GET reach-outs/[id]", { params: { id: rootId } }),
  pause: (rootId: string) => api()("PUT playbooks/[id]", { params: { id: rootId }, body: { state: "paused" } }),
  resume: (rootId: string) => api()("PUT playbooks/[id]", { params: { id: rootId }, body: { state: "running" } }),
  remove: (rootId: string) => api()("DELETE reach-outs/[id]", { params: { id: rootId } }),
  /** Every sentence a chain's row and an email row say (contracts reach-out-sheet.ts). */
  words: {
    REACH_OUT_ROW_WORDS,
    REACH_OUT_SHEET_WORDS,
    chainHintOf,
    chainPaceOf,
    chainPathWords,
    chainReportWordsOf,
    EMAIL_TEMPLATE_LIST_WORDS,
    emailRowWrittenOf,
    emailTemplateRowsOf,
    emailTemplateWords,
    nextRunWords,
    slotParts,
    stepLabel,
  },
};

declare global {
  interface Window {
    __reachOuts?: typeof reachOuts;
  }
}

export function installReachOuts(): void {
  window.__reachOuts = reachOuts;
}
