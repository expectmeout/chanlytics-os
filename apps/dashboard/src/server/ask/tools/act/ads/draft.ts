import "server-only";
import { z } from "zod";
import { ROLE_PERMS, parseTenantConfigResult } from "@chanlytics/contracts";
import { findLiveAdAccount } from "@chanlytics/db/ads";
import { readAdsOffered } from "../../../../connections/ads-ready";
import { load } from "../../../../shared/reader";
import * as readers from "../../../../readers/facts";
import { defineAct, type ProposalOutcome, type ToolContext } from "../../context/tool-defs";
import { propose, refuse } from "../../context/context";

/**
 * A new ad, asked for in AI's own turn (the Ads plan's 6.3 and 6.7, "Who calls the writer"; decision 0050, call 12).
 * The card it proposes is drafted on its press by New ad's own route (POST ads/draft), with the same builder as + New,
 * kept as the workspace's draft, and New ad opens on it, where the ad writer writes its words as it does for + New. So
 * AI decides none of the draft: code picks the picture, the area, the amount and the end from the business's own
 * numbers, and the service where none was named. Nothing here or on the press makes anything at Meta, holds a token
 * or spends there: only the owner's Turn on in New ad can. The act never acts, as every act.
 *
 * The owner may say, once in a sentence, the most any ad may cost (the plan's G6). The card carries it only where it
 * is the owner's own turn and the number is one they said in it, and its press keeps it on the ad account.
 */

/** What the model is told where no card is made, or where the card leaves something out. Said to the model only. */
const AD_REFUSED = {
  notHere: "Ads are not switched on in this workspace yet, so no ad can be drafted here. Say so.",
  noAccount:
    "No Meta ad account is connected, so no ad can be drafted yet. The owner connects one on the Ads page, then asks again.",
  noService: (named: string, services: readonly string[]) =>
    services.length > 0
      ? `Services lists no "${named}". Its services are: ${services.join(", ")}. Ask which one, or leave the service out.`
      : `Services lists no "${named}", and no service at all yet: an ad offers one of them. Say so.`,
  mostNotOwner: "Only the owner can say the most an ad may cost, so the card leaves it out. Say so.",
  mostNotSaid: "The most an ad may cost is kept only as the owner said it in this question, so the card leaves it out.",
} as const;

/** The card's words, as the member reads them on it. */
const AD_CARD = {
  // A service's own name is free text that can run to a sentence: a long one is the summary's, not the title's.
  title: (service: string | null) => (service && service.length <= 40 ? `New ad for ${service}` : "New ad"),
  named: (service: string) => `For ${service}.`,
  summary: (owner: boolean) =>
    owner
      ? "AI drafts it in New ad from your own numbers and writes its words. Nothing runs until you turn it on."
      : "AI drafts it in New ad and writes its words, and it is left for the owner. Nothing runs until they turn it on.",
  most: (units: number, currency: string) => `From now on, no ad costs more than ${units} ${currency}.`,
} as const;

/** Whether a number is one the member wrote in this question, as they wrote it or with its thousands run together. */
function saidInQuestion(units: number, question: string | undefined): boolean {
  const written = (question ?? "").replace(/(\d)[,.\s](?=\d{3}\b)/gu, "$1");
  const numbers: string[] = written.match(/\d+/gu) ?? [];
  return numbers.includes(String(units));
}

/** The names Services lists, which a service the person named is matched against. */
async function servicesOf(toolContext: ToolContext): Promise<string[]> {
  const row = (await load(toolContext.rc, readers.config, undefined)).data;
  const parsed = parseTenantConfigResult(row?.config ?? null);
  return parsed.ok ? (parsed.config.brain?.profile?.services ?? []).map((service) => service.name) : [];
}

async function adDraftOutcome(
  toolContext: ToolContext,
  input: { service?: string | undefined; most?: number | undefined },
): Promise<ProposalOutcome> {
  const { rc } = toolContext;
  if (!(await readAdsOffered(rc.tenantId))) return refuse(AD_REFUSED.notHere);
  const account = await findLiveAdAccount(rc.ctx.supabase, rc.tenantId, "meta");
  if (account === null || account.status !== "connected" || account.currency === null)
    return refuse(AD_REFUSED.noAccount);
  const asked = input.service?.trim() ?? "";
  const services = asked ? await servicesOf(toolContext) : [];
  const service = asked ? (services.find((name) => name.trim().toLowerCase() === asked.toLowerCase()) ?? null) : null;
  if (asked && service === null) return refuse(AD_REFUSED.noService(asked, services));
  const owner = ROLE_PERMS[toolContext.role].ads;
  const mostAsked = input.most;
  const mostLeft = mostAsked === undefined ? null : !owner ? AD_REFUSED.mostNotOwner : null;
  const mostSaid = mostAsked !== undefined && owner && saidInQuestion(mostAsked, toolContext.question);
  const noted = mostLeft ?? (mostAsked !== undefined && !mostSaid ? AD_REFUSED.mostNotSaid : undefined);
  const most = mostSaid ? mostAsked : null;
  return propose(
    {
      kind: "ad_draft",
      title: AD_CARD.title(service),
      summary: [
        service && service.length > 40 ? AD_CARD.named(service) : null,
        AD_CARD.summary(owner),
        most === null ? null : AD_CARD.most(most, account.currency),
      ]
        .filter(Boolean)
        .join(" "),
      payload: { service, most },
    },
    noted,
  );
}

export const adDraftAct = defineAct({
  name: "propose_ad",
  description:
    "Draft a new ad for Facebook and Instagram. Its press drafts it in New ad, which picks the amount, the area and the dates and writes the words: never say them yourself. Nothing runs or is spent until Turn on is pressed there.",
  kind: "ad_draft",
  input: z.object({
    service: z
      .string()
      .optional()
      .describe("A service by its name in Services, where they named one."),
    most: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Only where the owner said in this question the most any ad may cost: whole units of their currency."),
  }),
  label: "Drafting the ad",
  build: adDraftOutcome,
});
