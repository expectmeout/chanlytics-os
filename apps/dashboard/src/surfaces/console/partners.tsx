/**
 * Partners (decision 0066; once the back office's Partners card, surfaces/settings/platform/pane.tsx): what each
 * partner is owed, their status and second factor, and the workspaces a partner brought that the nightly check held
 * for a person. Read with the back office's overview, as it always was; every act asks why first, and a role is offered
 * only what it may take.
 */
import { useMemo } from "react";
import { backOffice } from "@/legacy-bridge/platform";
import { PageHead } from "../kit/head/page-head";
import { PartnerLine, PartnerStandingRow } from "./partner-rows";
import { NoneRow, ScreenFailed, ScreenReading, ScreenSection, useConsoleRead, type Flash } from "./parts";
import type { ConsoleMe } from "./verbs";

/** The back office's overview, as a Console read. */
const overview = async () => {
  const r = await backOffice.verbs.list();
  return r.ok ? { ok: true as const, data: r } : { ok: false as const, message: r.message, missing: false };
};

export function PartnersScreen({ me, flash }: { me: ConsoleMe; flash: Flash }) {
  const P = useMemo(() => backOffice.verbs, []);
  const read = useConsoleRead(overview, "partners");
  if (!read.data)
    return read.problem ? (
      <ScreenFailed
        what="the partners"
        why={read.problem}
        busy={read.busy}
        again={read.again}
        testid="console-partners-failed"
      />
    ) : (
      <ScreenReading />
    );
  const partners = read.data.partners;
  if (!partners)
    return (
      <ScreenFailed
        what="the partners"
        why="Could not be read right now."
        busy={read.busy}
        again={read.again}
        testid="console-partners-failed"
      />
    );
  const nameOf = new Map(P.rows(read.data.tenants).map((r) => [r.tenantId, r.name]));
  const partnerRows = P.partnerRows(partners.balances);
  const toDecide = partners.workspaces.filter((w) => w.standing !== "qualified");
  return (
    <div className="cs-screen" data-testid="console-partners">
      <PageHead title="Partners" sentence={P.partnerSummary(partners.balances)} />
      <ScreenSection title="What each is owed" sub={`${partnerRows.length}`} testid="platform-partners">
        <div className="cl-attn-list" data-testid="platform-partner-rows">
          {partnerRows.length === 0 && <NoneRow words="No partners yet." />}
          {partnerRows.map((row) => (
            <PartnerLine
              key={`${row.partnerId}-${row.currency || "none"}`}
              row={row}
              P={P}
              role={me.role}
              onDone={read.again}
              flash={flash}
            />
          ))}
        </div>
      </ScreenSection>
      <ScreenSection
        title="Held for a person"
        sub="Workspaces a partner brought that are not qualified: under review first"
        testid="platform-standing"
      >
        <div className="cl-attn-list" data-testid="platform-standing-rows">
          {toDecide.length === 0 && <NoneRow words="Nothing is held for a person." />}
          {toDecide.map((w) => (
            <PartnerStandingRow
              key={w.tenant_id}
              ws={w}
              name={nameOf.get(w.tenant_id)}
              P={P}
              role={me.role}
              onDone={read.again}
              flash={flash}
            />
          ))}
        </div>
      </ScreenSection>
    </div>
  );
}
