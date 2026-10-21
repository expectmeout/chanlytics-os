/**
 * Health (decision 0068): whether the platform keeps its promises to every workspace, and if not, what broke, where,
 * and what to press. One read (GET platform/health) over a week or a month; a line that says who needs a look and
 * whether every clock runs; whose numbers (customers', ours, or all: our own workspaces are counted apart and never
 * paged); and eight parts as tabs on the address (/console/health/<part>), the overview's tiles opening each.
 *
 * A part that could not be read says so in its own card and takes nothing else with it. Every sentence is contracts'.
 */
import { useMemo, useState } from "react";
import {
  HEALTH_SCOPES,
  HEALTH_SCOPE_WORDS,
  HEALTH_TABS,
  HEALTH_TAB_WORDS,
  HEALTH_WINDOWS,
  HEALTH_WORDS,
  healthAskOf,
  healthCounts,
  healthLooksOf,
  healthPathOf,
  healthSentence,
  healthTabOf,
  healthTilesOf,
  oursOf,
  promiseDaysOf,
  type HealthScope,
  type HealthTab,
  type HealthWindow,
} from "@chanlytics/contracts";
import { backOffice } from "@/legacy-bridge/platform";
import { PageHead } from "../../kit/head/page-head";
import { Segmented } from "../../kit/segmented/segmented";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { ScreenFailed, ScreenReading, useConsoleRead, type Flash, type Go } from "../parts";
import { consoleVerbs, type ConsoleHealth, type ConsoleMe } from "../verbs";
import { AskTab } from "./ask";
import { BackgroundTab } from "./background";
import { BugsTab } from "./bugs";
import { MessagesTab } from "./messages";
import { ModelTab } from "./model";
import { OverviewTab } from "./overview";
import { PromiseGrid } from "./promises";
import { SpeedTab } from "./speed";

const WINDOW_OF: Record<string, HealthWindow> = { "7": 7, "30": 30 };

/** Everything the tabs draw from one read, judged once per read and scope. */
function useHealthViews(h: ConsoleHealth | null, scope: HealthScope) {
  return useMemo(() => {
    if (!h) return null;
    const nowMs = Date.parse(h.checked_at) || Date.now();
    return {
      nowMs,
      tiles: healthTilesOf(h, scope, nowMs),
      looks: healthLooksOf(h, scope, nowMs),
      counts: healthCounts(h, nowMs),
      sentence: healthSentence(h, nowMs),
      promises: promiseDaysOf(h.day_rows, oursOf(h.workspaces), scope, h.days),
      ask: healthAskOf(h.parts, scope),
    };
  }, [h, scope]);
}

export function HealthScreen({ me, go, flash, pathname }: { me: ConsoleMe; go: Go; flash: Flash; pathname: string }) {
  const tab = healthTabOf(pathname);
  const [days, setDays] = useState<HealthWindow>(30);
  const [scope, setScope] = useState<HealthScope>("customers");
  const P = useMemo(() => backOffice.verbs, []);
  const read = useConsoleRead(() => consoleVerbs.health(days), `health/${days}`);
  const h = read.data;
  const v = useHealthViews(h, scope);
  return (
    <div className="cs-screen cs-health" data-testid="console-health">
      <PageHead title={HEALTH_WORDS.title} sentence={v ? v.sentence : null} />
      <div className="cs-tools">
        <Segmented
          label={HEALTH_WORDS.scope}
          value={scope}
          onValueChange={setScope}
          options={HEALTH_SCOPES.map((s) => ({
            value: s,
            label: v ? `${HEALTH_SCOPE_WORDS[s]} ${v.counts[s]}` : HEALTH_SCOPE_WORDS[s],
            testid: `console-health-scope-${s}`,
          }))}
        />
        <Segmented
          label={HEALTH_WORDS.window}
          value={String(days)}
          onValueChange={(d) => setDays(WINDOW_OF[d] ?? 30)}
          options={HEALTH_WINDOWS.map((d) => ({
            value: String(d),
            label: HEALTH_WORDS.windowWords(d),
            testid: `console-health-days-${d}`,
          }))}
        />
      </div>
      {scope !== "customers" ? <div className="cs-held">{HEALTH_WORDS.oursNote}</div> : null}
      <SubTabs
        label={HEALTH_WORDS.tabs}
        value={tab}
        dense
        onSelect={(id) => go(healthPathOf(id as HealthTab))}
        tabs={HEALTH_TABS.map((t) => ({
          id: t,
          label: HEALTH_TAB_WORDS[t],
          href: healthPathOf(t),
          testid: `console-health-tab-${t}`,
        }))}
      />
      {!h || !v ? (
        read.problem ? (
          <ScreenFailed
            what={HEALTH_WORDS.failed}
            why={read.problem}
            busy={read.busy}
            again={read.again}
            testid="console-health-failed"
          />
        ) : (
          <ScreenReading />
        )
      ) : (
        <>
          {tab === "overview" && (
            <OverviewTab
              h={h}
              tiles={v.tiles}
              looks={v.looks}
              promises={v.promises}
              scope={scope}
              nowMs={v.nowMs}
              me={me}
              go={go}
              flash={flash}
              again={read.again}
            />
          )}
          {tab === "promises" && (
            <PromiseGrid grid={v.promises} read={h.day_rows !== null} sub="a cell is one UTC day" detailed />
          )}
          {tab === "background" && (
            <BackgroundTab h={h} scope={scope} nowMs={v.nowMs} me={me} go={go} flash={flash} again={read.again} />
          )}
          {tab === "messages" && <MessagesTab h={h} scope={scope} nowMs={v.nowMs} />}
          {tab === "ask" && <AskTab a={v.ask} h={h} scope={scope} />}
          {tab === "model" && <ModelTab h={h} scope={scope} />}
          {tab === "speed" && <SpeedTab P={P} h={h} />}
          {tab === "bugs" && <BugsTab h={h} me={me} go={go} flash={flash} />}
        </>
      )}
    </div>
  );
}
