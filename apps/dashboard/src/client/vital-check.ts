/**
 * A report as the route takes it (contracts PageVitalReport), checked: the report, or null for one the route would refuse.
 * A chunk of its own (field-data.ts fetches it as it is made): the schema, and zod with it, were part of every first load
 * for a check no report needs before the page has drawn (the loadability review, 19 Oct 2026).
 */
import { PageVitalReport, type PageVitalReportDto } from "@chanlytics/contracts";

export function checkVital(report: unknown): PageVitalReportDto | null {
  const r = PageVitalReport.safeParse(report);
  return r.success ? r.data : null;
}
