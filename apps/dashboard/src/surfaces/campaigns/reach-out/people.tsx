/**
 * Who is in a reach-out (the lead workbench, 00426): its drawer's People, read when the drawer opens and again when a
 * door on Leads moves a lead (`reach_out:leads`). Three groups -- waiting (on its list, or in its search's audience, with
 * nothing left for them yet), writing (written to, not done) and done (booked, stopped, bounced, said no, closed, or a
 * person answered) -- each lead a door to its peek on Leads, with the line Leads says under its stage (reachOutLineOf).
 * A reach-out fed by a list takes more: Add leads opens Leads, where a search is gone through one lead at a time with
 * this reach-out as where its adds go (the pile, 00426).
 */
import { leadsRoute } from "@chanlytics/contracts";
import { navigate } from "../../legacy-verbs";
import { PILE_TARGET_KEY } from "./surface";

/**
 * Add leads: Leads, with this reach-out remembered as where the next pile's adds go. The drawer's Add leads and Leads'
 * door on a list that feeds a reach-out (door.tsx) both press it.
 */
export function addLeadsTo(rootId: string) {
  try {
    window.sessionStorage.setItem(PILE_TARGET_KEY, rootId);
  } catch {
    /* a browser that will not keep it: the pile offers every reach-out fed by a list anyway */
  }
  navigate(leadsRoute({ list: "all" }));
}
