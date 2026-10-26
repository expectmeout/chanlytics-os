/**
 * Settings › How it answers, Rehearse (decision 0069), and a call's Review this call: their doors. The typed try, POST
 * receptionist/try (server/receptionist/try.ts), which answers a message as the receptionist would and sends nothing; a
 * call in the browser, POST receptionist/rehearsals, and its words as they come, GET receptionist/rehearsals/[id]; how
 * it did, POST receptionist/review; where a correction goes, POST receptionist/fix; and Keep, POST receptionist/keep.
 * An object the card imports, so a test stands a door in by assigning onto it, as Autonomy's are
 * (settings/autonomy/verbs.ts). None of them throws: each answers its data or the refusal's words.
 */
import type { FixChange, RehearsalAllowance, RehearsalDto, ReviewDto, TryItVM } from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import type { CallStarted } from "@/legacy-bridge/rehearse/call";

/** One turn of what was tried before, as the route takes it. */
export interface TryTurn {
  role: "user" | "assistant";
  content: string;
}

/** A door's answer: its data, or the refusal's words. */
type Answer<T> = { ok: true; data: T } | { ok: false; message: string };

/** A call the edge made: the call the browser joins, how long it may run, the minutes it leaves, and who a real one is put through to. */
export interface RehearsalStarted extends CallStarted {
  max_ms: number;
  allowance: RehearsalAllowance;
  handoff: string | null;
}

/** The conversation a review is of: a rehearsal, a real call, or the typed turns not yet kept. */
type ReviewAsked = { rehearsal_id: string } | { call_id: string } | { turns: TryTurn[]; config_version: number | null };

/** A correction, as the page sends it: the field the review named, the owner's words, the exchange it is about. */
interface FixAsked {
  kind: ReviewDto["items"][number]["fix"];
  words: string;
  customer: string;
  answer: string;
  rule: string | null;
}

/** Where a correction goes, said before anything is written; or the words for one that says nothing to change. */
export type FixFound = { change: FixChange; field: string; line: string } | { change: null; words: string };

/** What a Keep wrote: the version, the field and its line, the block before and after, and the fixes kept so far. */
export interface Kept {
  version: number;
  field: string;
  line: string;
  now_reads: { label: string; before: string | null; after: string | null } | null;
  fixes: number;
}

/** What a keep is of: the rehearsal it came from, the change, where it came from, and which composition shows it. */
interface KeepAsked {
  rehearsal_id: string;
  change: FixChange;
  via: "rehearsal" | "call_review";
  channel: "whatsapp" | "voice";
}

const refusedAnswer = (r: { message: string }) => ({ ok: false as const, message: r.message });

/** The receptionist's answer to `text` after the turns tried before it, or the refusal's words. */
async function askReceptionist(text: string, history: readonly TryTurn[]): Promise<Answer<TryItVM>> {
  const r = await api()("POST receptionist/try", { body: { text, history: [...history] } });
  return r.ok ? { ok: true, data: r.data } : refusedAnswer(r);
}

/** A call made at the provider with the receptionist as it stands. */
async function startRehearsal(): Promise<Answer<RehearsalStarted>> {
  const r = await api()("POST receptionist/rehearsals", { body: {} });
  return r.ok ? { ok: true, data: r.data as RehearsalStarted } : refusedAnswer(r);
}

/** A rehearsal as it stands: its words so far, its end, its review and its fixes. */
async function readRehearsal(id: string): Promise<Answer<RehearsalDto>> {
  const r = await api()("GET receptionist/rehearsals/[id]", { params: { id } });
  return r.ok ? { ok: true, data: r.data } : refusedAnswer(r);
}

/** How it did: judged once and kept, so a second look costs nothing. */
async function reviewConversation(of: ReviewAsked): Promise<Answer<{ rehearsal_id: string; review: ReviewDto }>> {
  const r = await api()("POST receptionist/review", { body: of });
  return r.ok ? { ok: true, data: r.data } : refusedAnswer(r);
}

/** Where the owner's correction goes: nothing written. */
async function routeFix(asked: FixAsked): Promise<Answer<FixFound>> {
  const r = await api()("POST receptionist/fix", { body: asked });
  return r.ok ? { ok: true, data: r.data } : refusedAnswer(r);
}

/** One change kept, through the settings' own write. */
async function keepChange(k: KeepAsked): Promise<Answer<Kept>> {
  const r = await api()("POST receptionist/keep", { body: k });
  return r.ok ? { ok: true, data: r.data } : refusedAnswer(r);
}

export const tryVerbs = { ask: askReceptionist };

export const rehearseVerbs = {
  start: startRehearsal,
  read: readRehearsal,
  review: reviewConversation,
  fix: routeFix,
  keep: keepChange,
};
