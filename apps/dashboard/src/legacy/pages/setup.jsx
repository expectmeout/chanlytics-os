/* global React, Icon */
// Setup's rows: every fact the workspace holds (contracts/setup.ts, published by the bridge as window.__SETUP), drawn
// wherever a page asks what is left to set up. The first run draws them one step at a time (first-run.jsx); Today
// draws what is left after (dashboard-a-brief.jsx TodaySetup). The rows use the attention row grammar People and
// Today share. A verb is a route, a dial, or one of the actions the rows perform: asking a person at Chanlytics for a
// line, opening the line chooser, retrying a line that stopped.
// A row's tone is the state's own (contracts/tone.ts), through the bridge.
const setupTone = (state) => (window.__chrome && window.__chrome.state ? window.__chrome.state("setup", state).tone : "plain");


// Who may press a row's verb, and what pressing does, for the gate's sentence
// (contracts refusal.ts roleGate). A verb that opens a panel or a page is anyone's,
// but for a page that is only an owner's (Find, where searching and linking are);
// these reach doors that refuse everyone else (requireRole), and the button says so
// before the press -- it used to say so after, in a toast.
const SETUP_GATES = [
  ["verb:request-line", "approve", "ask for a line"],
  ["verb:request-repair", "approve", "ask for a repair"],
  ["verb:billing-checkout", "billing", "start the subscription"],
  ["verb:billing-portal", "billing", "manage the subscription"],
  ["verb:forwarding-test:", "team", "test forwarding"],
  ["verb:retry-line:", "team", "retry a line"],
  ["verb:activate:", "team", "activate a capability"],
  ["verb:deactivate:", "team", "withdraw an activation"],
  // Google's row opens the first run's Find (contracts FIRST_RUN_FIND_ROUTE), and searching and linking are an
  // owner's (the routes say so too).
  ["start/find", "team", "find the business on Google"],
];
const setupGate = (verb) => {
  const hit = verb && verb.to ? SETUP_GATES.find(([to]) => (to.endsWith(":") ? verb.to.startsWith(to) : verb.to === to)) : null;
  return hit && window.gate ? window.gate(hit[1], hit[2]) : {};
};
const setupGated = (verb) => "data-gated" in setupGate(verb);

