/**
 * A conversation open over Today (the second look of 20 Nov 2026, N2 and N3: Ruben's call that a conversation pressed on
 * Today opens over Today, its reply box and AI's draft in the sheet, which replaced his 17 Nov rule of sending it to the
 * Inbox's page). It is the Inbox's one pane for a conversation (thread-pane.tsx ThreadPane), drawn alone as Conversations
 * draws it, from the Inbox's read: AI's draft asked for on Today goes into its box as it opens (carried-reply.ts), and its
 * own verbs are the thread's. One the read does not hold (past the newest hundred) is read by its id, as the Inbox reads
 * the one its address names (inbox/surface.ts reads the sheet's too).
 */
import { isUuid } from "@chanlytics/contracts";
import { useReadNamedRecord } from "../../use-named-record";
import { useSurface } from "../../use-surface";
import { ROUTES } from "../../inbox/constants";
import { navigate, type Flash } from "../../inbox/shell";
import { inboxOverride } from "../../inbox/surface";
import { ThreadPane } from "../../inbox/thread/thread-pane";

const THREAD_READS = [inboxOverride];

export function ThreadOver({
  id,
  flash,
}: {
  /** The conversation's own id. */
  id: string;
  flash: (f: Flash) => void;
}) {
  const threadId = `th-${id}`;
  const held = useSurface("inbox")?.THREADS.some((t) => t.id === threadId) ?? false;
  useReadNamedRecord("inbox", THREAD_READS, isUuid(id) ? id : null, held);
  return (
    <ThreadPane
      key={threadId}
      threadId={threadId}
      // The sheet's Close is the way back: the thread's head draws no second one.
      onBack={null}
      onOpenClient={(person) => navigate(ROUTES.client(String(person)))}
      flash={flash}
    />
  );
}
