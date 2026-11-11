/**
 * A lead's own receptionist as the lead sheet reads it (decision 0079, GET leads/:id/preview): one read and one tab
 * cache for every part that draws it, the Sequence line (../preview.tsx) and the card's mark (fill-in.tsx, decision
 * 0127). A press that moved it (Make it now, ../preview.tsx) tells every reader of that lead, and each reads again.
 */
import { useSyncExternalStore } from "react";
import type { ApiResult, Output } from "@/client/api";
import { api } from "@/bridge/api";
import { readCache } from "@/bridge/read-cache";
import { useSequenceRead } from "../../../campaigns/sequences/use-record";

type PreviewAnswer = ApiResult<Output<"GET leads/[id]/preview">>;
const previews = readCache<PreviewAnswer>("lead_preview", (answer) => answer.ok);
const readPreview = (leadId: string) =>
  previews.through(leadId, () => api()("GET leads/[id]/preview", { params: { id: leadId } }));
const peekPreview = (leadId: string) => previews.peek(leadId);

// How many presses have moved each lead's preview, and who waits to hear of the next.
const previewMoves = new Map<string, number>();
const previewReaders = new Set<() => void>();
const hearPreviewMoves = (reader: () => void) => {
  previewReaders.add(reader);
  return () => {
    previewReaders.delete(reader);
  };
};

/** A lead's preview, painted from the tab's last answer and read again behind, and again after a press moved it. */
export function useLeadPreview(leadId: string | null) {
  const again = useSyncExternalStore(
    hearPreviewMoves,
    () => (leadId ? (previewMoves.get(leadId) ?? 0) : 0),
    () => 0,
  );
  return useSequenceRead(leadId, readPreview, peekPreview, { again });
}

/** A press moved this lead's preview: every reader of it reads again. */
export function tellPreviewMoved(leadId: string): void {
  previewMoves.set(leadId, (previewMoves.get(leadId) ?? 0) + 1);
  for (const reader of previewReaders) reader();
}
