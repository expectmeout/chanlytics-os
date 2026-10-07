import "server-only";
import {
  PREVIEW_WORDS,
  exampleParams,
  previewSays,
  previewVersionsOf,
  renderTemplate,
  type ConsentChannel,
  type ParamSpec,
} from "@chanlytics/contracts";
import type { AskedMessage } from "../context";

/**
 * What a campaign card quotes of the message it proposes to send, as the person reached reads it. A proposal that names no
 * channel goes by WhatsApp alone and quotes its WhatsApp version's words, as it always did. One that names channels quotes
 * each of them in its own version (contracts previewSays: "By email: “A note, Dani” — Hi Dani, …"), read from the rows the
 * proposal's message was read from (tools/context.ts askedMessage) and filled as the composers' previews fill them: an
 * approval must say what goes, and the WhatsApp words under an email's or a text's name were not it. A channel the message
 * has no version on, WhatsApp among them, is refused, in words that say what to do, never quoted as another's. `limit` is
 * the room the card has for the words, shared between channels.
 */
export function cardSays(
  asked: Pick<AskedMessage, "message" | "rows">,
  specs: readonly ParamSpec[],
  by: { channels: ConsentChannel[]; named: boolean },
  limit: number,
): { says: string } | { refusal: string } {
  const { message, rows } = asked;
  const values = exampleParams(specs, "the business");
  const row = rows.find((r) => r.id === message.versions.whatsapp?.id);
  const whatsapp = row ? renderTemplate(row.body_preview, values) : null;
  const missing = (why: string) => ({
    refusal: `${why} Say so: write it under Campaigns › Messages first, or leave that channel out`,
  });
  if (!by.named)
    return whatsapp === null
      ? missing(PREVIEW_WORDS.noVersion("whatsapp"))
      : { says: `${whatsapp.slice(0, limit)}${whatsapp.length > limit ? "…" : ""}` };
  if (whatsapp === null && by.channels.includes("whatsapp")) return missing(PREVIEW_WORDS.noVersion("whatsapp"));
  const said = previewSays(by.channels, {
    whatsapp: whatsapp ?? "",
    versions: previewVersionsOf(rows, message.name, message.language),
    values,
    language: message.language,
    limit,
  });
  return "missing" in said ? missing(said.why) : said;
}
