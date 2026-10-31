/**
 * What a lead's trying of its own receptionist came to (decision 0079, L5), said once for the lead sheet's line
 * (preview-line.ts) and for Today's row. Apart from the line and the page's words, and importing neither, because Today
 * rides in every page's frame: the row needs these few words and nothing else of a preview.
 *
 *   previewTriedWords  its messages and its calls, as one line
 *   previewSaidOf      what the business said is not right, each a line
 */
import { MIN_MS, SECOND_MS } from "../shared/time";

/** How far back Today names a lead who tried their preview: a hot lead goes cold in days, not weeks. */
export const PREVIEW_TRIED_DAYS = 3;

/** A preview its lead tried (GET lead-previews): Today's row, by its lead and the business's name. */
export interface PreviewTriedDto {
  id: string;
  lead_id: string;
  state: string;
  tried_at: string;
  asked_count: number;
  call_count: number;
  call_seconds: number;
  not_right: unknown;
  business: string | null;
}

/** The facts the page shows and the business may say are not right, each by its row's name (the page's own rows). */
export const PREVIEW_FACT_NAMES = {
  hours: "Hours",
  address: "Address",
  phone: "Phone",
  website: "Website",
  services: "Services",
} as const;

/** One thing they said is not right: the fact by its row's name, and their words where they gave some. */
function previewNotRightWords(fact: string, said: string | null): string {
  // The page sends the fact by its row's label ("Hours"); a key ("hours") reads the same.
  const name = ((PREVIEW_FACT_NAMES as Record<string, string>)[fact] ?? fact).toLowerCase();
  const isNot = name === "hours" || name === "services" ? "aren't" : "isn't";
  return said ? `Says the ${name} ${isNot} right: “${said}”` : `Says the ${name} ${isNot} right`;
}

/** What a lead's trying came to: its messages and its calls, said as one line ("4 messages · a call of 2 minutes"). */
export function previewTriedWords(f: { asked_count: number; call_count: number; call_seconds: number }): string {
  const bits: string[] = [];
  if (f.asked_count > 0) bits.push(f.asked_count === 1 ? "1 message" : `${f.asked_count} messages`);
  if (f.call_count > 0) {
    const min = Math.max(1, Math.round((f.call_seconds * SECOND_MS) / MIN_MS));
    const length = min === 1 ? "a minute" : `${min} minutes`;
    bits.push(f.call_count === 1 ? `a call of ${length}` : `${f.call_count} calls, ${length} in all`);
  }
  return bits.join(" · ");
}

/** What they said is not right, as the row keeps it: each a line, the newest last, three at most. */
export function previewSaidOf(notRight: unknown): string[] {
  if (!Array.isArray(notRight)) return [];
  return notRight
    .filter(
      (n: unknown): n is { fact: string; said?: unknown } =>
        !!n && typeof n === "object" && typeof (n as { fact?: unknown }).fact === "string",
    )
    .slice(-3)
    .map((n) => previewNotRightWords(n.fact, typeof n.said === "string" ? n.said : null));
}
