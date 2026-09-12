/* global React, Icon, FailedRead */
// Setup — one page a new owner lands on until the receptionist is answering.
// Every row is a fact the workspace holds (contracts/setup.ts, published by
// the bridge as window.__SETUP); the rows use the attention row grammar
// People and Today share. A verb is a route, a dial, or one of the actions
// the page performs: asking a person at Chanlytics for a line, opening the
// line chooser, retrying a line that stopped.
const useSetupTick = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:setup", bump);
    return () => window.removeEventListener("surface:setup", bump);
  }, []);
};

// A row's tone is the state's own (contracts/tone.ts), through the bridge.
const setupTone = (state) => (window.__chrome && window.__chrome.state ? window.__chrome.state("setup", state).tone : "plain");

const money = (usd) => (typeof usd === "number" ? `about $${usd.toFixed(2)} a month` : "a small monthly fee");

// The chooser under the line row: a new number in an area code, the number
// you have (forwarding arrives next), or bringing it over (we file the port).
// A line costs money, so only an owner gets one.
const LineChooser = ({ S, flash, onDone, onKeep }) => {
  const [path, setPath] = React.useState("new");
  const [area, setArea] = React.useState("");
  const [numbers, setNumbers] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [chosen, setChosen] = React.useState(null);
  const cost = S.dto.lines && S.dto.lines.costs ? S.dto.lines.costs.local_number_month_usd : null;
  const owner = window.canDo ? window.canDo("team") : true;
  const find = async () => {
    if (!/^\d{3}$/.test(area)) { flash({ msg: <>Three digits, like 305.</> }); return; }
    setBusy(true);
    setChosen(null);
    const r = await window.__setup.lines.search(area);
    setBusy(false);
    if (!r.ok) { flash({ tone: "danger", msg: <>{r.message}</> }); return; }
    setNumbers(r.numbers || []);
    if (!(r.numbers || []).length) flash({ msg: <>Nothing free in {area} right now — try a nearby area code.</> });
  };
  const buy = async () => {
    if (!owner) { flash({ msg: <>Only an owner can get a line.</> }); return; }
    if (!chosen) return;
    setBusy(true);
    const r = await window.__setup.lines.buy(chosen.e164, area);
    setBusy(false);
    if (!r.ok && r.message) { flash({ tone: "danger", msg: <>{r.message}</> }); return; }
    flash({ msg: r.ok
      ? (r.queued
        ? <>{chosen.friendly} is yours — setting it up now, usually a minute or two. This page updates by itself.</>
        : <>{chosen.friendly} is yours — the receptionist answers it. Call it from your phone.</>)
      : <>Setting up {chosen.friendly} stopped part-way — a person at Chanlytics has it, and Retry is on the row.</> });
    onDone();
  };
  const ask = async () => {
    if (!(window.canDo && window.canDo("approve"))) { flash({ msg: <>Only an owner or operator can ask for a line.</> }); return; }
    const r = await window.__setup.request("line");
    flash({ msg: r.ok
      ? (r.already ? <>Already asked — a person at Chanlytics has it.</> : <>We got it — a person at Chanlytics will set up your line with you.</>)
      : <>Couldn&rsquo;t send the request — {r.message}</> });
    onDone();
  };
  return (
    <section className="setup-chooser" data-testid="setup-chooser">
      <div className="setup-paths">
        <button className={`setup-path ${path === "new" ? "active" : ""}`} onClick={() => setPath("new")} data-testid="setup-path-new">
          <b>Get a new number</b>
          <span>A local number in your area code, {money(cost)}. Your receptionist answers it within a minute of choosing.</span>
        </button>
        <button className={`setup-path ${path === "keep" ? "active" : ""}`} onClick={() => setPath("keep")} data-testid="setup-path-keep">
          <b>Keep my number</b>
          <span>Keep the number your customers know: forward the calls you don&rsquo;t answer to the receptionist. You keep your phone, your carrier and your texts.</span>
        </button>
        <button className={`setup-path ${path === "bring" ? "active" : ""}`} onClick={() => setPath("bring")} data-testid="setup-path-bring">
          <b>Bring my number</b>
          <span>Move the number you have onto Chanlytics. The carriers take 7 to 14 business days; we file it for you.</span>
        </button>
      </div>
      {path === "new" ? (
        <div className="setup-new">
          <div className="setup-find">
            <label className="setup-find-label" htmlFor="setup-area">Area code</label>
            <input
              id="setup-area"
              className="setup-area"
              inputMode="numeric"
              maxLength={3}
              placeholder="305"
              value={area}
              onChange={(e) => setArea(e.target.value.replace(/\D/g, "").slice(0, 3))}
              onKeyDown={(e) => { if (e.key === "Enter") find(); }}
              data-testid="setup-area"
            />
            <button className="btn btn-sm" onClick={find} disabled={busy} data-testid="setup-find">{busy && !chosen ? "Looking…" : "Find numbers"}</button>
          </div>
          {numbers && numbers.length > 0 && (
            <div className="setup-numbers" data-testid="setup-numbers">
              {numbers.map((n) => (
                <button key={n.e164} className={"setup-number " + (chosen && chosen.e164 === n.e164 ? "active" : "")} onClick={() => setChosen(n)} data-testid="setup-number">
                  <span className="setup-number-num tabular">{n.friendly}</span>
                  <span className="setup-number-where">{[n.locality, n.region].filter(Boolean).join(", ") || "Local"}</span>
                </button>
              ))}
            </div>
          )}
          {chosen && (
            <div className="setup-confirm" data-testid="setup-confirm">
              <span className="setup-confirm-text"><b className="tabular">{chosen.friendly}</b> · {money(cost)} · your receptionist answers it; texting arrives when the carriers register it</span>
              <button className="btn btn-primary btn-sm" onClick={buy} disabled={busy} data-testid="setup-buy">{busy ? "Setting up…" : "Get this number"}</button>
            </div>
          )}
        </div>
      ) : path === "keep" ? (
        <div className="setup-ask">
          <span className="setup-ask-text">
            {S.dto.channels.voice.active
              ? `Your receptionist answers on ${S.vm.tryIt && S.vm.tryIt.voiceLabel ? S.vm.tryIt.voiceLabel : "its line"}. Forward the number you have to it from the row "The number you already have" below.`
              : "First, a line for the receptionist to answer on — get a new number here. Then forward the number you have to it from the row below."}
          </span>
          {S.dto.channels.voice.active && <button className="btn btn-sm" onClick={() => { onDone(); onKeep(); }} data-testid="setup-keep-go">Set up forwarding</button>}
        </div>
      ) : (
        <div className="setup-ask">
          <span className="setup-ask-text">A port is filed by a person at Chanlytics. Ask, and we set it up with you.</span>
          <button className="btn btn-sm" onClick={ask} data-testid="setup-ask-us">Ask us</button>
        </div>
      )}
    </section>
  );
};

