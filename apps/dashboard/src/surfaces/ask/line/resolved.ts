/**
 * The chip Ask worked out (Ruben, 12 Nov 2026: a question asked with no chip should show what Ask understood it to be about).
 * An answer that names one thing alone, by the rows it cites or the one file its cards act on, hands that thing to the field
 * as its chip, so the next question goes about it, and a person sees at once whether Ask took the right one; an answer about
 * several, or about none, leaves the field as it was. A citation's kind is the scope's but where the words differ (a
 * Broadcasts row cites as a broadcast, and its chip is a run: contracts citations.ts).
 */
import {
  fileSaidOf,
  type AskCitationKind,
  type AskMessageVM,
  type AskScope,
  type AskScopeKind,
} from "@chanlytics/contracts";
import { surfaceValue } from "../../surface-values";

const CITED_AS: Partial<Record<AskCitationKind, AskScopeKind>> = {
  thread: "thread",
  conversation: "conversation",
  call: "call",
  person: "person",
  lead: "lead",
  search: "search",
  playbook: "playbook",
  visit: "visit",
  broadcast: "run",
};

/** The file a card acts on: a post's or a piece's plan names it, as a card to put a post up does. */
function fileOfCard(payload: Record<string, unknown>): string | null {
  const own = payload.file_id;
  if (typeof own === "string") return own;
  const plan = payload.plan;
  if (plan && typeof plan === "object" && "file_id" in plan && typeof plan.file_id === "string") return plan.file_id;
  return null;
}

/** A file the page holds no name for: a post card's file is the photo it is made from (a publish card's, a post the page holds). */
const THIS_PHOTO = "this photo";

/** A file by the name the page says it by (a piece Ask made, or a file of the Library); null where neither holds it. */
function fileNameOf(id: string): string | null {
  const made = surfaceValue("content")?.dto.made.find((m) => m.file.id === id)?.file;
  const kept = surfaceValue("files")?.dto.files.find((f) => f.id === id);
  const file = made ?? kept;
  return file ? fileSaidOf(file.name) : null;
}

/** The one thing an answer is about, or null where it names several or none. */
export function chipOfAnswer(answer: AskMessageVM): AskScope | null {
  if (answer.failed) return null;
  const named = new Map<string, AskScope>();
  for (const cited of answer.citations ?? []) {
    const kind = CITED_AS[cited.kind];
    if (kind) named.set(`${kind}:${cited.id}`, { kind, id: cited.id, label: cited.label });
  }
  for (const card of answer.proposals ?? []) {
    const id = fileOfCard(card.payload);
    // The file the card acts on, by its own name: a post card's title is the post to come, never the photo it is made from, so
    // where the page holds no name for it (a Library photo not yet read) it is the photo, its picture beside the words.
    if (id) named.set(`file:${id}`, { kind: "file", id, label: fileNameOf(id) ?? THIS_PHOTO });
  }
  return named.size === 1 ? ([...named.values()][0] ?? null) : null;
}
