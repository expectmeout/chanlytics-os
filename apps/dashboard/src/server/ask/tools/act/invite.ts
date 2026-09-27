import "server-only";
import { z } from "zod";
import { PROPOSAL_SPECS, SCHEMA_SETS, proposalBelowNeeds } from "@chanlytics/contracts";
import { roleAtLeast } from "../../../with-route";
import { approvalWords, defineAct, propose, refuse, str, type ProposalOutcome, type ToolContext } from "../context";

async function proposeInvite(t: ToolContext, input: { email: string; role: string }): Promise<ProposalOutcome> {
  if (!roleAtLeast(t.role, PROPOSAL_SPECS.invite.needs)) return refuse(proposalBelowNeeds("invite"));
  const email = str(input.email, 200).toLowerCase();
  const role = str(input.role, 10);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return refuse("that is not an email address");
  if (role !== "operator" && role !== "viewer") return refuse("role must be operator or viewer");
  return propose({
    kind: "invite",
    title: `Invite ${email}`,
    summary: `As ${role}${role === "viewer" ? " (reads everything, changes nothing)" : " (replies and handles threads; no settings or team)"}`,
    payload: { email, role },
  });
}

export const propose_invite = defineAct({
  name: "propose_invite",
  description: `Propose an invitation to the workspace by email, as operator (replies and handles threads; no settings or team) or viewer (reads everything, changes nothing). Call it when they want to add someone to the team; a role not offered here, such as owner, is answered in words. It becomes a card the person approves, and nothing is sent before that. ${approvalWords("invite")}.`,
  input: z.object({ email: z.string(), role: z.enum(SCHEMA_SETS["invitations.role"]) }),
  label: "Preparing an invitation",
  build: proposeInvite,
});
