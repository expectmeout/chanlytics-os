/**
 * Needs a look (decision 0068): everything that needs a person, worst first then newest, each with what, where and
 * since (contracts healthLooksOf), and beside the one picked its fix: what the door answered, where and when, a plain
 * reading of the answer, and its one act, Run again, Deliver again or the tab that holds it. On a phone the rows are a
 * list and the one opened is a sheet, as Support's queue is.
 *
 * Keys on a desk: ↑↓ move, Enter opens, Esc closes, R arms the row's act (it still asks why).
 */
import { useEffect, useState } from "react";
import {
  HEALTH_TAB_WORDS,
  HEALTH_WORDS,
  consolePathOf,
  healthPathOf,
  healthQuietWords,
  type HealthLookVM,
  type HealthScope,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { CopyButton } from "../../kit/copy-button/copy-button";
import { Icon } from "../../kit/icon/icon";
import { Sheet } from "../../kit/sheet/sheet";
import { NoneRow, typingIn, useBeside, type Flash, type Go } from "../parts";
import type { ConsoleHealth, ConsoleMe } from "../verbs";
import { HealthActButton } from "./acts";

const SEVERITY_WORDS = { red: "Broken", amber: "Worth a look", plain: "Older" } as const;

/** A look as a bug report or a ticket says it: plain text, no person in it. */
function lookReport(l: HealthLookVM): string {
  return [
    l.what,
    l.why,
    `Where: ${l.where}`,
    l.since ? `Since: ${l.since}` : null,
    l.detail ? `Answered: ${l.detail}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** The facts beside a look: its workspace, and for a failed job its kind, its tries and when it was queued. */
function whereRows(l: HealthLookVM, h: ConsoleHealth): Array<{ k: string; v: string }> {
  const rows = [{ k: "Workspace", v: l.where }];
  if (l.act.kind === "run_again") {
    const jobId = l.act.jobId;
    const job = (h.failed_jobs ?? []).find((j) => j.id === jobId);
    if (job) {
      rows.push({ k: "Job", v: job.kind });
      rows.push({ k: "Tries", v: String(job.attempts) });
      rows.push({ k: "Queued", v: new Date(job.created_at).toUTCString().slice(5, 22) + " UTC" });
    }
  }
  if (l.act.kind === "redrive") rows.push({ k: "Subscriber", v: l.act.subscriber });
  if (l.since) rows.push({ k: "Since", v: l.since });
  return rows;
}

/** The fix beside the row: what it answered, where, the reading, and its acts. */
function LookDetail({
  look,
  h,
  me,
  go,
  flash,
  again,
  armed,
  setArmed,
  inSheet = false,
}: {
  look: HealthLookVM;
  h: ConsoleHealth;
  me: ConsoleMe;
  go: Go;
  flash: Flash;
  again: () => void;
  armed: boolean;
  setArmed: (armed: boolean) => void;
  /** In a sheet, whose head already says what it is. */
  inSheet?: boolean;
}) {
  const slug = look.tenantId ? ((h.workspaces ?? []).find((w) => w.id === look.tenantId)?.slug ?? null) : null;
  const act = look.act;
  return (
    <div className="cs-a" data-testid="console-health-look">
      <div className="cs-a-part">
        {inSheet ? null : <span className="cs-a-strong">{look.what}</span>}
        <span className="cs-a-dim">{look.why}</span>
      </div>
      {look.detail ? (
        <div className="cs-a-part">
          <span className="cs-a-label">{HEALTH_WORDS.whatItAnswered}</span>
          <pre className="cs-h-answer" data-testid="console-health-look-answer">
            {look.detail}
          </pre>
        </div>
      ) : null}
      <div className="cs-a-part">
        <span className="cs-a-label">{HEALTH_WORDS.where}</span>
        {whereRows(look, h).map((r) => (
          <div className="cs-a-line" key={r.k}>
            <span className="cs-a-dim">{r.k}</span>
            <span>{r.v}</span>
          </div>
        ))}
      </div>
      {look.reading ? (
        <div className="cs-a-part">
          <span className="cs-a-label">{HEALTH_WORDS.readFirst}</span>
          <span className="cs-a-words" data-testid="console-health-look-reading">
            {look.reading}
          </span>
        </div>
      ) : null}
      <div className="cs-a-acts">
        {act.kind === "open" ? (
          <Button
            size="sm"
            variant="primary"
            onClick={() => go(healthPathOf(act.tab))}
            data-testid="console-health-look-open"
          >
            {`${HEALTH_WORDS.open} ${HEALTH_TAB_WORDS[act.tab]}`}
          </Button>
        ) : (
          <HealthActButton
            run={act}
            me={me}
            flash={flash}
            again={again}
            armed={armed}
            setArmed={setArmed}
            testid="console-health-look-act"
          />
        )}
        {!armed && (
          <CopyButton
            text={lookReport(look)}
            label={HEALTH_WORDS.copyForBug}
            said="Copied"
            testid="console-health-look-copy"
          />
        )}
        {!armed && slug ? (
          <Button
            size="sm"
            variant="quiet"
            onClick={() => go(consolePathOf("workspaces", slug))}
            data-testid="console-health-look-workspace"
          >
            Open the workspace
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** The rows: severity, what and why, where, since. */
function LookList({
  looks,
  picked,
  onOpen,
}: {
  looks: readonly HealthLookVM[];
  picked: string | null;
  onOpen: (key: string) => void;
}) {
  return (
    <div className="cs-q" data-shape="look">
      <div className="cs-q-head" aria-hidden="true">
        <span>What</span>
        <span>Where</span>
        <span>Since</span>
      </div>
      <div
        className="cs-q-list"
        role="listbox"
        aria-label={HEALTH_WORDS.needsALook}
        aria-activedescendant={picked ? `cs-h-${picked}` : undefined}
        tabIndex={0}
        data-testid="console-health-looks"
      >
        {looks.map((l) => (
          <div
            key={l.key}
            id={`cs-h-${l.key}`}
            className="cs-q-row"
            role="option"
            aria-selected={picked === l.key}
            tabIndex={-1}
            onClick={() => onOpen(l.key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(l.key);
              }
            }}
            data-testid={`console-health-look-${l.key}`}
          >
            <div className="cs-q-what">
              <span className="cs-q-title">
                <span className="cs-h-sev" data-sev={l.severity} role="img" aria-label={SEVERITY_WORDS[l.severity]} />
                {l.what}
              </span>
              <span className="cs-q-meta">{l.why}</span>
            </div>
            <span className="cs-q-topic">
              {l.where}
              {l.ours ? <span className="cs-h-ours"> · Ours</span> : null}
            </span>
            <span className="cs-q-topic">{l.since}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NeedsALook({
  looks,
  scope,
  h,
  me,
  go,
  flash,
  again,
}: {
  looks: readonly HealthLookVM[];
  scope: HealthScope;
  h: ConsoleHealth;
  me: ConsoleMe;
  go: Go;
  flash: Flash;
  again: () => void;
}) {
  const beside = useBeside();
  const [picked, setPicked] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [armed, setArmed] = useState(false);
  // A desk keeps one picked while rows wait; a row that leaves (run again, mended) hands its place to the first.
  useEffect(() => {
    if (looks.some((l) => l.key === picked)) return;
    setPicked(beside ? (looks[0]?.key ?? null) : null);
    setArmed(false);
  }, [looks, picked, beside]);
  const look = looks.find((l) => l.key === picked) ?? null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typingIn(e.target)) return;
      if (!beside && opened) return;
      const here = looks.findIndex((l) => l.key === picked);
      const step = (by: number) => {
        const next = looks[Math.max(0, Math.min(looks.length - 1, here + by))];
        if (next) {
          setPicked(next.key);
          setArmed(false);
        }
      };
      if (e.key === "ArrowDown") step(1);
      else if (e.key === "ArrowUp") step(-1);
      else if (e.key === "Enter" && look) setOpened(true);
      else if (e.key === "Escape") {
        setOpened(false);
        setArmed(false);
      } else if (e.key.toLowerCase() === "r" && look && look.act.kind !== "open") setArmed(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const open = (key: string) => {
    if (key !== picked) setArmed(false);
    setPicked(key);
    setOpened(true);
  };
  const detail = look ? (
    <LookDetail
      look={look}
      h={h}
      me={me}
      go={go}
      flash={flash}
      again={again}
      armed={armed}
      setArmed={setArmed}
      inSheet={!beside}
    />
  ) : null;
  return (
    <div className="cs-desk" data-beside={beside && look ? "true" : undefined}>
      <section className="rec-card set-card cs-desk-list" data-testid="console-health-needs">
        <div className="rec-card-head">
          <h2 className="rec-card-title">{HEALTH_WORDS.needsALook}</h2>
          <span className="rec-card-sub">
            {HEALTH_WORDS.needsALookSub}
            {beside && looks.length ? ` · ${HEALTH_WORDS.keys}` : ""}
          </span>
        </div>
        {looks.length === 0 ? (
          <NoneRow words={healthQuietWords(scope)} testid="console-health-quiet" />
        ) : (
          <LookList looks={looks} picked={picked} onOpen={open} />
        )}
      </section>
      {beside && look && (
        <aside className="rec-card set-card cs-desk-side" aria-label={look.what}>
          {detail}
        </aside>
      )}
      {!beside && look && (
        <Sheet
          open={opened}
          onClose={() => {
            setOpened(false);
            setArmed(false);
          }}
          title={look.what}
          sub={look.where}
          close={{ label: HEALTH_WORDS.close, glyph: <Icon name="x" size={13} /> }}
          testid="console-health-sheet"
        >
          {detail}
        </Sheet>
      )}
    </div>
  );
}
