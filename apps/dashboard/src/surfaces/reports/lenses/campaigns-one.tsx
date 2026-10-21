/**
 * Reports › Campaigns, narrowed (Ruben, 21 Oct 2026: separate each campaign as Reports › Ads separates each ad): the picker
 * over the lens, every campaign or one sequence, written into the address (`reports/campaigns:<days>:seq:<id>`, contracts
 * campaignReportRoute), and one sequence's own cards over the days shown. Its numbers are counted from the batches its History
 * counts (contracts campaignOneOf over GET sequences/:id/history), read as far back as the days reach, so a day of History and
 * its report agree. A run's own report screen left for this: a day of History that went opens here, over that day; a send still
 * waiting for an OK is decided where it waits, and its row here opens that. The workspace's waits, what is stuck and the
 * reach-outs are every campaign's, so one campaign's cards leave them out.
 */
import { useEffect, useReducer, useState } from "react";
import {
  CAMPAIGN_CHOICE_GROUPS,
  CAMPAIGN_SCOPE_ALL,
  CAMPAIGN_SCOPE_WORDS as W,
  campaignChoicesOf,
  campaignOneOf,
  campaignReportRoute,
  campaignScopeKey,
  campaignScopeOfKey,
  historyCovers,
  runRoute,
  type CampaignOneVM,
  type CampaignScope,
  type LensId,
  type ReportsParts,
  type SequenceBatchDto,
  type SequenceRecordDto,
  type SequenceRowDto,
} from "@chanlytics/contracts";
import { reportWindowOf } from "@chanlytics/contracts/report-window";
import { BarChart, BarList } from "../../kit/charts/bar";
import { ChartCard } from "../../kit/charts/card";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { Figure } from "../../kit/figure/figure";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Picker } from "../../kit/picker/picker";
import { navigate, routeDoor } from "../../legacy-verbs";
import { cmChevron, cmGroups } from "../../campaigns/parts/picks";
import { sequenceVerbs } from "../../campaigns/sequences/verbs";
import { RptSection } from "../blocks";
import { RPT_SENT } from "../series";
import type { ReportsSurface } from "../surface";

/** One sequence's read: its record and its batches, as far back as they have been read; null before the first lands. */
interface OneRead {
  key: string;
  rec: SequenceRecordDto | null;
  batches: SequenceBatchDto[];
  more: boolean;
  /** A read that could not be made (a link to a sequence this workspace does not have is gone). */
  failed: "failed" | "gone" | null;
}

/** The sequences the picker lists: the list's own read, kept for the tab; none until it lands. */
function useSequenceRows(on: boolean): readonly SequenceRowDto[] {
  const held = sequenceVerbs.peekList();
  const [rows, setRows] = useState<readonly SequenceRowDto[]>(held && held.ok ? held.data.sequences : []);
  useEffect(() => {
    if (!on) return undefined;
    let live = true;
    void sequenceVerbs.list().then((r) => {
      if (live && r.ok) setRows(r.data.sequences);
    });
    return () => {
      live = false;
    };
  }, [on]);
  return rows;
}

/**
 * One sequence's record and its batches over the days shown: the first page, then a page further back at a time, until the
 * pages reach past the first day (contracts historyCovers) or there are no more. A page further back that fails stops there,
 * and the days are said from what was read.
 */
function useOneRead(id: string | null, from: string, again: number): OneRead | null {
  const [read, setRead] = useState<OneRead | null>(null);
  const key = `${id ?? ""}|${from}|${again}`;
  useEffect(() => {
    if (!id) return undefined;
    let live = true;
    void (async () => {
      const [rec, first] = await Promise.all([sequenceVerbs.record(id), sequenceVerbs.history(id)]);
      if (!live) return;
      if (!rec.ok || !first.ok) {
        const gone = !rec.ok && (rec.status === 404 || rec.status === 400);
        setRead({ key, rec: null, batches: [], more: false, failed: gone ? "gone" : "failed" });
        return;
      }
      const tz = rec.data.timezone;
      let batches = first.data.batches;
      let more = first.data.more;
      setRead({ key, rec: rec.data, batches, more, failed: null });
      while (live && !historyCovers({ batches, more }, from, tz)) {
        const last = batches.at(-1);
        if (!last) break;
        const page = await sequenceVerbs.history(id, last.at);
        if (!live) return;
        if (!page.ok) {
          more = false;
          break;
        }
        batches = [...batches, ...page.data.batches];
        more = page.data.more;
        setRead({ key, rec: rec.data, batches, more, failed: null });
      }
      if (live) setRead({ key, rec: rec.data, batches, more, failed: null });
    })();
    return () => {
      live = false;
    };
  }, [id, from, key]);
  return read && read.key === key ? read : null;
}

