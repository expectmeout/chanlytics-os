import "server-only";
import { z } from "zod";
import { ROLE_PERMS, fileSaidOf, parseTenantConfigResult } from "@chanlytics/contracts";
import { findLiveAdAccount } from "@chanlytics/db/ads";
import { readAdsOffered } from "../../../../connections/ads-ready";
import { readPieceAdStands, type PieceAdStands } from "../../../../content/ad-pictures";
import { filesNamedForAsk } from "../../../../readers/files";
import { load } from "../../../../shared/reader";
import * as readers from "../../../../readers/facts";
import { defineAct, type ProposalOutcome, type ToolContext } from "../../context/tool-defs";
import { propose, refuse } from "../../context/context";
import { filesNamed } from "../../read/files";

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
 *
 * The card shows the piece AI made that the question is about (the piece open in Content, or one named in the turn),
 * where Content's one rule lets it run (server content/ad-pictures.ts readPieceAdStands), and its press drafts around
 * it as Run as an ad does (the plan's 6.8, join 3). Where the rule says no, the model is told why and no card is made.
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
  noFile: (named: string) => `No file named ${named}. A file goes by its name as files lists it.`,
  pieceGone: "The piece this question is about isn't in Files any more, so no card can show it. Say so.",
  notMade: (pieceName: string) =>
    `${pieceName} isn't a piece AI made, so no card can show it. Leave file out, and New ad picks the picture.`,
  aside: (pieceName: string) =>
    `${pieceName} is set aside. It can run as an ad once it is put back in Campaigns › Content. Say so.`,
  notFiled: (pieceName: string) => `${pieceName} isn't filed yet, so it can't run as an ad. Say so.`,
  notPlayable: (pieceName: string) =>
    `${pieceName} can't be played yet, so it can't run as an ad until it is ready. Say so.`,
  wont: (pieceName: string, issue: AdPieceWhy, video: boolean) =>
    `${pieceName} can't run as an ad: ${AD_PIECE_WHY[issue]}.${video && VIDEO_POST_MENDS.includes(issue) ? " A picture post made from it can." : ""} Say so, and propose no ad.`,
} as const;

type AdPieceWhy = Extract<PieceAdStands, { is: "wont" }>["why"];

/** Why a piece may not run as an ad, by Content's one rule (contracts ads/draft.ts adPictureIssue). Said to the model. */
const AD_PIECE_WHY = {
  person: "someone in it hasn't said yes to ads. Once the owner tells you who said yes, it can",
  music: "it has music, and an ad carries none yet",
  unheard: "its sound isn't heard yet, and an ad shows only a video heard to have no music",
  before_after: "it sets a before beside an after, which Meta refuses in an ad",
  small: "it's too small for an ad",
  shape: "its shape doesn't fit an ad in the feed",
  length: "it runs too long or too short for an ad, which takes 3 to 60 seconds",
} as const satisfies Record<AdPieceWhy, string>;

/** What of a video a picture post from its best moment leaves behind, as Content's line offers one (run-as-ad.ts). */
const VIDEO_POST_MENDS: readonly AdPieceWhy[] = ["music", "unheard", "shape", "length"];

