import "server-only";
import { z } from "zod";
import {
  FOLLOW_UP_NEEDS_DEALS,
  POLICY_CLASSES,
  POLICY_MODES,
  dealsAreOn,
  policyClassOffered,
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
  if (mode === "veto" && cls !== "reply") return refuse("only replies can be held for review");
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
  const MODE_LABEL: Record<string, string> = {
    auto: "acts on its own",
    veto: "sends after a short window unless you stop it",
    ask: "asks you first",
    never: "never",
  };
  const summary = [
    mode ? `${cls}: ${MODE_LABEL[mode] ?? mode}` : null,
    conf !== null ? `confidence dial ${Math.round(conf * 100)}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return propose({
    kind: "policy",
    needs: "operator",
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
    undo: "Set it back",
  });
}

export const propose_policy = defineAct({
  name: "propose_policy",
  description:
    "Propose a change to what the receptionist may do alone: a class (reply, booking, faq, reengage, campaign, reviews, and follow_up where deals are on) and a mode (auto, veto, ask, never), or the reply confidence dial (0 to 1). Never for money: that class is locked by charter, so a request to change it is answered in words, not proposed.",
  input: z.object({
    // The classes the Autonomy pane draws: a reach-out's is set where reach-outs are made (Part 4).
    class: z.enum(POLICY_CLASSES.filter((c) => c !== "outreach") as [string, ...string[]]),
    mode: z.enum(["", ...POLICY_MODES]),
    min_confidence: z.number().optional(),
  }),
  label: "Preparing an autonomy change",
  build: proposePolicy,
});
