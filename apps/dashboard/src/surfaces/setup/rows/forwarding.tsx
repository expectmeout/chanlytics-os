/**
 * Keep the number you have (moved from legacy/pages/setup.jsx, decision 0015): the carrier's code to dial on the phone
 * that has it, then a test window -- a call to the kept number that reaches the receptionist inside it marks the row
 * verified, and the page repaints.
 *
 * The form is the kit's all the way through (Ruben, 7 Oct 2026: it stood on a black panel, in boxes and chips of its
 * own): the two numbers are Fields, the carrier a Select (five names, two of them long, wrapped over two lines as
 * chips), which calls a Segmented choice of two, and its acts Buttons. Two columns where there is room, one on a phone
 * (settings.css, .setup-fw-form), on the look's inset surface (.setup-chooser).
 */
import { useState } from "react";
import { isCarrier, isForwardingMode, type Carrier, type LineDto } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { Segmented } from "../../kit/segmented/segmented";
import { Select } from "../../kit/select/select";
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
          <Button
            size="sm"
            onClick={o.test}
            disabled={o.busy}
            data-testid="setup-fw-test"
            {...gate("team", "test forwarding")}
          >
            Test it
          </Button>
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
        <Field
          label="The number you keep"
          type="tel"
          inputMode="tel"
          placeholder="(305) 555-0100"
          value={number}
          onValueChange={setNumber}
          data-testid="setup-fw-number"
        />
        <Field
          label="Carrier"
          control={
            <Select
              value={carrier}
              onValueChange={setCarrier}
              options={W.carriers.map((c) => ({ value: c, label: W.carrierWords[c] ?? c }))}
              chevron={<Icon name="chevron-down" size={12} />}
              data-testid="setup-fw-carrier"
            />
          }
        />
        <Field
          className="setup-fw-wide"
          label="Which calls"
          control={
            <Segmented
              label="Which calls"
              value={mode}
              onValueChange={setMode}
              options={W.modes.map((m) => ({ value: m, label: W.modeWords[m] ?? m, testid: `setup-fw-mode-${m}` }))}
            />
          }
        />
        <Field
          label="The phone you'll test from"
          hint="Optional."
          type="tel"
          inputMode="tel"
          placeholder="Your mobile"
          value={testFrom}
          onValueChange={setTestFrom}
          data-testid="setup-fw-from"
        />
        <div className="setup-fw-actions">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void save()}
            disabled={busy || !dest}
            data-testid="setup-fw-save"
            {...gate("team", "set up forwarding")}
          >
            {fw ? "Save changes" : "Save and show the code"}
          </Button>
          <Button variant="quiet" size="sm" onClick={onDone}>
            Close
          </Button>
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
