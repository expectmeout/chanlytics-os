/**
 * A lead's own receptionist as the lead sheet reads it (decision 0079, GET leads/:id/preview): one read and one tab
 * cache for every part that draws it, the Sequence line (preview.tsx) and the card's mark (fill-in.tsx, decision 0127),
 * and the one press that moves it. A press on either tells both: each reader of that lead reads again.
 */
import { useSyncExternalStore } from "react";
import type { ApiResult, Output } from "@/client/api";
import { api } from "@/bridge/api";
import { readCache } from "@/bridge/read-cache";
import { useSequenceRead } from "../../campaigns/sequences/use-record";

type PreviewAnswer = ApiResult<Output<"GET leads/[id]/preview">>;
const previews = readCache<PreviewAnswer>("lead_preview", (r) => r.ok);
const readPreview = (leadId: string) =>
  previews.through(leadId, () => api()("GET leads/[id]/preview", { params: { id: leadId } }));
const peekPreview = (leadId: string) => previews.peek(leadId);

// How many presses have moved each lead's preview, and who is listening for the next.
const moved = new Map<string, number>();
const hearing = new Set<() => void>();
const hear = (heard: () => void) => {
  hearing.add(heard);
  return () => {
    hearing.delete(heard);
  };
};

/** A lead's preview, painted from the tab's last answer and read again behind, and again after a press moved it. */
export function useLeadPreview(leadId: string | null) {
  const again = useSyncExternalStore(
    hear,
    () => (leadId ? (moved.get(leadId) ?? 0) : 0),
    () => 0,
  );
  return useSequenceRead(leadId, readPreview, peekPreview, { again });
}

/** Make it now: asked of the door; every reader of this lead reads again. What it refused, in its words, or null. */
export async function makeLeadPreview(leadId: string): Promise<string | null> {
  const r = await api()("POST leads/[id]/preview", { params: { id: leadId } });
  if (!r.ok) return r.message;
  moved.set(leadId, (moved.get(leadId) ?? 0) + 1);
  for (const heard of hearing) heard();
  return null;
}
