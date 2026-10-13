/**
 * The Campaigns lens's Reach-outs: what the workspace's reach-outs wrote over the period, and what came of it, a part of the lens
 * that names itself (a reach-out is not a campaign: it writes to businesses, one email at a time, and counts its own). Moved from
 * the Reports page's old section (Reach out, Part 6: H1, H3-H6), whose domains table and sources table are drawn here, and
 * counted as the fold counts them (contracts `toReachOutLensVM`, page-only): emails are one unit and businesses another, and no
 * card mixes them. The emails written, landed and bounced are the strip, against the period before; the emails and the
 * businesses are a card each; what came of the businesses, by the opening each was written, and by reach-out and step, is as it
 * stands now, and the cards say so in the fold's words. Every row, line and sentence is the fold's; the titles and the column
 * headers are the page's. A share of fewer than five is a count (the fold words it; a bar of one is greyed by contracts'
 * one predicate), and a read that failed is the lens's own failed read in this section, with its Retry.
 */
import type { ReachOutMailboxRow } from "@chanlytics/contracts";
import type { CampaignLensVM, ReachOutLensSourceLine, ReachOutLensVM } from "@chanlytics/contracts/report-lens";
import { routeDoor } from "../../legacy-verbs";
import { BarChart, BarList } from "../../kit/charts/bar";
import { ChartCard } from "../../kit/charts/card";
import { EmptyState } from "../../kit/empty/empty";
import { LinkButton } from "../../kit/link-button/link-button";
import { RptSection, RptStrip } from "../blocks";
import { RPT_WRITTEN } from "../series";
import { rateBar } from "./campaigns-mix";
import { failedRead } from "./campaigns-now";
import { mixCard } from "./shared";

/** What a full bar of a share is: all of them. */
const FULL_SHARE = 100;
/** The colour the angles' bars wear (charts.css: the ramp's third step, as the old section drew them). */
const ANGLE_BAR = "var(--chart-ramp-3)";

/** Each mailbox: its emails, how they landed, and its state now (H5; decision 0056). */
function MailboxesTable({ rows }: { rows: ReachOutMailboxRow[] }) {
  return (
    <div className="ck-table-wrap">
      <table className="ck-table">
        <thead>
          <tr>
            <th>Mailbox</th>
            <th className="num">Sent</th>
            <th className="num">Landed</th>
            <th className="num">Bounced</th>
            <th className="num">Spam</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} data-testid="ro-mailbox-row">
              <td>
                {d.address}
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
  );
}

/** A reach-out's name, a door to its row on Playbooks; a step's is plain, and a line under either says what it is. */
function sourceName(s: ReachOutLensSourceLine) {
  if (s.kind === "step") return <span className="rpt-src-meta">{s.name}</span>;
  if (s.to === null) return <span className="rpt-src">{s.name}</span>;
  return (
    <LinkButton className="rpt-src" {...routeDoor(s.to)} data-testid="ro-source-open">
      {s.name}
    </LinkButton>
  );
}