/** What one campaign's read draws: reading, failed (with its Retry), gone, or its fold. */
type OneState =
  | { state: "reading" }
  | { state: "failed"; retry: () => void }
  | { state: "gone" }
  | { state: "read"; vm: CampaignOneVM; counting: boolean };

/** What Reports asks of the Campaigns lens's scope: the picker's choices and its write, and one campaign's read where it names one. */
export interface CampaignsScopeHere {
  scope: CampaignScope;
  choices: ReturnType<typeof campaignChoicesOf>;
  onScope: (scope: CampaignScope) => void;
  /** One campaign's read; null for every campaign. */
  one: OneState | null;
  /** The frame's sentence for one campaign, once read; null for every campaign, which says the lens's own. */
  head: string | null;
}

/**
 * The scope the address says and what it draws: every campaign, or one sequence over the days shown. Narrowing replaces the
 * entry, as Ads' does: a scope is a setting of the page, and the days stay.
 */
export function useCampaignsScope(lens: LensId, at: ReportsParts, R: ReportsSurface | null): CampaignsScopeHere {
  const on = lens === "campaigns" && R !== null;
  const scope: CampaignScope = at.scope && at.scope.kind === "sequence" ? at.scope : CAMPAIGN_SCOPE_ALL;
  const id = on && scope.kind === "sequence" ? scope.id : null;
  const rows = useSequenceRows(on);
  const window = R ? reportWindowOf(R.range, R.vm.today) : null;
  const [again, retry] = useReducer((n: number) => n + 1, 0);
  const read = useOneRead(id, window?.from ?? "", again);
  const onScope = (next: CampaignScope) =>
    navigate(campaignReportRoute(at.days, next.kind === "all" ? CAMPAIGN_SCOPE_ALL : next), { replace: true });
  const choices = campaignChoicesOf(rows, scope);
  if (!id || !window) return { scope, choices, onScope, one: null, head: null };
  if (!read) return { scope, choices, onScope, one: { state: "reading" }, head: null };
  if (read.failed === "gone") return { scope, choices, onScope, one: { state: "gone" }, head: null };
  if (read.failed || !read.rec) return { scope, choices, onScope, one: { state: "failed", retry }, head: null };
  const rec = read.rec;
  const vm = campaignOneOf({
    id,
    name: rec.sequence.name,
    timezone: rec.timezone,
    steps: rec.steps.length,
    batches: read.batches,
    from: window.from,
    to: window.to,
    nowMs: Date.now(),
  });
  const counting = !historyCovers(read, window.from, rec.timezone);
  return { scope, choices, onScope, one: { state: "read", vm, counting }, head: vm.head };
}

/** Which campaign: every one, then each sequence that has sent, under how it starts. */
function CampaignScopePicker({ here }: { here: CampaignsScopeHere }) {
  const groups = cmGroups(
    here.choices.map((c) => ({ id: c.key, label: c.label, group: c.group })),
    CAMPAIGN_CHOICE_GROUPS,
  );
  const value = campaignScopeKey(here.scope);
  const face =
    here.choices.find((c) => c.key === value)?.label ?? (here.one?.state === "read" ? here.one.vm.name : W.all);
  return (
    <Picker
      label={W.label}
      value={value}
      onValueChange={(key) => {
        const next = campaignScopeOfKey(key);
        if (next) here.onScope(next);
      }}
      groups={groups}
      chevron={cmChevron()}
      face={face}
      data-testid="rpt-cmp-scope"
    />
  );
}

/** The days, sent: a column a day, what came back on its tip. */
function daysCard(vm: CampaignOneVM, className: string) {
  return (
    <ChartCard
      className={className}
      title={W.days.title}
      testid="rpt-cmp-days"
      config={RPT_SENT}
      table={{ columns: ["Day", "Sent", "Replied"], rows: vm.points.map((p) => [p.label, p.sent, p.replied]) }}
    >
      <BarChart
        data={vm.points}
        keys={["sent"]}
        config={RPT_SENT}
        height="fill"
        floor={150}
        yTicks={2}
        animKey={vm.points.length}
        ariaLabel={W.days.aria}
        tipNote={(d) => d.answeredWords}
        describe={(d) => d.sentWords}
      />
    </ChartCard>
  );
}

/** Each step's sends, the most first by its place: drawn where it has more than one step. */
function stepsCard(vm: CampaignOneVM, className: string) {
  const steps = vm.byStep;
  if (!steps) return null;
  return (
    <ChartCard
      className={className}
      title={W.byStep.title}
      takeaway={W.byStep.line}
      testid="rpt-cmp-steps"
      table={{
        columns: ["Step", "Sent", "Delivered", "Read", "Replied"],
        rows: steps.map((s) => [s.label, s.sent, s.delivered, s.read, s.replied]),
      }}
    >
      <BarList
        max={Math.max(...steps.map((s) => s.sent), 1)}
        rows={steps.map((s) => ({
          id: String(s.place),
          label: s.label,
          value: s.sent,
          display: `${s.sent} sent · ${s.replied} replied`,
          color: "var(--chart-1)",
        }))}
      />
    </ChartCard>
  );
}

