/**
 * Where the frame keeps the lead sheet over another page (`?lead=<id>`, lead-over.ts): nothing until a lead is asked
 * for, then the sheet's own chunk, loaded on demand (over.tsx). Leads draws its own sheet, in its own address, and is
 * left to it.
 */
import { Suspense, lazy } from "react";
import { useLeadOver } from "./lead-over";

const LeadSheetOver = lazy(() => import("./over").then((m) => ({ default: m.LeadSheetOver })));

/** Leads' own pages: their sheet is the page's. */
const ON_LEADS = /\/(?:clients|people)\/leads(?:[/:]|$)/;

export function LeadOverMount() {
  const leadId = useLeadOver();
  if (!leadId || ON_LEADS.test(window.location.pathname)) return null;
  return (
    <Suspense fallback={null}>
      <LeadSheetOver key={leadId} leadId={leadId} />
    </Suspense>
  );
}
