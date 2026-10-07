import "server-only";
import {
  AppError,
  BUILTIN_LISTS,
  LIST_DRAFT_JSON_SCHEMA,
  ListDraftAnswerSchema,
  asListRule,
  draftListRule,
  listDraftFieldLines,
  parseListToken,
  ruleLists,
  UUID,
  type ListRule,
} from "@chanlytics/contracts";
import { askForJson } from "../model-json";
import type { RouteContext } from "../with-route";
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
/** A live list of the workspace already has the name (00169 segments_live_name): the routes' 409, and Ask's refusal. */
export const LIST_NAME_TAKEN = "A list with that name already exists.";

export function cleanListName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > LIST_NAME_MAX) {
    throw new AppError("validation", `A list needs a name of up to ${LIST_NAME_MAX} characters.`);
  }
  return name;
}

/**
 * A smart list's rule as a person sent it, or null when none was sent: anything the vocabulary cannot read is refused
 * in words, never stored (contracts ListRuleSchema). A list it reads must be one there is: a built-in by its id, or one
 * of this workspace's own lists (`saved`, as packages/db reads them) whose rule reads no list itself -- one level deep
 * (decision 0009) -- and never the list being changed (`self`).
 */
export function cleanListRule(
  raw: unknown,
  saved: readonly { id: string; name?: string; rule?: unknown; archived_at?: string | null }[] = [],
  self: string | null = null,
): ListRule | null {
  if (raw === undefined || raw === null) return null;
  const rule = asListRule(raw);
  if (!rule) throw new AppError("validation", "That rule can't be read. Describe who is on the list again.");
  // The lists this one already reads: an archived one among them (00169) is kept, and no new one is taken up.
  const was = self ? saved.find((l) => l.id.toLowerCase() === self.toLowerCase())?.rule : null;
  const before = new Set(
    (was == null ? null : asListRule(was)) ? ruleLists(asListRule(was)!).map((t) => t.toLowerCase()) : [],
  );
  for (const token of ruleLists(rule)) {
    const ref = parseListToken(token);
    const known =
      ref?.kind === "builtin"
        ? BUILTIN_LISTS.some((l) => l.id === ref.id)
        : ref?.kind === "saved"
          ? saved.find((l) => l.id.toLowerCase() === ref.id)
          : null;
    if (!known) throw new AppError("validation", "That rule reads a list there isn't. Pick one of your lists.");
    if (ref?.kind === "saved" && ref.id === self?.toLowerCase())
      throw new AppError("validation", "A list can't read itself.");
    if (typeof known === "object" && known.archived_at && !before.has(token.toLowerCase()))
      throw new AppError("validation", `${known.name ?? "That list"} is archived. Restore it on People to read it.`);
    if (typeof known === "object" && known.rule != null) {
      const other = asListRule(known.rule);
      if (!other) throw new AppError("validation", "That rule reads a list this version can't read. Reload the page.");
      if (ruleLists(other).length)
        throw new AppError("validation", "That list reads another list itself. A list reads lists one level deep.");
    }
  }
  // Read by another list, it reads none itself: one level deep either way.
  if (self && ruleLists(rule).length) {
    const token = `list:${self.toLowerCase()}`;
    const readBy = saved.some((l) => {
      const r = l.rule == null ? null : asListRule(l.rule);
      return !!r && ruleLists(r).some((t) => t.toLowerCase() === token);
    });
    if (readBy) throw new AppError("validation", "Another list reads this one, so it can't read lists itself.");
  }
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

/**
 * The list vocabulary as a model writes a rule in it: what a condition is, the fields and their ops (contracts
 * listDraftFieldLines, so no line can name a field the schema refuses or miss one it reads), what the days' ops mean,
 * and what has no field. One derivation, read by the drafter below and by Ask's propose_list, whose model writes the
 * rule itself (the Ask Rewired Phase 4 plan, D10).
 */
export const LIST_RULE_LINES: readonly string[] = [
  'Every condition in all must hold for a person to be on the list. A condition is one fact, or { any: [facts] } when one of two to six facts is enough ("on WhatsApp or text"). Use only these fields:',
  ...listDraftFieldLines(),
  "more_than N is more than N days ago (or away); within N is in the last (or next) N days; never is no such moment at all, ever is any.",
  "A month is 30 days, a week 7. 'Regulars' or 'loyal' have no field: say so in cannot rather than invent one.",
];

/** What a smart list's plain-English description is written into: the vocabulary, and nothing else. */
const LIST_DRAFT_SYSTEM = [
  "You turn a business owner's description of a group of their customers into a list rule.",
  ...LIST_RULE_LINES,
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
        schema: LIST_DRAFT_JSON_SCHEMA,
        messages: [{ role: "user", content: words }],
      },
    },
    ListDraftAnswerSchema,
    "list",
  );
  // Each fact cut down to what its field reads, then read strictly (contracts draftListRule).
  const rule = draftListRule(answer.all);
  if (!rule)
    throw new AppError(
      "validation",
      answer.cannot
        ? `A list can't say that yet: ${answer.cannot}.`
        : "A list can't say that yet. Try when they last visited, how they reach you, or where they came from.",
    );
  return { name: answer.name, rule, cannot: answer.cannot || null };
}
