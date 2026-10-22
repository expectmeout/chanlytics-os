/**
 * Settings › Memory's doors (decision 0070): a line kept, its words changed, or forgotten, each through its verb (contracts
 * PAGE_SPECS memory, memory_change, memory_forget), the same walk Ask's cards take. An object the pane imports, so a test
 * stands a door in by assigning onto it, as Autonomy's are.
 */
import type { AskMemoryLineDto } from "@chanlytics/contracts";
import { commitVerb, type VerbResult } from "@/legacy-bridge/verbs/commit";

/** A line kept from the pane: the member's own words, as Ask keeps the lines it is told. */
function keepLine(text: string): Promise<VerbResult> {
  return commitVerb("memory", { text });
}

/** A line's words changed, the words before kept for its undo. */
function changeLine(line: Pick<AskMemoryLineDto, "id" | "text">, text: string): Promise<VerbResult> {
  return commitVerb("memory_change", { memory_id: line.id, text, previous: line.text });
}

/** A line forgotten, its words kept for its undo (a forgotten line is kept again as a line of its own). */
function forgetLine(line: Pick<AskMemoryLineDto, "id" | "text">): Promise<VerbResult> {
  return commitVerb("memory_forget", { memory_id: line.id, text: line.text });
}

export const memoryVerbs = { keep: keepLine, change: changeLine, forget: forgetLine };
