import "server-only";
import { z } from "zod";
import {
  POLICY_CLASSES,
  POLICY_CLASS_WORDS,
  POLICY_MODES,
  POLICY_MODE_WORDS,
  policyModeRefusal,
  type PolicyClass,
  type PolicyMode,
} from "@chanlytics/contracts";
import { actAction, propose, refuse, str, type ProposalOutcome, type ToolContext } from "../context";

/**
 * What a class's change asks that its row already holds (the operator stress run, 15 Oct 2026: a part of an ask already
 * so is said, never proposed as a change): `all` where nothing of it would change, which is refused in words; else the
 * part that holds, left off the card and said beside it. Null where nothing holds, or the class has no row of its own.
 */
function classHolds(
  cls: PolicyClass,
  asked: { mode: string; conf: number | null },
  was: { mode: string | null; conf: number | null } | null,
): { all: boolean; words: string } | null {
  if (!was) return null;
  const sameMode = !!asked.mode && was.mode === asked.mode;
  const sameConf = asked.conf !== null && was.conf === asked.conf;
  const holds = [
    sameMode ? `is already ${POLICY_MODE_WORDS[asked.mode as PolicyMode].chip}` : null,
    sameConf ? `already has its confidence dial at ${Math.round((asked.conf ?? 0) * 100)}%` : null,
  ].filter((x): x is string => x !== null);
  if (!holds.length) return null;
  const all = (!asked.mode || sameMode) && (asked.conf === null || sameConf);
  return { all, words: `“${POLICY_CLASS_WORDS[cls].name}” ${holds.join(" and ")}` };
}

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
  const was = {
    mode: row?.mode ?? null,
    conf: (row?.limits as { min_confidence?: number } | null)?.min_confidence ?? null,
  };
  const held = classHolds(cls as PolicyClass, { mode, conf }, row ? was : null);
  if (held?.all) return refuse(`${held.words}: say so, and change nothing`);
  // The Autonomy page's own words for the row and the mode, never a class id.
  const summary = [
    mode ? `${POLICY_CLASS_WORDS[cls as PolicyClass].name}: ${POLICY_MODE_WORDS[mode as PolicyMode].chip}` : null,
    conf !== null ? `confidence dial ${Math.round(conf * 100)}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return propose(
    {
      kind: "policy",
      title: `Autonomy: ${cls}`,
      summary,
      payload: {
        class: cls,
        mode: mode || null,
        min_confidence: conf,
        previous: { mode: was.mode, min_confidence: was.conf },
      },
    },
    held ? `${held.words}, so the card leaves that as it is` : undefined,
  );
}

/**
 * What the receptionist may do alone for a whole class of message: propose_settings' action autonomy (the operator, 15
 * Oct 2026: a setting like the others, once propose_autonomy). An operator's card, as the Autonomy page's row is.
 */
export const autonomyAction = actAction({
  kind: "policy",
  input: z.object({
    // The classes the Autonomy pane draws: a reach-out's is set where reach-outs are made (Part 4).
    class: z
      .enum(POLICY_CLASSES.filter((c) => c !== "outreach") as [string, ...string[]])
      .describe("The class of message: reply, booking, faq, reengage, campaign, reviews, or follow_up."),
    mode: z
      .enum(POLICY_MODES)
      .optional()
      .describe(
        "auto (alone), veto (waits so a person can stop it), ask (a person first) or never; leave out to change only the dial.",
      ),
    min_confidence: z.number().optional().describe("The reply confidence dial, 0 to 1, for class reply alone."),
  }),
  // The dial alone is asked with no mode: the one shape a sentence does not pin.
  examples: [
    { class: "reply", mode: "veto" },
    { class: "reply", min_confidence: 0.8 },
  ],
  label: "Preparing an autonomy change",
  words: `Action autonomy changes what the receptionist may do alone for a whole class of message: class with mode, or the reply confidence dial (min_confidence) alone. Call it when they want the receptionist to act on its own, wait for them, or hold its replies for a look; propose_person with action mode is for one person. Each class takes the modes its row on the Autonomy page offers (veto holds a reply, or the reply to a review, so a person can stop it), and a mode a class does not take is refused in that page's words. For reengage, campaign and follow_up the row is what a NEW sequence starts as (decision 0064): each existing sequence keeps its own mode, changed by propose_sequence's change with its mode; a sequence that should not send is paused, so those rows take no never. Never for money: that class is locked by charter, so a request to change it is answered in words, not proposed. The modes as they stand are in this prompt above, so no read is needed first.`,
  build: (t, input) =>
    proposePolicy(t, { class: input.class, mode: input.mode ?? "", min_confidence: input.min_confidence }),
});
