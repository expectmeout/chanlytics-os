/**
 * Settings › Autonomy's doors (decision 0015 step 11): a class's mode, or one of the reply row's dials, through the
 * bridge's courier (legacy-bridge/inbox-verbs.ts setPolicy, PUT /policies); and a note suggested from an owner's correction,
 * kept or dismissed through its verb (decision 0063, contracts PAGE_SPECS fact_suggestion). An object the pane imports, so
 * a test stands a door in by assigning onto it, as Billing's and Google's are.
 */
import type { FactSuggestionDto } from "@chanlytics/contracts";
import { setPolicy } from "@/legacy-bridge/inbox-verbs";
import { commitVerb } from "@/legacy-bridge/verbs/commit";

/** What an answer said: the receipt (the server's own where it gave one: "already said"), or the refusal. */
type FactAnswered = { ok: true; receipt: string } | { ok: false; message: string };

async function answerFact(s: Pick<FactSuggestionDto, "id" | "title">, keep: boolean): Promise<FactAnswered> {
  const r = await commitVerb("fact_suggestion", { suggestion_id: s.id, keep, title: s.title });
  if (!r.ok) return { ok: false, message: r.message };
  const said: unknown = r.data && typeof r.data === "object" ? Reflect.get(r.data, "receipt") : null;
  return { ok: true, receipt: typeof said === "string" ? said : r.receipt };
}

export const autonomyVerbs = { setPolicy, answerFact };
