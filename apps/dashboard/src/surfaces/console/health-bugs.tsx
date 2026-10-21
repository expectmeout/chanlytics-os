/**
 * Health's bug reports (decision 0067): what members sent as "Something isn't working" in the last thirty days, one
 * error that reached several workspaces shown once above them, each report with its words, its page and its error. A
 * person still answers each from the inbox; one that is really a question goes back to Support with one press, an act
 * whose reason is its code. Health's own analysis of what breaks is a later tier's; this is where the reports land.
 */
import { SUPPORT_WORDS, consolePathOf, reportOf, staffMay, supportClusters } from "@chanlytics/contracts";
import { AttnRow } from "../kit/attention/attn-row";
import { CopyButton } from "../kit/copy-button/copy-button";
import { NoneRow, ScreenFailed, ScreenReading, ScreenSection, useConsoleRead, type Flash, type Go } from "./parts";
import { consoleVerbs, type ConsoleMe } from "./verbs";

export function BugReports({ me, go, flash }: { me: ConsoleMe; go: Go; flash: Flash }) {
  const read = useConsoleRead(consoleVerbs.bugs, "support/bugs");
  if (!read.data)
    return read.problem ? (
      <ScreenFailed
        what="the bug reports"
        why={read.problem}
        busy={read.busy}
        again={read.again}
        testid="console-bugs-failed"
      />
    ) : (
      <ScreenReading />
    );
  const now = Date.now();
  const reports = read.data.reports;
  const clusters = supportClusters(reports, now);
  const may = staffMay(me.role, "report_moved");
  const back = async (id: string) => {
    const r = await consoleVerbs.move(id, "how_to");
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.ok ? SUPPORT_WORDS.movedBackSaid : r.message}</> });
    if (r.ok) read.again();
  };
  return (
    <ScreenSection
      title="Bug reports"
      sub={`${reports.length} in the last thirty days · from "Something isn't working"`}
      testid="console-bugs"
    >
      <div className="cl-attn-list">
        {clusters.map((c) => (
          <AttnRow
            key={c.errorId}
            glyph="alert"
            name={`The same error, ${c.workspaces.length} workspaces`}
            meta={[c.page, `error ${c.errorId}`, `${c.reports} report${c.reports === 1 ? "" : "s"}`].join(" · ")}
            sentence={c.error}
            status={[`${c.workspaces.join(", ")} · first ${c.first}, last ${c.last}`]}
            tone="danger"
            testid={`console-cluster-${c.errorId}`}
          />
        ))}
        {reports.length === 0 && <NoneRow words="Nobody reported something not working in the last thirty days." />}
        {reports.map((dto) => {
          const r = reportOf(dto, now);
          return (
            <div className="cs-bug" key={r.id} data-testid={`console-bug-${r.code}`}>
              <AttnRow
                glyph="alert"
                name={r.workspace}
                meta={[r.page, r.when, r.who].join(" · ")}
                sentence={r.words}
                quoted
                status={[r.code, r.error ?? "no error caught"]}
                {...(r.unmailed ? { note: r.unmailed, tone: "warn" } : {})}
                {...(r.slug ? { onOpen: () => go(consolePathOf("workspaces", r.slug)) } : {})}
                {...(may
                  ? {
                      also: {
                        label: SUPPORT_WORDS.moveToSupport,
                        onClick: () => void back(r.id),
                        testid: `console-bug-${r.code}-back`,
                      },
                    }
                  : {})}
              />
              <CopyButton
                text={r.code}
                label={`Copy ${r.code}`}
                said={SUPPORT_WORDS.copied}
                testid={`console-copy-${r.code}`}
              />
            </div>
          );
        })}
      </div>
    </ScreenSection>
  );
}
