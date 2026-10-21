/**
 * Workspaces (decision 0066, the canvas's Workspaces board; once the back office's Every workspace): every workspace,
 * grouped by who the next move is with and worked down the page, found by name or address, with what its model calls
 * cost in the last thirty days. Read-only: a workspace's acts are on its own page, and each asks why.
 */
import { useState } from "react";
import { CONSOLE_GROUP_WORDS, consoleGroups, type ConsoleGroup } from "@chanlytics/contracts";
import { PageHead } from "../kit/head/page-head";
import { Search } from "../kit/search/search";
import { SubTabs } from "../kit/sub-tabs/sub-tabs";
import { backOffice } from "@/legacy-bridge/platform";
import { NoneRow, ScreenFailed, ScreenReading, ScreenSection, useConsoleRead, type Flash, type Go } from "./parts";
import { WorkspaceRow } from "./rows";
import { consoleVerbs } from "./verbs";

/** What the model calls cost, as the row says it. */
const dollars = (usd: number | undefined): string => (usd ? `$${usd.toFixed(2)} model, 30 d` : "");

export function WorkspacesScreen({ go, flash }: { go: Go; flash: Flash }) {
  const read = useConsoleRead(consoleVerbs.home, "workspaces");
  const [find, setFind] = useState("");
  const [only, setOnly] = useState<ConsoleGroup | "all">("all");
  if (!read.data)
    return read.problem ? (
      <ScreenFailed
        what="every workspace"
        why={read.problem}
        busy={read.busy}
        again={read.again}
        testid="console-workspaces-failed"
      />
    ) : (
      <ScreenReading />
    );
  const { tenants, claims, me, spend } = read.data;
  const P = backOffice.verbs;
  const rows = P.rows(tenants);
  const q = find.trim().toLowerCase();
  const found = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.includes(q)) : rows;
  const groups = consoleGroups(found);
  const shown = only === "all" ? groups : groups.filter((g) => g.group === only);
  const claimOf = new Map((claims ?? []).map((c) => [c.tenant_id, c]));
  return (
    <div className="cs-screen" data-testid="console-workspaces">
      <PageHead title="Workspaces" sentence={P.summary(rows).sentence} />
      <div className="cs-tools">
        <SubTabs
          label="Show"
          value={only}
          onSelect={(id) => setOnly(id as ConsoleGroup | "all")}
          tabs={[
            { id: "all", label: "All", count: found.length },
            ...groups.map((g) => ({ id: g.group, label: CONSOLE_GROUP_WORDS[g.group], count: g.rows.length })),
          ]}
          dense
        />
        <Search label="Find a workspace" value={find} onChange={setFind} testid="console-workspaces-find" />
      </div>
      {shown.length === 0 && (
        <ScreenSection title="Nothing here" testid="console-workspaces-none">
          <NoneRow words={q ? `Nothing matches “${find}”.` : "No workspaces yet."} />
        </ScreenSection>
      )}
      {shown.map((g) => (
        <ScreenSection key={g.group} title={g.words} sub={`${g.rows.length}`} testid={`console-group-${g.group}`}>
          <div className="cl-attn-list">
            {g.rows.map((r) => (
              <WorkspaceRow
                key={r.tenantId}
                row={r}
                claim={claimOf.get(r.tenantId) ?? null}
                me={me}
                go={go}
                flash={flash}
                onClaimed={read.again}
                cost={dollars(spend?.[r.tenantId])}
              />
            ))}
          </div>
        </ScreenSection>
      ))}
    </div>
  );
}
