/* global React, Icon, StatStrip, StatCell, STORE_DATA */
// Chanlytics — Agent Store
// Two-sided marketplace: first-party agents by Chanlytics plus community
// agents connected via A2A by outside publishers. Install = a visible
// handshake; every install writes through to the Fleet (AS_STORE).
// Protocol names stay off consumer copy — capability badges speak English.

const { useState: useStoreState, useMemo: useStoreMemo, useEffect: useStoreEffect } = React;

const ST_CHANNEL_ICON = { phone: "phone", sms: "chat", mail: "mail", instagram: "instagram", chat: "chat" };
const ST_AUT_LABEL = { ask: "Ask me first", earn: "Earn autonomy", auto: "Full auto" };
const stFleetOf = (id) => (((window.FLEET_DATA || {}).FLEET_ROSTER) || []).find(a => a.id === id);
const stFresh = (f) => !f.today || (f.today.convos === 0 && f.today.revenue === 0);

const Stars = ({ n }) => (
  <span className="st-stars" aria-label={`${n} out of 5 stars`}>
    {"★★★★★".slice(0, Math.round(n))}{"☆☆☆☆☆".slice(0, 5 - Math.round(n))}
  </span>
);

const AbilityChips = ({ abilities, max = 4 }) => {
  const items = [
    ...abilities.channels.map((c) => ({ icon: ST_CHANNEL_ICON[c] || "chat", label: null, key: `ch-${c}` })),
    ...abilities.skills.map((s) => ({ icon: null, label: s, key: `sk-${s}` })),
  ];
  const shown = items.slice(0, max + abilities.channels.length);
  return (
    <div className="st-chips">
      {shown.map((it) => (
        <span key={it.key} className={`st-chip ${it.label ? "" : "st-chip-ch"}`}>
          {it.icon && <Icon name={it.icon} size={11} />}
          {it.label}
        </span>
      ))}
    </div>
  );
};

const CAP_TIPS = {
  streams: "You can watch its work happen live, message by message",
  interrupts: "Pauses and asks you before committing anything",
  state: "Keeps context between sessions — no re-explaining",
  handoff: "Hands unmapped work to you cleanly — nothing gets dropped",
  push: "Sends updates into your workspace the moment they happen",
};
const CapBadges = ({ caps, max = 4 }) => {
  const { CAP_META } = window.STORE_DATA;
  return (
    <div className="st-caps">
      {caps.slice(0, max).map((c) => (
        <span key={c} className="st-cap" data-tip={CAP_TIPS[c]}>{CAP_META[c] || c}</span>
      ))}
    </div>
  );
};

const Provenance = ({ t, onPub }) => (
  <div className="st-prov">
    {onPub ? (
      <span className="st-prov-pub" role="button" tabIndex={0} title={`About ${t.publisher}`}
        onClick={(e) => { e.stopPropagation(); onPub(t.publisher); }}>by {t.publisher}</span>
    ) : (
      <span>by {t.publisher}</span>
    )}
    {t.verified && <span className="st-prov-check" data-tip="Verified publisher — identity and claims checked in review"><Icon name="check" size={10} /></span>}
    {t.external && <span className="st-ext-tag">External · via A2A</span>}
  </div>
);
// ---------- Publisher profile ----------
const pubInstalls = (s) => { const m = /([\d.]+)\s*(k?)/.exec(s || ""); return m ? Math.round(parseFloat(m[1]) * (m[2] ? 1000 : 1)) : 0; };

