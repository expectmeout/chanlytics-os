/**
 * The pieces of the Reports page: a section under its title, the headline meter, Worth knowing, the strip of counts,
 * Asked-then-booked, and the table of sources.
 *
 * Every sentence beside a number is the view model's (vm.lines, cm.lines, the booking's words, the facts): these
 * say each number once and compose no claim about the numbers of their own.
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  bookedTileOf,
  metricWordsOf,
  plural,
  type BookingReportVM,
  type CampaignSourceVM,
  type ReportFactVM,
  type ReportStripTile,
  type ReportVM,
} from "@chanlytics/contracts";
import { listRoute, routeDoor } from "../legacy-verbs";
import { titleOf } from "../campaigns/templates/verbs";
import { EmptyState, FailedRead } from "../kit/empty/empty";
import { Figure } from "../kit/figure/figure";
import { Icon } from "../kit/icon/icon";
import { LinkButton } from "../kit/link-button/link-button";
import { RadialChart } from "../kit/charts/radial";
import { Tooltip } from "../kit/tooltip/tooltip";

/** A section of the page under its title, with a line of what it holds beside it where it has one. */
export function RptSection({
  title,
  meta = null,
  testid = null,
  children,
}: {
  title: string;
  meta?: string | null;
  testid?: string | null;
  children?: ReactNode;
}) {
  return (
    <section className="rpt-section" aria-label={title} data-testid={testid || undefined}>
      <header className="rpt-section-head">
        <h2 className="rpt-section-title">{title}</h2>
        {meta && <span className="rpt-section-meta">{meta}</span>}
      </header>
      {children}
    </section>
  );
}

/** The page's own phone, under which it draws the meters smaller; and the frame's, under which the strip has no act beside it. */
const RPT_PHONE_QUERY = "(max-width: 760px)";
const FRAME_PHONE_QUERY = "(max-width: 900px)";

const widthQuery = (query: string) => (typeof window.matchMedia === "function" ? window.matchMedia(query) : null);

