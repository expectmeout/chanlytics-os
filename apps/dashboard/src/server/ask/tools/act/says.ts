import "server-only";
import {
  CAMPAIGN_ROOMS,
  CONSENT_CHANNELS,
  exampleParams,
  noVersionWords,
  previewParts,
  previewSays,
  previewVersionsOf,
  renderTemplate,
  type ConsentChannel,
  type ParamSpec,
} from "@chanlytics/contracts";
import type { WriteMessageBody } from "../../../campaigns/write-message";
import type { AskedMessage } from "../context";

/** The business a card's example values name, as every card says it: no business's own name is read for a quote. */
const EXAMPLE_BUSINESS = "the business";

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
  const values = exampleParams(specs, EXAMPLE_BUSINESS);
  const row = rows.find((r) => r.id === message.versions.whatsapp?.id);
  const whatsapp = row ? renderTemplate(row.body_preview, values) : null;
  const missing = (why: string) => ({
    refusal: `${why} Say so: write it under ${CAMPAIGN_ROOMS.home} › ${CAMPAIGN_ROOMS.library} first, or leave that channel out`,
  });
  if (!by.named)
    return whatsapp === null
      ? missing(noVersionWords("whatsapp"))
      : { says: `${whatsapp.slice(0, limit)}${whatsapp.length > limit ? "…" : ""}` };
  if (whatsapp === null && by.channels.includes("whatsapp")) return missing(noVersionWords("whatsapp"));
  const said = previewSays(by.channels, {
    whatsapp: whatsapp ?? "",
    versions: previewVersionsOf(rows, message.name, message.language),
    values,
    language: message.language,
    limit,
  });
  return "missing" in said ? missing(said.why) : said;
}

/** The example a written message's value is quoted with (contracts exampleParams): a typed value is its own name. */
export const slotExample = (s: { label: string; kind: ParamSpec["kind"] }): string =>
  exampleParams([s.kind === "text" ? { kind: "text", value: s.label } : { kind: s.kind }], EXAMPLE_BUSINESS)[0] ??
  s.label;

/**
 * What a message card quotes of the message it writes (propose_campaign's action message), which no row holds yet: every
 * version as the person reached on it reads it, in the page's channel order, its values filled with their examples
 * (`slots`, each with its example), through the one fill a send makes (contracts previewParts, which previewSays quotes):
 * whole for the card's rows, an email's subject on a line of its own above its words, and in `limit` characters shared
 * between them for its summary.
 */
export function writtenSays(
  body: Pick<WriteMessageBody, "versions" | "language" | "slots">,
  limit: number,
): { says: string; rows: Array<{ channel: ConsentChannel; label: string; words: string }> } {
  const { whatsapp, email, sms } = body.versions;
  const channels = CONSENT_CHANNELS.filter((c) => body.versions[c]);
  const o = {
    whatsapp: whatsapp
      ? renderTemplate(
          whatsapp.body,
          body.slots.map((s) => s.example ?? ""),
        )
      : "",
    versions: {
      ...(email ? { email: { subject: email.subject, body: email.body } } : {}),
      ...(sms ? { sms: { subject: null, body: sms.body } } : {}),
    },
    values: body.slots.map((s) => s.example ?? ""),
    language: body.language,
  };
  const whole = previewParts(channels, o);
  const said = previewSays(channels, { ...o, limit });
  // Every channel named has its version in hand, so neither is ever missing one.
  if ("missing" in whole || "missing" in said) throw new Error("writtenSays: a version named and not given");
  return {
    says: said.says,
    rows: whole.parts.map((p) => ({
      channel: p.channel,
      label: p.label,
      words: p.subject ? `“${p.subject}”\n${p.body}` : p.body,
    })),
  };
}