const PublisherModal = ({ name, onClose, onOpenAgent }) => {
  const { STORE_TEMPLATES, STORE_PUBLISHERS } = window.STORE_DATA;
  const p = STORE_PUBLISHERS[name];
  if (!p) return null;
  const agents = STORE_TEMPLATES.filter(t => t.publisher === name);
  const totalInstalls = agents.reduce((n, t) => n + pubInstalls(t.installs), 0);
  return (
    <div className="ask-overlay" onClick={onClose}>
      <div className="ask-modal st-modal" onClick={(e) => e.stopPropagation()}>
        <header className="st-modal-head">
          <span className="st-tile lg">{name[0]}</span>
          <div className="st-card-titles">
            <span className="st-modal-name">{name}</span>
            <div className="st-prov">
              <span>{p.firstParty ? "First-party publisher" : `Community publisher · since ${p.since}`}</span>
              {p.verified ? <span className="st-prov-check" data-tip="Verified publisher — identity and claims checked in review"><Icon name="check" size={10} /></span> : <span className="st-ext-tag">new publisher</span>}
            </div>
          </div>
          <span className="st-price lg"><span className="tabular">{totalInstalls.toLocaleString()}</span> installs</span>
        </header>

        <section className="st-modal-section">
          <div className="st-card-role" style={{ marginBottom: 8 }}>{p.tagline}</div>
          {p.verifiedLine ? (
            <div className="sd-verified"><Icon name="check" size={11} /> {p.verifiedLine}</div>
          ) : (
            <div className="st-floor" style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}>
              <Icon name="shield" size={12} />
              <span>No verification review yet. Their agents still ship ask-first, your guardrails bind them, and the kill switch stays in Fleet.</span>
            </div>
          )}
        </section>

        <section className="st-modal-section">
          <div className="st-modal-label">Agents in this store</div>
          {agents.map(t => (
            <button key={t.id} className="st-listing st-pub-agent" onClick={() => onOpenAgent(t.id)}>
              <span className="st-tile">{t.glyph}</span>
              <div className="st-listing-main">
                <span className="st-listing-name">{t.name}</span>
                <span className="st-listing-role">{t.role}</span>
              </div>
              <div className="st-listing-meta">
                <span className="st-listing-installs">{t.installs}</span>
                {t.rating && <span className="st-listing-installs">★ {t.rating.avg} · {t.rating.count}</span>}
                <span className="st-listing-installs tabular">{t.price} cr/mo</span>
              </div>
              <Icon name="arrow-right" size={12} />
            </button>
          ))}
        </section>

        <section className="st-modal-section">
          <div className="st-modal-label">Track record & trust</div>
          <div className="st-conn">
            <div className="st-conn-row"><span className="st-conn-key">Reliability</span><span className="st-conn-val">{p.sla}</span></div>
            <div className="st-conn-row"><span className="st-conn-key">Runs in</span><span className="st-conn-val">{p.region}</span></div>
            <div className="st-conn-row"><span className="st-conn-key">Support</span><span className="st-conn-val">{p.support}</span></div>
            <div className="st-conn-row"><span className="st-conn-key">Business model</span><span className="st-conn-val">{p.revshare}</span></div>
          </div>
        </section>

        <footer className="st-modal-foot">
          <button className="btn btn-ghost btn-sm" onClick={() => window.askAbout({
            title: "About " + name,
            prompt: "Should I trust agents from " + name + "?",
            answer: p.firstParty
              ? "They're the platform's own agents — they run inside your workspace and never ship data out. The autonomy contract is still yours to set per agent."
              : `${name} has ${totalInstalls.toLocaleString()} installs across ${agents.length} agent${agents.length === 1 ? "" : "s"}${p.verified ? " and passed the verification review (identity + endpoint security)" : " but hasn't been through verification review yet — weigh that"}. Either way: their agents ship ask-first, your guardrails override theirs, and disconnecting revokes their token instantly.`,
            links: [{ label: "Open Fleet", to: "fleet" }],
          })}>
            <Icon name="sparkle" size={12} /> Ask about this publisher
          </button>
          <div className="st-modal-foot-actions">
            <button className="btn btn-sm" onClick={onClose}>Close</button>
          </div>
        </footer>
      </div>
    </div>
  );
};

