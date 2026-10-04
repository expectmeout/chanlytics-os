/**
 * Who may press a Setup row's verb, and what pressing does, for the gate's sentence (contracts refusal.ts roleGate; moved
 * from legacy/pages/setup.jsx, decision 0015). A verb that opens a panel or a page is anyone's, but for a page that is only
 * an owner's (Find, where searching and linking are); these reach doors that refuse everyone else (requireRole), and the
 * button says so before the press -- it used to say so after, in a toast.
 */
import type { SetupVerb } from "@chanlytics/contracts";
import { gate, type GateProps } from "../../legacy-verbs";

const SETUP_GATES: readonly (readonly [to: string, action: string, doing: string])[] = [
  ["verb:request-line", "approve", "ask for a line"],
  ["verb:request-repair", "approve", "ask for a repair"],
  ["verb:billing-checkout", "billing", "start the subscription"],
  ["verb:billing-portal", "billing", "manage the subscription"],
  ["verb:forwarding-test:", "team", "test forwarding"],
  ["verb:retry-line:", "team", "retry a line"],
  ["verb:activate:", "team", "activate a capability"],
  ["verb:deactivate:", "team", "withdraw an activation"],
  // Google's row opens the first run's Find (contracts FIRST_RUN_FIND_ROUTE), and searching and linking are an owner's
  // (the routes say so too).
  ["start/find", "team", "find the business on Google"],
];

/** The gate a verb's button wears: the role's refusal where it may not, nothing where it may. */
export function setupGate(verb: SetupVerb | null | undefined): GateProps {
  const hit =
    verb && verb.to ? SETUP_GATES.find(([to]) => (to.endsWith(":") ? verb.to.startsWith(to) : verb.to === to)) : null;
  return hit ? gate(hit[1], hit[2]) : {};
}

/** Whether a verb's gate refuses the member: the row's own press goes nowhere then, however it is reached. */
export const setupGated = (verb: SetupVerb | null | undefined): boolean => "data-gated" in setupGate(verb);