/** Each send of the days, newest first, in History's own words; one still to decide opens where it waits. */
function sendsCard(vm: CampaignOneVM, sequenceId: string) {
  return (
    <ChartCard
      className="rpt-span-12"
      title={W.sends.title}
      takeaway={W.sends.line}
      testid="rpt-cmp-sends"
      switchable={false}
      table={{
        columns: [W.heads.when, W.heads.what, W.heads.sent],
        rows: vm.sends.map((s) => [s.when, s.said, s.end]),
      }}
    >
      <div className="ck-table-wrap rpt-sources">
        <table className="ck-table">
          <thead>
            <tr>
              <th>{W.heads.when}</th>
              <th>{W.heads.what}</th>
              <th className="num">{W.heads.sent}</th>
            </tr>
          </thead>
          <tbody>
            {vm.sends.map((s) => (
              <tr key={s.id} data-testid="rpt-cmp-send">
                <td>{s.when}</td>
                <td className="rpt-dim">{s.said}</td>
                <td className="num">
                  {s.went ? (
                    s.end
                  ) : (
                    <LinkButton size="inherit" className="rpt-src" {...routeDoor(runRoute(s.id, sequenceId))}>
                      {s.end}
                    </LinkButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

/** One campaign's cards over the days shown: its four figures, the days and its steps, and each send. */
function oneBody(vm: CampaignOneVM, counting: boolean, sequenceId: string) {
  if (vm.empty)
    return (
      <EmptyState
        kind="card"
        glyph="send"
        title={vm.empty.title}
        body={vm.empty.body}
        testid="rpt-cmp-empty"
        action={{ label: vm.door.label, to: vm.door.to }}
      />
    );
  // While pages further back are still being read the cards dim, by the one rule every page uses ([data-loading] [data-dims]).
  return (
    <div data-loading={counting ? "" : undefined}>
      <div data-dims aria-busy={counting || undefined}>
        <dl className="rpt-figures quad" data-testid="rpt-cmp-figures">
          {vm.figures.map((f) => (
            <Figure
              key={f.id}
              id={f.id}
              label={f.label}
              value={f.value}
              meta={f.meta}
              definition={f.definition}
              n={f.n}
              {...(f.minN === null ? {} : { minN: f.minN })}
              className="rpt-cell"
              data-testid={`rpt-cmp-figure-${f.id}`}
            />
          ))}
        </dl>
        <div className="rpt-grid">
          {daysCard(vm, vm.byStep ? "rpt-span-7" : "rpt-span-12")}
          {stepsCard(vm, "rpt-span-5")}
        </div>
        {vm.sends.length > 0 ? <div className="rpt-grid">{sendsCard(vm, sequenceId)}</div> : null}
      </div>
    </div>
  );
}

/** One campaign's state, drawn: reading, failed with its Retry, gone, or its cards. */
function oneState(here: CampaignsScopeHere) {
  const one = here.one;
  if (!one || here.scope.kind !== "sequence") return null;
  if (one.state === "reading")
    return (
      <div className="route-reading" role="status" aria-busy="true" data-testid="rpt-cmp-reading">
        {W.reading}
      </div>
    );
  if (one.state === "failed") return <FailedRead what={W.failed} onRetry={one.retry} testid="rpt-cmp-failed" />;
  if (one.state === "gone") return <EmptyState kind="card" glyph="send" title={W.gone} testid="rpt-cmp-gone" />;
  return oneBody(one.vm, one.counting, here.scope.id);
}

/** The scope's row over the lens: the picker, the days it covers, and one campaign's door to its own pages. */
export function CampaignScopeRow({ here, R }: { here: CampaignsScopeHere; R: ReportsSurface }) {
  const door = here.one?.state === "read" ? here.one.vm.door : null;
  return (
    <div className="rpt-cmp-scope">
      <CampaignScopePicker here={here} />
      <span className="rpt-cmp-pane" data-testid="rpt-cmp-pane">
        {R.vm.rangeLabel}
      </span>
      {door ? (
        <LinkButton className="rpt-cmp-door" {...routeDoor(door.to)} data-testid="rpt-cmp-open">
          {door.label} <Icon name="chevron" size={11} />
        </LinkButton>
      ) : null}
    </div>
  );
}

/** Reports › Campaigns narrowed to one sequence: the scope's row, then its cards. */
export function CampaignOneLens({ here, R }: { here: CampaignsScopeHere; R: ReportsSurface }) {
  return (
    <RptSection title="Campaigns" bare testid="rpt-cmp-one">
      <CampaignScopeRow here={here} R={R} />
      {oneState(here)}
    </RptSection>
  );
}