/** Each reach-out, then each of its steps on its own line (H3), in businesses where an outcome is a share of them. */
function SourcesTable({ rows }: { rows: ReachOutLensSourceLine[] }) {
  return (
    <div className="ck-table-wrap rpt-sources">
      <table className="ck-table">
        <thead>
          <tr>
            <th>Reach-out</th>
            <th className="num">Written</th>
            <th className="num">Delivered</th>
            <th className="num">Businesses</th>
            <th className="num">Wrote back</th>
            <th className="num">Interested</th>
            <th className="num">Booked</th>
            <th className="num">Won</th>
            <th className="num">Said no</th>
            <th className="num">Bounced</th>
            <th className="num">Last</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} data-testid={s.kind === "chain" ? "ro-source-row" : "ro-step-row"}>
              <td>
                {sourceName(s)}
                {s.meta ? <span className="rpt-src-meta">{s.meta}</span> : null}
              </td>
              <td className="num">{s.written}</td>
              <td className="num">{s.delivered}</td>
              <td className="num">{s.businesses}</td>
              <td className="num">{s.wroteBack}</td>
              <td className="num">{s.interested}</td>
              <td className="num">{s.booked}</td>
              <td className="num">{s.won}</td>
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

/** The emails as they left, landed and bounced: counts of emails, whatever business each went to. */
function emailsCard(ro: ReachOutLensVM, className: string) {
  return mixCard(ro.emails, {
    title: "Emails",
    testid: "ro-emails",
    className,
    columns: ["What happened", "Emails"],
  });
}

/** The businesses written to and what came of each: counts of businesses, each once, at the last email that wrote to it. */
function businessesCard(ro: ReachOutLensVM, className: string) {
  return mixCard(ro.businesses, {
    title: "Businesses",
    testid: "ro-funnel",
    className,
    columns: ["What came of it", "Businesses"],
  });
}

/** The share of the businesses each opening was the last email to that wrote back, a bar of fewer than five greyed. */
function anglesCard(ro: ReachOutLensVM, className: string) {
  const { angles } = ro;
  const rows = angles.rows.map(rateBar);
  return (
    <ChartCard
      className={className}
      title="Replies, by angle"
      testid="ro-angles"
      takeaway={angles.line}
      table={rows.length ? { columns: ["Angle", "Who wrote back"], rows: rows.map((r) => [r.label, r.display]) } : null}
    >
      {rows.length ? (
        <BarList rows={rows} max={FULL_SHARE} color={ANGLE_BAR} />
      ) : angles.empty ? (
        <EmptyState kind="line" title={angles.empty} />
      ) : null}
    </ChartCard>
  );
}

/** Where it left from (H5): drawn where an email left a mailbox. */
function mailboxesCard(ro: ReachOutLensVM, className: string) {
  return (
    <ChartCard
      className={className}
      title="By mailbox"
      testid="ro-mailboxes"
      takeaway={ro.lines.mailboxes}
      switchable={false}
    >
      <MailboxesTable rows={ro.mailboxes} />
    </ChartCard>
  );
}

/** The emails written, day by day. */
function writtenCard(ro: ReachOutLensVM, className: string) {
  return (
    <ChartCard
      className={className}
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
        describe={(d) => d.writtenWords}
      />
    </ChartCard>
  );
}

/** Each reach-out with each of its steps on its own line, with the table twin the card offers. */
function sourcesCard(ro: ReachOutLensVM) {
  return (
    <ChartCard
      className="rpt-span-12"
      title="By reach-out and step"
      testid="ro-sources"
      takeaway={ro.lines.sources}
      switchable={false}
      table={{
        columns: [
          "Reach-out",
          "Written",
          "Delivered",
          "Businesses",
          "Wrote back",
          "Interested",
          "Booked",
          "Won",
          "Said no",
          "Bounced",
        ],
        rows: ro.sources.map((s) => [
          s.name,
          s.written,
          s.delivered,
          s.businesses,
          s.wroteBack,
          s.interested,
          s.booked,
          s.won,
          s.saidNo,
          s.bounced,
        ]),
      }}
    >
      <SourcesTable rows={ro.sources} />
    </ChartCard>
  );
}

/**
 * Where it left from beside the days it was written: a mailbox's card where an email left one, and the days where any were
 * written. A period in which only calls and notes were handed to you wrote none (the emails card says so; a card of the same
 * words is not drawn again), and then the mailbox, if there is one, takes the row.
 */
function daysRow(ro: ReachOutLensVM) {
  const wrote = ro.emails.empty === null;
  const mailboxes = ro.mailboxes.length > 0;
  if (!wrote && !mailboxes) return null;
  return (
    <div className="rpt-grid">
      {mailboxes && mailboxesCard(ro, wrote ? "rpt-span-5" : "rpt-span-12")}
      {wrote && writtenCard(ro, mailboxes ? "rpt-span-7" : "rpt-span-12")}
    </div>
  );
}

/** The strip and the cards of a period in which a reach-out wrote or handed something in, or the card that says none did. */
function reachOutsBody(ro: ReachOutLensVM) {
  if (ro.empty) {
    return (
      <EmptyState
        kind="card"
        glyph="wave"
        title="Nothing written"
        body={ro.lines.empty}
        action={{ label: "Open Campaigns", to: "outbound" }}
        testid="ro-report-empty"
      />
    );
  }
  return (
    <>
      <RptStrip tiles={ro.strip} className="trio" testid="ro-strip" />
      <div className="rpt-grid">
        {emailsCard(ro, "rpt-span-4")}
        {businessesCard(ro, "rpt-span-4")}
        {anglesCard(ro, "rpt-span-4")}
      </div>
      {daysRow(ro)}
      <div className="rpt-grid">{sourcesCard(ro)}</div>
    </>
  );
}

/**
 * The section: drawn where the workspace has a reach-out, or where the read of them failed (then it is the failed read alone, in
 * the fold's words, and the rest of the lens stands). Nothing where there is none, and nothing in a demo, which reads none.
 */
export function reachOutsSection(fold: CampaignLensVM) {
  const failed = fold.failed.find((f) => f.part === "reach_outs");
  const ro = fold.reachOuts;
  if (failed === undefined && (ro === null || !ro.present)) return null;
  return (
    <RptSection title="Reach-outs" testid="rpt-reach-outs">
      {failed === undefined ? (
        ro && reachOutsBody(ro)
      ) : (
        <div className="rpt-grid">{failedRead(failed, "ro-failed")}</div>
      )}
    </RptSection>
  );
}
