/**
 * Send it again's send, kept for the tab (Ruben, 21 Oct 2026: a one-off's record's More, record-acts.tsx, since a run that
 * went is read in Reports): what a one-off sent, as New's Send once opens on it (new-model.ts againOf). A module of its own,
 * so the record carries this and not New's model.
 */
import type { BroadcastDto, ConsentChannel } from "@chanlytics/contracts";

/** A send kept for Send it again: its audience's key, its message by its id, and its values by what filled them. */
export interface KeptSend {
  aud: string;
  tplId?: string;
  params?: Record<string, string[]>;
  sources?: Record<string, string[]>;
  name?: string;
  channels?: ConsentChannel[];
}

/**
 * What a one-off's run sent, kept as it was: who it went to by its audience's key, its message by the id it sent, and each
 * value as it was filled, typed words kept. New puts each right against what can fill it now (new-model.ts againOf).
 */
export const keptSendOf = (b: Pick<BroadcastDto, "audience" | "template_id" | "params">): KeptSend => {
  const aud = `${b.audience.kind}:${b.audience.id ?? ""}`;
  // A run that sent no message (a reach-out's hand step's) keeps its audience alone: againOf opens New on its line.
  const tplId = b.template_id;
  if (tplId === null) return { aud };
  return {
    aud,
    tplId,
    sources: { [tplId]: b.params.map((p) => p.kind) },
    params: { [tplId]: b.params.map((p) => (p.kind === "text" ? p.value : "")) },
  };
};