// ---------- Store card ----------
const StoreCard = ({ t, installed, onOpen, onPub }) => (
  <button className={`st-card ${installed ? "is-installed" : ""}`} onClick={() => onOpen(t.id)}>
    <div className="st-card-head">
      <span className={`st-tile ${installed ? "installed" : ""}`}>{t.glyph}</span>
      <div className="st-card-titles">
        <span className="st-card-name">
          {t.name}
          {t.recommended && !installed && <span className="st-reco-dot" data-tip="Recommended — covers a gap your current fleet doesn\u2019t" />}
        </span>
        <span className="st-card-role">{t.role}</span>
      </div>
    </div>

    <Provenance t={t} onPub={onPub} />
    <AbilityChips abilities={t.abilities} />
    <CapBadges caps={t.caps} max={3} />

    {(() => {
      // Installed agents show YOUR numbers, not marketplace proof
      const f = installed ? stFleetOf(t.id) : null;
      const line = f
        ? (stFresh(f) ? "Provisioning — first numbers land after its first task"
          : `Yours today: ${f.today.revenue ? "$" + f.today.revenue.toLocaleString() + " · " : ""}${f.today.convos} convos · ${f.today.bookings} booked`)
        : t.proof;
      return (
        <div className="st-card-proof">
          <Icon name="trending-up" size={11} />
          <span style={{ flex: 1, minWidth: 0 }}>{line}</span>
          {!installed && t.rating && <span className="st-rate">★ {t.rating.avg} · <span className="tabular">{t.rating.count}</span></span>}
        </div>
      );
    })()}

    <div className="st-card-foot">
      {installed ? (
        <>
          <span className="st-installed-chip"><Icon name="check" size={10} /> Installed</span>
          <span
            className="btn btn-ghost btn-sm"
            onClick={(e) => { e.stopPropagation(); window.CHANLY.nav(CHANLY.R.agent(t.id)); }}
          >
            Configure
          </span>
        </>
      ) : (
        <>
          <span className="st-price"><span className="tabular">{t.price}</span> credits/mo</span>
          <span className="btn btn-primary btn-sm">{t.external ? "Connect" : "Install"}</span>
        </>
      )}
    </div>
  </button>
);