// The chooser under the line row: a new number in an area code, the number
// you have (forwarding arrives next), or bringing it over (we file the port).
// A line costs money, so only an owner gets one.
const LineChooser = ({ S, flash, onDone, onKeep }) => {
  const [path, setPath] = React.useState("new");
  const [area, setArea] = React.useState("");
  const [numbers, setNumbers] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [chosen, setChosen] = React.useState(null);
  const owner = window.canDo ? window.canDo("team") : true;
  const find = async () => {
    // Enter in the area code reaches this too, past the gated Find numbers, so it asks the same gate.
    if (!owner) return;
    if (!/^\d{3}$/.test(area)) { flash({ tone: "warn", msg: <>Three digits, like 305.</> }); return; }
    setBusy(true);
    setChosen(null);
    const r = await window.__setup.lines.search(area);
    setBusy(false);
    if (!r.ok) { flash({ tone: "danger", msg: <>{r.message}</> }); return; }
    setNumbers(r.numbers || []);
    if (!(r.numbers || []).length) flash({ tone: "info", msg: <>Nothing free in {area} right now — try a nearby area code.</> });
  };
  const buy = async () => {
    if (!owner) return;
    if (!chosen) return;
    setBusy(true);
    const r = await window.__setup.lines.buy(chosen.e164, area);
    setBusy(false);
    if (!r.ok && r.message) { flash(window.refusalToast(r, "No line bought")); return; }
    // Bought, then stopped part-way: the number is ours and a person has it -- a warning, not good news.
    flash({ tone: r.ok ? "ok" : "warn", msg: r.ok
      ? (r.queued
        ? <>{chosen.friendly} is yours — setting it up now, usually a minute or two. This page updates by itself.</>
        : <>{chosen.friendly} is yours — the receptionist answers it. Call it from your phone.</>)
      : <>Setting up {chosen.friendly} stopped part-way — a person at Chanlytics has it, and Retry is on the row.</> });
    onDone();
  };
  // Bringing the number you have is its own ask (S14): it filed a line request, and the row then said "set up your line".
  const ask = async () => {
    if (!(window.canDo && window.canDo("approve"))) return;
    const r = await window.__setup.request("port");
    flash(r.ok
      ? { msg: r.already ? <>Already asked — a person at Chanlytics has it.</> : <>We got it — a person at Chanlytics will move your number with you and reach you by email.</> }
      : window.refusalToast(r, "Request not sent"));
    onDone();
  };
  return (
    <section className="setup-chooser" data-testid="setup-chooser">
      <div className="setup-paths">
        <button className={`setup-path ${path === "new" ? "active" : ""}`} onClick={() => setPath("new")} data-testid="setup-path-new">
          <b>Get a new number</b>
          <span>A local number in your area code, included in your plan. Your receptionist answers it within a minute of choosing.</span>
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
            <button className="btn btn-sm" onClick={find} disabled={busy} data-testid="setup-find" {...window.gate("team", "find a number")}>{busy && !chosen ? "Looking…" : "Find numbers"}</button>
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
              <span className="setup-confirm-text"><b className="tabular">{chosen.friendly}</b> · included in your plan · your receptionist answers it; texting arrives when the carriers register it</span>
              <button className="btn btn-primary btn-sm" onClick={buy} disabled={busy} data-testid="setup-buy" {...window.gate("team", "get a line")}>{busy ? "Setting up…" : "Get this number"}</button>
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
          <span className="setup-ask-text">A person at Chanlytics files the move with your carrier. Ask, and we reach you by email for what your carrier needs.</span>
          <button className="btn btn-sm" onClick={ask} data-testid="setup-ask-us" {...window.gate("approve", "ask to bring your number")}>Ask us</button>
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
    if (!owner) return;
    setBusy(true);
    const r = await window.__setup.forwarding.set({ number, carrier, mode, test_from: testFrom });
    setBusy(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <>Saved. Dial the code on the phone with {number}, then test it.</> : <>{r.message}</> });
  };
  const test = async () => {
    if (!owner) return;
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
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !dest} data-testid="setup-fw-save" {...window.gate("team", "set up forwarding")}>{fw ? "Save changes" : "Save and show the code"}</button>
          <button className="btn btn-ghost btn-sm" onClick={onDone}>Close</button>
        </div>
      </div>
      {codes && (
        <div className="setup-fw-code" data-testid="setup-fw-code">
          <span className="setup-find-label">{W.dialLabel(f.carrier, W.display(fw.e164))}</span>
          <a className="setup-fw-dial tabular" href={codes.on.tel} data-testid="setup-fw-dial">{codes.on.code}</a>
          <ul className="setup-fw-notes">{codes.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          <div className="setup-fw-actions">
            {fw.forwarding_state === "verified"
              ? <span className="setup-fw-ok">Verified {f.verified_at ? W.ago(f.verified_at) : ""}{codes.off.code ? <> · to switch it off, dial <b className="tabular">{codes.off.code}</b></> : null}</span>
              : testing
                ? <span className="setup-fw-ok">The window is open — call {W.display(fw.e164)} from another phone. This page updates by itself.</span>
                : <button className="btn btn-sm" onClick={test} disabled={busy} data-testid="setup-fw-test" {...window.gate("team", "test forwarding")}>Test it</button>}
            {fw.forwarding_state !== "verified" && codes.off.code && <span className="setup-fw-off">Off again: <b className="tabular">{codes.off.code}</b></span>}
          </div>
        </div>
      )}
    </section>
  );
};

