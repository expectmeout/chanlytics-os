/**
 * Reports › Content (00696; the content loop PRD's 9.3 and Appendix A.8; the journey canvas's Results board, cells 12
 * and 13, approved by Ruben on 23 Nov 2026): what the business's posts brought over the window Reports shows. One
 * sentence; four figures, a reach no place gave said as not given; every booking counted once by its state, new people
 * and known apart; what "it helped" means; and each post's own line. Its own read (GET content/report, over the same
 * window as every report: the period or the days picked), made as the lens is drawn and again when the window moves. A
 * window with nothing posted says so, and a read that fails says it could not read, never a number it does not have.
 * Every sentence is the lens's words' (words.ts contentReportSaid), in the workspace's word for a booking.
 */
import "./lens.css";
import { useEffect, useState } from "react";
import { reportRangeKey, type ContentReportDto } from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { EmptyState, FailedRead } from "../../../kit/empty/empty";
import { Figure } from "../../../kit/figure/figure";
import { visitWordHere } from "../../../workspace-word";
import { RptSection } from "../../blocks";
import { rangeQuery, shownReportRange } from "../../surface";
import { contentReportSaid } from "./words";

/** The lens's read for the window shown: being read, read, or not read. */
type ContentRead =
  { state: "reading" } | { state: "failed"; why: string | null } | { state: "read"; dto: ContentReportDto };

/** The window's content report, read as the lens is drawn and again whenever the window it shows moves. */
function useContentReport(key: string): ContentRead {
  const [reportRead, setRead] = useState<ContentRead>({ state: "reading" });
  useEffect(() => {
    let live = true;
    setRead({ state: "reading" });
    void read("GET content/report", { query: rangeQuery(shownReportRange()) }).then(
      (dto) => live && setRead({ state: "read", dto }),
      (e: unknown) => live && setRead({ state: "failed", why: e instanceof Error ? e.message : null }),
    );
    return () => {
      live = false;
    };
  }, [key]);
  return reportRead;
}

/** The Content lens's body. */
export function ContentLens() {
  const key = reportRangeKey(shownReportRange());
  const report = useContentReport(key);
  if (report.state === "reading")
    return (
      <EmptyState
        kind="page"
        glyph="image"
        title="Reading what your posts brought…"
        body=""
        testid="rpt-content-reading"
      />
    );
  if (report.state === "failed")
    return <FailedRead kind="page" what="what your posts brought" why={report.why} testid="rpt-content-failed" />;
  const view = contentReportSaid(report.dto, visitWordHere());
  if (view.empty)
    return <EmptyState kind="page" glyph="image" title={view.title} body={view.body} testid="rpt-content-empty" />;
  return (
    <div className="rpt-content" data-testid="rpt-content">
      <p className="rpt-content-head" data-testid="rpt-content-head">
        {view.head}
      </p>
      <dl className="rpt-figures quad" data-testid="rpt-content-figures">
        {view.figures.map((figure) => (
          <Figure
            key={figure.id}
            className="rpt-cell"
            id={figure.id}
            label={figure.label}
            value={figure.value}
            meta={figure.meta}
          />
        ))}
      </dl>
      <RptSection title={view.counted.title} testid="rpt-content-counted">
        {view.counted.lines.map((line) => (
          <p key={line} className="rpt-content-line">
            {line}
          </p>
        ))}
        <p className="rpt-content-fine">{view.fine}</p>
      </RptSection>
      {view.byPost.rows.length ? (
        <RptSection title={view.byPost.title} testid="rpt-content-by-post">
          <ul className="rpt-content-posts">
            {view.byPost.rows.map((row) => (
              <li key={row.id} data-testid="rpt-content-post">
                <b>{row.name}</b>
                <span>{row.line}</span>
              </li>
            ))}
          </ul>
        </RptSection>
      ) : null}
    </div>
  );
}
