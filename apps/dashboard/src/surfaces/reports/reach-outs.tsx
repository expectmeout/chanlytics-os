/**
 * Reports › Reach-outs (moved from legacy/pages/reach-out/reach-out-report.jsx, decision 0015; Reach out, Part 6: H1,
 * H3-H6; canvas board 13). What the workspace's reach-outs wrote over the period the page is set to, and what came
 * back: from written to booked, replies by angle, where it left from, written day by day, and each reach-out with
 * each of its steps on its own line. A section of its own under Campaigns, because Campaigns' numbers are the
 * broadcasts' recipients, which a reach-out never writes. Every word and number is contracts' (toReachOutReportVM,
 * over GET reports/reach-outs), read with the rest of the page (the surface's `reachOuts`): null is a read that
 * failed and says so; a workspace with no reach-out draws nothing.
 */
import type { ReachOutDomainRow, ReachOutReportVM, ReachOutSourceLine } from "@chanlytics/contracts";
import { navigate } from "../legacy-verbs";
import { BarChart, BarList } from "../kit/charts/bar";
import { ChartCard } from "../kit/charts/card";
import { EmptyState, FailedRead } from "../kit/empty/empty";
import { RptSection } from "./blocks";
import { RPT_WRITTEN } from "./series";
import type { ReportsSurface } from "./surface";

/** Each reach-out, then each of its steps on its own line (H3): the name is the door to its row on Playbooks. */
function RptReachOutSources({ rows }: { rows: ReachOutSourceLine[] }) {
  return (
    <div className="ck-table-wrap rpt-sources">
      <table className="ck-table">
        <thead>
          <tr>
            <th>Reach-out</th>
            <th className="num">Written</th>
            <th className="num">Delivered</th>
            <th className="num">Wrote back</th>
            <th className="num">Interested</th>
            <th className="num">Booked</th>
            <th className="num">Said no</th>
            <th className="num">Bounced</th>
            <th className="num">Last</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} data-testid={s.kind === "chain" ? "ro-source-row" : "ro-step-row"}>
              <td>
                {s.kind === "chain" ? (
                  <button
                    type="button"
                    className="rpt-src"
                    onClick={() => s.to && navigate(s.to)}
                    data-testid="ro-source-open"
                  >
                    {s.name}
                  </button>
                ) : (
                  <span className="rpt-src-meta">{s.name}</span>
                )}
                {s.meta ? <span className="rpt-src-meta">{s.meta}</span> : null}
              </td>
              <td className="num">{s.written}</td>
              <td className="num">{s.delivered}</td>
              <td className="num">{s.wroteBack}</td>
              <td className="num">{s.interested}</td>
              <td className="num">{s.booked}</td>
              <td className="num">{s.saidNo}</td>
              <td className="num">{s.bounced}</td>
              <td className="num rpt-dim">{s.last}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Where it left from (H5): each domain's emails, how they landed, and the domain's state now. */
function RptReachOutDomains({ rows }: { rows: ReachOutDomainRow[] }) {
  return rows.length ? (
    <div className="ck-table-wrap">
      <table className="ck-table">
        <thead>
          <tr>
            <th>Domain</th>
            <th className="num">Sent</th>
            <th className="num">Landed</th>
            <th className="num">Bounced</th>
            <th className="num">Spam</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} data-testid="ro-domain-row">
              <td>
                {d.host}
                <span className="rpt-src-meta">{d.state}</span>
              </td>
              <td className="num">{d.sent}</td>
              <td className="num">{d.landed}</td>
              <td className="num">{d.bounced}</td>
              <td className="num">{d.complained}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <EmptyState kind="line" title="No email left in this period." />
  );
}

/** The section's cards: the funnel, the angles, the domains, the days and each reach-out with its steps. */
function reachOutCards(ro: ReachOutReportVM) {
  return (
    <div className="rpt-grid">
      <ChartCard className="rpt-span-4" title="From written to booked" testid="ro-funnel" takeaway={ro.lines.funnel}>
        <BarList max={ro.funnel.max} rows={ro.funnel.rows} />
      </ChartCard>
      <ChartCard className="rpt-span-4" title="Replies, by angle" testid="ro-angles" takeaway={ro.lines.angles}>
        {ro.angles.rows.length ? (
          <BarList max={ro.angles.max} rows={ro.angles.rows} color="var(--chart-ramp-3)" />
        ) : (
          <EmptyState kind="line" title="No angle to compare in this period." />
        )}
      </ChartCard>
      <ChartCard
        className="rpt-span-4"
        title="By domain"
        testid="ro-domains"
        takeaway={ro.lines.domains}
        switchable={false}
      >
        <RptReachOutDomains rows={ro.domains} />
      </ChartCard>
      <ChartCard
        className="rpt-span-12"
        title="Written, day by day"
        testid="ro-written"
        takeaway={ro.lines.written || null}
        config={RPT_WRITTEN}
        table={ro.table}
      >
        <BarChart
          data={ro.points}
          keys={["written"]}
          config={RPT_WRITTEN}
          height={150}
          yTicks={2}
          animKey={ro.days}
          ariaLabel="Reach-out emails written per day. The arrow keys read each day."
          describe={(d) => `${d.label}: ${d.written} written`}
        />
      </ChartCard>
      <ChartCard
        className="rpt-span-12"
        title="By reach-out and step"
        testid="ro-sources"
        switchable={false}
        table={{
          columns: ["Reach-out", "Written", "Delivered", "Wrote back", "Interested", "Booked", "Said no", "Bounced"],
          rows: ro.sources.map((s) => [
            s.name,
            s.written,
            s.delivered,
            s.wroteBack,
            s.interested,
            s.booked,
            s.saidNo,
            s.bounced,
          ]),
        }}
      >
        <RptReachOutSources rows={ro.sources} />
      </ChartCard>
    </div>
  );
}

export function RptReachOuts({ R }: { R: ReportsSurface | null }) {
  const ro = R ? R.reachOuts : undefined;
  // Nothing reads it here (the demo): nothing of it is drawn.
  if (ro === undefined) return null;
  if (ro === null) {
    return (
      <RptSection title="Reach-outs" testid="rpt-reach-outs">
        <FailedRead
          kind="card"
          what="the reach-out numbers"
          body="The rest of this page is current."
          surface="reports"
          testid="ro-report-failed"
        />
      </RptSection>
    );
  }
  if (!ro.present) return null;
  return (
    <RptSection title="Reach-outs" meta="what your reach-outs wrote, and what came back" testid="rpt-reach-outs">
      {ro.empty ? (
        <EmptyState
          kind="card"
          glyph="wave"
          title="Nothing written"
          body={ro.lines.empty}
          action={{ label: "Open Playbooks", to: "outbound" }}
          testid="ro-report-empty"
        />
      ) : (
        reachOutCards(ro)
      )}
    </RptSection>
  );
}