/**
 * One of Setup's rows as Today's card draws it (canvas R10): its state as a dot (the word is the dot's name), its name
 * and sentence, and its acts at the right: the next one coral, the others outlined, putting it off a quiet link.
 * Hookless; the acts are the caller's, gate spreads included. `left` is how many are left, beside the words: a phone
 * draws the card as this one row with no head (canvas P9), so the count rides here; a wider screen hides it.
 */
const SetupCardRow = ({ tone, stateWords, name, sentence, left = null, cta = null, also = null, testid, ctaTestid = "setup-verb" }) => (
  <div className="setup-card-row" data-testid={testid}>
    <span className="setup-card-dot" data-tone={tone} role="img" aria-label={stateWords} title={stateWords} />
    <div className="setup-card-body">
      <span className="setup-card-name">{name}</span>
      <span className="setup-card-said">
        <span className="setup-card-words">{sentence}</span>
        {left ? <span className="setup-card-aside"><span aria-hidden="true"> · </span>{left}</span> : null}
      </span>
    </div>
    {cta || also ? (
      <div className="setup-card-acts">
        {cta ? (
          <button type="button" className={cta.kind === "primary" ? "setup-card-btn primary" : "setup-card-btn"} onClick={cta.onClick} disabled={!!cta.busy} aria-busy={cta.busy ? true : undefined} {...(cta.gate || {})} data-testid={ctaTestid}>{cta.short ? <><span className="setup-card-long">{cta.label}</span><span className="setup-card-short">{cta.short}</span></> : cta.label}</button>
        ) : null}
        {also ? (
          <button type="button" className="setup-card-skip" onClick={also.onClick} disabled={!!also.busy} aria-busy={also.busy ? true : undefined} {...(also.gate || {})} data-testid={also.testid}>{also.label}</button>
        ) : null}
      </div>
    ) : null}
  </div>
);

/**
 * Setup's rows, as attention rows, with everything a row does: a route, a dial, or one of the rows' own acts (asking a
 * person, the line chooser, forwarding, activation, billing), each behind its door's role
 * (SETUP_GATES). `rows` are Setup's (contracts setupSteps), in the order to draw them; `primary` names the row whose
 * button is the one coral action; `later` is what a row's second button says, the caller's (contracts): the first
 * run's Later keeps the row drawn with its undo, Today's Skip takes it off the card and says so in a toast with Undo
 * (`said`). Holds the panels' state and the one verb on its way, so a second press waits for the first (S23). The
 * list only: the caller draws the card it sits in, and may lend the toast (`flash`) where the card can go while one
 * is up -- Today's, when its last row is skipped. `look` is how a row is drawn: `row`, the attention row the first
 * run draws; `card`, Today's compact row (SetupCardRow), whose first carries `left`, the card's count.
 */
