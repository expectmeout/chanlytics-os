/* global React, Icon */
// Setup — one page a new owner lands on until the receptionist is answering.
// Every row is a fact the workspace holds (contracts/setup.ts, published by
// the bridge as window.__SETUP); the rows use the attention row grammar
// People and Today share. A verb is a route, a dial, or the one action the
// page performs: asking a person at Chanlytics for a line.
const useSetupTick = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:setup", bump);
    return () => window.removeEventListener("surface:setup", bump);
  }, []);
};

const SETUP_TONE = { waiting_you: "warn", waiting_them: "queued", ready: "", not_started: "" };

const PaneSetup = () => {
  useSetupTick();
  const [toastNode, flash] = window.usePPToast();
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
            </div>
          ))}
        </div>
      </section>
      {toastNode}
    </div>
  );
};

window.PaneSetup = PaneSetup;
