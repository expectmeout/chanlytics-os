import "server-only";
import { z } from "zod";
import { SCHEMA_SETS } from "@chanlytics/contracts";
import { defineAct, propose, refuse, str, type ProposalOutcome, type ToolContext } from "../context";

async function proposeInvite(_t: ToolContext, input: { email: string; role: string }): Promise<ProposalOutcome> {
  const email = str(input.email, 200).toLowerCase();
  const role = str(input.role, 10);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return refuse("that is not an email address");
  if (role !== "operator" && role !== "viewer") return refuse("role must be operator or viewer");
  return propose({
    kind: "invite",
    needs: "owner",
    title: `Invite ${email}`,
    summary: `As ${role}${role === "viewer" ? " (reads everything, changes nothing)" : " (replies and handles threads; no settings or team)"}`,
    payload: { email, role },
    undo: null,
  });
}

export const propose_invite = defineAct({
  name: "propose_invite",
  description: "Propose inviting someone to the workspace by email, as operator or viewer. Owner-only.",
  input: z.object({ email: z.string(), role: z.enum(SCHEMA_SETS["invitations.role"]) }),
  label: "Preparing an invitation",
  build: proposeInvite,
});