// Keep the number you have: the carrier's code to dial on the phone that has
// it, then a test window — a call to the kept number that reaches the
// receptionist inside it marks the row verified, and the page repaints.
const ForwardingCard = ({ S, flash, onDone }) => {
  const W = window.__forwarding;
  const fw = ((S.dto.lines && S.dto.lines.rows) || []).find((l) => l.kind === "forwarded") || null;
  const f = fw && fw.forwarding ? fw.forwarding : null;
  const dest = S.dto.channels.voice.active ? S.dto.channels.voice.number : null;
  const [number, setNumber] = React.useState(fw && fw.e164 ? fw.e164 : "");
  const [carrier, setCarrier] = React.useState(f && f.carrier ? f.carrier : "verizon");
  const [mode, setMode] = React.useState(f && f.mode ? f.mode : "unanswered");
  const [testFrom, setTestFrom] = React.useState(f && f.test_from ? f.test_from : "");
  const [busy, setBusy] = React.useState(false);
  const owner = window.canDo ? window.canDo("team") : true;
  const save = async () => {
    if (!owner) { flash({ msg: <>Only an owner can set up forwarding.</> }); return; }
    setBusy(true);
    const r = await window.__setup.forwarding.set({ number, carrier, mode, test_from: testFrom });
    setBusy(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <>Saved. Dial the code on the phone with {number}, then test it.</> : <>{r.message}</> });
  };
  const test = async () => {
    if (!owner) { flash({ msg: <>Only an owner can test forwarding.</> }); return; }
    setBusy(true);
    const r = await window.__setup.forwarding.test(fw.id);
    setBusy(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <>The window is open for 30 minutes — call {W.display(fw.e164)} from another phone.</> : <>{r.message}</> });
  };
  const codes = fw && f && (f.destination_e164 || dest) ? W.codes(f.carrier, f.mode, f.destination_e164 || dest) : null;
  const testing = !!(f && W.testOpen(f));
  return (
    <section className="setup-chooser setup-fw" data-testid="setup-forwarding">
      {!dest && <p className="setup-fw-note">Your receptionist needs a line first — get a new number from the row above.</p>}
      <div className="setup-fw-form">
        <label className="setup-fw-field">
          <span className="setup-find-label">The number you keep</span>
          <input className="setup-area setup-fw-input" inputMode="tel" placeholder="(305) 555-0100" value={number} onChange={(e) => setNumber(e.target.value)} data-testid="setup-fw-number" />
        </label>
        <div className="setup-fw-field">
          <span className="setup-find-label">Carrier</span>
          <div className="setup-fw-seg">
            {W.carriers.map((c) => <button key={c} className={"setup-seg " + (carrier === c ? "active" : "")} onClick={() => setCarrier(c)} data-testid={`setup-fw-carrier-${c}`}>{W.carrierWords[c]}</button>)}
          </div>
        </div>
        <div className="setup-fw-field">
          <span className="setup-find-label">Which calls</span>
          <div className="setup-fw-seg">
            {W.modes.map((m) => <button key={m} className={"setup-seg " + (mode === m ? "active" : "")} onClick={() => setMode(m)} data-testid={`setup-fw-mode-${m}`}>{W.modeWords[m]}</button>)}
          </div>
        </div>
        <label className="setup-fw-field">
          <span className="setup-find-label">The phone you&rsquo;ll test from (optional)</span>
          <input className="setup-area setup-fw-input" inputMode="tel" placeholder="your mobile" value={testFrom} onChange={(e) => setTestFrom(e.target.value)} data-testid="setup-fw-from" />
        </label>
        <div className="setup-fw-actions">
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !dest} data-testid="setup-fw-save">{fw ? "Save changes" : "Save and show the code"}</button>
          <button className="btn btn-ghost btn-sm" onClick={onDone}>Close</button>
        </div>
      </div>
      {codes && (
        <div className="setup-fw-code" data-testid="setup-fw-code">
          <span className="setup-find-label">Dial on the phone with {W.display(fw.e164)}</span>
          <a className="setup-fw-dial tabular" href={codes.on.tel} data-testid="setup-fw-dial">{codes.on.code}</a>
          <ul className="setup-fw-notes">{codes.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          <div className="setup-fw-actions">
            {fw.forwarding_state === "verified"
              ? <span className="setup-fw-ok">Verified {f.verified_at ? W.ago(f.verified_at) : ""} · to switch it off, dial <b className="tabular">{codes.off.code}</b></span>
              : testing
                ? <span className="setup-fw-ok">The window is open — call {W.display(fw.e164)} from another phone. This page updates by itself.</span>
                : <button className="btn btn-sm" onClick={test} disabled={busy} data-testid="setup-fw-test">Test it</button>}
            {fw.forwarding_state !== "verified" && <span className="setup-fw-off">Off again: <b className="tabular">{codes.off.code}</b></span>}
          </div>
        </div>
      )}
    </section>
  );
};

