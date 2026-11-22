/**
 * Where a request's page stands in the Inbox (pages/inbox-page.tsx), in place of a conversation: nothing for an
 * address that names none. The page itself (pane.tsx) is a chunk of its own, fetched the first time an address names
 * a request, so the Inbox every member opens pays nothing for it.
 */
import { Suspense, lazy } from "react";
import { EmptyState } from "../../kit/empty/empty";
import { appNavigate, type Flash } from "../shell";
import { REQUEST_WORDS as W } from "./words";

const RequestPane = lazy(() => import("./pane").then((m) => ({ default: m.RequestPane })));

/** What stands in the pane while a request's page is fetched: said as its own read says it. */
const requestOpening = <EmptyState kind="page" glyph="inbox" title={W.reading} body="" testid="ix-rq-opening" />;

/** A request someone sent through a form, where a conversation would stand: its own page, with the way back. */
export function RequestSlot({ request, flash }: { request: string | null; flash: (shown: Flash) => void }) {
  if (!request) return null;
  return (
    <Suspense fallback={requestOpening}>
      <RequestPane key={request} id={request} flash={flash} onBack={() => appNavigate("inbox")} />
    </Suspense>
  );
}
