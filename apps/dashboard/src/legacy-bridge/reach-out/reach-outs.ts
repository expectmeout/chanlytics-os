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
  HOLD_DOOR_WORDS,
  REACH_OUT_GAP_MINUTES,
  REACH_OUT_PREVIEW_WORDS,
  REACH_OUT_ROW_WORDS,
  REACH_OUT_SHEET_PARTS,
  REACH_OUT_SHEET_WORDS,
  REACH_OUT_SLOTS,
  REACH_OUT_SLOT_WORDS,
  firstNameOf,
  insertSlotAt,
  paceWords,
  previewLinesOf,
  reachLineOf,
  reachOutAddStep,
  reachOutAfterDayChoices,
  reachOutChainBodyOf,
  reachOutDoorOf,
  reachOutDraftIssues,
  reachOutDraftOf,
  reachOutDropStep,
  reachOutMayAddStep,
  reachOutMayPickDomain,
  reachOutPreviewOf,
  reachOutSavedWords,
  reachOutSheetPaceOf,
  reachOutSheetUnreadOf,
  reachOutWhoWords,
  sheetFootWords,
  startWords,
  stepWhenWords,
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
  type ReachOutChainInput,
  type ReachOutDecision,
  type ReachOutPreviewInput,
  type ReachOutReachDto,
} from "@chanlytics/contracts";
import { api, read } from "../api";
import { readCache } from "../read-cache";
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

/** The reaches read in this tab, by search, in memory: one read each until the next write. */
const reaches = readCache<ReachOutReachDto>("reach_out_reach");

export const reachOuts = {
  /** A chain's report and its search's reach, read when one of its rows opens (Playbooks' chain, a Templates email). */
  report: (rootId: string) => api()("GET reach-outs/[id]", { params: { id: rootId } }),
  pause: (rootId: string) => api()("PUT playbooks/[id]", { params: { id: rootId }, body: { state: "paused" } }),
  resume: (rootId: string) => api()("PUT playbooks/[id]", { params: { id: rootId }, body: { state: "running" } }),
  remove: (rootId: string) => api()("DELETE reach-outs/[id]", { params: { id: rootId } }),
  /** A new chain, saved and its first step run now (R13, R14): the answer carries what the run did. */
  save: (body: ReachOutChainInput) => api()("POST reach-outs", { body }),
  /** A chain changed whole: new words send what waits back to the check (R5); a dropped step's work goes (R17). */
  update: (rootId: string, body: ReachOutChainInput) => api()("PUT reach-outs/[id]", { params: { id: rootId }, body }),
  /** One business's email as the chain would write it (R11): it spends the model, so it is asked for by a press. */
  preview: (body: ReachOutPreviewInput) => api()("POST reach-outs/preview", { body }),
  /**
   * A search's reach (the Leads door, the sheet): the answer held for the tab through read-cache.ts, so a door and its
   * sheet read it once, and let go of by the one rule every on-demand read keeps: any write lands, every answer goes
   * (api.ts refresh). Null when it could not be read: the door draws nothing then, never a count it did not read.
   */
  reach: async (searchId: string): Promise<ReachOutReachDto | null> => {
    const held = reaches.peek(searchId);
    if (held) return held;
    try {
      return await reaches.through(searchId, () => read("GET reach-outs/reach", { query: { search: searchId } }));
    } catch (e) {
      console.error("reach_out_reach_failed", e instanceof Error ? e.message : e);
      return null;
    }
  },
  /** An owner's answer to one held email (R18). */
  decide: (sendId: string, decision: ReachOutDecision) =>
    api()("POST reach-out-sends/[id]/decide", { params: { id: sendId }, body: { decision } }),
  /** Every sentence a chain's row, an email row, the sheet and the Leads door say (contracts reach-out-*.ts). */
  words: {
    HOLD_DOOR_WORDS,
    REACH_OUT_GAP_MINUTES,
    REACH_OUT_PREVIEW_WORDS,
    REACH_OUT_ROW_WORDS,
    REACH_OUT_SHEET_PARTS,
    REACH_OUT_SHEET_WORDS,
    REACH_OUT_SLOTS,
    REACH_OUT_SLOT_WORDS,
    chainHintOf,
    chainPaceOf,
    chainPathWords,
    chainReportWordsOf,
    EMAIL_TEMPLATE_LIST_WORDS,
    emailRowWrittenOf,
    emailTemplateRowsOf,
    emailTemplateWords,
    firstNameOf,
    insertSlotAt,
    nextRunWords,
    paceWords,
    previewLinesOf,
    reachLineOf,
    reachOutAddStep,
    reachOutAfterDayChoices,
    reachOutChainBodyOf,
    reachOutDoorOf,
    reachOutDraftIssues,
    reachOutDraftOf,
    reachOutDropStep,
    reachOutMayAddStep,
    reachOutMayPickDomain,
    reachOutPreviewOf,
    reachOutSavedWords,
    reachOutSheetPaceOf,
    reachOutSheetUnreadOf,
    reachOutWhoWords,
    sheetFootWords,
    slotParts,
    startWords,
    stepLabel,
    stepWhenWords,
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
