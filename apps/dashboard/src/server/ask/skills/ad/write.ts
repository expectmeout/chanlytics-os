import "server-only";
import {
  AD_CRAFT_JSON_SCHEMA,
  AdCraftAnswerSchema,
  adBriefText,
  adVersionsOf,
  type AdBrief,
  type AdCraftAnswer,
  type AdIssue,
  type AdVersion,
  type TenantId,
} from "@chanlytics/contracts";
import { log } from "@/server/shared/log";
import { craftWith, type CraftKept } from "../craft";
import { adWordIssues } from "./brief";
import { AD_SKILL } from "./skill";

/**
 * The ad writer's call (contracts ask/skills/ad; the Ads plan's 6.7): one craft call under the writer's own purpose at
 * the gateway, and its words held to the checks in code before anyone sees them. For New ad's route and for a turn of
 * AI's alike: whoever calls says whose workspace it is, who asked, and when it must have answered, and hands a brief
 * ./brief.ts built. What comes back is the words, or why there are none (said once in the log, `ask_skill_crafted`,
 * with how long it took). Never thrown: a caller says "Couldn't write the words" for every reason alike.
 *
 * One try. A caller that asks again after words that failed the checks is the second try the plan allows, and an ad
 * with no words that passed cannot be turned on.
 */

/** Whose ad it is, who asked, and when the words must be in. */
interface AdWriterCaller {
  tenantId: TenantId;
  userId: string;
  /** The moment the call must have answered by (the craft call is started only with its least time left). */
  deadline: number;
}

/** What the writer came to. `answer` is its own, for the job whose answer is a change. */
type AdWritten =
  { wrote: true; versions: AdVersion[]; answer: AdCraftAnswer } | { wrote: false; kept: CraftKept; issues: AdIssue[] };

/** Whether a job's answer carries words to check: a draft's and a rewrite's always, a change's where it changed them. */
const carriesWords = (adBrief: AdBrief, answer: AdCraftAnswer): boolean =>
  adBrief.job !== "change" || answer.change.kind === "words";

/** The ad writer, asked once: its words where they passed the checks, or why there are none. */
export async function writeAd(caller: AdWriterCaller, adBrief: AdBrief): Promise<AdWritten> {
  const kept = (reason: CraftKept, ms: number, issues: AdIssue[] = [], detail?: string): AdWritten => {
    log.info("ask_skill_crafted", {
      tenant_id: caller.tenantId,
      skill: AD_SKILL.id,
      job: adBrief.job,
      outcome: "kept",
      why: reason,
      ms,
      ...(issues.length ? { issues: issues.map((issue) => `${issue.version} ${issue.code}`) } : {}),
      ...(detail ? { detail: detail.slice(0, 200) } : {}),
    });
    return { wrote: false, kept: reason, issues };
  };
  const crafted = await craftWith(AD_SKILL, {
    tenantId: caller.tenantId,
    userId: caller.userId,
    question: adBriefText(adBrief),
    schema: AD_CRAFT_JSON_SCHEMA,
    answer: AdCraftAnswerSchema,
    deadline: caller.deadline,
    what: "ad",
  });
  if (!crafted.ok) return kept(crafted.why, crafted.ms, [], crafted.detail);
  const { versions } = adVersionsOf(crafted.answer);
  const issues = carriesWords(adBrief, crafted.answer) ? adWordIssues(versions, adBrief) : [];
  if (issues.length) return kept("checks", crafted.ms, issues);
  log.info("ask_skill_crafted", {
    tenant_id: caller.tenantId,
    skill: AD_SKILL.id,
    job: adBrief.job,
    outcome: "wrote",
    ms: crafted.ms,
  });
  return { wrote: true, versions, answer: crafted.answer };
}
