/**
 * The pieces of the Reports page (moved from legacy/pages/reports.jsx and reports-sections.jsx, decision 0015): a
 * section under its title, a number with what it is and one line of what it holds, the headline meter, Worth knowing,
 * the strip of counts, Asked-then-booked, and the table of sources.
 *
 * Every sentence beside a number is the view model's (vm.lines, cm.lines, the booking's words, the facts): these
 * say each number once and compose no claim about the numbers of their own.
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { BookingReportVM, CampaignSourceVM, ReportFactVM, ReportTileVM, ReportVM } from "@chanlytics/contracts";
import { listRoute, navigate } from "../legacy-verbs";
import { titleOf } from "../campaigns/templates/verbs";
import { EmptyState, FailedRead } from "../kit/empty/empty";
import { Icon } from "../kit/icon/icon";
import { LinkButton } from "../kit/link-button/link-button";
import { RadialChart } from "../kit/charts/radial";
import { rptPlural } from "./series";

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

/**
 * A number, what it is, and one line of what it holds. It also drew a seven-point sparkline beside a number the chart
 * below plots properly, and a delta that claimed percentages on counts of two -- "+100% vs prior 7 days" is 2 to 4,
 * and "-100%" is a zero. The view model still carries both: Ask reads the change. Today draws its week with this tile,
 * and so do Google's tiles; the Reports strip itself is RptTiles.
 */
export function RpTile({ t }: { t: { id: string; label: string; value: ReactNode; meta: string } }) {
  return (
    <div className="rp2-tile" data-tile={t.id}>
      <div className="rp2-tile-label" title={t.label}>
        {t.label}
      </div>
      <div className="rp2-tile-value">{t.value}</div>
      <div className="rp2-tile-meta" title={t.meta}>
        {t.meta}
      </div>
    </div>
  );
}

const phoneQuery = () => (typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 760px)") : null);

/** A phone's page draws the meters smaller; kept current as the window changes size. */
export function useRptPhone(): boolean {
  const [phone, setPhone] = useState(!!phoneQuery()?.matches);
  useEffect(() => {
    const q = phoneQuery();
    if (!q || !q.addEventListener) return undefined;
    const on = (e: MediaQueryListEvent) => setPhone(e.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return phone;
}

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

/** One fact: its icon and words, and a door when it has one, the whole row one button. */
function factRow(f: ReportFactVM) {
  const said = f.sub ? `${f.text}, ${f.sub}` : f.text;
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
        <button type="button" className="rpt-fact-row" title={said} onClick={() => navigate(door.to)}>
          {body}
        </button>
      ) : (
        <div className="rpt-fact-row" title={said}>
          {body}
        </div>
      )}
    </li>
  );
}

// Worth knowing: what the bridge's reportFacts() found, in its order, one line each. A fact with a door is one
// button, the whole row its target; the full sentence rides in its title for a line cut short.
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

/** What the strip draws of a tile: its words, and the period before beside it. */
type StripTile = Pick<ReportTileVM, "id" | "label" | "value" | "meta" | "compare">;

/** Booked, from the calendar: a count where one was read, and why there is none where not. */
function bookedTile(booking: BookingReportVM | null): StripTile {
  if (booking && booking.present)
    return {
      id: "booked",
      label: "Booked",
      value: String(booking.booked),
      meta: booking.asked ? `of ${booking.asked} who asked` : "nobody asked",
      compare: null,
    };
  return {
    id: "booked",
    label: "Booked",
    value: "—",
    meta: booking && booking.calendar === "unavailable" ? "the calendar could not be read" : "no calendar to read",
    compare: null,
  };
}

// The strip: three of the receptionist's counts, the one conversion and the handovers, each with the period before
// in counts beside its value. The answered share and the reply time are the hero's.
export function RptTiles({ vm, booking }: { vm: ReportVM; booking: BookingReportVM | null }) {
  const by = Object.fromEntries(vm.tiles.map((t) => [t.id, t]));
  const tiles = [by.messages, by.calls, by.people, bookedTile(booking), by.needed].filter((t): t is StripTile => !!t);
  return (
    <dl className="rpt-tiles" data-testid="reports-tiles">
      {tiles.map((t) => (
        <div className="rpt-tile" key={t.id} data-tile={t.id}>
          <dt className="rpt-tile-label">{t.label}</dt>
          <dd className="rpt-tile-value">
            {t.value}
            {t.compare && <span className="rpt-tile-compare">{t.compare}</span>}
          </dd>
          <dd className="rpt-tile-meta" title={t.meta}>
            {t.meta}
          </dd>
        </div>
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
          <LinkButton
            title="People's own list of who wrote or called this month and has never been on the calendar"
            onClick={() => navigate(listRoute("asked_never_booked"))}
            data-testid="booked-rest-door"
          >
            Asked, never booked
          </LinkButton>
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
        <button
          type="button"
          className="rpt-src"
          onClick={() => navigate(s.kind === "broadcast" ? `broadcasts/run:${s.id}` : `outbound/${s.id}`)}
          data-testid="source-open"
        >
          {s.name}
        </button>
        <span className="rpt-src-meta">
          {s.kindLabel}
          {s.kind === "playbook" ? ` · ${rptPlural(s.runs, "run")}` : ""}
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
