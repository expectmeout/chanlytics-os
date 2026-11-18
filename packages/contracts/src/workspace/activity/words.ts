/** Activity: words. */

import { LEAD_ENDING_WORDS } from "../../leads/search/endings";
import type { LeadRoundEnding } from "../../leads/search/sets";
import { WHOLE_SENTENCE, humanize, numberAt, settingsChangedWords, textAt } from "./kinds";
import { WORDS } from "./dtos";

/**
 * What an export took: the workspace's file is its records, and says what it leaves out (contracts EXPORT_OF; the wiring's
 * second audit, R14 X1), never "everything".
 */
const exportedWords = (text: string): string =>
  text === "workspace"
    ? "the records"
    : text === "people"
      ? "everyone as a CSV"
      : text === "person"
        ? "a person's records"
        : `a ${text}`;

/** A kind's words, but where its payload says the kind is said another way. */
function baseWords(kind: string, item: Record<string, unknown>): string {
  // A take-over on a call is the Inbox's verb with a different subject: the
  // receptionist passed the caller to the business's own line.
  if (kind === "take_over" && textAt(item, "how") === "transfer") return "Took over a call";
  // A copy that went by itself (00630 file_twin_goes): the photo it copied stays. It read "A photo was deleted", as if
  // someone had (16 Nov 2026).
  if (kind === "file.removed" && textAt(item, "why") === "twin") return "AI kept one of two copies of a photo";
  // A found video passed over as the video platform said its length (00642 file_media_ready): nobody deleted it.
  if (kind === "file.removed" && textAt(item, "why") === "long") return "AI passed over a video too long to watch";
  if (kind === "file.removed" && textAt(item, "why") === "minutes") return "AI passed over a video with no room for it";
  return WORDS[kind] ?? humanize(kind);
}

/**
 * The sentence for a row: the kind's words, then the one or two fields a
 * reader wants and nothing else of the payload.
 */
export function activityWords(kind: string, payload: unknown): string {
  const item = (payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}) as Record<
    string,
    unknown
  >;
  const base = baseWords(kind, item);
  // A kind whose sentence is its own, not the kind's words and a field or two.
  const whole = WHOLE_SENTENCE.get(kind);
  if (whole) return whole(item, base);
  const bits: string[] = [];
  switch (kind) {
    case "take_over": {
      if (textAt(item, "how") === "transfer") bits.push("passed to the business's line");
      break;
    }
    case "consent_change":
    case "contact.consent_changed": {
      const purpose =
        textAt(item, "purpose") === "marketing"
          ? "offers"
          : textAt(item, "purpose") === "email_marketing"
            ? "marketing email"
            : "messages";
      const consent = textAt(item, "consent");
      bits.push(
        consent === "opted_in"
          ? `yes to ${purpose}`
          : consent === "opted_out"
            ? `no to ${purpose}`
            : `${purpose}: not asked`,
      );
      const source = textAt(item, "source");
      if (source && source !== "operator") bits.push(source.replace(/_/g, " "));
      break;
    }
    case "change_role": {
      const role = textAt(item, "role") ?? textAt(item, "to");
      if (role) bits.push(`to ${role}`);
      break;
    }
    case "export": {
      const text = textAt(item, "what");
      if (text) bits.push(exportedWords(text));
      const rows = numberAt(item, "rows");
      if (rows !== null) bits.push(`${rows} rows`);
      break;
    }
    case "pause_agent":
    case "resume_agent": {
      const mode = textAt(item, "receptionist_mode");
      if (mode) bits.push(mode === "inherit" ? "follows the workspace" : mode);
      const batch = numberAt(item, "batch");
      if (batch) bits.push(`one of ${batch}`);
      break;
    }
    case "send_broadcast": {
      const name = textAt(item, "name");
      if (name) bits.push(name);
      const n = numberAt(item, "recipients");
      if (n !== null) bits.push(`${n} people`);
      if (item.approved === true) bits.push("approved by hand");
      break;
    }
    case "settings.changed": {
      const sentence = settingsChangedWords(item);
      if (sentence) bits.push(sentence);
      break;
    }
    case "policy.changed": {
      const cls = textAt(item, "class");
      const mode = textAt(item, "mode");
      if (cls) bits.push(cls);
      if (mode) bits.push(mode);
      break;
    }
    case "line.texting_rejected":
    case "line.failed": {
      const reason = textAt(item, "error") ?? textAt(item, "reason");
      if (reason) bits.push(reason.slice(0, 80));
      break;
    }
    case "platform.acted": {
      const action = textAt(item, "action");
      if (action) bits.push(action);
      break;
    }
    case "playbook.run": {
      const outcome = textAt(item, "outcome");
      if (outcome) bits.push(outcome);
      const n = numberAt(item, "recipients") ?? numberAt(item, "count");
      if (n !== null) bits.push(`${n} people`);
      break;
    }
    case "lead.round": {
      // One kind carries a round's whole life (00140), so the state says which
      // moment this row is, and an ended one says why in the words the rest of
      // the product already uses for the nine endings. What it cost is the
      // workspace's business, not the log's.
      const state = textAt(item, "state");
      if (state === "ended") {
        bits.push("finished");
        const ending = textAt(item, "ending");
        if (ending && ending in LEAD_ENDING_WORDS) bits.push(LEAD_ENDING_WORDS[ending as LeadRoundEnding]);
        const counted = numberAt(item, "counted");
        if (counted !== null) bits.push(`${counted} found`);
      } else if (state) {
        bits.push(
          state === "queued"
            ? "started"
            : state === "waiting_on_owner"
              ? "waiting on your answer"
              : state.replace(/_/g, " "),
        );
      }
      break;
    }
    case "lead.no_card": {
      // An ask no source card covers, kept as demand: what was asked for, in
      // the owner's own words, and never a place.
      const card = textAt(item, "card");
      if (card) bits.push(card.replace(/_/g, " "));
      const text = textAt(item, "asked");
      if (text) bits.push(text.slice(0, 80));
      break;
    }
    default:
      break;
  }
  return bits.length ? `${base} · ${bits.join(" · ")}` : base;
}

export type { DecisionVerb as ActivityVerb } from "../../shared/enums";
