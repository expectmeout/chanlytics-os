import "server-only";
import { z } from "zod";
import { PROPOSAL_SPECS, SCHEMA_SETS, proposalBelowNeeds } from "@chanlytics/contracts";
import { roleAtLeast } from "../../../with-route";
import {
  actAction,
  approvalWords,
  defineActions,
  propose,
  refuse,
  str,
  type ProposalOutcome,
  type ToolContext,
} from "../context";

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

/** The team (D11): an invitation (invite, once propose_invite), the one action until Phase 4. */
export const propose_team = defineActions({
  name: "propose_team",
  description: `Propose a change to the team, by action; action invite, its one action today, takes email and role and proposes an invitation to the workspace by email, as operator (replies and handles threads; no settings or team) or viewer (reads everything, changes nothing). Call it when they want to add someone to the team; a role not offered here, such as owner, is answered in words. It becomes a card the person approves, and nothing is sent before that. ${approvalWords("invite")}.`,
  actions: {
    invite: actAction({
      kind: "invite",
      input: z.object({ email: z.string(), role: z.enum(SCHEMA_SETS["invitations.role"]) }),
      examples: [{ email: "sam@example.com", role: "operator" }],
      label: "Preparing an invitation",
      build: proposeInvite,
    }),
  },
});
