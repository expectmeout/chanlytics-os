import "server-only";
/**
 * What it's told (decision 0113, How it reaches out): a writer's prompt as it would be composed for this workspace now,
 * cut into its parts, never sent to a model. The words are the drafter's own read and its own lines (draftAskedParts),
 * with the line the owner would type in New left as words about it; the line about a business is the check's own
 * prompt, over the made-up business a preview reads (contracts reachOutExampleRecord) and the newest running sequence's
 * first email, or the first words a new sequence opens with.
 */
import {
  REACH_OUT_FIRST_WORDS,
  openingSystemPrompt,
  openingToldParts,
  openingUserContent,
  parseTenantConfig,
  reachOutExampleRecord,
  reachOutToneOf,
  toldPart,
  type ReachOutToldDto,
} from "@chanlytics/contracts";
import { findWorkspaceAbout } from "@chanlytics/db/campaigns";
import { listChains } from "../campaigns/reach-outs/reach-outs";
import * as facts from "../readers/facts";
import { newestLeadSequence } from "../readers/settings";
import { load, type ReaderContext } from "../shared/reader";
import { getStoredConfig } from "../workspace/config-row";
import { draftAskedParts, draftRules, readDraftKnown } from "./sequence";

/** The line an owner types in New, as the sheet says it: the one part only they write. */
const TYPED_IN_NEW = "(The line you type in New, in your words.)";

/** Ask's drafter's prompt in New, cut into its parts: its rules, then each part that says something. */
async function wordsTold(rc: ReaderContext): Promise<ReachOutToldDto> {
  const known = await readDraftKnown(rc);
  const parts = draftAskedParts(known, { words: TYPED_IN_NEW }).filter((p) => p.text);
  return { kind: "words", parts: [toldPart("rules", draftRules(known.previews === true)), ...parts] };
}

/** The opening writer's prompt for one business, cut into its parts by its lines' labels. */
async function openingTold(rc: ReaderContext): Promise<ReachOutToldDto> {
  const [named, stored, about, chains] = await Promise.all([
    load(rc, facts.facts, undefined),
    getStoredConfig(rc.ctx.supabase, rc.tenantId),
    findWorkspaceAbout(rc.ctx.supabase, rc.tenantId),
    listChains(rc.ctx, rc.tenantId),
  ]);
  const config = parseTenantConfig(stored);
  const words = newestLeadSequence(chains)?.first ?? REACH_OUT_FIRST_WORDS;
  const user = openingUserContent({
    record: reachOutExampleRecord(),
    workspace: {
      name: named.data.name,
      what_we_do: config?.reach_out?.offer?.trim() || about,
      tone: reachOutToneOf(config),
    },
    words,
  });
  return { kind: "opening", parts: openingToldParts(openingSystemPrompt(), user) };
}

/** GET settings/reach-out/told: the words' writer's or the opening's, as composed for this workspace now. */
export const reachOutTold = (rc: ReaderContext, kind: "words" | "opening"): Promise<ReachOutToldDto> =>
  kind === "words" ? wordsTold(rc) : openingTold(rc);
