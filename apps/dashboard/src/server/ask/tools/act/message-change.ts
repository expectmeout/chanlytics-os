import "server-only";
/**
 * A message on file changed from Ask (the message sheet's review, 12 Nov 2026: Ask could write a new message and change
 * none): its words on one channel, its name, put away or brought back, or deleted in a language. Each is a card, never a
 * write, made only where the door its Approve calls would take it, by that door's own checks: WhatsApp's words by the edit
 * door's (template-words.ts checkWordsBack), an email's or a text's by their channel's rules against the message's values
 * (contracts channelNeverCarries, validateOwnVersion), a delete by the delete door's (template-row.ts getDeleteRefusal).
 * The message is found by any of its versions' ids, as sequences with action messages lists them; the card quotes the
 * words it had beside the ones it gets, filled with the values' examples as the new-message card fills them. A new
 * language of a message is action message, under its name in that language.
 */
import { z } from "zod";
import {
  DbFailure,
  MESSAGE_CHANGE_WORDS,
  TEMPLATE_TITLE_MAX,
  channelNeverCarries,
  languageName,
  purposeOfTemplate,
  recordOrNull,
  renderTemplate,
  templateTitle,
  textOrEmpty,
  validateOwnVersion,
  versionWord,
  versionWords,
} from "@chanlytics/contracts";
import {
  findMessageSlots,
  listMessageVersionRows,
  listRunningStepsOfTemplate,
  type MessageVersionRow,
} from "@chanlytics/db/campaigns";
import { getDeleteRefusal } from "../../../campaigns/template-row";
import { checkWordsBack } from "../../../campaigns/template-words";
import { actAction, type ProposalOutcome, type ToolContext } from "../context/tool-defs";
import { propose, refuse } from "../context/context";
import { checkDoorRefusal } from "./message";

/** Where a message's version ids are read, said as the model calls it. */
const MESSAGES_FROM = "sequences with action messages (a version's id in its versions)";

/** A message's id field: any of its versions' ids (said once, in each action's words: the tools block has a ceiling). */
const TEMPLATE_ID = z.string();

/** A made-up id for the examples: never a row of any workspace. */
const EXAMPLE_ID = "0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";

const NO_MESSAGE = `no message of this workspace has that id; ${MESSAGES_FROM} lists them`;

type Message = NonNullable<Awaited<ReturnType<typeof findMessageByVersion>>>;

/** The message a version id names, in that version's language: its versions, the one that names it, and what it is called. */
async function findMessageByVersion(tool: ToolContext, id: string) {
  const rows = await listMessageVersionRows(tool.ctx.supabase, tool.tenantId, { id });
  // The row that names it, as the list reads it (contracts' anchor): WhatsApp's, else the email's, else the text's.
  const anchor = rows.find((r) => r.channel === "whatsapp") ?? rows.find((r) => r.channel === "email") ?? rows[0];
  if (!anchor) return null;
  const title = templateTitle(anchor.name, rows.find((r) => r.title)?.title ?? null);
  return { rows, anchor, title, name: anchor.name, language: anchor.language };
}

/** The steps that send the message now, by their names: what putting it away does not stop, and what pauses in review. */
async function sendersOf(tool: ToolContext, message: Message): Promise<string[]> {
  const { data, error } = await listRunningStepsOfTemplate(tool.ctx.supabase, tool.tenantId, message);
  if (error) throw new DbFailure(error, "what sends a message");
  return data.map((r) => String(r.name));
}

/** Words as a person reached reads them: each value filled with its example, as a preview and the new-message card fill it. */
function filled(rows: readonly MessageVersionRow[], words: string): string {
  const named = rows.find((r) => Array.isArray(r.variables) && r.variables.length > 0)?.variables;
  const values = (Array.isArray(named) ? named : [])
    .map(recordOrNull)
    .filter((v) => v !== null)
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((v) => textOrEmpty(v.example) || textOrEmpty(v.label));
  return renderTemplate(words, values);
}