/** Whether the window answers a width query, kept current as the window changes size. */
function useWidthMatches(query: string): boolean {
  const [matches, setMatches] = useState(!!widthQuery(query)?.matches);
  useEffect(() => {
    const q = widthQuery(query);
    if (!q || !q.addEventListener) return undefined;
    const on = (e: MediaQueryListEvent) => setMatches(e.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, [query]);
  return matches;
}

/** A phone's page draws the meters smaller; kept current as the window changes size. */
export const useRptPhone = (): boolean => useWidthMatches(RPT_PHONE_QUERY);

/**
 * A desk's frame, over the kit's one breakpoint: the strip of lenses has the page's act at its right (components.css, the
 * head's places), where the period stands. Under it the strip is a phone's, and the period keeps a row of its own.
 */
export const useRptDesk = (): boolean => !useWidthMatches(FRAME_PHONE_QUERY);

/** The headline: the receptionist's part of the answered as a meter, the period before as a tick on its ring. */
export function RptHero({ vm, phone }: { vm: ReportVM; phone: boolean }) {
  const a = vm.answered;
  const pct = a.share == null ? null : Math.round(a.share * 100);
  return (
    <section className="ck-card rpt-hero" data-testid="reports-hero">
      <RadialChart
        value={a.share || 0}
        marker={a.priorShare}
        size={phone ? 96 : 112}
        thickness={10}
        ariaLabel={
          pct == null ? "Nothing to answer in this period" : `The receptionist answered ${pct}% of customer messages`
        }
      >
        {pct != null && <span className="rpt-hero-number">{pct}%</span>}
      </RadialChart>
      <div className="rpt-hero-copy">
        <p className="rpt-hero-lead">answered by your receptionist</p>
        <p className="rpt-hero-line">{vm.lines.hero}</p>
        {vm.lines.heroBefore && (
          <p className="rpt-hero-compare">
            <i className="rpt-tick" aria-hidden="true" />
            {vm.lines.heroBefore}
          </p>
        )}
      </div>
    </section>
  );
}

/** One fact: its icon and words, and a door when it has one, the whole row one link. */
function factRow(f: ReportFactVM) {
  const door = f.door;
  const body = (
    <>
      <span className="mark rpt-fact-icon" aria-hidden="true">
        <Icon name={f.icon} size={13} />
      </span>
      <span className="rpt-fact-copy">
        <span className="rpt-fact-text">{f.text}</span>
        {f.sub && <span className="rpt-fact-sub">{f.sub}</span>}
      </span>
      {door && (
        <span className="rpt-fact-door">
          {door.label}
          <Icon name="arrow-right" size={12} />
        </span>
      )}
    </>
  );
  return (
    <li key={f.id} className={`rpt-fact${f.tone ? ` is-${f.tone}` : ""}`} data-fact={f.id}>
      {door ? (
        <LinkButton className="rpt-fact-row" {...routeDoor(door.to)}>
          {body}
        </LinkButton>
      ) : (
        <div className="rpt-fact-row">{body}</div>
      )}
    </li>
  );
}

// Worth knowing: what the bridge's reportFacts() found, in its order, one line each. A fact with a door is one
// link, the whole row its target; the sentence wraps rather than being cut short, so its words are all on the page.
export function RptFacts({ facts }: { facts: ReportFactVM[] }) {
  return (
    <section className="ck-card rpt-facts" data-testid="reports-facts">
      <h2 className="ck-card-title rpt-facts-title">Worth knowing</h2>
      {facts.length ? (
        <ul className="rpt-fact-list">{facts.map(factRow)}</ul>
      ) : (
        <p className="rpt-fact-quiet">A quiet period. Nothing stood out.</p>
      )}
    </section>
  );
}

/**
 * A tile as the kit's figure: its value, the period before in counts beside it, its line under it, and over its label the
 * words for what it counts (contracts metricWordsOf), named by its metric. Every strip of the page draws its tiles with it,
 * so a figure says the same on every lens; the grid, the dividers and the padding are the page's.
 */
export function RptFigure({ t }: { t: ReportStripTile }) {
  return (
    <Figure
      className="rpt-cell"
      id={t.metric}
      label={t.label}
      value={t.value}
      change={t.compare}
      meta={t.meta}
      definition={metricWordsOf(t.metric)}
    />
  );
}

// The strip: three of the receptionist's counts, the one conversion and the handovers, each the kit's figure with the period
// before in counts beside its value. The answered share and the reply time are the hero's. Each figure is named by its tile's
// metric (contracts report-tiles.ts); the grid, the dividers and the padding are the page's.
export function RptTiles({ vm, booking }: { vm: ReportVM; booking: BookingReportVM | null }) {
  const by = Object.fromEntries(vm.tiles.map((t) => [t.id, t]));
  const tiles = [by.messages, by.calls, by.people, bookedTileOf(booking), by.needed].filter(
    (t): t is ReportStripTile => !!t,
  );
  return (
    <dl className="rpt-figures" data-testid="reports-tiles">
      {tiles.map((t) => (
        <RptFigure key={t.id} t={t} />
      ))}
    </dl>
  );
}

/** Who asked and still has no time on the calendar: the share's other side, and the door to People's own list of them. */
function bookedRest(bk: BookingReportVM) {
  return (
    <p className={`rpt-booked-rest${bk.unbooked ? "" : " is-done"}`} data-testid="booked-rest">
      <Icon name={bk.unbooked ? "calendar" : "check"} size={13} />
      <span>
        {bk.rest}
        {/* People already keeps a list of its own for these people, so the door is that list and not the page of
            everyone: listRoute lands on it, or on People itself where the lists have not loaded. The door wears
            the list's name rather than "See them", because the list counts its own month and this card counts the
            period above: the same people, near enough to go and look, not the same set to the person. */}
        {bk.unbooked > 0 && (
          <Tooltip tip="People's own list of who wrote or called this month and has never been on the calendar">
            <LinkButton {...routeDoor(listRoute("asked_never_booked"))} data-testid="booked-rest-door">
              Asked, never booked
            </LinkButton>
          </Tooltip>
        )}
      </span>
    </p>
  );
}

// Asked, then booked: the share as a meter, beside the booking view model's own words for what it is of (the count
// is the tile's), and under a hairline the same share's other side -- who asked and still has no time on the
// calendar, which is the half an owner can act on. Both sentences are the view model's (`words`, `rest`). No
// calendar: its sentence and the door to Settings. A calendar that could not be read is a failed read, not a missing
// calendar. Nobody asked: its words.
export function RptBooked({ bk, phone }: { bk: BookingReportVM | null; phone: boolean }) {
  if (!bk || bk.calendar === "none") {
    return (
      <EmptyState
        kind="line"
        title={bk ? bk.sub : "Connect your calendar under Settings › Business to see who booked."}
        action={{ label: "Open Settings", to: "admin/workspace" }}
      />
    );
  }
  if (bk.calendar === "unavailable") return <FailedRead kind="line" what="your calendar" surface="reports" />;
  if (bk.pct == null) return <EmptyState kind="line" title={bk.headline} body={bk.sub} />;
  return (
    <div className="rpt-booked">
      <div className="rpt-booked-share">
        <RadialChart value={bk.pct / 100} size={phone ? 96 : 112} thickness={10} ariaLabel={`${bk.pct}% ${bk.words}`}>
          <span className="rpt-booked-number">{bk.pct}%</span>
        </RadialChart>
        <p className="rpt-booked-copy">{bk.words}.</p>
      </div>
      {bk.rest && bookedRest(bk)}
    </div>
  );
}

/** One source: its name a door to the playbook or the broadcast, what it is beside it, and its counts. */
function sourceRow(s: CampaignSourceVM) {
  const title = s.templateName ? titleOf(s.templateName) : s.template;
  return (
    <tr key={s.id} data-testid="source-row">
      <td>
        <LinkButton
          className="rpt-src"
          {...routeDoor(s.kind === "broadcast" ? `broadcasts/run:${s.id}` : `outbound/${s.id}`)}
          data-testid="source-open"
        >
          {s.name}
        </LinkButton>
        <span className="rpt-src-meta">
          {s.kindLabel}
          {s.kind === "playbook" ? ` · ${plural(s.runs, "run")}` : ""}
          {title ? ` · ${title}` : ""}
        </span>
      </td>
      <td className="num">{s.sent}</td>
      <td className="num">{s.deliveredPct == null ? "—" : `${s.deliveredPct}%`}</td>
      <td className="num">
        {s.repliedPct == null ? "—" : `${s.repliedPct}%`} <span className="rpt-dim">({s.replied})</span>
      </td>
      <td className="num rpt-dim">{s.lastLabel}</td>
    </tr>
  );
}

// The period's sources: a playbook's runs together, a broadcast alone; shares are of each one's own sent. The name is
// the row's door, to the playbook's card or the broadcast's own page.
export function RptSources({ rows }: { rows: CampaignSourceVM[] }) {
  if (!rows.length)
    return <EmptyState kind="line" title="No broadcast or playbook run reached anyone in this period." />;
  return (
    <div className="ck-table-wrap rpt-sources">
      <table className="ck-table">
        <thead>
          <tr>
            <th>Source</th>
            <th className="num">Sent</th>
            <th className="num">Delivered</th>
            <th className="num">Wrote back</th>
            <th className="num">Last</th>
          </tr>
        </thead>
        <tbody>{rows.map(sourceRow)}</tbody>
      </table>
    </div>
  );
}