/** The card's words, as the member reads them on it. */
const AD_CARD = {
  // A service's own name is free text that can run to a sentence: a long one is the summary's, not the title's.
  title: (service: string | null, piece: string | null) =>
    service && service.length <= 40
      ? `New ad for ${service}`
      : piece && piece.length <= 40
        ? `Run ${piece} as an ad`
        : "New ad",
  named: (service: string) => `For ${service}.`,
  shows: (piece: string) => `Shows ${piece}.`,
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
async function serviceNamesOf(toolContext: ToolContext): Promise<string[]> {
  const row = (await load(toolContext.rc, readers.config, undefined)).data;
  const parsed = parseTenantConfigResult(row?.config ?? null);
  return parsed.ok ? (parsed.config.brain?.profile?.services ?? []).map((service) => service.name) : [];
}

/** The piece a card shows: its id and its name as a person reads it. */
type AdPiece = { id: string; name: string };

/**
 * The piece the card is to show: the one named, else the one the question is about; none where neither is, or where
 * the question is about a file AI did not make (the draft's own pick). Or why it can't run, by Content's one rule.
 */
async function adPieceOf(
  toolContext: ToolContext,
  named: string | undefined,
): Promise<AdPiece | null | { refused: string }> {
  const sought = named?.trim() || toolContext.subjectFile;
  if (!sought) return null;
  const { files } = (await load(toolContext.rc, filesNamedForAsk, { names: [sought] })).data;
  const file = filesNamed(files, [sought]).found.at(0);
  if (!file) return { refused: named?.trim() ? AD_REFUSED.noFile(sought) : AD_REFUSED.pieceGone };
  const pieceName = fileSaidOf(file.name);
  if (file.source !== "made") return named?.trim() ? { refused: AD_REFUSED.notMade(pieceName) } : null;
  if (file.status === "set_aside") return { refused: AD_REFUSED.aside(pieceName) };
  if (file.status !== "filed") return { refused: AD_REFUSED.notFiled(pieceName) };
  const stands = await readPieceAdStands(toolContext.rc, file);
  // Null of a made piece where Ads is offered (the turn checked) is a video not ready to play.
  if (stands === null) return { refused: AD_REFUSED.notPlayable(pieceName) };
  if (stands.is === "no_account") return { refused: AD_REFUSED.noAccount };
  if (stands.is === "wont") return { refused: AD_REFUSED.wont(pieceName, stands.why, file.kind === "video") };
  return { id: file.id, name: pieceName };
}

/** The card's title and summary: the service, else the piece, in the title, and the other said once below it. */
function adCardWordsOf(card: {
  service: string | null;
  piece: AdPiece | null;
  owner: boolean;
  most: number | null;
  currency: string;
}): { title: string; summary: string } {
  const { service, piece, most } = card;
  const title = AD_CARD.title(service, piece?.name ?? null);
  const summary = [
    service && service.length > 40 ? AD_CARD.named(service) : null,
    piece && !title.includes(piece.name) ? AD_CARD.shows(piece.name) : null,
    AD_CARD.summary(card.owner),
    most === null ? null : AD_CARD.most(most, card.currency),
  ];
  return { title, summary: summary.filter(Boolean).join(" ") };
}

async function adDraftOutcome(
  toolContext: ToolContext,
  input: { service?: string | undefined; most?: number | undefined; file?: string | undefined },
): Promise<ProposalOutcome> {
  const { rc } = toolContext;
  if (!(await readAdsOffered(rc.tenantId))) return refuse(AD_REFUSED.notHere);
  const account = await findLiveAdAccount(rc.ctx.supabase, rc.tenantId, "meta");
  if (account === null || account.status !== "connected" || account.currency === null)
    return refuse(AD_REFUSED.noAccount);
  const wanted = input.service?.trim() ?? "";
  const services = wanted ? await serviceNamesOf(toolContext) : [];
  const service = wanted ? (services.find((name) => name.trim().toLowerCase() === wanted.toLowerCase()) ?? null) : null;
  if (wanted && service === null) return refuse(AD_REFUSED.noService(wanted, services));
  const piece = await adPieceOf(toolContext, input.file);
  if (piece !== null && "refused" in piece) return refuse(piece.refused);
  const owner = ROLE_PERMS[toolContext.role].ads;
  const mostAsked = input.most;
  const mostLeft = mostAsked === undefined ? null : !owner ? AD_REFUSED.mostNotOwner : null;
  const mostSaid = mostAsked !== undefined && owner && saidInQuestion(mostAsked, toolContext.question);
  const noted = mostLeft ?? (mostAsked !== undefined && !mostSaid ? AD_REFUSED.mostNotSaid : undefined);
  const most = mostSaid ? mostAsked : null;
  return propose(
    {
      kind: "ad_draft",
      ...adCardWordsOf({ service, piece, owner, most, currency: account.currency }),
      payload: { service, most, picture: piece?.id ?? null },
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
    service: z.string().optional().describe("A service by its name in Services, where they named one."),
    file: z
      .string()
      .optional()
      .describe(
        "A piece AI made, by its name in files, where they named one. The piece the question is about needs none.",
      ),
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
