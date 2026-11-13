/**
 * Settings › Autonomy's doors (decision 0015 step 11): a class's mode, or one of the reply row's dials, through the
 * bridge's courier (bridge/inbox-verbs.ts setPolicy, PUT /policies); and a note suggested from an owner's correction,
 * kept or dismissed through its verb (decision 0063, contracts PAGE_SPECS fact_suggestion). An object the pane imports, so
 * a test stands a door in by assigning onto it, as Billing's and Google's are.
 */
import type { FactSuggestionDto } from "@chanlytics/contracts";
import { setPolicy } from "@/bridge/inbox-verbs";
import { apiFor } from "@/bridge/api";
import { commitVerb } from "@/bridge/verbs/commit";
import type { StopPressed } from "./stop-words";

/** What an answer said: the receipt (the server's own where it gave one: "already said"), or the refusal. */
type FactAnswered = { ok: true; receipt: string } | { ok: false; message: string };

async function answerFact(s: Pick<FactSuggestionDto, "id" | "title">, keep: boolean): Promise<FactAnswered> {
  const r = await commitVerb("fact_suggestion", { suggestion_id: s.id, keep, title: s.title });
  if (!r.ok) return { ok: false, message: r.message };
  const said: unknown = r.data && typeof r.data === "object" ? Reflect.get(r.data, "receipt") : null;
  return { ok: true, receipt: typeof said === "string" ? said : r.receipt };
}

/** The switch (D10 of the answers canvas): Ask may act on its own, following these rows. */
async function setAskAlone(on: boolean): Promise<{ ok: boolean; message: string }> {
  const r = await apiFor(window)("POST ask/alone", { body: { on } });
  return r.ok ? { ok: true, message: "" } : { ok: false, message: r.message };
}

/** Stop everything, and its Resume (D22): what the press did and what it could not, or why it was refused. */
async function stopAll(stopped: boolean): Promise<{ ok: true; answer: StopPressed } | { ok: false; message: string }> {
  const r = await apiFor(window)("POST ask/stop", { body: { stopped } });
  return r.ok ? { ok: true, answer: r.data } : { ok: false, message: r.message };
}

export const autonomyVerbs = { setPolicy, answerFact, setAskAlone, stopAll };
