import "server-only";
import {
  exampleParams,
  previewSays,
  previewVersionsOf,
  renderTemplate,
  type ConsentChannel,
  type ParamSpec,
} from "@chanlytics/contracts";
import { load } from "../../../readers";
import { templates as templatesReader } from "../../../readers/templates";
import type { ToolContext } from "../context";

/**
 * What a campaign card quotes of the message it proposes to send, as the person reached reads it. A proposal that names no
 * channel goes by WhatsApp alone and quotes the template's words, as it always did. One that names channels quotes each of
 * them in its own version (contracts previewSays: "By email: “A note, Dani” — Hi Dani, …"), read from the rows the composers
 * read (readers/templates.ts, once a turn) and filled as their previews fill them: an approval must say what goes, and the
 * WhatsApp words under an email's or a text's name were not it. A channel the message has no version on is refused, in words
 * that say what to do, never quoted as another's. `limit` is the room the card has for the words, shared between channels.
 */
export async function cardSays(
  t: ToolContext,
  tpl: { name: string; language: string; body_preview: string | null },
  specs: readonly ParamSpec[],
  by: { channels: ConsentChannel[]; named: boolean },
  limit: number,
): Promise<{ says: string } | { refusal: string }> {
  const values = exampleParams(specs, "the business");
  const whatsapp = renderTemplate(tpl.body_preview, values);
  if (!by.named) return { says: `${whatsapp.slice(0, limit)}${whatsapp.length > limit ? "…" : ""}` };
  const rows = (await load(t.rc, templatesReader, { all: false })).data.templates;
  const said = previewSays(by.channels, {
    whatsapp,
    versions: previewVersionsOf(rows, tpl.name, tpl.language),
    values,
    language: tpl.language,
    limit,
  });
  return "missing" in said
    ? { refusal: `${said.why} Say so: write it under Campaigns › Messages first, or leave that channel out` }
    : said;
}
