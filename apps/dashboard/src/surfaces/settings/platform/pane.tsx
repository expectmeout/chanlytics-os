/**
 * The back office (moved from legacy/pages/platform.jsx, decision 0015 step 11): every workspace, and what is up with
 * each one. Settings' page draws it by its old name, `PanePlatform`, which seed-globals publishes (settings/globals.ts).
 *
 * The only surface in this product that deliberately crosses tenant boundaries. The LIST is read-only; the line rows on
 * an opened workspace are not -- gate 6 put Retry, Refile and Release here, each one arming before it confirms, each one
 * recorded against the person who pressed it before it runs.
 *
 * It decides nothing. The verdict, the sorting, the sentence and the four facts all come from contracts/platform.ts
 * through the bridge's verbs (`backOffice.verbs`, legacy-bridge/platform.ts), and the detail pane runs setupSteps -- the
 * customer's OWN view model -- so support and the person on the phone are looking at the same rows rather than two
 * renderings that can disagree. The rows use the attention grammar People, Today and Setup share, because a row that
 * needs somebody looks the same wherever it appears.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PageVitalsRowDto,
  PlatformHealth,
  PlatformQueue,
  PlatformRowVM,
  PlatformTenantDto,
} from "@chanlytics/contracts";
import { backOffice, type PlatformApi, type PlatformTenantDetail } from "@/legacy-bridge/platform";
import { AttnRow } from "../../kit/attention/attn-row";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { useLegacyToast, type LegacyFlash } from "../../legacy-verbs";
import { PlatformHealthCard, PlatformQueueCard, PlatformWorkCards } from "./cards";
import { PlatformDetail } from "./detail";
import { PartnerLine, PartnerStandingRow } from "./partners";

type Flash = (f: LegacyFlash) => void;
type Overview = Awaited<ReturnType<PlatformApi["list"]>>;
type Partners = Overview["partners"];

const PLATFORM_GLYPH: Partial<Record<string, string>> = {
  broken: "alert",
  billing: "money",
  rehearsal: "flag",
  stalled: "clock",
  waiting_owner: "user",
  quiet: "wave",
  new: "sparkle",
  live: "check",
  paused: "pause",
  test: "bolt",
};

/**
 * The partners (0012, P5): what each is owed, and the workspaces the nightly check held for a person. The card is one
 * line when there are none. Both actions send nothing and ask for a reason or a reference; each is recorded against you.
 */
