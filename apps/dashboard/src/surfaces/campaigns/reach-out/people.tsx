/**
 * Add leads, from a sequence to leads' record (the lead-to-sequence canvas's Presses board: "Opens Leads with this as the
 * pick, at To decide"): Leads, on the search its leads come from where it is known, with this sequence as where Add goes.
 */
import { leadsRoute } from "@chanlytics/contracts";
import { navigate } from "../../legacy-verbs";
import { pileAsk } from "./surface";

/**
 * Add leads: this sequence remembered as where Add goes (the search's pick once one is open, page-pile.tsx), then Leads on
 * the search its leads come from, or all of Leads, which asks for one, where none is known.
 */
export function addLeadsTo(rootId: string, name: string | null = null, searchId: string | null = null) {
  pileAsk.set(rootId, name);
  navigate(leadsRoute(searchId ? { searchId, list: "all" } : { list: "all" }));
}
