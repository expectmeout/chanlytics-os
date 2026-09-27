import "server-only";
import { z } from "zod";
import { PERSON_MODES, PROPOSAL_SPECS, proposalBelowNeeds } from "@chanlytics/contracts";
import { roleAtLeast } from "../../../with-route";
import {
  UUID,
  actAction,
  approvalWords,
  defineActions,
  noteRow,
  propose,
  refuse,
  str,
  type ProposalOutcome,
  type ToolContext,
} from "../context";

async function proposePersonMode(
  t: ToolContext,
  input: { contact_id: string; mode: string },
): Promise<ProposalOutcome> {
  if (!roleAtLeast(t.role, PROPOSAL_SPECS.person_mode.needs)) return refuse(proposalBelowNeeds("person_mode"));
  const id = str(input.contact_id, 40);
  const mode = str(input.mode, 10);
  if (!UUID.test(id)) return refuse("contact_id must be an id a read returned");
  if (!(["inherit", ...PERSON_MODES] as string[]).includes(mode))
    return refuse("mode must be auto, ask, never or inherit");
  const { data: c, error } = await t.ctx.supabase
    .from("contacts")
    .select("id, display_name, wa_profile_name, phone_e164, email, erased_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!c || c.erased_at) return refuse("no such person in this workspace");
  const { data: pol } = await t.ctx.supabase
    .from("policies")
    .select("mode")
    .eq("tenant_id", t.tenantId)
    .eq("class", "reply")
    .eq("subject_type", "contact")
    .eq("subject_id", id)
    .maybeSingle();
  const who = c.display_name || c.wa_profile_name || c.phone_e164 || c.email || "this person";
  const LABEL: Record<string, string> = {
    auto: "answers them",
    ask: "asks you first",
    never: "stays silent with them",
    inherit: "follows the workspace rule",
  };
  noteRow(t, "person", id, who, `clients/${id}`);
  return propose({
    kind: "person_mode",
    title: `Receptionist for ${who}`,
    summary: `The receptionist ${LABEL[mode]}`,
    payload: { contact_id: id, mode, previous: pol?.mode ?? "inherit", who },
  });
}

/** One person (D11): how the receptionist treats them (mode, once propose_person_mode); Phase 4 adds the rest. */
export const propose_person = defineActions({
  name: "propose_person",
  description: `Propose a change to one person, by action; action mode, its one action today, takes contact_id, the id a read returned, and mode, how the receptionist treats them: auto (answers them), ask (asks a person first), never (stays silent with them), or inherit (follows the workspace's rule). Call it when they want the receptionist to stop, resume or check first with one person; propose_autonomy changes a whole class instead, and propose_thread_verb acts on one thread. ${approvalWords("person_mode")}.`,
  actions: {
    mode: actAction({
      kind: "person_mode",
      input: z.object({ contact_id: z.string(), mode: z.enum(["auto", "ask", "never", "inherit"]) }),
      examples: [{ contact_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", mode: "never" }],
      label: "Preparing a receptionist change",
      build: proposePersonMode,
    }),
  },
});