// The finder under the Google row: what Google finds for the name and
// address on record, one tap to confirm; a few words of your own when the
// first search misses. Linking is an owner's move; the route says so too.
const ListingFinder = ({ flash, onDone }) => {
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState(true);
  const [result, setResult] = React.useState(null);
  React.useEffect(() => {
    let on = true;
    if (!window.__google) { setBusy(false); return undefined; }
    window.__google.find().then((r) => {
      if (!on) return;
      setBusy(false);
      setResult(r.ok ? { candidates: r.candidates, query: r.query, fromFacts: r.fromFacts, failed: "" } : { candidates: [], query: "", fromFacts: true, failed: r.message });
    });
    return () => { on = false; };
  }, []);
  const search = async () => {
    const words = query.replace(/\s+/g, " ").trim();
    if (!window.__google || busy || words.length < 3) return;
    setBusy(true);
    const r = await window.__google.find(words);
    setBusy(false);
    setResult(r.ok ? { candidates: r.candidates, query: r.query, fromFacts: false, failed: "" } : { candidates: [], query: words, fromFacts: false, failed: r.message });
  };
  const link = async (c) => {
    if (!(window.canDo && window.canDo("team"))) { flash({ msg: <>Only an owner can link the listing.</> }); return; }
    if (!window.__google || busy) return;
    setBusy(true);
    const r = await window.__google.link(c.place_id);
    setBusy(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <><b>{c.name}</b> is your listing on Google{r.read ? " — read just now" : " — Google will be read within the hour"}.</> : <>{r.message}</> });
    if (r.ok) onDone();
  };
  let lead;
  if (result === null) lead = "Looking on Google…";
  else if (result.failed) lead = result.failed;
  else if (result.candidates.length) lead = result.fromFacts ? "Found with the name and address on record — is one of these you?" : `Found for “${result.query}” — is one of these you?`;
  else lead = result.fromFacts ? "Nothing found with the name and address on record. Try a few words of your own:" : `Nothing found for “${result.query}”. Try other words:`;
  return (
    <section className="setup-chooser setup-google" data-testid="setup-google-finder">
      <div className="setup-ask"><span className="setup-ask-text" data-testid="setup-google-lead">{lead}</span></div>
      {result && result.candidates.length > 0 && (
        <div className="setup-places" data-testid="setup-places">
          {result.candidates.map((c) => (
            <div key={c.place_id} className="setup-place" data-testid="setup-place">
              <span className="setup-place-body">
                <span className="setup-place-name">{c.name}</span>
                <span className="setup-place-where">{c.address || "no address on Google"}</span>
              </span>
              {c.maps_uri && <a className="cl-bucket-link" href={c.maps_uri} target="_blank" rel="noreferrer">See it on Maps</a>}
              <button className="btn btn-primary btn-sm" onClick={() => link(c)} disabled={busy} data-testid="setup-place-link">This is it</button>
            </div>
          ))}
        </div>
      )}
      <div className="setup-google-row">
        <input className="setup-area setup-fw-input" placeholder="Name and city, like Northside Movers Brooklyn" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") search(); }} data-testid="setup-google-query" />
        <button className="btn btn-sm" onClick={search} disabled={busy || query.trim().length < 3} data-testid="setup-google-search">{busy ? "Looking…" : "Search again"}</button>
        <button className="cl-bucket-link" onClick={onDone}>Close</button>
      </div>
    </section>
  );
};

