/**
 * The reach-outs surface as the frame reads it: its override, the read every page's runner starts, apart from the
 * reach-outs' words, view models and verbs the pages draw (surface.ts). Together they put about 26 KB, compressed, into
 * every first load, for a read whose own code is a few lines (the loadability review, 19 Oct 2026).
 */
import type { ReachOutChainDto } from "@chanlytics/contracts";
import { read } from "@/legacy-bridge/api";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { declareSurfaceValue, setSurfaceValue } from "../../surface-values";

/** The chains GET reach-outs lists; null when they could not be read (each page says so), never an empty list it did not read. */
export type ReachOutsSurface = ReachOutChainDto[] | null;

// Leads (reach-out-leads.jsx) reads this under its old name until it moves.
declareSurfaceValue("reach_outs", "__REACH_OUTS");

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
  value: "reach_outs",
  events: ["surface:reach_outs"],
  // A chain paused or resumed elsewhere (00376), and a step's run made, approved or stopped (00321), move its row and
  // its Approve: heard wherever the tab is. A message is no chain's, and is never heard here. A reply read, drafted or undone
  // (reach_out_replies, 00222) is, since the reading ends a held email and a 'no' ends the person's offers (0047, S1-14): a few a day.
  // And the rule that says whether a chain's reply is answered on its own, its mode (W-review-facts-rules-8): a few saves a month.
  // And the templates a chain's emails are written from (Meta's verdict, the words), and a deal: a lead's deal won counts once in
  // a reach-out's People cell (00426). Each a few a week, and the chains' read scans no audience: heard wherever the chains are.
  ...declareReads("reach_outs", {
    reads: ["campaign", "send", "reach_out", "rules", "template", "deal"],
    fresh: "live",
  }),
  apply: async () => {
    try {
      setSurfaceValue("reach_outs", (await read("GET reach-outs")).chains);
    } catch (e) {
      // Null, not undefined, and said at once: each page draws what could not be read instead of waiting for it.
      setSurfaceValue("reach_outs", null);
      window.dispatchEvent(new CustomEvent("surface:reach_outs"));
      throw e;
    }
  },
};
