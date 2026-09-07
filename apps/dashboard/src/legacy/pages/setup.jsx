/* global React, Icon */
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

const SETUP_TONE = { waiting_you: "warn", waiting_them: "queued", ready: "", not_started: "" };

const money = (usd) => (typeof usd === "number" ? `about $${usd.toFixed(2)} a month` : "a small monthly fee");

// The chooser under the line row: a new number in an area code, the number
// you have (forwarding arrives next), or bringing it over (we file the port).
// A line costs money, so only an owner gets one.
const LineChooser = ({ S, flash, onDone }) => {
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
    if (!r.ok) { flash({ msg: <>{r.message}</> }); return; }
    setNumbers(r.numbers || []);
    if (!(r.numbers || []).length) flash({ msg: <>Nothing free in {area} right now — try a nearby area code.</> });
  };
  const buy = async () => {
    if (!owner) { flash({ msg: <>Only an owner can get a line.</> }); return; }
    if (!chosen) return;
    setBusy(true);
    const r = await window.__setup.lines.buy(chosen.e164, area);
    setBusy(false);
    if (!r.ok && r.message) { flash({ msg: <>{r.message}</> }); return; }
    flash({ msg: r.ok
      ? <>{chosen.friendly} is yours — the receptionist answers it. Call it from your phone.</>
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
          <span>Forward calls from the number you have. Arrives with the next update — for now, ask us and we set it up with you.</span>
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
      ) : (
        <div className="setup-ask">
          <span className="setup-ask-text">{path === "keep" ? "Forwarding from your current number is not here yet." : "A port is filed by a person at Chanlytics."} Ask, and we set it up with you.</span>
          <button className="btn btn-sm" onClick={ask} data-testid="setup-ask-us">Ask us</button>
        </div>
      )}
    </section>
  );
};

const PaneSetup = () => {
  useSetupTick();
  const [toastNode, flash] = window.usePPToast();
  const [chooser, setChooser] = React.useState(false);
  const S = window.__SETUP;
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
    if (verb.to.startsWith("verb:retry-line:")) {
      if (!(window.canDo && window.canDo("team"))) { flash({ msg: <>Only an owner can retry a line.</> }); return; }
      flash({ msg: <>Retrying — usually a minute or two.</> });
      const r = await window.__setup.lines.retry(verb.to.slice("verb:retry-line:".length));
      flash({ msg: r.ok ? <>Your line answers now.</> : <>{r.message || "It stopped again — a person at Chanlytics has it."}</> });
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
                tone={SETUP_TONE[r.state] || ""}
                cta={r.verb ? { label: r.verb.label, kind: vm.next && vm.next.row === r.id ? "primary" : "ghost", onClick: () => act(r.verb) } : null}
                also={!r.required && r.state !== "ready" ? { label: r.later ? "Undo later" : "Later", onClick: () => window.__setup.later(r.id, !r.later), testid: `setup-later-${r.id}` } : null}
                onOpen={() => act(r.verb)}
                testid={`setup-row-${r.id}`}
                ctaTestid="setup-verb"
              />
              {r.id === "line" && chooser && <LineChooser S={S} flash={flash} onDone={() => setChooser(false)} />}
            </div>
          ))}
        </div>
      </section>
      {toastNode}
    </div>
  );
};

window.PaneSetup = PaneSetup;
