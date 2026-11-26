/** Activity: words. */

import { LEAD_ENDING_WORDS } from "../../leads/search/endings";
import { WHOLE_SENTENCE, humanize, numberAt, settingsChangedWords, textAt } from "./kinds";
import { WORDS } from "./dtos";
import { entryOf, recordOrEmpty } from "../../shared/unknown";

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
  // A found video passed over as the video platform said its length (00643 file_media_ready): nobody deleted it.
  if (kind === "file.removed" && textAt(item, "why") === "long") return "AI passed over a video too long to watch";
  if (kind === "file.removed" && textAt(item, "why") === "minutes") return "AI passed over a video with no room for it";
  return WORDS[kind] ?? humanize(kind);
}

type ActivityItem = Record<string, unknown>;

/** Consent: yes or no to what, and where it was said, but where an operator said it. */
function consentBits(item: ActivityItem): string[] {
  const purposeKey = textAt(item, "purpose");
  const purpose =
    purposeKey === "marketing" ? "offers" : purposeKey === "email_marketing" ? "marketing email" : "messages";
  const consent = textAt(item, "consent");
  const bits = [
    consent === "opted_in"
      ? `yes to ${purpose}`
      : consent === "opted_out"
        ? `no to ${purpose}`
        : `${purpose}: not asked`,
  ];
  const source = textAt(item, "source");
  if (source && source !== "operator") bits.push(source.replace(/_/g, " "));
  return bits;
}

/** An export: what it took, and how many rows. */
function exportBits(item: ActivityItem): string[] {
  const bits: string[] = [];
  const text = textAt(item, "what");
  if (text) bits.push(exportedWords(text));
  const rows = numberAt(item, "rows");
  if (rows !== null) bits.push(`${rows} rows`);
  return bits;
}

/** The receptionist paused or resumed for someone: the mode it is set to, and how many were pressed at once. */
function pausedBits(item: ActivityItem): string[] {
  const bits: string[] = [];
  const mode = textAt(item, "receptionist_mode");
  if (mode) bits.push(mode === "inherit" ? "follows the workspace" : mode);
  const batch = numberAt(item, "batch");
  if (batch) bits.push(`one of ${batch}`);
  return bits;
}

/** A broadcast sent: its name, how many people, and whether a person approved it. */
function broadcastBits(item: ActivityItem): string[] {
  const bits: string[] = [];
  const name = textAt(item, "name");
  if (name) bits.push(name);
  const n = numberAt(item, "recipients");
  if (n !== null) bits.push(`${n} people`);
  if (item.approved === true) bits.push("approved by hand");
  return bits;
}

/** A playbook's run: how it came out, and how many people. */
function playbookRunBits(item: ActivityItem): string[] {
  const bits: string[] = [];
  const outcome = textAt(item, "outcome");
  if (outcome) bits.push(outcome);
  const n = numberAt(item, "recipients") ?? numberAt(item, "count");
  if (n !== null) bits.push(`${n} people`);
  return bits;
}

/**
 * A lead search's round. One kind carries a round's whole life (00140), so the state says which moment this row is, and
 * an ended one says why in the words the rest of the product already uses for the nine endings. What it cost is the
 * workspace's business, not the log's.
 */
function leadRoundBits(item: ActivityItem): string[] {
  const state = textAt(item, "state");
  if (state !== "ended")
    return state
      ? [
          state === "queued"
            ? "started"
            : state === "waiting_on_owner"
              ? "waiting on your answer"
              : state.replace(/_/g, " "),
        ]
      : [];
  const bits = ["finished"];
  const ending = textAt(item, "ending");
  const endingWords = entryOf(LEAD_ENDING_WORDS, ending);
  if (endingWords) bits.push(endingWords);
  const counted = numberAt(item, "counted");
  if (counted !== null) bits.push(`${counted} found`);
  return bits;
}

/** An ask no source card covers, kept as demand: what was asked for, in the owner's own words, and never a place. */
function leadNoCardBits(item: ActivityItem): string[] {
  const bits: string[] = [];
  const card = textAt(item, "card");
  if (card) bits.push(card.replace(/_/g, " "));
  const text = textAt(item, "asked");
  if (text) bits.push(text.slice(0, 80));
  return bits;
}

/** One field, said as it is, where the row has it. */
const oneField =
  (key: string) =>
  (item: ActivityItem): string[] => {
    const text = textAt(item, key);
    return text ? [text] : [];
  };

/** What a line's failure said, the first eighty letters of it. */
const lineFailedBits = (item: ActivityItem): string[] => {
  const reason = textAt(item, "error") ?? textAt(item, "reason");
  return reason ? [reason.slice(0, 80)] : [];
};

/** What each kind adds after its words: the one or two fields a reader wants, and nothing else of the payload. */
const ACTIVITY_BITS: ReadonlyMap<string, (item: ActivityItem) => string[]> = new Map([
  ["take_over", (item: ActivityItem) => (textAt(item, "how") === "transfer" ? ["passed to the business's line"] : [])],
  ["consent_change", consentBits],
  ["contact.consent_changed", consentBits],
  [
    "change_role",
    (item: ActivityItem) => {
      const role = textAt(item, "role") ?? textAt(item, "to");
      return role ? [`to ${role}`] : [];
    },
  ],
  ["export", exportBits],
  ["pause_agent", pausedBits],
  ["resume_agent", pausedBits],
  ["send_broadcast", broadcastBits],
  [
    "settings.changed",
    (item: ActivityItem) => {
      const sentence = settingsChangedWords(item);
      return sentence ? [sentence] : [];
    },
  ],
  ["policy.changed", (item: ActivityItem) => [...oneField("class")(item), ...oneField("mode")(item)]],
  ["line.texting_rejected", lineFailedBits],
  ["line.failed", lineFailedBits],
  ["platform.acted", oneField("action")],
  ["playbook.run", playbookRunBits],
  ["lead.round", leadRoundBits],
  ["lead.no_card", leadNoCardBits],
]);

/**
 * The sentence for a row: the kind's words, then the one or two fields a
 * reader wants and nothing else of the payload.
 */
export function activityWords(kind: string, payload: unknown): string {
  const item = recordOrEmpty(payload);
  const base = baseWords(kind, item);
  // A kind whose sentence is its own, not the kind's words and a field or two.
  const whole = WHOLE_SENTENCE.get(kind);
  if (whole) return whole(item, base);
  const bits = ACTIVITY_BITS.get(kind)?.(item) ?? [];
  return bits.length ? `${base} · ${bits.join(" · ")}` : base;
}

export type { DecisionVerb as ActivityVerb } from "../../shared/enums";