const SetupRows = ({ S, rows, later, look, primary = null, left = null, flash: lent = null, testid = "setup-rows" }) => {
  const [toastNode, own] = window.usePPToast();
  const flash = lent || own;
  const [chooser, setChooser] = React.useState(false);
  const [forwarding, setForwarding] = React.useState(false);
  // The verb on its way, if any. Its button shows busy, and a second press -- the same row's or another row's --
  // waits for it to land instead of sending again (S23).
  const [pending, setPending] = React.useState(null);
  const nav = (to) => window.appNavigate && window.appNavigate(to);
  const once = async (to, run) => {
    if (pending) return;
    setPending(to);
    try { await run(); } finally { setPending(null); }
  };
  const act = async (verb) => {
    if (!verb) return;
    // Each door's own role, checked again here: a stale row or the Next button cannot press past the gate.
    if (verb.to === "verb:request-line") {
      if (!(window.canDo && window.canDo("approve"))) return;
      await once(verb.to, async () => {
        const r = await window.__setup.request("line");
        flash(r.ok
          ? { msg: r.already ? <>Already asked — a person at Chanlytics has it.</> : <>We got it — a person at Chanlytics will set up your line with you.</> }
          : window.refusalToast(r, "Request not sent"));
      });
      return;
    }
    // A configuration only Chanlytics can repair: the row's ask (S8), gated as the line's is.
    if (verb.to === "verb:request-repair") {
      if (!(window.canDo && window.canDo("approve"))) return;
      await once(verb.to, async () => {
        const r = await window.__setup.request("repair");
        flash(r.ok
          ? { msg: r.already ? <>Already asked — a person at Chanlytics has it.</> : <>We got it — a person at Chanlytics will repair your settings and reach you by email.</> }
          : window.refusalToast(r, "Request not sent"));
      });
      return;
    }
    if (verb.to === "verb:choose-line") { setChooser((v) => !v); return; }
    if (verb.to === "verb:forwarding") { setForwarding((v) => !v); return; }
    if (verb.to === "verb:billing-checkout" || verb.to === "verb:billing-portal") {
      if (!(window.canDo && window.canDo("billing"))) return;
      if (!window.__billing) return;
      await once(verb.to, async () => {
        const r = verb.to === "verb:billing-checkout" ? await window.__billing.checkout() : await window.__billing.portal();
        if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
      });
      return;
    }
    if (verb.to.startsWith("verb:forwarding-test:")) {
      if (!(window.canDo && window.canDo("team"))) return;
      await once(verb.to, async () => {
        const r = await window.__setup.forwarding.test(verb.to.slice("verb:forwarding-test:".length));
        flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <>The window is open for 30 minutes — call the number you keep from another phone.</> : <>{r.message}</> });
        setForwarding(true);
      });
      return;
    }
    if (verb.to.startsWith("verb:retry-line:")) {
      if (!(window.canDo && window.canDo("team"))) return;
      await once(verb.to, async () => {
        flash({ tone: "info", msg: <>Retrying — usually a minute or two.</> });
        const r = await window.__setup.lines.retry(verb.to.slice("verb:retry-line:".length));
        flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? (r.queued ? <>Setting up again — this page updates by itself.</> : <>Your line answers now.</>) : <>{r.message || "It stopped again — a person at Chanlytics has it."}</> });
      });
      return;
    }
    if (verb.to.startsWith("verb:activate:")) {
      if (!(window.canDo && window.canDo("team"))) return;
      await once(verb.to, async () => {
        const r = await window.__setup.activate(verb.to.slice("verb:activate:".length));
        flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <>Activated — it is yours to use, and Setup says so.</> : <>{r.message}</> });
      });
      return;
    }
    if (verb.to.startsWith("verb:deactivate:")) {
      if (!(window.canDo && window.canDo("team"))) return;
      await once(verb.to, async () => {
        const r = await window.__setup.deactivate(verb.to.slice("verb:deactivate:".length));
        // An activation is the owner's record that a capability is theirs; it
        // gates nothing at runtime. Withdrawing it stops nothing, and says so.
        flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <>Activation withdrawn — nothing stops answering; Setup no longer marks it as yours. Activate it again whenever you like.</> : <>{r.message}</> });
      });
      return;
    }
    if (verb.to.startsWith("tel:")) { window.location.href = verb.to; return; }
    // A route behind a gate (Google's row, Find) goes nowhere for a role that may not press it, however it is reached.
    if (setupGated(verb)) return;
    nav(verb.to);
  };
  // Put off, or taken back: this member's, saved to their view (legacy-bridge/setup.ts later), and said when it was not.
  const putOff = (r) =>
    once(`later:${r.id}`, async () => {
      const res = await window.__setup.later(r.id, !r.later);
      if (!res.ok) flash(window.refusalToast(res, "Not saved"));
      else if (!r.later && later.said) flash({ msg: <>{later.said}</>, undo: () => takeBack(r.id) });
    });
  const takeBack = (id) =>
    window.__setup.later(id, false).then((res) => { if (!res.ok) flash(window.refusalToast(res, "Not saved")); });
  const laterLabel = (r) => (r.later ? later.undo : later.put);
  return (
    <div className="setup-rows" data-testid={testid}>
      <div className="tq-list">
      {rows.map((r, i) => {
        const cta = r.verb ? { label: r.verb.label, kind: primary === r.id ? "primary" : "ghost", onClick: () => act(r.verb), gate: setupGate(r.verb), busy: pending === r.verb.to } : null;
        const also = r.undo
          ? { label: r.undo.label, onClick: () => act(r.undo), gate: setupGate(r.undo), busy: pending === r.undo.to, testid: `setup-undo-${r.id}` }
          : !r.required && r.state !== "ready" && laterLabel(r)
            ? { label: laterLabel(r), onClick: () => putOff(r), busy: pending === `later:${r.id}`, testid: `setup-later-${r.id}` }
            : null;
        return (
        <div key={r.id} className={r.later ? "setup-later" : undefined}>
          {look === "card" ? (
            // The next row wears amber, as the one to do now; the rest their own state.
            <SetupCardRow tone={primary === r.id ? "warn" : setupTone(r.state)} stateWords={r.stateWords} name={r.title} sentence={r.sentence} left={i === 0 ? left : null} cta={cta} also={also} testid={`setup-row-${r.id}`} />
          ) : (
          <window.AttnRow
            glyph={r.icon}
            name={r.title}
            sentence={r.sentence}
            quoted={false}
            status={[r.stateWords]}
            note={r.details.join(" · ")}
            tone={setupTone(r.state)}
            cta={cta}
            also={also}
            // The row is a click target for a navigation, never for a dial:
            // a mis-click on the receptionist row must not ring the shop. Nor is
            // it a way around its own gated button.
            onOpen={r.verb && !r.verb.to.startsWith("tel:") && !setupGated(r.verb) ? () => act(r.verb) : undefined}
            testid={`setup-row-${r.id}`}
            ctaTestid="setup-verb"
          />
          )}
          {r.id === "line" && chooser && <LineChooser S={S} flash={flash} onDone={() => setChooser(false)} onKeep={() => setForwarding(true)} />}
          {r.id === "keep" && forwarding && <ForwardingCard S={S} flash={flash} onDone={() => setForwarding(false)} />}
        </div>
        );
      })}
      </div>
      {toastNode}
    </div>
  );
};