// ---------- Install modal ----------
const InstallModal = ({ t, installed, onClose, onInstalled, onPub }) => {
  const { CAP_META } = window.STORE_DATA;
  const [autonomy, setAutonomy] = useStoreState("ask");
  const [hs, setHs] = useStoreState(-1); // -1 idle · 0..2 step running · 3 done
  if (!t) return null;

  const hsSteps = [
    `Fetching agent card — ${t.abilities.skills.length} skills verified`,
    `Checking capabilities — ${t.caps.map(c => (CAP_META[c] || c).toLowerCase()).join(" · ")}`,
    `Applying autonomy — ${ST_AUT_LABEL[autonomy].toLowerCase()}`,
  ];

  const finalize = () => {
    const label = autonomy === "ask" ? t.autonomyDefault
      : autonomy === "earn" ? "Asks first — graduates after 10 clean approvals"
      : "Full auto within workspace guardrails";
    window.AS_STORE.install(t, label);
    onInstalled(t);
  };

  const install = () => {
    if (!window.canDo("autonomy")) return;
    if (!t.external) { finalize(); return; }
    setHs(0);
    let step = 0;
    const tick = setInterval(() => {
      step += 1;
      if (step > 2) { clearInterval(tick); setHs(3); setTimeout(finalize, 350); }
      else setHs(step);
    }, 620);
  };

  return (
    <div className="ask-overlay" onClick={onClose}>
      <div className="ask-modal st-modal" onClick={(e) => e.stopPropagation()}>
        <header className="st-modal-head">
          <span className={`st-tile lg ${installed ? "installed" : ""}`}>{t.glyph}</span>
          <div className="st-card-titles">
            <span className="st-modal-name">{t.name}</span>
            <Provenance t={t} onPub={onPub} />
          </div>
          {!installed && <span className="st-price lg"><span className="tabular">{t.price}</span> credits/mo</span>}
          {installed && <span className="st-installed-chip"><Icon name="check" size={10} /> Installed</span>}
        </header>

        <section className="st-modal-section">
          <div className="st-modal-label">What it does</div>
          <ul className="st-bullets">
            {t.bullets.map((b, i) => (
              <li key={i}><Icon name="check" size={11} /><span>{b}</span></li>
            ))}
          </ul>
        </section>

        <section className="st-modal-section">
          <div className="st-modal-label">Abilities</div>
          <AbilityChips abilities={t.abilities} max={8} />
          <div style={{ height: 6 }}></div>
          <CapBadges caps={t.caps} />
        </section>

        {t.external && (
          <section className="st-modal-section">
            <div className="st-modal-label">Connection</div>
            <div className="st-conn">
              <div className="st-conn-row"><span className="st-conn-key">Endpoint</span><span className="st-conn-val mono">{t.endpoint}</span></div>
              <div className="st-conn-row"><span className="st-conn-key">Auth</span><span className="st-conn-val">{t.auth}</span></div>
              <div className="st-conn-row"><span className="st-conn-key">Leaves workspace</span><span className="st-conn-val">{t.dataOut}</span></div>
            </div>
            <div className="st-floor">
              <Icon name="shield" size={12} />
              <span>Your workspace guardrails and quiet hours apply regardless of publisher. The kill switch lives in Fleet — pause or remove it any time.</span>
            </div>
          </section>
        )}

        {!installed && hs === -1 && (
          <section className="st-modal-section">
            <div className="st-modal-label">How it ships</div>
            <div className="ix-autonomy-seg">
              <button className={`ix-aut-seg ${autonomy === "ask" ? "active" : ""}`} onClick={() => setAutonomy("ask")}>
                <Icon name="agents" size={11} /><span>Ask me first</span>
              </button>
              <button className={`ix-aut-seg ${autonomy === "earn" ? "active" : ""}`} onClick={() => setAutonomy("earn")}>
                <Icon name="shield" size={11} /><span>Earn autonomy</span>
              </button>
              <button className={`ix-aut-seg ${autonomy === "auto" ? "active" : ""}`} onClick={() => setAutonomy("auto")}>
                <Icon name="check" size={11} /><span>Full auto</span>
              </button>
            </div>
            <div className="ix-aut-hint">
              {autonomy === "ask" && `Default — ${t.autonomyDefault}.`}
              {autonomy === "earn" && "Asks first; graduates to auto after 10 clean approvals."}
              {autonomy === "auto" && "Acts without asking. You can rein it in per decision type later."}
            </div>
          </section>
        )}

        {hs >= 0 && (
          <section className="st-modal-section">
            <div className="st-modal-label">Connecting</div>
            <div className="st-hs">
              {hsSteps.map((s, i) => (
                <div key={i} className={`st-hs-step ${hs > i || hs === 3 ? "done" : hs === i ? "on" : ""}`}>
                  <Icon name={hs > i || hs === 3 ? "check" : "arrow-right"} size={10} />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {installed && (() => {
          const f = stFleetOf(t.id);
          if (!f) return null;
          return (
            <section className="st-modal-section">
              <div className="st-modal-label">Your numbers</div>
              {stFresh(f) ? (
                <div className="sg-usage-empty">Installed at 12:04 — provisioning. First numbers land here after its first task; its queue and permissions live in Fleet.</div>
              ) : (
                <>
                  <div className="st-mine">
                    <div className="st-earn-cell"><span className="st-earn-v tabular">{f.today.convos}</span><span className="st-earn-k">conversations today</span></div>
                    <div className="st-earn-cell"><span className="st-earn-v tabular">{f.today.bookings}</span><span className="st-earn-k">bookings · {f.today.conv} conversion</span></div>
                    <div className="st-earn-cell"><span className="st-earn-v tabular">{f.today.revenue ? "$" + f.today.revenue.toLocaleString() : "—"}</span><span className="st-earn-k">attributed today</span></div>
                    <div className="st-earn-cell"><span className="st-earn-v tabular">{t.price}</span><span className="st-earn-k">credits/mo it costs</span></div>
                  </div>
                  <div className="sd-hint" style={{ marginTop: 8 }}>Your data, not the marketplace pitch — full attribution lives in Reports.</div>
                </>
              )}
            </section>
          );
        })()}

        {t.rating && (
          <section className="st-modal-section">
            <div className="st-modal-label">Ratings & reviews</div>
            <div className="st-rev-avg">
              <span className="st-earn-v tabular">{t.rating.avg}</span>
              <Stars n={t.rating.avg} />
              <span className="st-earn-k">{t.rating.count} verified workspace ratings</span>
            </div>
            {(t.reviews || []).map((r, i) => (
              <div key={i} className="st-rev">
                <div className="st-rev-head">
                  <span className="st-rev-who">{r.who}</span>
                  <Stars n={r.stars} />
                  <span className="st-rev-meta">{r.when} · ran it {r.usage}</span>
                </div>
                <div className="st-rev-text">{r.text}</div>
              </div>
            ))}
            <div className="sd-hint" style={{ marginTop: 8 }}>Only workspaces that ran it 30+ days can rate. Publishers can't edit or hide reviews.</div>
          </section>
        )}

        <section className="st-modal-section st-modal-meta">
          {t.requires.length > 0 && (
            <span className="st-requires">
              <Icon name="external" size={11} />
              Connects: {t.requires.join(" · ")}
            </span>
          )}
          <span className="st-proofline">
            <Icon name="trending-up" size={11} /> {t.proof} · {t.installs}
          </span>
        </section>

        <footer className="st-modal-foot">
          <button className="btn btn-ghost btn-sm" onClick={() => window.askAbout({
            title: "About " + t.name,
            prompt: "Is " + t.name + " worth installing?",
            answer: t.external
              ? `It's published by ${t.publisher}${t.verified ? " (verified)" : " — a new publisher with no verification yet"} and runs outside Chanlytics: ${t.dataOut.toLowerCase()}. Your guardrails still bind it, it ships ask-first, and the kill switch is in Fleet. Track record: ${t.proof}.`
              : "Its track record: " + t.proof + ". It ships ask-first — nothing runs without you until you loosen it in Fleet — and you can uninstall any time. Give it one week of real work and judge it on the numbers.",
            links: [{ label: "Open Fleet", to: "fleet" }],
          })}>
            <Icon name="sparkle" size={12} /> Ask about this agent
          </button>
          <div className="st-modal-foot-actions">
            <button className="btn btn-sm" onClick={onClose}>Close</button>
            {!installed ? (
              <button className="btn btn-primary btn-sm" disabled={hs >= 0} onClick={install} {...window.gate("autonomy")}>
                {hs >= 0 ? "Connecting…" : `${t.external ? "Connect" : "Install"} · ${t.price} credits/mo`}
              </button>
            ) : (
              <button className="btn btn-sm" onClick={() => window.CHANLY.nav(CHANLY.R.agent(t.id))}>
                Configure in Fleet <Icon name="arrow-right" size={11} />
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};

// ---------- Your listings ----------
// Inline recovery on the rejected row — works even if Studio was never opened
// this session (review state lives on the listing, not the page).
const RejectedFix = ({ l, flash }) => {
  const [name, setName] = useStoreState(
    (l.name || "").replace(/\b(best|#1|guaranteed|perfect|instant)\b/gi, "").replace(/\s+/g, " ").trim() || l.name
  );
  return (
    <div className="sd-pub-row" style={{ marginTop: 8 }}>
      <input className="sd-input" style={{ margin: 0, flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn btn-primary btn-sm" disabled={!name.trim()} onClick={() => {
        window.AS_STORE.resubmitListing(l.id, { name: name.trim() });
        flash({ msg: <><b>{name.trim()}</b> resubmitted — review re-runs all 5 checks</> });
      }}>Fix & resubmit</button>
    </div>
  );
};

const LISTING_PILL = {
  submitted: { cls: "pill-warn", label: "In review" },
  listed:    { cls: "pill-ok",   label: "Listed" },
  unlisted:  { cls: "",          label: "Unlisted" },
  rejected:  { cls: "pill-danger", label: "Rejected" },
};

const ListingsPane = ({ flash }) => {
  const [, setTick] = useStoreState(0);
  const [statsOpenId, setStatsOpenId] = useStoreState(null);
  useStoreEffect(() => {
    const bump = () => setTick(t => t + 1);
    window.addEventListener("store:listing", bump);
    return () => window.removeEventListener("store:listing", bump);
  }, []);
  const listings = window.AS_STORE.listings();
  const { STORE_PAYOUT } = window.STORE_DATA;
  const listedRows = listings.filter(l => l.status === "listed");
  const grossMo = listedRows.reduce((n, l) => n + l.installs * l.price, 0);
  const shareMo = Math.round(grossMo * STORE_PAYOUT.rate);
  const accrued = listings.reduce((n, l) => n + (l.accrued || 0), 0);
  return (
    <div>
      <div className="st-pubnote">
        <Icon name="external" size={11} />
        <span>Agents you connected and published. Listings appear to other Chanlytics workspaces; installs run against your endpoint via A2A.</span>
      </div>
      <div className="st-earn">
        <div className="st-earn-cell">
          <span className="st-earn-v tabular">{shareMo.toLocaleString()} cr/mo</span>
          <span className="st-earn-k">your share — 80% of {grossMo.toLocaleString()} gross</span>
        </div>
        <div className="st-earn-cell">
          <span className="st-earn-v tabular">{accrued.toLocaleString()} cr</span>
          <span className="st-earn-k">accrued this cycle · ≈ ${Math.round(accrued * STORE_PAYOUT.usdPerCredit)}</span>
        </div>
        <div className="st-earn-cell">
          <span className="st-earn-v">{STORE_PAYOUT.nextOn}</span>
          <span className="st-earn-k">payout → {STORE_PAYOUT.method} · {STORE_PAYOUT.schedule}</span>
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => window.CHANLY.nav(window.CHANLY.R.admin("billing"))}>
          Payout settings
        </button>
      </div>
      {listings.map(l => {
        const pill = LISTING_PILL[l.status] || LISTING_PILL.unlisted;
        const reviewDone = l.review ? l.review.filter(c => c.state !== "pending").length : 0;
        return (
          <React.Fragment key={l.id}>
          <div className="st-listing">
            <span className="st-tile">{l.name.trim()[0].toUpperCase()}</span>
            <div className="st-listing-main">
              <span className="st-listing-name">{l.name}</span>
              <span className="st-listing-role">{l.role}</span>
              <span className="st-listing-ep">{l.endpoint} · {l.price} credits/mo</span>
            </div>
            <div className="st-listing-meta">
              <span className={`pill ${pill.cls}`}>{pill.label}</span>
              <span className="st-listing-installs">
                {l.installs > 0 ? `${l.installs} install${l.installs === 1 ? "" : "s"}` : "No track record yet"}
              </span>
              {l.status === "listed" && l.installs > 0 && (
                <span className="st-listing-installs tabular">{Math.round(l.installs * l.price * window.STORE_DATA.STORE_PAYOUT.rate)} cr/mo your share</span>
              )}
              {l.status === "listed" && l.installs === 0 && (
                <span className="st-listing-installs">earnings accrue from first install</span>
              )}
            </div>
            <div className="st-listing-acts">
              {l.workspaces && l.workspaces.length > 0 && l.status !== "submitted" && l.status !== "rejected" && (
                <button className="btn btn-ghost btn-sm" onClick={() => setStatsOpenId(statsOpenId === l.id ? null : l.id)}>
                  {statsOpenId === l.id ? "Hide stats" : "Stats"}
                </button>
              )}
              {l.status !== "submitted" && l.status !== "rejected" && (
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  const to = l.status === "listed" ? "unlisted" : "listed";
                  window.AS_STORE.setListingStatus(l.id, to);
                  const was = l.status === "listed" ? "listed" : "unlisted";
                  flash({
                    msg: <>{to === "unlisted" ? <><b>{l.name}</b> unlisted — existing installs keep running</> : <><b>{l.name}</b> is live in the store</>}</>,
                    undo: () => window.AS_STORE.setListingStatus(l.id, was),
                  });
                }}>
                  {l.status === "listed" ? "Unlist" : "List"}
                </button>
              )}
              <button className="btn btn-sm" onClick={() => window.CHANLY.nav("studio")}>Manage in Studio</button>
            </div>
          </div>
          {(l.status === "submitted" || l.status === "rejected") && l.review && (
            <div className="st-review">
              <div className="st-modal-label" style={{ marginBottom: 6 }}>{l.status === "rejected" ? "Review failed" : `Review — ${reviewDone} of ${l.review.length} checks`}</div>
              <div className="st-hs">
                {l.review.map(c => (
                  <div key={c.id} className={`st-hs-step ${c.state === "ok" ? "done" : c.state === "warn" ? "warn" : c.state === "fail" ? "fail" : ""}`}>
                    <Icon name={c.state === "pending" ? "arrow-right" : c.state === "fail" ? "x" : "check"} size={10} />
                    <span>{c.label}{c.state === "warn" && c.warnNote ? ` — ${c.warnNote}` : ""}</span>
                  </div>
                ))}
              </div>
              {l.status === "rejected" && (
                <>
                  <div className="sd-auth-err" style={{ marginTop: 8 }}>{l.rejectReason}</div>
                  <RejectedFix l={l} flash={flash} />
                </>
              )}
            </div>
          )}
          {statsOpenId === l.id && l.workspaces && (
            <div className="st-review">
              <div className="st-modal-label" style={{ marginBottom: 2 }}>Across workspaces</div>
              <div className="sd-cardprev-meta" style={{ marginBottom: 8 }}>
                <span>{l.workspaces.reduce((n, w) => n + w.tasksMo, 0)} tasks this cycle</span>
                <span>{l.workspaces.reduce((n, w) => n + w.shareMo, 0)} cr/mo run rate · your share</span>
                <span>{l.workspaces.length} of {l.workspaces.length} still installed</span>
              </div>
              {l.workspaces.map(w => (
                <div key={w.id} className="st-ws-row">
                  <div className="st-ws-main">
                    <span className="st-ws-label">{w.label}</span>
                    <span className="st-ws-meta">installed {w.since} · {w.tasksMo} tasks this cycle · {w.accruedCr} cr accrued</span>
                  </div>
                  {w.status === "paused"
                    ? <span className="pill pill-warn" data-tip={w.pausedWhy}>Paused · {w.pausedWhy.split(" — ")[0]}</span>
                    : <span className="pill pill-ok">Active</span>}
                </div>
              ))}
              <div className="sd-hint" style={{ marginTop: 8 }}>Workspaces are anonymized — you see category and region, never names or client data. Their runs hit your endpoint directly. Ratings unlock for them after 30 days of use — none yet.</div>
            </div>
          )}
          {l.status !== "submitted" && l.status !== "rejected" && l.review && (
            <div className="st-review-passed"><Icon name="check" size={10} /> Passed {l.review.length} review checks{l.review.some(c => c.state === "warn") ? " · 1 copy edit" : ""}</div>
          )}
          </React.Fragment>
        );
      })}
      {listings.length === 0 && (
        <div className="st-empty">Nothing published yet — connect an agent in Studio, test it, and publish it here.</div>
      )}
    </div>
  );
};

// ---------- Page ----------
const AgentStore = () => {
  const { STORE_CATEGORIES, STORE_TEMPLATES } = window.STORE_DATA;
  const [view, setView] = useStoreState("browse");
  const [category, setCategory] = useStoreState("all");
  const [source, setSource] = useStoreState("all");
  const [query, setQuery] = useStoreState("");
  const [installedIds, setInstalledIds] = useStoreState(() => new Set(window.AS_STORE.installedIds()));
  const [openId, setOpenId] = useStoreState(null);
  const [pubName, setPubName] = useStoreState(null);
  const [recoDismissed, setRecoDismissed] = useStoreState(false);
  const [toastNode, flash] = window.usePPToast();

  useStoreEffect(() => {
    const sync = () => setInstalledIds(new Set(window.AS_STORE.installedIds()));
    window.addEventListener("store:installed", sync);
    return () => window.removeEventListener("store:installed", sync);
  }, []);

  const reco = STORE_TEMPLATES.find(t => t.recommended && !installedIds.has(t.id));

  const visible = useStoreMemo(() => {
    let list = [...STORE_TEMPLATES];
    if (category !== "all") list = list.filter(t => t.category === category);
    if (source !== "all") list = list.filter(t => source === "community" ? t.external : !t.external);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.role.toLowerCase().includes(q) ||
        t.publisher.toLowerCase().includes(q) ||
        t.abilities.skills.some(s => s.toLowerCase().includes(q))
      );
    }
    return list.sort((a, b) => {
      const ai = installedIds.has(a.id) ? 1 : 0, bi = installedIds.has(b.id) ? 1 : 0;
      if (ai !== bi) return ai - bi;
      return (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0);
    });
  }, [category, source, query, installedIds]);

  const catCounts = useStoreMemo(() => {
    const m = { all: STORE_TEMPLATES.length };
    STORE_CATEGORIES.forEach(c => {
      if (c.id !== "all") m[c.id] = STORE_TEMPLATES.filter(t => t.category === c.id).length;
    });
    return m;
  }, []);

  const installedCount = installedIds.size;
  const availableCount = STORE_TEMPLATES.length - installedCount;
  const listingsCount = window.AS_STORE.listings().length;
  const openTemplate = STORE_TEMPLATES.find(t => t.id === openId);

  const onInstalled = (t) => {
    setOpenId(null);
    flash({
      msg: <><b>{t.name}</b> {t.external ? "connected" : "installed"} — provisioning in your Fleet</>,
      undo: () => window.AS_STORE.uninstall(t.id),
      links: [{ label: "Open in Fleet", to: `fleet/${t.id}` }],
    });
  };

  return (
    <div className="store">
      {/* Header */}
      <div className="cl-head">
        <div className="cl-head-titles">
          <div className="cl-page-title">Agent Store</div>
          <div className="cl-page-sub">
            Agents by Chanlytics and outside publishers. Each ships asking for permission — autonomy is earned, and always yours to set.
          </div>
        </div>
        <StatStrip className="cl-head-stats">
          <StatCell label="Installed" value={installedCount} meta="on your fleet" />
          <StatCell label="Available" value={availableCount} meta="new abilities" />
          <StatCell label="Credits" tip="Shared usage pool for all installed agents · renews monthly" value={window.__BILLING ? (window.__BILLING.creditsTotal + window.__BILLING.topup - window.__BILLING.creditsUsed).toLocaleString() : "5,350"} meta="renews Aug 1" />
        </StatStrip>
      </div>

      {/* Controls */}
      <div className="cl-controls">
        <div className="cl-tabs">
          <button className={`cl-tab ${view === "browse" ? "active" : ""}`} onClick={() => setView("browse")}>Browse</button>
          <button className={`cl-tab ${view === "listings" ? "active" : ""}`} onClick={() => setView("listings")}>
            Your listings <span className="tabular">{listingsCount}</span>
          </button>
        </div>
        {view === "browse" && (
          <>
            <div className="cl-search-wrap">
              <Icon name="search" size={13} />
              <input placeholder="Search abilities, roles, publishers…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="cl-controls-right">
              <div className="fleet-filter">
                {[{ id: "all", label: "All sources" }, { id: "first", label: "First-party" }, { id: "community", label: "Community" }].map(s => (
                  <button key={s.id} className={`fleet-filter-chip ${source === s.id ? "active" : ""}`} onClick={() => setSource(s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="fleet-filter">
                {STORE_CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    className={`fleet-filter-chip ${category === c.id ? "active" : ""}`}
                    onClick={() => setCategory(c.id)}
                  >
                    {c.label}
                    <span className="fleet-filter-count tabular">{catCounts[c.id]}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="st-body">
        {view === "listings" ? (
          <ListingsPane flash={flash} />
        ) : (
          <>
            {reco && !recoDismissed && (
              <div className="st-reco">
                <span className="st-reco-glyph"><Icon name="sparkle" size={14} /></span>
                <div className="st-reco-body">
                  <span className="st-reco-title">Recommended: {reco.name}</span>
                  <span className="st-reco-reason">{reco.recoReason}</span>
                </div>
                <span className="st-reco-proof">{reco.proof}</span>
                <button className="btn btn-primary btn-sm" onClick={() => setOpenId(reco.id)}>
                  View & install
                </button>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setRecoDismissed(true)} aria-label="Dismiss">
                  <Icon name="x" size={12} />
                </button>
              </div>
            )}

            <div className="st-grid">
              {visible.map(t => (
                <StoreCard key={t.id} t={t} installed={installedIds.has(t.id)} onOpen={setOpenId} onPub={setPubName} />
              ))}
              {visible.length === 0 && (
                <div className="st-empty">No agents match "{query}".</div>
              )}
            </div>
          </>
        )}
      </div>

      {openTemplate && (
        <InstallModal
          key={openTemplate.id}
          t={openTemplate}
          installed={installedIds.has(openTemplate.id)}
          onClose={() => setOpenId(null)}
          onInstalled={onInstalled}
          onPub={(n) => { setOpenId(null); setPubName(n); }}
        />
      )}
      {pubName && (
        <PublisherModal
          name={pubName}
          onClose={() => setPubName(null)}
          onOpenAgent={(id) => { setPubName(null); setOpenId(id); }}
        />
      )}
      {toastNode}
    </div>
  );
};

window.AgentStore = AgentStore;