/** Why new words on a channel would be refused, in the door's words, or null where its Approve would take them. */
async function wordsRefusal(
  tool: ToolContext,
  message: Message,
  channel: "whatsapp" | "email" | "sms",
  words: { subject: string | null; body: string },
): Promise<string | null> {
  const row = message.rows.find((r) => r.channel === channel) ?? null;
  if (channel === "whatsapp")
    return row
      ? checkDoorRefusal(() => checkWordsBack(tool.ctx, { id: row.id, tenant_id: tool.tenantId }, { body: words.body }))
      : "this message has no WhatsApp version to change; say so, and change its email or text, or write a new message with action message";
  // A text never carries an offer (the save door says the same), and the words keep the message's values.
  const never = channelNeverCarries(channel, purposeOfTemplate(message.anchor.category));
  if (never) return never;
  const slots = await findMessageSlots(tool.ctx.supabase, tool.tenantId, message.name, message.language);
  const check = validateOwnVersion(channel, words, slots ?? 0, message.language);
  return check.ok ? null : check.error;
}

/** New words for one channel's version: an email keeps the subject it has where a new one is not given. */
async function proposeWords(
  tool: ToolContext,
  input: { template_id: string; channel: "whatsapp" | "email" | "sms"; subject?: string | undefined; body: string },
): Promise<ProposalOutcome> {
  const message = await findMessageByVersion(tool, input.template_id);
  if (!message) return refuse(NO_MESSAGE);
  const row = message.rows.find((r) => r.channel === input.channel) ?? null;
  const was = row ? versionWords(row) : null;
  const body = input.body.trim();
  const subject = input.channel === "email" ? input.subject?.trim() || was?.subject || null : null;
  const refused = await wordsRefusal(tool, message, input.channel, { subject, body });
  if (refused) return refuse(refused);
  // WhatsApp's look: what pauses while it looks at an approved message's new words, where something sends it.
  const holds =
    input.channel === "whatsapp" && row?.meta_status === "approved"
      ? MESSAGE_CHANGE_WORDS.holdsWhileChecked(await sendersOf(tool, message), false)
      : null;
  const review = input.channel === "whatsapp" ? (holds ?? MESSAGE_CHANGE_WORDS.wordsReview) : null;
  return propose({
    kind: "message_words",
    title: MESSAGE_CHANGE_WORDS.wordsTitle(message.title, versionWord(input.channel)),
    summary: [
      MESSAGE_CHANGE_WORDS.wordsSaid(filled(message.rows, body), was ? filled(message.rows, was.body) : null),
      review,
    ]
      .filter(Boolean)
      .join(" · "),
    payload: {
      template_id: row?.id ?? message.anchor.id,
      name: message.name,
      language: message.language,
      channel: input.channel,
      title: message.title,
      ...(subject ? { subject } : {}),
      body,
      was: was ? { subject: was.subject, body: was.body } : null,
    },
  });
}

/** The message renamed in the workspace's own words: every version of it in the language, each keeping what it had for Undo. */
async function proposeRename(
  tool: ToolContext,
  input: { template_id: string; title: string },
): Promise<ProposalOutcome> {
  const message = await findMessageByVersion(tool, input.template_id);
  if (!message) return refuse(NO_MESSAGE);
  const title = input.title.replace(/\s+/g, " ").trim();
  if (!title) return refuse("say the name it should have");
  if (title.length > TEMPLATE_TITLE_MAX) return refuse(`a message's name is at most ${TEMPLATE_TITLE_MAX} characters`);
  if (title === message.title) return refuse(`it is already called “${title}”: say so, and change nothing`);
  return propose({
    kind: "message_rename",
    title: MESSAGE_CHANGE_WORDS.renameTitle(message.title),
    summary: MESSAGE_CHANGE_WORDS.renameSaid(
      title,
      message.rows.some((r) => r.channel === "whatsapp"),
    ),
    payload: {
      name: message.name,
      title,
      was: message.title,
      versions: message.rows.map((r) => ({ channel: r.channel, id: r.id, had_title: r.title ?? null })),
    },
  });
}