/** The numbers to try once the receptionist answers somewhere: call it, then open Live; text it, then open the Inbox. */
const SetupTry = ({ tryIt }) => {
  const nav = (to) => window.appNavigate && window.appNavigate(to);
  return (
    <section className="fl-card set-card setup-try" data-testid="setup-try">
      <div className="fl-card-head"><h2 className="fl-card-title">Try your receptionist</h2><span className="fl-card-sub">from your own phone</span></div>
      <div className="setup-try-rows">
        {tryIt.voice && (
          <div className="setup-try-row">
            <Icon name="phone" size={13} />
            <span className="setup-try-num">{tryIt.voiceLabel}</span>
            <a className="btn btn-sm" href={`tel:${tryIt.voice}`}>Call it</a>
            <button className="btn btn-ghost btn-sm" onClick={() => nav("live")}>Then open Live <Icon name="arrow-right" size={10} /></button>
          </div>
        )}
        {tryIt.whatsapp && (
          <div className="setup-try-row">
            <Icon name="chat" size={13} />
            <span className="setup-try-num">{tryIt.whatsappLabel}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => nav("inbox")}>Text it, then open the Inbox <Icon name="arrow-right" size={10} /></button>
          </div>
        )}
      </div>
    </section>
  );
};

window.SetupRows = SetupRows;
window.SetupCardRow = SetupCardRow;
window.SetupTry = SetupTry;
