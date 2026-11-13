import "server-only";
import { z } from "zod";
import {
  AppError,
  CONSENT_CHANNELS,
  MESSAGE_BEGIN_WORDS,
  MESSAGE_WORDS,
  OWN_VERSION_CHANNELS,
  PARAM_SOURCES,
  channelNeverCarries,
  consentGuardWords,
  messageLanguageCode,
  purposeOfTemplate,
  slugTemplateName,
  templateBodyTooLong,
  templateTitle,
} from "@chanlytics/contracts";
import { getChannelsReady } from "../../../campaigns/channels-ready";
import { refuseWrittenUtility } from "../../../campaigns/template-versions";
import {
  checkMessage,
  findHeldValues,
  getMessageOnFile,
  getWhatsAppFilingRefusal,
  type WriteMessageBody,
} from "../../../campaigns/write-message";
import { log } from "@/server/shared/log";
import { writeCustomerMessage } from "../../skills/customer-message";
import { actAction, type ProposalOutcome, type ToolContext } from "../context/tool-defs";
import { propose, refuse } from "../context/context";
import { slotExample, writtenSays } from "./says";

/** The room a card's summary has for its versions' words, shared between them (each a line's worth at the least). */
const SAID_ROOM = 240;

/** What the door says of a check it makes, or null where it passes: a refusal in its words, never a fault. */
function doorSays(check: () => void): string | null {
  try {
    check();
    return null;
  } catch (e) {
    if (e instanceof AppError) return e.message;
    throw e;
  }
}

/** The same for a check that reads: the door's words, or null. Ask's card on a message on file asks it too. */
export async function checkDoorRefusal(check: () => Promise<unknown>): Promise<string | null> {
  try {
    await check();
    return null;
  } catch (e) {
    if (e instanceof AppError) return e.message;
    throw e;
  }
}

/** What a message card is written from (messageAction's input): its name and language, its kind, its versions, its values. */
interface MessageAsked {
  name: string;
  language: "en" | "es";
  category: "marketing" | "utility";
  versions: WriteMessageBody["versions"];
  slots?: Array<{ position: number; label: string; kind: WriteMessageBody["slots"][number]["kind"] }> | undefined;
}

/**
 * The checks of the message's own words, which read nothing, in the door's order (POST templates/message,
 * campaigns/write-message.ts): a text of an offer, a message about their appointment with no WhatsApp version, a WhatsApp
 * version past what WhatsApp takes, each in MESSAGE_WORDS (which opens with the door's sentence); then every other check
 * the door makes of the words, in its own. Null where all pass.
 */
function wordsRefusal(body: WriteMessageBody): string | null {
  const v = body.versions;
  const purpose = purposeOfTemplate(body.category);
  if (CONSENT_CHANNELS.some((c) => v[c] && channelNeverCarries(c, purpose))) return MESSAGE_WORDS.smsOffer;
  if (!v.whatsapp && doorSays(() => refuseWrittenUtility(body.category, MESSAGE_BEGIN_WORDS.utilityNeedsWhatsapp)))
    return MESSAGE_WORDS.utilityNeedsWhatsapp;
  if (v.whatsapp && templateBodyTooLong(v.whatsapp.body)) return MESSAGE_WORDS.tooLong;
  return doorSays(() => checkMessage(body));
}

/**
 * The checks that read the workspace, each the door's own: a WhatsApp version needs a number whose WhatsApp Business
 * Account is on file (write-message.ts getWhatsAppFilingRefusal, the one check for both); and the Library may hold
 * neither the message (a twin, in MESSAGE_WORDS) nor a language of it said otherwise (the door's words). An email version
 * is no refusal where email cannot send yet: the door keeps it, as the page does, and the card says when it goes
 * (emailWaits). Null where all pass.
 */
async function workspaceRefusal(toolContext: ToolContext, body: WriteMessageBody): Promise<string | null> {
  const [whatsapp, twin] = await Promise.all([
    body.versions.whatsapp ? getWhatsAppFilingRefusal(toolContext.ctx, toolContext.tenantId) : null,
    getMessageOnFile(toolContext.ctx, toolContext.tenantId, body),
  ]);
  if (whatsapp) return whatsapp === "no_number" ? MESSAGE_WORDS.noNumber : MESSAGE_WORDS.noAccount;
  if (twin) return MESSAGE_WORDS.twin(templateTitle(body.name, body.title));
  return checkDoorRefusal(() => findHeldValues(toolContext.ctx, toolContext.tenantId, body));
}

/** Where an email version cannot go yet (known: no mailbox, or none for the deployment), why, said under the card. */
async function emailWaits(toolContext: ToolContext, body: WriteMessageBody): Promise<string | null> {
  if (!body.versions.email) return null;
  const ready = await getChannelsReady(toolContext.ctx, toolContext.tenantId, { fresh: false, withPause: false });
  // Not known (the edge did not answer) is no "no": nothing is said.
  return ready.email.ready || ready.email.unchecked ? null : MESSAGE_WORDS.emailWaits(ready.email.why);
}

/**
 * A message written for the Library (the marketing manager's spec §5.2, D1): one name and language, a version per channel,
 * and the values they share. A card, never a write: it is made only where POST templates/message, which its Approve calls,
 * would file it, by that door's own checks (wordsRefusal, workspaceRefusal), and it quotes every version as the person
 * reached on it reads it, with example values, says when each can go and who the message's kind reaches (contracts
 * consentGuardWords, from the one consent rule), and carries the door's body. Each value's example is the one a preview
 * fills it with (slotExample), which WhatsApp's reviewers read too. Ask's versions are the first draft: the words quoted
 * and filed are the customer message writer's where it wrote them in time (writtenBody).
 */
