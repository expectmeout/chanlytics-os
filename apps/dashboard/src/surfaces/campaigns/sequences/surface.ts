/**
 * The Sequences page's list (decision 0060): every sequence of the workspace with what needs you in each (GET sequences,
 * readers/sequences.ts, the read Ask's campaigns.sequences reads too). Part of the SurfaceData seam; the page reads it
 * through `useSurface("sequences")`.
 *
 * Read on demand, as its page comes on screen (surface-registry.ts ROUTE_DRAWS names it on `campaigns/sequences` alone), so
 * no other page and no workspace without the page pays for its read. A sequence made, paused or changed, a batch made or
 * moved, a send held or gone, a reply read: heard wherever the tab is, since the list's Needs you is the count the page says.
 */
import type { SequencesPageDto } from "@chanlytics/contracts";
import { read } from "@/legacy-bridge/api";
import { declareReads } from "@/legacy-bridge/surface-registry";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { declareSurfaceValue, setSurfaceValue } from "../../surface-values";

export type SequencesSurface = SequencesPageDto | null;

declareSurfaceValue("sequences", "__SEQUENCES");

export const sequencesOverride: SurfaceOverride = {
  key: "sequences",
  value: "sequences",
  events: ["surface:sequences"],
  onDemand: true,
  // What the list counts and names: a sequence and its steps, its batches, a lead's reply, a customer's reply after a batch
  // (the messages), the rule that says who approves, the workspace's word and clock, and the list or the search it starts
  // on, who is on a sequence to leads' list and an email of its still to write (00459's overview). Heard on its page, a
  // batch and a sequence wherever the tab is: the Needs you a page says follows them.
  ...declareReads("sequences", {
    reads: ["campaign", "send", "reach_out", "conversation", "rules", "facts", "workspace", "list", "lead", "template"],
    fresh: "its-page",
    always: ["send", "campaign"],
    omit: [
      {
        tables: ["conversations"],
        why: "a thread moved is no reply: the list counts a batch's replies by their messages",
      },
      {
        tables: ["segment_members"],
        why: "who is on a list is the batch's to pick when it runs; the list names the list",
      },
      {
        tables: ["leads", "lead_rounds"],
        why: "a sequence to leads is named by its list; who is on it is the list's members, which it hears",
      },
    ],
  }),
  apply: async () => {
    try {
      setSurfaceValue("sequences", await read("GET sequences"));
    } catch (e) {
      // Null, not undefined, and said at once: the page draws what could not be read instead of waiting for it.
      setSurfaceValue("sequences", null);
      window.dispatchEvent(new CustomEvent("surface:sequences"));
      throw e;
    }
  },
};
