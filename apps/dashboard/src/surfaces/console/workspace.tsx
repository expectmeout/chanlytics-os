/**
 * One workspace in the Console (decision 0066, the canvas's Overview, Lines and Activity boards), by the address /w/
 * says it with: where it stands, what it reported and asked for, and what happened lately (Overview); the Setup its
 * owner sees and its lines, each act asking why (Setup and lines); and what happened in it beside what the team did
 * there and why (Activity). Who on the team has it is said at its head, where it is taken and let go.
 */
import { useState } from "react";
import {
  CONSOLE_WORDS,
  CONSOLE_WORKSPACE_TABS,
  CONSOLE_WORKSPACE_TAB_WORDS,
  actRowOf,
  claimWords,
  consolePathOf,
  pageWords,
  reportCode,
  SETUP_ASK_WORDS,
  verdictPill,
  type ConsoleWorkspaceTab,
} from "@chanlytics/contracts";
import { AttnRow } from "../kit/attention/attn-row";
import { Button } from "../kit/button/button";
import { PageHead } from "../kit/head/page-head";
import { SubTabs } from "../kit/sub-tabs/sub-tabs";
import { backOffice } from "@/legacy-bridge/platform";
import { PlatformEvents, SetupAndLines } from "./lines";
import { ActRow } from "./log";
import { NoneRow, ScreenFailed, ScreenReading, ScreenSection, useConsoleRead, type Flash, type Go } from "./parts";
import { consoleVerbs, type ConsoleMe, type ConsoleWorkspace } from "./verbs";

/** How many events Overview shows; Activity holds the rest. */
const LATELY = 5;

export function WorkspaceScreen({
  slug,
  tab,
  me,
  go,
  flash,
}: {
  slug: string;
  tab: ConsoleWorkspaceTab;
  me: ConsoleMe;
  go: Go;
  flash: Flash;
}) {
  const read = useConsoleRead(() => consoleVerbs.workspace(slug), `workspace/${slug}`);
  if (!read.data) {
    if (read.missing)
      return (
        <ScreenSection title={slug} testid="console-workspace-missing">
          <NoneRow words={CONSOLE_WORDS.noSuchWorkspace} />
        </ScreenSection>
      );
    return read.problem ? (
      <ScreenFailed
        what="that workspace"
        why={read.problem}
        busy={read.busy}
        again={read.again}
        testid="console-workspace-failed"
      />
    ) : (
      <ScreenReading />
    );
  }
  return <Workspace ws={read.data} tab={tab} me={me} go={go} flash={flash} again={read.again} />;
}

function ClaimButton({
  ws,
  me,
  again,
  flash,
}: {
  ws: ConsoleWorkspace;
  me: ConsoleMe;
  again: () => void;
  flash: Flash;
}) {
  const [busy, setBusy] = useState(false);
  const held = claimWords(ws.claim, me.user_id, Date.now());
  const mine = !!ws.claim && ws.claim.user_id === me.user_id && !!held;
  if (held && !mine) return <span className="cs-held">{held}</span>;
  const press = async () => {
    setBusy(true);
    const r = await consoleVerbs.claim(ws.tenant.id, !mine);
    setBusy(false);
    if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
    again();
  };
  return (
    <Button
      size="sm"
      variant="quiet"
      onClick={() => void press()}
      disabled={busy}
      data-testid="console-workspace-claim"
    >
      {mine ? CONSOLE_WORDS.letGo : CONSOLE_WORDS.takeIt}
    </Button>
  );
}

function Workspace({
  ws,
  tab,
  me,
  go,
  flash,
  again,
}: {
  ws: ConsoleWorkspace;
  tab: ConsoleWorkspaceTab;
  me: ConsoleMe;
  go: Go;
  flash: Flash;
  again: () => void;
}) {
  const now = Date.now();
  const row = ws.row ? (backOffice.verbs.rows([ws.row])[0] ?? null) : null;
  const pill = row ? verdictPill(row.verdict) : null;
  const tz = ws.tenant.timezone;
  return (
    <div className="cs-screen" data-testid="console-workspace">
      <PageHead
        dateline={`Workspaces · ${ws.tenant.slug}`}
        title={ws.tenant.name}
        sentence={[pill?.label, row?.facts.paying, `${row?.members ?? 0} in it`, tz, `made ${row?.age ?? ""}`]
          .filter(Boolean)
          .join(" · ")}
      />
      <div className="cs-tools">
        <SubTabs
          label="Workspace"
          value={tab}
          onSelect={(id) => go(consolePathOf("workspaces", ws.tenant.slug, id as ConsoleWorkspaceTab))}
          tabs={CONSOLE_WORKSPACE_TABS.map((t) => ({
            id: t,
            label: CONSOLE_WORKSPACE_TAB_WORDS[t],
            testid: `console-tab-${t}`,
          }))}
        />
        <ClaimButton ws={ws} me={me} again={again} flash={flash} />
      </div>
      {tab === "overview" && <Overview ws={ws} sentence={row?.sentence ?? null} facts={row?.facts ?? null} go={go} />}
      {tab === "lines" && <SetupTab tenantId={ws.tenant.id} me={me} flash={flash} onChanged={again} />}
      {tab === "activity" && (
        <>
          <ScreenSection title="What the team did" sub="Newest first, each with why" testid="console-workspace-acts">
            <div className="cl-attn-list">
              {ws.acts === null && <NoneRow words={CONSOLE_WORDS.failed} />}
              {ws.acts?.length === 0 && <NoneRow words="Nobody on the team has acted here." />}
              {(ws.acts ?? []).map((a) => (
                <ActRow key={a.id} act={actRowOf(a, now)} />
              ))}
            </div>
          </ScreenSection>
          <ScreenSection title="What has happened" sub={`Newest first, in ${tz}`} testid="console-workspace-events">
            {ws.events ? <PlatformEvents events={ws.events} tz={tz} /> : <NoneRow words={CONSOLE_WORDS.failed} />}
          </ScreenSection>
        </>
      )}
    </div>
  );
}

