import "server-only";
import { z } from "zod";
import {
  FOLLOW_UP_NEEDS_DEALS,
  PLAYBOOK_VETO_DELAY_WORDS,
  POLICY_CLASSES,
  POLICY_CLASS_WORDS,
  POLICY_MODES,
  POLICY_MODE_WORDS,
  dealsAreOn,
  policyClassOffered,
  policyModeRefusal,
  type PolicyClass,
  type PolicyMode,
} from "@chanlytics/contracts";
import { sellsByOf } from "../../../people/deals";
import { defineAct, propose, refuse, str, type ProposalOutcome, type ToolContext } from "../context";

async function proposePolicy(
  t: ToolContext,
  input: { class: string; mode: string; min_confidence?: number },
): Promise<ProposalOutcome> {
  const cls = str(input.class, 20);
  const mode = str(input.mode, 10);
  const conf = typeof input.min_confidence === "number" ? input.min_confidence : null;
  if (!(POLICY_CLASSES as readonly string[]).includes(cls))
    return refuse("class must be reply, booking, faq, reengage, campaign, reviews, follow_up or money");
  if (cls === "money") return refuse("money stays owner-only by charter; that row is locked");
  if (cls === "outreach") return refuse("a reach-out's runs are set where reach-outs are made, not here");
  // A class only a proposal's moment runs under is offered only where deals are on (0006); only it asks.
  if (!policyClassOffered(cls, false) && !policyClassOffered(cls, dealsAreOn(await sellsByOf(t.ctx, t.tenantId))))
    return refuse(FOLLOW_UP_NEEDS_DEALS);
  if (mode && !(POLICY_MODES as readonly string[]).includes(mode))
    return refuse("mode must be auto, veto, ask or never");
  // What each class may be set to is one rule, the Autonomy page's (contracts POLICY_CLASS_MODES), in its words.
  const notOffered = mode ? policyModeRefusal(cls as PolicyClass, mode as PolicyMode) : null;
  if (notOffered) return refuse(notOffered);
  if (conf !== null && (cls !== "reply" || conf < 0 || conf > 1))
    return refuse("the confidence dial is 0 to 1 and applies to reply");
  if (!mode && conf === null) return refuse("say a mode or a confidence");
  const { data: row } = await t.ctx.supabase
    .from("policies")
    .select("mode, limits")
    .eq("tenant_id", t.tenantId)
    .eq("class", cls)
    .is("subject_type", null)
    .maybeSingle();
  // The Autonomy page's own words for the row and the mode, never a class id.
  const summary = [
    mode ? `${POLICY_CLASS_WORDS[cls as PolicyClass].name}: ${POLICY_MODE_WORDS[mode as PolicyMode].chip}` : null,
    conf !== null ? `confidence dial ${Math.round(conf * 100)}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return propose({
    kind: "policy",
    title: `Autonomy: ${cls}`,
    summary,
    payload: {
      class: cls,
      mode: mode || null,
      min_confidence: conf,
      previous: {
        mode: row?.mode ?? null,
        min_confidence: (row?.limits as { min_confidence?: number } | null)?.min_confidence ?? null,
      },
    },
  });
}

export const propose_autonomy = defineAct({
  name: "propose_autonomy",
  description: `Propose a change to what the receptionist may do alone: class (reply, booking, faq, reengage, campaign, reviews, or follow_up where deals are on) with mode (auto, veto, ask or never), or the reply confidence dial (min_confidence, 0 to 1, with mode empty). Call it when they want the receptionist to act on its own, wait for them, or hold its replies for a look; propose_person is for one person, and propose_settings for hours, closures, notes and services. Each class takes the modes its row on the Autonomy page offers (veto holds a reply, or a campaign's run for ${PLAYBOOK_VETO_DELAY_WORDS}, so a person can stop it), and a mode a class does not take is refused in that page's words. Never for money: that class is locked by charter, so a request to change it is answered in words, not proposed. The modes as they stand are in this prompt above, so no read is needed first.`,
  kind: "policy",
  input: z.object({
    // The classes the Autonomy pane draws: a reach-out's is set where reach-outs are made (Part 4).
    class: z.enum(POLICY_CLASSES.filter((c) => c !== "outreach") as [string, ...string[]]),
    mode: z.enum(["", ...POLICY_MODES]),
    min_confidence: z.number().optional(),
  }),
  // The dial alone is asked with mode empty: the one shape a sentence does not pin.
  examples: [
    { class: "reply", mode: "veto" },
    { class: "reply", mode: "", min_confidence: 0.8 },
  ],
  label: "Preparing an autonomy change",
  build: proposePolicy,
});