/** The message put away, or brought back; what still sends it is said, which putting it away does not stop. */
async function proposeAway(tool: ToolContext, input: { template_id: string; away: boolean }): Promise<ProposalOutcome> {
  const message = await findMessageByVersion(tool, input.template_id);
  if (!message) return refuse(NO_MESSAGE);
  if (!!message.anchor.hidden_at === input.away)
    return refuse(`it is already ${input.away ? "put away" : "in the list"}: say so, and change nothing`);
  const senders = input.away ? await sendersOf(tool, message) : [];
  return propose({
    kind: "message_away",
    title: MESSAGE_CHANGE_WORDS.awayTitle(message.title, input.away),
    summary: MESSAGE_CHANGE_WORDS.awaySaid(input.away, senders.length ? senders.map((n) => `“${n}”`).join(", ") : null),
    payload: { template_id: message.anchor.id, name: message.name, title: message.title, away: input.away },
  });
}

/** The message deleted in its language, every version of it there, as the delete door would take it. */
async function proposeDelete(tool: ToolContext, input: { template_id: string }): Promise<ProposalOutcome> {
  const message = await findMessageByVersion(tool, input.template_id);
  if (!message) return refuse(NO_MESSAGE);
  const refused = await getDeleteRefusal(tool.ctx, tool.tenantId, message);
  if (refused) return refuse(`${refused} Say so.`);
  const order = ["whatsapp", "email", "sms"] as const;
  const versions = order.flatMap((c) =>
    message.rows.filter((r) => r.channel === c).map((r) => ({ channel: c, id: r.id })),
  );
  return propose({
    kind: "message_delete",
    // A delete is of one language, as its doors' are: the card says which.
    title: MESSAGE_CHANGE_WORDS.deleteTitle(message.title, languageName(message.language)),
    summary: MESSAGE_CHANGE_WORDS.deleteSaid(
      versions.map((v) => versionWord(v.channel)),
      false,
    ),
    payload: { name: message.name, language: message.language, title: message.title, versions },
  });
}

/** propose_sequence's actions on a message on file: its words, its name, put away or back, deleted. */
export const messageChangeActions = {
  message_words: actAction({
    kind: "message_words",
    input: z.object({
      template_id: TEMPLATE_ID,
      channel: z.enum(["whatsapp", "email", "sms"]),
      subject: z.string().optional(),
      body: z.string(),
    }),
    examples: [{ template_id: EXAMPLE_ID, channel: "email", body: "Hi {{1}}, did you read the proposal?" }],
    label: "Writing the new words",
    words:
      "Action message_words changes a message's words on one channel: template_id (a version's id, from sequences' messages), channel and body, its values kept ({{1}}); subject where an email's changes, or it has no email yet. Read its words first (messages with its name) and change only what was asked, adding no price or promise. WhatsApp reviews its own again (approved words: one change a day); an email's or a text's are saved at once, or written where missing.",
    build: proposeWords,
  }),
  message_rename: actAction({
    kind: "message_rename",
    input: z.object({
      template_id: TEMPLATE_ID,
      title: z.string(),
    }),
    examples: [{ template_id: EXAMPLE_ID, title: "Proposal follow-up" }],
    label: "Preparing the new name",
    words: `Action message_rename names a message in the business's own words (template_id, title: at most ${TEMPLATE_TITLE_MAX} characters), every version in its language.`,
    build: proposeRename,
  }),
  message_away: actAction({
    kind: "message_away",
    input: z.object({
      template_id: TEMPLATE_ID,
      away: z.boolean(),
    }),
    examples: [{ template_id: EXAMPLE_ID, away: true }],
    label: "Preparing to put it away",
    words:
      "Action message_away puts a message away (template_id, away true: off the list, still sent by what sends it) or brings it back (false).",
    build: proposeAway,
  }),
  message_delete: actAction({
    kind: "message_delete",
    input: z.object({ template_id: TEMPLATE_ID }),
    examples: [{ template_id: EXAMPLE_ID }],
    label: "Preparing the delete",
    words:
      "Action message_delete deletes a message in its language (template_id), every version; refused while something sends it. No undo.",
    build: proposeDelete,
  }),
};