async function proposeMessage(toolContext: ToolContext, input: MessageAsked): Promise<ProposalOutcome> {
  const slots = [...(input.slots ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({ position: s.position, label: s.label.trim(), example: slotExample(s), kind: s.kind }));
  // The name a person typed, as Meta takes one: "Autumn offer" is autumn_offer, and their words are its title. A name
  // given already as Meta takes one ("thanks_for_coming") is no title: it is read as its name made words.
  const name = slugTemplateName(input.name);
  const ownName = input.name.replace(/\s+/g, " ").trim();
  const body: WriteMessageBody = {
    name,
    ...(ownName && ownName !== name ? { title: ownName } : {}),
    // The language as the product files it (English under en_US, beside the starters), never as Ask named it.
    language: messageLanguageCode(input.language),
    category: input.category,
    versions: input.versions,
    slots,
  };
  const refused = wordsRefusal(body) ?? (await workspaceRefusal(toolContext, body));
  if (refused) return refuse(refused);
  // The words the card quotes and files: the skill's, else the draft's, on the same channels, values and name.
  const written = await writtenBody(toolContext, input.language, body);
  const writtenWords = writtenSays(written, SAID_ROOM);
  const channels = CONSENT_CHANNELS.filter((c) => body.versions[c]);
  const purpose = purposeOfTemplate(body.category);
  // An offer is the business's news; a message about their appointment or proposal is theirs (contracts MessageAbout).
  const reaches = consentGuardWords(channels, purpose, purpose === "marketing" ? "ours" : "theirs");
  const goes = MESSAGE_WORDS.goes(
    OWN_VERSION_CHANNELS.filter((c) => body.versions[c]),
    !!body.versions.whatsapp,
  );
  // What follows the versions: when each goes, and who it reaches. The card draws the versions whole (`said`) and this
  // under them; the summary, which the model reads, quotes them before it.
  const waits = await emailWaits(toolContext, body);
  const follows = [goes, reaches.join(" "), waits].filter(Boolean).join(" · ");
  return propose({
    kind: "message",
    title: MESSAGE_WORDS.title(templateTitle(body.name, body.title), body.language),
    summary: `${writtenWords.says} · ${follows}`,
    payload: { ...written, said: writtenWords.rows, follows },
  });
}

/**
 * The card's words, once the first draft passed every check (Ask's own versions): the customer message writer's
 * (ask/skills), written again in the turn's time left, held to the skill's checks and then to the door's own checks of
 * the words, as the draft was; else the draft, as before the skill. Same name, kind, language and values either way, so
 * nothing the workspace's checks read changes. A plan's message step comes here too (act/plan.ts builds it by this action).
 */
async function writtenBody(toolContext: ToolContext, language: MessageAsked["language"], body: WriteMessageBody) {
  const result = await writeCustomerMessage(toolContext, {
    name: body.name,
    category: body.category,
    language,
    values: body.slots.map(({ position, label, kind }) => ({ position, label, kind })),
    draft: body.versions,
  });
  if (!result.wrote) return body;
  const crafted: WriteMessageBody = { ...body, versions: result.versions };
  const door = wordsRefusal(crafted);
  if (door === null) return crafted;
  log.warn("ask_skill_crafted", {
    tenant_id: toolContext.tenantId,
    skill: "customer_message",
    outcome: "kept",
    why: "door",
    detail: door.slice(0, 200),
  });
  return body;
}

/** A new message for the Library, a version per channel: propose_sequence's action message. */
export const messageAction = actAction({
  kind: "message",
  input: z.object({
    name: z.string(),
    language: z.enum(["en", "es"]),
    category: z.enum(["marketing", "utility"]),
    versions: z.object({
      whatsapp: z.object({ body: z.string() }).optional(),
      email: z.object({ subject: z.string(), body: z.string() }).optional(),
      sms: z.object({ body: z.string() }).optional(),
    }),
    slots: z.array(z.object({ position: z.number().int(), label: z.string(), kind: z.enum(PARAM_SOURCES) })).optional(),
  }),
  examples: [
    {
      name: "October offer",
      language: "en",
      category: "marketing",
      versions: {
        whatsapp: { body: "Hi {{1}}, everything at {{2}} is 10% off this month. Reply STOP to opt out." },
        email: { subject: "This month at {{2}}", body: "Hi {{1}}, everything at {{2}} is 10% off this month." },
      },
      slots: [
        { position: 1, label: "First name", kind: "first_name" },
        { position: 2, label: "Business name", kind: "business_name" },
      ],
    },
  ],
  label: "Writing a message",
  words:
    "Action message writes a new message for the Library and proposes it as a card: name (what they call it, in plain words: Autumn offer; its WhatsApp name is made from it), language (en or es, as the rule for a message's language says; another language is another card under the same name), category marketing (an offer or news) or utility (about their own appointment or proposal, which needs a whatsapp version), versions, each optional and at least one (whatsapp {body}, email {subject, body}, sms {body}, never sms for marketing), and slots naming the values {{1}}, {{2}} in order (position, label, kind: text, first_name, business_name, booking_link or review_link). Read sequences with action messages first: a name the Library holds in that language is refused. A whatsapp version needs a connected number and WhatsApp's review; an email version is kept even before email is set up, and goes once it is. Your versions are a first draft the message writer rewrites before the card is shown: put the facts in (the offer in their words and figures, its days), never a price they did not give. The card quotes every version; Approve files it, and nothing is sent.",
  build: proposeMessage,
});
