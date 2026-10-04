/**
 * Keep the number you have (moved from legacy/pages/setup.jsx, decision 0015): the carrier's code to dial on the phone
 * that has it, then a test window -- a call to the kept number that reaches the receptionist inside it marks the row
 * verified, and the page repaints.
 */
import { useState } from "react";
import { isCarrier, isForwardingMode, type Carrier, type LineDto } from "@chanlytics/contracts";
import { canDo, gate, type LegacyFlash } from "../../legacy-verbs";
import { FORWARDING_WORDS, setupVerbs, type SetupSurface } from "../surface";

interface ForwardingProps {
  S: SetupSurface;
  flash: (f: LegacyFlash) => void;
  onDone: () => void;
}

type Forwarding = NonNullable<LineDto["forwarding"]>;
type Codes = ReturnType<typeof FORWARDING_WORDS.codes>;

/** The code to dial, the notes under it, and whether forwarding is proven, on its way to being, or yet to be tested. */
function codeCard(
  fw: LineDto,
  f: Forwarding & { carrier: Carrier },
  codes: Codes,
  o: { testing: boolean; busy: boolean; test: () => void },
) {
  const W = FORWARDING_WORDS;
  return (
    <div className="setup-fw-code" data-testid="setup-fw-code">
      <span className="setup-find-label">{W.dialLabel(f.carrier, W.display(fw.e164) ?? "")}</span>
      {/* For an office phone system the number to forward to is the receptionist line itself: drawn as words, never
          as a call to it, which a test window would take for proof that forwarding works. */}
      {f.carrier === "office" ? (
        <span className="setup-fw-dial tabular" data-testid="setup-fw-dial">
          {W.display(codes.on.code)}
        </span>
      ) : (
        <a className="setup-fw-dial tabular" href={codes.on.tel} data-testid="setup-fw-dial">
          {codes.on.code}
        </a>
      )}
      <ul className="setup-fw-notes">
        {codes.notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
      <div className="setup-fw-actions">
        {fw.forwarding_state === "verified" ? (
          <span className="setup-fw-ok">
            Verified {f.verified_at ? W.ago(f.verified_at) : ""}
            {codes.off.code ? (
              <>
                {" "}
                · to switch it off, dial <b className="tabular">{codes.off.code}</b>
              </>
            ) : null}
          </span>
        ) : o.testing ? (
          <span className="setup-fw-ok">
            The window is open — call {W.display(fw.e164)} from another phone. This page updates by itself.
          </span>
        ) : (
          <button
            className="btn btn-sm"
            onClick={o.test}
            disabled={o.busy}
            data-testid="setup-fw-test"
            {...gate("team", "test forwarding")}
          >
            Test it
          </button>
        )}
        {fw.forwarding_state !== "verified" && codes.off.code && (
          <span className="setup-fw-off">
            Off again: <b className="tabular">{codes.off.code}</b>
          </span>
        )}
      </div>
    </div>
  );
}

export const ForwardingCard = ({ S, flash, onDone }: ForwardingProps) => {
  const W = FORWARDING_WORDS;
  const fw = ((S.dto.lines && S.dto.lines.rows) || []).find((l) => l.kind === "forwarded") || null;
  const f = fw && fw.forwarding ? fw.forwarding : null;
  const dest = S.dto.channels.voice.active ? S.dto.channels.voice.number : null;
  const [number, setNumber] = useState(fw && fw.e164 ? fw.e164 : "");
  const [carrier, setCarrier] = useState(f && f.carrier ? f.carrier : "verizon");
  const [mode, setMode] = useState(f && f.mode ? f.mode : "unanswered");
  const [testFrom, setTestFrom] = useState(f && f.test_from ? f.test_from : "");
  const [busy, setBusy] = useState(false);
  const owner = canDo("team");
  const save = async () => {
    if (!owner) return;
    setBusy(true);
    const r = await setupVerbs.forwarding.set({ number, carrier, mode, test_from: testFrom });
    setBusy(false);
    flash({
      tone: r.ok ? "ok" : "danger",
      msg: r.ok ? (
        carrier === "office" ? (
          <>Saved. Forward {number} in the settings of your phone system, then test it.</>
        ) : (
          <>Saved. Dial the code on the phone with {number}, then test it.</>
        )
      ) : (
        <>{r.message}</>
      ),
    });
  };
  const test = async () => {
    if (!owner || !fw) return;
    setBusy(true);
    const r = await setupVerbs.forwarding.test(fw.id);
    setBusy(false);
    flash({
      tone: r.ok ? "ok" : "danger",
      msg: r.ok ? (
        <>The window is open for 30 minutes — call {W.display(fw.e164)} from another phone.</>
      ) : (
        <>{r.message}</>
      ),
    });
  };
  // The line holds the carrier and the mode the door took, each one of contracts' sets.
  const to = f ? f.destination_e164 || dest : null;
  const codes = f && to && isCarrier(f.carrier) && isForwardingMode(f.mode) ? W.codes(f.carrier, f.mode, to) : null;
  const testing = !!(f && W.testOpen(f));
  return (
    <section className="setup-chooser setup-fw" data-testid="setup-forwarding">
      {!dest && (
        <p className="setup-fw-note">Your receptionist needs a line first — get a new number from the row above.</p>
      )}
      <div className="setup-fw-form">
        <label className="setup-fw-field">
          <span className="setup-find-label">The number you keep</span>
          <input
            className="setup-area setup-fw-input"
            inputMode="tel"
            placeholder="(305) 555-0100"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            data-testid="setup-fw-number"
          />
        </label>
        <div className="setup-fw-field">
          <span className="setup-find-label">Carrier</span>
          <div className="setup-fw-seg">
            {W.carriers.map((c) => (
              <button
                key={c}
                className={"setup-seg " + (carrier === c ? "active" : "")}
                onClick={() => setCarrier(c)}
                data-testid={`setup-fw-carrier-${c}`}
              >
                {W.carrierWords[c]}
              </button>
            ))}
          </div>
        </div>
        <div className="setup-fw-field">
          <span className="setup-find-label">Which calls</span>
          <div className="setup-fw-seg">
            {W.modes.map((m) => (
              <button
                key={m}
                className={"setup-seg " + (mode === m ? "active" : "")}
                onClick={() => setMode(m)}
                data-testid={`setup-fw-mode-${m}`}
              >
                {W.modeWords[m]}
              </button>
            ))}
          </div>
        </div>
        <label className="setup-fw-field">
          <span className="setup-find-label">The phone you&rsquo;ll test from (optional)</span>
          <input
            className="setup-area setup-fw-input"
            inputMode="tel"
            placeholder="your mobile"
            value={testFrom}
            onChange={(e) => setTestFrom(e.target.value)}
            data-testid="setup-fw-from"
          />
        </label>
        <div className="setup-fw-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={save}
            disabled={busy || !dest}
            data-testid="setup-fw-save"
            {...gate("team", "set up forwarding")}
          >
            {fw ? "Save changes" : "Save and show the code"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onDone}>
            Close
          </button>
        </div>
      </div>
      {codes &&
        fw &&
        f &&
        isCarrier(f.carrier) &&
        codeCard(fw, { ...f, carrier: f.carrier }, codes, { testing, busy, test: () => void test() })}
    </section>
  );
};