/** Setup and lines: the workspace's Setup as its owner sees it, read by id, and its lines, each act asking why. */
function SetupTab({
  tenantId,
  me,
  flash,
  onChanged,
}: {
  tenantId: string;
  me: ConsoleMe;
  flash: Flash;
  onChanged: () => void;
}) {
  const read = useConsoleRead(() => consoleVerbs.tenant(tenantId), `tenant/${tenantId}`);
  if (!read.data)
    return read.problem ? (
      <ScreenFailed
        what="its Setup"
        why={read.problem}
        busy={read.busy}
        again={read.again}
        testid="console-setup-failed"
      />
    ) : (
      <ScreenReading />
    );
  return (
    <SetupAndLines
      setup={read.data.setup}
      tenantId={tenantId}
      role={me.role}
      onChanged={() => {
        read.again();
        onChanged();
      }}
      flash={flash}
    />
  );
}

function Overview({
  ws,
  sentence,
  facts,
  go,
}: {
  ws: ConsoleWorkspace;
  sentence: string | null;
  facts: { paying: string; answering: string; texting: string; heard: string } | null;
  go: Go;
}) {
  const now = Date.now();
  const tz = ws.tenant.timezone;
  const lately = (ws.events ?? []).slice(0, LATELY);
  return (
    <>
      <ScreenSection title="Where it stands" sub={sentence} testid="console-workspace-stands">
        {facts && (
          <div className="rec-rows">
            {(
              [
                ["Plan", facts.paying],
                ["Answering", facts.answering],
                ["Texting", facts.texting],
                ["Heard from", facts.heard],
              ] as const
            ).map(([label, value]) => (
              <div className="set-row" key={label}>
                <div className="set-row-info">
                  <span className="set-row-label">{label}</span>
                  <span className="set-row-hint">{value}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScreenSection>
      <ScreenSection
        title="Reported and asked"
        sub="From Report a problem and Setup"
        testid="console-workspace-came-in"
      >
        <div className="cl-attn-list">
          {(ws.reports ?? []).length + (ws.asks ?? []).length === 0 && <NoneRow words="Nothing reported or asked." />}
          {(ws.reports ?? []).map((r) => (
            <AttnRow
              key={r.id}
              glyph="chat"
              name={`“${r.words}”`}
              meta={[reportCode(r.number), r.email ?? "", pageWords(r.page)].filter(Boolean).join(" · ")}
              sentence={r.error_id ? `error ${r.error_id}` : "no error caught"}
              onOpen={() => go(consolePathOf("support"))}
              testid={`console-workspace-report-${r.number}`}
            />
          ))}
          {(ws.asks ?? []).map((a) => (
            <AttnRow
              key={`${a.what}-${a.at}`}
              glyph="user"
              name={SETUP_ASK_WORDS[a.what] ?? "Asked a person for something"}
              meta={backOfficeWhen(a.at, tz, now)}
              testid={`console-workspace-ask-${a.at}`}
            />
          ))}
        </div>
      </ScreenSection>
      <ScreenSection title="Lately" sub="What happened in it, newest first" testid="console-workspace-lately">
        {ws.events ? <PlatformEvents events={lately} tz={tz} /> : <NoneRow words={CONSOLE_WORDS.failed} />}
      </ScreenSection>
    </>
  );
}

/** When an ask came, in the workspace's own zone: the contracts clock the back office reads, called with its zone. */
function backOfficeWhen(iso: string, tz: string, now: number): string {
  const at = Date.parse(iso);
  const clock = backOffice.verbs.clock;
  return Number.isFinite(at) ? `${clock.dayLabel(at, tz, now)}, ${clock.time(at, tz)}` : "";
}
