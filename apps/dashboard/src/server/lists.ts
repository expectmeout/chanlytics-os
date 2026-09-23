import "server-only";
import {
  AppError,
  LIST_DRAFT_JSON_SCHEMA,
  ListDraftAnswerSchema,
  asListRule,
  type ListRule,
} from "@chanlytics/contracts";
import { askForJson } from "./model-json";
import type { RouteContext } from "./with-route";
import type { SavedListRow } from "@chanlytics/db";

/**
 * Saved lists: what the routes agree on. The tables are read and written in packages/db lists.ts.
 *
 * A list is a name and the people on it. The name is the only thing a person
 * types; the members are ids the page already holds. Both guards live here
 * so the create route and the edit route refuse the same things in the same
 * words.
 */
/** A list with every id on it, as packages/db lists.ts reads it. */
export type SavedListDto = SavedListRow;

export const LIST_NAME_MAX = 60;
export const LIST_BATCH_MAX = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cleanListName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > LIST_NAME_MAX) {
    throw new AppError("validation", `A list needs a name of up to ${LIST_NAME_MAX} characters.`);
  }
  return name;
}

/**
 * A smart list's rule as a person sent it, or null when none was sent: anything the vocabulary cannot read is refused
 * in words, never stored (contracts ListRuleSchema).
 */
export function cleanListRule(raw: unknown): ListRule | null {
  if (raw === undefined || raw === null) return null;
  const rule = asListRule(raw);
  if (!rule) throw new AppError("validation", "That rule can't be read. Describe who is on the list again.");
  return rule;
}

/** An optional array of contact ids: absent is empty; anything else must be uuids, deduplicated, bounded. */
export function cleanIdList(raw: unknown, what: string): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string" || !UUID.test(x))) {
    throw new AppError("validation", `${what} must be a list of contact ids.`);
  }
  const ids = Array.from(new Set(raw as string[]));
  if (ids.length > LIST_BATCH_MAX) throw new AppError("validation", `At most ${LIST_BATCH_MAX} people at a time.`);
  return ids;
}

/** What a smart list's plain-English description is written into: the vocabulary, and nothing else. */
const LIST_DRAFT_SYSTEM = [
  "You turn a business owner's description of a group of their customers into a list rule.",
  "Every condition must hold for a person to be on the list. Use only these fields:",
  "- last_visit: days since their last appointment on the calendar. op more_than (it was more than N days ago) or within (in the last N days); days.",
  "- next_visit: days until their next appointment. op within (in the next N days) or more_than; days.",
  "- booked: whether an appointment is booked ahead. op is; yes true or false.",
  "- asked_not_booked: asked about booking and never booked. op is; yes.",
  "- last_heard: days since they last wrote or called. op more_than or within; days.",
  "- first_contact: days since they first wrote or called. op more_than or within; days.",
  "- channel: a way they reach the business: whatsapp, sms, voice (phone calls) or email. op is or is_not; channel.",
  "- came_from: how they first came: whatsapp, sms, email, call, calendar, manual, import or lead. op is or is_not; from.",
  "- calls, conversations: how many. op at_least or at_most; n.",
  "- offers_yes: whether they said yes to offers. op is; yes.",
  "A month is 30 days, a week 7. 'Regulars' or 'loyal' have no field: say so in cannot rather than invent one.",
  "Whatever the description asks that these fields cannot say -- a staff member, a service, a tag, a spend, what was said -- goes, in a few words, in cannot; empty when nothing was left out.",
  "name: a short name for the list, in the owner's words, at most 40 characters.",
].join("\n");

/**
 * A smart list drafted from the owner's own words: a name, a rule in the vocabulary (contracts list-rules.ts), and
 * what the words asked that the vocabulary cannot say. A draft, never a list: the owner sees its chips and its count
 * and saves it themselves. Words the vocabulary cannot say anything of are refused with what was missing.
 */
export async function draftList(
  ctx: RouteContext,
  tenantId: string,
  words: string,
): Promise<{ name: string; rule: ListRule; cannot: string | null }> {
  const answer = await askForJson(
    {
      tenantId,
      userId: ctx.userId,
      purpose: "list_draft",
      request: {
        max_tokens: 500,
        system: LIST_DRAFT_SYSTEM,
        schema: LIST_DRAFT_JSON_SCHEMA as unknown as Record<string, unknown>,
        messages: [{ role: "user", content: words }],
      },
    },
    ListDraftAnswerSchema,
    "list",
  );
  const rule = asListRule({ all: answer.all });
  if (!rule)
    throw new AppError(
      "validation",
      answer.cannot
        ? `A list can't say that yet: ${answer.cannot}.`
        : "A list can't say that yet. Try when they last visited, how they reach you, or where they came from.",
    );
  return { name: answer.name, rule, cannot: answer.cannot || null };
}
