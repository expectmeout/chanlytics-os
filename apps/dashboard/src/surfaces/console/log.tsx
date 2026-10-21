/**
 * The Admin log (decision 0066, the canvas's Log board): every act the team took, newest first, each with who, their
 * role, what, where, why and what came of it, everyone's or yours; older a page at a time; the whole log as a CSV file
 * for the record. Every role reads it. Every word is contracts' (actRowOf).
 */
import { useEffect, useState } from "react";
import { ACT_LOG_PAGE, actRowOf, consolePathOf, type PlatformActDto, type PlatformActVM } from "@chanlytics/contracts";
import { AttnRow } from "../kit/attention/attn-row";
import { Button } from "../kit/button/button";
import { downloadCsv } from "../kit/download";
import { PageHead } from "../kit/head/page-head";
import { SubTabs } from "../kit/sub-tabs/sub-tabs";
import { NoneRow, ScreenFailed, ScreenReading, ScreenSection, type Go } from "./parts";
import { consoleVerbs, type ConsoleMe } from "./verbs";

/** An outcome's glyph. */
const OUTCOME_GLYPH: Record<string, string> = { Running: "clock", Done: "check", Refused: "alert", Failed: "alert" };

/** One act as the log draws it. */
export function ActRow({ act, onOpen = null }: { act: PlatformActVM; onOpen?: (() => void) | null }) {
  return (
    <AttnRow
      glyph={OUTCOME_GLYPH[act.outcome.label] ?? "dot"}
      name={`${act.who} · ${act.what}`}
      meta={[act.role, act.where, act.when].join(" · ")}
      sentence={act.why}
      status={[act.outcome.label]}
      {...(act.outcomeNote ? { note: act.outcomeNote } : {})}
      tone={act.outcome.tone}
      {...(onOpen ? { onOpen } : {})}
      testid={`console-act-${act.id}`}
    />
  );
}

type Whose = "everyone" | "mine";

export function LogScreen({ me, go }: { me: ConsoleMe; go: Go }) {
  const [whose, setWhose] = useState<Whose>("everyone");
  const [rows, setRows] = useState<PlatformActDto[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(true);
  const [turn, setTurn] = useState(0);
  const who = whose === "mine" ? me.user_id : undefined;

  // The newest page, again whenever whose log it is, or a retry, changes.
  useEffect(() => {
    let on = true;
    setRows(null);
    void consoleVerbs.acts(who ? { who } : {}).then((r) => {
      if (!on) return;
      if (!r.ok) return setProblem(r.message);
      setProblem(null);
      setRows(r.data.rows);
      setMore(r.data.rows.length >= ACT_LOG_PAGE);
    });
    return () => {
      on = false;
    };
  }, [who, turn]);

  /** The page older than the last row shown, after it. */
  const older = async (before: string) => {
    setBusy(true);
    const r = await consoleVerbs.acts({ ...(who ? { who } : {}), before });
    setBusy(false);
    if (!r.ok) return setProblem(r.message);
    setRows((held) => [...(held ?? []), ...r.data.rows]);
    setMore(r.data.rows.length >= ACT_LOG_PAGE);
  };

  const csv = async () => {
    setBusy(true);
    const r = await consoleVerbs.actsCsv();
    setBusy(false);
    if (r.ok) downloadCsv(`chanlytics-admin-log-${new Date().toISOString().slice(0, 10)}.csv`, r.data);
    else setProblem(r.message);
  };

  const now = Date.now();
  return (
    <div className="cs-screen" data-testid="console-log">
      <PageHead title="Admin log" sentence="Every act the team took, why, and what came of it" />
      <div className="cs-tools">
        <SubTabs
          label="Whose"
          value={whose}
          onSelect={(id) => setWhose(id as Whose)}
          tabs={[
            { id: "everyone", label: "Everyone" },
            { id: "mine", label: "Mine" },
          ]}
          dense
        />
        <Button size="sm" variant="quiet" onClick={() => void csv()} disabled={busy} data-testid="console-log-csv">
          Download CSV
        </Button>
      </div>
      {problem && !rows && (
        <ScreenFailed
          what="the log"
          why={problem}
          busy={busy}
          again={() => setTurn((n) => n + 1)}
          testid="console-log-failed"
        />
      )}
      {!rows && !problem && <ScreenReading />}
      {rows && (
        <ScreenSection
          title={whose === "mine" ? "Your acts" : "Every act"}
          sub={`${rows.length} shown`}
          testid="console-log-rows"
        >
          <div className="cl-attn-list">
            {rows.length === 0 && <NoneRow words="Nothing has been done from the Console yet." />}
            {rows.map((a) => {
              const vm = actRowOf(a, now);
              return (
                <ActRow
                  key={a.id}
                  act={vm}
                  onOpen={vm.slug ? () => go(consolePathOf("workspaces", vm.slug, "activity")) : null}
                />
              );
            })}
          </div>
          {more && rows.length > 0 && (
            <Button
              size="sm"
              variant="quiet"
              onClick={() => void older(rows[rows.length - 1]?.at ?? "")}
              disabled={busy}
              data-testid="console-log-older"
            >
              Older
            </Button>
          )}
        </ScreenSection>
      )}
    </div>
  );
}
