/**
 * Support (decision 0066, the canvas's Support board): what customers reported from the app, this week or all, one
 * error that reached several workspaces shown once above them, and the asks setup cannot do yet. The replies are the
 * inbox's: each report's R-number is its subject there, copied from here. A report the inbox does not have says so.
 */
import { useState } from "react";
import {
  SETUP_ASK_WORDS,
  SUPPORT_VIEWS,
  SUPPORT_VIEW_WORDS,
  SUPPORT_WORDS,
  consolePathOf,
  reportOf,
  supportClusters,
  type SupportView,
} from "@chanlytics/contracts";
import { AttnRow } from "../kit/attention/attn-row";
import { CopyButton } from "../kit/copy-button/copy-button";
import { PageHead } from "../kit/head/page-head";
import { SubTabs } from "../kit/sub-tabs/sub-tabs";
import { NoneRow, ScreenFailed, ScreenReading, ScreenSection, useConsoleRead, type Go } from "./parts";
import { consoleVerbs } from "./verbs";

export function SupportScreen({ go }: { go: Go }) {
  const [view, setView] = useState<SupportView>("week");
  const read = useConsoleRead(() => consoleVerbs.support(view), `support/${view}`);
  const now = Date.now();
  const reports = read.data?.reports ?? [];
  const clusters = supportClusters(reports, now);
  return (
    <div className="cs-screen" data-testid="console-support">
      <PageHead title={SUPPORT_WORDS.title} sentence={SUPPORT_WORDS.sub} />
      <div className="cs-tools">
        <SubTabs
          label="When"
          value={view}
          onSelect={(id) => setView(id as SupportView)}
          tabs={SUPPORT_VIEWS.map((v) => ({ id: v, label: SUPPORT_VIEW_WORDS[v], testid: `console-support-${v}` }))}
          dense
        />
      </div>
      {!read.data &&
        (read.problem ? (
          <ScreenFailed
            what="the reports"
            why={read.problem}
            busy={read.busy}
            again={read.again}
            testid="console-support-failed"
          />
        ) : (
          <ScreenReading />
        ))}
      {read.data && clusters.length > 0 && (
        <ScreenSection
          title="The same error, more than one workspace"
          sub={`${clusters.length}`}
          testid="console-support-clusters"
        >
          <div className="cl-attn-list">
            {clusters.map((c) => (
              <AttnRow
                key={c.errorId}
                glyph="alert"
                name={SUPPORT_WORDS.cluster(c.workspaces.length)}
                meta={[c.page, `error ${c.errorId}`, SUPPORT_WORDS.clusterReports(c.reports)].join(" · ")}
                sentence={c.error}
                note={`${c.workspaces.join(", ")} · first ${c.first}, last ${c.last}`}
                tone="danger"
                testid={`console-cluster-${c.errorId}`}
              />
            ))}
          </div>
        </ScreenSection>
      )}
      {read.data && (
        <ScreenSection title="Reports" sub={`${reports.length}`} testid="console-support-reports">
          <div className="cl-attn-list">
            {reports.length === 0 && <NoneRow words={view === "week" ? SUPPORT_WORDS.none : SUPPORT_WORDS.noneAll} />}
            {reports.map((dto) => {
              const r = reportOf(dto, now);
              return (
                <div className="cs-report" key={r.id} data-testid={`console-report-${r.code}`}>
                  <AttnRow
                    glyph="chat"
                    name={r.workspace}
                    meta={[r.page, r.when].join(" · ")}
                    sentence={r.words}
                    quoted
                    status={[r.code, r.errorId ? `error ${r.errorId}` : "no error caught", r.who]}
                    {...(r.unmailed ? { note: r.unmailed, tone: "warn" } : {})}
                    {...(r.slug ? { onOpen: () => go(consolePathOf("workspaces", r.slug)) } : {})}
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
      )}
      {read.data && (
        <ScreenSection title="Asked for a person" sub="What setup can't do yet" testid="console-support-asks">
          <div className="cl-attn-list">
            {read.data.asks === null && <NoneRow words="The asks could not be read just now." />}
            {read.data.asks?.length === 0 && <NoneRow words="Nobody asked for a person." />}
            {(read.data.asks ?? []).map((a) => (
              <AttnRow
                key={`${a.tenant_id}-${a.at}`}
                glyph="user"
                name={SETUP_ASK_WORDS[a.what] ?? "Asked a person for something"}
                meta={a.name}
                onOpen={() => go(consolePathOf("workspaces", a.slug, "lines"))}
                testid={`console-ask-${a.tenant_id}-${a.at}`}
              />
            ))}
          </div>
        </ScreenSection>
      )}
    </div>
  );
}
