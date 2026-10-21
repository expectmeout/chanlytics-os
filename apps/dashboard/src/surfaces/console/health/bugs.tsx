/**
 * Bugs, Health's tab: what broke in members' browsers whether or not anyone said so (decision 0068), then what members
 * sent as "Something isn't working" (decision 0067).
 *
 * The errors nobody reported are the beacon's (client_errors, 00469), grouped by fingerprint, the same short id a
 * member's Get help sends, so a report lands on its error's group: first and last seen, how many times and people, on
 * which builds and devices, the reports that name it, and its words to copy into a ticket.
 *
 * The reports: one error that reached several workspaces shown once above them, each report with its words, its page
 * and its error. A person still answers each from the inbox; one that is really a question goes back to Support with
 * one press, an act whose reason is its code.
 */
import {
  SUPPORT_WORDS,
  consolePathOf,
  errorGroupReport,
  errorGroupsOf,
  reportOf,
  staffMay,
  supportClusters,
  type SupportReportDto,
} from "@chanlytics/contracts";
import { AttnRow } from "../../kit/attention/attn-row";
import { CopyButton } from "../../kit/copy-button/copy-button";
import {
  NoneRow,
  ScreenFailed,
  ScreenReading,
  ScreenSection,
  useConsoleRead,
  type ConsoleRead,
  type Flash,
  type Go,
} from "../parts";
import { consoleVerbs, type ConsoleBugs, type ConsoleHealth, type ConsoleMe } from "../verbs";
import { healthCount as n } from "./line";

/** The errors pages hit in the window, grouped: the most people first, a group nobody hit for a day quiet. */
function ErrorGroups({
  h,
  reports,
  now,
}: {
  h: ConsoleHealth;
  reports: readonly SupportReportDto[] | null;
  now: number;
}) {
  const g = errorGroupsOf(h.client_errors, reports, now);
  return (
    <ScreenSection
      title="Errors nobody reported"
      sub={`${n(g.events)} in ${h.days} days · ${n(g.people)} ${g.people === 1 ? "person" : "people"} · kept thirty days`}
      testid="console-health-errors"
    >
      {!g.read ? (
        <NoneRow words="The errors pages hit could not be read just now." />
      ) : g.groups.length === 0 ? (
        <NoneRow words="No page hit an error in the window." />
      ) : (
        <div className="cl-attn-list">
          {g.builds.length > 1 ? (
            <div className="set-row" data-testid="console-health-errors-builds">
              <div className="set-row-info">
                <span className="set-row-label">By build</span>
                <span className="set-row-hint cs-h-mono">
                  {g.builds.map((b) => `${b.build} ${n(b.events)}`).join(" · ")}
                </span>
              </div>
            </div>
          ) : null}
          {g.groups.map((e) => (
            <div className="cs-bug" key={e.fingerprint} data-testid={`console-health-error-${e.fingerprint}`}>
              <AttnRow
                glyph="alert"
                name={`${e.name}: ${e.message}`}
                meta={[e.page, `error ${e.fingerprint}`, e.since ? `since ${e.since}` : null]
                  .filter(Boolean)
                  .join(" · ")}
                sentence={`${n(e.events)} time${e.events === 1 ? "" : "s"} · ${n(e.people)} ${e.people === 1 ? "person" : "people"} · first ${e.first}, last ${e.last}`}
                status={[
                  `desk ${e.devices.desk} · phone ${e.devices.phone}`,
                  e.reports.length ? `reported: ${e.reports.join(", ")}` : "nobody reported it",
                ]}
                tone={e.quiet ? "plain" : e.people > 1 ? "danger" : "warn"}
                testid={`console-health-error-${e.fingerprint}-row`}
              />
              <CopyButton
                text={errorGroupReport(e)}
                label="Copy for a ticket"
                said={SUPPORT_WORDS.copied}
                testid={`console-health-error-${e.fingerprint}-copy`}
              />
            </div>
          ))}
        </div>
      )}
    </ScreenSection>
  );
}

export function BugsTab({ h, me, go, flash }: { h: ConsoleHealth; me: ConsoleMe; go: Go; flash: Flash }) {
  const read = useConsoleRead(consoleVerbs.bugs, "support/bugs");
  const now = Date.now();
  return (
    <>
      <ErrorGroups h={h} reports={read.data?.reports ?? null} now={now} />
      <BugReports read={read} me={me} go={go} flash={flash} now={now} />
    </>
  );
}

function BugReports({
  read,
  me,
  go,
  flash,
  now,
}: {
  read: ConsoleRead<ConsoleBugs>;
  me: ConsoleMe;
  go: Go;
  flash: Flash;
  now: number;
}) {
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
