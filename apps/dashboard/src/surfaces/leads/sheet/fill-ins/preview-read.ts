/**
 * A lead's own receptionist as the lead sheet reads it (decision 0079, GET leads/:id/preview): one read and one tab
 * cache for every part that draws it, the Sequence line (../preview.tsx) and the card's mark (fill-in.tsx, decision
 * 0127). A press that moved it (Make it now, ../preview.tsx) tells every reader of that lead, and each reads again.
 *
 * While one is being made (about half a minute) its readers look again every few seconds, so "ready" and Open it come
 * without a press or the sheet opened again. One wait a lead, whoever reads it. A build slower than two minutes (its
 * first try failed and it waits for its second) is looked at every half minute for ten more, so its line can say it is
 * slower and still find it made; then no more: a build that never ends is not asked about for ever. The count starts
 * over once it is seen made.
 */
import { useEffect, useSyncExternalStore } from "react";
import { SECOND_MS } from "@chanlytics/contracts";
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

/** A press moved this lead's preview: every reader of it reads again. */
export function tellPreviewMoved(leadId: string): void {
  previewMoves.set(leadId, (previewMoves.get(leadId) ?? 0) + 1);
  for (const reader of previewReaders) reader();
}

/** How often a receptionist being made is looked at again, as its own page does (preview-page.tsx). */
const BUILDING_EVERY_MS = 4 * SECOND_MS;
/** How many quick looks one being made gets: two minutes of them. */
const BUILDING_LOOKS_MAX = 30;
/** How often one slower than that is looked at, and how many times: ten more minutes. */
const SLOW_EVERY_MS = 30 * SECOND_MS;
const SLOW_LOOKS_MAX = 20;

// Each lead's looks while its receptionist is being made: how many so far, and whether one is on its way.
const buildingLooks = new Map<string, { count: number; waiting: boolean }>();

/** One more look at a lead's preview, soon or (past its quick looks) later, unless one is on its way or it has had its share. */
function lookAgainSoon(leadId: string): void {
  const looks = buildingLooks.get(leadId) ?? { count: 0, waiting: false };
  buildingLooks.set(leadId, looks);
  if (looks.waiting || looks.count >= BUILDING_LOOKS_MAX + SLOW_LOOKS_MAX) return;
  const wait = looks.count < BUILDING_LOOKS_MAX ? BUILDING_EVERY_MS : SLOW_EVERY_MS;
  looks.waiting = true;
  looks.count += 1;
  setTimeout(() => {
    looks.waiting = false;
    tellPreviewMoved(leadId);
  }, wait);
}

/**
 * A lead's preview, painted from the tab's last answer and read again behind, again after a press moved it, and every
 * few seconds while it is being made.
 */
export function useLeadPreview(leadId: string | null) {
  const again = useSyncExternalStore(
    hearPreviewMoves,
    () => (leadId ? (previewMoves.get(leadId) ?? 0) : 0),
    () => 0,
  );
  const read = useSequenceRead(leadId, readPreview, peekPreview, { again });
  // By the answer itself, which is a new one each time a look lands: the next look waits for the last one's answer, so
  // one that finds it made leaves nothing on its way.
  useEffect(() => {
    if (!leadId || read.state !== "read") return;
    if (read.data.preview?.state === "building") lookAgainSoon(leadId);
    else buildingLooks.delete(leadId);
  }, [leadId, read]);
  return read;
}
