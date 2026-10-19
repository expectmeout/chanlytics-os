/**
 * A lead's one act on every sequence at once (Reach out, Part 6: H10): Never write to them again, the lead sheet's ⋯,
 * which stops every sequence writing to them (POST reach-outs/leads/:id/stop) and says what it did. Where a lead stands
 * in a sequence is the sequence's own reading now (00459 sequence_place, campaigns/sequences/place), and the strip a
 * search's own sequence drew over Leads went with the search-fed road (the lead-to-sequence canvas, 18 Oct 2026): a
 * search's Add goes to its pick, and a sequence may add from a search by itself (auto-add).
 */
import { reachOuts } from "../../campaigns/reach-out/surface";
import { refusalToast } from "../../legacy-verbs";
import type { Flash } from "../peek/types";

/** A door here moved a lead: Leads and the sequences read it again. */
const roLeadsMoved = () => window.dispatchEvent(new CustomEvent("reach_out:leads"));

/** Never write to them again: every sequence stops writing to this lead, said in a toast. */
export async function stopWritingTo(leadId: string, name: string, flash: Flash | null) {
  const W = reachOuts.words.REACH_OUT_STOP_WORDS;
  const r = await reachOuts.stopLead(leadId);
  if (flash)
    flash(r && r.ok ? { tone: "ok", msg: r.data && r.data.already ? W.already(name) : W.done(name) } : refusalToast(r));
  roLeadsMoved();
  return r;
}