const PaneSetup = () => {
  useSetupTick();
  const [toastNode, flash] = window.usePPToast();
  const [chooser, setChooser] = React.useState(false);
  const [forwarding, setForwarding] = React.useState(false);
  const [finder, setFinder] = React.useState(false);
  const S = window.__SETUP;
  if (S === null) {
    // The read failed: say so, and offer the retry Connections offers, instead of "Reading…" for ever.
    return (
      <>
        <FailedRead kind="card" what="your setup" body="The receptionist keeps answering; this page just can't read your workspace at the moment." onRetry={() => window.__setup && window.__setup.refresh && window.__setup.refresh()} testid="setup-failed" retryTestid="setup-retry" />
        {toastNode}
      </>
    );
  }
  if (!S) {
    return (
      <section className="fl-card set-card" data-testid="setup-loading">
        <div className="set-row"><div className="set-row-info"><span className="set-row-hint">{window.__DEMO_MODE ? "Setup reads a real workspace." : "Reading your workspace…"}</span></div></div>
      </section>
    );
  }
  const vm = S.vm;
  const nav = (to) => window.appNavigate && window.appNavigate(to);
  const act = async (verb) => {
    if (!verb) return;
    if (verb.to === "verb:request-line") {
      if (!(window.canDo && window.canDo("approve"))) { flash({ msg: <>Only an owner or operator can ask for a line.</> }); return; }
      const r = await window.__setup.request("line");
      flash({ msg: r.ok
        ? (r.already ? <>Already asked — a person at Chanlytics has it.</> : <>We got it — a person at Chanlytics will set up your line with you.</>)
        : <>Couldn&rsquo;t send the request — {r.message}</> });
      return;
    }
    if (verb.to === "verb:choose-line") { setChooser((v) => !v); return; }
    if (verb.to === "verb:forwarding") { setForwarding((v) => !v); return; }
    if (verb.to === "verb:google-find") { setFinder((v) => !v); return; }
    if (verb.to === "verb:billing-checkout" || verb.to === "verb:billing-portal") {
      if (!(window.canDo && window.canDo("team"))) { flash({ msg: <>Only an owner can start or manage the subscription.</> }); return; }
      if (!window.__billing) return;
      const r = verb.to === "verb:billing-checkout" ? await window.__billing.checkout() : await window.__billing.portal();
      if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
      return;
    }
    if (verb.to.startsWith("verb:forwarding-test:")) {
      if (!(window.canDo && window.canDo("team"))) { flash({ msg: <>Only an owner can test forwarding.</> }); return; }
      const r = await window.__setup.forwarding.test(verb.to.slice("verb:forwarding-test:".length));
      flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <>The window is open for 30 minutes — call the number you keep from another phone.</> : <>{r.message}</> });
      setForwarding(true);
      return;
    }
    if (verb.to.startsWith("verb:retry-line:")) {
      if (!(window.canDo && window.canDo("team"))) { flash({ msg: <>Only an owner can retry a line.</> }); return; }
      flash({ msg: <>Retrying — usually a minute or two.</> });
      const r = await window.__setup.lines.retry(verb.to.slice("verb:retry-line:".length));
      flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? (r.queued ? <>Setting up again — this page updates by itself.</> : <>Your line answers now.</>) : <>{r.message || "It stopped again — a person at Chanlytics has it."}</> });
      return;
    }
    if (verb.to.startsWith("verb:activate:")) {
      if (!(window.canDo && window.canDo("team"))) { flash({ msg: <>Only an owner can activate a capability.</> }); return; }
      const r = await window.__setup.activate(verb.to.slice("verb:activate:".length));
      flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <>Activated — it is yours to use, and Setup says so.</> : <>{r.message}</> });
      return;
    }
    if (verb.to.startsWith("verb:deactivate:")) {
      if (!(window.canDo && window.canDo("team"))) { flash({ msg: <>Only an owner can switch a capability off.</> }); return; }
      const r = await window.__setup.deactivate(verb.to.slice("verb:deactivate:".length));
      flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <>Switched off — the record stays, and you can activate it again whenever you like.</> : <>{r.message}</> });
      return;
    }
    if (verb.to.startsWith("tel:")) { window.location.href = verb.to; return; }
    nav(verb.to);
  };
  const dial = (n) => (n ? `tel:${n}` : null);
  return (
    <div className="setup" data-testid="setup">
      <section className="fl-card set-card setup-head" data-testid="setup-readiness">
        <div className="fl-card-head">
          <span className="fl-card-title">Setup</span>
          <span className="fl-card-sub tabular" data-testid="setup-count">{vm.done} of {vm.total} ready</span>
        </div>
        <p className="setup-sentence" data-testid="setup-sentence">{vm.readiness.sentence}</p>
        {vm.next && (
          <div className="setup-next">
            <span className="setup-next-label">Next</span>
            <button className="btn btn-primary btn-sm" onClick={() => act(vm.next)} data-testid="setup-next">{vm.next.title}: {vm.next.label} <Icon name="arrow-right" size={11} /></button>
          </div>
        )}
      </section>

      {vm.tryIt && (
        <section className="fl-card set-card setup-try" data-testid="setup-try">
          <div className="fl-card-head"><span className="fl-card-title">Try your receptionist</span><span className="fl-card-sub">from your own phone</span></div>
          <div className="setup-try-rows">
            {vm.tryIt.voice && (
              <div className="setup-try-row">
                <Icon name="phone" size={13} />
                <span className="setup-try-num">{vm.tryIt.voiceLabel}</span>
                <a className="btn btn-sm" href={dial(vm.tryIt.voice)}>Call it</a>
                <button className="btn btn-ghost btn-sm" onClick={() => nav("live")}>Then open Live <Icon name="arrow-right" size={10} /></button>
              </div>
            )}
            {vm.tryIt.whatsapp && (
              <div className="setup-try-row">
                <Icon name="chat" size={13} />
                <span className="setup-try-num">{vm.tryIt.whatsappLabel}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => nav("inbox")}>Text it, then open the Inbox <Icon name="arrow-right" size={10} /></button>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="tq setup-rows" data-testid="setup-rows">
        <div className="tq-list">
          {vm.rows.map((r) => (
            <div key={r.id} className={r.later ? "setup-later" : undefined}>
              <window.AttnRow
                glyph={r.icon}
                name={r.title}
                sentence={r.sentence}
                quoted={false}
                status={[r.stateWords, ...r.details]}
                tone={setupTone(r.state)}
                cta={r.verb ? { label: r.verb.label, kind: vm.next && vm.next.row === r.id ? "primary" : "ghost", onClick: () => act(r.verb) } : null}
                also={r.undo
                  ? { label: r.undo.label, onClick: () => act(r.undo), testid: `setup-undo-${r.id}` }
                  : !r.required && r.state !== "ready" ? { label: r.later ? "Undo later" : "Later", onClick: () => window.__setup.later(r.id, !r.later), testid: `setup-later-${r.id}` } : null}
                // The row is a click target for a navigation, never for a dial:
                // a mis-click on the receptionist row must not ring the shop.
                onOpen={r.verb && !r.verb.to.startsWith("tel:") ? () => act(r.verb) : undefined}
                testid={`setup-row-${r.id}`}
                ctaTestid="setup-verb"
              />
              {r.id === "line" && chooser && <LineChooser S={S} flash={flash} onDone={() => setChooser(false)} onKeep={() => setForwarding(true)} />}
              {r.id === "keep" && forwarding && <ForwardingCard S={S} flash={flash} onDone={() => setForwarding(false)} />}
              {r.id === "google" && finder && <ListingFinder flash={flash} onDone={() => setFinder(false)} />}
            </div>
          ))}
        </div>
      </section>
      {toastNode}
    </div>
  );
};

window.PaneSetup = PaneSetup;