function PlatformPartnersCard({
  P,
  partners,
  rows,
  onDone,
  flash,
}: {
  P: PlatformApi;
  partners: NonNullable<Partners>;
  rows: PlatformRowVM[];
  onDone: () => void;
  flash: Flash;
}) {
  const nameOf = new Map(rows.map((r) => [r.tenantId, r.name]));
  const partnerRows = P.partnerRows(partners.balances);
  const toDecide = partners.workspaces.filter((w) => w.standing !== "qualified");
  return (
    <section className="fl-card set-card" data-testid="platform-partners">
      <div className="fl-card-head">
        <h2 className="fl-card-title">Partners</h2>
        <span className="fl-card-sub set-says" data-testid="platform-partners-words">
          {P.partnerSummary(partners.balances)}
        </span>
      </div>
      {partnerRows.length > 0 && (
        <div className="cl-attn-list" data-testid="platform-partner-rows">
          {partnerRows.map((row) => (
            <PartnerLine
              key={`${row.partnerId}-${row.currency || "none"}`}
              row={row}
              P={P}
              onDone={onDone}
              flash={flash}
            />
          ))}
        </div>
      )}
      {toDecide.length > 0 && (
        <>
          <div className="set-row">
            <div className="set-row-info">
              <span className="set-row-hint">
                Workspaces a partner brought that are not qualified: under review first.
              </span>
            </div>
          </div>
          <div className="cl-attn-list" data-testid="platform-standing-rows">
            {toDecide.map((w) => (
              <PartnerStandingRow
                key={w.tenant_id}
                ws={w}
                name={nameOf.get(w.tenant_id)}
                P={P}
                onDone={onDone}
                flash={flash}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** Every workspace, sorted by who needs a person, found by name, each one opened in place. */
function PlatformOverviewCard({
  P,
  rows,
  partners,
  problem,
  busy,
  load,
  find,
  setFind,
  openId,
  setOpenId,
}: {
  P: PlatformApi;
  rows: PlatformRowVM[];
  partners: Partners;
  problem: string | null;
  busy: boolean;
  load: () => Promise<void>;
  find: string;
  setFind: (v: string) => void;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const summary = P.summary(rows);
  const q = find.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.includes(q)) : rows;
  // Who brought each workspace (0012, P5): the column on its row.
  const broughtBy = new Map((partners ? partners.workspaces : []).map((w) => [w.tenant_id, w]));
  return (
    <section className="fl-card set-card" data-testid="platform-overview">
      <div className="fl-card-head">
        <h2 className="fl-card-title">Every workspace</h2>
        <span className="fl-card-sub set-says" data-testid="platform-summary">
          {summary.sentence}
        </span>
        <button className="cl-bucket-link" onClick={() => void load()} disabled={busy} data-testid="platform-refresh">
          {busy ? "Reading…" : "Read again"}
        </button>
      </div>
      {problem && (
        <FailedRead
          kind="line"
          what="every workspace"
          why={problem}
          body="The workspaces themselves are unaffected."
          onRetry={() => void load()}
          busy={busy}
          testid="platform-failed"
        />
      )}
      <div className="set-row pf-find-row">
        <div className="set-row-info">
          <span className="set-row-hint">Sorted by who needs a person, not by name: work down the page.</span>
        </div>
        <input
          className="biz-input pf-find"
          value={find}
          placeholder="Find a workspace"
          onChange={(e) => setFind(e.target.value)}
          data-testid="platform-find"
        />
      </div>
      <p className="pf-warn">
        <Icon name="shield" size={11} />
        This list changes nothing; open a workspace and its lines can be retried, resent to the carriers, or handed back
        — each one asks twice, and each is recorded against you.
      </p>
      <div className="cl-attn-list" data-testid="platform-rows">
        {shown.length === 0 && (q || !problem) && (
          <div className="set-row">
            <div className="set-row-info">
              <span className="set-row-hint">{q ? `Nothing matches “${find}”.` : "No workspaces yet."}</span>
            </div>
          </div>
        )}
        {shown.map((r) => {
          const v = P.verdicts[r.verdict];
          const by = broughtBy.get(r.tenantId);
          return (
            <AttnRow
              key={r.tenantId}
              glyph={PLATFORM_GLYPH[r.verdict] || "dot"}
              name={r.name}
              meta={[r.slug, `${r.members} in it`, r.age, by ? P.partnerStanding(by).by : null]
                .filter(Boolean)
                .join(" · ")}
              sentence={r.sentence}
              status={[v.label]}
              note={[r.facts.paying, r.facts.answering, `texting ${r.facts.texting}`, `heard ${r.facts.heard}`].join(
                " · ",
              )}
              tone={v.tone}
              cta={{
                label: openId === r.tenantId ? "Close" : "Open",
                kind: "ghost",
                onClick: () => setOpenId(openId === r.tenantId ? null : r.tenantId),
              }}
              onOpen={() => setOpenId(openId === r.tenantId ? null : r.tenantId)}
              onHover={() => P.warmOne && P.warmOne(r.tenantId)}
              testid={`platform-row-${r.slug}`}
              ctaTestid={`platform-open-${r.slug}`}
            />
          );
        })}
      </div>
    </section>
  );
}

/** A frame that says one thing while the opened workspace reads. */
const Reading = ({ words }: { words: string }) => (
  <section className="fl-card set-card">
    <div className="set-row">
      <div className="set-row-info">
        <span className="set-row-hint">{words}</span>
      </div>
    </div>
  </section>
);

export function PanePlatform() {
  const P = useMemo(() => backOffice.verbs, []);
  const [toastNode, flash] = useLegacyToast();
  // The list this tab already holds, painted at once; `load` reads again behind it.
  const held = P.peekList ? P.peekList() : null;
  const [tenants, setTenants] = useState<PlatformTenantDto[] | null>(held && held.ok ? held.tenants : null);
  const [health, setHealth] = useState<PlatformHealth | null>(held && held.ok ? held.health : null);
  const [queue, setQueue] = useState<PlatformQueue | null>(held && held.ok ? held.queue : null);
  const [partners, setPartners] = useState<Partners>(held && held.ok ? held.partners : null);
  const [vitals, setVitals] = useState<PageVitalsRowDto[] | null | undefined>(held && held.ok ? held.vitals : null);
  const [problem, setProblem] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlatformTenantDetail | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  // Why the open workspace could not be read: its own state, beside the list's. A failed read of one workspace left
  // "Reading that workspace…" on screen for good and put its reason on the list (S10).
  const [detailProblem, setDetailProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    // A read that throws is a failed read like any other, not a page left reading for ever.
    const r = await Promise.resolve()
      .then(() => P.list())
      .catch((): Overview => ({ ok: false, tenants: [], health: null, queue: null, partners: null, message: "" }));
    setBusy(false);
    if (!r.ok) {
      setProblem(r.message || "Could not be read right now.");
      setTenants([]);
      setHealth(null);
      setQueue(null);
      setPartners(null);
      setVitals(null);
      return;
    }
    setProblem(null);
    setTenants(r.tenants);
    setHealth(r.health);
    setQueue(r.queue);
    setPartners(r.partners);
    setVitals(r.vitals);
  }, [P]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      setDetailProblem(null);
      return undefined;
    }
    let on = true;
    // A row whose Open the pointer rested on is already read: it opens with no "Reading that workspace..." frame at all.
    const ready = P.peekOne ? P.peekOne(openId) : null;
    setDetail(ready && ready.ok ? ready.detail : null);
    setDetailProblem(null);
    Promise.resolve()
      .then(() => P.one(openId))
      .then(
        (r) => {
          if (!on) return;
          if (r.ok && r.detail) setDetail(r.detail);
          else setDetailProblem(r.message || "Could not be read right now.");
        },
        () => {
          if (on) setDetailProblem("Could not be read right now.");
        },
      );
    return () => {
      on = false;
    };
  }, [P, openId, reload]);

  if (tenants === null) return <Reading words="Reading every workspace…" />;

  const rows = P.rows(tenants);
  const waiting = queue ? P.queue(queue) : null;

  return (
    <>
      <PlatformHealthCard P={P} health={health} />
      <PlatformWorkCards P={P} vitals={vitals} problem={problem} />
      {/* Who is knocking. These people have no workspace, so this is the only surface in the product they appear on at
          all -- which is how a table with a writer and no reader went unnoticed long enough for the writer to be broken
          too. The card is one line when nobody is waiting, so it costs nothing to have above the workspaces, and the
          workspaces are still the work. */}
      {waiting && <PlatformQueueCard waiting={waiting} P={P} onDone={() => void load()} flash={flash} />}
      {partners && (
        <PlatformPartnersCard P={P} partners={partners} rows={rows} onDone={() => void load()} flash={flash} />
      )}
      <PlatformOverviewCard
        P={P}
        rows={rows}
        partners={partners}
        problem={problem}
        busy={busy}
        load={load}
        find={find}
        setFind={setFind}
        openId={openId}
        setOpenId={setOpenId}
      />

      {openId && !detail && !detailProblem && <Reading words="Reading that workspace…" />}
      {openId && !detail && detailProblem && (
        <section className="fl-card set-card">
          <FailedRead
            kind="card"
            what="that workspace"
            why={detailProblem}
            body="The list above is current."
            onRetry={() => setReload((n) => n + 1)}
            testid="platform-detail-failed"
          />
        </section>
      )}
      {openId && detail && (
        <PlatformDetail
          detail={detail}
          onClose={() => setOpenId(null)}
          // An action changes the line it was taken on, so both reads are stale the moment it lands: the list's verdict
          // and the detail's own rows.
          onChanged={() => {
            setDetail(null);
            void load();
            setReload((n) => n + 1);
          }}
          flash={flash}
        />
      )}
      {toastNode}
    </>
  );
}
