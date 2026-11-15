/**
 * Leads, in the Console (decision 0133, step 4): what the finder set aside in a workspace, per search, the team's alone.
 * A search shows its owner its finished leads only; the places it judged and did not count are read here, where a
 * search that came back short is looked into: each search with what it counted, set aside and spent, and the places one
 * of them set aside, each with why in the Leads page's own words.
 */
import { useState } from "react";
import { CONSOLE_WORDS } from "@chanlytics/contracts";
import { Icon } from "../kit/icon/icon";
import { Select } from "../kit/select/select";
import { NoneRow, ScreenFailed, ScreenReading, ScreenSection, useConsoleRead } from "./parts";
import { consoleVerbs } from "./verbs";

/** A search as its picker says it: its name, what it counted and set aside, and what it spent. */
const searchLine = (s: { name: string; counted: number; review: number; excluded: number; cost_usd: number }) =>
  `${s.name} · ${s.counted} counted · ${s.review + s.excluded} set aside · $${s.cost_usd.toFixed(2)}`;

export function SetAsideTab({ tenantId }: { tenantId: string }) {
  const [search, setSearch] = useState<string | null>(null);
  const read = useConsoleRead(() => consoleVerbs.setAside(tenantId, search), `set-aside/${tenantId}/${search ?? ""}`);
  if (!read.data)
    return read.problem ? (
      <ScreenFailed
        what="what the finder set aside"
        why={read.problem}
        busy={read.busy}
        again={read.again}
        testid="console-set-aside-failed"
      />
    ) : (
      <ScreenReading />
    );
  const { searches, search_id: open, places } = read.data;
  const picked = searches.find((s) => s.id === open) ?? null;
  return (
    <ScreenSection
      title="What the finder set aside"
      sub="The places a search judged and did not count. The owner sees only what counted."
      testid="console-set-aside"
      aside={
        picked ? (
          <Select
            value={picked.id}
            onValueChange={(id) => setSearch(id)}
            options={searches.map((s) => ({ value: s.id, label: searchLine(s) }))}
            chevron={<Icon name="chevron-down" size={12} />}
            label="Which search"
            data-testid="console-set-aside-search"
          />
        ) : null
      }
    >
      <div className="cl-attn-list">
        {!picked && <NoneRow words="No search the finder ran here yet." testid="console-set-aside-none" />}
        {picked && places.length === 0 && (
          <NoneRow words={`${picked.name} set nothing aside.`} testid="console-set-aside-empty" />
        )}
        {places.map((p, i) => (
          <div className="set-row" key={`${p.name}-${p.at}-${i}`} data-testid="console-set-aside-place">
            <div className="set-row-info">
              <span className="set-row-label">{p.name || CONSOLE_WORDS.failed}</span>
              <span className="set-row-hint">
                {[p.why, p.term ? `found by “${p.term}”` : null].filter(Boolean).join(" · ")}
              </span>
            </div>
          </div>
        ))}
      </div>
    </ScreenSection>
  );
}
